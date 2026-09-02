/**
 * El relleu, calculat un cop i desat com una imatge.
 *
 *   node scripts/11-relief.ts
 *
 * ## Per que fa falta
 *
 * El radar sobre un fons buit es una taca de colors damunt d'una silueta. Amb
 * el relleu a sota s'enten el que ensenya: per que plou al vessant nord i no al
 * sud, per que hi ha valls que el radar no veu, i on cauen els ecos respecte de
 * les serralades.
 *
 * ## D'on surt
 *
 * De les **tessel-les de terreny d'AWS** (terrarium), que per Europa porten
 * l'EU-DEM de Copernicus. Codifiquen l'altitud als tres canals de color:
 * `R*256 + G + B/256 - 32768` metres.
 *
 * Es podria haver fet amb l'API d'elevacio d'Open-Meteo, que ja fem servir, i
 * hauria estat **novecentes peticions** per una malla de 900 metres. Aixi son
 * seixanta-quatre per una de 228, i es la mateixa dada de fons: Copernicus.
 *
 * Atribucio que demana la font, i que va a la pagina:
 *   «Produced using Copernicus data and information funded by the European
 *   Union - EU-DEM layers.»
 *
 * ## Per que es calcula aqui i no a la pagina
 *
 * Perque l'altitud no canvia. Es baixa un cop, es calcula un cop i queda un
 * PNG a `public/` que es versiona amb el codi. La pagina nomes el posa a sota
 * del radar.
 *
 * ## Per que quadra exactament amb el radar
 *
 * Perque les dues coses son Web Mercator i el zoom 9 amb tessel-les de 256
 * pixels es **exactament el doble** de resolucio que el zoom 7 amb tessel-les
 * de 512: el mosaic del radar fa 1024 pixels i el del relleu 2048. Es calcula
 * l'ombra a la resolucio bona i es baixa a la meitat al final.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { CATALUNYA_BBOX, tileGrid } from '../src/lib/mercator.ts';
import { fetchWithRetry, throttledMap } from './lib/http.ts';
import { decodePng, encodeGrayAlpha } from './lib/png.ts';
import { ROOT } from './lib/paths.ts';

/** El zoom del radar, i el del relleu, que es el doble de fi. */
const Z_RADAR = 7;
const TILE_RADAR = 512;
const Z_DEM = 9;
const TILE_DEM = 256;

const HOST = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

/** Llum del nord-oest a 45 graus, que es la convencio cartografica. */
const AZIMUTH = 315;
const ALTITUDE = 45;

/**
 * Quant s'exagera el pendent.
 *
 * A 228 metres de malla, el relleu real surt massa pla per llegir-se de fons.
 * Amb 1,6 les serralades s'endevinen sense que els Pirineus semblin els Alps.
 */
const Z_FACTOR = 1.6;

const EARTH_M = 40075016.686;

