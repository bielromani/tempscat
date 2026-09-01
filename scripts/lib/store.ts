import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
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
 */
export function writeSnapshot<T>(name: string, source: string, data: T, dataTs: string | null): Snapshot<T> {
  ensure();
  const snap: Snapshot<T> = { fetchedAt: new Date().toISOString(), dataTs, source, data };
  const dest = join(CACHE, `${name}.json`);
  ensureFor(dest);
  const tmp = `${dest}.tmp`;
  writeFileSync(tmp, JSON.stringify(snap), 'utf8');
  renameSync(tmp, dest);
  return snap;
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
}

export function readFreshness(): Record<string, FreshnessEntry> {
  const p = join(CACHE, 'freshness.json');
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : {};
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
