/**
 * De los modelos a una sola serie, y de la serie al resumen por días.
 *
 * ## Por qué está fuera de `weather.ts`
 *
 * Porque ahora lo necesitan los dos lados. La aplicación fusiona los modelos
 * para pintar las próximas horas; el worker necesita **el mismo cálculo** para
 * dejar escrito el resumen de los catorce días, y así no tener que guardar las
 * 336 horas de cada punto solo para que alguien saque de ellas una máxima.
 *
 * Tenerlo dos veces sería tener dos predicciones distintas para el mismo sitio
 * según quién hiciera la cuenta. Está aquí una vez.
 *
 * ## Como el resto de los ficheros compartidos, su cadena de imports acaba en
 * ficheros que no importan nada
 *
 * `variables.ts`, `weather-codes.ts`, `astronomy.ts` y `forecast-types.ts` no
 * importan nada, así que los scripts pueden cargar esto con la extensión `.ts`
 * y la aplicación con el alias `@/`.
 */
import { meanDirection, type VariableSlug } from './variables.ts';
import { consensusCode, dailySummaryCode } from './weather-codes.ts';
import { sunTimes } from './astronomy.ts';
import type { DailyPoint, HourlyPoint } from './forecast-types.ts';

/** Lo que guarda el fichero para un punto y un modelo. */
export interface PointForecast {
  modelElevation: number;
  values: Partial<Record<VariableSlug, Array<number | null>>>;
}

/** Mediana, que en precipitación es lo correcto: la media inventa valores que ningún modelo predice. */
export function median(xs: number[]): number | null {
  if (!xs.length) return null;
  const s = xs.slice().sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function stdev(xs: number[]): number | null {
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  return Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
}

/**
 * ¿Es de día en esa ubicación a esa hora local?
 *
 * El orto y el ocaso se memorizan por día y coordenada: sin caché se recalculan
 * 168 veces por página para los siete mismos días.
 */
const sunCache = new Map<string, ReturnType<typeof sunTimes>>();

export function isDaytimeAt(lat: number | null, lon: number | null, isoLocal: string): boolean {
  if (lat == null || lon == null) return true;
  const hour = Number(isoLocal.slice(11, 13));
  const day = isoLocal.slice(0, 10);
  const key = `${lat.toFixed(3)},${lon.toFixed(3)}:${day}`;
  let t = sunCache.get(key);
  if (!t) {
    t = sunTimes(new Date(`${day}T12:00:00Z`), lat, lon);
    sunCache.set(key, t);
  }
  if (!t.sunrise || !t.sunset) return hour >= 8 && hour < 20;
  // Las horas de la serie vienen en hora local de Madrid, así que se comparan
  // con el orto y el ocaso expresados en la misma zona.
  const local = (d: Date) => Number(
    d.toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hour12: false }).slice(0, 2),
  );
  return hour >= local(t.sunrise) && hour < local(t.sunset);
}

/**
 * Cota de nieve estimada a partir de la isocero.
 *
 * No coinciden: con precipitación, la fusión de los copos enfría la capa de
 * aire que atraviesan y la nieve cuaja **entre 200 y 300 m por debajo** del
 * nivel de congelación teórico. Dar la isocero como cota de nieve es el error
 * clásico, y hace que la gente suba a buscar nieve donde no la hay.
 */
export function snowLevelFrom(hours: HourlyPoint[]): number | null {
  const levels = hours.map((h) => h.freezingLevel).filter((v): v is number => v != null);
  if (!levels.length) return null;
  const mean = levels.reduce((a, b) => a + b, 0) / levels.length;
  return Math.round((mean - 250) / 50) * 50;
}

/**
 * Fusiona los modelos de un punto en una sola serie horaria.
 *
 * `tempCorrection` es el gradiente ya calculado contra la orografía que asume
 * el modelo, y `lat`/`lon` sirven solo para saber si a esa hora es de día —que
 * es lo que decide si el icono lleva sol o luna.
 */
