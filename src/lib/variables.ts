/**
 * Catálogo canónico de variables meteorológicas — la "tabla Rosetta".
 *
 * Es el único sitio donde se relacionan los códigos numéricos del Meteocat, los
 * nombres de Open-Meteo y los de AEMET. Sin ella, la fusión de fuentes acaba
 * siendo conversiones sueltas repartidas por todo el código, y una unidad mal
 * convertida en meteorología no da un error: da un número plausible y falso.
 *
 * Este fichero no importa nada, a propósito: lo consumen tanto los scripts de
 * datos (Node, con extensión .ts explícita) como la aplicación.
 */

export type VariableSlug =
  | 'temperature' | 'temperature_max' | 'temperature_min'
  | 'apparent_temperature' | 'dew_point'
  | 'humidity' | 'precipitation' | 'precipitation_probability' | 'pressure'
  | 'wind_speed' | 'wind_direction' | 'wind_gust'
  | 'solar_radiation' | 'uv_index'
  | 'cloud_cover' | 'visibility' | 'weather_code'
  | 'freezing_level' | 'snowfall' | 'snow_depth' | 'cape';

export interface VariableDef {
  slug: VariableSlug;
  /**
   * Códigos XEMA **en orden de preferencia**. No es capricho: las estaciones de
   * alta montaña miden el viento a 2 o 6 m en vez de a 10, porque a 10 m el
   * mástil no aguanta el hielo. Quedarse solo con el código de 10 m deja sin
   * viento justo las estaciones del Pirineo, que son las que más interesan.
   */
  xema: string[];
  /** Nombre en la API horaria de Open-Meteo. */
  openMeteo?: string;
  /** Nombre en la API diaria de Open-Meteo, cuando difiere. */
  openMeteoDaily?: string;
  /** Unidad canónica en la que guardamos el valor. SI salvo donde no tiene sentido. */
  unit: string;
  /** Unidad en la que se muestra, si es distinta de la canónica. */
  displayUnit?: string;
  decimals: number;
  /** Si al agregar por hora o día hay que sumar en vez de promediar. */
  accumulated: boolean;
  /** Si es angular: promediar 350° y 10° dando 180° es el error clásico. */
  circular?: boolean;
  nom: { ca: string; es: string; en: string };
}

