/**
 * Worker · calidad del aire y polen, desde CAMS vía Open-Meteo.
 *
 * ## Por qué esto cabe y la predicción no
 *
 * air-quality-api.open-meteo.com es **otra API con otro contador**. No comparte
 * cuota con la de predicción, que ya va al límite del techo mensual. Si la
 * compartiera, este bloque no existiría: habría que haber quitado un modelo.
 *
 * ## Por qué se piden 300 puntos y no 3.190
 *
 * La predicción meteorológica necesita 3.190 puntos porque AROME tiene 1,3 km de
 * resolución y el relieve catalán cambia mucho en esa distancia. La calidad del
 * aire, no: CAMS Europa trabaja a 0,1° —unos 11 km—, así que dos puntos
 * separados por 3 km devuelven el mismo número interpolado, y se paga dos veces.
 *
 * La unidad de consulta es por tanto la celda de 0,1°, que es la resolución que
 * el modelo tiene de verdad. Ver src/lib/air-grid.ts. De 3.190 puntos salen unas
 * 300 celdas: un décimo de la cuota para exactamente la misma información.
 *
 * ## Horizonte
 *
 * Tres días, no siete. El AQI a cinco días vista es una extrapolación que nadie
 * debería usar para decidir nada, y cada día extra por encima de 14 no cuesta
 * nada en cuota pero sí en credibilidad.
 *
 * Cadencia recomendada: cada 12 h. CAMS publica dos pasadas diarias; refrescar
 * más a menudo trae el mismo fichero.
 *
 * Salida: data/cache/air-quality.json
 */
import { readFileSync } from 'node:fs';
import { fetchWithRetry, sleep } from '../lib/http.ts';
import { build } from '../lib/paths.ts';
import {
  DAILY_LIMITS, MONTHLY_LIMITS, QuotaGuard,
  recordFreshness, writeSnapshot,
} from '../lib/store.ts';
import { airCell } from '../../src/lib/air-grid.ts';
import {
  AIR_FIELD_TO_SLUG, AIR_HOURLY_FIELDS, AIR_VARIABLES, POLLENS, POLLUTANTS,
  aqiBand, type AirSlug,
} from '../../src/lib/air-variables.ts';
import { callWeight } from '../../src/lib/variables.ts';

interface ForecastPoint {
  id: string; lat: number; lon: number; altitud: number | null;
  nLocations: number; tier: 'A' | 'B' | 'C' | 'D';
}

interface Cell { key: string; lat: number; lon: number; nPoints: number }

export interface AirCellData {
  values: Partial<Record<AirSlug, Array<number | null>>>;
}

export interface AirQualityData {
  times: string[];
  /** Clave de celda de 0,1° → serie horaria. */
  cells: Record<string, AirCellData>;
  /** Lado de la celda, para que la página pueda decir la resolución real. */
  cellDeg: number;
}

const HOST = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const BATCH = 150;
const FORECAST_DAYS = 3;
/** Pausa entre lotes. Con 150 celdas × 1,8 son 270 unidades: el límite por minuto no aprieta. */
const PAUSE_MS = 4_000;

interface Response {
  latitude: number;
  longitude: number;
  hourly: Record<string, Array<number | null>> & { time: string[] };
}

