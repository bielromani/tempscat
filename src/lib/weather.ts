import 'server-only';
import { plainJson, snapshot } from './cache-store';
import {
  ALL_VARIABLES, VARIABLES, apparentTemperature,
  type VariableSlug,
} from './variables';
import { moonPhase, nextMoonEvents, sunTimes } from './astronomy';
import { airCellKey } from './air-grid';
import {
  aggregateDaily, mergeHourly, type PointForecast, type StoredDaily,
} from './forecast-merge';
import {
  FRESHNESS_SOURCES, airShard, forecastShard, freshnessShard, historyShard,
} from './shards';
import {
  AIR_VARIABLES, POLLENS, POLLUTANTS, SUB_INDEX_OF, SUB_INDICES,
  pollenLevel, type AirSlug, type PollenLevel,
} from './air-variables';
import type {
  CurrentConditions, DailyPoint, HourlyPoint, LocationForecast,
} from './forecast-types';
import type { TileGrid } from './mercator';
import type { Location } from './territory';

/**
 * Observación y predicción para una ubicación.
 *
 * Lee únicamente lo que han dejado los workers en `data/cache/`. Ninguna
 * petición de un usuario dispara jamás una llamada a una API externa: es el
 * principio rector de la arquitectura, y es lo que mantiene la cuota bajo
 * control y la latencia predecible.
 */

/*
 * De dónde salen los datos: `cache-store.ts`.
 *
 * Antes esto era un `readFileSync` con memorización por `mtime`. Sigue
 * siéndolo cuando se trabaja en local — la capa de abajo lo resuelve— pero en
 * producción no hay disco, así que **leer pasó a ser asíncrono** y con él todos
 * los lectores de este fichero.
 *
 * El plazo de cada fuente, el tope de trozos de predicción en memoria y qué
 * hacer si el almacén falla están allí, no aquí.
 */

/**
 * La hora en curso, en hora local de Madrid y con el formato de las series
 * (2026-08-31T14).
 *
 * Estaba duplicada en LocationView con un comentario largo explicando por qué el
 * replace no es cosmético. Al aparecer el tercer sitio que la necesitaba —aire,
 * radar, comparativa— tocaba darle un solo hogar: es la clase de detalle que, si
 * se copia, se arregla en un sitio y se queda roto en los otros dos.
 *
 * toLocaleString('sv-SE') devuelve 2026-08-31 14:30 con **espacio**, y las
 * series de Open-Meteo usan T. Sin unificarlos, la búsqueda de la hora actual no
 * encuentra nada y cae al primer elemento — las 00:00, con UV cero y cielo
 * despejado. No da error: da datos plausibles y falsos.
 */
export function localNowHour(): string {
  return new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 13);
}

/** El día de hoy en hora local de Madrid, 2026-08-31. */
export function localToday(): string {
  return localNowHour().slice(0, 10);
}

/** Índice de la hora en curso dentro de una serie horaria. Cero si no la alcanza. */
function nowIndex(times: string[]): number {
  const now = localNowHour();
  const i = times.findIndex((t) => t.slice(0, 13) === now);
  return i >= 0 ? i : 0;
}

// ── Observación ─────────────────────────────────────────────────────────────

export interface RawObservation {
  station: string;
  ts: string;
  ageMin: number;
  values: Partial<Record<VariableSlug, { value: number; ts: string; provisional: boolean }>>;
  precip24h?: number;
  /**
   * Extremos del día natural en curso, desde la medianoche de Madrid.
   *
   * No es lo mismo que las últimas 24 h, y la diferencia importa: a las nueve de
   * la mañana, «el poble més càlid d'avui» no puede incluir la máxima de ayer a
   * las cinco de la tarde, que es lo que devolvería una ventana móvil.
   */
  today?: { tMax: number | null; tMin: number | null; precip: number | null };
  /** Lo mismo para el día natural anterior. Ver el worker: el dataset diario llega dos días tarde. */
  yesterday?: { tMax: number | null; tMin: number | null; precip: number | null };
}

