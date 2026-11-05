import 'server-only';
import { snapshot } from './cache-store';
import { localNowHour } from './weather';
import type { Location } from './territory';
import type { Lang } from './lang';

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

interface FlagWords {
  label: string;
  /** El plural no se forma con una regla: verda→verdes, groga→**grogues**. */
  plural: string;
  meaning: string;
}

interface FlagStyle extends FlagWords {
  color: string;
  ink: string;
  /** Las mismas tres palabras en castellano. El color no cambia de idioma. */
  es: FlagWords;
}

export const FLAG_STYLE: Record<string, FlagStyle> = {
  verda: {
    label: 'Verda', plural: 'verdes', color: 'var(--cap-green)', ink: 'oklch(20% 0.03 150)',
    meaning: 'Bany lliure',
    es: { label: 'Verde', plural: 'verdes', meaning: 'Baño libre' },
  },
  groga: {
    label: 'Groga', plural: 'grogues', color: 'var(--cap-yellow)', ink: 'oklch(22% 0.04 95)',
    meaning: 'Bany amb precaució',
    es: { label: 'Amarilla', plural: 'amarillas', meaning: 'Baño con precaución' },
  },
  vermella: {
    label: 'Vermella', plural: 'vermelles', color: 'var(--cap-red)', ink: 'oklch(98% 0.01 27)',
    meaning: 'Bany prohibit',
    es: { label: 'Roja', plural: 'rojas', meaning: 'Baño prohibido' },
  },
  complet: {
    label: 'Aforament complet', plural: 'amb aforament complet',
    color: 'var(--muted)', ink: 'var(--paper)',
    meaning: 'La platja ha arribat al límit d’ocupació',
    es: { label: 'Aforo completo', plural: 'con aforo completo', meaning: 'La playa ha llegado al límite de ocupación' },
  },
  'sense informacio': {
    label: 'Sense informació', plural: 'sense informació',
    color: 'var(--line)', ink: 'var(--ink-2)',
    meaning: 'La platja no ha comunicat estat',
    es: { label: 'Sin información', plural: 'sin información', meaning: 'La playa no ha comunicado su estado' },
  },
};

/** El estilo de la bandera, con las palabras en el idioma de la página. */
export function flagStyle(flag: string, lang: Lang = 'ca'): FlagStyle {
  const s = FLAG_STYLE[flag] ?? FLAG_STYLE['sense informacio'];
  return lang === 'es' ? { ...s, ...s.es } : s;
}

/**
 * Què és cada medusa i què fa si la toques.
 *
 * El registre les anota amb el nom científic i prou. «Cotylorhiza tuberculata»
 * no diu res a ningú, i «Physalia physalis» —que és la que de debò importa—
 * tampoc.
 *
 * ## Com està escrita aquesta taula
 *
 * En to conservador i sense entrar en tractaments. Una espècie que no hi
 * consti es tracta **com si piqués**, no com si fos inofensiva: val més
 * quedar-se curt que tranquil·litzar sobre una cosa que no coneixem.
 *
 * La `Physalia` no és una medusa sinó un sifonòfor. Aquí importaria poc si no
 * fos perquè la seva picada és d'una altra categoria i els tentacles piquen
 * igual a la sorra i hores després.
 */
export type StingLevel = 'inofensiva' | 'lleu' | 'dolorosa' | 'perillosa' | 'desconeguda';

interface Species {
  common: string;
  sting: StingLevel;
  note?: string;
  /** El nom corrent i la nota en castellà. La picada és la mateixa. */
  es?: { common: string; note?: string };
}