function main() {
  const grid = tileGrid(CATALUNYA_BBOX, Z_RADAR, TILE_RADAR);

  // El mosaic del relleu, en tessel-les del seu propi zoom.
  const scale = 2 ** (Z_DEM - Z_RADAR);            // 4 tessel-les del 9 per una del 7
  const dx0 = grid.x0 * scale;
  const dx1 = (grid.x1 + 1) * scale - 1;
  const dy0 = grid.y0 * scale;
  const dy1 = (grid.y1 + 1) * scale - 1;

  const W = (dx1 - dx0 + 1) * TILE_DEM;
  const H = (dy1 - dy0 + 1) * TILE_DEM;

  console.log(`Mosaic del radar: ${grid.width}x${grid.height} px al zoom ${Z_RADAR}`);
  console.log(`Mosaic del relleu: ${W}x${H} px al zoom ${Z_DEM}`);

  const wanted: Array<{ x: number; y: number }> = [];
  for (let y = dy0; y <= dy1; y++) for (let x = dx0; x <= dx1; x++) wanted.push({ x, y });
  console.log(`Tessel-les a baixar: ${wanted.length}\n`);

  const dem = new Float32Array(W * H);
  let done = 0;

  return throttledMap(wanted, async (t) => {
    const url = `${HOST}/${Z_DEM}/${t.x}/${t.y}.png`;
    const res = await fetchWithRetry(url, { retries: 3, timeoutMs: 40_000 });
    const png = decodePng(Buffer.from(await res.arrayBuffer()));
    if (png.width !== TILE_DEM || png.height !== TILE_DEM) {
      throw new Error(`${url}: fa ${png.width}x${png.height} i no ${TILE_DEM}`);
    }
    const ox = (t.x - dx0) * TILE_DEM;
    const oy = (t.y - dy0) * TILE_DEM;
    for (let py = 0; py < TILE_DEM; py++) {
      for (let px = 0; px < TILE_DEM; px++) {
        const i = (py * TILE_DEM + px) * png.channels;
        const h = png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
        dem[(oy + py) * W + ox + px] = h;
      }
    }
    done++;
    process.stdout.write(`\r  ${done}/${wanted.length} tessel-les`);
  }, { concurrency: 6 }).then(() => {
    process.stdout.write('\n');
    shade(dem, W, H, grid);
  });
}

