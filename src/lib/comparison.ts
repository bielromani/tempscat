import 'server-only';
import { currentFor, historyFor, localToday } from './weather';
import { comarcaOf, municipisOfComarca, type Comarca, type Location } from './territory';

/**
 * Comparativa de una ubicación dentro de su comarca.
 *
 * Es la pregunta que nadie más responde y que la gente de aquí sí se hace: no
 * «quants graus fa», sino **«fa més fred aquí que a la resta?»**. La respuesta
 * sale de datos que ya están en memoria, así que no cuesta ninguna petición.
 *
 * ## Dos advertencias que van en la propia página
 *
 * 1. Los valores comparados son **lecturas de estación corregidas por
 *    desnivel**, no medidas en cada pueblo. Es la tesis del proyecto —un núcleo
 *    a 300 m por encima de su capital hace 2 °C menos, y ninguna web lo
 *    refleja—, pero si media comarca cuelga de la misma estación, la
 *    clasificación es en buena parte una clasificación de altitudes. Por eso se
 *    cuenta cuántas estaciones distintas intervienen: con una sola, el bloque lo
 *    dice en vez de fingir una comparación entre medidas independientes.
 *
 * 2. Ahora mismo y este mes son preguntas distintas y se responden por
 *    separado. Una mañana de inversión térmica puede poner el fondo de valle
 *    más frío que la carena, y eso no describe el mes.
 */

/** Gradiente térmico estándar, °C por metro. El mismo que usa el resto del código. */
const LAPSE_RATE = 0.0065;

export interface RankedPlace {
  id: string;
  nom: string;
  path: string;
  altitud: number | null;
  value: number;
  /** Es la ubicación de la ficha que se está mirando. */
  self: boolean;
}

export interface Ranking {
  /** Posición desde el más frío: 1 es el más fresco. */
  rank: number;
  total: number;
  value: number;
  /** Diferencia con la mediana de la comarca. */
  vsMedian: number;
  coldest: RankedPlace;
  warmest: RankedPlace;
  /** Los vecinos inmediatos en la clasificación, para situarse sin leer la lista entera. */
  around: RankedPlace[];
  /** Estaciones distintas que alimentan la comparación. */
  nStations: number;
}

export interface ComarcaComparison {
  comarca: Comarca;
  now: Ranking | null;
  month: Ranking | null;
  /** Nombre del mes en curso, para el encabezado. */
  monthNumber: number;
  /** Posición por altitud, que siempre está disponible aunque no haya observación. */
  altitude: { rank: number; total: number } | null;
}

interface Candidate { loc: Location; value: number; station: string | null }

/** Ordena, sitúa la ubicación y recorta el entorno visible. */
function rank(items: Candidate[], selfId: string): Ranking | null {
  if (items.length < 4) return null;
  const sorted = [...items].sort((a, b) => a.value - b.value);
  const idx = sorted.findIndex((c) => c.loc.id === selfId);
  if (idx < 0) return null;

  const toPlace = (c: Candidate): RankedPlace => ({
    id: c.loc.id, nom: c.loc.nom, path: c.loc.path,
    altitud: c.loc.altitud, value: c.value, self: c.loc.id === selfId,
  });

  const values = sorted.map((c) => c.value);
  const mid = Math.floor(values.length / 2);
  const median = values.length % 2 ? values[mid] : (values[mid - 1] + values[mid]) / 2;

  // Tres por debajo y tres por encima, corridos hacia dentro cuando la ubicación
  // está en un extremo: una tira de siete que siempre tiene siete.
  const from = Math.max(0, Math.min(idx - 3, sorted.length - 7));
  const around = sorted.slice(from, from + 7).map(toPlace);

  return {
    rank: idx + 1,
    total: sorted.length,
    value: sorted[idx].value,
    vsMedian: Math.round((sorted[idx].value - median) * 10) / 10,
    coldest: toPlace(sorted[0]),
    warmest: toPlace(sorted[sorted.length - 1]),
    around,
    nStations: new Set(items.map((c) => c.station).filter(Boolean)).size,
  };
}

/**
 * Media de las temperaturas medias diarias del mes en curso en la estación de
 * referencia, corregida por el desnivel de esta ubicación.
 *
 * Se exige un mínimo de días: con tres, la «media del mes» es la media de tres
 * días, y ponerla al lado de otra calculada sobre veinte es comparar cosas
 * distintas con la misma etiqueta.
 */
function monthMean(loc: Location, today: string): number | null {
  const hist = historyFor(loc);
  if (!hist) return null;
  const month = today.slice(0, 7);
  const days = hist.daily.filter((d) => d.day.startsWith(month) && d.tMean != null);
  if (days.length < 7) return null;

  const mean = days.reduce((a, d) => a + d.tMean!, 0) / days.length;
  const dAlt = loc.stationRef?.dAltM ?? null;
  const adjusted = dAlt != null ? mean - dAlt * LAPSE_RATE : mean;
  return Math.round(adjusted * 10) / 10;
}

