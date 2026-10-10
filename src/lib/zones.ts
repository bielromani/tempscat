/**
 * Les zones amb què les pàgines de secció agrupen el que llisten.
 *
 * Abans cada pàgina en duia la seva taula, i Itineraris i Estacions, que
 * volien la mateixa divisió, l'haurien copiada. Va per noms de comarca tal com
 * els porta el catàleg —«Val d'Aran», «Pla de l'Estany»—, sense article.
 */

/**
 * Els vuit àmbits funcionals del Pla territorial general, amb les 43 comarques.
 * Són els noms que fa servir la Generalitat i que la gent ja coneix; una
 * divisió pròpia s'hauria d'explicar.
 */
export const AMBITS: Array<[string, string[]]> = [
  ['Alt Pirineu i Aran', ["Val d'Aran", 'Alta Ribagorça', 'Pallars Sobirà', 'Pallars Jussà', 'Alt Urgell', 'Cerdanya']],
  ['Comarques gironines', ['Alt Empordà', 'Baix Empordà', 'Garrotxa', 'Gironès', "Pla de l'Estany", 'Ripollès', 'Selva']],
  ['Comarques centrals', ['Bages', 'Berguedà', 'Lluçanès', 'Moianès', 'Osona', 'Solsonès']],
  ['Àmbit metropolità', ['Barcelonès', 'Baix Llobregat', 'Maresme', 'Vallès Occidental', 'Vallès Oriental']],
  ['Penedès', ['Alt Penedès', 'Baix Penedès', 'Garraf', 'Anoia']],
  ['Camp de Tarragona', ['Alt Camp', 'Baix Camp', 'Conca de Barberà', 'Priorat', 'Tarragonès']],
  ['Terres de l’Ebre', ['Baix Ebre', 'Montsià', "Ribera d'Ebre", 'Terra Alta']],
  ['Ponent', ['Garrigues', 'Noguera', "Pla d'Urgell", 'Segarra', 'Segrià', 'Urgell']],
];

/**
 * La muntanya, per serralades: el que llegeix qui hi va. El Pirineu de Lleida
 * i el de Girona no tenen el mateix temps el mateix dia, i un àmbit del Pla
 * territorial barrejaria la Cerdanya amb el Pallars.
 */
export const MOUNTAIN_ZONES: Array<[string, string[]]> = [
  ['Pirineu de Lleida', ["Val d'Aran", 'Alta Ribagorça', 'Pallars Sobirà', 'Pallars Jussà', 'Alt Urgell']],
  ['Cerdanya i Prepirineu', ['Cerdanya', 'Solsonès', 'Berguedà']],
  ['Pirineu de Girona', ['Ripollès', 'Garrotxa', 'Alt Empordà']],
];
export const MOUNTAIN_OTHER = 'Altres serres';

/** La zona d'una comarca dins d'una d'aquestes taules, o `other`. */
export function zoneOf(zones: Array<[string, string[]]>, comarcaNom: string | null | undefined, other = 'Altres'): string {
  return zones.find(([, cs]) => cs.includes(comarcaNom ?? ''))?.[0] ?? other;
}

/**
 * Reparteix una llista per zones, en l'ordre de la taula i amb la de «fora»
 * al final. Les zones buides no hi surten.
 */
export function groupByZone<T>(
  zones: Array<[string, string[]]>,
  list: T[],
  comarcaOf: (x: T) => string | null | undefined,
  other = 'Altres',
): Array<[string, T[]]> {
  return [...zones.map(([z]) => z), other]
    .map((z) => [z, list.filter((x) => zoneOf(zones, comarcaOf(x), other) === z)] as [string, T[]])
    .filter(([, xs]) => xs.length > 0);
}

/** «Terres de l’Ebre» → `terres-de-l-ebre`, per a les àncores. */
export function anchorSlug(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
