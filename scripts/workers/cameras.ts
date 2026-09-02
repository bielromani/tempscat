/**
 * Worker · càmeres de muntanya (Ferrocarrils de la Generalitat).
 *
 * ## Por qué las imágenes las baja el servidor
 *
 * Las mismas tres razones que el radar, y la primera pesa más aquí: las URL del
 * catálogo de FGC **no apuntan a FGC**. Apuntan a `app.projecte4estacions.com`,
 * a `media.turismefgc.cat`, a `fgc.roundshot.com` — proveedores distintos, con
 * la imagen a tamaño de cámara. Poner esas URL en nuestro HTML mandaría la IP
 * de cada visitante a cinco terceros que no ha elegido, y le haría bajar 3,8 MB
 * de JPEG para ver una foto de 400 píxeles.
 *
 * Aquí se baja una vez por hora, se reescala y se sirve desde nuestro almacén.
 *
 * ## El catálogo dice 30 y son 24
 *
 * Y ninguna de las seis que faltan da error. Es la trampa habitual de este
 * proyecto: `is_active: 1` en las treinta, y las diferencias solo se ven
 * mirando qué hay al otro lado de la URL.
 *
 *  - **Cinco son de `api.pirineu365.cat`**, que redirige a `statics.3cat.cat`.
 *    La imagen es de la Corporació Catalana de Mitjans Audiovisuals, no de
 *    FGC: la CC-BY del conjunto de datos cubre el conjunto, no el material de
 *    un tercero que solo está enlazado. Además llegan con una hora de retraso
 *    y **tres de las cinco tienen la coordenada en Madrid**.
 *  - **Una es de `webtv.feratel.com`** y devuelve 404. Es un reproductor
 *    incrustado, no una imagen.
 *
 * Quedan 24: doce JPEG directos y doce panorámicas de Roundshot.
 *
 * ## Las coordenadas no se creen
 *
 * Tres cámaras llevan `40.3298, -3.7793` —el centro de la península, a 500 km—
 * y dos de Vallter llevan la longitud a cero, que cae en Francia. El filtro es
 * el único que este proyecto puede aplicar con datos propios: **la ubicación
 * publicada más cercana tiene que estar a menos de 20 km**. Con 4.250 fichas
 * repartidas por todo el país, eso acepta cualquier punto de Catalunya y
 * rechaza los dos casos de golpe.
 *
 * Una cámara sin coordenada fiable **no desaparece**: sale en el índice, en su
 * estación, y lo que no tiene es sitio en la ficha de ningún municipio. Vallter
 * se queda sin ninguna colocada, porque las dos que tiene están mal y no hay
 * ninguna hermana buena de la que deducir la estación.
 *
 * ## Roundshot: dos maneras de datar mal la foto y una de datarla bien
 *
 * La página de cada panorámica trae `og:image` con el número de cámara
 * —`/cams/1116`, que redirige a la imagen del momento— y también un
 * `og:updated_time`. Ese segundo campo es **la hora en que se ha generado la
 * página**, no la de la fotografía: las doce cámaras devolvían el mismo
 * segundo.
 *
 * El `Last-Modified` de la imagen sí es bueno, pero **no siempre está**: falta
 * justo en las cámaras paradas, que son las que más importa datar. Dos daban
 * `null` mientras servían la foto de hacía un mes.
 *
 * Lo que sí está siempre es el destino de la redirección, que lleva el instante
 * en la ruta: `…/2026-09-02/15-40-00/2026-09-02-15-40-00_medium.jpg`. Es la
 * hora **local de Madrid** —comprobado contra el `Last-Modified` de la que sí
 * lo traía: 15:40 local, 13:42 UTC— y de ahí sale la fecha de las panorámicas.
 *
 * Y como una suposición sobre husos horarios que nadie vuelve a mirar es una
 * suposición que un día cambia sin avisar, **se verifica en cada vuelta**:
 * donde hay `Last-Modified`, las dos horas tienen que caer a menos de un cuarto
 * de hora la una de la otra. Si algún día Roundshot pasa la ruta a UTC, esto
 * salta con dos horas de diferencia en vez de datar mal las veinticuatro.
 *
 * ## Y una cámara puede llevar meses congelada
 *
 * «Cap TC Express 2.535m» de Boí Taüll servía el 2 de septiembre de 2026 una
 * imagen del **10 de abril**, con 200 y con `is_active: 1`. Es el mismo
 * problema que las banderas de playa: nadie apaga una cámara, simplemente deja
 * de mandar. Por eso cada imagen viaja con su hora de captura y la aplicación
 * no enseña ninguna que pase de las horas de `src/lib/cameras.ts`.
 *
 * ## Y no se vuelve a subir la misma foto
 *
 * Con el nombre del fichero fijo —`<id>.jpg`, que es lo que evita acumular
 * gigas de fotogramas viejos— una cámara parada haría veinticuatro escrituras
 * diarias de los mismos bytes. Es el error que ya costó caro en el radar. Si la
 * hora de captura no ha cambiado desde la vuelta anterior, no se reescala ni se
 * sube nada y la ficha se conserva tal cual.
 *
 * La vuelta anterior se lee **del almacén** con `pullSnapshot`, no del disco:
 * en un servidor de integración `data/cache/` arranca vacío, y «no hay nada
 * anterior» y «no lo he sabido leer» acabarían siendo lo mismo.
 *
 * Salida: data/cache/cameres.json + data/cache/cameres/<id>.jpg y <id>-t.jpg
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { fetchWithRetry, throttledMap } from '../lib/http.ts';
import { build } from '../lib/paths.ts';
import { slugify } from '../lib/catalan.ts';
import {
  CACHE, DAILY_LIMITS, QuotaGuard, markForPublish, publish, pullSnapshot, recordFreshness,
  syncState, writeSnapshot,
} from '../lib/store.ts';
import type { Camera, CamerasData } from '../../src/lib/camera-types.ts';

const API = 'https://dadesobertes.fgc.cat/api/explore/v2.1/catalog/datasets'
  + '/webcams-actives-tim/records?limit=100';

/** Ancho de la imagen que se enseña en la página de cada cámara. */
const VIEW_W = 1280;
/** Y el de la miniatura del índice, recortada a 16:9 para que la reja cuadre. */
const THUMB_W = 400;
const THUMB_H = 225;