/**
 * Observación cruda de todas las estaciones.
 *
 * La usan los ránquings, que preguntan por estación y no por ubicación. Se
 * expone el snapshot entero en vez de duplicar el lector: la ventana de un
 * segundo del  statSync  y la memorización por  mtime  valen igual aquí, y tener
 * dos copias de esa lógica es tener una que se queda sin arreglar.
 */
export async function allObservations(): Promise<{ data: RawObservation[]; source: string } | null> {
  const snap = await snapshot<RawObservation[]>('xema-current');
  return snap ? { data: snap.data, source: snap.source } : null;
}


/*
 * Los tipos de la observación y de la predicción viven en forecast-types.ts y se
 * reexportan desde aquí: quien consume esta capa sigue importando de un solo
 * sitio, y narrative.ts puede cargarlos sin arrastrar node:fs.
 */
export type { CurrentConditions, DailyPoint, HourlyPoint, LocationForecast };

/** Gradiente térmico estándar en atmósfera bien mezclada, °C por metro. */
const LAPSE_RATE = 0.0065;

export async function currentFor(loc: Location): Promise<CurrentConditions | null> {
  const snap = await snapshot<RawObservation[]>('xema-current');
  if (!snap || !loc.stationRef) return null;
  const obs = snap.data.find((o) => o.station === loc.stationRef!.codi);
  if (!obs) return null;

  const t = obs.values.temperature?.value ?? null;
  const wind = obs.values.wind_speed?.value ?? null;
  const hum = obs.values.humidity?.value ?? null;

  // El desnivel entre la ubicación y su estación de referencia se corrige con
  // el gradiente estándar. Es una aproximación honesta: en noches despejadas de
  // invierno con inversión térmica el signo se invierte, y eso requiere el
  // motor de fusión de la fase 4, que aún no existe. Mientras tanto la página
  // no debe presentar esto como más preciso de lo que es.
  const dAlt = loc.stationRef.dAltM;
  const adjusted = t != null && dAlt != null ? t - dAlt * LAPSE_RATE : t;

  return {
    station: loc.stationRef,
    observedAt: obs.ts,
    ageMin: Math.round((Date.now() - Date.parse(obs.ts)) / 60_000),
    provisional: Object.values(obs.values).some((v) => v?.provisional),
    temperature: t,
    temperatureAdjusted: adjusted != null ? Math.round(adjusted * 10) / 10 : null,
    apparent: adjusted != null && wind != null && hum != null
      ? Math.round(apparentTemperature(adjusted, wind, hum) * 10) / 10
      : null,
    humidity: hum,
    windSpeed: wind,
    windDirection: obs.values.wind_direction?.value ?? null,
    windGust: obs.values.wind_gust?.value ?? null,
    pressure: obs.values.pressure?.value ?? null,
    precip24h: obs.precip24h ?? null,
    todayMax: adjust(obs.today?.tMax ?? null, dAlt),
    todayMin: adjust(obs.today?.tMin ?? null, dAlt),
    todayPrecip: obs.today?.precip ?? null,
    yesterdayMax: adjust(obs.yesterday?.tMax ?? null, dAlt),
    yesterdayMin: adjust(obs.yesterday?.tMin ?? null, dAlt),
    yesterdayPrecip: obs.yesterday?.precip ?? null,
    source: snap.source,
  };
}

/** Aplica el gradiente estándar a una temperatura de estación. */
function adjust(value: number | null, dAltM: number | null): number | null {
  if (value == null) return null;
  const v = dAltM != null ? value - dAltM * LAPSE_RATE : value;
  return Math.round(v * 10) / 10;
}

// ── Predicción ──────────────────────────────────────────────────────────────

interface ForecastData {
  times: string[];
  points: Record<string, Record<string, PointForecast>>;
  /**
   * El resumen por días, ya fusionado entre modelos y sin orto ni ocaso.
   *
   * Opcional porque un fichero escrito antes de que existiera no lo trae, y
   * entonces se calcula al vuelo. Ver `src/lib/shards.ts`.
   */
  daily?: Record<string, StoredDaily>;
  models: string[];
}

