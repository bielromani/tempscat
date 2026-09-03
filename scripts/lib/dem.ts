import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchWithRetry } from './http.ts';
import { decodePng } from './png.ts';
import { raw } from './paths.ts';

/**
 * Altitud d'un punt qualsevol, de les tessel·les de terreny d'AWS.
 *
 * Les mateixes que fan servir el mapa amb relleu: `terrarium`, que per Europa
 * porten el **EU-DEM de Copernicus** a dins. La codificació és
 * `R*256 + G + B/256 − 32768` metres.
 *
 * ## Per què per tessel·les i no un mosaic sencer
 *
 * El relleu del radar munta un mosaic de tota Catalunya al zoom 9 —2.048 px,
 * uns 228 m per píxel— i li va bé perquè el que dibuixa és una ombra suau. Per
 * saber a quina cota va un itinerari, 228 m arrasen els cims: una carena de
 * 2.500 m pot llegir-se com a 2.400.
 *
 * Al zoom 11 el píxel són **57 m**, que ja és fi de debò, però el mosaic de
 * Catalunya sencera seria de 8.192 px de costat: 67 milions de `Float32`, o
 * sigui **268 MB de memòria** per a uns itineraris que en toquen una petita
 * part.
 *
 * Així que es baixa la tessel·la que fa falta quan fa falta, es desa al disc
 * —`data/raw/terrarium/`, que no es versiona— i es guarda desxifrada en
 * memòria. Un itinerari repeteix tessel·la a cada pas, així que la memòria
 * cau sola.
 */

const HOST = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';
const TILE = 256;

/** El zoom per omissió: 57 m per píxel, prou per a la cota d'un itinerari. */
export const DEM_ZOOM = 11;

/**
 * Quantes tessel·les desxifrades es queden a la memòria.
 *
 * Cada una són 256×256 `Float32`, o sigui 256 kB. Amb dues-centes són 50 MB, i
 * un itinerari mai no toca dues-centes tessel·les diferents seguides.
 */
const MAX_CACHED = 200;

/** Píxel de la tessel·la que conté un punt, al zoom donat. */
function tileOf(lat: number, lon: number, z: number) {
  const n = 2 ** z;
  const x = ((lon + 180) / 360) * n;
  const s = Math.sin((lat * Math.PI) / 180);
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * n;
  return {
    tx: Math.floor(x),
    ty: Math.floor(y),
    px: Math.min(TILE - 1, Math.floor((x - Math.floor(x)) * TILE)),
    py: Math.min(TILE - 1, Math.floor((y - Math.floor(y)) * TILE)),
  };
}

export interface Dem {
  /** Metres sobre el nivell del mar, o null si la tessel·la no ha arribat. */
  elevationAt(lat: number, lon: number): Promise<number | null>;
  /** Quantes tessel·les s'han demanat i quantes han sortit del disc. */
  stats(): { requested: number; fromDisk: number; downloaded: number; failed: number };
}

export function createDem(zoom: number = DEM_ZOOM): Dem {
  const cache = new Map<string, Float32Array>();
  const inflight = new Map<string, Promise<Float32Array | null>>();
  let requested = 0;
  let fromDisk = 0;
  let downloaded = 0;
  let failed = 0;

  async function load(tx: number, ty: number): Promise<Float32Array | null> {
    const key = `${tx}/${ty}`;
    const cached = cache.get(key);
    if (cached) return cached;

    const running = inflight.get(key);
    if (running) return running;

    const task = (async () => {
      const dest = raw('terrarium', String(zoom), String(tx), `${ty}.png`);
      let bytes: Buffer;

      if (existsSync(dest)) {
        bytes = readFileSync(dest);
        fromDisk++;
      } else {
        try {
          const res = await fetchWithRetry(`${HOST}/${zoom}/${tx}/${ty}.png`, {
            retries: 3, timeoutMs: 40_000,
          });
          bytes = Buffer.from(await res.arrayBuffer());
          mkdirSync(dirname(dest), { recursive: true });
          writeFileSync(dest, bytes);
          downloaded++;
        } catch {
          failed++;
          return null;
        }
      }

      const png = decodePng(bytes);
      if (png.width !== TILE || png.height !== TILE) {
        failed++;
        return null;
      }

      const grid = new Float32Array(TILE * TILE);
      for (let i = 0; i < TILE * TILE; i++) {
        const o = i * png.channels;
        grid[i] = png.data[o] * 256 + png.data[o + 1] + png.data[o + 2] / 256 - 32768;
      }

      // Es fa lloc abans de desar: el primer que va entrar és el que surt.
      if (cache.size >= MAX_CACHED) {
        const oldest = cache.keys().next().value;
        if (oldest !== undefined) cache.delete(oldest);
      }
      cache.set(key, grid);
      return grid;
    })();

    inflight.set(key, task);
    try { return await task; } finally { inflight.delete(key); }
  }

  return {
    async elevationAt(lat, lon) {
      requested++;
      const { tx, ty, px, py } = tileOf(lat, lon, zoom);
      const grid = await load(tx, ty);
      if (!grid) return null;
      const h = grid[py * TILE + px];
      /*
       * El terrarium porta batimetria, així que el mar dona valors negatius de
       * centenars de metres. Per a un itinerari a peu això no és una cota: és
       * que el punt cau a l'aigua, i val més dir-ho amb un null.
       */
      return h < -100 ? null : h;
    },
    stats: () => ({ requested, fromDisk, downloaded, failed }),
  };
}

/** Metres entre dos punts, per la fórmula de l'haversine. */
export function distanceM(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6_371_000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}
