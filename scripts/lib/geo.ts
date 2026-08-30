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

/** Centroide simple de una nube de puntos (suficiente para comarcas). */
export function centroid(points: Array<{ lat: number; lon: number }>): { lat: number; lon: number } {
  const n = points.length;
  return {
    lat: points.reduce((s, p) => s + p.lat, 0) / n,
    lon: points.reduce((s, p) => s + p.lon, 0) / n,
  };
}