/**
 * De las columnas guardadas a los días que espera la página.
 *
 * Dos cosas se ponen aquí y no en el worker, porque dependen del pueblo y no
 * del punto de rejilla: la corrección de altitud sobre las temperaturas, y el
 * orto y el ocaso.
 */
function fromStored(
  d: StoredDaily, tempCorrection: number, loc: Location, hourly: HourlyPoint[],
): DailyPoint[] {
  const corr = (v: number | null) => (v == null ? null : Math.round((v + tempCorrection) * 10) / 10);

  /*
   * Los días que la página tiene hora a hora, sacan su máxima de esas horas.
   *
   * No es purismo. La máxima guardada viene sin corregir por la altitud y se
   * corrige aquí; la de la tabla horaria viene corregida hora a hora. Son dos
   * redondeos distintos y en el 0,22 % de los casos daban un décimo de
   * diferencia —la tarjeta del día diciendo 20,2 y la tabla de debajo, 20,1—.
   * Un décimo no importa; que la ficha se contradiga a sí misma, sí.
   *
   * Solo para los días completos: el último de la ventana horaria está cortado
   * y su máxima sería la de media tarde, no la del día.
   */
  const byDay = new Map<string, HourlyPoint[]>();
  for (const h of hourly) {
    const day = h.time.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(h);
    byDay.set(day, arr);
  }
  const lastLoaded = [...byDay.keys()].at(-1);

  return d.date.map((date, i) => {
    const hs = date === lastLoaded ? undefined : byDay.get(date);
    const temps = hs?.map((h) => h.temperature).filter((v): v is number => v != null);
    const sun = loc.lat != null && loc.lon != null
      ? sunTimes(new Date(`${date}T12:00:00Z`), loc.lat, loc.lon)
      : null;
    return {
      date,
      tMax: temps?.length ? Math.max(...temps) : corr(d.tMax[i]),
      tMin: temps?.length ? Math.min(...temps) : corr(d.tMin[i]),
      weatherCode: d.weatherCode[i],
      precipitation: d.precipitation[i],
      precipProbability: d.precipProbability[i],
      precipHours: d.precipHours[i],
      snowfall: d.snowfall[i],
      windMax: d.windMax[i],
      gustMax: d.gustMax[i],
      windDirection: d.windDirection[i],
      uvMax: d.uvMax[i],
      snowLevel: d.snowLevel[i],
      sunrise: sun?.sunrise?.toISOString() ?? null,
      sunset: sun?.sunset?.toISOString() ?? null,
      spread: d.spread?.[i] ?? null,
    };
  });
}


export async function forecastFor(loc: Location, hours = 336): Promise<LocationForecast | null> {
  if (!loc.forecastPointId || !loc.comarcaCodi) return null;
  // Solo el trozo de su comarca. El punto de un municipio de frontera está
  // duplicado en los dos trozos justamente para que aquí no haya que buscarlo.
  const snap = await snapshot<ForecastData>(forecastShard(loc.comarcaCodi));
  if (!snap) return null;
  const byModel = snap.data.points[loc.forecastPointId];
  if (!byModel) return null;

  const models = Object.keys(byModel);
  if (!models.length) return null;

  // Corrección de altitud: contra la orografía que asume el modelo, no contra
  // la cota oficial. Es la diferencia que el modelo "cree" que hay, y es la que
  // hay que compensar.
  const modelElev = byModel[models[0]].modelElevation;
  const dAlt = loc.altitud != null && modelElev != null ? loc.altitud - modelElev : 0;
  const tempCorrection = -dAlt * LAPSE_RATE;

  const times = snap.data.times.slice(0, hours);

  const hourly = mergeHourly(byModel, times, {
    tempCorrection, lat: loc.lat ?? null, lon: loc.lon ?? null,
  });

  /*
   * El resumen por días ya viene hecho del worker cuando el fichero lo trae.
   *
   * Sacarlo aquí obligaba a que el fichero cargara las 336 horas de cada punto
   * —la página enseña 48— y esas horas de más eran la mayor parte de los
   * 50 MB de la predicción. Ver `src/lib/shards.ts`.
   *
   * Se calcula igualmente si no viene: es lo que pasa con un fichero escrito
   * antes de este cambio, y con el disco local mientras no se refresca.
   */
  const stored = snap.data.daily?.[loc.forecastPointId];
  const daily: DailyPoint[] = stored
    ? fromStored(stored, tempCorrection, loc, hourly)
    : aggregateDaily(hourly, { lat: loc.lat ?? null, lon: loc.lon ?? null });

  return {
    hourly,
    daily,
    models,
    nModels: models.length,
    altitudeCorrectionM: dAlt !== 0 ? Math.round(dAlt) : null,
    issuedAt: snap.fetchedAt,
    source: snap.source,
    skillWeighted: false,
  };
}

