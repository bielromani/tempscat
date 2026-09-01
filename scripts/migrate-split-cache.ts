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
import { airShard, historyShard } from '../src/lib/shards.ts';

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

console.log(`
${written} fitxers escrits.`);

const pub = await publish();
if (pub.skipped) console.log("Sense BLOB_READ_WRITE_TOKEN: nomes s'ha escrit a disc.");
else console.log(`Publicat: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