function shade(dem: Float32Array, W: number, H: number, grid: { z: number; size: number; y0: number; north: number; south: number }) {
  const az = ((360 - AZIMUTH + 90) * Math.PI) / 180;
  const zen = ((90 - ALTITUDE) * Math.PI) / 180;
  const cosZen = Math.cos(zen);
  const sinZen = Math.sin(zen);

  /*
   * La mida de la malla en metres depen de la latitud, i a Mercator canvia
   * prou entre l'Ebre i Aran per notar-se: 234 metres al sud i 226 al nord.
   * Es calcula per fila en lloc de posar-hi una mitjana.
   */
  const worldPx = 2 ** Z_DEM * TILE_DEM;
  const latOf = (row: number) => {
    const n = Math.PI - (2 * Math.PI * ((dyTop + row) / worldPx));
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };
  const dyTop = grid.y0 * (2 ** (Z_DEM - grid.z)) * TILE_DEM;

  const gray = new Uint8Array(W * H);
  const alpha = new Uint8Array(W * H);

  for (let y = 0; y < H; y++) {
    const cell = (EARTH_M * Math.cos((latOf(y) * Math.PI) / 180)) / worldPx;
    const y0 = Math.max(0, y - 1) * W;
    const y1 = y * W;
    const y2 = Math.min(H - 1, y + 1) * W;

    for (let x = 0; x < W; x++) {
      const x0 = Math.max(0, x - 1);
      const x2 = Math.min(W - 1, x + 1);

      const a = dem[y0 + x0]; const b = dem[y0 + x]; const c = dem[y0 + x2];
      const d = dem[y1 + x0]; const f = dem[y1 + x2];
      const g = dem[y2 + x0]; const h = dem[y2 + x]; const i = dem[y2 + x2];

      const dzdx = ((c + 2 * f + i) - (a + 2 * d + g)) / (8 * cell);
      const dzdy = ((g + 2 * h + i) - (a + 2 * b + c)) / (8 * cell);

      const slope = Math.atan(Z_FACTOR * Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const v = cosZen * Math.cos(slope) + sinZen * Math.sin(slope) * Math.cos(az - aspect);

      const sea = dem[y1 + x] <= 0;
      /*
       * Dues coses aqui son per la mida del fitxer i no per l'aspecte.
       *
       * La primera: al mar el gris es zero i prou. El mar es transparent i no
       * es veu, pero el terrarium porta batimetria i l'ombra del fons mari
       * sortia calculada igualment: era el 71 % de la imatge ple de detall que
       * ningu veu i que el deflate no pot comprimir.
       *
       * La quantitzacio a 32 nivells es fa despres de baixar la resolucio, no
       * aqui: la mitjana de quatre valors quantitzats torna a inventar-se tons
       * intermedis i desfa mitja feina.
       */
      gray[y1 + x] = sea ? 0 : Math.max(0, Math.min(255, Math.round(v * 255)));
      // El mar no es dibuixa: queda el fons de la pagina.
      alpha[y1 + x] = sea ? 0 : 255;
    }
  }

  // A la meitat, que es la resolucio del mosaic del radar.
  const w2 = W / 2;
  const h2 = H / 2;
  const g2 = new Uint8Array(w2 * h2);
  const a2 = new Uint8Array(w2 * h2);
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      const i0 = 2 * y * W + 2 * x;
      const i1 = i0 + 1;
      const i2 = i0 + W;
      const i3 = i2 + 1;
      // 32 nivells, i ara si: despres de la mitjana.
      g2[y * w2 + x] = ((gray[i0] + gray[i1] + gray[i2] + gray[i3]) >> 2) & 0xf8;
      a2[y * w2 + x] = (alpha[i0] + alpha[i1] + alpha[i2] + alpha[i3]) >> 2;
    }
  }

  /*
   * I es retalla a la terra.
   *
   * El mosaic arriba fins a Mallorca per l'est i fins mig Mediterrani pel sud:
   * el 71 % son pixels transparents que no diuen res. Retallant, el fitxer
   * baixa a la meitat.
   *
   * El desplacament va a un JSON al costat, perque la pagina necessita saber
   * on posar la imatge dins del mosaic. Endevinar-ho pel nom del fitxer hauria
   * estat mes curt i mes facil d'equivocar.
   */
  let minX = w2; let minY = h2; let maxX = -1; let maxY = -1;
  for (let y = 0; y < h2; y++) {
    for (let x = 0; x < w2; x++) {
      if (a2[y * w2 + x] === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  const cw = maxX - minX + 1;
  const ch = maxY - minY + 1;
  const gc = new Uint8Array(cw * ch);
  const ac = new Uint8Array(cw * ch);
  for (let y = 0; y < ch; y++) {
    for (let x = 0; x < cw; x++) {
      gc[y * cw + x] = g2[(minY + y) * w2 + minX + x];
      ac[y * cw + x] = a2[(minY + y) * w2 + minX + x];
    }
  }

  const png = encodeGrayAlpha(cw, ch, gc, ac);
  mkdirSync(join(ROOT, 'public'), { recursive: true });
  writeFileSync(join(ROOT, 'public', 'relleu-v1.png'), png);

  mkdirSync(join(ROOT, 'data', 'build', 'geo'), { recursive: true });
  writeFileSync(
    join(ROOT, 'data', 'build', 'geo', 'relleu.json'),
    `${JSON.stringify({
      src: '/relleu-v1.png',
      // En pixels del mosaic del radar, que es el sistema en que dibuixa la pagina.
      x: minX, y: minY, w: cw, h: ch,
      mosaic: { z: Z_RADAR, tile: TILE_RADAR, width: w2, height: h2 },
      source: 'Terrain Tiles (AWS Open Data) · EU-DEM, Copernicus',
      attribution:
        'Produced using Copernicus data and information funded by the '
        + 'European Union - EU-DEM layers.',
    }, null, 2)}\n`,
  );

  let land = 0;
  for (let i = 0; i < ac.length; i++) if (ac[i] > 0) land++;
  console.log(`Retall: ${cw}x${ch} px a partir de (${minX}, ${minY}) del mosaic de ${w2}x${h2}`);
  console.log(`Terra: ${((land / ac.length) * 100).toFixed(0)} % del retall`);
  console.log(`\n→ public/relleu-v1.png (${(png.length / 1024).toFixed(0)} kB) + data/build/geo/relleu.json`);
}

await main();