export const VARIABLES: Record<VariableSlug, VariableDef> = {
  temperature: {
    slug: 'temperature',
    xema: ['32'],
    openMeteo: 'temperature_2m',
    unit: '°C', decimals: 1, accumulated: false,
    nom: { ca: 'Temperatura', es: 'Temperatura', en: 'Temperature' },
  },
  temperature_max: {
    slug: 'temperature_max',
    xema: ['40'],
    openMeteoDaily: 'temperature_2m_max',
    unit: '°C', decimals: 1, accumulated: false,
    nom: { ca: 'Temperatura màxima', es: 'Temperatura máxima', en: 'Maximum temperature' },
  },
  temperature_min: {
    slug: 'temperature_min',
    xema: ['42'],
    openMeteoDaily: 'temperature_2m_min',
    unit: '°C', decimals: 1, accumulated: false,
    nom: { ca: 'Temperatura mínima', es: 'Temperatura mínima', en: 'Minimum temperature' },
  },
  humidity: {
    slug: 'humidity',
    xema: ['33'],
    openMeteo: 'relative_humidity_2m',
    unit: '%', decimals: 0, accumulated: false,
    nom: { ca: 'Humitat relativa', es: 'Humedad relativa', en: 'Relative humidity' },
  },
  precipitation: {
    slug: 'precipitation',
    xema: ['35'],
    openMeteo: 'precipitation',
    openMeteoDaily: 'precipitation_sum',
    unit: 'mm', decimals: 1, accumulated: true,
    nom: { ca: 'Precipitació', es: 'Precipitación', en: 'Precipitation' },
  },
  pressure: {
    slug: 'pressure',
    // Ojo: la 34 del Meteocat es presión **en la estación**, no reducida al
    // nivel del mar. Open-Meteo da ambas; se usa `surface_pressure` para que
    // comparen lo mismo. Mezclarla con `pressure_msl` introduce un sesgo
    // proporcional a la altitud, que en el Pirineo son más de 200 hPa.
    xema: ['34'],
    openMeteo: 'surface_pressure',
    unit: 'hPa', decimals: 1, accumulated: false,
    nom: { ca: 'Pressió atmosfèrica', es: 'Presión atmosférica', en: 'Air pressure' },
  },
  wind_speed: {
    slug: 'wind_speed',
    xema: ['30', '48', '46'],   // 10 m → 6 m → 2 m
    openMeteo: 'wind_speed_10m',
    unit: 'm/s', displayUnit: 'km/h', decimals: 1, accumulated: false,
    nom: { ca: 'Velocitat del vent', es: 'Velocidad del viento', en: 'Wind speed' },
  },
  wind_direction: {
    slug: 'wind_direction',
    xema: ['31', '49', '47'],
    openMeteo: 'wind_direction_10m',
    unit: '°', decimals: 0, accumulated: false, circular: true,
    nom: { ca: 'Direcció del vent', es: 'Dirección del viento', en: 'Wind direction' },
  },
  wind_gust: {
    slug: 'wind_gust',
    xema: ['50', '53', '56'],
    openMeteo: 'wind_gusts_10m',
    unit: 'm/s', displayUnit: 'km/h', decimals: 1, accumulated: false,
    nom: { ca: 'Ratxa màxima', es: 'Racha máxima', en: 'Wind gust' },
  },
  solar_radiation: {
    slug: 'solar_radiation',
    xema: ['36'],
    openMeteo: 'shortwave_radiation',
    unit: 'W/m²', decimals: 0, accumulated: false,
    nom: { ca: 'Irradiància solar', es: 'Irradiancia solar', en: 'Solar radiation' },
  },
  snow_depth: {
    slug: 'snow_depth',
    xema: [],                    // la XEMA no publica gruix de neu por esta vía
    openMeteo: 'snow_depth',
    unit: 'm', displayUnit: 'cm', decimals: 2, accumulated: false,
    nom: { ca: 'Gruix de neu', es: 'Espesor de nieve', en: 'Snow depth' },
  },

  // ── Variables que solo aporta la predicción ───────────────────────────────
  // La XEMA no las mide (o no por esta vía), pero cambian mucho lo que una
  // página puede contar: si hay que llevar paraguas, si el cielo estará abierto,
  // si nevará y a qué cota.

  apparent_temperature: {
    slug: 'apparent_temperature',
    xema: [],
    openMeteo: 'apparent_temperature',
    unit: '°C', decimals: 1, accumulated: false,
    nom: { ca: 'Sensació tèrmica', es: 'Sensación térmica', en: 'Feels like' },
  },
  dew_point: {
    slug: 'dew_point',
    xema: [],
    openMeteo: 'dew_point_2m',
    unit: '°C', decimals: 1, accumulated: false,
    nom: { ca: 'Punt de rosada', es: 'Punto de rocío', en: 'Dew point' },
  },
  precipitation_probability: {
    slug: 'precipitation_probability',
    xema: [],
    openMeteo: 'precipitation_probability',
    unit: '%', decimals: 0, accumulated: false,
    nom: { ca: 'Probabilitat de precipitació', es: 'Probabilidad de precipitación', en: 'Precipitation probability' },
  },
  uv_index: {
    slug: 'uv_index',
    xema: [],
    openMeteo: 'uv_index',
    unit: '', decimals: 0, accumulated: false,
    nom: { ca: 'Índex UV', es: 'Índice UV', en: 'UV index' },
  },
  cloud_cover: {
    slug: 'cloud_cover',
    xema: [],
    openMeteo: 'cloud_cover',
    unit: '%', decimals: 0, accumulated: false,
    nom: { ca: 'Nuvolositat', es: 'Nubosidad', en: 'Cloud cover' },
  },
  visibility: {
    slug: 'visibility',
    xema: [],
    openMeteo: 'visibility',
    unit: 'm', displayUnit: 'km', decimals: 0, accumulated: false,
    nom: { ca: 'Visibilitat', es: 'Visibilidad', en: 'Visibility' },
  },
  weather_code: {
    slug: 'weather_code',
    xema: [],
    openMeteo: 'weather_code',
    unit: '', decimals: 0, accumulated: false,
    nom: { ca: 'Estat del cel', es: 'Estado del cielo', en: 'Weather' },
  },
  freezing_level: {
    // La isocero. Con ella y el efecto de refredament per fusió sale la cota de
    // nieve, que es *la* pregunta del Pirineo en invierno.
    slug: 'freezing_level',
    xema: [],
    openMeteo: 'freezing_level_height',
    unit: 'm', decimals: 0, accumulated: false,
    nom: { ca: 'Isozero', es: 'Isocero', en: 'Freezing level' },
  },
  snowfall: {
    slug: 'snowfall',
    xema: [],
    openMeteo: 'snowfall',
    unit: 'cm', decimals: 1, accumulated: true,
    nom: { ca: 'Neu acumulada', es: 'Nieve acumulada', en: 'Snowfall' },
  },
  cape: {
    // Energía potencial convectiva: anticipa tormentas de tarde en verano,
    // que es cuando la convección pirenaica sorprende a los excursionistas.
    slug: 'cape',
    xema: [],
    openMeteo: 'cape',
    unit: 'J/kg', decimals: 0, accumulated: false,
    nom: { ca: 'Energia convectiva', es: 'Energía convectiva', en: 'CAPE' },
  },
};

