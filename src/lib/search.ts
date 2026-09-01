import 'server-only';
import { allComarques, entitatsOfMunicipi, municipisOfComarca, operativeStations } from './territory';
import { allBeaches } from './sea';
import { SECTIONS } from './nav';

/**
 * El cercador.
 *
 * ## Per què és del servidor i no del navegador
 *
 * La temptació és baixar un índex al client i filtrar mentre s'escriu. Serien
 * les primeres línies de JavaScript propi del projecte i uns 200 kB d'índex per
 * a una cosa que un formulari resol.
 *
 * Amb un `<form method="get">` i aquesta funció: funciona sense JavaScript,
 * funciona amb el teclat, cada cerca té la seva URL —es pot desar i compartir—
 * i el resultat és una pàgina que un cercador pot indexar. El preu és que cal
 * prémer Enter.
 *
 * ## Què s'hi busca
 *
 * Tot alhora, perquè qui escriu «Cadaqués» no sap ni li importa si això és un
 * municipi, una platja o una estació. Hi entren les 4.293 poblacions, les 43
 * comarques, les 189 estacions, les platges del registre i les pàgines del
 * lloc.
 */

export type SearchKind = 'poblacio' | 'comarca' | 'estacio' | 'platja' | 'pagina';

export interface SearchHit {
  kind: SearchKind;
  title: string;
  /** On és: la comarca, el municipi, el que situï el resultat. */
  context?: string;
  href: string;
  score: number;
}

/**
 * Text comparable: sense accents, sense article i en minúscules.
 *
 * L'article va al final del topònim al Nomenclàtor —«Ametlla del Vallès, l'»— i
 * la gent el escriu al principi o no l'escriu. Es treu dels dos costats.
 */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[·'’]/g, ' ')
    .replace(/^(el|la|els|les|l|es|sa|s)\s+/, '')
    .replace(/,\s*(el|la|els|les|l)\s*$/, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Com de bé encaixa una consulta amb un nom.
 *
 * Tres graons i no un: qui escriu «bar» vol Barcelona abans que Sant Sadurní
 * d'Anoia, encara que totes dues continguin les lletres. Zero vol dir que no
 * hi encaixa.
 */
function match(query: string, name: string): number {
  const n = fold(name);
  if (n === query) return 100;
  if (n.startsWith(query)) return 70;
  // Comença una paraula de dins: «vallès» ha de trobar «Vallès Oriental».
  if (n.includes(` ${query}`)) return 50;
  if (n.includes(query)) return 25;
  return 0;
}

/** Prou llarga per no retornar mig país. */
export const MIN_QUERY = 2;

export interface SearchResults {
  query: string;
  hits: SearchHit[];
  total: number;
}

/** Quants se n'ensenyen. Amb més, la llista deixa de ser una resposta. */
const LIMIT = 40;

export async function search(raw: string): Promise<SearchResults> {
  const q = fold(raw);
  if (q.length < MIN_QUERY) return { query: raw, hits: [], total: 0 };

  const hits: SearchHit[] = [];

  // ── Comarques ─────────────────────────────────────────────────────────────
  for (const c of allComarques()) {
    const m = match(q, c.nom);
    if (m) hits.push({ kind: 'comarca', title: c.nom, href: c.path, score: m + 8 });
  }

  // ── Poblacions ────────────────────────────────────────────────────────────
  const comarcaNom = new Map(allComarques().map((c) => [c.codi, c.nom]));
  for (const c of allComarques()) {
    for (const m of municipisOfComarca(c.codi)) {
      const s = match(q, m.nom);
      if (s) {
        hits.push({
          kind: 'poblacio',
          title: m.nom,
          context: comarcaNom.get(m.comarcaCodi ?? '') ?? undefined,
          href: m.path,
          /*
           * Un municipi va davant d'un nucli amb el mateix nom, i entre
           * municipis mana la població: qui escriu «sant» busca Sant Cugat
           * abans que Sant Ferriol, de 200 habitants.
           */
          score: s + 6 + Math.min(5, Math.log10((m.poblacio ?? 1) + 1)),
        });
      }
      for (const e of entitatsOfMunicipi(m.municipiCodi ?? '')) {
        const se = match(q, e.nom);
        if (se) {
          hits.push({
            kind: 'poblacio',
            title: e.nom,
            context: `${m.nom} · ${comarcaNom.get(e.comarcaCodi ?? '') ?? ''}`.replace(/ · $/, ''),
            href: e.path,
            score: se,
          });
        }
      }
    }
  }

  // ── Estacions ─────────────────────────────────────────────────────────────
  for (const s of operativeStations()) {
    const m = match(q, s.nom);
    if (m) {
      hits.push({
        kind: 'estacio',
        title: s.nom,
        context: s.comarcaNom ?? undefined,
        href: `/estacions/${s.codi}`,
        score: m - 4,
      });
    }
  }

  // ── Platges ───────────────────────────────────────────────────────────────
  const beaches = await allBeaches();
  for (const b of beaches?.list ?? []) {
    const m = match(q, b.name);
    if (m) {
      hits.push({
        kind: 'platja',
        title: b.name,
        context: b.municipality,
        href: '/mar',
        score: m - 6,
      });
    }
  }

  // ── Pàgines del lloc ──────────────────────────────────────────────────────
  for (const g of SECTIONS) {
    for (const l of g.links) {
      const m = match(q, l.label);
      if (m) hits.push({ kind: 'pagina', title: l.label, context: g.title, href: l.href, score: m + 4 });
    }
  }

  hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ca'));
  return { query: raw, hits: hits.slice(0, LIMIT), total: hits.length };
}
