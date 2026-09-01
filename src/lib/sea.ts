import 'server-only';
import { snapshot } from './cache-store';
import { localNowHour } from './weather';
import type { Location } from './territory';

/**
 * El mar: banderas de playa y modelo de oleaje.
 *
 * Dos fuentes con dos naturalezas, como el aire y como el agua dulce:
 *
 *  · **La bandera** la pone una persona que está mirando el agua. Es lo más
 *    fiable que hay y solo existe donde hay socorrista y cuando está de servicio.
 *  · **El oleaje y la temperatura** salen de un modelo. Están en todas partes y a
 *    tres días vista, y no saben nada de corrientes de resaca.
 *
 * ## Una bandera caduca, y esto es lo importante de todo el fichero
 *
 * Fuera del horario de servicio nadie actualiza nada, así que la última fila se
 * queda ahí indefinidamente. **Publicar una verde de anteayer como si fuera de
 * ahora es el fallo más peligroso que puede cometer este sitio**, porque alguien
 * se mete al agua por lo que dice una web.
 *
 * Por eso hay dos umbrales y no uno: por debajo de 3 h la bandera está en vigor,
 * y hasta 12 h se enseña como «l'últim parte» con su hora bien visible. Más allá
 * no se presenta como bandera de nada.
 */

export interface Beach {
  code: string;
  name: string;
  municipality: string;
  municipalityIne5: string;
  coast: string;
  lat: number;
  lon: number;
  flag: string;
  flagReason: string;
  weather: string;
  seaState: string;
  swell: string;
  transparency: string;
  temperature: string;
  jellyfish: string | null;
  at: string;
  ageHours: number;
}

export interface SeaPoint {
  id: string;
  lat: number;
  lon: number;
  near: string;
  times: string[];
  sst: Array<number | null>;
  waveHeight: Array<number | null>;
  wavePeriod: Array<number | null>;
  waveDirection: Array<number | null>;
  swellHeight: Array<number | null>;
}

interface Data { beaches: Beach[]; points: SeaPoint[]; fresh: number }

/** En vigor: el socorrista la ha puesto hace poco y sigue de servicio. */
export const FLAG_CURRENT_HOURS = 3;
/** Se enseña como último parte, con la hora delante. Más allá, no se enseña. */
export const FLAG_SHOW_HOURS = 12;

interface FlagStyle {
  label: string;
  /** El plural no se forma con una regla: verda→verdes, groga→**grogues**. */
  plural: string;
  color: string;
  ink: string;
  meaning: string;
}

export const FLAG_STYLE: Record<string, FlagStyle> = {
  verda: {
    label: 'Verda', plural: 'verdes', color: 'var(--cap-green)', ink: 'oklch(20% 0.03 150)',
    meaning: 'Bany lliure',
  },
  groga: {
    label: 'Groga', plural: 'grogues', color: 'var(--cap-yellow)', ink: 'oklch(22% 0.04 95)',
    meaning: 'Bany amb precaució',
  },
  vermella: {
    label: 'Vermella', plural: 'vermelles', color: 'var(--cap-red)', ink: 'oklch(98% 0.01 27)',
    meaning: 'Bany prohibit',
  },
  complet: {
    label: 'Aforament complet', plural: 'amb aforament complet',
    color: 'var(--muted)', ink: 'var(--paper)',
    meaning: 'La platja ha arribat al límit d’ocupació',
  },
  'sense informacio': {
    label: 'Sense informació', plural: 'sense informació',
    color: 'var(--line)', ink: 'var(--ink-2)',
    meaning: 'La platja no ha comunicat estat',
  },
};

export function flagStyle(flag: string) {
  return FLAG_STYLE[flag] ?? FLAG_STYLE['sense informacio'];
}

/**
 * Las medusas vienen en un solo campo: `especie,abundancia,talla`.
 *
 * Se separa para poder enseñarlo legible, pero **no se traduce el nombre
 * científico ni se sustituye por uno común**: «Pelagia noctiluca» es el que
 * permite buscar si pica, y los nombres populares cambian de una cala a otra.
 */
export function parseJellyfish(raw: string | null): { species: string; amount: string; size: string } | null {
  if (!raw) return null;
  const [species, amount, size] = raw.split(',').map((x) => x.trim());
  if (!species) return null;
  return { species, amount: amount ?? '', size: size ?? '' };
}

export interface BeachesView {
  list: Beach[];
  source: string;
  /** Con parte de menos de 12 h. */
  recent: number;
}

