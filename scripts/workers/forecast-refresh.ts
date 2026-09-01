/**
 * Worker · predicción multi-modelo desde Open-Meteo.
 *
 * ## La restricción que manda sobre el diseño
 *
 * Open-Meteo no cuenta peticiones HTTP: cuenta **datos**. Su fórmula, tomada de
 * su propia página de precios, es
 *
 *     peso = max(1, variables / 10) × max(1, días / 14) × ubicaciones
 *
 * fraccional, no por escalones. Y el techo que aprieta no es el diario (10.000)
 * sino el **mensual (300.000)**, que sale a 9.677/día de media.
 *
 * Consecuencias que condicionan todo:
 *
 *  · Pedir 19 variables en vez de 10 casi duplica el coste de cada punto.
 *  · El multi-punto abarata conexiones y latencia, **no cuota**.
 *  · El orto, el ocaso y la fase lunar no se piden: se calculan en
 *    `src/lib/astronomy.ts`, exactos y gratis.
 *
 * ## El límite que corta primero no es el diario
 *
 * Hay tres techos simultáneos: 600/minuto, **5.000/hora** y 10.000/día. En un
 * refresco masivo el que salta es el horario, y su síntoma engaña: los lotes
 * fallan con lo que parece un corte de red, se reintentan seis veces, y siguen
 * fallando porque el límite no se ha renovado.
 *
 * Con lotes de 200 puntos y 19 variables —380 unidades cada uno— a un lote cada
 * 21 segundos salen 65.000 unidades por hora: trece veces el techo. Por eso el
 * ritmo **se deriva del coste** y no es un intervalo fijo.
 *
 * Salida: data/cache/forecast/ — un fichero por comarca y un índice
 */
import { existsSync, rmSync, statSync } from 'node:fs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchWithRetry, sleep } from '../lib/http.ts';
import { build } from '../lib/paths.ts';
import {
  CACHE, DAILY_LIMITS, HOURLY_LIMITS, MONTHLY_LIMITS, QuotaGuard, publish, publishQuota, readSnapshot, recordFreshness, syncState, writeSnapshot,
} from '../lib/store.ts';
import {
  FORECAST_INDEX, forecastShard, type ForecastIndex,
} from '../../src/lib/forecast-shards.ts';
import {
  VARIABLES, ESSENTIAL_HOURLY, RICH_HOURLY, callWeight, type VariableSlug,
} from '../../src/lib/variables.ts';

type Tier = 'A' | 'B' | 'C' | 'D';

interface ForecastPoint {
  /** Comarcas que consultan este punto, para saber en qué trozo se guarda. */
  comarques: string[];
  id: string; lat: number; lon: number; altitud: number | null;
  nLocations: number; tier: Tier;
}

interface ModelSpec {
  model: string;
  variables: VariableSlug[];
  /** Cada cuántas horas conviene refrescar esta combinación. */
  everyHours: number;
}

/**
 * Qué se pide para cada nivel.
 *
 * `best_match` es la mezcla propia de Open-Meteo: elige el mejor modelo
 * disponible por horizonte y cubre los 7 días completos. Es el que trae las
 * variables ricas. AROME y ECMWF se piden aparte, solo con lo esencial, para
 * que el consenso y la banda de incertidumbre salgan de modelos de verdad.
 *
 * AROME solo llega a ~48 h: de ahí en adelante manda `best_match`. Confiarle a
 * AROME la serie entera dejaba media semana en blanco, y se vio al renderizar,
 * no en los registros.
 */
const PLAN_BY_TIER: Record<Tier, ModelSpec[]> = {
  A: [
    { model: 'best_match', variables: RICH_HOURLY, everyHours: 12 },
    { model: 'meteofrance_arome_france_hd', variables: ESSENTIAL_HOURLY, everyHours: 8 },
    { model: 'ecmwf_ifs025', variables: ESSENTIAL_HOURLY, everyHours: 8 },
  ],

  /*
   * B y C también reciben el conjunto rico, aunque solo una vez al día.
   *
   * El primer reparto les daba el esencial dos veces al día. Al ver una página
   * de núcleo terminada quedó claro que era el intercambio equivocado: le
   * faltaban índice UV, punto de rocío, nubosidad y visibilidad —justo lo que
   * hace rica una ficha— a cambio de refrescar más a menudo una predicción que
   * apenas cambia en doce horas.
   *
   * Lo que da sensación de "vivo" en la página no es la predicción: es la
   * observación de la XEMA, que entra cada diez minutos por otra vía.
   */
  B: [{ model: 'best_match', variables: RICH_HOURLY, everyHours: 24 }],
  C: [{ model: 'best_match', variables: RICH_HOURLY, everyHours: 24 }],
  D: [],
};

