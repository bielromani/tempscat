import 'server-only';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import {
  ALL_VARIABLES, VARIABLES, apparentTemperature, meanDirection,
  type VariableSlug,
} from './variables';
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
  precipitation: number | null;
  precipProbability: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  humidity: number | null;
  /** Desacuerdo entre modelos, °C. Null cuando solo hay uno. */
  spread: number | null;
}

export interface DailyPoint {
  date: string;
  tMax: number | null;
  tMin: number | null;
  precipitation: number;
  /** Fracción de modelos y horas que dan lluvia apreciable. */
  precipProbability: number;
  windMax: number | null;
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
    const pick = (slug: VariableSlug): number[] =>
      models.map((m) => byModel[m].values[slug]?.[i]).filter((v): v is number => v != null);

    const temps = pick('temperature');
    const precs = pick('precipitation');
    const winds = pick('wind_speed');
    const dirs = pick('wind_direction');

    const wet = precs.filter((p) => p >= 0.1).length;

    return {
      time,
      temperature: temps.length
        ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length + tempCorrection) * 10) / 10
        : null,
      // Cantidad: mediana de los modelos que sí dan lluvia. Promediar 20 mm y
      // 0 mm da 10 mm, un valor que ningún modelo considera probable.
      precipitation: wet ? median(precs.filter((p) => p >= 0.1)) : 0,
      precipProbability: precs.length ? Math.round((wet / precs.length) * 100) : null,
      windSpeed: winds.length ? Math.round((winds.reduce((a, b) => a + b, 0) / winds.length) * 10) / 10 : null,
      windDirection: dirs.length ? Math.round(meanDirection(dirs) ?? 0) : null,
      windGust: (() => { const g = pick('wind_gust'); return g.length ? Math.max(...g) : null; })(),
      humidity: (() => { const h = pick('humidity'); return h.length ? Math.round(h.reduce((a, b) => a + b, 0) / h.length) : null; })(),
      spread: temps.length > 1 ? Math.round((stdev(temps) ?? 0) * 10) / 10 : null,
    };
  });

  // Agregado diario en hora local, no UTC: "la máxima de mañana" es del día
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
    const temps = hs.map((h) => h.temperature).filter((v): v is number => v != null);
    const winds = hs.map((h) => h.windSpeed).filter((v): v is number => v != null);
    const probs = hs.map((h) => h.precipProbability).filter((v): v is number => v != null);
    return {
      date,
      tMax: temps.length ? Math.max(...temps) : null,
      tMin: temps.length ? Math.min(...temps) : null,
      precipitation: Math.round(hs.reduce((s, h) => s + (h.precipitation ?? 0), 0) * 10) / 10,
      precipProbability: probs.length ? Math.max(...probs) : 0,
      windMax: winds.length ? Math.max(...winds) : null,
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
