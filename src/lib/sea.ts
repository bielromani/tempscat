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
 * QuÃ¨ Ã©s cada medusa i quÃ¨ fa si la toques.
 *
 * El registre les anota amb el nom cientÃ­fic i prou. Â«Cotylorhiza tuberculataÂ»
 * no diu res a ningÃº, i Â«Physalia physalisÂ» âque Ã©s la que de debÃ² importaâ
 * tampoc.
 *
 * ## Com estÃ  escrita aquesta taula
 *
 * En to conservador i sense entrar en tractaments. Una espÃ¨cie que no hi
 * consti es tracta **com si piquÃ©s**, no com si fos inofensiva: val mÃ©s
 * quedar-se curt que tranquilÂ·litzar sobre una cosa que no coneixem.
 *
 * La `Physalia` no Ã©s una medusa sinÃ³ un sifonÃ²for. AquÃ­ importaria poc si no
 * fos perquÃ¨ la seva picada Ã©s d'una altra categoria i els tentacles piquen
 * igual a la sorra i hores desprÃ©s.
 */
export type StingLevel = 'inofensiva' | 'lleu' | 'dolorosa' | 'perillosa' | 'desconeguda';

interface Species { common: string; sting: StingLevel; note?: string }

const JELLYFISH: Record<string, Species> = {
  'pelagia noctiluca': {
    common: 'medusa clavell', sting: 'dolorosa',
    note: 'La mÃ©s freqÃ¼ent a la costa catalana.',
  },
  'rhizostoma pulmo': { common: 'bot blau', sting: 'lleu' },
  'cotylorhiza tuberculata': { common: 'ou ferrat', sting: 'inofensiva' },
  'aurelia aurita': { common: 'medusa vera', sting: 'lleu' },
  'velella velella': { common: 'barqueta de Sant Pere', sting: 'inofensiva' },
  'chrysaora hysoscella': { common: 'medusa de compÃ s', sting: 'dolorosa' },
  'carybdea marsupialis': { common: 'medusa cub', sting: 'dolorosa' },
  'physalia physalis': {
    common: 'vaixell portuguÃ¨s', sting: 'perillosa',
    note: 'No Ã©s una medusa. Els tentacles piquen tambÃ© fora de lâaigua i hores desprÃ©s.',
  },
};

export const STING_STYLE: Record<StingLevel, { label: string; color: string }> = {
  inofensiva: { label: 'no pica', color: 'var(--cap-green)' },
  lleu: { label: 'picada lleu', color: 'var(--cap-yellow)' },
  dolorosa: { label: 'pica, i fa mal', color: 'var(--warn)' },
  perillosa: { label: 'perillosa', color: 'var(--cap-red)' },
  desconeguda: { label: 'tracteu-la com si piquÃ©s', color: 'var(--muted)' },
};

/** QuÃ¨ se sap d'una espÃ¨cie. Mai diu Â«inofensivaÂ» d'una que no consti. */
export function speciesInfo(scientific: string): Species {
  return JELLYFISH[scientific.trim().toLowerCase()]
    ?? { common: '', sting: 'desconeguda' };
}

/**
 * Les meduses d'una platja.
 *
 * El camp porta **una o més espècies separades per `;`**, i cadascuna amb
 * `espècie,abundància,talla`:
 *
 *     Rhizostoma pulmo,poques,5-10;Pelagia noctiluca,poques,0-5
 *
 * La primera versió només llegia fins a la primera coma i es quedava amb una
 * espècie. A Castell-Platja d'Aro es reporten tres alhora i la pàgina
 * n'ensenyava una: la inofensiva. La que pica —la *Pelagia noctiluca*— quedava
 * amagada darrere del punt i coma.
 *
 * **No es tradueix el nom científic**: és el que permet consultar l'espècie, i
 * els noms populars canvien d'una cala a l'altra. El nom corrent i la picada
 * els posa `speciesInfo()`.
 */
export interface Jellyfish { species: string; amount: string; size: string }

export function parseJellyfish(raw: string | null): Jellyfish[] {
  if (!raw) return [];
  return raw
    .split(';')
    .map((chunk) => {
      const [species, amount, size] = chunk.split(',').map((x) => x.trim());
      return { species: species ?? '', amount: amount ?? '', size: size ?? '' };
    })
    .filter((j) => j.species.length > 0);
}

/**
 * L'espècie més perillosa de les reportades.
 *
 * Perquè quan n'hi ha tres, la que decideix si t'hi fiques és la pitjor, no la
 * primera que va escriure el socorrista.
 */
export function worstJellyfish(list: Jellyfish[]): Jellyfish | null {
  const rank: Record<StingLevel, number> = {
    inofensiva: 0, lleu: 1, desconeguda: 2, dolorosa: 3, perillosa: 4,
  };
  return list.reduce<Jellyfish | null>(
    (worst, j) => (!worst || rank[speciesInfo(j.species).sting] > rank[speciesInfo(worst.species).sting] ? j : worst),
    null,
  );
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
