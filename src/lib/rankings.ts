import 'server-only';
import {
  allObservations, currentFor, localToday, type RawObservation,
} from './weather';
import { msToKmh } from './variables';
import {
  allComarques, municipisOfComarca, operativeStations,
  type Location, type Station,
} from './territory';

/**
 * Ránquings diarios: el pueblo más frío, el más cálido, el más lluvioso.
 *
 * ## Por qué hay dos clasificaciones y no una
 *
 * Son dos preguntas distintas y mezclarlas sería hacer trampa:
 *
 *  · **Las estaciones** dan la respuesta medida. 183 termómetros reales, sin
 *    interpretación. Es indiscutible y es lo que hay que publicar primero.
 *
 *  · **Los pueblos** son la respuesta que la gente busca, y sale de corregir la
 *    lectura de la estación de referencia por el desnivel. Es la tesis del
 *    proyecto y es información real —29 % de las entidades están a 100 m o más
 *    del núcleo de su municipio—, pero es una **estimación**, no una medida.
 *
 * Publicar solo la primera es esconder el valor añadido; publicar solo la
 * segunda es vender como medido algo que es calculado. Van las dos, etiquetadas.
 *
 * ## El límite de los 300 metros
 *
 * En la clasificación de pueblos solo entran ubicaciones a menos de 300 m de
 * desnivel de su estación. Por encima, el gradiente estándar de 6,5 °C/km deja
 * de ser defendible para una sola estación: en una noche de inversión térmica el
 * signo se invierte, y un núcleo a 700 m por encima de su estación aparecería
 * como el punto más frío de Catalunya por pura aritmética. Sería un artefacto
 * presentado como un titular.
 */

export interface StationRow {
  codi: string;
  nom: string;
  altitud: number | null;
  comarcaNom: string | null;
  value: number;
  /** Segundo número que da contexto: la mínima junto a la máxima, la hora, etc. */
  note?: string;
  /** Página de la ubicación poblada más cercana, si la hay. */
  path?: string;
  placeNom?: string;
  distKm?: number;
}

export interface PlaceRow {
  id: string;
  nom: string;
  path: string;
  altitud: number | null;
  comarcaNom: string;
  value: number;
  /** Desnivel respecto a su estación: el lector tiene derecho a saber cuánta corrección lleva. */
  dAltM: number | null;
  stationNom: string;
}

export interface Rankings {
  observedAt: string | null;
  ageMin: number | null;
  source: string;
  /** Día natural al que se refieren los extremos. */
  day: string;
  stations: {
    nowColdest: StationRow[];
    nowWarmest: StationRow[];
    dayMax: StationRow[];
    dayMin: StationRow[];
    rain: StationRow[];
    gust: StationRow[];
    range: StationRow[];
    total: number;
  };
  places: {
    coldest: PlaceRow[];
    warmest: PlaceRow[];
    total: number;
    /** Cuántas se han descartado por tener más de 300 m de desnivel. */
    excluded: number;
  };
}

const TOP = 8;
/** Desnivel máximo admisible para publicar una temperatura corregida en un ránquing. */
const MAX_CORRECTION_M = 300;

/** Los N mayores por valor, sin ordenar la lista entera dos veces. */
function top<T>(items: T[], value: (x: T) => number, dir: 'asc' | 'desc'): T[] {
  return [...items]
    .sort((a, b) => (dir === 'asc' ? value(a) - value(b) : value(b) - value(a)))
    .slice(0, TOP);
}

