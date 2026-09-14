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
 * ## Només les que es fan servir, i el país als zooms baixos
 *
 * Dues coses, i convindria no confondre-les:
 *
 *  · **Per als itineraris** no es baixa Catalunya sencera, sinó el que demanen
 *    els 683 amb la finestra i el zoom que la pàgina calcularà. Al zoom 13 el
 *    país sencer serien vint mil tessel·les i se n'ensenyen 2.315.
 *  · **Per al mapa que es pot moure** sí que es baixa sencer, però només del
 *    zoom 6 a l'11, que són 527. Allà la finestra no la tria el servidor.
 *
 * Es baixen alhora i al mateix `Map`: una tessel·la que serveixi per a les dues
 * coses es demana un cop.
 */
import { mkdirSync, writeFileSync, existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import sharp from 'sharp';
import {
  fitBox, latToTileY, lonToTileX, projectToMap, tileWindow, type MapProjection,
} from '../src/lib/mercator.ts';
import { fetchWithRetry, throttledMap } from './lib/http.ts';
import { CACHE, markForPublish, publish } from './lib/store.ts';
import { build } from './lib/paths.ts';
import { MAP_BOX, MAP_MIN_ZOOM, MAP_NATIVE_MAX_ZOOM } from '../src/lib/webmap.ts';

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

/**
 * I, a banda dels itineraris, el país sencer als zooms baixos.
 *
 * ## Per què això no es podia deixar per als itineraris
 *
 * Perquè un mapa que es pot moure no ensenya una finestra decidida pel
 * servidor: l'escull qui mira. Comptades les que hi havia contra les que fan
 * falta per cobrir Catalunya, en faltaven **totes les del 7 i del 8, 3 del
 * zoom 9, 35 del 10 i 206 de l'11**: les que hi havia són les que els 683
 * itineraris travessen, i entremig hi ha comarques senceres per on no en passa
 * cap.
 *
 * I una tessel·la que falta **no sembla un error: sembla el mapa**. Qui arrossega
 * cap a les Garrigues veuria un quadrat blanc i entendria que allà no hi ha res,
 * que és exactament la lectura que aquest projecte evita a tot arreu.
 *
 * ## Per què des del sis i no des del nou
 *
 * Perquè el país sencer dins d'una finestra de mil píxels cau cap al zoom 7,7,
 * i dins d'una de 375 —un telèfon— cau al 6,3. Un mapa que obre ensenyant
 * Catalunya entera demana, doncs, del 6 al 8. Sense elles el fons surt **buit
 * en obrir** i només apareix en acostar-s'hi, que és el moment en què ningú no
 * entendria què ha passat. Costen 2, 4 i 12 tessel·les: el zoom baix és barat
 * justament perquè n'hi caben poques.
 *
 * ## I per què fins a l'onze i no més
 *
 * Perquè les de l'ICGC són de 512 píxels, o sigui que el zoom 11 té el detall
 * que en tindria el 12 amb tessel·les de 256: carrers d'un poble. El dotze
 * sencer serien **1.444 tessel·les més**, uns 70 MB, per a un detall que aquest
 * mapa no fa servir — qui vol el carrer té la fitxa del lloc. Els zooms alts
 * segueixen baixant-se allà on un itinerari els demana.
 *
 * ## Els zooms i la finestra els decideix `webmap.ts`
 *
 * No es tornen a escriure aquí. El guió baixa un rectangle i la pàgina en
 * demana un altre el dia que les dues còpies es separin, i llavors surten
 * forats al caire **sense que res doni cap error**: una tessel·la que falta,
 * a MapLibre, és un quadrat buit i prou. És la mateixa raó per la qual
 * `fitBox()` i `tileWindow()` no viuen dins del `RouteMap`.
 *
 * ## Per què no és una opció que s'hagi de recordar
 *
 * Perquè seria una opció que un dia no es passaria. El guió ja salta el que ja
 * té, així que la segona vegada no baixa res i el cost de tenir-ho sempre és
 * comptar tres-centes entrades d'un `Map`.
 */
export const COUNTRY_ZOOMS = Array.from(
  { length: MAP_NATIVE_MAX_ZOOM - MAP_MIN_ZOOM + 1 },
  (_, i) => MAP_MIN_ZOOM + i,
);

/** La finestra. Viu a `webmap.ts` perquè la pàgina n'ha de fer servir la mateixa. */
export const COUNTRY_BOX = MAP_BOX;

/** Les tessel·les que cobreixen `COUNTRY_BOX` a cada zoom de `COUNTRY_ZOOMS`. */
function countryTiles(): Array<{ z: number; x: number; y: number }> {
  const out: Array<{ z: number; x: number; y: number }> = [];
  for (const z of COUNTRY_ZOOMS) {
    const x0 = Math.floor(lonToTileX(COUNTRY_BOX.west, z));
    const x1 = Math.floor(lonToTileX(COUNTRY_BOX.east, z));
    // La y creix cap al sud: el nord dona la primera.
    const y0 = Math.floor(latToTileY(COUNTRY_BOX.north, z));
    const y1 = Math.floor(latToTileY(COUNTRY_BOX.south, z));
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) out.push({ z, x, y });
  }
  return out;
}

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
  console.log(`Per zoom: ${Object.entries(perZoom).sort().map(([z, n]) => `${z}=${n}`).join(' · ')}`);

  // I el país sencer als zooms baixos, per al mapa que es pot moure.
  const before = wanted.size;
  for (const t of countryTiles()) wanted.set(`${t.z}/${t.x}/${t.y}`, t);
  console.log(`Catalunya sencera als zooms ${COUNTRY_ZOOMS.join(', ')}: `
    + `${wanted.size - before} de noves · ${wanted.size} en total\n`);

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
