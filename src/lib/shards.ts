/**
 * Dónde vive cada trozo de cada dato, y por qué está partido.
 *
 * ## La regla
 *
 * **Una página descarga bytes en proporción a lo que enseña.** No a lo que
 * existe.
 *
 * No es una preferencia estética. En producción la aplicación no tiene disco:
 * cada arranque en frío se baja del almacén lo que necesita, y una ficha de
 * municipio llegó a bajarse **4.965 kB para enseñar un pueblo** — el histórico
 * de las 189 estaciones para usar una, las 372 celdas de aire para usar una, y
 * la predicción de la comarca entera para usar un punto de sesenta y cinco.
 *
 * Con 4.293 fichas eso no es un detalle de rendimiento: es que **el primer
 * rastreo completo del sitemap consume 22,8 GB**. Pasó de verdad, el 1 de
 * septiembre de 2026. Google encontró el sitemap, se agotaron los 10 GB
 * mensuales del almacén y este quedó bloqueado: las páginas ya generadas se
 * sirvieron congeladas y los 3.283 núcleos que se generan a demanda empezaron a
 * dar 500.
 *
 * De ahí sale la regla, y de ahí que esté escrita aquí arriba.
 *
 * ## Cómo se elige la unidad de partición
 *
 * Por **la que consulta la página**, no por la que produce el worker:
 *
 * | dato | unidad | por qué |
 * |---|---|---|
 * | predicción | comarca | la comparativa de cada ficha mira a todos sus vecinos |
 * | histórico | estación | una ficha usa la suya y ninguna más |
 * | aire | celda de 0,1° | una ficha cae en una celda y en ninguna más |
 *
 * El monolito se sigue escribiendo en los tres casos, porque las páginas de
 * país —`/neu`, `/bolets`, `/senderisme`— sí los quieren enteros. Pero esas
 * son cuatro URL, no cuatro mil.
 *
 * ## Como el resto de los ficheros compartidos, este no importa nada
 *
 * Lo cargan los dos lados: los workers con la extensión `.ts`, la aplicación
 * con el alias `@/`.
 */

// ── Predicción, por comarca ────────────────────────────────────────
//
// Además del tamaño de la descarga, aquí pesa el coste de abrirla. Medido
// sobre el JSON único de 42 MB que hubo al principio: **80 ms de lectura,
// 195 ms de parseo y 132 MB de montículo** para responder a una página que
// necesita un punto de los 3.190. Partido por comarca, la misma página parsea
// su millón de bytes y nada más.
//
// Por comarca y no por punto porque la comparativa comarcal de cada ficha mira
// a todos sus vecinos: la comarca es justo la unidad que una página necesita
// entera. Los 27 puntos que comparten dos comarcas —la celda de 0,02° no sabe
// de fronteras— se escriben en las dos: sale más barato que un índice que
// hubiera que leer antes de cada consulta.

/**
 * Cuántas horas de detalle horario se guardan por punto.
 *
 * El modelo da 336 —catorce días— y la página pinta 48. Guardar las 336 eran
 * las tres cuartas partes de los 50 MB de la predicción, y viajaban enteras a
 * cada ficha. El resumen de los catorce días se calcula una vez en el worker y
 * viaja ya hecho.
 *
 * 120 y no 96 por el peor caso, que no es el normal: el nivel C se refresca una
 * vez al día, así que una ficha puede leer un fichero de hace 24 h, y si una
 * ejecución falla, de hace 48. Con 120 quedan 72 horas de futuro en el caso
 * malo y 44 en el peor — todavía cubre las 48 que enseña el meteograma. Con
 * 96 una sola ejecución perdida dejaba el meteograma medio vacío.
 */
