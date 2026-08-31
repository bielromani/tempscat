/**
 * Worker · predicción multi-modelo desde Open-Meteo.
 *
 * ## La restricción que manda sobre el diseño
 *
 * Open-Meteo no cuenta peticiones HTTP: cuenta **ubicaciones**, ponderadas por
 * variables y días. Su regla es que 10 variables × 7 días × 1 ubicación es una
 * llamada. Con nuestras 8 variables y 7 días, cada punto y modelo cuesta 1.
 *
 * Eso significa que refrescar los 3.190 puntos del territorio con 5 modelos
 * cuesta 15.950 unidades — **por encima del límite diario de 10.000, en un solo
 * refresco**. El multi-punto abarata conexiones y latencia, no cuota.
 *
 * La salida no es bajar la resolución espacial (que es justo lo que nos
 * diferencia), sino repartir los modelos por nivel de indexación: consenso
 * completo donde la gente mira, y un solo modelo bien corregido por altitud en
 * la cola larga. Sigue siendo mejor que cualquier competidor para esos núcleos,
 * porque nadie más los corrige.
 *
 * Salida: data/cache/forecast.json
 */
import { readFileSync } from 'node:fs';
import { fetchWithRetry, sleep } from '../lib/http.ts';
import { build } from '../lib/paths.ts';
import { DAILY_LIMITS, QuotaGuard, readSnapshot, recordFreshness, writeSnapshot } from '../lib/store.ts';
import { ALL_VARIABLES, type VariableSlug } from '../../src/lib/variables.ts';

type Tier = 'A' | 'B' | 'C' | 'D';

interface ForecastPoint {
  id: string; lat: number; lon: number; altitud: number | null;
  nLocations: number; tier: Tier;
}

/**
 * Modelos por nivel. Todos verificados sobre Catalunya; `icon_d2` está
 * deliberadamente fuera porque su dominio no llega aquí.
 */
const MODELS_BY_TIER: Record<Tier, string[]> = {
  // Comarcas y municipios grandes: consenso real. ECMWF es el que cubre el
  // horizonte completo; AROME y HARMONIE aportan resolución en las primeras 48 h.
  A: ['meteofrance_arome_france_hd', 'knmi_harmonie_arome_europe', 'ecmwf_ifs025'],

  /*
   * Niveles B y C: `best_match`, la mezcla propia de Open-Meteo.
   *
   * El primer diseño daba AROME-HD al nivel B, por su resolución de 1,5 km. Al
   * verlo renderizado el fallo era evidente: **AROME solo llega a ~48 h**, así
   * que del tercer día en adelante las tarjetas salían vacías. Mil setecientos
   * municipios con media semana en blanco.
   *
   * `best_match` cubre los 7 días y, donde hay AROME, ya lo usa para el corto
   * plazo. No se pierde resolución: se gana horizonte, y por el mismo coste de
   * una unidad por punto.
   */
  B: ['best_match'],
  C: ['best_match'],
  D: [],
};

/** Cada cuántas horas se refresca cada nivel. */
const REFRESH_HOURS: Record<Tier, number> = { A: 6, B: 12, C: 24, D: 0 };

const BATCH = 200;
const FORECAST_DAYS = 7;
/** Espera entre lotes: el límite real que nos frenó fue el de 600/minuto. */
const PAUSE_MS = 21_000;

const HOURLY = ALL_VARIABLES.filter((v) => v.openMeteo && v.slug !== 'snow_depth').map((v) => v.openMeteo!);
const SLUG_BY_OM = new Map(ALL_VARIABLES.filter((v) => v.openMeteo).map((v) => [v.openMeteo!, v.slug]));

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  hourly: Record<string, Array<number | null>> & { time: string[] };
}

/**
 * Serie de un punto y modelo, en formato columnar: los tiempos van una sola vez
 * y cada variable es un array paralelo. En JSON, repetir las claves por hora
 * multiplicaría el tamaño por seis.
 */