/**
 * Distancia máxima a la ubicación publicada más cercana para creerse la
 * coordenada. Ver la cabecera: es el filtro de las coordenadas inventadas.
 */
const MAX_NEAREST_KM = 20;

/** Y hasta dónde se acepta una cámara como «propia» de un municipio. */
const CAMERA_NEAR_KM = 25;

/**
 * Proveedores de los que se baja, y cómo.
 *
 * Lo que no está en esta tabla no se baja, y el worker dice cuántos ha dejado
 * fuera y por qué. Una fuente nueva en el catálogo de FGC tiene que pasar por
 * aquí a mano: la licencia y el formato hay que mirarlos, no adivinarlos.
 */
const PROVIDERS: Record<string, 'direct' | 'roundshot'> = {
  'media.turismefgc.cat': 'direct',
  'app.projecte4estacions.com': 'direct',
  'fgc.roundshot.com': 'roundshot',
};

/** Y por qué se queda fuera cada uno de los otros, para que salga en el log. */
const EXCLUDED: Record<string, string> = {
  'api.pirineu365.cat': 'imatge de la CCMA, fora de la CC-BY del conjunt',
  'webtv.feratel.com': 'reproductor incrustat, no una imatge (404)',
};

interface FgcRecord {
  id: number;
  business_unit: string;
  name_bu: string;
  nom_servei: string;
  tipus_servei: string;
  is_active: number;
  url: string;
  coordenadas: { lat: number; lon: number } | null;
}

interface BuildLocation {
  id: string;
  level: string;
  nom: string;
  path: string;
  lat: number | null;
  lon: number | null;
  published: boolean;
}