export function mergeHourly(
  byModel: Record<string, PointForecast>,
  times: string[],
  opts: {
    tempCorrection: number;
    lat: number | null;
    lon: number | null;
    /**
     * Decimales de la temperatura. La página quiere uno, que es lo que enseña.
     *
     * El worker pide tres, y no por precisión meteorológica: de aquí sale la
     * máxima del día que se guarda **sin corregir**, y la corrección de altitud
     * se aplica luego, en la página. Redondeando dos veces —una aquí y otra
     * allí— el 0,53 % de las máximas salía un décimo distinta de la que da la
     * tabla horaria de la misma página. Un décimo no importa; que la ficha se
     * contradiga a sí misma, sí.
     */
    tempDecimals?: number;
  },
): HourlyPoint[] {
  const models = Object.keys(byModel);
  const { tempCorrection, lat, lon } = opts;
  const tempFactor = 10 ** (opts.tempDecimals ?? 1);

  return times.map((time, i) => {
    /** Valores de todos los modelos que tienen esta variable a esta hora. */
    const pick = (slug: VariableSlug): number[] =>
      models.map((m) => byModel[m].values[slug]?.[i]).filter((v): v is number => v != null);

    /** Media entre modelos; para variables que solo tiene uno, ese valor. */
    const mean = (slug: VariableSlug, decimals = 1): number | null => {
      const xs = pick(slug);
      if (!xs.length) return null;
      const f = 10 ** decimals;
      return Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * f) / f;
    };

    const temps = pick('temperature');
    const precs = pick('precipitation');
    const wet = precs.filter((p) => p >= 0.1);

    // La probabilidad la da Open-Meteo. Si no viene (modelos que no la
    // publican), se cae al recuento de modelos que dan lluvia, que es un
    // sustituto pobre pero honesto — y se prefiere la primera cuando existe.
    const ownProb = pick('precipitation_probability');
    const probability = ownProb.length
      ? Math.round(ownProb.reduce((a, b) => a + b, 0) / ownProb.length)
      : precs.length ? Math.round((wet.length / precs.length) * 100) : null;

    const codes = pick('weather_code');

    return {
      time,
      temperature: temps.length
        ? Math.round((temps.reduce((a, b) => a + b, 0) / temps.length + tempCorrection) * tempFactor) / tempFactor
        : null,
      apparent: (() => {
        const a = mean('apparent_temperature');
        return a != null ? Math.round((a + tempCorrection) * 10) / 10 : null;
      })(),
      // Cantidad: mediana de los modelos que sí dan lluvia. Promediar 20 mm y
      // 0 mm da 10 mm, un valor que ningún modelo considera probable.
      precipitation: wet.length ? median(wet) : 0,
      precipProbability: probability,
      // Consenso entre modelos, no el peor de ellos.
      //
      // Dos errores encadenados aquí. El primero: quedarse con el máximo
      // numérico, que en la tabla WMO pone la boira (45) por encima del cel
      // cobert (3) y pintaba niebla en días de 32 °C. El segundo, más sutil:
      // corregirlo cogiendo el más severo hacía la predicción sistemáticamente
      // más sombría que cualquiera de los modelos por separado — si uno de tres
      // ve niebla, la página veía niebla.
      //
      // Lo correcto es lo que dice la mayoría, con la severidad solo como
      // desempate.
      weatherCode: consensusCode(codes),
      cloudCover: mean('cloud_cover', 0),
      humidity: mean('humidity', 0),
      dewPoint: (() => {
        const d = mean('dew_point');
        return d != null ? Math.round((d + tempCorrection) * 10) / 10 : null;
      })(),
      pressure: mean('pressure'),
      windSpeed: mean('wind_speed'),
      windDirection: (() => {
        const dirs = pick('wind_direction');
        return dirs.length ? Math.round(meanDirection(dirs) ?? 0) : null;
      })(),
      windGust: (() => { const g = pick('wind_gust'); return g.length ? Math.max(...g) : null; })(),
      uvIndex: mean('uv_index', 0),
      visibility: mean('visibility', 0),
      freezingLevel: mean('freezing_level', 0),
      snowfall: mean('snowfall'),
      cape: mean('cape', 0),
      isDay: isDaytimeAt(lat, lon, time),
      spread: temps.length > 1 ? Math.round((stdev(temps) ?? 0) * 10) / 10 : null,
    };
  });
}

/**
 * Resumen por días naturales de una serie horaria.
 *
 * Se calcula **una vez, en el worker**, y viaja ya hecho: el motivo es que
 * sacar la máxima de cada día exige tener las 336 horas delante, y guardar 336
 * horas por punto para eso era la mayor parte de los 50 MB de la predicción.
 *
 * `lat`/`lon` pueden ir en nulo, y en el worker van: el orto y el ocaso
 * dependen del pueblo y no del punto de rejilla, así que los pone la
 * aplicación al leerlo.
 */
