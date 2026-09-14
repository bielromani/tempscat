import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allComarques, municipisOfComarca } from './territory';
import { currentFor } from './weather';
import { oklchToHex, temperatureColor } from './scales';
import type { MapProjection } from './mercator';

/**
 * El mapa de comarques: geometria i temperatura.
 *
 * La geometria ve precalculada de `scripts/10-map-geometry.ts` — projectada,
 * simplificada i arrodonida— i aquí només se li posa color. El perquè és allà:
 * en cru són 154 kB de `path` per a una pàgina que en pesa 21.
 *
 * ## D'on surt la temperatura d'una comarca
 *
 * De la **mediana dels seus municipis**, cadascun amb la seva observació
 * corregida per desnivell respecte de l'estació que li toca.
 *
 * Podria semblar més directe fer la mitjana de les estacions de la comarca, i
 * seria pitjor: al Ripollès hi ha estacions a 1.900 m i a 700, i la seva
 * mitjana no descriu cap lloc on visqui ningú. Els municipis ja porten la
 * correcció d'altitud feta, així que la seva mediana sí que respon a «quina
 * temperatura fa a la comarca».
 *
 * Mediana i no mitjana perquè un sol poble de muntanya no ha de tenyir de blau
 * una comarca sencera.
 *
 * I no s'inventa res: una comarca sense prou municipis observats **no es
 * pinta**, i el mapa diu quantes en són.
 */

export interface MapFeature {
  code: string;
  name: string;
  /** Camí SVG ja projectat, en unitats del `viewBox`. */
  d: string;
  /** Punt interior on va l'etiqueta. */
  label: [number, number];
  /** Amplada lliure dins de la comarca en aquell punt, en unitats del viewBox. */
  room: number;
  /** Si el nom hi cap sense trepitjar cap altre rètol. Ho decideix el build. */
  showName: boolean;
  /**
   * On va el nom, que no sempre és sota la xifra.
   *
   * El build prova unes quantes posicions al voltant abans de rendir-se, i per
   * a les cinc que no hi caben de cap manera —la franja costanera de l'àrea
   * metropolitana, amb zero unitats lliures— el posa fora amb una línia. Es
   * publica el punt trobat en comptes de recalcular-lo aquí: si es tornava a
   * calcular, el rectangle que el build va reservar i el text que es dibuixa
   * acabarien a llocs diferents.
   */
  nameAt: [number, number] | null;
  /** El nom ja partit en línies. Una de sola quan hi cap sencer. */
  nameLines: string[] | null;
  /** Si el rètol és fora del territori i cal lligar-l'hi amb una línia. */
  leader: boolean;
}

interface MapGeometry {
  width: number;
  height: number;
  /** L'escala i el desplaçament amb què es van projectar els polígons. */
  projection: MapProjection;
  features: MapFeature[];
}

let geometry: MapGeometry | null = null;

function loadGeometry(): MapGeometry {
  geometry ??= JSON.parse(readFileSync(
    join(process.cwd(), 'data', 'build', 'geo', 'comarques-map.json'),
    'utf8',
  )) as MapGeometry;
  return geometry;
}

/**
 * El contorn de Catalunya i la seva projecció, sense cap dada a sobre.
 *
 * És el que necessita qualsevol mapa que no pinti comarques: la costa amb les
 * platges, les sis estacions d'esquí. Els polígons serveixen de fons i la
 * projecció és el que permet col·locar-hi un punt en graus, cosa que abans del
 * 6 de setembre de 2026 era impossible perquè el build es guardava l'escala i
 * no la publicava.
 */
export function mapOutline(): {
  width: number; height: number; projection: MapProjection; features: MapFeature[];
} {
  const g = loadGeometry();
  return {
    width: g.width, height: g.height, projection: g.projection, features: g.features,
  };
}

export interface MapComarca extends MapFeature {
  path: string;
  /** Mediana dels municipis observats. `null` si no n'hi ha prou. */
  temperature: number | null;
  /** Quants municipis hi han aportat dada. */
  observed: number;
  total: number;
}

export interface TemperatureMap {
  width: number;
  height: number;
  comarques: MapComarca[];
  /** Comarques amb prou dada per pintar-les. */
  withData: number;
  min: number | null;
  max: number | null;
}

/** Mínim de municipis observats per pintar una comarca. */
const MIN_OBSERVED = 2;

function median(xs: number[]): number {
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round(((s[m - 1] + s[m]) / 2) * 10) / 10;
}

