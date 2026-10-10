/**
 * Una temperatura que les veïnes desmenteixen.
 *
 * El 6 d'octubre de 2026, a mitja tarda, Alguaire (371 m) marcava 1,3 °C amb
 * Lleida i Raimat a prop dels vint i les estacions de més de 2.400 m per sobre
 * de cinc. Era un termòmetre espatllat, i `/ranquings` el va posar a dalt de
 * tot com «el més fred d'ara»: la llista d'extrems és justament on va a parar
 * una lectura dolenta. La fitxa de la Saira, que en depèn, deia el mateix.
 *
 * ## La prova de les veïnes
 *
 * És la *buddy check* de qualsevol control de qualitat meteorològic: es
 * compara cada lectura amb la mediana de les estacions de prop. Només amb les
 * que són **a una altitud semblant**, i això és el que la fa segura: corregint
 * pel gradient estàndard, una nit d'inversió a la Cerdanya faria que el fons de
 * la vall —real i a −8 °C— semblés un error al costat dels cims. Entre
 * estacions de la mateixa cota, en canvi, una clotada de fred dona sis o vuit
 * graus de diferència, no dotze.
 *
 * Sense prou veïnes no es diu res: una estació aïllada no es pot desmentir.
 *
 * No importa res, perquè la fan servir el worker d'observació i la seva prova.
 */

export interface TempPoint {
  codi: string;
  lat: number;
  lon: number;
  altitud: number;
  t: number;
}

export interface Suspect {
  codi: string;
  t: number;
  /** La mediana de les veïnes. */
  median: number;
  /** Quantes veïnes hi ha entrat. */
  n: number;
}

/** Fins on es busquen veïnes. */
export const BUDDY_RADIUS_KM = 40;
/** Quina diferència d'altitud encara compta com a «semblant». */
export const BUDDY_MAX_DALT_M = 250;
/** Quantes veïnes calen per poder desmentir una lectura. */
export const BUDDY_MIN_N = 3;
/** A partir de quants graus de la mediana una lectura no es creu. */
export const BUDDY_MAX_DIFF_C = 12;

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Les lectures que les veïnes de la mateixa cota desmenteixen.
 *
 * La mediana i no la mitjana: si dues estacions de prop fallen alhora, la
 * mitjana s'arrossegaria cap a elles i la tercera, la bona, semblaria l'error.
 */
export function suspectTemperatures(points: TempPoint[]): Suspect[] {
  const out: Suspect[] = [];
  for (const p of points) {
    const near = points.filter((q) => q.codi !== p.codi
      && Math.abs(q.altitud - p.altitud) <= BUDDY_MAX_DALT_M
      && distKm(p.lat, p.lon, q.lat, q.lon) <= BUDDY_RADIUS_KM);
    if (near.length < BUDDY_MIN_N) continue;
    const m = median(near.map((q) => q.t));
    if (Math.abs(p.t - m) > BUDDY_MAX_DIFF_C) {
      out.push({ codi: p.codi, t: p.t, median: Math.round(m * 10) / 10, n: near.length });
    }
  }
  return out;
}
