/**
 * El mapa base de l'ICGC, retallat al que els itineraris ensenyen.
 *
 *   npm run data:base
 *
 * ## Per què, si ja hi havia el relleu
 *
 * Perquè un ombrejat no serveix on el terreny és pla. A l'Anella Verda de Vic
 * —un anell de vint-i-sis quilòmetres per la Plana— el relleu no dibuixa
 * absolutament res i el traçat queda flotant damunt del blanc. La queixa era
 * exacta: «no aporta nada».
 *
 * El que fa útil un mapa a qui camina són els **camins, les carreteres, els
 * rius i els noms**, i això no surt d'un model d'altures: surt d'una
 * cartografia. La de l'ICGC és la del país, és la oficial i és **CC BY**.
 *
 * ## D'on surt i amb quina llicència
 *
 * Del servei WMTS de mapa base de l'ICGC, capa `topografic`. Les condicions del
 * servei diuen `Fees: none` i `AccessConstraints: none`, i la llicència de la
 * cartografia de Catalunya és CC BY: es pot desar i tornar a servir **dient
 * d'on ve**, que és el que fa la fitxa.
 *
 * Fora de Catalunya el mateix servei serveix un mapa base mundial fet
 * d'OpenMapTiles i OpenStreetMap, amb ODbL. Hi cauen els trossos dels
 * itineraris que se'n van cap a l'Aragó o cap a França, i per això l'atribució
 * de la pàgina esmenta les dues.
 *
 * ## Per què es desen i no es demanen al vol
 *
 * Perquè cap petició d'un lector no dispara mai una crida a un tercer: és el
 * primer principi del projecte. I perquè així el pes es controla —cada
 * tessel·la es reescriu en WebP— i el servei de l'ICGC rep 2.300 peticions un
 * cop, no una per visita.
 *
 * ## WebP, i per què no PNG
 *
 * Les tessel·les arriben en PNG de 512 píxels i entre 310 i 470 kB. En WebP de
 * qualitat 80 es queden entre 36 i 66, o sigui **vuit vegades menys**, amb la
 * mateixa resolució. Amb PNG, un mapa de dotze tessel·les serien quatre megues
 * i mig: la pàgina no es podria publicar.
 *
 * ## Només les que es fan servir
 *
 * No es baixa Catalunya sencera: es baixa el que demanen els 683 itineraris amb
 * la finestra i el zoom que la pàgina calcularà. Al zoom 13, el país sencer
 * serien vint mil tessel·les i se n'ensenyen 2.315.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import { fitBox, projectToMap, tileWindow, type MapProjection } from '../src/lib/mercator.ts';
import { fetchWithRetry, throttledMap } from './lib/http.ts';
import { CACHE, markForPublish, publish } from './lib/store.ts';
import { build } from './lib/paths.ts';

const WMTS = 'https://geoserveis.icgc.cat/servei/catalunya/mapa-base/wmts/topografic/MON3857NW';

/**
 * Els zooms i el sostre de tessel·les per mapa.
 *
 * Han de ser **els mateixos** que `RouteMap`. Si divergeixen, el worker en
 * baixa unes i la pàgina en demana unes altres, i el mapa surt amb forats sense
 * que res doni error.
 */
export const BASE_ZOOMS = [9, 10, 11, 12, 13, 14];
export const BASE_MAX_TILES = 12;

/** Qualitat del WebP. A 80, una tessel·la del topogràfic es queda en uns 50 kB. */
const QUALITY = 80;

interface RouteGeom {
  slug: string;
  trace: Array<Array<[number, number]>>;
}

function geometry(): RouteGeom[] {
  const dir = build('routes');
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')) as RouteGeom);
}

async function main() {
  const map = JSON.parse(
    readFileSync(build('geo', 'comarques-map.json'), 'utf8'),
  ) as { projection: MapProjection };

  const routes = geometry();
  const wanted = new Map<string, { z: number; x: number; y: number }>();
  const perZoom: Record<number, number> = {};

  for (const r of routes) {
    const pts = r.trace.flat().map(([lat, lon]) => projectToMap(lon, lat, map.projection));
    if (!pts.length) continue;
    const view = fitBox(pts);
    const tiles = tileWindow(view, map.projection, BASE_ZOOMS, BASE_MAX_TILES);
    if (tiles.length) perZoom[tiles[0].z] = (perZoom[tiles[0].z] ?? 0) + 1;
    for (const t of tiles) wanted.set(`${t.z}/${t.x}/${t.y}`, t);
  }

  console.log(`${routes.length} itineraris · ${wanted.size} tessel·les diferents`);
  console.log(`Per zoom: ${Object.entries(perZoom).sort().map(([z, n]) => `${z}=${n}`).join(' · ')}\n`);

  let done = 0;
  let made = 0;
  let bytes = 0;
  let raw = 0;
  const failed: string[] = [];

  await throttledMap([...wanted.values()], async (t) => {
    const rel = `base/${t.z}/${t.x}/${t.y}.webp`;
    const dest = join(CACHE, rel);

    if (existsSync(dest)) {
      markForPublish(rel);
      bytes += readFileSync(dest).length;
      done++;
      return;
    }

    try {
      const res = await fetchWithRetry(`${WMTS}/${t.z}/${t.x}/${t.y}.png`, {
        retries: 3, timeoutMs: 40_000,
      });
      const png = Buffer.from(await res.arrayBuffer());
      raw += png.length;

      /*
       * Una resposta que no és una imatge arriba amb un 200.
       *
       * Fora de la matriu, el servei torna un `ExceptionReport` en XML amb codi
       * 200 — la mateixa trampa que el tilecache del radar amb el «Zoom Level
       * Not Supported». `sharp` no el sabria llegir, però val més dir-ho aquí
       * que deixar-lo passar com una tessel·la buida.
       */
      if (png.length < 200 || png.subarray(1, 4).toString('latin1') !== 'PNG') {
        throw new Error(`no és un PNG (${png.length} bytes)`);
      }

      const webp = await sharp(png).webp({ quality: QUALITY }).toBuffer();
      mkdirSync(dirname(dest), { recursive: true });
      writeFileSync(dest, webp);
      markForPublish(rel);

      bytes += webp.length;
      made++;
    } catch (err) {
      failed.push(`${t.z}/${t.x}/${t.y}: ${String(err).slice(0, 100)}`);
    }
    done++;
    if (done % 50 === 0) {
      process.stdout.write(`\r  ${done}/${wanted.size} · ${(bytes / 1024 / 1024).toFixed(1)} MB`);
    }
  }, { concurrency: 4, minIntervalMs: 60 });

  process.stdout.write(`\r  ${done}/${wanted.size} · ${(bytes / 1024 / 1024).toFixed(1)} MB`
    + ` (${made} de noves)\n`);

  if (raw > 0) {
    console.log(`  WebP: ${(raw / 1024 / 1024).toFixed(0)} MB de PNG → `
      + `${(bytes / 1024 / 1024).toFixed(0)} MB`);
  }

  /*
   * Una tessel·la que falta és un forat al mapa, i un forat al mapa no sembla
   * un error: sembla el mapa. Si en falta cap, val més aturar-se.
   */
  if (failed.length) {
    console.error(`\n${failed.length} tessel·les no s'han pogut preparar:`);
    for (const f of failed.slice(0, 8)) console.error(`  ${f}`);
    throw new Error(`${failed.length} tessel·les del mapa base han fallat`);
  }

  const pub = await publish();
  console.log(pub.skipped
    ? "\nSense R2 configurat: només a disc."
    : `\nPublicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1024 / 1024).toFixed(1)} MB`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
