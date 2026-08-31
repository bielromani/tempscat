import 'server-only';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_VARIABLES, VARIABLES, apparentTemperature, meanDirection,
  type VariableSlug,
} from './variables';
import { moonPhase, nextMoonEvents, sunTimes } from './astronomy';
import { consensusCode, dailySummaryCode } from './weather-codes';
import type { Location } from './territory';

/**
 * Observación y predicción para una ubicación.
 *
 * Lee únicamente lo que han dejado los workers en `data/cache/`. Ninguna
 * petición de un usuario dispara jamás una llamada a una API externa: es el
 * principio rector de la arquitectura, y es lo que mantiene la cuota bajo
 * control y la latencia predecible.
 */

const CACHE = join(process.cwd(), 'data', 'cache');

interface Snapshot<T> { fetchedAt: string; dataTs: string | null; source: string; data: T }

/*
 * Los snapshots se memorizan por proceso y se revalidan por `mtime`.
 *
 * Sin esto, `forecast.json` —22 MB— se leía y parseaba **en cada render de
 * página**. Con 4.293 rutas generándose bajo demanda eso son minutos de CPU
 * tirados y un TTFB imposible de defender. El fichero solo cambia cuando corre
 * un worker, así que comprobar la fecha de modificación basta y cuesta
 * microsegundos.
 */
const memo = new Map<string, { mtimeMs: number; snap: Snapshot<unknown> }>();

function snapshot<T>(name: string): Snapshot<T> | null {
  const p = join(CACHE, `${name}.json`);
  if (!existsSync(p)) return null;
  try {
    const { mtimeMs } = statSync(p);
    const cached = memo.get(name);
    if (cached && cached.mtimeMs === mtimeMs) return cached.snap as Snapshot<T>;

    const snap = JSON.parse(readFileSync(p, 'utf8')) as Snapshot<T>;
    memo.set(name, { mtimeMs, snap: snap as Snapshot<unknown> });
    return snap;
  } catch {
    return null;
  }
}

// ── Observación ─────────────────────────────────────────────────────────────

interface RawObservation {
  station: string;
  ts: string;
  ageMin: number;
  values: Partial<Record<VariableSlug, { value: number; ts: string; provisional: boolean }>>;
  precip24h?: number;
}

export interface CurrentConditions {
  /** Estación de la que sale el dato. Se muestra siempre: es la licencia y la confianza. */
  station: { codi: string; nom: string; distKm: number; dAltM: number | null };
  /** Cuándo se tomó la lectura, no cuándo la pedimos nosotros. */
  observedAt: string;
  ageMin: number;
  /** El Meteocat valida las lecturas a posteriori: las recientes son provisionales. */
  provisional: boolean;
  temperature: number | null;
  /** Corregida por el desnivel entre la estación y esta ubicación. */
  temperatureAdjusted: number | null;
  apparent: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  pressure: number | null;
  precip24h: number | null;
  source: string;
}

/** Gradiente térmico estándar en atmósfera bien mezclada, °C por metro. */
const LAPSE_RATE = 0.0065;

export function currentFor(loc: Location): CurrentConditions | null {
  const snap = snapshot<RawObservation[]>('xema-current');
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
    source: snap.source,
  };
}

// ── Predicción ──────────────────────────────────────────────────────────────

interface PointForecast {
  modelElevation: number;
  values: Partial<Record<VariableSlug, Array<number | null>>>;
}
interface ForecastData {
  times: string[];
  points: Record<string, Record<string, PointForecast>>;
  models: string[];
}

export interface HourlyPoint {
  time: string;
  temperature: number | null;
  apparent: number | null;
  precipitation: number | null;
  /** Probabilidad del propio Open-Meteo, mejor que contar modelos. */
  precipProbability: number | null;
  weatherCode: number | null;
  cloudCover: number | null;
  humidity: number | null;
  dewPoint: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  uvIndex: number | null;
  visibility: number | null;
  /** Isocero, m. Con ella sale la cota de nieve. */
  freezingLevel: number | null;
  snowfall: number | null;
  cape: number | null;
  /** El sol está por encima del horizonte: decide sol o luna en el icono. */
  isDay: boolean;
  /** Desacuerdo entre modelos, °C. Null cuando solo hay uno. */
  spread: number | null;
}