export function aggregateDaily(
  hourly: HourlyPoint[],
  opts: { lat: number | null; lon: number | null },
): DailyPoint[] {
  const { lat, lon } = opts;

  // Agregado diario en hora local, no UTC: "la máxima de mañana" es la del día
  // natural de quien lo lee.
  const byDay = new Map<string, HourlyPoint[]>();
  for (const h of hourly) {
    const day = h.time.slice(0, 10);
    const arr = byDay.get(day) ?? [];
    arr.push(h);
    byDay.set(day, arr);
  }

  return [...byDay]
    // Un día sin ninguna hora con temperatura no es un día "sin datos" que haya
    // que dibujar en gris: es un día que el modelo no alcanza. Mostrarlo vacío
    // parece un error del sitio, no un límite del horizonte de predicción.
    .filter(([, hs]) => hs.some((h) => h.temperature != null))
    .map(([date, hs]) => {
      const nums = (get: (h: HourlyPoint) => number | null): number[] =>
        hs.map(get).filter((v): v is number => v != null);

      const temps = nums((h) => h.temperature);
      const winds = nums((h) => h.windSpeed);
      const gusts = nums((h) => h.windGust);
      const probs = nums((h) => h.precipProbability);
      const uvs = nums((h) => h.uvIndex);
      const dirs = nums((h) => h.windDirection);

      const snowHours = hs.filter((h) => (h.snowfall ?? 0) > 0);
      const spreads = nums((h) => h.spread);
      // Solo orto y ocaso. Llamar aquí a  calculaba además las
      // próximas fases lunares —una búsqueda de casi mil iteraciones— siete
      // veces por página. El build pasó de 7 s a 42 s por eso.
      const sun = lat != null && lon != null
        ? sunTimes(new Date(`${date}T12:00:00Z`), lat, lon)
        : null;

      return {
        date,
        tMax: temps.length ? Math.max(...temps) : null,
        tMin: temps.length ? Math.min(...temps) : null,
        // Resumen de día, no de hora: ver dailySummaryCode.
        weatherCode: (() => {
          const c = dailySummaryCode(hs.map((h) => ({ code: h.weatherCode, isDay: h.isDay }))).code;
          // El código desconocido es -1, que es truthy: sin esta comprobación
          // llegaba a la tarjeta y pintaba "Sense dades" en días con datos.
          return c >= 0 ? c : null;
        })(),
        precipitation: Math.round(hs.reduce((s2, h) => s2 + (h.precipitation ?? 0), 0) * 10) / 10,
        precipProbability: probs.length ? Math.max(...probs) : 0,
        precipHours: hs.filter((h) => (h.precipitation ?? 0) >= 0.1).length,
        snowfall: Math.round(hs.reduce((s2, h) => s2 + (h.snowfall ?? 0), 0) * 10) / 10,
        windMax: winds.length ? Math.max(...winds) : null,
        gustMax: gusts.length ? Math.max(...gusts) : null,
        windDirection: dirs.length ? Math.round(meanDirection(dirs) ?? 0) : null,
        uvMax: uvs.length ? Math.max(...uvs) : null,
        snowLevel: snowHours.length ? snowLevelFrom(snowHours) : null,
        sunrise: sun?.sunrise?.toISOString() ?? null,
        sunset: sun?.sunset?.toISOString() ?? null,
        spread: spreads.length
          ? Math.round((spreads.reduce((a, b) => a + b, 0) / spreads.length) * 10) / 10
          : null,
      };
    });
}

/**
 * El resumen por días tal como viaja: columnas paralelas, no una fila por día.
 *
 * Trece campos por catorce días y 3.190 puntos. En objetos son 6,8 MB; en
 * columnas, 1,6. Las claves siguen teniendo nombre, así que se lee igual de
 * bien que un objeto y ocupa lo que ocupa una tabla.
 *
 * No lleva orto ni ocaso: dependen del pueblo y no del punto de rejilla, y los
 * pone la aplicación al leerlo.
 */
export interface StoredDaily {
  date: string[];
  tMax: Array<number | null>;
  tMin: Array<number | null>;
  weatherCode: Array<number | null>;
  precipitation: number[];
  precipProbability: number[];
  precipHours: number[];
  snowfall: number[];
  windMax: Array<number | null>;
  gustMax: Array<number | null>;
  windDirection: Array<number | null>;
  uvMax: Array<number | null>;
  snowLevel: Array<number | null>;
  /**
   * Ausente cuando el punto solo tiene un modelo, que son 2.861 de los 3.190.
   *
   * Guardar catorce nulos por punto para decir «no hay desacuerdo porque no hay
   * con quién discrepar» eran 225 kB repartidos por los 43 trozos.
   */
  spread?: Array<number | null>;
}

/** De los días calculados a las columnas que se guardan. */
export function toStored(daily: DailyPoint[]): StoredDaily {
  return {
    date: daily.map((d) => d.date),
    tMax: daily.map((d) => d.tMax),
    tMin: daily.map((d) => d.tMin),
    weatherCode: daily.map((d) => d.weatherCode),
    precipitation: daily.map((d) => d.precipitation),
    precipProbability: daily.map((d) => d.precipProbability),
    precipHours: daily.map((d) => d.precipHours),
    snowfall: daily.map((d) => d.snowfall),
    windMax: daily.map((d) => d.windMax),
    gustMax: daily.map((d) => d.gustMax),
    windDirection: daily.map((d) => d.windDirection),
    uvMax: daily.map((d) => d.uvMax),
    snowLevel: daily.map((d) => d.snowLevel),
    ...(daily.some((d) => d.spread != null) ? { spread: daily.map((d) => d.spread) } : {}),
  };
}
