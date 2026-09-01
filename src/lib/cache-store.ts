import 'server-only';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { get as httpsGet } from 'node:https';

/**
 * De dónde lee la aplicación los datos vivos.
 *
 * ## El problema que resuelve
 *
 * Los workers escriben instantáneas; las páginas las leen. Mientras todo corría
 * en una máquina, «leer» era `readFileSync` y no había nada más que decir.
 *
 * En producción no hay disco. Una función de Vercel arranca con el código del
 * despliegue y nada más: los 45 MB de `data/cache/` no viajan ahí dentro, y no
 * deberían aunque cupieran. **Meter los datos en el despliegue ataría la
 * frescura del dato a un `git push`**, que es exactamente lo contrario del
 * principio que ordena este proyecto — la ingesta está desacoplada del
 * renderizado.
 *
 * Así que los datos viven en un almacén de objetos y esto es la frontera.
 *
 * ## Dos modos, y el local no cambia
 *
 * Sin `BLOB_BASE_URL` se lee del disco igual que siempre, con la misma
 * memorización por `mtime`. Desarrollar sigue siendo instantáneo y sin red.
 *
 * Con `BLOB_BASE_URL` se lee por HTTP del almacén. Es lo que pasa en Vercel.
 *
 * ## Por qué no se usa `fetch`, ni siquiera para pedirlo
 *
 * La primera versión usaba `fetch(..., { cache: 'no-store' })`, y el resultado
 * fue **cero páginas estáticas**. Next instrumenta `globalThis.fetch`, y un
 * `no-store` durante la generación significa «esto no se puede prerenderizar»:
 * las 607 rutas pasaron a servirse en cada petición. El build no falló. Tardó
 * trece segundos, dijo que todo bien, y no dejó ni un solo HTML.
 *
 * Las alternativas dentro de `fetch` tampoco valen. `force-cache` congela el
 * dato para siempre, y `next: { revalidate }` arrastra el plazo de la página al
 * del fichero — un `revalidate` de cinco minutos en la observación convertiría
 * las 4.293 fichas en páginas que se rehacen cada cinco minutos. Y encima el
 * límite de la caché de datos son 2 MB por entrada, y el trozo de predicción
 * más grande ocupa 2,03: justo por encima, y de los que fallan callando.
 *
 * Así que se pide con `node:https` directamente. Next no ve la petición, no
 * decide nada por nosotros, y la única caché es la de aquí abajo — que es la
 * que queremos, con un plazo por fuente y una política de fallo escrita.
 *
 * ## Y si el almacén falla, se sirve lo viejo
 *
 * Un corte de red no puede dejar la web en blanco. Si la descarga falla y
 * tenemos una copia caducada, se devuelve esa: un dato de hace veinte minutos
 * con su hora bien puesta es infinitamente mejor que un hueco.
 */

const LOCAL = join(process.cwd(), 'data', 'cache');

/** Base pública del almacén, sin barra final. Vacío = modo disco. */
const REMOTE = process.env.BLOB_BASE_URL?.replace(/\/$/, '') ?? '';

export const IS_REMOTE = REMOTE !== '';

export interface Snapshot<T> {
  fetchedAt: string;
  /** Marca del dato más reciente que contiene. No es lo mismo que `fetchedAt`. */
  dataTs: string | null;
  source: string;
  data: T;
}

/**
 * Cuánto se guarda cada fuente antes de volver a preguntar.
 *
 * Sale de la cadencia real del worker que la escribe: pedirla más a menudo que
 * lo que tarda en cambiar es tráfico tirado, y menos es enseñar datos viejos
 * teniendo los nuevos al lado.
 */
