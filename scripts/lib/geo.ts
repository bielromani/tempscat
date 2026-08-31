/** Utilidades geográficas mínimas: distancias y selección de estación de referencia. */

const R = 6371.0088; // radio medio terrestre, km
const rad = (d: number) => (d * Math.PI) / 180;

/** Distancia ortodrómica en km. */
export function haversineKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

/**
 * Coste combinado distancia/desnivel para elegir estación de referencia.
 *
 * 50 m de desnivel penalizan como 1 km de distancia horizontal. No es
 * arbitrario: el gradiente térmico vertical (~0,65 °C/100 m) hace que 300 m de
 * altura cambien más la temperatura que 10 km de separación en llano, así que
 * una estación cercana pero a otra cota es peor referencia que una algo más
 * lejana a la misma altura.
 */
export const ELEVATION_PENALTY_M_PER_KM = 50;

export function stationCost(distKm: number, dAltM: number): number {
  return distKm + Math.abs(dAltM) / ELEVATION_PENALTY_M_PER_KM;
}

export interface NearestOptions {
  /** Radio máximo de búsqueda en km. */
  maxKm?: number;
  /** Cuántos devolver. */
  k?: number;
}

export function nearest<T extends { lat: number; lon: number }>(
  from: { lat: number; lon: number },
  candidates: T[],
  { maxKm = Infinity, k = 1 }: NearestOptions = {},
): Array<{ item: T; distKm: number }> {
  const out: Array<{ item: T; distKm: number }> = [];
  for (const c of candidates) {
    const d = haversineKm(from.lat, from.lon, c.lat, c.lon);
    if (d <= maxKm) out.push({ item: c, distKm: d });
  }
  out.sort((a, b) => a.distKm - b.distKm);
  return out.slice(0, k);
}

/**
 * ¿Cae el punto dentro del anillo? Algoritmo de cruce de rayos.
 *
 * Se usa para asignar avisos oficiales a ubicaciones: los polígonos CAP de
 * AEMET no siguen los límites comarcales, así que emparejar por nombre de zona
 * daría avisos a municipios que no los tienen. La geometría no se equivoca.
 */
export function pointInRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

/** Caja envolvente, para descartar rápido antes del cálculo caro. */
export function ringBbox(ring: Array<[number, number]>): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Centroide simple de una nube de puntos (suficiente para comarcas). */
export function centroid(points: Array<{ lat: number; lon: number }>): { lat: number; lon: number } {
  const n = points.length;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lon: points.reduce((s, p) => s + p.lon, 0) / n,
  };
}

/**
 * UTM 31N (ETRS89, EPSG:25831) a coordenadas geográficas.
 *
 * Hace falta porque los datasets de agua de la ACA —embalses y aforos— dan la
 * posición en UTM y no en grados, y sin convertirla no se puede decir qué río
 * pasa cerca de un pueblo.
 *
 * Es la serie inversa de Kruger sobre el elipsoide GRS80, que es el de ETRS89.
 * No hace falta ninguna dependencia: son treinta líneas y el error frente a
 * proj4 se queda por debajo del metro en todo el ámbito catalán, que para situar
 * un aforo en un mapa sobra.
 *
 * Ojo con confundir ETRS89 y WGS84: en Europa difieren ya unos 80 cm por la
 * deriva de la placa, y aquí se tratan como el mismo sistema **a propósito**,
 * porque 80 cm no cambian a qué municipio pertenece un embalse.
 */
export function utm31ToLatLon(easting: number, northing: number): { lat: number; lon: number } {
  const a = 6378137.0;              // semieje mayor GRS80
  const f = 1 / 298.257222101;      // achatamiento GRS80
  const k0 = 0.9996;                // factor de escala UTM
  const lon0 = (31 * 6 - 183) * Math.PI / 180;   // meridiano central del huso 31

  const e2 = f * (2 - f);
  const e1 = (1 - Math.sqrt(1 - e2)) / (1 + Math.sqrt(1 - e2));

  const x = easting - 500_000;      // falso este
  const y = northing;               // hemisferio norte: sin falso norte

  const m = y / k0;
  const mu = m / (a * (1 - e2 / 4 - 3 * e2 * e2 / 64 - 5 * e2 ** 3 / 256));

  const phi1 = mu
    + (3 * e1 / 2 - 27 * e1 ** 3 / 32) * Math.sin(2 * mu)
    + (21 * e1 * e1 / 16 - 55 * e1 ** 4 / 32) * Math.sin(4 * mu)
    + (151 * e1 ** 3 / 96) * Math.sin(6 * mu)
    + (1097 * e1 ** 4 / 512) * Math.sin(8 * mu);

  const sinPhi1 = Math.sin(phi1);
  const cosPhi1 = Math.cos(phi1);
  const tanPhi1 = Math.tan(phi1);

  const ep2 = e2 / (1 - e2);
  const c1 = ep2 * cosPhi1 ** 2;
  const t1 = tanPhi1 ** 2;
  const n1 = a / Math.sqrt(1 - e2 * sinPhi1 ** 2);
  const r1 = a * (1 - e2) / (1 - e2 * sinPhi1 ** 2) ** 1.5;
  const d = x / (n1 * k0);

  const lat = phi1 - (n1 * tanPhi1 / r1) * (
    d * d / 2
    - (5 + 3 * t1 + 10 * c1 - 4 * c1 * c1 - 9 * ep2) * d ** 4 / 24
    + (61 + 90 * t1 + 298 * c1 + 45 * t1 * t1 - 252 * ep2 - 3 * c1 * c1) * d ** 6 / 720
  );

  const lon = lon0 + (
    d
    - (1 + 2 * t1 + c1) * d ** 3 / 6
    + (5 - 2 * c1 + 28 * t1 - 3 * c1 * c1 + 8 * ep2 + 24 * t1 * t1) * d ** 5 / 120
  ) / cosPhi1;

  return { lat: lat * 180 / Math.PI, lon: lon * 180 / Math.PI };
}
