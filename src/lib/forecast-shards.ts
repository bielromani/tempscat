/**
 * Dónde vive la predicción en disco.
 *
 * ## Por qué está partida
 *
 * La predicción de las 3.190 celdas del territorio, con tres modelos y 168
 * horas cada una, son **42 MB en un solo JSON**. Mientras el proceso vive eso
 * se paga una vez y no duele: el snapshot se memoriza por `mtime` y no se
 * vuelve a parsear.
 *
 * Lo que duele es el arranque en frío, que en producción es el caso normal y no
 * la excepción. Medido en esta máquina sobre el fichero real: **80 ms de
 * lectura, 195 ms de parseo y 132 MB de montículo** para responder a una página
 * que necesita un punto de los 3.190.
 *
 * Partido por comarca, la misma página parsea su millón de bytes y nada más.
 *
 * ## Por qué por comarca y no por punto
 *
 * Un fichero por punto serían 3.190 aperturas y el problema al revés: la
 * comparativa comarcal de cada ficha mira a todos sus vecinos, así que la
 * comarca es justo la unidad que una página necesita entera.
 *
 * 27 de los 3.190 puntos los comparten dos comarcas — la celda de 0,02° no sabe
 * de fronteras — y esos se escriben en las dos. Son 350 KB de duplicado sobre
 * 42 MB: sale mucho más barato que un fichero de índice que hubiera que leer
 * antes de cada consulta.
 *
 * ## Como el resto de los ficheros compartidos, este no importa nada
 *
 * Lo cargan los dos lados: el worker con la extensión `.ts`, la aplicación con
 * el alias `@/`.
 */

/** Subcarpeta de `data/cache/` donde viven los trozos. */
export const FORECAST_DIR = 'forecast';

/**
 * Nombre del snapshot de una comarca, sin extensión.
 *
 * La `c` delante no es decorativa: los códigos de comarca son numéricos con
 * cero a la izquierda («01»), y un nombre de fichero que empieza por dígito es
 * el que acaba convertido en número por alguna herramienta a mitad de camino.
 */
export function forecastShard(comarcaCodi: string): string {
  return `${FORECAST_DIR}/c${comarcaCodi}`;
}

/** Índice: qué comarcas hay, con qué horizonte y de qué modelos. */
export const FORECAST_INDEX = `${FORECAST_DIR}/index`;

export interface ForecastIndex {
  /** Horas de la serie, idénticas en todos los trozos. */
  times: string[];
  models: string[];
  /** Puntos distintos en todo el territorio, sin contar dos veces los de frontera. */
  points: number;
  comarques: Array<{ codi: string; points: number; bytes: number }>;
}