export interface DailyPoint {
  date: string;
  tMax: number | null;
  tMin: number | null;
  /** Código del fenómeno más severo del día, no el más frecuente. */
  weatherCode: number | null;
  precipitation: number;
  precipProbability: number;
  /** Horas con precipitación apreciable. */
  precipHours: number;
  snowfall: number;
  windMax: number | null;
  gustMax: number | null;
  windDirection: number | null;
  uvMax: number | null;
  /** Cota de nieve estimada, m. Solo si se espera nieve. */
  snowLevel: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface LocationForecast {
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  models: string[];
  /** Cuántos modelos entran realmente en este punto. */
  nModels: number;
  /** Diferencia de altitud aplicada respecto a la orografía del modelo. */
  altitudeCorrectionM: number | null;
  issuedAt: string;
  source: string;
  /**
   * `false` mientras no exista el motor de verificación de la fase 4: hoy los
   * modelos pesan lo mismo. Decirlo evita prometer una precisión no demostrada.
   */
  skillWeighted: boolean;
}

/** Mediana, que en precipitación es lo correcto: la media inventa valores que ningún modelo predice. */
function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

/**
 * ¿Es de día en esa ubicación a esa hora local?
 *
 * El orto y el ocaso se memorizan por día y ubicación: sin caché se recalculan
 * 168 veces por página para los siete mismos días.
 */
const sunCache = new Map<string, ReturnType<typeof sunTimes>>();

function isDaytime(loc: Location, isoLocal: string): boolean {
  if (loc.lat == null || loc.lon == null) return true;
  const hour = Number(isoLocal.slice(11, 13));
  const day = isoLocal.slice(0, 10);
  const key = `${loc.id}:${day}`;
  let t = sunCache.get(key);
  if (!t) {
    t = sunTimes(new Date(`${day}T12:00:00Z`), loc.lat, loc.lon);
    sunCache.set(key, t);
  }
  if (!t.sunrise || !t.sunset) return hour >= 8 && hour < 20;
  // Las horas de la serie vienen en hora local de Madrid, así que se comparan
  // con el orto y el ocaso expresados en la misma zona.
  const local = (d: Date) => Number(
    d.toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).slice(0, 2),
  );
  return hour >= local(t.sunrise) && hour < local(t.sunset);
}

/**
 * Cota de nieve estimada a partir de la isocero.
 *
 * No coinciden: con precipitación, la fusión de los copos enfría la capa de
 * aire que atraviesan y la nieve cuaja **entre 200 y 300 m por debajo** del
 * nivel de congelación teórico. Dar la isocero como cota de nieve es el error
 * clásico, y hace que la gente suba a buscar nieve donde no la hay.
 */
function snowLevelFrom(hours: HourlyPoint[]): number | null {
  const levels = hours.map((h) => h.freezingLevel).filter((v): v is number => v != null);
  if (!levels.length) return null;
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return Math.round((mean - 250) / 50) * 50;
}

