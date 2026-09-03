import 'server-only';
import { snapshot } from './cache-store';
import type { Location } from './territory';

/**
 * Embalses, aforos de río y estado de sequía.
 *
 * Todo sale de la Agència Catalana de l'Aigua y todo cubre **solo las conques
 * internes**. El Segre y el Ebro son de la Confederación Hidrográfica del Ebro y
 * no están: un lector de Lleida no verá su embalse, y la página lo dice en vez
 * de dejar el hueco sin explicar.
 */

export interface Reservoir {
  code: string;
  name: string;
  basin: string;
  lat: number;
  lon: number;
  pct: number | null;
  volumeHm3: number | null;
  levelM: number | null;
  pct30d: number | null;
  at: string;
}

export interface RiverGauge {
  code: string;
  name: string;
  basin: string;
  subbasin: string;
  lat: number;
  lon: number;
  flow: number | null;
  levelM: number | null;
  at: string;
}

export interface DroughtEntry {
  unit: string;
  hydro: string;
  rain: string;
  since: string;
}

interface WaterData {
  reservoirs: Reservoir[];
  rivers: RiverGauge[];
  drought: {
    byMunicipality: Record<string, DroughtEntry>;
    lastChange: string | null;
    counts: Record<string, number>;
  };
}

export async function reservoirs(): Promise<{ list: Reservoir[]; source: string; at: string | null } | null> {
  const snap = await snapshot<WaterData>('water');
  return snap ? { list: snap.data.reservoirs, source: snap.source, at: snap.dataTs } : null;
}

export async function riverGauges(): Promise<RiverGauge[]> {
  return (await snapshot<WaterData>('water'))?.data.rivers ?? [];
}

export async function droughtSummary(): Promise<WaterData['drought'] | null> {
  return (await snapshot<WaterData>('water'))?.data.drought ?? null;
}

/** Distancia en km entre dos puntos. Copia local para no arrastrar el pipeline. */
function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Distancia máxima a la que un aforo o un embalse dice algo del sitio.
 *
 * Veinticinco kilómetros. Más allá, el caudal es de otra cuenca o de otro tramo
 * y presentarlo como «el riu que tens a prop» es afirmar algo que no se sostiene
 * — el mismo criterio que separa `adjacent` de `nearest` en el territorio.
 */
const MAX_KM = 25;

export interface WaterNearby {
  reservoir: (Reservoir & { distKm: number }) | null;
  river: (RiverGauge & { distKm: number }) | null;
  drought: DroughtEntry | null;
  /** El registro de sequía solo cubre las conques internes. */
  droughtCovered: boolean;
  lastChange: string | null;
  source: string;
}

/**
 * El agua cerca de una ubicación.
 *
 * Devuelve null cuando no hay nada que decir: sin aforo cerca, sin embalse cerca
 * y con el estado de sequía en normalidad, un bloque de agua sería una caja vacía
 * con un título.
 */
export async function waterNear(loc: Location): Promise<WaterNearby | null> {
  const snap = await snapshot<WaterData>('water');
  if (!snap || loc.lat == null || loc.lon == null) return null;

  const nearest = <T extends { lat: number; lon: number }>(list: T[]) => {
    let best: (T & { distKm: number }) | null = null;
    for (const x of list) {
      const d = distKm(loc.lat!, loc.lon!, x.lat, x.lon);
      if (d <= MAX_KM && (!best || d < best.distKm)) best = { ...x, distKm: Math.round(d * 10) / 10 };
    }
    return best;
  };

  const ine5 = loc.municipiIne5 ?? '';
  const drought = snap.data.drought.byMunicipality[ine5] ?? null;

  // El aforo más cercano, pero solo si tiene caudal: uno que solo publica el
  // nivel del agua en metros no le dice nada a nadie sin la escala del tramo.
  const river = nearest(snap.data.rivers.filter((r) => r.flow != null));
  const reservoir = nearest(snap.data.reservoirs);

  const abnormal = drought != null && drought.hydro !== 'NORMALITAT';
  if (!river && !reservoir && !abnormal) return null;

  return {
    reservoir,
    river,
    // El estado normal no se muestra en la ficha: 628 de 630 municipios lo tienen
    // y una línea idéntica en todas las páginas deja de leerse. Cuando cambia, se
    // ve — que es justo cuando importa.
    drought: abnormal ? drought : null,
    droughtCovered: drought != null,
    lastChange: snap.data.drought.lastChange,
    source: snap.source,
  };
}

