import 'server-only';
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

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
 * ## Por qué no se usa la caché de `fetch` de Next
 *
 * Sería lo natural, pero **su límite por entrada son 2 MB y el trozo de
 * predicción más grande ocupa 2,03**. Justo por encima, y de los que fallan sin
 * avisar: la entrada no se guarda, se vuelve a pedir en cada petición y nadie
 * ve un error. Se memoriza aquí, en el proceso, con un plazo por fuente.
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

async function fromRemote<T>(name: string): Promise<Snapshot<T> | null> {
  const res = await fetch(`${REMOTE}/${name}.json`, { cache: 'no-store' });
  if (!res.ok) {
    // 404 es una respuesta legítima: esa fuente aún no se ha ingerido nunca.
    if (res.status === 404) return null;
    throw new Error(`${res.status} en ${name}`);
  }
  return await res.json() as Snapshot<T>;
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
      console.error(`cache-store: ${name} il·legible i sense còpia — ${err}`);
      return null;
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
  const res = await fetch(`${REMOTE}/${path}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return new Uint8Array(await res.arrayBuffer());
}
