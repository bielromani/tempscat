import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, sep } from 'node:path';
import { putObject, s3Config } from './s3.ts';
import { ROOT } from './paths.ts';

/**
 * Almacén de datos vivos (observación, predicción, avisos).
 *
 * Hoy escribe ficheros; cuando exista `DATABASE_URL` esta capa pasa a
 * PostgreSQL sin que los workers ni la aplicación se enteren. La frontera está
 * aquí a propósito: es lo que permite avanzar sin bloquearse esperando a
 * aprovisionar una base de datos.
 *
 * `data/cache/` no se versiona: son datos que caducan en minutos.
 */

export const CACHE = join(ROOT, 'data', 'cache');

function ensure() {
  if (!existsSync(CACHE)) mkdirSync(CACHE, { recursive: true });
}

/**
 * Un nombre de snapshot puede llevar carpeta: `forecast/c01`.
 *
 * La predicción se escribe en 43 trozos, uno por comarca, y no tiene sentido
 * que cada worker que parta un fichero se invente su propio `mkdir`.
 */
function ensureFor(dest: string) {
  const dir = dirname(dest);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

export interface Snapshot<T> {
  /** Cuándo se ejecutó la ingesta. */
  fetchedAt: string;
  /** Marca del dato más reciente que contiene. No es lo mismo, y la diferencia
   *  es justo lo que hay que enseñar al usuario. */
  dataTs: string | null;
  source: string;
  data: T;
}

/**
 * Escritura atómica: primero a un temporal y luego `rename`. Si el proceso
 * muere a media escritura, el fichero anterior sigue intacto — un JSON truncado
 * rompería la web entera hasta la siguiente ejecución.
 *
 * **Escribe siempre en disco**, aunque haya almacén remoto. El fichero local es
 * lo que hace que desarrollar siga siendo instantáneo y sin red, y es la copia
 * que queda si la subida falla.
 */
export function writeSnapshot<T>(name: string, source: string, data: T, dataTs: string | null): Snapshot<T> {
  ensure();
  const snap: Snapshot<T> = { fetchedAt: new Date().toISOString(), dataTs, source, data };
  const dest = join(CACHE, `${name}.json`);
  ensureFor(dest);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(snap), 'utf8');
  renameSync(tmp, dest);
  pending.add(`${name}.json`);
  return snap;
}

// ── Publicación al almacén de objetos ───────────────────────────────────────
//
// En producción no hay disco: la aplicación lee de un almacén de objetos, y
// esta es la otra mitad de esa frontera. La primera está en
// `src/lib/cache-store.ts`, y allí está escrito el porqué.
//
// La subida **no se hace fichero a fichero según se escriben**, sino al final,
// de una vez. Dos razones: un worker que muere a media ejecución no deja el
// almacén con la mitad de las comarcas actualizadas y la mitad no, y así la
// escritura en disco —que es lo que sostiene el desarrollo local— no depende de
// que haya red.

/** Ficheros escritos en esta ejecución, a la espera de publicarse. */
const pending = new Set<string>();

/** Marca un fichero suelto (una tesela de radar) para que se suba también. */
export function markForPublish(relativePath: string): void {
  pending.add(relativePath.split(sep).join('/'));
}

/**
 * Sube al almacén todo lo escrito en esta ejecución.
 *
 * Sin las variables de R2 no hace nada y lo dice: es el caso normal cuando se
 * trabaja en local, y no debe parecer un error. Con la configuración a medias
 * sí lanza —ver `s3Config()`—, porque eso no es «no publicar», es «creer que
 * publicas».
 */
