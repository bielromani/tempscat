/**
 * Códigos de tiempo presente WMO 4677, que es lo que devuelve Open-Meteo.
 *
 * Las descripciones son en catalán y **específicas**: "plugim" no es lo mismo
 * que "pluja feble", y "ruixats" no es lo mismo que "pluja". Un usuario que
 * mira por la ventana nota la diferencia, y usar la palabra imprecisa es la
 * forma más rápida de que deje de fiarse.
 *
 * Este fichero no importa nada: lo usan scripts y aplicación.
 */

export type WeatherGroup =
  | 'clear' | 'partly' | 'cloudy' | 'fog'
  | 'drizzle' | 'rain' | 'showers'
  | 'snow' | 'snow_showers' | 'freezing'
  | 'thunder' | 'hail';

export interface WeatherCode {
  code: number;
  group: WeatherGroup;
  /** Descripción corta, para tarjetas y tablas. */
  ca: string;
  /** Descripción con matiz, para el bloque principal. */
  caLong: string;
  es: string;
  en: string;
  /** Severidad 0–5. Ordena qué fenómeno manda cuando se resume un día. */
  severity: number;
}

const CODES: WeatherCode[] = [
  { code: 0, group: 'clear', ca: 'Serè', caLong: 'Cel serè', es: 'Despejado', en: 'Clear sky', severity: 0 },
  { code: 1, group: 'clear', ca: 'Poc ennuvolat', caLong: 'Cel poc ennuvolat', es: 'Poco nuboso', en: 'Mainly clear', severity: 0 },
  { code: 2, group: 'partly', ca: 'Mig ennuvolat', caLong: 'Intervals de núvols', es: 'Parcialmente nuboso', en: 'Partly cloudy', severity: 1 },
  { code: 3, group: 'cloudy', ca: 'Ennuvolat', caLong: 'Cel cobert', es: 'Nuboso', en: 'Overcast', severity: 1 },

  { code: 45, group: 'fog', ca: 'Boira', caLong: 'Boira', es: 'Niebla', en: 'Fog', severity: 2 },
  { code: 48, group: 'fog', ca: 'Boira gebradora', caLong: 'Boira que diposita gebre', es: 'Niebla engelante', en: 'Depositing rime fog', severity: 3 },

  { code: 51, group: 'drizzle', ca: 'Plugim', caLong: 'Plugim feble', es: 'Llovizna débil', en: 'Light drizzle', severity: 1 },
  { code: 53, group: 'drizzle', ca: 'Plugim', caLong: 'Plugim moderat', es: 'Llovizna', en: 'Moderate drizzle', severity: 2 },
  { code: 55, group: 'drizzle', ca: 'Plugim intens', caLong: 'Plugim intens', es: 'Llovizna intensa', en: 'Dense drizzle', severity: 2 },
  { code: 56, group: 'freezing', ca: 'Plugim gelant', caLong: 'Plugim que es gela en tocar terra', es: 'Llovizna engelante', en: 'Freezing drizzle', severity: 4 },
  { code: 57, group: 'freezing', ca: 'Plugim gelant', caLong: 'Plugim gelant intens', es: 'Llovizna engelante intensa', en: 'Dense freezing drizzle', severity: 4 },

  { code: 61, group: 'rain', ca: 'Pluja feble', caLong: 'Pluja feble', es: 'Lluvia débil', en: 'Slight rain', severity: 2 },
  { code: 63, group: 'rain', ca: 'Pluja', caLong: 'Pluja moderada', es: 'Lluvia', en: 'Moderate rain', severity: 3 },
  { code: 65, group: 'rain', ca: 'Pluja forta', caLong: 'Pluja forta', es: 'Lluvia fuerte', en: 'Heavy rain', severity: 4 },
  { code: 66, group: 'freezing', ca: 'Pluja gelant', caLong: 'Pluja que es gela en tocar terra', es: 'Lluvia engelante', en: 'Freezing rain', severity: 4 },
  { code: 67, group: 'freezing', ca: 'Pluja gelant', caLong: 'Pluja gelant forta', es: 'Lluvia engelante fuerte', en: 'Heavy freezing rain', severity: 5 },

  { code: 71, group: 'snow', ca: 'Nevada feble', caLong: 'Nevada feble', es: 'Nieve débil', en: 'Slight snow', severity: 3 },
  { code: 73, group: 'snow', ca: 'Nevada', caLong: 'Nevada moderada', es: 'Nieve', en: 'Moderate snow', severity: 4 },
  { code: 75, group: 'snow', ca: 'Nevada forta', caLong: 'Nevada forta', es: 'Nieve fuerte', en: 'Heavy snow', severity: 5 },
  { code: 77, group: 'snow', ca: 'Neu granulada', caLong: 'Neu granulada', es: 'Cinarra', en: 'Snow grains', severity: 3 },

  { code: 80, group: 'showers', ca: 'Ruixats', caLong: 'Ruixats febles', es: 'Chubascos débiles', en: 'Slight rain showers', severity: 2 },
  { code: 81, group: 'showers', ca: 'Ruixats', caLong: 'Ruixats moderats', es: 'Chubascos', en: 'Moderate rain showers', severity: 3 },
  { code: 82, group: 'showers', ca: 'Ruixats forts', caLong: 'Ruixats molt forts', es: 'Chubascos torrenciales', en: 'Violent rain showers', severity: 4 },
  { code: 85, group: 'snow_showers', ca: 'Ruixats de neu', caLong: 'Ruixats de neu febles', es: 'Chubascos de nieve', en: 'Slight snow showers', severity: 3 },
  { code: 86, group: 'snow_showers', ca: 'Ruixats de neu', caLong: 'Ruixats de neu forts', es: 'Chubascos de nieve fuertes', en: 'Heavy snow showers', severity: 4 },

  { code: 95, group: 'thunder', ca: 'Tempesta', caLong: 'Tempesta', es: 'Tormenta', en: 'Thunderstorm', severity: 4 },
  { code: 96, group: 'hail', ca: 'Tempesta amb calamarsa', caLong: 'Tempesta amb calamarsa', es: 'Tormenta con granizo', en: 'Thunderstorm with slight hail', severity: 5 },
  { code: 99, group: 'hail', ca: 'Tempesta amb pedra', caLong: 'Tempesta amb pedra', es: 'Tormenta con granizo fuerte', en: 'Thunderstorm with heavy hail', severity: 5 },
];

