/**
 * Com s'assembla el que s'escriu al cercador al nom d'un lloc.
 *
 * Està a part de `search.ts` —que llegeix el territori, el mar, l'aigua i la
 * muntanya— perquè **no importa res**, i així el poden carregar els dos costats:
 * l'aplicació amb l'àlies `@/` i `scripts/test-search.ts` amb l'extensió `.ts`.
 *
 * Que es pugui provar no és un detall d'enginyeria: el defecte que va tenir
 * aquesta funció no donava cap error. Comparava amb `includes()`, així que
 * «cala fosca» no trobava **Cala la Fosca** —hi ha un «la» pel mig— i «sant
 * cugat valles» no trobava **Sant Cugat del Vallès**. La pàgina sortia sencera,
 * amb el formulari, el comptador a zero i un text amable dient que no hi havia
 * cap resultat. Sembla que allò no existeix, i el web funcionava.
 */

/**
 * Text comparable: sense accents, sense article, sense puntuació i en
 * minúscules.
 *
 * L'article va al final del topònim al Nomenclàtor —«Ametlla del Vallès, l'»— i
 * la gent l'escriu al principi o no l'escriu. Es treu dels dos costats, però el
 * del final **només quan hi ha la coma** que el delata: sense aquesta condició
 * qualsevol nom acabat en una paraula que sembli un article en perdria un tros.
 */
export function fold(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/,\s*(el|la|els|les|l['’]?)\s*$/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/^(el|la|els|les|l|es|sa|s) /, '');
}

/**
 * El que no compta per encaixar.
 *
 * «Sant Cugat del Vallès» i «Cala la Fosca» porten paraules que ningú no escriu
 * al cercador. No es treuen del nom que s'ensenya: només de la comparació.
 */
const STOPWORDS = new Set([
  'de', 'del', 'dels', 'd', 'la', 'el', 'els', 'les', 'l', 'lo', 'los',
  'i', 'en', 'na', 'n', 'a', 'al', 'als', 'es', 'sa', 'ses', 's', 'y', 'des',
]);

/** Les paraules que compten. Si no en queda cap, val més tenir-les totes. */
function words(folded: string): string[] {
  const all = folded.split(' ').filter(Boolean);
  const kept = all.filter((w) => !STOPWORDS.has(w));
  return kept.length ? kept : all;
}

/**
 * Com de bé encaixa una consulta —ja passada per `fold()`— amb un nom.
 * Zero vol dir que no hi encaixa.
 *
 * Els graons, de més a menys específic:
 *
 *  · **100** — és exactament el nom.
 *  · **70** — el nom comença així: «barce» → Barcelona.
 *  · **62** — és una paraula sencera de dins: «sau» → Vilanova de Sau.
 *  · **48/40** — hi són totes les paraules de la consulta, cada una començant
 *    una paraula del nom. Amb 48 quan no en sobra cap del nom («cala fosca» →
 *    Cala la Fosca, que és clavat) i 40 quan el nom en porta més.
 *  · **45** — comença una paraula de dins: «vallès» → Sant Cugat del Vallès.
 *  · **25** — les lletres hi són, en algun lloc.
 *
 * La paraula sencera i el començament de paraula van separats perquè si no
 * «sau» posava **els Saulons d'en Deu** —que comença igual— per damunt de
 * Vilanova de Sau, que és on va la gent. Encaixar amb una paraula entera diu
 * molt més que encaixar amb el seu principi.
 */
export function match(query: string, name: string): number {
  const n = fold(name);
  if (!n || !query) return 0;
  if (n === query) return 100;
  if (n.startsWith(query)) return 70;
  if (` ${n} `.includes(` ${query} `)) return 62;

  const qt = words(query);
  const nt = words(n);
  if (qt.length && qt.every((t) => nt.some((w) => w.startsWith(t)))) {
    return qt.length === nt.length ? 48 : 40;
  }

  if (n.includes(` ${query}`)) return 45;
  return n.includes(query) ? 25 : 0;
}

/**
 * L'encaix comptant també el lloc on és.
 *
 * «fosca palamos» i «aforament angles» són consultes raonables, i el nom sol no
 * les respon. Val la meitat: que el context ajudi no vol dir que compti igual
 * que el nom.
 */
export function matchWithContext(query: string, name: string, context?: string): number {
  const m = match(query, name);
  if (m || !context) return m;
  return Math.round(match(query, `${name} ${context}`) / 2);
}
