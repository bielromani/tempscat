import 'server-only';
import { allComarques, entitatsOfMunicipi, municipisOfComarca, operativeStations } from './territory';
import { allBeaches } from './sea';
import { gaugeName, reservoirName, reservoirs, riverGauges } from './water';
import { mountainView } from './mountain';
import { allCameras } from './cameras';
import { allRoutes } from './routes';
import { fold, match, matchWithContext } from './search-match';
import { deName } from './format';
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
 * municipi, una platja o una estació. Hi entren les poblacions, les comarques,
 * les estacions de la XEMA, les platges, els embassaments, els aforaments, les
 * estacions d'esquí, les càmeres, els itineraris i les pàgines del lloc.
 *
 * ## La consulta és una llista de paraules, no una subcadena
 *
 * La comparació és a `search-match.ts`, que no importa res i per tant té una
 * prova. Hi és perquè el defecte que va tenir —«cala fosca» no trobava Cala la
 * Fosca— no donava cap error: donava una pàgina sencera amb zero resultats.
 *
 * Aquí només hi ha què s'indexa i quant pesa cada cosa.
 */

export type SearchKind =
  | 'poblacio' | 'comarca' | 'estacio' | 'platja' | 'embassament'
  | 'aforament' | 'esqui' | 'camera' | 'itinerari' | 'pagina';

export interface SearchHit {
  kind: SearchKind;
  title: string;
  /** On és: la comarca, el municipi, el que situï el resultat. */
  context?: string;
  href: string;
  score: number;
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

/**
 * El pes de cada mena de resultat, sumat a l'encaix.
 *
 * No és un caprici d'ordre: és qui té més números de ser el que es buscava quan
 * dues coses es diuen igual. «Sau» és el poble i és el pantà, i qui ho escriu
 * al setembre vol el pantà. Els aforaments van al final perquè n'hi ha 79 i
 * porten el nom del poble on són.
 */
const WEIGHT: Record<SearchKind, number> = {
  pagina: 4,
  comarca: 8,
  poblacio: 0,
  esqui: 5,
  embassament: 3,
  platja: -2,
  itinerari: -3,
  estacio: -4,
  camera: -5,
  aforament: -8,
};

export async function search(raw: string): Promise<SearchResults> {
  const q = fold(raw);
  if (q.length < MIN_QUERY) return { query: raw, hits: [], total: 0 };

  const hits: SearchHit[] = [];
  const add = (
    kind: SearchKind, score: number, title: string, href: string, context?: string, bonus = 0,
  ) => {
    if (score > 0) hits.push({ kind, title, context, href, score: score + WEIGHT[kind] + bonus });
  };

  // ── Comarques ─────────────────────────────────────────────────────────────
  for (const c of allComarques()) add('comarca', match(q, c.nom), c.nom, c.path);

  // ── Poblacions ────────────────────────────────────────────────────────────
  const comarcaNom = new Map(allComarques().map((c) => [c.codi, c.nom]));
  for (const c of allComarques()) {
    for (const m of municipisOfComarca(c.codi)) {
      const comarca = comarcaNom.get(m.comarcaCodi ?? '');
      /*
       * Un municipi va davant d'un nucli amb el mateix nom, i entre municipis
       * mana la població: qui escriu «sant» busca Sant Cugat abans que Sant
       * Ferriol, de 200 habitants.
       */
      add(
        'poblacio', matchWithContext(q, m.nom, comarca), m.nom, m.path, comarca,
        6 + Math.min(5, Math.log10((m.poblacio ?? 1) + 1)),
      );
      for (const e of entitatsOfMunicipi(m.municipiCodi ?? '')) {
        const ctx = `${m.nom} · ${comarcaNom.get(e.comarcaCodi ?? '') ?? ''}`.replace(/ · $/, '');
        add('poblacio', matchWithContext(q, e.nom, m.nom), e.nom, e.path, ctx);
      }
    }
  }

  // ── Estacions de la XEMA ──────────────────────────────────────────────────
  for (const s of operativeStations()) {
    add('estacio', matchWithContext(q, s.nom, s.comarcaNom ?? undefined),
      s.nom, `/estacions/${s.codi}`, s.comarcaNom ?? undefined);
  }

  // ── Platges ───────────────────────────────────────────────────────────────
  const beaches = await allBeaches();
  for (const b of beaches?.list ?? []) {
    add('platja', matchWithContext(q, b.name, b.municipality),
      b.name, `/mar#p-${b.code}`, b.municipality);
  }

  // ── Embassaments i aforaments ─────────────────────────────────────────────
  const res = await reservoirs();
  const atReservoir = new Set<string>();
  for (const r of res?.list ?? []) {
    /*
     * Es compara amb el nom curt. Sencer és «Embassament de Sau (Vilanova de
     * Sau)» i «sau» hi encaixava com una paraula qualsevol de dins; contra
     * «Sau» és exacte, que és el que la consulta volia dir.
     */
    const nom = reservoirName(r.name);
    atReservoir.add(fold(r.name));
    add('embassament', match(q, nom), `Embassament ${deName(nom)}`, `/aigua#e-${r.code}`, r.basin);
  }
  for (const g of await riverGauges()) {
    const nom = gaugeName(g.name);
    /*
     * Sis aforaments **són** a l'embassament, i es diuen com ell. Indexats a
     * part, «susqueda» tornava dues files amb el mateix títol i una etiqueta
     * diferent, que sembla un error del web abans que una distinció. El pantà
     * ja hi és i el seu enllaç va a la mateixa pàgina.
     */
    if (atReservoir.has(fold(nom))) continue;
    add('aforament', match(q, nom), `Aforament ${deName(nom)}`, `/aigua#a-${g.code}`, g.basin);
  }

  // ── Estacions d'esquí i càmeres ───────────────────────────────────────────
  const mountain = await mountainView();
  for (const r of mountain?.resorts ?? []) {
    add('esqui', match(q, r.name), r.name, `/neu#e-${r.slug}`, 'Estació de muntanya');
  }
  const cams = await allCameras();
  for (const c of cams?.list ?? []) {
    add('camera', matchWithContext(q, c.name, c.resort), c.name, `/cameres/${c.slug}`, c.resort);
  }

  // ── Itineraris senyalitzats ───────────────────────────────────────────────
  for (const r of allRoutes().routes) {
    // El codi també és un nom: qui escriu «gr 11» busca el GR-11, no un text.
    const m = Math.max(match(q, r.name), r.ref ? match(q, r.ref) : 0);
    add('itinerari', m, r.name, `/senderisme/rutes/${r.slug}`, r.ref ?? undefined);
  }

  // ── Pàgines del lloc ──────────────────────────────────────────────────────
  for (const g of SECTIONS) {
    for (const l of g.links) add('pagina', match(q, l.label), l.label, l.href, g.title);
  }

  /*
   * Una adreça, un resultat. Una platja i una càmera es poden dir igual, i el
   * mateix itinerari surt pel nom i pel codi: qui guanya és la puntuació alta.
   */
  const best = new Map<string, SearchHit>();
  for (const h of hits) {
    const key = `${h.href}|${h.title}`;
    const prev = best.get(key);
    if (!prev || h.score > prev.score) best.set(key, h);
  }

  const list = [...best.values()]
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ca'));
  return { query: raw, hits: list.slice(0, LIMIT), total: list.length };
}