export const FORECAST_STORED_HOURS = 120;

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
  /**
   * Cuándo se refrescó cada nivel por última vez.
   *
   * No es informativo: es lo que evita pagar dos veces por lo mismo. El
   * planificador de GitHub acumula las horas que no ha podido servir y las
   * dispara **en ráfaga** — el 2 de septiembre de 2026 lanzó tres refrescos de
   * predicción en dos horas y media, con horarios previstos de 02:00, 03:30 y
   * 05:00. Un nivel A cuesta 3.290 de las 10.000 unidades diarias de
   * Open-Meteo, así que tres ráfagas se comen el día entero.
   *
   * Opcional porque un índice escrito antes de que existiera no lo trae; sin
   * él, el worker se comporta como antes.
   */
  refreshedAt?: Record<string, string>;
}


// ── Histórico, por estación ───────────────────────────────────

/** Subcarpeta de `data/cache/` donde viven los históricos por estación. */
export const HISTORY_DIR = 'history';

/**
 * Nombre del snapshot del histórico de una estación, sin extensión.
 *
 * Los códigos de la XEMA son alfanuméricos de dos caracteres —«CD», «X4»—,
 * así que no hay la ambigüedad de ceros a la izquierda que obliga a poner una
 * `c` delante en las comarcas. Se dejan tal cual.
 */
export function historyShard(stationCodi: string): string {
  return `${HISTORY_DIR}/${stationCodi}`;
}

// ── Aire, por celda ───────────────────────────────────────────

/** Subcarpeta de `data/cache/` donde viven las celdas de aire. */
export const AIR_DIR = 'air';

/**
 * Nombre del snapshot de una celda de aire, sin extensión.
 *
 * La clave de la celda es `41.4,2.1` y la coma no puede ir en la ruta: en una
 * URL es legal, pero hay clientes que la codifican y clientes que no, y dos
 * rutas distintas para el mismo fichero acaban siendo dos ficheros. Se cambia
 * por un guión bajo y se acabó.
 */
export function airShard(cellKey: string): string {
  return `${AIR_DIR}/${cellKey.replace(',', '_')}`;
}

// ── Registro de frescura y contadores de cuota ───────────────────────

/**
 * Los dos ficheros que **escriben todos** y por eso había que partir.
 *
 * `freshness.json` y `quota.json` eran uno solo cada uno, y cada worker hacía
 * leer-modificar-escribir sobre el fichero entero. Mientras el planificador de
 * GitHub repartió las ejecuciones a lo largo del día casi nunca coincidían.
 *
 * El 2 de septiembre de 2026, con el reloj nuevo disparando los tres workers de
 * alta frecuencia **a la vez**, se vio en la primera vuelta: los avisos se
 * publicaron a las 10:31:12 con 18 avisos vigentes, y su entrada en el registro
 * la borró el worker de radar al publicar un minuto después. `/estat` habría
 * dicho que los avisos eran de hace diecisiete horas.
 *
 * En el contador de cuota la misma pérdida es peor, porque va en la dirección
 * mala: **hace creer que se ha gastado menos de lo gastado**, y la predicción
 * va al 81 % del techo de Open-Meteo.
 *
 * Un fichero por escritor y no vuelve a pasar.
 */
export const FRESHNESS_DIR = 'freshness';
export const QUOTA_DIR = 'quota';

export function freshnessShard(source: string): string {
  return `${FRESHNESS_DIR}/${source}`;
}

export function quotaShard(source: string): string {
  return `${QUOTA_DIR}/${source}`;
}

/**
 * Los workers que existen, en el orden en que se enseñan en `/estat`.
 *
 * Hace falta una lista porque ya no hay un fichero que los enumere. Y eso añade
 * algo que antes no existía: un worker que **nunca** ha publicado sale en la
 * página como lo que es, en vez de no salir. Antes, si uno no llegaba a
 * escribir su entrada, desaparecía del panel sin dejar rastro.
 */
export const FRESHNESS_SOURCES = [
  'xema-observations',
  'radar',
  'aemet-warnings',
  'sea',
  'forecast-refresh',
  'air-quality',
  'air-stations',
  'water',
  'xema-history',
] as const;
