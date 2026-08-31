/**
 * Las formas de la observación y de la predicción.
 *
 * Están aquí y no en weather.ts por una razón concreta: **narrative.ts las
 * necesita y tiene que poder ejecutarse fuera de Next.**
 *
 * weather.ts importa `server-only` y `node:fs`, así que un script de Node no lo
 * puede cargar. Mientras narrative.ts importaba de allí —aunque solo fueran
 * tipos, que desaparecen al compilar— el comprobador de `scripts/tsconfig.json`
 * arrastraba todo el grafo de la aplicación y el test no arrancaba.
 *
 * Y ese test importa: narrative.ts escribe prosa en 4.293 páginas, y sus casos
 * interesantes —una tormenta concentrada a media tarde— no se pueden ver en la
 * web cuando toca. El día que se escribió no llovía en toda Catalunya.
 *
 * Como el resto de los ficheros compartidos, **este no importa nada**.
 */

export interface CurrentConditions {
  /** Estación de la que sale el dato. Se muestra siempre: es la licencia y la confianza. */
  station: { codi: string; nom: string; distKm: number; dAltM: number | null };
  /** Cuándo se tomó la lectura, no cuándo la pedimos nosotros. */
  observedAt: string;
  ageMin: number;
  /** El Meteocat valida las lecturas a posteriori: las recientes son provisionales. */
  provisional: boolean;
  temperature: number | null;
  /** Corregida por el desnivel entre la estación y esta ubicación. */
  temperatureAdjusted: number | null;
  apparent: number | null;
  humidity: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  pressure: number | null;
  precip24h: number | null;
  /**
   * Extremos del día natural en curso, ya corregidos por el desnivel.
   *
   * No son las últimas 24 h: son desde la medianoche de Madrid. La diferencia se
   * nota a las nueve de la mañana, cuando una ventana móvil todavía arrastraría
   * la máxima de ayer por la tarde y diría que hoy ya se han hecho 30 °C.
   */
  todayMax: number | null;
  todayMin: number | null;
  todayPrecip: number | null;
  /** Y los de ayer, para poder decir «dos graus més que ahir». */
  yesterdayMax: number | null;
  yesterdayMin: number | null;
  yesterdayPrecip: number | null;
  source: string;
}

export interface HourlyPoint {
  time: string;
  temperature: number | null;
  apparent: number | null;
  precipitation: number | null;
  /** Probabilidad del propio Open-Meteo, mejor que contar modelos. */
  precipProbability: number | null;
  weatherCode: number | null;
  cloudCover: number | null;
  humidity: number | null;
  dewPoint: number | null;
  pressure: number | null;
  windSpeed: number | null;
  windDirection: number | null;
  windGust: number | null;
  uvIndex: number | null;
  visibility: number | null;
  /** Isocero, m. Con ella sale la cota de nieve. */
  freezingLevel: number | null;
  snowfall: number | null;
  cape: number | null;
  /** El sol está por encima del horizonte: decide sol o luna en el icono. */
  isDay: boolean;
  /** Desacuerdo entre modelos, °C. Null cuando solo hay uno. */
  spread: number | null;
}

export interface DailyPoint {
  date: string;
  tMax: number | null;
  tMin: number | null;
  /** Código del fenómeno más severo del día, no el más frecuente. */
  weatherCode: number | null;
  precipitation: number;
  precipProbability: number;
  /** Horas con precipitación apreciable. */
  precipHours: number;
  snowfall: number;
  windMax: number | null;
  gustMax: number | null;
  windDirection: number | null;
  uvMax: number | null;
  /** Cota de nieve estimada, m. Solo si se espera nieve. */
  snowLevel: number | null;
  sunrise: string | null;
  sunset: string | null;
}

export interface LocationForecast {
  hourly: HourlyPoint[];
  daily: DailyPoint[];
  models: string[];
  /** Cuántos modelos entran realmente en este punto. */
  nModels: number;
  /** Diferencia de altitud aplicada respecto a la orografía del modelo. */
  altitudeCorrectionM: number | null;
  issuedAt: string;
  source: string;
  /**
   * `false` mientras no exista el motor de verificación de la fase 4: hoy los
   * modelos pesan lo mismo. Decirlo evita prometer una precisión no demostrada.
   */
  skillWeighted: boolean;
}