/**
 * Compara una ubicación con los municipios de su comarca.
 *
 * El conjunto de referencia son los **municipios**, no todos los núcleos: son
 * los nombres que la gente reconoce, y añadir 3.300 entidades convertiría «el
 * tercer més fred de la comarca» en «el 87è», que no dice nada. La ubicación de
 * la ficha entra en el conjunto aunque sea un núcleo, que es de lo que se trata.
 */
export function comarcaComparison(loc: Location): ComarcaComparison | null {
  const comarca = comarcaOf(loc);
  if (!comarca) return null;

  const today = localToday();
  const peers = municipisOfComarca(comarca.codi).filter((m) => m.id !== loc.id);
  const pool = [loc, ...peers];

  const nowItems: Candidate[] = [];
  const monthItems: Candidate[] = [];
  for (const p of pool) {
    const cur = currentFor(p);
    if (cur?.temperatureAdjusted != null) {
      nowItems.push({ loc: p, value: cur.temperatureAdjusted, station: cur.station.codi });
    }
    const m = monthMean(p, today);
    if (m != null) monthItems.push({ loc: p, value: m, station: p.stationRef?.codi ?? null });
  }

  const withAlt = pool.filter((p) => p.altitud != null);
  const altSorted = [...withAlt].sort((a, b) => (b.altitud ?? 0) - (a.altitud ?? 0));
  const altIdx = altSorted.findIndex((p) => p.id === loc.id);

  return {
    comarca,
    now: rank(nowItems, loc.id),
    month: rank(monthItems, loc.id),
    monthNumber: Number(today.slice(5, 7)),
    altitude: altIdx >= 0 && altSorted.length >= 4
      ? { rank: altIdx + 1, total: altSorted.length }
      : null,
  };
}

// ── Resumen de comarca ──────────────────────────────────────────────────────

export interface ComarcaSummary {
  /** Municipios con lectura reciente. */
  withData: number;
  total: number;
  coldest: { nom: string; path: string; value: number } | null;
  warmest: { nom: string; path: string; value: number } | null;
  /** Extremos del día natural, medidos, no previstos. */
  dayMax: { nom: string; path: string; value: number } | null;
  dayMin: { nom: string; path: string; value: number } | null;
  /** Municipios donde ha llovido hoy y cuánto en el que más. */
  rainedCount: number;
  rainMax: { nom: string; path: string; value: number } | null;
  /** Estaciones distintas que alimentan la comarca. */
  nStations: number;
}

/**
 * Lo que está pasando en una comarca, a partir de la observación.
 *
 * Sale solo de `xema-current`, que ya está en memoria: nada de predicción. La
 * predicción por comarca exigiría agregar `forecastFor` de hasta 68 municipios —
 * cada uno con su consenso hora a hora sobre 168 horas— y eso convierte una
 * página de listado en la más cara del sitio a cambio de una frase.
 *
 * Con la observación basta para lo que la frase tiene que decir: dónde hace más
 * frío y más calor **ahora**, cuánto se ha llegado a hacer hoy y si ha llovido.
 */
export function comarcaSummary(comarcaCodi: string): ComarcaSummary | null {
  const municipis = municipisOfComarca(comarcaCodi);
  if (!municipis.length) return null;

  const rows = municipis
    .map((m) => ({ m, cur: currentFor(m) }))
    .filter((r): r is { m: Location; cur: NonNullable<ReturnType<typeof currentFor>> } => r.cur != null);

  const place = (m: Location, value: number) => ({ nom: m.nom, path: m.path, value });

  const best = (
    get: (c: NonNullable<ReturnType<typeof currentFor>>) => number | null,
    dir: 'max' | 'min',
  ) => {
    let out: { nom: string; path: string; value: number } | null = null;
    for (const { m, cur } of rows) {
      const v = get(cur);
      if (v == null) continue;
      if (!out || (dir === 'max' ? v > out.value : v < out.value)) out = place(m, v);
    }
    return out;
  };

  const rained = rows.filter((r) => (r.cur.todayPrecip ?? 0) > 0);

  return {
    withData: rows.filter((r) => r.cur.temperatureAdjusted != null).length,
    total: municipis.length,
    coldest: best((c) => c.temperatureAdjusted, 'min'),
    warmest: best((c) => c.temperatureAdjusted, 'max'),
    dayMax: best((c) => c.todayMax, 'max'),
    dayMin: best((c) => c.todayMin, 'min'),
    rainedCount: rained.length,
    rainMax: best((c) => c.todayPrecip, 'max'),
    nStations: new Set(rows.map((r) => r.cur.station.codi)).size,
  };
}