export async function publish(): Promise<{ uploaded: number; bytes: number; skipped: boolean }> {
  const cfg = s3Config();
  if (!cfg) {
    pending.clear();
    return { uploaded: 0, bytes: 0, skipped: true };
  }

  const files = [...pending];
  pending.clear();

  let uploaded = 0;
  let bytes = 0;
  const failed: string[] = [];

  // De ocho en ocho. Subir 44 trozos de predicción en serie tarda una eternidad
  // y hacerlo todos a la vez satura la conexión y empieza a dar tiempos de
  // espera justo en los ficheros más grandes.
  const BATCH = 8;
  for (let i = 0; i < files.length; i += BATCH) {
    await Promise.all(files.slice(i, i + BATCH).map(async (rel) => {
      const local = join(CACHE, rel);
      if (!existsSync(local)) return;
      const body = readFileSync(local);
      try {
        await withRetry(() => putObject(cfg, rel, body, {
          contentType: rel.endsWith('.png') ? 'image/png' : 'application/json',
          // La aplicación ya memoriza por su cuenta y con su propio plazo. Que
          // el CDN se quede la copia más que eso solo añade un sitio donde el
          // dato envejece sin que nadie lo sepa.
          cacheSeconds: 60,
        }));
        uploaded++;
        bytes += body.byteLength;
      } catch (err) {
        failed.push(`${rel}: ${String(err).slice(0, 120)}`);
      }
    }));
  }

  if (failed.length) {
    console.warn(`\navís: ${failed.length} fitxers no s'han pogut publicar:`);
    for (const f of failed.slice(0, 5)) console.warn(`  ${f}`);
  }

  return { uploaded, bytes, skipped: false };
}

/**
 * Tres intentos, con una espera que crece.
 *
 * No es prudencia genérica: una vuelta de predicción sube 44 ficheros de hasta
 * un mega y basta con que uno se pierda para que una comarca entera se quede
 * con la predicción de la vuelta anterior — sin que nada dé error.
 */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  let last: unknown;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (attempt < 3) await new Promise((r) => setTimeout(r, attempt * 750));
    }
  }
  throw last;
}

export function readSnapshot<T>(name: string): Snapshot<T> | null {
  const p = join(CACHE, `${name}.json`);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, 'utf8')) as Snapshot<T>;
  } catch {
    return null;   // fichero corrupto: mejor volver a pedirlo que reventar
  }
}

/**
 * Lee un snapshot **de donde de verdad esté**: del almacén si lo hay, y si no
 * del disco.
 *
 * ## El día que esto faltó
 *
 * Un worker que fusiona con su estado anterior —la predicción, que conserva los
 * niveles que no toca; el histórico, que conserva las estaciones que fallaron—
 * usaba `readSnapshot()`, que lee **el disco local**. En una máquina que es
 * siempre la misma eso funciona. En un servidor de integración el disco arranca
 * vacío.
 *
 * Y entonces «no hay nada anterior» y «no lo he sabido encontrar» se convierten
 * en lo mismo, con el peor resultado posible: el worker de predicción refrescó
 * el nivel A, no encontró nada que conservar, y **publicó un almacén con 350
 * puntos de los 3.190**. Los niveles B y C desaparecieron de producción, y con
 * ellos la predicción de la mayoría de las 4.293 páginas. Ni un error: una
 * ejecución en verde.
 *
 * Por eso esta función **lanza** cuando no puede leer, en vez de devolver
 * `null`. Un 404 sí es `null` —esa fuente no existe todavía, que es un estado
 * legítimo el primer día— pero un fallo de red no puede parecerse a un almacén
 * vacío.
 */
export async function pullSnapshot<T>(name: string): Promise<Snapshot<T> | null> {
  const base = process.env.DATA_BASE_URL?.replace(/[/]$/, '');
  if (!base) return readSnapshot<T>(name);

  const res = await fetch(`${base}/${name}.json`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`no s'ha pogut llegir ${name} de l'emmagatzematge: HTTP ${res.status}`);
  return await res.json() as Snapshot<T>;
}

// ── Registro de frescura ────────────────────────────────────────────────────

export interface FreshnessEntry {
  source: string;
  lastSuccessAt: string;
  /** Marca del dato más reciente, no de la ejecución. */
  lastDataTs: string | null;
  /** A partir de cuántos minutos de retraso se considera obsoleto. */
  stalenessLimitMin: number;
  rows: number;
  apiCalls: number;
  error?: string;
}

/**
 * Deja constancia de cada ejecución. Alimenta el panel de estado público.
 *
 * Enseñar abiertamente cuándo se actualizó cada fuente por última vez es una
 * ventaja competitiva, no una debilidad: las webs que esconden que su dato lleva
 * seis horas parado pierden al usuario en cuanto lo descubre una vez.
 */