// ── Avisos oficiales ────────────────────────────────────────────────────────

export type WarningLevel = 'verd' | 'groc' | 'taronja' | 'vermell';

export interface Warning {
  id: string;
  event: string;
  phenomenon: string;
  level: WarningLevel;
  severity: string;
  onset: string;
  expires: string;
  headline: string;
  description: string;
  instruction: string;
  probability?: string;
  threshold?: string;
  web: string;
  zones: string[];
  locationIds: string[];
  comarcaCodis: string[];
}

/**
 * Avisos vigentes para una ubicación.
 *
 * La asignación viene hecha por geometría desde el worker: los polígonos de
 * AEMET no siguen los límites comarcales, así que emparejar por nombre de zona
 * daría avisos a municipios que no los tienen — y en un aviso de seguridad, un
 * falso positivo cuesta tanto como un falso negativo.
 */
export async function warningsFor(loc: Location): Promise<Warning[]> {
  const snap = await snapshot<Warning[]>('warnings');
  if (!snap) return [];
  const now = Date.now();
  return snap.data
    .filter((w) => w.locationIds.includes(loc.id) && Date.parse(w.expires) > now)
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

const LEVEL_RANK: Record<WarningLevel, number> = { verd: 0, groc: 1, taronja: 2, vermell: 3 };

/**
 * Un aviso, o varios que son el mismo aviso repetido día a día.
 *
 * AEMET emite **un fichero CAP por día y por zona**, así que una ola de calor
 * de tres días llega como tres avisos idénticos salvo la fecha. La Vall de Boí
 * enseñaba tres tarjetas seguidas —mismo fenómeno, mismo nivel, misma zona,
 * mismas ocho horas de la tarde— que el lector tenía que comparar palabra por
 * palabra para descubrir que solo cambiaba el día.
 *
 * Se agrupan por fenómeno, nivel y zona, **nunca por menos**: si el viernes
 * pasa a naranja, el naranja va en su propia tarjeta. Y dentro del grupo se
 * conserva cada día con su umbral, porque 35 °C el miércoles y 36 °C el viernes
 * no son el mismo número y esconder el segundo detrás del primero sería
 * exactamente lo que un aviso no puede hacer.
 */
export interface WarningGroup {
  /** Clave estable, para el `key` de React. */
  key: string;
  level: WarningLevel;
  /** Código del fenómeno: AT, PR, NE… El nombre en catalán sale de `warning-labels`. */
  phenomenon: string;
  zones: string[];
  /** Del primer instante cubierto al último. */
  onset: string;
  expires: string;
  /** Un tramo por aviso original, en orden. Uno solo cuando no hay repetición. */
  spans: Array<{ id: string; onset: string; expires: string; threshold?: string }>;
  probability?: string;
  web: string;
  /** El texto tal como lo emite AEMET, sin tocar. Puede diferir entre días. */
  official: { event: string; descriptions: string[]; instructions: string[] };
}

/**
 * Agrupa los avisos que son el mismo aviso en días distintos.
 *
 * Función pura: no mira el reloj. El filtro de vigencia lo hace quien la llama,
 * que es donde vive el reloj en este proyecto.
 */
export function groupWarnings(warnings: Warning[]): WarningGroup[] {
  const byKey = new Map<string, WarningGroup>();

  for (const w of warnings) {
    const key = [w.phenomenon, w.level, [...w.zones].sort().join('+')].join('|');
    const span = { id: w.id, onset: w.onset, expires: w.expires, threshold: w.threshold };
    const found = byKey.get(key);

    if (!found) {
      byKey.set(key, {
        key,
        level: w.level,
        phenomenon: w.phenomenon,
        zones: w.zones,
        onset: w.onset,
        expires: w.expires,
        spans: [span],
        probability: w.probability,
        web: w.web,
        official: {
          event: w.event,
          descriptions: w.description ? [w.description] : [],
          instructions: w.instruction ? [w.instruction] : [],
        },
      });
      continue;
    }

    found.spans.push(span);
    if (w.onset < found.onset) found.onset = w.onset;
    if (w.expires > found.expires) found.expires = w.expires;
    // Repetido no se guarda dos veces; distinto no se pierde.
    if (w.description && !found.official.descriptions.includes(w.description)) {
      found.official.descriptions.push(w.description);
    }
    if (w.instruction && !found.official.instructions.includes(w.instruction)) {
      found.official.instructions.push(w.instruction);
    }
  }

  const groups = [...byKey.values()];
  for (const g of groups) g.spans.sort((a, b) => a.onset.localeCompare(b.onset));
  return groups.sort(
    (a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level] || a.onset.localeCompare(b.onset),
  );
}

/** Todos los avisos vigentes, para la portada y la página de comarca. */
export async function activeWarnings(): Promise<Warning[]> {
  const snap = await snapshot<Warning[]>('warnings');
  if (!snap) return [];
  const now = Date.now();
  return snap.data.filter((w) => Date.parse(w.expires) > now);
}

// ── Histórico y clima de la estación de referencia ──────────────────────────

/**
 * Rosa de los vientos de una estación, 16 sectores.
 *
 * La construye el worker de histórico a partir de la dirección de la racha
 * máxima de cada día de toda la serie. Ver el componente WindRose para qué
 * contesta y qué no.
 */
export interface WindRose {
  sectors: Array<{
    deg: number;
    label: string;
    days: number;
    /** Fracción de días, 0–1. */
    share: number;
    gustMean: number | null;
    gustMax: number | null;
  }>;
  days: number;
  prevailing: { label: string; share: number } | null;
  /** Altura del anemómetro en metros: a 2 m el viento es más flojo que a 10. */
  heightM: number;
}

export interface StationHistory {
  station: string;
  daily: Array<{
    day: string; tMax: number | null; tMin: number | null; tMean: number | null;
    tRange: number | null; rhMean: number | null; precip: number | null;
    precipMax1h: number | null; gust: number | null; pressure: number | null; solar: number | null;
    snowDepth: number | null; snowNew: number | null;
  }>;
  records: {
    tMaxAbs: { value: number; date: string; hour?: string } | null;
    tMinAbs: { value: number; date: string; hour?: string } | null;
    precipMaxDay: { value: number; date: string } | null;
    precipMax1h: { value: number; date: string } | null;
    gustMax: { value: number; date: string; hour?: string } | null;
    /** Espesor de nieve más alto de la serie. Solo en las 24 estaciones que lo miden. */
    snowMax: { value: number; date: string; hour?: string } | null;
    since: string | null;
    days: number;
  };
  normals: Array<{ month: number; tMean: number | null; precip: number | null; years: number }>;
  counters: {
    summerDays: { month: number; year: number };
    hotDays: { month: number; year: number };
    tropicalNights: { month: number; year: number };
    frostDays: { month: number; year: number };
    rainDays: { month: number; year: number };
    precip: { month: number; year: number };
  };
  monthAnomaly: number | null;
  dryStreak: number;
  /** De dónde vienen las rachas. Null si la estación no mide viento. */
  rose: WindRose | null;
  /** Última medida de nieve. Null cuando la estación no tiene sensor. */
  snow: { depthCm: number; newCm: number | null; day: string } | null;
}

/** Histórico de la estación de referencia de una ubicación. */
export async function historyFor(loc: Location): Promise<StationHistory | null> {
  if (!loc.stationRef) return null;
  return historyOfStation(loc.stationRef.codi);
}

/**
 * Todo el histórico, para las páginas que comparan estaciones entre ellas.
 *
 * Son dos megas y **solo lo piden cuatro URL**: `/neu`, `/bolets`,
 * `/senderisme` y `/nautica`. Cualquier página que hable de un sitio concreto
 * usa `historyOfStation`, que se baja diez kilobytes. La diferencia entre esas
 * dos llamadas es la que agotó el almacén: ver `src/lib/shards.ts`.
 */
export async function allHistory(): Promise<StationHistory[]> {
  return (await snapshot<StationHistory[]>('xema-history'))?.data ?? [];
}

/**
 * Histórico de una estación.
 *
 * Su propio trozo, no una búsqueda dentro del monolito. Es la única forma de
 * que la ficha de un pueblo pague por una estación y no por las 189.
 */
export async function historyOfStation(codi: string): Promise<StationHistory | null> {
  return (await snapshot<StationHistory>(historyShard(codi)))?.data ?? null;
}

/** Observación actual de una estación concreta, sin corrección de altitud. */
export async function observationOfStation(codi: string): Promise<RawObservation | null> {
  const snap = await snapshot<RawObservation[]>('xema-current');
  return snap?.data.find((o) => o.station === codi) ?? null;
}

// ── Astronomía ──────────────────────────────────────────────────────────────

export interface Astronomy {
  sunrise: Date | null;
  sunset: Date | null;
  solarNoon: Date;
  dawn: Date | null;
  dusk: Date | null;
  daylightMinutes: number | null;
  daylightDeltaMinutes: number | null;
  moon: { phase: number; illumination: number; name: string; age: number };
  nextNewMoon: Date;
  nextFullMoon: Date;
  /**
   * Qué fracción del día solar ha transcurrido: 0 al amanecer, 1 al atardecer.
   *
   * Se calcula aquí y no en el componente porque depende del reloj, y la hora
   * del reloj es un dato. Un componente que la lee por su cuenta deja de ser
   * puro y su resultado cambia entre el marcado del servidor y el del cliente.
   */
  dayFraction: number | null;
}

/**
 * Sol y luna del día para esta ubicación. Se calcula, no se pide: es exacto,
 * gratis y da fase lunar y crepúsculos, que ninguna API meteorológica ofrece.
 */
export function astronomyFor(loc: Location, date = new Date()): Astronomy | null {
  if (loc.lat == null || loc.lon == null) return null;
  const t = sunTimes(date, loc.lat, loc.lon);
  const events = nextMoonEvents(date);

  const rise = t.sunrise?.getTime();
  const set = t.sunset?.getTime();
  const dayFraction = rise != null && set != null && set > rise
    ? Math.max(0, Math.min(1, (Date.now() - rise) / (set - rise)))
    : null;

  return {
    ...t,
    moon: moonPhase(date),
    nextNewMoon: events.newMoon,
    nextFullMoon: events.fullMoon,
    dayFraction,
  };
}

// ── Calidad del aire ────────────────────────────────────────────────────────

interface AirCellData { values: Partial<Record<AirSlug, Array<number | null>>> }
/**
 * Una celda sola, que es lo único que necesita la ficha de un pueblo.
 *
 * El fichero con las 372 lo sigue escribiendo el worker —es el que documenta
 * `/dades`— pero la aplicación ya no lo lee desde ninguna página.
 */
interface AirCellShard {
  times: string[];
  cell: AirCellData;
  cellDeg: number;
}

export interface PollenReading {
  slug: AirSlug;
  nom: string;
  value: number;
  level: PollenLevel;
}

export interface AirQuality {
  /** Índice europeo ahora mismo. Es el número que encabeza el bloque. */
  aqi: number | null;
  /** Contaminante que determina el índice: el AQI europeo es el peor subíndice, no una media. */
  driver: { slug: AirSlug; nom: string; value: number } | null;
  pollutants: Array<{ slug: AirSlug; nom: string; curt: string; value: number; unit: string; decimals: number }>;
  pollen: PollenReading[];
  /** Máximo del índice por día, para saber si mañana empeora. */
  daily: Array<{ date: string; max: number; maxHour: string }>;
  /** Serie horaria del índice, para el perfil de las próximas 24 h. */
  hourly: Array<{ time: string; aqi: number | null }>;
  /** Lado de la celda en km, para poder decir a qué resolución es el dato. */
  cellKm: number;
  observedAt: string;
  issuedAt: string;
  source: string;
}

/**
 * Calidad del aire de la celda que contiene esta ubicación.
 *
 * Devuelve la celda de 0,1° porque **esa es la resolución real de CAMS**.
 * Presentar el mismo número como si fuera de este núcleo en concreto sería
 * fingir una precisión de barrio que el modelo no tiene, y aquí eso se dice en
 * la propia página en vez de esconderse.
 */
export async function airQualityFor(loc: Location): Promise<AirQuality | null> {
  if (loc.lat == null || loc.lon == null) return null;
  // Solo su celda. El fichero con las 372 pesa un mega y medio, y una ficha
  // usa una: ver `src/lib/shards.ts`.
  const snap = await snapshot<AirCellShard>(airShard(airCellKey(loc.lat, loc.lon)));
  if (!snap) return null;

  const cell = snap.data.cell;
  if (!cell) return null;

  const times = snap.data.times;
  const i = nowIndex(times);
  const at = (slug: AirSlug, idx = i): number | null => cell.values[slug]?.[idx] ?? null;

  const aqi = at('aqi');

  // El AQI europeo no es una media de contaminantes: es el **peor** de sus
  // subíndices. Decir cuál manda es lo que convierte un número en información
  // accionable — no es lo mismo un 62 por ozono en una tarde de julio que un 62
  // por NO2 en hora punta.
  let driver: AirQuality['driver'] = null;
  for (const sub of SUB_INDICES) {
    const v = at(sub);
    const target = SUB_INDEX_OF[sub];
    if (v == null || !target) continue;
    if (!driver || v > driver.value) {
      driver = { slug: target, nom: AIR_VARIABLES[target].nom.ca, value: v };
    }
  }

  const pollutants = POLLUTANTS
    .map((slug) => {
      const value = at(slug);
      const def = AIR_VARIABLES[slug];
      return value == null ? null : {
        slug, nom: def.nom.ca, curt: def.curt ?? def.nom.ca,
        value, unit: def.unit, decimals: def.decimals,
      };
    })
    .filter((p): p is NonNullable<typeof p> => p != null);

  // El polvo mineral solo se muestra cuando de verdad hay intrusión. Una fila
  // que pone 2 µg/m³ los 300 días que no hay calima no informa de nada y le
  // quita sitio a lo que sí.
  const filteredPollutants = pollutants.filter((p) => p.slug !== 'dust' || p.value >= 10);

  const pollen: PollenReading[] = POLLENS
    .map((slug) => {
      const value = at(slug);
      if (value == null) return null;
      const level = pollenLevel(slug, value);
      return level ? { slug, nom: AIR_VARIABLES[slug].nom.ca, value, level } : null;
    })
    .filter((p): p is PollenReading => p != null)
    .sort((a, b) => b.value - a.value);

  // Máximo diario del índice: la pregunta útil no es cómo está ahora sino si
  // mañana conviene salir a correr.
  const byDay = new Map<string, Array<{ time: string; v: number }>>();
  times.forEach((t, idx) => {
    const v = cell.values.aqi?.[idx];
    if (v == null) return;
    const day = t.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push({ time: t, v });
    byDay.set(day, arr);
  });
  const daily = [...byDay].map(([date, vs]) => {
    const worst = vs.reduce((a, b) => (b.v > a.v ? b : a));
    return { date, max: worst.v, maxHour: worst.time };
  });

  const hourly = times.slice(i, i + 24).map((time, k) => ({ time, aqi: at('aqi', i + k) }));

  return {
    aqi,
    driver,
    pollutants: filteredPollutants,
    pollen,
    daily,
    hourly,
    // 0,1° de latitud son 11,1 km; de longitud, a 41,5° N, unos 8,3. Se da el
    // lado mayor: redondear a la baja vendería más precisión de la que hay.
    cellKm: Math.round(snap.data.cellDeg * 111),
    observedAt: times[i] ?? '',
    issuedAt: snap.fetchedAt,
    source: snap.source,
  };
}

// ── Radar ───────────────────────────────────────────────────────────────────

export interface RadarFrame {
  time: number;
  local: string;
  kind: 'past' | 'nowcast';
}

export interface RadarData {
  frames: RadarFrame[];
  grid: TileGrid;
  colorScheme: number;
  tiles: Array<{ x: number; y: number }>;
}

/**
 * Marcos de radar disponibles. Null mientras el worker no haya corrido nunca.
 *
 * La antigüedad de la última imagen observada se calcula aquí y no en la página:
 * la hora del reloj es un dato, y los datos entran por esta capa.
 */
export async function radar(): Promise<(RadarData & {
  fetchedAt: string;
  source: string;
  /** Minutos desde la última imagen **observada**, no desde el nowcast. */
  ageMin: number | null;
  lastObserved: RadarFrame | null;
}) | null> {
  const snap = await snapshot<RadarData>('radar');
  if (!snap || !snap.data.frames?.length) return null;

  const lastObserved = snap.data.frames.filter((f) => f.kind === 'past').at(-1) ?? null;
  return {
    ...snap.data,
    fetchedAt: snap.fetchedAt,
    source: snap.source,
    lastObserved,
    ageMin: lastObserved ? Math.round((Date.now() - lastObserved.time * 1000) / 60_000) : null,
  };
}

// ── Frescura de las fuentes ─────────────────────────────────────────────────

export interface FreshnessEntry {
  source: string;
  lastSuccessAt: string;
  lastDataTs: string | null;
  stalenessLimitMin: number;
  rows: number;
  apiCalls: number;
  error?: string;
}

/**
 * Estado de cada fuente, para el panel público.
 *
 * Una entrada por worker y no un fichero compartido: dos workers que publiquen
 * a la vez se borraban la entrada el uno al otro, y esta página llegó a decir
 * que los avisos eran de hace diecisiete horas un minuto después de
 * refrescarlos. El porqué está en `src/lib/shards.ts`.
 *
 * Se piden las nueve, y las que no estén salen igualmente: un worker que nunca
 * ha publicado es una cosa que este panel tiene que decir, no callar.
 */
export async function freshness(): Promise<Array<
  FreshnessEntry & { stale: boolean; ageMin: number | null; missing?: true }
>> {
  const entries = await Promise.all(
    FRESHNESS_SOURCES.map(async (source) => ({
      source,
      entry: await plainJson<FreshnessEntry>(freshnessShard(source)),
    })),
  );

  return entries.map(({ source, entry }) => {
    if (!entry) {
      return {
        source,
        lastSuccessAt: '',
        lastDataTs: null,
        stalenessLimitMin: 0,
        rows: 0,
        apiCalls: 0,
        ageMin: null,
        stale: true,
        missing: true as const,
      };
    }
    const ageMin = entry.lastDataTs
      ? Math.round((Date.now() - Date.parse(entry.lastDataTs)) / 60_000)
      : null;
    return { ...entry, ageMin, stale: ageMin != null && ageMin > entry.stalenessLimitMin };
  });
}

export { ALL_VARIABLES, VARIABLES };