// ── Conjuntos de variables por nivel ────────────────────────────────────────
//
// Open-Meteo cobra por variable: **peso = (variables / 10) × (días / 14)**, con
// mínimo 1 en cada factor. Pedir 30 variables triplica el coste de cada punto.
//
// Por eso hay dos conjuntos. El rico solo va a los puntos de nivel A, que son
// 350 y sirven a las comarcas y los municipios grandes; el resto recibe el
// esencial, que ya cubre todo lo que se muestra por encima del pliegue.

/** Lo mínimo para el meteograma, las tarjetas de 7 días y el bloque principal. */
export const ESSENTIAL_HOURLY: VariableSlug[] = [
  'temperature', 'apparent_temperature', 'precipitation', 'precipitation_probability',
  'weather_code', 'cloud_cover', 'humidity', 'wind_speed', 'wind_direction', 'wind_gust',
];

/**
 * Todo lo anterior más lo que enriquece la ficha de un lugar destacado.
 *
 * **Lo que no se pinta, no se pide.** `snow_depth` y `solar_radiation` estuvieron
 * aquí y no los leía nadie: eran 3 MB de los 50 que ocupa la predicción, y
 * viajaban del modelo al almacén y del almacén a cada página sin llegar nunca a
 * una pantalla. El gruix de neu que sí se enseña es el **medido** en las
 * estaciones de altura, que sale del histórico y no del modelo.
 *
 * Y encima se cobran: Open-Meteo factura por decenas de variables, así que
 * dejar de pedirlas bajó el peso de cada llamada de 1,9 a 1,7 — un 10 % de
 * cuota diaria recuperado sin quitar ni un modelo.
 */
export const RICH_HOURLY: VariableSlug[] = [
  ...ESSENTIAL_HOURLY,
  'dew_point', 'pressure', 'uv_index', 'visibility', 'freezing_level', 'snowfall', 'cape',
];

