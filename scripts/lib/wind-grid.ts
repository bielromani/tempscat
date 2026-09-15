/**
 * De punts de predicció a una graella regular de vent.
 *
 * ## El que fa, i el que no
 *
 * Rep els punts amb la seva velocitat i direcció i torna dues graelles, u i v,
 * cobrint el rectangle del mapa. No dibuixa res: el dibuix el fa el navegador
 * movent-hi partícules.
 *
 * ## Es descompon **abans** d'interpolar, i aquesta és tota la gràcia
 *
 * La direcció no es pot promitjar. Entre 350° i 10° la mitjana dona 180°, o
 * sigui vent del sud exactament on bufa del nord, i el resultat no s'assembla
 * gens a un error: és un camp de vent que va al revés en una franja. Es passa
 * cada punt a u i v —`windComponents()`, comprovat amb la marinada— es
 * interpolen els dos per separat, i es torna a compondre al final. Així dos
 * vents oposats es cancel·len, que és el que fa l'aire de debò.
 *
 * ## La ponderació és la mateixa que la del camp de pluja
 *
 * `(1 − d/r)² / d²`, la de Shepard modificada. El `1/d²` sol té un problema que
 * al mapa es veu de seguida: **un punt aïllat pinta un disc uniforme del seu
 * valor amb la vora tallada**, perquè si és l'únic que contribueix la mitjana
 * ponderada és ell mateix valgui el que valgui la distància. Va passar amb la
 * pluja al mar, a llunes de 30 km. El factor `(1 − d/r)²` apaga el pes en
 * arribar al radi i el disc es fon en comptes d'acabar-se.
 */
import { windComponents } from '../../src/lib/wind.ts';

export interface WindPoint {
  lat: number;
  lon: number;
  /** km/h, com els dona Open-Meteo. */
  speed: Array<number | null>;
  /** Graus, **d'on ve** el vent. */
  direction: Array<number | null>;
}

export interface GridBox { west: number; east: number; south: number; north: number }

/**
 * Fins on arriba un punt, en quilòmetres.
 *
 * Quaranta, i no els 45 de la pluja: un camp de vent és molt més suau que un
 * de precipitació —no hi ha res equivalent a la vora d'un ruixat— i un radi
 * llarg no hi perd detall, hi guanya continuïtat. Amb menys, la malla de fora
 * (un punt cada 25 km) deixaria caselles sense cap veí.
 */
const RADIUS_KM = 40;

/** Per no dividir per zero quan una casella cau damunt d'un punt. */
const MIN_KM = 0.5;

const EARTH_KM = 6371;

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const mid = ((aLat + bLat) / 2) * (Math.PI / 180);
  const dx = (bLon - aLon) * Math.cos(mid);
  const dy = bLat - aLat;
  return Math.hypot(dx, dy) * (Math.PI / 180) * EARTH_KM;
}

export interface WindGrid {
  width: number;
  height: number;
  /** Cap a l'est, en m/s, per files de nord a sud. */
  u: Float32Array;
  /** Cap al nord, en m/s. */
  v: Float32Array;
  /** La velocitat més alta de la graella, en m/s. */
  maxMs: number;
  /** Quantes caselles no han trobat cap punt a l'abast. */
  empty: number;
}

/**
 * La graella d'una hora.
 *
 * Les files van **de nord a sud**, com els píxels d'una imatge, perquè el que
 * en surt acaba sent un PNG i una textura. Comptar-les al revés aquí i
 * arreglar-ho al navegador és com acaben els mapes cap per avall.
 */
export function windGrid(
  points: WindPoint[],
  hour: number,
  box: GridBox,
  step: number,
): WindGrid {
  const width = Math.round((box.east - box.west) / step) + 1;
  const height = Math.round((box.north - box.south) / step) + 1;

  /*
   * Un índex per caselles de mig grau.
   *
   * Sense ell són 3.519 caselles per 3.300 punts i dotze hores: cent trenta
   * milions de distàncies per a un camp que en necessita unes poques. El radi
   * són 40 km i mig grau en fa uns 55, així que mirant les nou caselles del
   * voltant no se'n perd cap que hi pugui entrar.
   */
  const CELL = 0.5;
  const buckets = new Map<string, Array<{ lat: number; lon: number; u: number; v: number }>>();

  for (const p of points) {
    const speed = p.speed[hour];
    const dir = p.direction[hour];
    if (speed == null || dir == null || !Number.isFinite(speed) || !Number.isFinite(dir)) continue;
    const { u, v } = windComponents(speed, dir);
    const k = `${Math.floor(p.lat / CELL)},${Math.floor(p.lon / CELL)}`;
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push({ lat: p.lat, lon: p.lon, u, v });
  }

  const u = new Float32Array(width * height);
  const v = new Float32Array(width * height);
  let maxMs = 0;
  let empty = 0;

  for (let row = 0; row < height; row++) {
    const lat = box.north - row * step;
    const la = Math.floor(lat / CELL);
    for (let col = 0; col < width; col++) {
      const lon = box.west + col * step;
      const lo = Math.floor(lon / CELL);

      let sumU = 0;
      let sumV = 0;
      let sumW = 0;

      for (let i = la - 1; i <= la + 1; i++) {
        for (let j = lo - 1; j <= lo + 1; j++) {
          for (const p of buckets.get(`${i},${j}`) ?? []) {
            const d = Math.max(MIN_KM, distKm(lat, lon, p.lat, p.lon));
            if (d >= RADIUS_KM) continue;
            const fade = 1 - d / RADIUS_KM;
            const w = (fade * fade) / (d * d);
            sumU += p.u * w;
            sumV += p.v * w;
            sumW += w;
          }
        }
      }

      const at = row * width + col;
      if (sumW > 0) {
        u[at] = sumU / sumW;
        v[at] = sumV / sumW;
        const speed = Math.hypot(u[at], v[at]);
        if (speed > maxMs) maxMs = speed;
      } else {
        /*
         * Cap punt a l'abast: es queda en calma i **no s'estira el més
         * proper**. Estirar-lo seria dibuixar el que no sabem, que és el que
         * es va decidir no fer amb la pluja. Amb el voltant demanat, això no
         * hauria de passar mai; si passa, el worker ho diu.
         */
        empty++;
      }
    }
  }

  return { width, height, u, v, maxMs, empty };
}