const TTL_MS: Array<[RegExp, number]> = [
  [/^xema-current$/, 5 * 60_000],       // el worker corre cada 10 min
  [/^radar$/, 5 * 60_000],
  [/^warnings$/, 5 * 60_000],
  [/^sea$/, 10 * 60_000],
  [/^forecast\//, 30 * 60_000],         // se refresca cada 12-24 h
  [/^forecast\/index$/, 30 * 60_000],
  [/./, 60 * 60_000],                   // histórico, aire, agua: una vez al día
];

function ttlFor(name: string): number {
  for (const [re, ms] of TTL_MS) if (re.test(name)) return ms;
  return 60 * 60_000;
}

interface Entry { at: number; snap: Snapshot<unknown> | null }

const memo = new Map<string, Entry>();
/** Peticiones en vuelo, para que diez renders simultáneos no pidan diez veces. */
const inflight = new Map<string, Promise<Snapshot<unknown> | null>>();

/**
 * Cuántos trozos de predicción se guardan a la vez.
 *
 * Sin tope, un proceso que atendiera a las 43 comarcas acabaría con los 132 MB
 * que tenía el fichero único, solo que en cómodos plazos. Ocho porque la
 * generación recorre las rutas en orden alfabético y los municipios de una
 * comarca van seguidos.
 */
const MAX_FORECAST_SHARDS = 8;

function evictShards() {
  const shards = [...memo.keys()].filter((k) => k.startsWith('forecast/c'));
  for (const k of shards.slice(0, shards.length - MAX_FORECAST_SHARDS)) memo.delete(k);
}

function remember(name: string, snap: Snapshot<unknown> | null) {
  memo.delete(name);
  memo.set(name, { at: Date.now(), snap });
  evictShards();
}

// ── Modo disco ──────────────────────────────────────────────────────────────

const mtimes = new Map<string, number>();

function fromDisk<T>(name: string): Snapshot<T> | null {
  const p = join(LOCAL, `${name}.json`);
  if (!existsSync(p)) return null;
  try {
    const { mtimeMs } = statSync(p);
    const cached = memo.get(name);
    if (cached && mtimes.get(name) === mtimeMs) return cached.snap as Snapshot<T> | null;

    const snap = JSON.parse(readFileSync(p, 'utf8')) as Snapshot<T>;
    mtimes.set(name, mtimeMs);
    remember(name, snap);
    return snap;
  } catch {
    return null;
  }
}

// ── Modo almacén ────────────────────────────────────────────────────────────

/**
 * Una descarga, sin pasar por `fetch`.
 *
 * Devuelve `null` en un 404 —esa fuente aún no se ha ingerido nunca, que es un
 * estado normal— y lanza en cualquier otro caso, para que la política de
 * «sirve la copia vieja» de arriba pueda decidir.
 */
function download(url: string): Promise<Uint8Array | null> {
  return new Promise((resolve, reject) => {
    const req = httpsGet(url, (res) => {
      const status = res.statusCode ?? 0;
      if (status === 404) { res.resume(); resolve(null); return; }
      if (status < 200 || status >= 300) {
        res.resume();
        reject(new Error(`HTTP ${status}`));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
      res.on('error', reject);
    });
    req.on('error', reject);
    // Sin esto, un almacén que acepta la conexión y luego se queda callado
    // deja la generación de la página colgada para siempre.
    req.setTimeout(30_000, () => req.destroy(new Error('temps espera esgotat')));
  });
}

/**
 * Con reintentos, y esto no es prudencia genérica.
 *
 * Sin ellos, la primera generación completa contra el almacén perdió un trozo
 * de predicción por un tiempo de espera agotado —siete procesos de build
 * tirando de ficheros de un mega a la vez— y **las páginas de esa comarca
 * salieron sin predicción**. El build acabó diciendo que todo estaba bien.
 */
async function fromRemote<T>(name: string): Promise<Snapshot<T> | null> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const bytes = await download(`${REMOTE}/${name}.json`);
      if (!bytes) return null;   // 404: esa fuente aún no existe
      return JSON.parse(new TextDecoder().decode(bytes)) as Snapshot<T>;
    } catch (err) {
      last = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 500));
    }
  }
  throw last;
}

// ── La única puerta ─────────────────────────────────────────────────────────

/**
 * Una instantánea por nombre. `xema-current`, `forecast/c08`, `sea`…
 *
 * Devuelve `null` cuando esa fuente todavía no existe, que es un estado normal
 * —un despliegue nuevo antes de la primera ingesta— y no un error. Las páginas
 * ya saben decirlo: «Encara no hi ha observació disponible».
 */
export async function snapshot<T>(name: string): Promise<Snapshot<T> | null> {
  if (!IS_REMOTE) return fromDisk<T>(name);

  const cached = memo.get(name);
  if (cached && Date.now() - cached.at < ttlFor(name)) {
    return cached.snap as Snapshot<T> | null;
  }

  const running = inflight.get(name);
  if (running) return await running as Snapshot<T> | null;

  const task = fromRemote<T>(name)
    .then((snap) => { remember(name, snap); return snap; })
    .catch((err) => {
      // Se sirve lo viejo antes que un hueco. Un dato de hace veinte minutos,
      // con su hora bien puesta, sigue siendo un dato.
      if (cached) {
        console.warn(`cache-store: ${name} no s'ha pogut refrescar (${err}); se serveix la còpia anterior`);
        return cached.snap;
      }
      /*
       * Y si no hay copia, **se rompe**.
       *
       * Devolver null aquí era lo cómodo y estaba mal: una página se
       * renderizaba entera, sin predicción y sin decirlo, y quedaba guardada
       * así. Hay que distinguir dos cosas que no se parecen en nada:
       *
       *  · Un 404 —esa fuente no se ha ingerido nunca— sí devuelve null, y la
       *    página lo dice: «encara no hi ha observació disponible».
       *  · No poder llegar al almacén es una avería. Al generar, revienta el
       *    build, que es lo que queremos; en producción, ISR sigue sirviendo la
       *    versión anterior de la página en vez de sustituirla por una vacía.
       */
      throw new Error(`cache-store: ${name} no s'ha pogut llegir de l'emmagatzematge — ${err}`);
    })
    .finally(() => { inflight.delete(name); });

  inflight.set(name, task);
  return await task as Snapshot<T> | null;
}

/**
 * JSON que no tiene la forma `Snapshot`.
 *
 * Solo `freshness.json`, que es un registro plano de una entrada por worker y
 * no una instantánea de datos. No merece envolverse solo para que encaje.
 */
export async function plainJson<T>(name: string): Promise<T | null> {
  const bytes = await blob(`${name}.json`);
  if (!bytes) return null;
  try { return JSON.parse(new TextDecoder().decode(bytes)) as T; }
  catch { return null; }
}

/** Bytes crudos, para las teselas del radar, que son PNG y no JSON. */
export async function blob(path: string): Promise<Uint8Array | null> {
  if (!IS_REMOTE) {
    const p = join(LOCAL, path);
    return existsSync(p) ? new Uint8Array(readFileSync(p)) : null;
  }
  try {
    return await download(`${REMOTE}/${path}`);
  } catch {
    return null;
  }
}
