/**
 * El relleu de Catalunya, en tessel·les, per posar sota qualsevol mapa.
 *
 *   npm run data:relleu
 *
 * ## Per què fa falta, si ja hi ha `11-relief.ts`
 *
 * Perquè aquell fa **una sola imatge** de tot el país a la resolució del radar:
 * 788 × 1024 píxels per a 300 km, o sigui uns 400 metres per píxel. Serveix per
 * al que va ser feta —endevinar les serralades sota els ecos— i no serveix per
 * a res més. Retallant-ne el tros d'un itinerari de vint-i-sis quilòmetres en
 * surten noranta píxels, que estirats a sis-cents són una taca.
 *
 * El traçat d'un itinerari damunt del no-res no s'entén: és la queixa que va
 * fer néixer aquest fitxer. Amb el terreny a sota es veu per quina carena va,
 * quina vall volta i on puja.
 *
 * ## Del zoom 9 al 12, que és una piràmide
 *
 * Al zoom 12 el píxel fa uns 29 metres: un itinerari de vint-i-sis quilòmetres
 * surt de 900 píxels i es dibuixa a uns 700, o sigui que encara sobra
 * resolució. Al 13 en sobraria molta més i serien quatre vegades més tessel·les
 * per un guany que ningú no veuria — el DEM de Copernicus té una malla de 25 m
 * i al 13 ja s'inventaria el detall.
 *
 * Però un GR de quatre-cents quilòmetres al zoom 12 vol **tres mil** tessel·les
 * per a un dibuix de set-cents píxels: és pagar mil vegades el que es veu. Per
 * això n'hi ha del 9 al 12 i cada mapa tria el zoom on la seva finestra hi cap
 * amb poques. Tot plegat, 2.645 amb el marge de la frontera inclòs; dels 683
 * itineraris, 654 fan servir el 12, 21 l'11 i 8 el 10.
 *
 * ## Per què és gris amb alfa i no una imatge de colors
 *
 * Perquè el color del terra el posa la pàgina amb les seves variables, i així
 * el mateix fitxer serveix per al tema clar i per al fosc. L'alfa porta l'ombra
 * i el gris, la seva intensitat; el mar i el que queda fora del DEM van
 * transparents i per tant no tapen res.
 *
 * Atribució que demana la font, i que va a les pàgines que ho ensenyin:
 *   «Produced using Copernicus data and information funded by the European
 *   Union - EU-DEM layers.»
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { CATALUNYA_BBOX, lonToTileX, latToTileY } from '../src/lib/mercator.ts';
import { fetchWithRetry } from './lib/http.ts';
import { decodePng, encodeGrayAlpha } from './lib/png.ts';
import { CACHE, markForPublish, publish } from './lib/store.ts';
import { raw } from './lib/paths.ts';
import { join } from 'node:path';

/** Del més ample al més fi. Cada mapa tria el que li convé. */
const ZOOMS = [9, 10, 11, 12];

/**
 * Tessel·les de més enllà de la frontera, per zoom.
 *
 * Un itinerari es publica si en cau **la meitat** dins de Catalunya, així que
 * un de dos-cents vint quilòmetres pot sortir cent cap a l'Aragó — i llavors
 * el seu mapa demana tessel·les que la caixa del país no cobreix. Mesurat
 * sobre els 683: en faltaven **quinze**, totes al zoom 10 i totes a ponent,
 * i un mapa amb un tros en blanc no sembla una tessel·la que falta, sembla el
 * mapa.
 *
 * El marge és més gros als zooms amples perquè és allà on cauen els itineraris
 * llargs, que són els únics que se'n van lluny. Al 12, on hi cauen els 654
 * curts, amb una en fa prou i no se'n multipliquen mil.
 */
const MARGIN: Record<number, number> = { 9: 4, 10: 4, 11: 2, 12: 1 };
const TILE = 256;
const HOST = 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium';

/** Llum del nord-oest a 45 graus, que és la convenció cartogràfica. */
const AZIMUTH = 315;
const ALTITUDE = 45;

/**
 * Quant s'exagera el pendent.
 *
 * Menys que a `11-relief.ts`, que en posa 1,6: allà la malla és de 228 metres i
 * el relleu real hi surt massa pla. Aquí és de 29, i amb 1,6 cada torrent
 * sortiria com un congost.
 */
const zFactor = (z: number) => 1.1 * 2 ** ((12 - z) * 0.45);