export interface PointForecast {
  /** Altitud que asume el modelo. La corrección se hace contra esta, no contra la oficial. */
  modelElevation: number;
  values: Partial<Record<VariableSlug, Array<number | null>>>;
}

export interface ForecastData {
  /** Instantes ISO comunes a todas las series. */
  times: string[];
  /** punto → modelo → serie. */
  points: Record<string, Record<string, PointForecast>>;
  models: string[];
}

async function fetchBatch(points: ForecastPoint[], model: string): Promise<Map<string, PointForecast & { times: string[] }>> {
  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(5)).join(','),
    longitude: points.map((p) => p.lon.toFixed(5)).join(','),
    hourly: HOURLY.join(','),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Madrid',
    // Unidades canónicas nuestras: el viento en m/s como la XEMA. Pedirlo aquí
    // evita conversiones dispersas y, sobre todo, evita compararlo con m/s
    // creyendo que son km/h.
    wind_speed_unit: 'ms',
  });
  if (model !== 'best_match') params.set('models', model);

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  // Open-Meteo emite `nan` sin comillas cuando un punto cae fuera del dominio
  // del modelo, y eso **no es JSON válido**: `JSON.parse` revienta y se pierde
  // el lote entero, incluidos los puntos que sí tenían datos. Se sanea antes de
  // parsear. Pasa de verdad: HARMONIE no cubre toda Catalunya.
  const res0 = await fetchWithRetry(url, { retries: 5, backoffMs: 5_000, timeoutMs: 90_000 });
  const text = (await res0.text()).replace(/:\s*-?nan\b/gi, ':null');
  const data = JSON.parse(text) as OpenMeteoResponse | OpenMeteoResponse[];
  const list = Array.isArray(data) ? data : [data];

  const out = new Map<string, PointForecast & { times: string[] }>();
  list.forEach((res, i) => {
    const point = points[i];
    // Fuera del dominio del modelo: sin latitud no hay serie que guardar.
    if (!point || !res.hourly || res.latitude == null || !Number.isFinite(res.latitude)) return;
    const values: PointForecast['values'] = {};
    for (const [field, series] of Object.entries(res.hourly)) {
      if (field === 'time') continue;
      // Con `models=` en la URL, Open-Meteo sufija el nombre del modelo.
      const base = field.replace(new RegExp(`_${model}$`), '');
      const slug = SLUG_BY_OM.get(base);
      if (!slug) continue;
      values[slug] = (series as Array<number | null>).map((v) =>
        v == null ? null : Math.round(v * 10) / 10);
    }
    out.set(point.id, { modelElevation: res.elevation, values, times: res.hourly.time });
  });
  return out;
}

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const points: ForecastPoint[] = JSON.parse(readFileSync(build('forecast-points.json'), 'utf8'));

  // Qué toca refrescar. Sin estado previo se refresca todo lo que quepa.
  const onlyTiers = (process.argv.find((a) => a.startsWith('--tiers='))?.split('=')[1] ?? 'A,B,C')
    .split(',') as Tier[];

  const plan: Array<{ tier: Tier; model: string; points: ForecastPoint[] }> = [];
  for (const tier of onlyTiers) {
    const tierPoints = points.filter((p) => p.tier === tier);
    if (!tierPoints.length) continue;
    for (const model of MODELS_BY_TIER[tier]) {
      plan.push({ tier, model, points: tierPoints });
    }
  }

  const cost = plan.reduce((s, p) => s + p.points.length, 0);
  console.log('Plan de refresco');
  for (const tier of onlyTiers) {
    const n = points.filter((p) => p.tier === tier).length;
    if (!n) continue;
    console.log(`  ${tier}  ${String(n).padStart(5)} puntos × ${MODELS_BY_TIER[tier].length} modelos = ${String(n * MODELS_BY_TIER[tier].length).padStart(5)} unidades · cada ${REFRESH_HOURS[tier]} h`);
  }
  const daily = onlyTiers.reduce((s, t) => {
    const n = points.filter((p) => p.tier === t).length;
    return s + n * MODELS_BY_TIER[t].length * (24 / (REFRESH_HOURS[t] || 24));
  }, 0);
  console.log(`\nCoste de este refresco: ${cost.toLocaleString('es-ES')} unidades`);
  console.log(`Proyección diaria con estas cadencias: ${Math.round(daily).toLocaleString('es-ES')} / ${DAILY_LIMITS['open-meteo'].toLocaleString('es-ES')}`);

  if (!quota.canSpend('open-meteo', cost)) {
    console.error(`\nCuota insuficiente: ${quota.used('open-meteo')} ya gastadas hoy. Se aborta antes de que la API nos corte.`);
    process.exit(1);
  }
  if (quota.isDegraded('open-meteo')) {
    console.warn('\naviso: por encima del 80 % de la cuota diaria');
  }

  /*
   * Se parte del snapshot anterior, no de cero.
   *
   * Cada nivel se refresca con su propia cadencia (A cada 6 h, B cada 12, C cada
   * 24), así que una ejecución con `--tiers=B` **no puede borrar** lo que trajo
   * la de A hace dos horas. Empezar con `points: {}` lo hacía, y el resultado
   * era que media web se quedaba sin predicción tras cada refresco parcial.
   */
  const previous = readSnapshot<ForecastData>('forecast');
  const refreshedTiers = new Set(onlyTiers);
  const keptPoints: ForecastData['points'] = {};
  if (previous) {
    const tierOf = new Map(points.map((p) => [p.id, p.tier]));
    for (const [pointId, byModel] of Object.entries(previous.data.points)) {
      const tier = tierOf.get(pointId);
      if (tier && !refreshedTiers.has(tier)) keptPoints[pointId] = byModel;
    }
    const nKept = Object.keys(keptPoints).length;
    if (nKept) console.log(`Es conserven ${nKept.toLocaleString('ca-ES')} punts de nivells no refrescats\n`);
  }

  const result: ForecastData = {
    times: previous?.data.times ?? [],
    points: keptPoints,
    models: [...new Set([...(previous?.data.models ?? []), ...plan.map((p) => p.model)])],
  };
  let batches = 0;
  let ok = 0;
  let failed = 0;
  /** Lotes que se cayeron. Se reintentan al final, cuando el pico haya pasado. */
  const retryQueue: Array<{ model: string; points: ForecastPoint[] }> = [];
  /** Cuántos puntos se pidieron de cada modelo, para calcular bien la cobertura. */
  const requested = new Map<string, number>();
  for (const step of plan) requested.set(step.model, (requested.get(step.model) ?? 0) + step.points.length);

  const totalBatches = plan.reduce((s, p) => s + Math.ceil(p.points.length / BATCH), 0);
  console.log(`\nLotes: ${totalBatches} · ritmo ${PAUSE_MS / 1000} s · ~${Math.ceil((totalBatches * PAUSE_MS) / 60_000)} min\n`);

  for (const step of plan) {
    for (let i = 0; i < step.points.length; i += BATCH) {
      const chunk = step.points.slice(i, i + BATCH);
      try {
        const res = await fetchBatch(chunk, step.model);
        for (const [pointId, fc] of res) {
          if (!result.times.length) result.times = fc.times;
          result.points[pointId] ??= {};
          result.points[pointId][step.model] = { modelElevation: fc.modelElevation, values: fc.values };
          ok++;
        }
        quota.spend('open-meteo', chunk.length);
      } catch (err) {
        // Un lote caído no debe tumbar el refresco entero: se encola y se sigue.
        failed += chunk.length;
        retryQueue.push({ model: step.model, points: chunk });
        console.warn(`\n  lote encolat per reintentar (${step.model}, ${chunk.length} punts): ${String(err).slice(0, 100)}`);
      }
      batches++;
      process.stdout.write(`\r  ${batches}/${totalBatches} lotes · ${ok.toLocaleString('es-ES')} series${failed ? ` · ${failed} fallidas` : ''}   `);
      if (batches < totalBatches) await sleep(PAUSE_MS);
    }
  }
  process.stdout.write('\n');

  // Segunda oportunidad para lo que falló. Los cortes de estas APIs suelen ser
  // transitorios, y dejar 200 puntos sin predicción durante seis horas por un
  // timeout no es aceptable cuando recuperarlos cuesta un minuto.
  if (retryQueue.length) {
    console.log(`\nReintentant ${retryQueue.length} lots caiguts…`);
    for (const item of retryQueue) {
      await sleep(PAUSE_MS);
      try {
        const res = await fetchBatch(item.points, item.model);
        for (const [pointId, fc] of res) {
          if (!result.times.length) result.times = fc.times;
          result.points[pointId] ??= {};
          result.points[pointId][item.model] = { modelElevation: fc.modelElevation, values: fc.values };
          ok++;
          failed--;
        }
        quota.spend('open-meteo', item.points.length);
        console.log(`  recuperat: ${item.model} (${res.size} punts)`);
      } catch (err) {
        console.warn(`  irrecuperable: ${item.model} — ${String(err).slice(0, 100)}`);
      }
    }
  }

  // Cobertura por modelo: HARMONIE no llega a todo el territorio, y eso cambia
  // cuántos modelos entran en el consenso de cada punto. Hay que saberlo, no
  // descubrirlo cuando una página muestre menos modelos de los prometidos.
  const perModel = new Map<string, number>();
  for (const byModel of Object.values(result.points)) {
    for (const m of Object.keys(byModel)) perModel.set(m, (perModel.get(m) ?? 0) + 1);
  }
  console.log('\n' + 'Cobertura por modelo (sobre los puntos que se le pidieron):');
  for (const m of result.models) {
    const n = perModel.get(m) ?? 0;
    const asked = requested.get(m) ?? 0;
    if (asked === 0) {
      // Modelo que viene del snapshot anterior: en esta ejecución no se ha
      // pedido, así que dividir por lo pedido daría un "/ 0" sin sentido.
      console.log(`  ${m.padEnd(30)} ${String(n).padStart(5)}          (conservat del refresc anterior)`);
      continue;
    }
    const missing = asked - n;
    console.log(`  ${m.padEnd(30)} ${String(n).padStart(5)} / ${String(asked).padStart(5)}${missing > 0 ? `  (${missing} sense dades: fora de domini o lot perdut)` : ''}`);
  }
  const nModels = Object.values(result.points).map((b) => Object.keys(b).length);
  const dist = nModels.reduce((a, n) => { a[n] = (a[n] ?? 0) + 1; return a; }, {} as Record<number, number>);
  console.log(`  modelos por punto: ${Object.entries(dist).map(([k, v]) => k + ' modelos → ' + v + ' puntos').join(' · ')}`);

  const covered = Object.keys(result.points).length;
  // El denominador es el territorio entero, no solo lo refrescado ahora: lo que
  // importa saber es si alguna parte del mapa se ha quedado sin predicción.
  const refreshedNow = points.filter((p) => onlyTiers.includes(p.tier)).length;
  console.log(`\nPunts amb predicció: ${covered.toLocaleString('ca-ES')} / ${points.length.toLocaleString('ca-ES')} del territori`);
  console.log(`  refrescats en aquesta execució: ${refreshedNow.toLocaleString('ca-ES')} (nivells ${onlyTiers.join(', ')})`);
  console.log(`Horizonte: ${result.times.length} horas (${result.times[0]} → ${result.times[result.times.length - 1]})`);
  console.log(`Modelos: ${result.models.join(', ')}`);

  writeSnapshot('forecast', 'Open-Meteo · CC-BY 4.0', result, result.times[0] ?? null);
  recordFreshness({
    source: 'forecast-refresh',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: result.times[0] ?? null,
    stalenessLimitMin: 60 * 8,
    rows: ok,
    apiCalls: batches,
  });

  console.log(`\n${quota.report()}`);
  console.log(`→ data/cache/forecast.json (${((Date.now() - started) / 1000 / 60).toFixed(1)} min)`);
}

main().catch((err) => {
  recordFreshness({
    source: 'forecast-refresh', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 8, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
