/**
 * Migración de una sola vez: parte el `forecast.json` que ya está en disco.
 *
 * No pide nada a Open-Meteo. El worker haría lo mismo en su próxima vuelta,
 * pero eso son miles de unidades de cuota para reordenar bytes que ya tenemos
 * — y dejaría la web sin predicción hasta que acabara.
 *
 * Se puede borrar en cuanto haya corrido una vez en cada sitio donde viva el
 * proyecto. Se queda porque cuesta menos tenerla que volver a escribirla.
 */
import { existsSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, writeSnapshot } from './lib/store.ts';
import { build } from './lib/paths.ts';
import { FORECAST_INDEX, forecastShard, type ForecastIndex } from '../src/lib/forecast-shards.ts';

interface PointForecast { modelElevation: number; values: Record<string, Array<number | null>> }
interface ForecastData { times: string[]; points: Record<string, Record<string, PointForecast>>; models: string[] }

const legacy = join(CACHE, 'forecast.json');
if (!existsSync(legacy)) {
  console.log('No hi ha forecast.json: ja està partit o encara no s\'ha baixat mai.');
  process.exit(0);
}

const points: Array<{ id: string; comarques: string[] }> =
  JSON.parse(readFileSync(build('forecast-points.json'), 'utf8'));
const comarquesOf = new Map(points.map((p) => [p.id, p.comarques]));

const snap = JSON.parse(readFileSync(legacy, 'utf8')) as { source: string; data: ForecastData };
const { data } = snap;

const byComarca = new Map<string, ForecastData['points']>();
let orphans = 0;
for (const [id, byModel] of Object.entries(data.points)) {
  const cs = comarquesOf.get(id) ?? [];
  if (!cs.length) { orphans++; continue; }
  for (const codi of cs) {
    const bucket = byComarca.get(codi) ?? {};
    bucket[id] = byModel;
    byComarca.set(codi, bucket);
  }
}

const entries: ForecastIndex['comarques'] = [];
let bytes = 0;
for (const [codi, bucket] of [...byComarca].sort((a, b) => a[0].localeCompare(b[0]))) {
  const name = forecastShard(codi);
  writeSnapshot(name, snap.source, { times: data.times, points: bucket, models: data.models }, data.times[0] ?? null);
  const size = statSync(join(CACHE, `${name}.json`)).size;
  bytes += size;
  entries.push({ codi, points: Object.keys(bucket).length, bytes: size });
}

writeSnapshot(
  FORECAST_INDEX, snap.source,
  { times: data.times, models: data.models, points: Object.keys(data.points).length, comarques: entries },
  data.times[0] ?? null,
);

const before = statSync(legacy).size;
rmSync(legacy);

const largest = entries.reduce((m, e) => Math.max(m, e.bytes), 0);
console.log(`${entries.length} trossos · ${(bytes / 1048576).toFixed(1)} MB (abans ${(before / 1048576).toFixed(1)} MB en un de sol)`);
console.log(`El més gran: ${(largest / 1048576).toFixed(2)} MB · el més petit: ${(entries.reduce((m, e) => Math.min(m, e.bytes), Infinity) / 1024).toFixed(0)} KB`);
if (orphans) console.log(`${orphans} punts ja no són al territori i no s'han guardat.`);