export function forecastFor(loc: Location, hours = 168): LocationForecast | null {
  const snap = snapshot<ForecastData>('forecast');
  if (!snap || !loc.forecastPointId) return null;
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

  const hourly: HourlyPoint[] = times.map((time, i) => {
    /** Valores de todos los modelos que tienen esta variable a esta hora. */
    const pick = (slug: VariableSlug): number[] =>
      models.map((m) => byModel[m].values[slug]?.[i]).filter((v): v is number => v != null);

    /** Media entre modelos; para variables que solo tiene uno, ese valor. */
    const mean = (slug: VariableSlug, decimals = 1): number | null => {
      const xs = pick(slug);
      if (!xs.length) return null;
      const f = 10 ** decimals;
      return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * f) / f;
    };

    const temps = pick('temperature');
    const precs = pick('precipitation');
    const wet = precs.filter((p) => p >= 0.1);

    // La probabilidad la da Open-Meteo. Si no viene (modelos que no la
    // publican), se cae al recuento de modelos que dan lluvia, que es un
    // sustituto pobre pero honesto — y se prefiere la primera cuando existe.
    const ownProb = pick('precipitation_probability');
    const probability = ownProb.length
      ? Math.round(ownProb.reduce((a, b) => a + b, 0) / ownProb.length)
      : precs.length ? Math.round((wet.length / precs.length) * 100) : null;

    const codes = pick('weather_code');

    return {
      time,
      temperature: temps.length
        ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length + tempCorrection) * 10) / 10
        : null,
      apparent: (() => {
        const a = mean('apparent_temperature');
        return a != null ? Math.round((a + tempCorrection) * 10) / 10 : null;
      })(),
      // Cantidad: mediana de los modelos que sí dan lluvia. Promediar 20 mm y
      // 0 mm da 10 mm, un valor que ningún modelo considera probable.
      precipitation: wet.length ? median(wet) : 0,
      precipProbability: probability,
      // Consenso entre modelos, no el peor de ellos.
      //
      // Dos errores encadenados aquí. El primero: quedarse con el máximo
      // numérico, que en la tabla WMO pone la boira (45) por encima del cel
      // cobert (3) y pintaba niebla en días de 32 °C. El segundo, más sutil:
      // corregirlo cogiendo el más severo hacía la predicción sistemáticamente
      // más sombría que cualquiera de los modelos por separado — si uno de tres
      // ve niebla, la página veía niebla.
      //
      // Lo correcto es lo que dice la mayoría, con la severidad solo como
      // desempate.
      weatherCode: consensusCode(codes),
      cloudCover: mean('cloud_cover', 0),
      humidity: mean('humidity', 0),
      dewPoint: (() => {
        const d = mean('dew_point');
        return d != null ? Math.round((d + tempCorrection) * 10) / 10 : null;
      })(),
      pressure: mean('pressure'),
      windSpeed: mean('wind_speed'),
      windDirection: (() => {
        const dirs = pick('wind_direction');
        return dirs.length ? Math.round(meanDirection(dirs) ?? 0) : null;
      })(),
      windGust: (() => { const g = pick('wind_gust'); return g.length ? Math.max(...g) : null; })(),
      uvIndex: mean('uv_index', 0),
      visibility: mean('visibility', 0),
      freezingLevel: mean('freezing_level', 0),
      snowfall: mean('snowfall'),
      cape: mean('cape', 0),
      isDay: isDaytime(loc, time),
      spread: temps.length > 1 ? Math.round((stdev(temps) ?? 0) * 10) / 10 : null,
    };
  });

  // Agregado diario en hora local, no UTC: "la máxima de mañana" es la del día
  // natural de quien lo lee.
  const byDay = new Map<string, HourlyPoint[]>();
  for (const h of hourly) {
    const day = h.time.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(h);
    byDay.set(day, arr);
  }

  const daily: DailyPoint[] = [...byDay]
    // Un día sin ninguna hora con temperatura no es un día "sin datos" que haya
    // que dibujar en gris: es un día que el modelo no alcanza. Mostrarlo vacío
    // parece un error del sitio, no un límite del horizonte de predicción.
    .filter(([, hs]) => hs.some((h) => h.temperature != null))
    .map(([date, hs]) => {
      const nums = (get: (h: HourlyPoint) => number | null): number[] =>
        hs.map(get).filter((v): v is number => v != null);

      const temps = nums((h) => h.temperature);
      const winds = nums((h) => h.windSpeed);
      const gusts = nums((h) => h.windGust);
      const probs = nums((h) => h.precipProbability);
      const uvs = nums((h) => h.uvIndex);
      const codes = nums((h) => h.weatherCode);
      const dirs = nums((h) => h.windDirection);

      const snowHours = hs.filter((h) => (h.snowfall ?? 0) > 0);
      // Solo orto y ocaso. Llamar aquí a  calculaba además las
      // próximas fases lunares —una búsqueda de casi mil iteraciones— siete
      // veces por página. El build pasó de 7 s a 42 s por eso.
      const sun = loc.lat != null && loc.lon != null
        ? sunTimes(new Date(`${date}T12:00:00Z`), loc.lat, loc.lon)
        : null;

      return {
        date,
        tMax: temps.length ? Math.max(...temps) : null,
        tMin: temps.length ? Math.min(...temps) : null,
        // Resumen de día, no de hora: ver dailySummaryCode.
        weatherCode: (() => {
          const c = dailySummaryCode(hs.map((h) => ({ code: h.weatherCode, isDay: h.isDay }))).code;
          // El código desconocido es -1, que es truthy: sin esta comprobación
          // llegaba a la tarjeta y pintaba "Sense dades" en días con datos.
          return c >= 0 ? c : null;
        })(),
        precipitation: Math.round(hs.reduce((s2, h) => s2 + (h.precipitation ?? 0), 0) * 10) / 10,
        precipProbability: probs.length ? Math.max(...probs) : 0,
        precipHours: hs.filter((h) => (h.precipitation ?? 0) >= 0.1).length,
        snowfall: Math.round(hs.reduce((s2, h) => s2 + (h.snowfall ?? 0), 0) * 10) / 10,
        windMax: winds.length ? Math.max(...winds) : null,
        gustMax: gusts.length ? Math.max(...gusts) : null,
        windDirection: dirs.length ? Math.round(meanDirection(dirs) ?? 0) : null,
        uvMax: uvs.length ? Math.max(...uvs) : null,
        snowLevel: snowHours.length ? snowLevelFrom(snowHours) : null,
        sunrise: sun?.sunrise?.toISOString() ?? null,
        sunset: sun?.sunset?.toISOString() ?? null,
      };
    });

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
export function warningsFor(loc: Location): Warning[] {
  const snap = snapshot<Warning[]>('warnings');
  if (!snap) return [];
  const now = Date.now();
  return snap.data
    .filter((w) => w.locationIds.includes(loc.id) && Date.parse(w.expires) > now)
    .sort((a, b) => LEVEL_RANK[b.level] - LEVEL_RANK[a.level]);
}

