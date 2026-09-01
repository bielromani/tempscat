/**
 * Parte los monolitos que ya estan en disco en los trozos que lee la aplicacion.
 *
 * Los workers ya escriben los dos formatos, asi que esto solo hace falta una
 * vez: para no esperar a la siguiente pasada -o peor, para no gastar cuota
 * volviendo a pedir datos que ya tenemos- cuando se cambia la particion.
 *
 *   node scripts/migrate-split-cache.ts
 *
 * Es idempotente y no llama a ninguna API.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CACHE, publish, writeSnapshot } from './lib/store.ts';
import {
  FORECAST_STORED_HOURS, airShard, historyShard, FORECAST_INDEX, forecastShard,
} from '../src/lib/shards.ts';
import {
  aggregateDaily, mergeHourly, toStored, type PointForecast, type StoredDaily,
} from '../src/lib/forecast-merge.ts';
import { build } from './lib/paths.ts';

interface Snap<T> { fetchedAt: string; dataTs: string | null; source: string; data: T }

function read<T>(name: string): Snap<T> | null {
  const p = join(CACHE, `${name}.json`);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as Snap<T>;
}

let written = 0;

// -- Historico, un trozo por estacion --------------------------------------
const hist = read<Array<{ station: string }>>('xema-history');
if (!hist) {
  console.warn('xema-history.json no hi es; no es parteix res');
} else {
  for (const h of hist.data) {
    writeSnapshot(historyShard(h.station), hist.source, h, hist.dataTs);
    written++;
  }
  console.log(`historic: ${hist.data.length} estacions -> data/cache/history/`);
}

// -- Aire, un trozo por celda ----------------------------------------------
interface AirRaw { times: string[]; cells: Record<string, unknown>; cellDeg: number }
const air = read<AirRaw>('air-quality');
if (!air) {
  console.warn('air-quality.json no hi es; no es parteix res');
} else {
  for (const [key, cell] of Object.entries(air.data.cells)) {
    writeSnapshot(airShard(key), air.source, { times: air.data.times, cell, cellDeg: air.data.cellDeg }, air.dataTs);
    written++;
  }
  console.log(`aire: ${Object.keys(air.data.cells).length} cel·les -> data/cache/air/`);
}

// -- Prediccio: resumen diario calculado y detalle horario recortado -------
interface ForecastData {
  times: string[];
  points: Record<string, Record<string, PointForecast>>;
  daily?: Record<string, StoredDaily>;
  models: string[];
}
interface Index { times: string[]; comarques: Array<{ codi: string }> }

const idx = read<Index>(FORECAST_INDEX);
if (!idx) {
  console.warn('forecast/index.json no hi es; no es retalla res');
} else {
  const pts = JSON.parse(readFileSync(build('forecast-points.json'), 'utf8')) as Array<{ id: string; lat: number; lon: number }>;
  const coord = new Map(pts.map((p) => [p.id, p]));
  let before = 0;
  let after = 0;

  for (const c of idx.data.comarques) {
    const name = forecastShard(c.codi);
    const shard = read<ForecastData>(name);
    if (!shard) continue;
    before += Buffer.byteLength(JSON.stringify(shard));

    const times = shard.data.times;
    const daily: Record<string, StoredDaily> = {};
    for (const [id, byModel] of Object.entries(shard.data.points)) {
      const p = coord.get(id);
      const hourly = mergeHourly(byModel, times, {
        tempCorrection: 0, lat: p?.lat ?? null, lon: p?.lon ?? null, tempDecimals: 3,
      });
      daily[id] = toStored(aggregateDaily(hourly, { lat: null, lon: null }));
      for (const pf of Object.values(byModel)) {
        for (const slug of Object.keys(pf.values)) {
          const arr = (pf.values as Record<string, Array<number | null> | undefined>)[slug];
          if (arr && arr.length > FORECAST_STORED_HOURS) {
            (pf.values as Record<string, Array<number | null>>)[slug] = arr.slice(0, FORECAST_STORED_HOURS);
          }
        }
      }
    }

    const out: ForecastData = {
      times: times.slice(0, FORECAST_STORED_HOURS),
      points: shard.data.points,
      daily,
      models: shard.data.models,
    };
    writeSnapshot(name, shard.source, out, shard.dataTs);
    after += Buffer.byteLength(JSON.stringify(out));
    written++;
  }

  const first = read<Index>(FORECAST_INDEX)!;
  writeSnapshot(FORECAST_INDEX, first.source, { ...first.data, times: idx.data.times.slice(0, FORECAST_STORED_HOURS) }, first.dataTs);
  written++;
  console.log(`prediccio: ${(before / 1e6).toFixed(1)} MB -> ${(after / 1e6).toFixed(1)} MB`);
}

console.log(`
${written} fitxers escrits.`);

const pub = await publish();
if (pub.skipped) console.log("Sense les variables de R2: nomes s'ha escrit a disc.");
else console.log(`Publicat: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