export async function temperatureMap(): Promise<TemperatureMap> {
  const geo = loadGeometry();
  const comarques = new Map(allComarques().map((c) => [c.codi, c]));

  /*
   * Els 947 municipis alhora. No són 947 lectures: tots surten de la mateixa
   * instantània d'observació, així que la primera la porta i la resta se la
   * troben en memòria.
   */
  const observed = await Promise.all(
    allComarques()
      .flatMap((c) => municipisOfComarca(c.codi))
      .map(async (m) => ({ m, cur: await currentFor(m) })),
  );

  const byComarca = new Map<string, { values: number[]; total: number }>();
  for (const { m, cur } of observed) {
    const codi = m.comarcaCodi;
    if (!codi) continue;
    const bucket = byComarca.get(codi) ?? { values: [], total: 0 };
    bucket.total++;
    if (cur?.temperatureAdjusted != null) bucket.values.push(cur.temperatureAdjusted);
    byComarca.set(codi, bucket);
  }

  const out: MapComarca[] = geo.features.map((f) => {
    const bucket = byComarca.get(f.code) ?? { values: [], total: 0 };
    const enough = bucket.values.length >= MIN_OBSERVED;
    return {
      ...f,
      // El nom del fitxer de l'ICGC no porta article; el bo és el del territori.
      name: comarques.get(f.code)?.nom ?? f.name,
      path: comarques.get(f.code)?.path ?? `/${f.code}`,
      temperature: enough ? median(bucket.values) : null,
      observed: bucket.values.length,
      total: bucket.total,
    };
  });

  const temps = out.map((c) => c.temperature).filter((t): t is number => t != null);

  return {
    width: geo.width,
    height: geo.height,
    comarques: out,
    withData: temps.length,
    min: temps.length ? Math.min(...temps) : null,
    max: temps.length ? Math.max(...temps) : null,
  };
}

/**
 * La temperatura de cada municipi, ja tenyida, per al mapa que es mou.
 *
 * ## Per què el color el calcula el servidor
 *
 * Perquè hi ha **una sola escala**, i és `temperatureColor()`. Té un ram de
 * croma per l'arrel quadrada i està ancorada als 15 °C: escrita altra vegada
 * com una interpolació de MapLibre seria una segona escala, i el dia que una
 * de les dues es toqués, el mapa de comarques i el de municipis pintarien el
 * mateix grau de dos colors diferents sense que res fallés.
 *
 * Així el navegador no en sap res: rep `codi → color` i el posa. Són 947
 * entrades, uns 3 kB comprimits.
 *
 * ## I per què no en fa la mediana
 *
 * Perquè aquí el municipi **és** la unitat. La mediana existeix a
 * `temperatureMap()` perquè allà s'ha de resumir una comarca sencera en una
 * xifra, i al Ripollès hi ha mil dos-cents metres de desnivell entre pobles.
 * Un municipi ja porta la seva correcció d'altitud feta i no s'ha de resumir.
 */
export interface MunicipalTemperatures {
  /** `codi INE → color`. Només els que tenen observació. */
  colors: Record<string, string>;
  /** `codi INE → graus`, per al text que surt en passar-hi per sobre. */
  degrees: Record<string, number>;
  observed: number;
  total: number;
  min: number | null;
  max: number | null;
}

export async function municipalTemperatures(): Promise<MunicipalTemperatures> {
  const municipis = allComarques().flatMap((c) => municipisOfComarca(c.codi));
  const observed = await Promise.all(
    municipis.map(async (m) => ({ m, cur: await currentFor(m) })),
  );

  const colors: Record<string, string> = {};
  const degrees: Record<string, number> = {};
  const temps: number[] = [];

  for (const { m, cur } of observed) {
    const t = cur?.temperatureAdjusted;
    // El codi del Nomenclàtor i el del fitxer de l'ICGC són el mateix: sense
    // ell, el color no es podria lligar a cap polígon.
    if (t == null || !m.municipiCodi) continue;
    const rounded = Math.round(t * 10) / 10;
    // En hexadecimal: MapLibre no sap llegir OKLCH i no ho diu.
    colors[m.municipiCodi] = oklchToHex(temperatureColor(rounded));
    degrees[m.municipiCodi] = rounded;
    temps.push(rounded);
  }

  return {
    colors,
    degrees,
    observed: temps.length,
    total: municipis.length,
    min: temps.length ? Math.min(...temps) : null,
    max: temps.length ? Math.max(...temps) : null,
  };
}