const JELLYFISH: Record<string, Species> = {
  'pelagia noctiluca': {
    common: 'medusa clavell', sting: 'dolorosa',
    note: 'La més freqüent a la costa catalana.',
    es: { common: 'medusa luminiscente', note: 'La más frecuente en la costa catalana.' },
  },
  'rhizostoma pulmo': { common: 'bot blau', sting: 'lleu', es: { common: 'aguamala' } },
  'cotylorhiza tuberculata': { common: 'ou ferrat', sting: 'inofensiva', es: { common: 'huevo frito' } },
  'aurelia aurita': { common: 'medusa vera', sting: 'lleu', es: { common: 'medusa común' } },
  'velella velella': { common: 'barqueta de Sant Pere', sting: 'inofensiva', es: { common: 'velero' } },
  'chrysaora hysoscella': { common: 'medusa de compàs', sting: 'dolorosa', es: { common: 'medusa de compás' } },
  'carybdea marsupialis': { common: 'medusa cub', sting: 'dolorosa', es: { common: 'avispa de mar' } },
  'physalia physalis': {
    common: 'vaixell portuguès', sting: 'perillosa',
    note: 'No és una medusa. Els tentacles piquen també fora de l’aigua i hores després.',
    es: {
      common: 'carabela portuguesa',
      note: 'No es una medusa. Los tentáculos pican también fuera del agua y horas después.',
    },
  },
};

export const STING_STYLE: Record<StingLevel, { label: string; labelEs: string; color: string }> = {
  inofensiva: { label: 'no pica', labelEs: 'no pica', color: 'var(--cap-green)' },
  lleu: { label: 'picada lleu', labelEs: 'picadura leve', color: 'var(--cap-yellow)' },
  dolorosa: { label: 'pica, i fa mal', labelEs: 'pica, y duele', color: 'var(--warn)' },
  perillosa: { label: 'perillosa', labelEs: 'peligrosa', color: 'var(--cap-red)' },
  desconeguda: { label: 'tracteu-la com si piqués', labelEs: 'trátela como si picara', color: 'var(--muted)' },
};

