/**
 * Fase 0 · paso 5 — Altitud real de cada punto poblado.
 *
 * Es el dato que sostiene toda la diferenciación del producto: dos núcleos del
 * mismo municipio separados por 200 m de desnivel tienen temperaturas
 * sistemáticamente distintas, y ninguna web generalista lo corrige.
 *
 * Se usa el endpoint de elevación de Open-Meteo (modelo digital Copernicus
 * GLO-90) porque es exactamente la orografía que asumen sus modelos: corregir
 * contra ella es lo correcto, mejor que contra una cota oficial más precisa
 * pero ajena al modelo.
 *
 * Salida: data/raw/elevation.json
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchJson, sleep } from './lib/http.ts';
import { ensureDirs, raw } from './lib/paths.ts';
import type { GeocodeResult } from './03-geocode-entitats.ts';
import type { MunicipiPoint } from './02-fetch-geo.ts';

const BATCH = 100; // máximo verificado por petición

/**
 * Open-Meteo no cuenta peticiones, cuenta *ubicaciones*: un lote de 100 puntos
 * consume como 100 llamadas contra el límite de 600/minuto. Verificado con un
 * 429 real al ir a ritmo libre. Con ~11 s entre lotes nos quedamos justo por
 * debajo, y aun así el paso entero tarda menos de 10 minutos.
 */
const PAUSE_MS = 11_000;

interface Target {
  key: string;
  lat: number;
  lon: number;
}

async function elevationBatch(points: Target[]): Promise<number[]> {
  const lat = points.map((p) => p.lat.toFixed(6)).join(',');
  const lon = points.map((p) => p.lon.toFixed(6)).join(',');
  const url = `https://api.open-meteo.com/v1/elevation?latitude=${lat}&longitude=${lon}`;
  const data = await fetchJson<{ elevation: number[] }>(url, {
    retries: 5,
    backoffMs: 5_000,
    timeoutMs: 45_000,
  });
  if (!Array.isArray(data.elevation) || data.elevation.length !== points.length) {
    throw new Error(`Respuesta inesperada: se pidieron ${points.length} puntos y llegaron ${data.elevation?.length}`);
  }
  return data.elevation;
}

async function main() {
  ensureDirs();

  const targets: Target[] = [];

  const { municipis } = JSON.parse(readFileSync(raw('municipis-geo.json'), 'utf8')) as { municipis: MunicipiPoint[] };
  for (const m of municipis) targets.push({ key: `M${m.codi}`, lat: m.lat, lon: m.lon });

  if (existsSync(raw('geocode.json'))) {
    const geo = JSON.parse(readFileSync(raw('geocode.json'), 'utf8')) as GeocodeResult[];
    for (const g of geo) {
      if (g.lat != null && g.lon != null && g.confidence >= 60) {
        targets.push({ key: g.codi13, lat: g.lat, lon: g.lon });
      }
    }
  } else {
    console.warn('No hay geocode.json todavía: solo se resuelven altitudes de municipios.');
  }

  const cacheFile = raw('elevation.json');
  const cache: Record<string, number> = existsSync(cacheFile)
    ? JSON.parse(readFileSync(cacheFile, 'utf8'))
    : {};

  const pending = targets.filter((t) => cache[t.key] === undefined);
  const nBatches = Math.ceil(pending.length / BATCH);
  console.log(`Puntos: ${targets.length.toLocaleString('es-ES')} · pendientes: ${pending.length.toLocaleString('es-ES')}`);
  console.log(`Lotes: ${nBatches} · ritmo ${PAUSE_MS / 1000} s/lote · ~${Math.ceil((nBatches * PAUSE_MS) / 60_000)} min\n`);

  const started = Date.now();
  for (let i = 0; i < pending.length; i += BATCH) {
    const chunk = pending.slice(i, i + BATCH);
    const elevations = await elevationBatch(chunk);
    chunk.forEach((t, j) => { cache[t.key] = elevations[j]; });
    writeFileSync(cacheFile, JSON.stringify(cache), 'utf8');
    const done = Math.min(i + BATCH, pending.length);
    const eta = Math.round(((pending.length - done) / BATCH) * (PAUSE_MS / 1000));
    process.stdout.write(`\r  ${done}/${pending.length} · quedan ~${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, '0')}s   `);
    if (done < pending.length) await sleep(PAUSE_MS);
  }
  process.stdout.write(`\n  (${Math.round((Date.now() - started) / 1000)} s)\n`);

  const values = Object.values(cache);
  console.log(`\nAltitudes resueltas: ${values.length.toLocaleString('es-ES')}`);
  console.log(`Rango: ${Math.min(...values)} m – ${Math.max(...values)} m`);

  const bands = [0, 200, 500, 1000, 1500, 2000, 9999];
  console.log('\nDistribución por franja:');
  for (let i = 0; i < bands.length - 1; i++) {
    const n = values.filter((v) => v >= bands[i] && v < bands[i + 1]).length;
    const bar = '█'.repeat(Math.round((n / values.length) * 46));
    console.log(`  ${String(bands[i]).padStart(4)}–${String(bands[i + 1] === 9999 ? '+' : bands[i + 1]).padEnd(5)} ${String(n).padStart(5)} ${bar}`);
  }
  console.log(`\n→ ${cacheFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