const EARTH_M = 40075016.686;
const worldPx = (z: number) => 2 ** z * TILE;

/**
 * L'alçada d'una tessel·la **amb una vora d'un píxel a cada costat**.
 *
 * El pendent d'un píxel es calcula amb els seus vuit veïns, i els de la vora en
 * tenen fora de la tessel·la. Sense la vora, cada tessel·la sortia amb un marc
 * fosc d'un píxel i el mosaic quedava enreixat.
 */
async function heights(z: number, x: number, y: number): Promise<Float32Array> {
  const N = TILE + 2;
  const out = new Float32Array(N * N);

  // Les nou tessel·les que toquen: la del mig i les vuit del voltant.
  for (let ty = -1; ty <= 1; ty++) {
    for (let tx = -1; tx <= 1; tx++) {
      const png = await terrarium(z, x + tx, y + ty);
      if (!png) continue;

      // On cau aquesta tessel·la dins de la graella amb vora.
      const ox = tx * TILE + 1;
      const oy = ty * TILE + 1;
      const px0 = Math.max(0, -ox);
      const py0 = Math.max(0, -oy);
      const px1 = Math.min(TILE, N - ox);
      const py1 = Math.min(TILE, N - oy);

      for (let py = py0; py < py1; py++) {
        for (let px = px0; px < px1; px++) {
          const i = (py * TILE + px) * png.channels;
          out[(oy + py) * N + ox + px] =
            png.data[i] * 256 + png.data[i + 1] + png.data[i + 2] / 256 - 32768;
        }
      }
    }
  }
  return out;
}

const memo = new Map<string, { data: Uint8Array; channels: number } | null>();

/** Amb memòria en disc: cada tessel·la la demanen nou veïnes. */
async function terrarium(z: number, x: number, y: number) {
  const key = `${z}/${x}/${y}`;
  if (memo.has(key)) return memo.get(key) ?? null;

  const file = raw('terrarium', String(z), String(x), `${y}.png`);
  let buf: Buffer | null = null;

  if (existsSync(file)) {
    buf = readFileSync(file);
  } else {
    try {
      const res = await fetchWithRetry(`${HOST}/${z}/${x}/${y}.png`, {
        retries: 3, timeoutMs: 40_000,
      });
      buf = Buffer.from(await res.arrayBuffer());
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, buf);
    } catch {
      // Fora del domini del model no n'hi ha, i no és cap error: és mar o és
      // més enllà del que cobreix. Es queda a zero i l'alfa el fa invisible.
      memo.set(key, null);
      return null;
    }
  }

  const png = decodePng(buf);
  const val = { data: png.data, channels: png.channels };
  // Amb més de dues-centes a la memòria, el procés creix sense necessitat: les
  // tessel·les es recorren per files i les de dues files enrere ja no tornen.
  if (memo.size > 400) memo.clear();
  memo.set(key, val);
  return val;
}