const LEVEL_RANK: Record<WarningLevel, number> = { verd: 0, groc: 1, taronja: 2, vermell: 3 };

/** Todos los avisos vigentes, para la portada y la página de comarca. */
export function activeWarnings(): Warning[] {
  const snap = snapshot<Warning[]>('warnings');
  if (!snap) return [];
  const now = Date.now();
  return snap.data.filter((w) => Date.parse(w.expires) > now);
}

// ── Histórico y clima de la estación de referencia ──────────────────────────

export interface StationHistory {
  station: string;
  daily: Array<{
    day: string; tMax: number | null; tMin: number | null; tMean: number | null;
    tRange: number | null; rhMean: number | null; precip: number | null;
    precipMax1h: number | null; gust: number | null; pressure: number | null; solar: number | null;
  }>;
  records: {
    tMaxAbs: { value: number; date: string; hour?: string } | null;
    tMinAbs: { value: number; date: string; hour?: string } | null;
    precipMaxDay: { value: number; date: string } | null;
    precipMax1h: { value: number; date: string } | null;
    gustMax: { value: number; date: string; hour?: string } | null;
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
}

/** Histórico de la estación de referencia de una ubicación. */
export function historyFor(loc: Location): StationHistory | null {
  if (!loc.stationRef) return null;
  const snap = snapshot<StationHistory[]>('xema-history');
  return snap?.data.find((h) => h.station === loc.stationRef!.codi) ?? null;
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
}

/**
 * Sol y luna del día para esta ubicación. Se calcula, no se pide: es exacto,
 * gratis y da fase lunar y crepúsculos, que ninguna API meteorológica ofrece.
 */
export function astronomyFor(loc: Location, date = new Date()): Astronomy | null {
  if (loc.lat == null || loc.lon == null) return null;
  const t = sunTimes(date, loc.lat, loc.lon);
  const events = nextMoonEvents(date);
  return {
    ...t,
    moon: moonPhase(date),
    nextNewMoon: events.newMoon,
    nextFullMoon: events.fullMoon,
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

/** Estado de cada fuente, para el panel público. */
export function freshness(): Array<FreshnessEntry & { stale: boolean; ageMin: number | null }> {
  const p = join(CACHE, 'freshness.json');
  if (!existsSync(p)) return [];
  const all: Record<string, FreshnessEntry> = JSON.parse(readFileSync(p, 'utf8'));
  return Object.values(all).map((e) => {
    const ageMin = e.lastDataTs ? Math.round((Date.now() - Date.parse(e.lastDataTs)) / 60_000) : null;
    return { ...e, ageMin, stale: ageMin != null && ageMin > e.stalenessLimitMin };
  });
}

export { ALL_VARIABLES, VARIABLES };
