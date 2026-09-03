import { existsSync, readFileSync, writeFileSync } from 'node:fs';

export interface FetchOptions {
  /** Reintentos ante fallo de red o 5xx. */
  retries?: number;
  /** Espera base entre reintentos, en ms (backoff exponencial). */
  backoffMs?: number;
  timeoutMs?: number;
  headers?: Record<string, string>;
  /**
   * Per a les APIs que només accepten POST, com Overpass.
   *
   * Els reintents hi valen igual: el que es reintenta són errors de xarxa i
   * 5xx, i una consulta d'Overpass és idempotent — no crea res.
   */
  method?: 'GET' | 'POST';
  body?: string;
}

const UA = 'meteo-catalunya/0.1 (proyecto de datos abiertos; contacto en el repositorio)';

/**
 * `fetch` con reintentos, backoff exponencial y timeout.
 *
 * Los 4xx no se reintentan: un 404 o un 400 no mejoran esperando. Solo se
 * reintentan fallos de red, timeouts y 5xx/429.
 */
export async function fetchWithRetry(url: string, opts: FetchOptions = {}): Promise<Response> {
  const {
    retries = 4, backoffMs = 600, timeoutMs = 60_000, headers = {}, method, body,
  } = opts;

  let lastError: unknown;
  let retryAfterMs = 0;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (attempt > 0) {
      // Si el servidor dice cuánto esperar, se le hace caso: adivinarlo con
      // backoff exponencial contra un límite por minuto solo alarga la agonía.
      const wait = retryAfterMs || backoffMs * 2 ** (attempt - 1);
      await sleep(wait);
      retryAfterMs = 0;
    }
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method,
          body,
          headers: { 'User-Agent': UA, ...headers },
          signal: controller.signal,
        });
        if (res.ok) return res;
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new Error(`HTTP ${res.status} en ${url.slice(0, 120)}… (no se reintenta)`);
        }
        if (res.status === 429) {
          const ra = res.headers.get('retry-after');
          const parsed = ra ? Number(ra) : NaN;
          // Sin cabecera, un minuto: los límites de estas APIs son por minuto.
          retryAfterMs = Number.isFinite(parsed) ? parsed * 1000 : 60_000;
        }
        lastError = new Error(`HTTP ${res.status}`);
      } finally {
        clearTimeout(timer);
      }
    } catch (err) {
      if (err instanceof Error && err.message.includes('no se reintenta')) throw err;
      lastError = err;
    }
  }
  throw new Error(`Fallo tras ${retries + 1} intentos: ${url.slice(0, 150)}…\n  ${String(lastError)}`);
}

export async function fetchJson<T>(url: string, opts?: FetchOptions): Promise<T> {
  const res = await fetchWithRetry(url, opts);
  return (await res.json()) as T;
}

/**
 * Igual que `fetchJson` pero guardando la respuesta en disco. Si el fichero ya
 * existe se devuelve sin tocar la red, para que reejecutar el pipeline sea
 * barato y no castigue a las APIs públicas.
 */
export async function fetchJsonCached<T>(url: string, cacheFile: string, opts?: FetchOptions): Promise<T> {
  if (existsSync(cacheFile)) {
    return JSON.parse(readFileSync(cacheFile, 'utf8')) as T;
  }
  const data = await fetchJson<T>(url, opts);
  writeFileSync(cacheFile, JSON.stringify(data), 'utf8');
  return data;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Ejecuta tareas con concurrencia limitada y un intervalo mínimo entre lanzamientos.
 * Se usa para no saturar las APIs públicas que consumimos sin clave.
 */
export async function throttledMap<T, R>(
  items: T[],
  worker: (item: T, index: number) => Promise<R>,
  { concurrency = 4, minIntervalMs = 0, onProgress }: {
    concurrency?: number;
    minIntervalMs?: number;
    onProgress?: (done: number, total: number) => void;
  } = {},
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  let done = 0;
  let lastStart = 0;

  async function run(): Promise<void> {
    while (true) {
      const i = next++;
      if (i >= items.length) return;
      if (minIntervalMs > 0) {
        const wait = lastStart + minIntervalMs - Date.now();
        if (wait > 0) await sleep(wait);
        lastStart = Date.now();
      }
      results[i] = await worker(items[i], i);
      done++;
      onProgress?.(done, items.length);
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, run));
  return results;
}