export async function allBeaches(): Promise<BeachesView | null> {
  const snap = await snapshot<Data>('sea');
  if (!snap) return null;
  return {
    list: snap.data.beaches,
    source: snap.source,
    recent: snap.data.beaches.filter((b) => b.ageHours <= FLAG_SHOW_HOURS).length,
  };
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

export interface SeaNow {
  sst: number | null;
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  swellHeight: number | null;
  /** Nombre del tramo, por la playa de referencia del punto. */
  near: string;
  distKm: number;
}

export interface SeaNearby {
  /** Playas del propio municipio, con su bandera. */
  beaches: Beach[];
  /** El mar modelado en el tramo de costa más cercano. */
  now: SeaNow | null;
  /** Serie de las próximas horas, para el perfil de oleaje. */
  hourly: Array<{ time: string; waveHeight: number | null; sst: number | null }>;
  source: string;
}

/**
 * El mar de un municipio costero.
 *
 * «Costero» no se deduce de la distancia al agua sino de **tener playa en el
 * registro**: el propio dataset trae el código de municipio de cada playa, y eso
 * es exacto donde una regla de kilómetros se equivocaría — hay municipios a tres
 * kilómetros del mar sin un metro de costa.
 */
export async function seaNear(loc: Location): Promise<SeaNearby | null> {
  const snap = await snapshot<Data>('sea');
  if (!snap) return null;

  const ine5 = loc.municipiIne5 ?? '';
  const beaches = snap.data.beaches
    .filter((b) => b.municipalityIne5 === ine5)
    .sort((a, b) => a.ageHours - b.ageHours);

  if (!beaches.length) return null;

  // El punto de mar más cercano a la primera playa del municipio.
  const ref = beaches[0];
  let best: { p: SeaPoint; d: number } | null = null;
  for (const p of snap.data.points) {
    const d = distKm(ref.lat, ref.lon, p.lat, p.lon);
    if (!best || d < best.d) best = { p, d };
  }

  let now: SeaNow | null = null;
  let hourly: SeaNearby['hourly'] = [];

  if (best) {
    const { p } = best;
    const nowHour = localNowHour();
    const i = Math.max(0, p.times.findIndex((t) => t.slice(0, 13) === nowHour));
    now = {
      sst: p.sst[i] ?? null,
      waveHeight: p.waveHeight[i] ?? null,
      wavePeriod: p.wavePeriod[i] ?? null,
      waveDirection: p.waveDirection[i] ?? null,
      swellHeight: p.swellHeight[i] ?? null,
      near: p.near,
      distKm: Math.round(best.d * 10) / 10,
    };
    hourly = p.times.slice(i, i + 24).map((time, k) => ({
      time,
      waveHeight: p.waveHeight[i + k] ?? null,
      sst: p.sst[i + k] ?? null,
    }));
  }

  return { beaches, now, hourly, source: snap.source };
}

/**
 * El estado del mar en palabras, por la escala Douglas.
 *
 * Los cortes son los de la escala de la OMM, la de los partes marítimos. Y las
 * **palabras son las que usan los propios socorristas**: el registro de playas
 * escribe «plana», «arrissada», «marejol» y «maror», así que el modelo habla
 * igual que la persona que está en la arena.
 *
 * No es cosmética. La primera versión decía «marejolada», que no existe en
 * catalán, y ponía el bloque modelado a hablar un idioma distinto del bloque
 * medido justo encima — con el lector teniendo que adivinar si «marejolada» y
 * «arrissada» son lo mismo. Lo son: 0,3 m.
 */
export function douglas(heightM: number): string {
  if (heightM < 0.1) return 'mar plana';
  if (heightM < 0.5) return 'arrissada';
  if (heightM < 1.25) return 'marejol';
  if (heightM < 2.5) return 'maror';
  if (heightM < 4) return 'forta maror';
  if (heightM < 6) return 'maregassa';
  if (heightM < 9) return 'mar brava';
  return 'mar desfeta';
}

/** Puntos de mar, para la página de conjunto. */
export async function seaPoints(): Promise<{ points: SeaPoint[]; index: number } | null> {
  const snap = await snapshot<Data>('sea');
  if (!snap?.data.points.length) return null;
  const nowHour = localNowHour();
  const index = Math.max(0, snap.data.points[0].times.findIndex((t) => t.slice(0, 13) === nowHour));
  return { points: snap.data.points, index };
}