const BATCH = 200;
const FORECAST_DAYS = 7;
/** Pausa mínima entre lotes, por el límite de 600 unidades por minuto. */
const MIN_PAUSE_MS = 21_000;

interface OpenMeteoResponse {
  latitude: number;
  longitude: number;
  elevation: number;
  hourly: Record<string, Array<number | null>> & { time: string[] };
}

export interface PointForecast {
  /** Altitud que asume el modelo. La corrección se hace contra esta, no contra la oficial. */
  modelElevation: number;
  values: Partial<Record<VariableSlug, Array<number | null>>>;
}

export interface ForecastData {
  times: string[];
  points: Record<string, Record<string, PointForecast>>;
  models: string[];
}

/* ── La predicción, partida por comarca ──────────────────────────────────────
 *
 * El worker sigue trabajando con el territorio entero en memoria —tiene que
 * hacerlo: fusiona lo que trae este refresco con lo que quedó del anterior— y
 * solo al final lo reparte en 43 ficheros.
 *
 * El motivo está escrito en `src/lib/forecast-shards.ts`: un arranque en frío
 * de la aplicación parseaba 42 MB para responder con un punto de 3.190.
 */

/**
 * Reúne los trozos en el objeto único con el que trabaja el worker.
 *
 * Los puntos de frontera están en dos ficheros y se sobrescriben con el mismo
 * contenido, que es exactamente lo que se quiere.
 */
function readForecast(): { data: ForecastData } | null {
  const index = readSnapshot<ForecastIndex>(FORECAST_INDEX);
  if (!index) return null;

  const points: ForecastData['points'] = {};
  let missing = 0;
  for (const c of index.data.comarques) {
    const shard = readSnapshot<ForecastData>(forecastShard(c.codi));
    if (!shard) { missing++; continue; }
    Object.assign(points, shard.data.points);
  }
  if (missing) console.warn(`avís: ${missing} trossos de predicció il·legibles; es tornaran a demanar`);

  return { data: { times: index.data.times, points, models: index.data.models } };
}

/**
 * Escribe la predicción en un fichero por comarca más un índice.
 *
 * El índice va **el último** a propósito: es el que dice qué trozos existen, y
 * mientras no esté escrito la aplicación sigue leyendo los de la vuelta
 * anterior en vez de una mezcla de las dos.
 */
function writeForecast(
  result: ForecastData,
  points: ForecastPoint[],
  source: string,
): { shards: number; bytes: number; largest: number } {
  const comarquesOf = new Map(points.map((p) => [p.id, p.comarques]));

  const byComarca = new Map<string, ForecastData['points']>();
  for (const [id, byModel] of Object.entries(result.points)) {
    // Un punto sin comarca es un punto que ya no está en el territorio: la
    // celda se movió en un rebuild. No se guarda en ninguna parte, que es la
    // manera de que no se quede ahí para siempre.
    for (const codi of comarquesOf.get(id) ?? []) {
      const bucket = byComarca.get(codi) ?? {};
      bucket[id] = byModel;
      byComarca.set(codi, bucket);
    }
  }

  const entries: ForecastIndex['comarques'] = [];
  let bytes = 0;
  for (const [codi, bucket] of [...byComarca].sort((a, b) => a[0].localeCompare(b[0]))) {
    const name = forecastShard(codi);
    writeSnapshot(
      name, source,
      { times: result.times, points: bucket, models: result.models } satisfies ForecastData,
      result.times[0] ?? null,
    );
    const size = statSync(join(CACHE, `${name}.json`)).size;
    bytes += size;
    entries.push({ codi, points: Object.keys(bucket).length, bytes: size });
  }

  writeSnapshot(
    FORECAST_INDEX, source,
    {
      times: result.times,
      models: result.models,
      points: Object.keys(result.points).length,
      comarques: entries,
    } satisfies ForecastIndex,
    result.times[0] ?? null,
  );

  // El monolito de la versión anterior. Si se queda no rompe nada —ya no lo lee
  // nadie— y eso es justo el problema: 42 MB de predicción caducada durmiendo
  // en el disco y viajando en el paquete de despliegue.
  const legacy = join(CACHE, 'forecast.json');
  if (existsSync(legacy)) {
    rmSync(legacy);
    console.log("S'ha esborrat el forecast.json antic: la predicció ara va per comarques.");
  }

  return {
    shards: entries.length,
    bytes,
    largest: entries.reduce((m, e) => Math.max(m, e.bytes), 0),
  };
}