const CAM_DIR = join(CACHE, 'cameres');

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * El nombre de la cámara, quitándole lo que no es el sitio.
 *
 * El catálogo mete el aparato en el nombre del lugar: «Webcam 360 Cap de
 * Comella Inferior 1664m», «Cap TC Mulleres 2.270m P4E», «Vista webcam TV3».
 * Lo que el lector necesita es el sitio y la altitud por separado.
 *
 * La altitud solo se acepta cuando lleva la `m` detrás. Sin esa condición,
 * «Pla de Vaques 2020 Vista TC Junior» daría una cámara a 2.020 m que igual lo
 * es y igual es un año: no se adivina, se deja el número dentro del nombre.
 */
export function cleanName(raw: string): { name: string; altitudM: number | null } {
  let s = raw.trim();

  const alt = s.match(/(\d[.\s]?\d{3})\s?m(?![a-zA-Z])/);
  const altitudM = alt ? Number(alt[1].replace(/[.\s]/g, '')) : null;
  if (alt) s = s.replace(alt[0], ' ');

  s = s
    .replace(/\bP4E\b/g, ' ')
    .replace(/^\s*(Webcam|Livecam|Vista)\s+/i, '')
    .replace(/^\s*360\s+/, '')
    .replace(/\s+360\s*$/, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s*-\s*$/, '')
    .trim();

  return { name: s || raw.trim(), altitudM };
}

/**
 * El sitio, sin repetir la estación que ya va delante.
 *
 * El catálogo escribe «Port Ainé - Cota 2000 Hotel» dentro de la unidad de
 * negocio «Port Ainé», y enseñarlo tal cual da «Port Ainé · Port Ainé - Cota
 * 2000 Hotel». Se quita el prefijo cuando lo hay, y si no queda nada detrás
 * —«Parc Astronòmic» dentro de «Parc Astronòmic»— se deja el nombre entero,
 * que es mejor que una fila vacía.
 */
function withoutResort(resort: string, name: string): string {
  const low = name.toLowerCase();
  if (!low.startsWith(resort.toLowerCase())) return name;
  const rest = name.slice(resort.length).replace(/^[\s-–·]+/, '').trim();
  return rest || name;
}

/**
 * El slug de una cámara: estación, sitio y —si el nombre la traía— la altitud.
 *
 * La altitud no es decoración. La Molina tiene dos cámaras que se llaman las
 * dos «Torrent Negre» —una a pie de pista y la panorámica de 2.040 m— y sin
 * ella comparten URL: la segunda taparía a la primera sin que nada fallara.
 */
function slugOf(resort: string, name: string, altitudM: number | null): string {
  const site = withoutResort(resort, name);
  const base = site === name ? `${resort} ${name}` : `${resort} ${site}`;
  return slugify(altitudM ? `${base} ${altitudM}` : base);
}

/**
 * «2026-09-02 15:40» en Madrid → el instante en UTC.
 *
 * Sin biblioteca y sin restar horas a mano, que es lo que se rompe el domingo
 * del cambio: se supone que la hora leída es UTC, se pregunta qué hora marca
 * ese instante en Madrid, y la diferencia es el desplazamiento que hay que
 * quitar. Se repite una vez porque en la madrugada del cambio horario el
 * desplazamiento del instante supuesto y el del real no son el mismo.
 */
function madridToUtc(y: number, mo: number, d: number, h: number, mi: number): Date {
  const wall = Date.UTC(y, mo - 1, d, h, mi);
  let guess = wall;
  for (let i = 0; i < 2; i++) {
    const asMadrid = new Date(guess)
      .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
      .replace(' ', 'T');
    const offset = Date.parse(`${asMadrid}Z`) - guess;
    guess = wall - offset;
  }
  return new Date(guess);
}

/**
 * El instante de una panorámica, de la ruta del fichero al que ha redirigido.
 *
 * Ver la cabecera: es lo único que traen todas, y el `Last-Modified` —cuando
 * está— sirve para comprobar que la ruta sigue siendo hora local.
 */
