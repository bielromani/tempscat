/**
 * Rejilla de calidad del aire.
 *
 * ## Por qué no se pide un punto por ubicación
 *
 * La predicción meteorológica se pide en 3.190 puntos porque los modelos que la
 * alimentan tienen 1,3 km de resolución y el relieve catalán cambia mucho en esa
 * distancia. La calidad del aire **no**: Open-Meteo la sirve desde CAMS Europa,
 * que trabaja a 0,1° — unos 11 km. Pedir dos puntos separados por 3 km devuelve
 * dos veces el mismo número interpolado, y se paga dos veces.
 *
 * Así que la unidad de consulta es la celda de 0,1°, que es la resolución que el
 * modelo tiene de verdad. De 3.190 puntos salen unas 300 celdas: diez veces
 * menos cuota para exactamente la misma información.
 *
 * Es también lo honesto de cara al usuario: la página puede decir que el dato es
 * de una celda de 11 km, en lugar de insinuar una precisión de barrio que el
 * modelo no tiene.
 *
 * ## Restricción
 *
 * Igual que variables.ts, este fichero **no importa nada**: lo cargan el worker
 * (con extensión .ts explícita) y la aplicación (con el alias @/). Si necesita
 * dependencias, se duplica antes que romper uno de los dos.
 */

/** Lado de la celda en grados. Es la resolución de CAMS Europa. */
export const AIR_CELL_DEG = 0.1;

/**
 * Identificador de la celda que contiene un punto.
 *
 * Se redondea al centro de la celda, no al borde: así el punto que se pide a la
 * API es el representativo de la celda y no uno de la esquina, que quedaría a
 * 8 km de la mitad de las ubicaciones que representa.
 */
export function airCell(lat: number, lon: number): { key: string; lat: number; lon: number } {
  const cLat = Math.round(lat / AIR_CELL_DEG) * AIR_CELL_DEG;
  const cLon = Math.round(lon / AIR_CELL_DEG) * AIR_CELL_DEG;
  // La clave se construye con un decimal fijo para que 41.3 y 41.30000000000001
  // —que es lo que devuelve la aritmética de coma flotante— no sean dos celdas.
  return { key: `${cLat.toFixed(1)},${cLon.toFixed(1)}`, lat: Number(cLat.toFixed(1)), lon: Number(cLon.toFixed(1)) };
}

export function airCellKey(lat: number, lon: number): string {
  return airCell(lat, lon).key;
}