/** Colores del semáforo oficial de sequía de la Generalitat. */
export const DROUGHT_LEVELS: Record<string, { label: string; color: string; ink: string }> = {
  NORMALITAT: { label: 'Normalitat', color: 'var(--good)', ink: 'oklch(98% 0.01 155)' },
  PREALERTA: { label: 'Prealerta', color: 'var(--cap-yellow)', ink: 'oklch(22% 0.04 95)' },
  ALERTA: { label: 'Alerta', color: 'var(--cap-orange)', ink: 'oklch(20% 0.04 55)' },
  EXCEPCIONALITAT: { label: 'Excepcionalitat', color: 'var(--cap-red)', ink: 'oklch(98% 0.01 27)' },
  'PREEMERGÈNCIA': { label: 'Preemergència', color: 'oklch(45% 0.18 20)', ink: 'oklch(98% 0.01 20)' },
  'EMERGÈNCIA': { label: 'Emergència', color: 'oklch(38% 0.16 15)', ink: 'oklch(98% 0.01 15)' },
  'EMERGÈNCIA I': { label: 'Emergència I', color: 'oklch(38% 0.16 15)', ink: 'oklch(98% 0.01 15)' },
  'EMERGÈNCIA II': { label: 'Emergència II', color: 'oklch(32% 0.15 12)', ink: 'oklch(98% 0.01 12)' },
};

export function droughtLevel(state: string) {
  return DROUGHT_LEVELS[state] ?? { label: state, color: 'var(--muted)', ink: 'var(--paper)' };
}

/**
 * Color del nivel de un embalse.
 *
 * Escala propia y continua, no un semáforo: no hay ningún umbral oficial que
 * diga a partir de qué porcentaje un embalse está «mal». Depende del embalse, de
 * la época del año y de para qué sirve, así que poner tres bandas de colores
 * sería inventarse una norma. Un degradado dice «más o menos lleno» sin fingir
 * que existe una línea roja.
 */
/**
 * El nom d'un aforament, sense l'etiqueta de tipus de l'ACA.
 *
 * Els noms del registre porten davant de quina mena d'estacio es tracta, i
 * **de vegades en porten dues**: sis son `Aforament - Qualitat - <lloc>`,
 * estacions que mesuren cabal i qualitat a la vegada. Traient nomes la primera
 * etiqueta, la fitxa de Malgrat de Mar ensenyava «Qualitat - Fogars de la Selva
 * (Can Simo)» sota el titol «L'aforament mes proper»: el numero era el cabal
 * bo, pero el nom deia una altra cosa.
 *
 * Nomes es treu una paraula coneguda seguida de ` - `, i per aixo
 * «Sant Vicenç dels Horts (riu - canal de la Dreta)» es queda sencer: el seu
 * guio va dins del parentesi i no obre cap etiqueta.
 */
const GAUGE_PREFIXES = /^(Aforament|Qualitat|Embassament|Piezòmetre|Piezometre) - /;

export function gaugeName(raw: string): string {
  let out = raw.trim();
  for (let i = 0; i < 3; i++) {
    const next = out.replace(GAUGE_PREFIXES, '');
    if (next === out) break;
    out = next;
  }
  return out;
}

/**
 * El nom curt d'un embassament: ni l'etiqueta ni el municipi.
 *
 * Al registre són «Embassament de Sau (Vilanova de Sau)», i el que la gent
 * escriu és «Sau». Amb el nom sencer, al cercador «sau» hi encaixava com una
 * paraula qualsevol de dins —igual que «vilanova»—; contra el nom curt és
 * exacte, que és el que la consulta volia dir.
 *
 * L'article es conserva: és «la Baells» i «la Llosa del Cavall», i qui hagi de
 * compondre la frase té `deName()`.
 */
export function reservoirName(raw: string): string {
  return raw
    .trim()
    .replace(/^Embassament\s+(de\s+l'|de\s+|d')/i, '')
    .replace(/\s*\([^)]*\)\s*$/, '')
    .trim();
}

export function reservoirColor(pct: number): string {
  const k = Math.max(0, Math.min(1, pct / 100));
  const l = 55 + k * 12;
  const c = 0.05 + k * 0.09;
  const hue = 40 + k * 200;   // ocre seco → azul lleno
  return `oklch(${l.toFixed(0)}% ${c.toFixed(3)} ${hue.toFixed(0)})`;
}
