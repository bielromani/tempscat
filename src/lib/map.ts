import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { allComarques, municipisOfComarca } from './territory';
import { currentFor } from './weather';

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
}

interface MapGeometry {
  width: number;
  height: number;
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
