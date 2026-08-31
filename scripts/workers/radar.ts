/**
 * Worker · radar de precipitación (RainViewer).
 *
 * ## Por qué el servidor se descarga las teselas
 *
 * Lo fácil sería poner las URL de RainViewer en el HTML y que las pidiera el
 * navegador. No se hace, por tres razones que en este proyecto pesan más que la
 * comodidad:
 *
 *  1. **El principio rector**: ninguna visita dispara una llamada a una API
 *     externa. Si la dispara el navegador del usuario en vez del servidor, el
 *     principio se ha roto igual — solo que ahora el consumo no se puede medir
 *     ni limitar, y depende de cuánta gente entre.
 *  2. **Privacidad**: hotlinkear teselas manda la IP de cada visitante a un
 *     tercero que el visitante no ha elegido.
 *  3. **Cuota**: cuatro teselas por marco son 6 KB. Descargarlas una vez cada
 *     diez minutos cuesta lo mismo con diez visitas que con diez mil.
 *
 * ## La rejilla, y el techo del zoom 7
 *
 * **El tilecache público de RainViewer solo sirve hasta el zoom 7.** Del 8 en
 * adelante devuelve un PNG que dice «Zoom Level Not Supported» — con código 200,
 * así que no falla nada: se descarga, se guarda y se pinta. Se detecta porque
 * dos teselas contiguas salen byte a byte idénticas.
 *
 * Con teselas de 512 px, el zoom 7 da la densidad de píxeles del 8: cuatro
 * teselas cubren Catalunya a unos 460 m por píxel. Es más de lo que el radar
 * resuelve de verdad (~1 km), así que no se pierde nada.
 *
 * Cadencia recomendada: cada 10 min, que es la del propio radar.
 *
 * Salida: data/cache/radar.json + data/cache/radar/<marca>/<z>_<x>_<y>.png
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetchWithRetry, throttledMap } from '../lib/http.ts';
import { CACHE, DAILY_LIMITS, QuotaGuard, recordFreshness, writeSnapshot } from '../lib/store.ts';
import { CATALUNYA_BBOX, tileGrid, type TileGrid } from '../../src/lib/mercator.ts';

const API = 'https://api.rainviewer.com/public/weather-maps.json';

const Z = 7;
const TILE = 512;
/**
 * Esquema de color 2 (Universal Blue) y opciones 1_1 (suavizado + nieve
 * diferenciada). El 2 es el único de la lista que mantiene el mismo tono en
 * fondo claro y oscuro; los de escala arco iris se vuelven ilegibles sobre el
 * papel oscuro del tema.
 */
const COLOR = 2;
const OPTIONS = '1_1';

/** Marcos pasados que se conservan. Una hora de historia es lo que se lee de un vistazo. */
const PAST_FRAMES = 7;

/**
 * Tamaño exacto del PNG de «Zoom Level Not Supported», en bytes.
 *
 * No es una comprobación elegante y es la única que existe: RainViewer devuelve
 * ese cartel con un 200 y con tipo image/png, así que sin mirar el contenido no
 * hay forma de distinguirlo de una tesela vacía. Se comprueba el tamaño y, sobre
 * todo, que dos teselas distintas no salgan idénticas.
 */
const NOT_SUPPORTED_BYTES = new Set([1370, 3269]);

interface RainViewerMaps {
  version: string;
  generated: number;
  host: string;
  radar: {
    past: Array<{ time: number; path: string }>;
    nowcast: Array<{ time: number; path: string }>;
  };
}

export interface RadarFrame {
  /** Marca de tiempo Unix, que también es el nombre de la carpeta. */
  time: number;
  /** Instante en hora local de Madrid, ya formateado como la serie de predicción. */
  local: string;
  /** El nowcast es predicción a muy corto plazo, no observación. Se etiqueta distinto. */
  kind: 'past' | 'nowcast';
}

export interface RadarData {
  frames: RadarFrame[];
  grid: TileGrid;
  colorScheme: number;
  /** Teselas que componen cada marco, en orden de lectura. */
  tiles: Array<{ x: number; y: number }>;
}

const RADAR_DIR = join(CACHE, 'radar');