const BY_CODE = new Map(CODES.map((c) => [c.code, c]));

const UNKNOWN: WeatherCode = {
  code: -1, group: 'cloudy', ca: '—', caLong: 'Sense dades', es: 'Sin datos', en: 'No data', severity: 0,
};

export function weatherCode(code: number | null | undefined): WeatherCode {
  if (code == null) return UNKNOWN;
  return BY_CODE.get(code) ?? UNKNOWN;
}

/**
 * El fenómeno más severo de un conjunto de códigos.
 *
 * "Más severo" **no es "número más alto"**: en la tabla WMO la niebla es el 45 y
 * el cielo cubierto el 3, así que quedarse con el máximo numérico pinta niebla
 * en días de sol. El orden lo da la severidad declarada.
 *
 * A igualdad de severidad gana la precipitación sobre la niebla: si llueve y
 * además hay bruma, lo que condiciona el día es la lluvia.
 */
export function dominantCode(codes: Array<number | null>): WeatherCode {
  let best = UNKNOWN;
  for (const c of codes) {
    const w = weatherCode(c);
    if (w.code < 0) continue;
    if (w.severity > best.severity) { best = w; continue; }
    if (w.severity === best.severity && best.group === 'fog' && w.group !== 'fog') best = w;
  }
  return best;
}

/**
 * Consenso entre los códigos que dan varios modelos para la **misma hora**.
 *
 * Devuelve lo que dice la mayoría, con la severidad solo como desempate.
 *
 * La alternativa —quedarse con el más severo— parece prudente y no lo es: hace
 * la predicción sistemáticamente más sombría que cualquiera de los modelos por
 * separado. Si uno de tres ve niebla, la página vería niebla siempre. Un
 * consenso que solo suma pesimismo deja de ser un consenso.
 */
export function consensusCode(codes: Array<number | null>): number | null {
  const valid = codes.filter((c): c is number => weatherCode(c).code >= 0);
  if (!valid.length) return null;

  const freq = new Map<number, number>();
  for (const c of valid) freq.set(c, (freq.get(c) ?? 0) + 1);

  let best = valid[0];
  let bestN = 0;
  for (const [code, n] of freq) {
    if (n > bestN || (n === bestN && weatherCode(code).severity > weatherCode(best).severity)) {
      best = code;
      bestN = n;
    }
  }
  return best;
}

/**
 * Resume un día entero a partir de sus códigos horarios.
 *
 * La regla de "el más severo" vale para una hora, no para un día: una hora de
 * boira a l'alba en una jornada de 32 °C no es un día de niebla, y pintarlo así
 * es engañoso. Pero una hora de tormenta **sí** define el día, porque es la que
 * cambia los planes.
 *
 * El criterio, entonces, es doble:
 *
 *  1. Si hay algún fenómeno de severidad alta —lluvia apreciable, nieve,
 *     tormenta, granizo— manda ese, aunque dure una hora.
 *  2. Si no, manda el estado de cielo **más frecuente en horas de luz**. Lo que
 *     pasa a las cuatro de la madrugada no describe el día de nadie.
 */
export function dailySummaryCode(
  hours: Array<{ code: number | null; isDay: boolean }>,
): WeatherCode {
  const known = hours.filter((h) => weatherCode(h.code).code >= 0);
  if (!known.length) return UNKNOWN;

  const severe = known.filter((h) => weatherCode(h.code).severity >= 3);
  if (severe.length) return dominantCode(severe.map((h) => h.code));

  const daylight = known.filter((h) => h.isDay);
  const pool = daylight.length ? daylight : known;

  const freq = new Map<number, number>();
  for (const h of pool) {
    const c = weatherCode(h.code).code;
    freq.set(c, (freq.get(c) ?? 0) + 1);
  }

  // Empate: gana el más severo, que es el que más condiciona.
  let bestCode = -1;
  let bestCount = -1;
  for (const [code, n] of freq) {
    if (n > bestCount || (n === bestCount && weatherCode(code).severity > weatherCode(bestCode).severity)) {
      bestCode = code;
      bestCount = n;
    }
  }
  return weatherCode(bestCode);
}

/** Grupos que implican precipitación. Útil para decidir si mostrar el bloque de lluvia. */
export const WET_GROUPS = new Set<WeatherGroup>([
  'drizzle', 'rain', 'showers', 'snow', 'snow_showers', 'freezing', 'thunder', 'hail',
]);

export function isWet(code: number | null | undefined): boolean {
  return WET_GROUPS.has(weatherCode(code).group);
}