/** Peso que Open-Meteo cobrará por una petición. */
export function callWeight(nVariables: number, forecastDays: number, nLocations: number): number {
  const varFactor = Math.max(1, nVariables / 10);
  const dayFactor = Math.max(1, forecastDays / 14);
  return nLocations * varFactor * dayFactor;
}

export const ALL_VARIABLES = Object.values(VARIABLES);

/** Índice inverso: código XEMA → variable canónica, con su prioridad. */
export const XEMA_TO_SLUG: Record<string, { slug: VariableSlug; priority: number }> = (() => {
  const out: Record<string, { slug: VariableSlug; priority: number }> = {};
  for (const v of ALL_VARIABLES) {
    v.xema.forEach((codi, i) => { out[codi] = { slug: v.slug, priority: i }; });
  }
  return out;
})();

/** Variables horarias que pedimos a Open-Meteo. */
export const HOURLY_FIELDS = ALL_VARIABLES
  .map((v) => v.openMeteo)
  .filter((x): x is string => !!x);

/** Variables diarias que pedimos a Open-Meteo. */
export const DAILY_FIELDS = ALL_VARIABLES
  .map((v) => v.openMeteoDaily)
  .filter((x): x is string => !!x);

// ── Conversión y formato ────────────────────────────────────────────────────

export const msToKmh = (ms: number) => ms * 3.6;
export const kmhToMs = (kmh: number) => kmh / 3.6;

/** Valor en la unidad de visualización. */
export function toDisplay(slug: VariableSlug, value: number): number {
  const v = VARIABLES[slug];
  if (v.unit === 'm/s' && v.displayUnit === 'km/h') return msToKmh(value);
  if (v.unit === 'm' && v.displayUnit === 'cm') return value * 100;
  return value;
}

export function formatValue(slug: VariableSlug, value: number | null | undefined, locale = 'ca'): string {
  if (value == null || !Number.isFinite(value)) return '—';
  const v = VARIABLES[slug];
  const shown = toDisplay(slug, value);
  const decimals = v.displayUnit ? Math.max(0, v.decimals - 1) : v.decimals;
  return shown.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

const ROSA_CA = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

/** Rumbo abreviado en catalán: 350° → 'N'. */
export function windCardinal(degrees: number): string {
  return ROSA_CA[Math.round(((degrees % 360) + 360) % 360 / 22.5) % 16];
}

/**
 * Media de direcciones. Hay que promediar los vectores unitarios, no los
 * grados: la media aritmética de 350° y 10° da 180°, que es exactamente el
 * viento contrario al real.
 */
export function meanDirection(degrees: number[]): number | null {
  if (!degrees.length) return null;
  let x = 0, y = 0;
  for (const d of degrees) {
    const r = (d * Math.PI) / 180;
    x += Math.cos(r); y += Math.sin(r);
  }
  if (Math.abs(x) < 1e-9 && Math.abs(y) < 1e-9) return null;
  return (((Math.atan2(y, x) * 180) / Math.PI) + 360) % 360;
}

/**
 * Sensación térmica. Por debajo de 10 °C con viento manda el enfriamiento
 * eólico; por encima de 27 °C con humedad, el índice de calor. En medio la
 * sensación es la temperatura, y forzar una fórmula ahí produce números que
 * nadie reconoce.
 */
export function apparentTemperature(tempC: number, windMs: number, humidity: number): number {
  const windKmh = msToKmh(windMs);
  if (tempC <= 10 && windKmh > 4.8) {
    const v = windKmh ** 0.16;
    return 13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v;
  }
  if (tempC >= 27 && humidity >= 40) {
    const t = tempC, r = humidity;
    return (
      -8.784695 + 1.61139411 * t + 2.338549 * r - 0.14611605 * t * r
      - 0.012308094 * t * t - 0.016424828 * r * r + 0.002211732 * t * t * r
      + 0.00072546 * t * r * r - 0.000003582 * t * t * r * r
    );
  }
  return tempC;
}