/** Hora local de Madrid en el mismo formato que las series de Open-Meteo. */
function toLocal(unix: number): string {
  return new Date(unix * 1000)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 16);
}

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const res = await fetchWithRetry(API, { retries: 3, timeoutMs: 30_000 });
  const maps = (await res.json()) as RainViewerMaps;
  quota.spend('rainviewer', 1);

  const past = maps.radar?.past ?? [];
  const nowcast = maps.radar?.nowcast ?? [];
  if (!past.length) throw new Error('RainViewer no ha retornat cap marc de radar.');

  const selected = [
    ...past.slice(-PAST_FRAMES).map((f) => ({ ...f, kind: 'past' as const })),
    ...nowcast.map((f) => ({ ...f, kind: 'nowcast' as const })),
  ];

  const grid = tileGrid(CATALUNYA_BBOX, Z, TILE);
  const tiles: Array<{ x: number; y: number }> = [];
  for (let y = grid.y0; y <= grid.y1; y++) {
    for (let x = grid.x0; x <= grid.x1; x++) tiles.push({ x, y });
  }

  console.log(`Marcs: ${past.length} passats (se’n guarden ${Math.min(PAST_FRAMES, past.length)}) · ${nowcast.length} de nowcast`);
  console.log(`Rejilla: zoom ${Z}, ${tiles.length} tessel·les de ${TILE} px → mosaic de ${grid.width}×${grid.height}`);
  console.log(`Cobreix ${grid.south.toFixed(2)}–${grid.north.toFixed(2)}° N, ${grid.west.toFixed(2)}–${grid.east.toFixed(2)}° E`);
  console.log(`Total: ${selected.length * tiles.length} tessel·les a baixar\n`);

  mkdirSync(RADAR_DIR, { recursive: true });

  let bytes = 0;
  let downloaded = 0;
  let skipped = 0;

  for (const frame of selected) {
    const dir = join(RADAR_DIR, String(frame.time));
    mkdirSync(dir, { recursive: true });

    await throttledMap(tiles, async (t) => {
      const dest = join(dir, `${Z}_${t.x}_${t.y}.png`);
      // Los marcos pasados no cambian nunca: una vez bajado, el fichero es
      // definitivo. Sin esta comprobación, cada ejecución rebajaría las siete
      // horas de historia entera cada diez minutos.
      if (existsSync(dest)) { skipped++; return; }

      const url = `${maps.host}${frame.path}/${TILE}/${Z}/${t.x}/${t.y}/${COLOR}/${OPTIONS}.png`;
      const r = await fetchWithRetry(url, { retries: 3, timeoutMs: 30_000 });
      const buf = Buffer.from(await r.arrayBuffer());
      if (NOT_SUPPORTED_BYTES.has(buf.length)) {
        throw new Error(
          `RainViewer ha retornat el cartell de zoom no suportat al zoom ${Z}. `
          + 'El tilecache públic arriba al 7; si això salta, algú l’ha apujat.',
        );
      }
      writeFileSync(dest, buf);
      bytes += buf.length;
      downloaded++;
      quota.spend('rainviewer', 1);
    }, { concurrency: 4, minIntervalMs: 60 });

    process.stdout.write(`\r  ${downloaded} baixades · ${skipped} ja hi eren · ${(bytes / 1024).toFixed(0)} KB   `);
  }
  process.stdout.write('\n');

  // ── Purga ─────────────────────────────────────────────────────────────────
  // Sin esto el directorio crece indefinidamente: 144 marcos al día, cada uno
  // con cuatro teselas, son casi 600 ficheros diarios que nadie vuelve a mirar.
  const keep = new Set(selected.map((f) => String(f.time)));
  let removed = 0;
  for (const entry of readdirSync(RADAR_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() && !keep.has(entry.name)) {
      rmSync(join(RADAR_DIR, entry.name), { recursive: true, force: true });
      removed++;
    }
  }
  if (removed) console.log(`Purgats ${removed} marcs antics`);

  const data: RadarData = {
    frames: selected.map((f) => ({ time: f.time, local: toLocal(f.time), kind: f.kind })),
    grid,
    colorScheme: COLOR,
    tiles,
  };

  const newest = selected[selected.length - 1];
  writeSnapshot('radar', 'RainViewer', data, new Date(newest.time * 1000).toISOString());
  recordFreshness({
    source: 'radar',
    lastSuccessAt: new Date().toISOString(),
    // El más reciente **observado**, no el nowcast: presentar una predicción a
    // 30 minutos como si fuera la última imagen del radar sería mentir sobre la
    // frescura, que es justo lo que este registro existe para evitar.
    lastDataTs: new Date((past.at(-1)?.time ?? newest.time) * 1000).toISOString(),
    stalenessLimitMin: 40,
    rows: selected.length,
    apiCalls: downloaded + 1,
  });

  const last = data.frames.filter((f) => f.kind === 'past').at(-1);
  console.log(`\nÚltima imatge del radar: ${last?.local ?? '—'} (hora local)`);
  if (nowcast.length) console.log(`Nowcast fins a ${data.frames.at(-1)?.local}`);
  console.log(`→ data/cache/radar.json + ${selected.length} marcs (${((Date.now() - started) / 1000).toFixed(1)} s)`);
}

main().catch((err) => {
  recordFreshness({
    source: 'radar', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 40, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