async function fetchBatch(cells: Cell[]): Promise<Map<string, AirCellData & { times: string[] }>> {
  const params = new URLSearchParams({
    latitude: cells.map((c) => c.lat.toFixed(2)).join(','),
    longitude: cells.map((c) => c.lon.toFixed(2)).join(','),
    hourly: AIR_HOURLY_FIELDS.join(','),
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Madrid',
  });

  const res = await fetchWithRetry(`${HOST}?${params}`, {
    retries: 4, backoffMs: 5_000, timeoutMs: 90_000,
  });

  // Mismo saneado que en la predicción: Open-Meteo emite `nan` sin comillas
  // cuando un punto cae fuera del dominio, y eso no es JSON válido. Sin esto se
  // pierde el lote entero, incluidas las celdas que sí tenían dato.
  const text = (await res.text()).replace(/:\s*-?nan\b/gi, ':null');
  const parsed = JSON.parse(text) as Response | Response[];
  const list = Array.isArray(parsed) ? parsed : [parsed];

  const out = new Map<string, AirCellData & { times: string[] }>();
  list.forEach((r, i) => {
    const cell = cells[i];
    if (!cell || !r.hourly || !Number.isFinite(r.latitude)) return;

    const values: AirCellData['values'] = {};
    for (const [field, series] of Object.entries(r.hourly)) {
      if (field === 'time') continue;
      const slug = AIR_FIELD_TO_SLUG[field];
      if (!slug) continue;
      const decimals = AIR_VARIABLES[slug].decimals;
      const f = 10 ** decimals;
      values[slug] = (series as Array<number | null>).map((v) =>
        v == null ? null : Math.round(v * f) / f);
    }
    out.set(cell.key, { values, times: r.hourly.time });
  });
  return out;
}

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const points: ForecastPoint[] = JSON.parse(readFileSync(build('forecast-points.json'), 'utf8'));

  // ── De puntos de predicción a celdas de aire ──────────────────────────────
  const byCell = new Map<string, Cell>();
  for (const p of points) {
    if (p.tier === 'D') continue;
    const c = airCell(p.lat, p.lon);
    const prev = byCell.get(c.key);
    if (prev) prev.nPoints++;
    else byCell.set(c.key, { key: c.key, lat: c.lat, lon: c.lon, nPoints: 1 });
  }
  const cells = [...byCell.values()].sort((a, b) => a.key.localeCompare(b.key));

  const nVars = AIR_HOURLY_FIELDS.length;
  const cost = callWeight(nVars, FORECAST_DAYS, cells.length);
  const naive = callWeight(nVars, FORECAST_DAYS, points.filter((p) => p.tier !== 'D').length);

  console.log(`Punts de predicció: ${points.length.toLocaleString('ca-ES')}`);
  console.log(`Cel·les de 0,1°:    ${cells.length.toLocaleString('ca-ES')}  (la resolució real de CAMS)`);
  console.log(`Variables:          ${nVars} · ${FORECAST_DAYS} dies`);
  console.log(`\nCost: ${Math.round(cost).toLocaleString('ca-ES')} unitats`);
  console.log(`  demanant punt a punt en costaria ${Math.round(naive).toLocaleString('ca-ES')} per la mateixa informació`);
  console.log(`  gastades avui: ${Math.round(quota.used('open-meteo-air')).toLocaleString('ca-ES')} / ${DAILY_LIMITS['open-meteo-air'].toLocaleString('ca-ES')}`);
  console.log(`  projecció mensual a 2 refrescos/dia: ${Math.round(cost * 2 * 30).toLocaleString('ca-ES')} / ${MONTHLY_LIMITS['open-meteo-air'].toLocaleString('ca-ES')}`);

  if (!quota.canSpend('open-meteo-air', cost)) {
    console.error('\nQuota insuficient. S’atura abans que ens talli l’API.');
    process.exit(1);
  }

  const result: AirQualityData = { times: [], cells: {}, cellDeg: 0.1 };
  const totalBatches = Math.ceil(cells.length / BATCH);
  let batches = 0;
  let failed = 0;

  for (let i = 0; i < cells.length; i += BATCH) {
    const chunk = cells.slice(i, i + BATCH);
    const chunkCost = callWeight(nVars, FORECAST_DAYS, chunk.length);

    const wait = quota.waitForHourly('open-meteo-air', chunkCost);
    if (wait > 0) {
      console.log(`\n  límit horari a tocar: esperant ${Math.ceil(wait / 60_000)} min`);
      await sleep(wait);
    }

    try {
      const res = await fetchBatch(chunk);
      for (const [key, data] of res) {
        if (!result.times.length) result.times = data.times;
        result.cells[key] = { values: data.values };
      }
      quota.spend('open-meteo-air', chunkCost);
    } catch (err) {
      failed += chunk.length;
      console.warn(`\n  lot fallit (${chunk.length} cel·les): ${String(err).slice(0, 100)}`);
    }
    batches++;
    process.stdout.write(`\r  ${batches}/${totalBatches} lots · ${Object.keys(result.cells).length} cel·les   `);
    if (batches < totalBatches) await sleep(PAUSE_MS);
  }
  process.stdout.write('\n');

  const got = Object.keys(result.cells).length;
  if (!got) {
    throw new Error('Cap cel·la amb dades: no s’escriu res per no buidar el fitxer anterior.');
  }

  // ── Informe ───────────────────────────────────────────────────────────────
  //
  // No es decoración: es la única forma de detectar que una variable ha dejado
  // de venir. Una serie entera de nulos no da error en ningún sitio, y en la
  // página se ve como un guion —que parece una decisión de diseño, no un fallo.
  const cover = new Map<AirSlug, number>();
  for (const c of Object.values(result.cells)) {
    for (const [slug, series] of Object.entries(c.values) as Array<[AirSlug, Array<number | null>]>) {
      if (series.some((v) => v != null)) cover.set(slug, (cover.get(slug) ?? 0) + 1);
    }
  }
  console.log('\nCobertura per variable:');
  for (const slug of [...POLLUTANTS, 'aqi' as AirSlug, ...POLLENS]) {
    const n = cover.get(slug) ?? 0;
    const pct = (n / got) * 100;
    const flag = n === 0 ? '  ← sense cap valor' : '';
    console.log(`  ${AIR_VARIABLES[slug].nom.ca.padEnd(34)} ${String(n).padStart(4)} ${pct.toFixed(0).padStart(3)} %${flag}`);
  }

  // Estado actual, para ver de un vistazo si el dato es plausible.
  const nowIdx = Math.max(0, result.times.findIndex(
    (t) => t >= new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T').slice(0, 13),
  ));
  const aqis = Object.values(result.cells)
    .map((c) => c.values.aqi?.[nowIdx])
    .filter((v): v is number => v != null)
    .sort((a, b) => a - b);
  if (aqis.length) {
    const med = aqis[Math.floor(aqis.length / 2)];
    console.log(`\nAra mateix, AQI europeu a ${aqis.length} cel·les:`);
    console.log(`  mínim ${aqis[0]} · mediana ${med} (${aqiBand(med).ca.toLowerCase()}) · màxim ${aqis[aqis.length - 1]}`);
  }

  console.log(`\nHoritzó: ${result.times.length} h (${result.times[0]} → ${result.times.at(-1)})`);
  if (failed) console.warn(`Cel·les sense dada: ${failed}`);

  writeSnapshot('air-quality', 'CAMS Europa via Open-Meteo · CC-BY 4.0', result, result.times[0] ?? null);
  recordFreshness({
    source: 'air-quality',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: result.times[0] ?? null,
    // 18 h: dos pasadas diarias de CAMS con margen. Más allá, el dato de aire
    // deja de describir el día de hoy.
    stalenessLimitMin: 60 * 18,
    rows: got,
    apiCalls: batches,
  });

  console.log(`\n${quota.report()}`);
  console.log(`→ data/cache/air-quality.json (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

main().catch((err) => {
  recordFreshness({
    source: 'air-quality', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 18, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