/** Què se sap d'una espècie. Mai diu «inofensiva» d'una que no consti. */
export function speciesInfo(scientific: string, lang: Lang = 'ca'): Species {
  const s = JELLYFISH[scientific.trim().toLowerCase()]
    ?? { common: '', sting: 'desconeguda' };
  return lang === 'es' && s.es ? { ...s, common: s.es.common, note: s.es.note } : s;
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
/**
 * El motiu de la bandera, normalitzat.
 *
 * El registre de platges el fa servir com una etiqueta d'una llista curta
 * -`MEDUSES`, `Vent`, `Estat del mar`, `Qualitat de l'aigua`, `Altres`- pero
 * l'escriu qui fa el comunicat, i aixo es nota: hi ha `MEDUSES` en majuscules i
 * hi ha **`Medusas`, en castella**, escrit per un socorrista d'una platja
 * concreta. Sortia aixi publicat en una pagina en catala.
 *
 * No es reescriure un text oficial: es una categoria d'una llista tancada, i
 * aqui nomes se li posa la forma que li toca. El que no consti a la taula surt
 * tal com ve, en minuscules, que es millor que amagar-lo.
 */
const FLAG_REASONS: Record<string, string> = {
  medusas: 'meduses',
  meduses: 'meduses',
  vent: 'vent',
  'estat del mar': 'estat del mar',
  'qualitat de l’aigua': 'qualitat de l’aigua',
  "qualitat de l'aigua": 'qualitat de l’aigua',
  altres: 'altres motius',
};

/**
 * Y en castellano. La misma lista cerrada, y además «Estat mar», que es como lo
 * escriben dieciséis partes del registro: en catalán sale tal cual, pero en una
 * página en castellano sería la única palabra en catalán de la línea.
 */
const FLAG_REASONS_ES: Record<string, string> = {
  medusas: 'medusas',
  meduses: 'medusas',
  vent: 'viento',
  'estat del mar': 'estado del mar',
  'estat mar': 'estado del mar',
  'qualitat de l’aigua': 'calidad del agua',
  "qualitat de l'aigua": 'calidad del agua',
  altres: 'otros motivos',
};

export function flagReasonText(raw: string | null | undefined, lang: Lang = 'ca'): string | null {
  if (!raw) return null;
  const key = raw.trim().toLowerCase();
  return (lang === 'es' ? FLAG_REASONS_ES : FLAG_REASONS)[key] ?? key;
}

/**
 * La escala Douglas en castellano es la de AEMET, y las palabras se emparejan
 * con las catalanas por el nombre y no por el umbral: plana es calma, arrissada
 * es rizada, marejol es marejadilla. Así el modelo y el socorrista siguen
 * hablando igual también en castellano.
 */
export function douglas(heightM: number, lang: Lang = 'ca'): string {
  if (lang === 'es') {
    if (heightM < 0.1) return 'calma';
    if (heightM < 0.5) return 'rizada';
    if (heightM < 1.25) return 'marejadilla';
    if (heightM < 2.5) return 'marejada';
    if (heightM < 4) return 'fuerte marejada';
    if (heightM < 6) return 'gruesa';
    if (heightM < 9) return 'muy gruesa';
    return 'arbolada';
  }
  if (heightM < 0.1) return 'mar plana';
  if (heightM < 0.5) return 'arrissada';
  if (heightM < 1.25) return 'marejol';
  if (heightM < 2.5) return 'maror';
  if (heightM < 4) return 'forta maror';
  if (heightM < 6) return 'maregassa';
  if (heightM < 9) return 'mar brava';
  return 'mar desfeta';
}

/**
 * Las palabras del parte del socorrista, en castellano.
 *
 * El registro las escribe en catalán y de una lista corta: el estado del mar
 * (con las mismas palabras que `douglas()`), la transparencia del agua, el cielo
 * y la cantidad de medusas. En catalán se enseñan tal cual; en castellano, por
 * esta tabla, y lo que no conste sale como viene, que es mejor que esconderlo.
 */
const BEACH_WORDS_ES: Record<string, string> = {
  plana: 'calma',
  'mar plana': 'calma',
  arrissada: 'rizada',
  marejol: 'marejadilla',
  maror: 'marejada',
  'forta maror': 'fuerte marejada',
  maregassa: 'gruesa',
  transparent: 'transparente',
  terbola: 'turbia',
  bruta: 'sucia',
  sol: 'sol',
  'sol/nuvols': 'sol y nubes',
  nuvols: 'nubes',
  cobert: 'cubierto',
  pluja: 'lluvia',
  poques: 'pocas',
  algunes: 'algunas',
  moltes: 'muchas',
  abundants: 'abundantes',
};

export function beachWord(raw: string, lang: Lang = 'ca'): string {
  if (lang !== 'es') return raw;
  return BEACH_WORDS_ES[raw.trim().toLowerCase()] ?? raw;
}

/**
 * La línea de procedencia de un worker, en castellano.
 *
 * Los workers la escriben en catalán («Protecció Civil i socorristes · dades
 * obertes · onatge d’Open-Meteo») y viaja con la instantánea, así que no se
 * puede elegir idioma al escribirla. Los nombres propios —Protecció Civil,
 * Agència Catalana de l’Aigua, XVPCA, CAMS, Generalitat— no se traducen; solo
 * las palabras comunes que los acompañan. Vive aquí porque el mar fue el
 * primero, y la usan también el agua y el aire.
 */
const SOURCE_WORDS_ES: Array<[RegExp, string]> = [
  [/dades obertes/g, 'datos abiertos'],
  [/ i socorristes/g, ' y socorristas'],
  [/onatge d[’']Open-Meteo/g, 'oleaje de Open-Meteo'],
  [/zones de Meteoalerta/g, 'zonas de Meteoalerta'],
  [/avisos oficials/g, 'avisos oficiales'],
];

export function sourceText(source: string, lang: Lang = 'ca'): string {
  if (lang !== 'es') return source;
  return SOURCE_WORDS_ES.reduce((s, [re, to]) => s.replace(re, to), source);
}

/** Puntos de mar, para la página de conjunto. */
export async function seaPoints(): Promise<{ points: SeaPoint[]; index: number } | null> {
  const snap = await snapshot<Data>('sea');
  if (!snap?.data.points.length) return null;
  const nowHour = localNowHour();
  const index = Math.max(0, snap.data.points[0].times.findIndex((t) => t.slice(0, 13) === nowHour));
  return { points: snap.data.points, index };
}