/** Variables que no admiten redondeo a un decimal sin perder sentido. */
const INTEGER_VARS = new Set<VariableSlug>([
  'weather_code', 'visibility', 'freezing_level', 'cape', 'cloud_cover',
  'humidity', 'precipitation_probability', 'uv_index', 'solar_radiation', 'wind_direction',
]);

async function fetchBatch(
  points: ForecastPoint[],
  spec: ModelSpec,
): Promise<Map<string, PointForecast & { times: string[] }>> {
  const fields = spec.variables
    .map((v) => VARIABLES[v].openMeteo)
    .filter((x): x is string => !!x);
  const slugByField = new Map(
    spec.variables
      .filter((v) => VARIABLES[v].openMeteo)
      .map((v) => [VARIABLES[v].openMeteo!, v]),
  );

  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(5)).join(','),
    longitude: points.map((p) => p.lon.toFixed(5)).join(','),
    hourly: fields.join(','),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Madrid',
    // Viento en m/s, como la XEMA. Pedirlo aquí evita conversiones dispersas y,
    // sobre todo, evita comparar m/s creyendo que son km/h.
    wind_speed_unit: 'ms',
  });
  if (spec.model !== 'best_match') params.set('models', spec.model);

  const url = `https://api.open-meteo.com/v1/forecast?${params}`;

  // Open-Meteo emite `nan` sin comillas cuando un punto cae fuera del dominio
  // del modelo, y eso **no es JSON válido**: sin sanear, `JSON.parse` tumba el
  // lote entero, incluidos los puntos que sí tenían datos.
  const res = await fetchWithRetry(url, { retries: 5, backoffMs: 5_000, timeoutMs: 90_000 });
  const text = (await res.text()).replace(/:\s*-?nan\b/gi, ':null');
  const data = JSON.parse(text) as OpenMeteoResponse | OpenMeteoResponse[];
  const list = Array.isArray(data) ? data : [data];

  const out = new Map<string, PointForecast & { times: string[] }>();
  list.forEach((r, i) => {
    const point = points[i];
    if (!point || !r.hourly || !Number.isFinite(r.latitude)) return;

    const values: PointForecast['values'] = {};
    for (const [field, series] of Object.entries(r.hourly)) {
      if (field === 'time') continue;
      // Con `models=` en la URL, Open-Meteo sufija el nombre del modelo.
      const base = field.replace(new RegExp(`_${spec.model}$`), '');
      const slug = slugByField.get(base);
      if (!slug) continue;
      const round = INTEGER_VARS.has(slug) ? 1 : 10;
      values[slug] = (series as Array<number | null>).map((v) =>
        v == null ? null : Math.round(v * round) / round);
    }
    out.set(point.id, { modelElevation: r.elevation, values, times: r.hourly.time });
  });
  return out;
}

