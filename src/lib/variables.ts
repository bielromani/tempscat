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
  | 'humidity' | 'precipitation' | 'pressure'
  | 'wind_speed' | 'wind_direction' | 'wind_gust'
  | 'solar_radiation' | 'snow_depth';

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
};

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