export function recordFreshness(entry: FreshnessEntry): void {
  ensure();
  const p = join(CACHE, 'freshness.json');
  const all: Record<string, FreshnessEntry> = existsSync(p)
    ? JSON.parse(readFileSync(p, 'utf8'))
    : {};
  all[entry.source] = entry;
  writeFileSync(p, JSON.stringify(all, null, 1), 'utf8');
  // El panel de estado lee este fichero, así que también tiene que viajar.
  pending.add('freshness.json');
}

export function readFreshness(): Record<string, FreshnessEntry> {
  const p = join(CACHE, 'freshness.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
}

/**
 * Publica **solo** el contador, ahora mismo.
 *
 * `publish()` sube todo al final, y para casi todos los workers eso basta. Para
 * el de predicción no: dura cuarenta minutos y gasta miles de unidades, así que
 * si lo matan a media ejecución —un tiempo de espera del servidor de
 * integración, una cancelación— el gasto queda hecho en Open-Meteo y **sin
 * registrar en ninguna parte**.
 *
 * Comprobado en real: dos ejecuciones interrumpidas gastaron 760 unidades que
 * el almacén no llegó a saber nunca. La siguiente vuelta habría creído tener
 * más presupuesto del que tenía.
 *
 * Se llama después de cada lote. Es un PUT de 300 bytes.
 */
export async function publishQuota(): Promise<void> {
  const cfg = s3Config();
  if (!cfg) return;
  const p = join(CACHE, 'quota.json');
  if (!existsSync(p)) return;
  try {
    await putObject(cfg, 'quota.json', readFileSync(p), {
      contentType: 'application/json', cacheSeconds: 0,
    });
    pending.delete('quota.json');
  } catch {
    // Que no puje el comptador no ha d'aturar la ingesta: al final de tot
    // `publish()` ho torna a intentar.
  }
}

/**
 * Se trae del almacén el estado que **tiene que sobrevivir entre ejecuciones**.
 *
 * Son dos ficheros y los dos tienen el mismo problema: `data/cache/` es un
 * disco, y en un servidor de integración cada ejecución arranca con un
 * contenedor limpio. Lo que se escribe fusionando con lo que ya había, sin
 * traerse antes lo que había, no fusiona nada: sustituye.
 *
 * ## El contador de cuota
 *
 * `QuotaGuard` lleva la cuenta en `quota.json`. Sin traerlo, el guardián cree
 * que no se ha gastado nada en todo el día — decorativo justo donde importa. El
 * síntoma no sería un error, sino un `429 Hourly API request limit exceeded` a
 * media tarde y media Catalunya sin predicción hasta el día siguiente.
 *
 * **Si no se puede leer, no se sigue.** Empezar con el contador a cero es la
 * manera de gastar la cuota de un mes en una tarde.
 *
 * ## El registro de frescura
 *
 * `freshness.json` guarda una entrada por fuente y lo alimenta la página
 * `/estat`. Se descubrió en producción: con los nueve workers ya corriendo
 * solos, `/estat` enseñaba **una sola fuente** — la del último que hubiera
 * pasado— porque cada uno publicaba un registro con su entrada y nada más.
 *
 * Que fallara justo esa página es lo peor que podía pasar: es la que existe
 * para decir la verdad sobre los datos.
 *
 * Aquí un fallo de lectura **no** detiene la ingesta: es un registro para
 * enseñar, no para decidir. Se avisa y se sigue.
 *
 * ## Sobre carreras
 *
 * Dos workers a la vez leen el mismo registro, cada uno añade su entrada y
 * publica. El último gana, y lo que se pierde es *la actualización* del otro,
 * no su entrada: la base ya las traía todas. Como mucho, una fuente se queda
 * una vuelta desactualizada en `/estat`, y se arregla sola.
 *
 * Hay que llamarlo **antes** de construir el guardián, porque su constructor
 * lee el fichero una sola vez.
 *
 * ## El contador puede llegar con un minuto de retraso, y da igual
 *
 * El almacén va detrás de un CDN que cachea un minuto largo — medido: hasta
 * unos tres, con `X-Vercel-Cache: HIT`. Un parámetro anticaché en la URL **no
 * lo esquiva**. No importa por cómo están repartidas las horas: las vueltas de
 * predicción, que son las únicas que gastan de verdad, van a hora y media unas
 * de otras.
 */
export async function syncState(): Promise<void> {
  const base = process.env.DATA_BASE_URL?.replace(/[/]$/, '');
  if (!base) return;   // en local los ficheros ya están donde toca

  ensure();

  const bring = async (name: string) => {
    const res = await fetch(`${base}/${name}`);
    if (res.status === 404) return;   // primer día: aún no existe
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    writeFileSync(join(CACHE, name), await res.text(), 'utf8');
  };

  try {
    await bring('quota.json');
  } catch (err) {
    throw new Error(`No s'ha pogut llegir el comptador de quota: ${err}`);
  }

  try {
    await bring('freshness.json');
  } catch (err) {
    console.warn(`avís: no s'ha pogut llegir el registre de frescor (${err}); `
      + 'aquesta volta el deixarà incomplet i la següent el refarà');
  }
}

// ── Control de cuota ────────────────────────────────────────────────────────

interface Spend { at: number; units: number }
interface QuotaState {
  day: string;
  used: Record<string, number>;
  /** Gastos recientes con marca de tiempo, para el límite por hora. */
  recent?: Record<string, Spend[]>;
}

/**
 * Contador de consumo por fuente y día.
 *
 * Open-Meteo factura **ubicaciones**, no peticiones — verificado con un 429
 * real. Por eso `spend()` recibe unidades, no llamadas: contar peticiones daría
 * una sensación de holgura que no existe.
 */
export class QuotaGuard {
  private state: QuotaState;
  private readonly path: string;
  private readonly limits: Record<string, number>;

  // Nota: nada de propiedades de parámetro (`constructor(private x)`) ni de
  // `enum` en este proyecto. Node 24 ejecuta TypeScript borrando tipos, sin
  // transformarlos, y esas dos construcciones generan código en tiempo de
  // ejecución, así que fallan al arrancar.
  constructor(limits: Record<string, number>) {
    this.limits = limits;
    ensure();
    this.path = join(CACHE, 'quota.json');
    const today = new Date().toISOString().slice(0, 10);
    const loaded: QuotaState | null = existsSync(this.path)
      ? JSON.parse(readFileSync(this.path, 'utf8'))
      : null;
    this.state = loaded && loaded.day === today ? loaded : { day: today, used: {} };
  }

  used(source: string): number { return this.state.used[source] ?? 0; }
  limit(source: string): number { return this.limits[source] ?? Infinity; }
  remaining(source: string): number { return this.limit(source) - this.used(source); }
  ratio(source: string): number { return this.used(source) / this.limit(source); }

  /** ¿Se puede gastar? Al 95 % se corta antes de que la fuente nos corte a nosotros. */
  canSpend(source: string, units: number): boolean {
    return (this.used(source) + units) / this.limit(source) < 0.95;
  }

  /** Por encima del 80 % conviene reducir modelos o frecuencia, no pararse. */
  isDegraded(source: string): boolean { return this.ratio(source) >= 0.8; }

  spend(source: string, units: number): void {
    this.state.used[source] = this.used(source) + units;
    this.state.recent ??= {};
    const list = this.state.recent[source] ?? [];
    list.push({ at: Date.now(), units });
    this.state.recent[source] = this.prune(list);
    writeFileSync(this.path, JSON.stringify(this.state), 'utf8');
    // El contador viaja con el resto. Ver `syncQuota()`: sin esto, cada
    // ejecución en un servidor de integración empezaría el día de cero.
    pending.add('quota.json');
  }

  // ── Límite por hora ───────────────────────────────────────────────────────
  //
  // El límite diario no es el único, y descubrirlo cuesta caro: un refresco
  // completo del territorio con el conjunto rico gastó 5.396 unidades en 18
  // minutos y la API respondió `429 Hourly API request limit exceeded`. Los
  // lotes fallidos parecían cortes de red, y no lo eran.
  //
  // Con lotes de 200 puntos y 19 variables —380 unidades cada uno— a un lote
  // cada 21 segundos salen unas 65.000 unidades por hora, trece veces el techo.
  // El ritmo no puede ser un intervalo fijo: tiene que derivarse del coste.

  private prune(list: Spend[]): Spend[] {
    const cutoff = Date.now() - 3_600_000;
    return list.filter((s) => s.at > cutoff);
  }

  /** Unidades gastadas en los últimos 60 minutos. */
  usedThisHour(source: string): number {
    const list = this.prune(this.state.recent?.[source] ?? []);
    return list.reduce((a, s) => a + s.units, 0);
  }

  /**
   * Milisegundos que hay que esperar para poder gastar `units` sin superar el
   * límite horario. Cero si cabe ahora mismo.
   */
  waitForHourly(source: string, units: number): number {
    const limit = HOURLY_LIMITS[source];
    if (!limit) return 0;

    const list = this.prune(this.state.recent?.[source] ?? []).sort((a, b) => a.at - b.at);
    let inWindow = list.reduce((a, s) => a + s.units, 0);
    if (inWindow + units <= limit * 0.95) return 0;

    // Se espera a que caduquen los gastos más antiguos, uno a uno, hasta que
    // quepa lo que viene.
    for (const s of list) {
      inWindow -= s.units;
      if (inWindow + units <= limit * 0.95) {
        return Math.max(0, s.at + 3_600_000 - Date.now()) + 1_000;
      }
    }
    return 3_600_000;
  }

  report(): string {
    return Object.keys(this.limits)
      .map((s) => `${s}: ${this.used(s).toLocaleString('es-ES')}/${this.limit(s).toLocaleString('es-ES')} (${(this.ratio(s) * 100).toFixed(1)} %)`)
      .join(' · ');
  }
}

/**
 * Límites diarios. Los de Open-Meteo son los del tier gratuito y se cuentan en
 * ubicaciones consultadas, no en peticiones HTTP.
 */
export const DAILY_LIMITS: Record<string, number> = {
  'open-meteo': 10_000,
  /*
   * La API de calidad del aire de Open-Meteo tiene **contador propio**: no
   * comparte cuota con la de predicción, aunque comparta empresa y formato.
   *
   * Es lo que hace que el bloque de aire salga gratis en términos de riesgo. Si
   * compartiera contador no cabría: la predicción ya va al límite del techo
   * mensual, y añadir aire habría obligado a quitar modelos.
   *
   * Se contabiliza aparte a propósito. Meterlo en el mismo cubo daría una
   * lectura falsa en las dos direcciones: alarma cuando no la hay y holgura
   * donde no la hay tampoco.
   */
  'open-meteo-air': 10_000,
  /* El model marí, com el de l'aire, té el seu propi comptador. */
  'open-meteo-marine': 10_000,
  'aemet': 5_000,
  'socrata': 100_000,   // sin límite duro documentado; se vigila igual
  /*
   * RainViewer no publica límite y sirve teselas cacheadas por CDN. Se cuenta
   * igual: una fuente gratuita sin contador es la que más fácil se abusa por
   * accidente, y un bucle mal escrito no debe descubrirse en su registro.
   */
  'rainviewer': 20_000,
};

/**
 * Límites por hora. Open-Meteo tiene tres techos simultáneos —600/minuto,
 * 5.000/hora y 10.000/día— y además un tope mensual de 300.000, que a 30 días
 * sale a 9.677/día: más apretado que el diario.
 *
 * El que corta primero en un refresco masivo es el horario.
 */
export const HOURLY_LIMITS: Record<string, number> = {
  'open-meteo': 5_000,
  'open-meteo-air': 5_000,
  'open-meteo-marine': 5_000,
};

/** Tope mensual, el que de verdad limita el diseño a largo plazo. */
export const MONTHLY_LIMITS: Record<string, number> = {
  'open-meteo': 300_000,
  'open-meteo-air': 300_000,
  'open-meteo-marine': 300_000,
};