/** Del mapa d'alçades amb vora, el gris i l'alfa de la tessel·la. */
function shade(h: Float32Array, z: number, row0: number): { gray: Uint8Array; alpha: Uint8Array } {
  const N = TILE + 2;
  const az = ((360 - AZIMUTH + 90) * Math.PI) / 180;
  const zen = ((90 - ALTITUDE) * Math.PI) / 180;
  const cosZen = Math.cos(zen);
  const sinZen = Math.sin(zen);

  const latOf = (row: number) => {
    const n = Math.PI - (2 * Math.PI * ((row0 + row) / worldPx(z)));
    return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
  };

  const gray = new Uint8Array(TILE * TILE);
  const alpha = new Uint8Array(TILE * TILE);

  for (let y = 0; y < TILE; y++) {
    /*
     * La mida de la malla en metres depèn de la latitud i a Mercator canvia
     * prou entre l'Ebre i Aran per notar-se. Es calcula per fila.
     */
    const cell = (EARTH_M * Math.cos((latOf(y) * Math.PI) / 180)) / worldPx(z);
    for (let x = 0; x < TILE; x++) {
      const c = (y + 1) * N + (x + 1);

      const a = h[c - N - 1]; const b = h[c - N]; const cc = h[c - N + 1];
      const d = h[c - 1]; /*                   */ const f = h[c + 1];
      const g = h[c + N - 1]; const i = h[c + N]; const j = h[c + N + 1];

      // Horn, que és el que fan servir totes les eines de SIG.
      const dzdx = ((cc + 2 * f + j) - (a + 2 * d + g)) / (8 * cell);
      const dzdy = ((g + 2 * i + j) - (a + 2 * b + cc)) / (8 * cell);

      const slope = Math.atan(zFactor(z) * Math.hypot(dzdx, dzdy));
      const aspect = Math.atan2(dzdy, -dzdx);
      const lit = cosZen * Math.cos(slope) + sinZen * Math.sin(slope) * Math.cos(az - aspect);

      const k = y * TILE + x;

      /*
       * El terreny pla és la referència, i el pla ha de ser transparent.
       *
       * Amb el sol a 45 graus, un terreny pla reflecteix `cos(45°) = 0,707`, no
       * 1. Comptant l'ombra com «el que falta per arribar a 1», el pla sortia
       * amb un alfa de **101 sobre 255** — mesurat al delta de l'Ebre i a mar
       * obert, uniforme— i tot el mapa hauria portat un vel fosc del 40 % que
       * hauria tapat el color del terra i hauria pintat el mar.
       *
       * Es compara contra el pla: per sota, ombra negra; per damunt, llum
       * blanca. Els dos costats fan el relleu, i el pla no hi és.
       *
       * La llum va més fluixa que l'ombra perquè és com es llegeix un
       * ombrejat: la vista busca les obagues, no els solells.
       */
      const flat = cosZen;
      const diff = Math.max(-1, Math.min(1, lit)) - flat;
      const mag = Math.min(1, Math.abs(diff) / flat);

      gray[k] = diff >= 0 ? 255 : 0;
      alpha[k] = Math.round(mag * (diff >= 0 ? 0.5 : 0.72) * 255);
    }
  }
  return { gray, alpha };
}

async function main() {
  let grand = 0;
  let grandBytes = 0;

  for (const z of ZOOMS) {
    const m = MARGIN[z] ?? 1;
    const x0 = Math.floor(lonToTileX(CATALUNYA_BBOX.west, z)) - m;
    const x1 = Math.floor(lonToTileX(CATALUNYA_BBOX.east, z)) + m;
    const y0 = Math.floor(latToTileY(CATALUNYA_BBOX.north, z)) - m;
    const y1 = Math.floor(latToTileY(CATALUNYA_BBOX.south, z)) + m;

    const wanted: Array<{ x: number; y: number }> = [];
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) wanted.push({ x, y });

    const mPerPx = (EARTH_M * Math.cos((41.6 * Math.PI) / 180)) / worldPx(z);
    console.log(`Zoom ${z}: ${x1 - x0 + 1} × ${y1 - y0 + 1} = ${wanted.length} tessel·les`
      + ` · ${mPerPx.toFixed(0)} m per pixel`);

    let done = 0;
    let bytes = 0;
    let made = 0;

    /*
     * D'una en una i per files, no en paral·lel.
     *
     * Cada tessel·la necessita les seves vuit veïnes, i anant per files la
     * memòria les té totes. Amb sis alhora, cadascuna en demanaria nou de cop i
     * el mateix fitxer es descodificaria una vegada i una altra.
     */
    for (const t of wanted) {
      const rel = `relleu/${z}/${t.x}/${t.y}.png`;
      const dest = join(CACHE, rel);

      // Ja calculada: no es torna a fer, però sí que es torna a publicar.
      if (existsSync(dest)) {
        markForPublish(rel);
        bytes += readFileSync(dest).length;
        done++;
        continue;
      }

      const h = await heights(z, t.x, t.y);
      const { gray, alpha } = shade(h, z, t.y * TILE);
      const png = encodeGrayAlpha(TILE, TILE, gray, alpha);

      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, png);
      markForPublish(rel);

      bytes += png.length;
      done++;
      made++;
      if (made % 25 === 0) {
        process.stdout.write(`\r  ${done}/${wanted.length} · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
      }
    }
    process.stdout.write(`\r  ${done}/${wanted.length} · ${(bytes / 1024 / 1024).toFixed(1)} MB`
      + ` (${made} de noves)\n`);
    grand += done;
    grandBytes += bytes;
  }

  console.log(`\nTotal: ${grand} tessel·les · ${(grandBytes / 1024 / 1024).toFixed(1)} MB`);

  const pub = await publish();
  console.log(pub.skipped
    ? "Sense R2 configurat: només a disc."
    : `Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