export async function rankings(): Promise<Rankings | null> {
  const snap = await allObservations();
  if (!snap) return null;

  const stations = new Map(operativeStations().map((s) => [s.codi, s]));

  const describe = (s: Station, value: number, note?: string): StationRow => ({
    codi: s.codi,
    nom: s.nom,
    altitud: s.altitud,
    comarcaNom: s.comarcaNom ?? null,
    value,
    note,
    path: s.nearestLocation?.path,
    placeNom: s.nearestLocation?.nom,
    distKm: s.nearestLocation?.distKm,
  });

  interface Row { s: Station; o: RawObservation }
  const rows: Row[] = [];
  for (const o of snap.data) {
    const s = stations.get(o.station);
    if (s) rows.push({ s, o });
  }

  const nowTemp = rows
    .map((r) => ({ r, t: r.o.values.temperature?.value }))
    .filter((x): x is { r: Row; t: number } => x.t != null);

  const dayMaxRows = rows
    .map((r) => ({ r, v: r.o.today?.tMax }))
    .filter((x): x is { r: Row; v: number } => x.v != null);

  const dayMinRows = rows
    .map((r) => ({ r, v: r.o.today?.tMin }))
    .filter((x): x is { r: Row; v: number } => x.v != null);

  // Amplitud térmica del día: la diferencia entre máxima y mínima. Es el número
  // que separa el clima continental del litoral y no lo publica casi nadie, aun
  // siendo lo que explica que en el mateix dia caiguin gelades i faci 25 °C.
  const rangeRows = rows
    .map((r) => {
      const hi = r.o.today?.tMax;
      const lo = r.o.today?.tMin;
      return hi != null && lo != null ? { r, v: Math.round((hi - lo) * 10) / 10, hi, lo } : null;
    })
    .filter((x): x is { r: Row; v: number; hi: number; lo: number } => x != null);

  const rainRows = rows
    .map((r) => ({ r, v: r.o.today?.precip ?? null, v24: r.o.precip24h ?? null }))
    .filter((x) => (x.v ?? 0) > 0 || (x.v24 ?? 0) > 0);

  const gustRows = rows
    .map((r) => ({ r, v: r.o.values.wind_gust?.value }))
    .filter((x): x is { r: Row; v: number } => x.v != null && x.v > 0);

  // ── Pueblos, con la temperatura corregida por altitud ─────────────────────
  const places: PlaceRow[] = [];
  let excluded = 0;
  const comarcaNames = new Map(allComarques().map((c) => [c.codi, c.nom]));

  /*
   * Los 947 municipios en paralelo. No son 947 lecturas: todos salen de la
   * misma instantánea de observación, así que la primera la trae y las demás
   * la encuentran ya en memoria.
   */
  const observed = await Promise.all(
    publishedMunicipis().map(async (loc) => ({ loc, cur: await currentFor(loc) })),
  );
  for (const { loc, cur } of observed) {
    if (!cur || cur.temperatureAdjusted == null) continue;
    const dAlt = cur.station.dAltM;
    if (dAlt != null && Math.abs(dAlt) > MAX_CORRECTION_M) { excluded++; continue; }
    places.push({
      id: loc.id,
      nom: loc.nom,
      path: loc.path,
      altitud: loc.altitud,
      comarcaNom: comarcaNames.get(loc.comarcaCodi) ?? '',
      value: cur.temperatureAdjusted,
      dAltM: dAlt,
      stationNom: cur.station.nom,
    });
  }

  const newest = snap.data.reduce<string | null>(
    (acc, o) => (!acc || o.ts > acc ? o.ts : acc), null,
  );

  return {
    observedAt: newest,
    ageMin: newest ? Math.round((Date.now() - Date.parse(newest)) / 60_000) : null,
    source: snap.source,
    day: localToday(),
    stations: {
      nowColdest: top(nowTemp, (x) => x.t, 'asc').map((x) => describe(x.r.s, x.t)),
      nowWarmest: top(nowTemp, (x) => x.t, 'desc').map((x) => describe(x.r.s, x.t)),
      dayMax: top(dayMaxRows, (x) => x.v, 'desc').map((x) => describe(x.r.s, x.v)),
      dayMin: top(dayMinRows, (x) => x.v, 'asc').map((x) => describe(x.r.s, x.v)),
      range: top(rangeRows, (x) => x.v, 'desc').map((x) =>
        describe(x.r.s, x.v, `de ${x.lo.toFixed(1).replace('.', ',')} a ${x.hi.toFixed(1).replace('.', ',')} °C`)),
      rain: top(rainRows, (x) => x.v ?? x.v24 ?? 0, 'desc').map((x) =>
        describe(
          x.r.s,
          x.v ?? x.v24 ?? 0,
          x.v24 != null && x.v != null && x.v24 > x.v
            ? `${x.v24.toFixed(1).replace('.', ',')} mm en 24 h`
            : undefined,
        )),
      gust: top(gustRows, (x) => x.v, 'desc').map((x) =>
        describe(x.r.s, Math.round(msToKmh(x.v)))),
      total: rows.length,
    },
    places: {
      coldest: top(places, (p) => p.value, 'asc'),
      warmest: top(places, (p) => p.value, 'desc'),
      total: places.length,
      excluded,
    },
  };
}

/**
 * Municipios publicados de todas las comarcas.
 *
 * Se recorren las 43 comarcas en vez de filtrar las 11.019 ubicaciones: el
 * índice por comarca ya está construido, así que esto son 43 lecturas de un mapa
 * en vez de un barrido del fichero grande en cada render.
 */
function publishedMunicipis(): Location[] {
  return allComarques().flatMap((c) => municipisOfComarca(c.codi));
}