async function main() {
  // El comptador de quota i el registre de frescor viuen al magatzem:
  // sense això, cada execució automàtica començaria de zero i en
  // publicaria un amb una sola entrada. Abans de construir el guardià.
  await syncState();
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const points: ForecastPoint[] = JSON.parse(readFileSync(build('forecast-points.json'), 'utf8'));
  const onlyTiers = (process.argv.find((a) => a.startsWith('--tiers='))?.split('=')[1] ?? 'A,B,C')
    .split(',') as Tier[];

  /*
   * `--fill` pide **solo los puntos que faltan** en el snapshot anterior.
   *
   * Cuando un lote se cae por un corte de red, volver a lanzar el nivel entero
   * gasta miles de unidades para recuperar doscientos puntos. Este modo cuesta
   * lo que falta y nada más.
   */
  const fillOnly = process.argv.includes('--fill');

  const before = readForecast();

  const steps: Array<{ tier: Tier; spec: ModelSpec; points: ForecastPoint[] }> = [];
  for (const tier of onlyTiers) {
    const tierPoints = points.filter((p) => p.tier === tier);
    if (!tierPoints.length) continue;
    for (const spec of PLAN_BY_TIER[tier]) {
      const target = fillOnly
        ? tierPoints.filter((p) => !before?.data.points[p.id]?.[spec.model])
        : tierPoints;
      if (target.length) steps.push({ tier, spec, points: target });
    }
  }

  if (fillOnly) {
    const missing = steps.reduce((a, st) => a + st.points.length, 0);
    console.log(missing
      ? `Mode --fill: ${missing} punts sense dada`
      : 'Mode --fill: no falta cap punt.');
    if (!missing) return;
  }

  // ── Presupuesto ───────────────────────────────────────────────────────────
  const cost = steps.reduce(
    (s, st) => s + callWeight(st.spec.variables.length, FORECAST_DAYS, st.points.length), 0,
  );
  const daily = onlyTiers.reduce((s, t) => {
    const n = points.filter((p) => p.tier === t).length;
    return s + PLAN_BY_TIER[t].reduce(
      (a, spec) => a + callWeight(spec.variables.length, FORECAST_DAYS, n) * (24 / spec.everyHours), 0,
    );
  }, 0);

  console.log('Pla de refresc');
  for (const st of steps) {
    const w = callWeight(st.spec.variables.length, FORECAST_DAYS, st.points.length);
    console.log(
      `  ${st.tier}  ${st.spec.model.padEnd(28)} ${String(st.points.length).padStart(5)} punts` +
      ` × ${String(st.spec.variables.length).padStart(2)} vars = ${String(Math.round(w)).padStart(5)} u` +
      ` · cada ${st.spec.everyHours} h`,
    );
  }
  const perBatch = callWeight(RICH_HOURLY.length, FORECAST_DAYS, BATCH);
  console.log(`\nCost d'aquest refresc: ${Math.round(cost).toLocaleString('ca-ES')} unitats`);
  console.log(`  ja gastades avui: ${Math.round(quota.used('open-meteo')).toLocaleString('ca-ES')} · aquesta hora: ${Math.round(quota.usedThisHour('open-meteo')).toLocaleString('ca-ES')} / ${HOURLY_LIMITS['open-meteo'].toLocaleString('ca-ES')}`);
  console.log(`Projecció diària: ${Math.round(daily).toLocaleString('ca-ES')} / ${DAILY_LIMITS['open-meteo'].toLocaleString('ca-ES')}`);
  console.log(`Projecció mensual: ${Math.round(daily * 30).toLocaleString('ca-ES')} / ${MONTHLY_LIMITS['open-meteo'].toLocaleString('ca-ES')}`);
  console.log(`Un lot de ${BATCH} punts amb el conjunt ric costa ${Math.round(perBatch)} unitats: cap ${Math.floor(HOURLY_LIMITS['open-meteo'] / perBatch)} lots per hora`);

  if (!quota.canSpend('open-meteo', cost)) {
    console.error(`\nQuota insuficient: ${quota.used('open-meteo')} ja gastades avui. S'atura abans que ens talli l'API.`);
    process.exit(1);
  }
  if (quota.isDegraded('open-meteo')) console.warn('\navís: per damunt del 80 % de la quota diària');

  // ── Se parte del snapshot anterior ────────────────────────────────────────
  // Cada nivel tiene su cadencia, así que un refresco de B no puede borrar lo
  // que trajo el de A hace dos horas.
  const previous = before;
  // En modo --fill no se descarta nada: se conserva todo y solo se añade.
  const refreshed = fillOnly ? new Set<Tier>() : new Set(onlyTiers);
  const kept: ForecastData['points'] = {};
  if (previous) {
    const tierOf = new Map(points.map((p) => [p.id, p.tier]));
    for (const [id, byModel] of Object.entries(previous.data.points)) {
      const t = tierOf.get(id);
      if (t && !refreshed.has(t)) kept[id] = byModel;
    }
    const n = Object.keys(kept).length;
    if (n) console.log(`\nEs conserven ${n.toLocaleString('ca-ES')} punts de nivells no refrescats`);
  }

  const result: ForecastData = {
    times: previous?.data.times ?? [],
    points: kept,
    models: [],
  };

  const retryQueue: Array<{ spec: ModelSpec; points: ForecastPoint[] }> = [];
  const requested = new Map<string, number>();
  for (const st of steps) requested.set(st.spec.model, (requested.get(st.spec.model) ?? 0) + st.points.length);

  const totalBatches = steps.reduce((s, st) => s + Math.ceil(st.points.length / BATCH), 0);
  // La duración la marca el límite horario, no la pausa mínima.
  const batchesPerHour = Math.max(1, Math.floor(HOURLY_LIMITS['open-meteo'] / perBatch));
  const estMin = Math.max(
    Math.ceil((totalBatches * MIN_PAUSE_MS) / 60_000),
    Math.ceil((totalBatches / batchesPerHour) * 60),
  );
  console.log(`\nLots: ${totalBatches} · ~${estMin} min (limitat per la quota horària)\n`);

  let batches = 0;
  let ok = 0;
  let failed = 0;

  const absorb = (pointId: string, model: string, fc: PointForecast & { times: string[] }) => {
    if (!result.times.length) result.times = fc.times;
    result.points[pointId] ??= {};
    // Un mismo punto puede recibir varias peticiones del mismo modelo con
    // conjuntos distintos de variables: se fusionan en vez de sobrescribirse.
    const prev = result.points[pointId][model];
    result.points[pointId][model] = {
      modelElevation: fc.modelElevation,
      values: { ...prev?.values, ...fc.values },
    };
  };

  for (const st of steps) {
    for (let i = 0; i < st.points.length; i += BATCH) {
      const chunk = st.points.slice(i, i + BATCH);
      const chunkCost = callWeight(st.spec.variables.length, FORECAST_DAYS, chunk.length);

      // Se espera **antes** de pedir, no después de que la API nos corte. Un
      // 429 no solo pierde el lote: gasta un reintento y deja el contador
      // igual de lleno.
      const wait = quota.waitForHourly('open-meteo', chunkCost);
      if (wait > 0) {
        const min = Math.ceil(wait / 60_000);
        process.stdout.write(`\n  límit horari a tocar: esperant ${min} min abans del lot ${batches + 1}\n`);
        await sleep(wait);
      }

      try {
        const res = await fetchBatch(chunk, st.spec);
        for (const [id, fc] of res) { absorb(id, st.spec.model, fc); ok++; }
        quota.spend('open-meteo', chunkCost);
        // Després de cada lot, no només al final: si aquesta execució mor ara
        // mateix, el que s'ha gastat ja consta.
        await publishQuota();
      } catch (err) {
        failed += chunk.length;
        retryQueue.push({ spec: st.spec, points: chunk });
        console.warn(`\n  lot encolat per reintentar (${st.spec.model}, ${chunk.length}): ${String(err).slice(0, 90)}`);
      }
      batches++;
      process.stdout.write(`\r  ${batches}/${totalBatches} lots · ${ok.toLocaleString('ca-ES')} sèries${failed ? ` · ${failed} fallides` : ''}   `);
      if (batches < totalBatches) await sleep(MIN_PAUSE_MS);
    }
  }
  process.stdout.write('\n');

  /*
   * Segunda oportunidad. Dejar doscientos puntos sin predicción medio día por
   * un timeout no es aceptable.
   *
   * Se espera mucho más que entre lotes normales, y no por prudencia genérica:
   * en una ejecución real, los seis reintentos internos **y** la recuperación
   * fallaron todos, porque a veinte segundos de distancia se volvía a chocar
   * con el mismo tramo de red caído. Minuto y medio da tiempo a que pase.
   *
   * Si aun así queda algo fuera, `--fill` lo recupera después sin volver a
   * pedir el nivel entero.
   */
  const RETRY_PAUSE_MS = 90_000;
  if (retryQueue.length) {
    console.log(`\nReintentant ${retryQueue.length} lots caiguts d'aquí a ${RETRY_PAUSE_MS / 1000} s…`);
    for (const item of retryQueue) {
      await sleep(RETRY_PAUSE_MS);
      try {
        const res = await fetchBatch(item.points, item.spec);
        for (const [id, fc] of res) { absorb(id, item.spec.model, fc); ok++; failed--; }
        quota.spend('open-meteo', callWeight(item.spec.variables.length, FORECAST_DAYS, item.points.length));
        await publishQuota();
        console.log(`  recuperat: ${item.spec.model} (${res.size} punts)`);
      } catch (err) {
        console.warn(`  irrecuperable: ${item.spec.model} — ${String(err).slice(0, 90)}`);
      }
    }
  }

  result.models = [...new Set(
    Object.values(result.points).flatMap((byModel) => Object.keys(byModel)),
  )];

  // ── Informe ───────────────────────────────────────────────────────────────
  const perModel = new Map<string, number>();
  for (const byModel of Object.values(result.points)) {
    for (const m of Object.keys(byModel)) perModel.set(m, (perModel.get(m) ?? 0) + 1);
  }

  console.log('\nCobertura per model:');
  for (const m of result.models.sort()) {
    const n = perModel.get(m) ?? 0;
    const asked = requested.get(m) ?? 0;
    if (asked === 0) {
      console.log(`  ${m.padEnd(30)} ${String(n).padStart(5)}          (conservat del refresc anterior)`);
      continue;
    }
    const missing = asked - n;
    console.log(`  ${m.padEnd(30)} ${String(n).padStart(5)} / ${String(asked).padStart(5)}${missing > 0 ? `  (${missing} fora de domini o lot perdut)` : ''}`);
  }

  const varCount = new Map<VariableSlug, number>();
  for (const byModel of Object.values(result.points)) {
    const seen = new Set<VariableSlug>();
    for (const pf of Object.values(byModel)) {
      for (const k of Object.keys(pf.values) as VariableSlug[]) seen.add(k);
    }
    for (const k of seen) varCount.set(k, (varCount.get(k) ?? 0) + 1);
  }
  const total = Object.keys(result.points).length;
  console.log('\nCobertura per variable:');
  for (const [slug, n] of [...varCount].sort((a, b) => b[1] - a[1])) {
    const bar = '█'.repeat(Math.round((n / total) * 24));
    console.log(`  ${slug.padEnd(26)} ${String(n).padStart(5)} ${((n / total) * 100).toFixed(0).padStart(3)} % ${bar}`);
  }

  console.log(`\nPunts amb predicció: ${total.toLocaleString('ca-ES')} / ${points.length.toLocaleString('ca-ES')} del territori`);
  console.log(`Horitzó: ${result.times.length} hores (${result.times[0]} → ${result.times.at(-1)})`);

  const written = writeForecast(result, points, 'Open-Meteo · CC-BY 4.0');
  recordFreshness({
    source: 'forecast-refresh',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: result.times[0] ?? null,
    stalenessLimitMin: 60 * 14,
    rows: ok,
    apiCalls: batches,
  });

  console.log(`\n${quota.report()}`);
  console.log(
    `→ data/cache/forecast/ · ${written.shards} trossos · `
    + `${(written.bytes / 1048576).toFixed(1)} MB en total, el més gran ${(written.largest / 1048576).toFixed(2)} MB `
    + `(${((Date.now() - started) / 1000 / 60).toFixed(1)} min)`,
  );

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
    if (pub.origin && process.env.BLOB_BASE_URL !== pub.origin) {
      console.log(`   BLOB_BASE_URL = ${pub.origin}`);
    }
  }
}

main().catch((err) => {
  recordFreshness({
    source: 'forecast-refresh', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 14, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