function roundshotCapturedAt(finalUrl: string, lastModified: string | null): Date {
  const m = finalUrl.match(/[/](\d{4})-(\d{2})-(\d{2})[/](\d{2})-(\d{2})-(\d{2})[/]/);
  if (!m) {
    throw new Error(
      `Roundshot ha canviat les rutes: ${finalUrl} no porta l'instant a dins. `
      + 'Sense aixo no es pot datar la fotografia, i una foto sense hora no es publica.',
    );
  }
  const at = madridToUtc(Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4]), Number(m[5]));

  if (lastModified) {
    const header = Date.parse(lastModified);
    if (!Number.isNaN(header) && Math.abs(header - at.getTime()) > 15 * 60_000) {
      throw new Error(
        `La ruta de Roundshot i el Last-Modified no diuen el mateix: ${at.toISOString()} `
        + `contra ${new Date(header).toISOString()}. La ruta ja no es hora local de Madrid.`,
      );
    }
  }
  return at;
}

/** El número de cámara de Roundshot, que solo está en el `og:image` de su página. */
async function roundshotCam(pageUrl: string): Promise<string> {
  const clean = pageUrl.replace(/#.*$/, '');
  const url = clean.endsWith('/') ? clean : `${clean}/`;
  const res = await fetchWithRetry(url, { retries: 3, timeoutMs: 30_000 });
  const html = await res.text();
  const m = html.match(/og:image"\s+content="\/cams\/(\d+)"/);
  if (!m) {
    throw new Error(
      `Roundshot ha canviat la pagina de ${url}: no hi ha og:image amb /cams/<num>. `
      + 'Sense aquest numero no es pot arribar a la imatge del moment.',
    );
  }
  return m[1];
}

async function main() {
  await syncState();
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const res = await fetchWithRetry(API, { retries: 3, timeoutMs: 30_000 });
  const payload = (await res.json()) as { total_count: number; results: FgcRecord[] };
  quota.spend('fgc', 1);

  const all = payload.results ?? [];
  if (!all.length) throw new Error('El cataleg de FGC no ha retornat cap camera.');

  const municipis = (JSON.parse(readFileSync(build('locations.json'), 'utf8')) as BuildLocation[])
    .filter((l) => l.published && l.level === 'municipi' && l.lat != null && l.lon != null);

  // La vuelta anterior, del almacén. Nula la primera vez y nada más.
  const previous = await pullSnapshot<CamerasData>('cameres');
  const before = new Map<string, Camera>((previous?.data.cameras ?? []).map((c) => [c.id, c]));

  // ── Selección ────────────────────────────────────────────────────────────
  const dropped: string[] = [];
  const chosen: Array<{ rec: FgcRecord; kind: 'direct' | 'roundshot' }> = [];

  for (const rec of all) {
    if (!rec.is_active) { dropped.push(`${rec.nom_servei}: marcada com inactiva`); continue; }
    let host = '';
    try {
      host = new URL(rec.url).host;
    } catch {
      dropped.push(`${rec.nom_servei}: URL il·legible`);
      continue;
    }
    const kind = PROVIDERS[host];
    if (!kind) {
      dropped.push(`${rec.nom_servei}: ${EXCLUDED[host] ?? `proveïdor no revisat (${host})`}`);
      continue;
    }
    chosen.push({ rec, kind });
  }

  console.log(`Cataleg: ${all.length} cameres · ${chosen.length} utilitzables`);
  for (const d of dropped) console.log(`  fora — ${d}`);
  console.log();

  mkdirSync(CAM_DIR, { recursive: true });

  const cameras: Camera[] = [];
  const failures: string[] = [];
  let bytesIn = 0;
  let bytesOut = 0;
  let refreshed = 0;
  let unchanged = 0;
  let carried = 0;

  await throttledMap(chosen, async ({ rec, kind }) => {
    const id = String(rec.id);
    const resort = rec.name_bu.trim();
    const raw = cleanName(rec.nom_servei);
    const altitudM = raw.altitudM;
    const name = withoutResort(resort, raw.name);

    try {
      // ── La imagen del momento ─────────────────────────────────────────
      let imageUrl = rec.url;
      let viewer: string | null = null;
      if (kind === 'roundshot') {
        const cam = await roundshotCam(rec.url);
        quota.spend('fgc', 1);
        // `medium` son 1213×450: la panorámica entera a un tamaño que se puede
        // servir. `full` son 2,3 MB y `thumbnail` 404 píxeles de ancho.
        imageUrl = `https://fgc.roundshot.com/cams/${cam}/medium`;
        viewer = rec.url.replace(/#.*$/, '');
      }

      const img = await fetchWithRetry(imageUrl, { retries: 3, timeoutMs: 60_000 });
      quota.spend('fgc', 1);
      const src = Buffer.from(await img.arrayBuffer());
      bytesIn += src.length;

      const lastMod = img.headers.get('last-modified');
      let capturedAt: Date | null;
      if (kind === 'roundshot') {
        capturedAt = roundshotCapturedAt(img.url, lastMod);
      } else {
        capturedAt = lastMod ? new Date(lastMod) : null;
      }
      if (!capturedAt || Number.isNaN(capturedAt.getTime())) {
        throw new Error('la imatge no porta Last-Modified: no es pot datar');
      }
      const captured = capturedAt.toISOString();

      // ── La misma foto que la vuelta pasada ─────────────────────────────
      const kept = before.get(id);
      if (kept && kept.capturedAt === captured) {
        cameras.push({ ...kept, slug: slugOf(resort, name, altitudM) });
        unchanged++;
        return;
      }

      /*
       * `failOn: 'truncated'` y no el aviso, que es lo que sharp trae de serie.
       *
       * Cuatro de las veinticuatro traen basura antes de un marcador —«608
       * extraneous bytes before marker 0xfe»— y con la opción de serie eso es
       * un error: la cámara se quedaba fuera por una imagen que cualquier
       * navegador pinta sin pestañear. Un fichero cortado por la mitad sí sigue
       * fallando, que es la única forma de corrupción que importa aquí.
       */
      const opened = () => sharp(src, { failOn: 'truncated' });

      const meta = await opened().metadata();
      if (!meta.width || !meta.height) throw new Error('no sembla una imatge');

      // ── Reescalado ─────────────────────────────────────────────────────
      const view = await opened()
        .resize({ width: VIEW_W, withoutEnlargement: true })
        .jpeg({ quality: 72, progressive: true, mozjpeg: true })
        .toBuffer();
      const viewMeta = await sharp(view).metadata();

      const thumb = await opened()
        .resize({ width: THUMB_W, height: THUMB_H, fit: 'cover', position: 'centre' })
        .jpeg({ quality: 66, progressive: true, mozjpeg: true })
        .toBuffer();

      writeFileSync(join(CAM_DIR, `${id}.jpg`), view);
      writeFileSync(join(CAM_DIR, `${id}-t.jpg`), thumb);
      markForPublish(`cameres/${id}.jpg`);
      markForPublish(`cameres/${id}-t.jpg`);
      bytesOut += view.length + thumb.length;
      refreshed++;

      // ── La coordenada, si se la puede creer ────────────────────────────
      const lat = rec.coordenadas?.lat ?? null;
      const lon = rec.coordenadas?.lon ?? null;
      let nearest: Camera['nearest'] = null;
      let placed = false;

      if (lat != null && lon != null) {
        let best: { l: BuildLocation; d: number } | null = null;
        for (const l of municipis) {
          const d = distKm(lat, lon, l.lat as number, l.lon as number);
          if (!best || d < best.d) best = { l, d };
        }
        if (best && best.d <= MAX_NEAREST_KM) {
          placed = true;
          nearest = {
            id: best.l.id,
            nom: best.l.nom,
            path: best.l.path,
            distKm: Math.round(best.d * 10) / 10,
          };
        } else {
          console.log(
            `  coordenada no creible — ${resort} · ${name}: ${lat.toFixed(4)},${lon.toFixed(4)} `
            + `queda a ${best ? best.d.toFixed(0) : '—'} km de la ubicacio publicada mes propera`,
          );
        }
      }

      cameras.push({
        id,
        slug: slugOf(resort, name, altitudM),
        name,
        resort,
        altitudM,
        panoramic: kind === 'roundshot',
        viewer,
        lat: placed ? lat : null,
        lon: placed ? lon : null,
        nearest,
        capturedAt: captured,
        width: viewMeta.width ?? null,
        height: viewMeta.height ?? null,
      });
    } catch (err) {
      /*
       * Una cámara caída no puede tumbar las otras veintitrés: se apunta y se
       * sigue. Si caen todas, el `if` de más abajo sí lanza.
       *
       * Y si de esa cámara ya había una ficha, **se conserva**. El fallo
       * habitual aquí no es que la cámara se apague: es que se descarga el
       * fotograma justo mientras el proveedor lo está escribiendo y llega
       * cortado —«premature end of JPEG image»—. Tirar la ficha por eso haría
       * desaparecer la cámara del sitio durante una hora por un problema que
       * dura un segundo; y como la ficha conservada mantiene su hora de
       * captura, si de verdad ha dejado de mandar, el reloj lo dirá igual.
       */
      const kept = before.get(id);
      if (kept) {
        cameras.push({ ...kept, slug: slugOf(resort, name, altitudM) });
        carried++;
      }
      failures.push(`${resort} · ${name}: ${String(err).slice(0, 120)}`);
    }
  }, { concurrency: 4, minIntervalMs: 120 });

  if (failures.length) {
    console.log(`\nCameres que no han respost (${carried} amb la fitxa d'abans conservada):`);
    for (const f of failures) console.log(`  ${f}`);
  }
  if (!cameras.length) throw new Error('Cap camera no ha donat imatge.');

  // Slugs repetidos: dos cámaras con el mismo nombre en la misma estación
  // acabarían compartiendo URL, y la segunda taparía la primera sin dar error.
  const seen = new Map<string, string>();
  for (const c of cameras) {
    const prev = seen.get(c.slug);
    if (prev) throw new Error(`Dues cameres comparteixen el slug "${c.slug}": ${prev} i ${c.id}.`);
    seen.set(c.slug, c.id);
  }

  cameras.sort((a, b) => a.resort.localeCompare(b.resort, 'ca') || a.name.localeCompare(b.name, 'ca'));

  const placed = cameras.filter((c) => c.lat != null).length;
  const newest = cameras.reduce<string | null>(
    (acc, c) => (acc && acc > c.capturedAt ? acc : c.capturedAt),
    null,
  );

  const data: CamerasData = {
    cameras,
    nearKm: CAMERA_NEAR_KM,
    license: 'CC BY 4.0',
    attribution: 'Ferrocarrils de la Generalitat de Catalunya',
  };

  writeSnapshot('cameres', 'Ferrocarrils de la Generalitat de Catalunya', data, newest);
  recordFreshness({
    source: 'cameras',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: newest,
    // Se refresca cada hora; con 150 min una ejecución perdida no pinta el
    // panel de rojo, y dos sí.
    stalenessLimitMin: 150,
    rows: cameras.length,
    apiCalls: chosen.length * 2 + 1,
  });

  const stale = cameras.filter((c) => Date.now() - Date.parse(c.capturedAt) > 6 * 3600_000);
  if (stale.length) {
    console.log(`\nImatges de mes de sis hores (${stale.length}), que la web no ensenyara:`);
    for (const c of stale) console.log(`  ${c.resort} · ${c.name} — ${c.capturedAt}`);
  }

  console.log(
    `\n${cameras.length} cameres · ${placed} amb coordenada creible · `
    + `${refreshed} amb foto nova, ${unchanged} sense canvis, ${carried} conservades`,
  );
  console.log(
    `${(bytesIn / 1048576).toFixed(1)} MB baixats → ${(bytesOut / 1024).toFixed(0)} KB reescalats`,
  );
  console.log(
    `→ data/cache/cameres.json + ${refreshed * 2} imatges `
    + `(${((Date.now() - started) / 1000).toFixed(1)} s)`,
  );

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
  }
}

main().catch((err) => {
  recordFreshness({
    source: 'cameras',
    lastSuccessAt: '',
    lastDataTs: null,
    stalenessLimitMin: 150,
    rows: 0,
    apiCalls: 0,
    error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
