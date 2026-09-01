import 'server-only';
import { msToKmh } from './variables';
import { weatherCode } from './weather-codes';
import { narrativeFor } from './narrative';
import {
  airQualityFor, currentFor, forecastFor, localNowHour, localToday, warningsFor,
} from './weather';
import { comarcaOf, locationById, type Location } from './territory';

/**
 * Feed público por ubicación.
 *
 * Va antes que el tauler configurable en la hoja de ruta, y el orden no es
 * estético: **es la API que el tauler consumirá.** Construir el tauler primero
 * significa que leería directamente los ficheros de `data/cache/`, y el día que
 * alguien quiera embeber un widget en otro sitio habría que inventar la API otra
 * vez y migrar el tauler.
 *
 * Tres decisiones que conviene no volver a discutir:
 *
 *  · **Los nombres de campo van en inglés**, no en catalán. No es descuido: son
 *    los slugs canónicos de `variables.ts`, la tabla Rosetta del proyecto, y
 *    coinciden con los de Open-Meteo y con los de la XEMA. Traducirlos crearía un
 *    segundo sistema de nombres que habría que mantener en paralelo. La página
 *    que documenta el feed sí está en catalán.
 *
 *  · **Lleva `version`.** Un feed público sin número de versión es un feed que no
 *    se puede cambiar nunca sin romper a alguien.
 *
 *  · **Lleva la atribución dentro del propio JSON.** La licencia CC-BY la exige y
 *    un consumidor que solo ve el JSON no tiene otra forma de saber a quién citar.
 */

const LICENSE =
  'Dades sota CC-BY 4.0. Cal citar la font de cada bloc, indicada a "sources".';

export interface FeedOptions {
  /** Horas de serie horaria. Por defecto 48; el techo es el horizonte del modelo. */
  hours?: number;
}

/** Redondeo estable: evita que el JSON lleve 12.300000000000001. */
const r1 = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? null : Math.round(v * 10) / 10;
const r0 = (v: number | null | undefined) =>
  v == null || !Number.isFinite(v) ? null : Math.round(v);

export async function locationFeed(loc: Location, opts: FeedOptions = {}) {
  const hours = Math.max(1, Math.min(168, opts.hours ?? 48));

  const comarca = comarcaOf(loc);
  const municipi = loc.level === 'municipi'
    ? null
    : locationById(loc.parentId ?? '') ?? null;

  // Las cuatro a la vez: son lecturas independientes de instantáneas distintas.
  const [current, forecast, air, warnings] = await Promise.all([
    currentFor(loc), forecastFor(loc), airQualityFor(loc), warningsFor(loc),
  ]);
  const nowHour = localNowHour();
  const today = localToday();
  const narrative = narrativeFor(forecast, current, nowHour, today);

  const sources: string[] = [];
  if (current) sources.push(current.source);
  if (forecast) sources.push(forecast.source);
  if (air) sources.push(air.source);
  if (warnings.length) sources.push('AEMET · avisos oficials CAP');
  sources.push('Institut Cartogràfic i Geològic de Catalunya · límits i topònims');

  return {
    version: 1,
    generated_at: new Date().toISOString(),
    license: LICENSE,
    sources: [...new Set(sources)],

    location: {
      id: loc.id,
      name: loc.nom,
      level: loc.level,
      path: loc.path,
      latitude: loc.lat,
      longitude: loc.lon,
      elevation: loc.altitud,
      population: loc.poblacio,
      comarca: comarca ? { code: comarca.codi, name: comarca.nom, path: comarca.path } : null,
      municipality: municipi ? { name: municipi.nom, path: municipi.path } : null,
    },

    /*
     * Las frases, tal cual salen en la web.
     *
     * Es lo que hace este feed distinto de un volcado de números: cualquiera
     * puede calcular una media, y nadie más publica «el gruix cau cap a les 18 h,
     * 21 mm en una hora».
     */
    summary: narrative && {
      today: narrative.today,
      change: narrative.change,
      tomorrow: narrative.tomorrow,
      vs_yesterday: narrative.vsYesterday,
      uncertainty: narrative.uncertainty,
      notes: narrative.notes,
    },

    observation: current && {
      // La procedencia va con el dato, no en una nota al pie: sin la estación, la
      // distancia y el desnivel, un consumidor no puede juzgar el número.
      station: {
        code: current.station.codi,
        name: current.station.nom,
        distance_km: current.station.distKm,
        elevation_difference_m: current.station.dAltM,
      },
      observed_at: current.observedAt,
      age_minutes: current.ageMin,
      provisional: current.provisional,
      /** Lectura cruda de la estación. */
      temperature_station: current.temperature,
      /** Corregida por el desnivel con el gradiente estándar de 6,5 °C/km. */
      temperature: current.temperatureAdjusted,
      apparent_temperature: current.apparent,
      humidity: current.humidity,
      wind_speed: current.windSpeed,
      wind_speed_kmh: r1(current.windSpeed != null ? msToKmh(current.windSpeed) : null),
      wind_direction: current.windDirection,
      wind_gust: current.windGust,
      pressure_station: current.pressure,
      precipitation_24h: current.precip24h,
      temperature_max_today: current.todayMax,
      temperature_min_today: current.todayMin,
      precipitation_today: current.todayPrecip,
      temperature_max_yesterday: current.yesterdayMax,
      temperature_min_yesterday: current.yesterdayMin,
    },

    day_parts: narrative?.parts.map((p) => ({
      part: p.key,
      label: p.label,
      day: p.day,
      from: p.first,
      to: p.last,
      temperature_min: p.tMin,
      temperature_max: p.tMax,
      weather_code: p.weatherCode,
      weather: weatherCode(p.weatherCode).ca,
      precipitation: p.precip,
      precipitation_probability: p.precipProb,
      wind_max: p.windMax,
      wind_gust_max: p.gustMax,
      uv_index_max: p.uvMax,
    })) ?? null,

    rain_windows: narrative?.windows.map((w) => ({
      from: w.from,
      to: w.to,
      hours: w.hours,
      precipitation: w.mm,
      probability: w.prob,
      peak_at: w.peak.time,
      peak_precipitation: w.peak.mm,
      /** Intensidad de la hora punta, escala AEMET en mm/h. */
      intensity: w.intensity,
      concentrated: w.concentrated,
      thunder: w.thunder,
    })) ?? null,

    forecast: forecast && {
      issued_at: forecast.issuedAt,
      /*
       * La serie empieza a las 00:00 de hoy, no en la hora en curso: la página
       * dibuja el día entero, incluido lo que ya ha pasado, y el feed devuelve lo
       * mismo para que las dos cosas cuadren.
       *
       * Para quien quiera «les pròximes N hores» está este campo, que ahorra
       * tener que recalcular la zona horaria de Madrid en el cliente — que es
       * exactamente donde este proyecto ya se equivocó una vez.
       */
      now: {
        hour: `${nowHour}:00`,
        index: forecast.hourly.findIndex((h) => h.time.slice(0, 13) === nowHour),
      },
      models: forecast.models,
      model_count: forecast.nModels,
      elevation_correction_m: forecast.altitudeCorrectionM,
      /** Falso mientras no exista la verificación por acierto: hoy los modelos pesan igual. */
      skill_weighted: forecast.skillWeighted,
      hourly: forecast.hourly.slice(0, hours).map((h) => ({
        time: h.time,
        temperature: h.temperature,
        apparent_temperature: h.apparent,
        precipitation: h.precipitation,
        precipitation_probability: h.precipProbability,
        weather_code: h.weatherCode,
        cloud_cover: h.cloudCover,
        humidity: h.humidity,
        dew_point: h.dewPoint,
        wind_speed: h.windSpeed,
        wind_direction: h.windDirection,
        wind_gust: h.windGust,
        uv_index: h.uvIndex,
        snowfall: h.snowfall,
        freezing_level: h.freezingLevel,
        is_day: h.isDay,
        /** Desviación entre modelos. Null cuando solo hay uno. */
        spread: h.spread,
      })),
      daily: forecast.daily.map((d) => ({
        date: d.date,
        temperature_max: d.tMax,
        temperature_min: d.tMin,
        weather_code: d.weatherCode,
        precipitation: d.precipitation,
        precipitation_probability: d.precipProbability,
        precipitation_hours: d.precipHours,
        snowfall: d.snowfall,
        snow_level: d.snowLevel,
        wind_max: d.windMax,
        wind_gust_max: d.gustMax,
        wind_direction: d.windDirection,
        uv_index_max: d.uvMax,
        sunrise: d.sunrise,
        sunset: d.sunset,
      })),
    },

    air_quality: air && {
      observed_at: air.observedAt,
      // La resolución va con el dato: son 11 km de celda, no este punto.
      cell_km: air.cellKm,
      european_aqi: air.aqi,
      driver: air.driver?.slug ?? null,
      pollutants: Object.fromEntries(air.pollutants.map((p) => [p.slug, p.value])),
      pollen: Object.fromEntries(air.pollen.map((p) => [p.slug, { value: p.value, level: p.level }])),
      daily_max: air.daily.map((d) => ({ date: d.date, max: d.max, at: d.maxHour })),
    },

    warnings: warnings.map((w) => ({
      id: w.id,
      event: w.event,
      phenomenon: w.phenomenon,
      level: w.level,
      onset: w.onset,
      expires: w.expires,
      headline: w.headline,
      /** El texto oficial no se reescribe nunca. */
      description: w.description,
      instruction: w.instruction,
      web: w.web,
    })),
  };
}

/** Columnas del CSV horario, en el orden en que salen. */
const CSV_COLUMNS = [
  'time', 'temperature', 'apparent_temperature', 'precipitation',
  'precipitation_probability', 'weather_code', 'cloud_cover', 'humidity',
  'wind_speed_kmh', 'wind_direction', 'wind_gust_kmh', 'uv_index',
] as const;

/**
 * La misma serie horaria en CSV.
 *
 * No es un capricho: es el formato que se pega en una hoja de cálculo, y el que
 * pide quien quiere hacer un gráfico propio sin escribir código. El viento va en
 * km/h y no en m/s porque quien abre un CSV en Excel no va a convertir nada — el
 * nombre de la columna lo dice para que no haya duda.
 */
export async function locationCsv(loc: Location, opts: FeedOptions = {}): Promise<string> {
  const hours = Math.max(1, Math.min(168, opts.hours ?? 48));
  const forecast = await forecastFor(loc);
  if (!forecast) return `# Sense predicció per a ${loc.nom}\n`;

  const rows = forecast.hourly.slice(0, hours).map((h) => [
    h.time,
    h.temperature ?? '',
    h.apparent ?? '',
    h.precipitation ?? '',
    h.precipProbability ?? '',
    h.weatherCode ?? '',
    h.cloudCover ?? '',
    h.humidity ?? '',
    r1(h.windSpeed != null ? msToKmh(h.windSpeed) : null) ?? '',
    h.windDirection ?? '',
    r0(h.windGust != null ? msToKmh(h.windGust) : null) ?? '',
    h.uvIndex ?? '',
  ].join(','));

  // Las cabeceras de comentario van con `#`, que es lo que ignoran los
  // importadores de hojas de cálculo cuando se les dice que las salte.
  return [
    `# ${loc.nom} (${loc.path}) · ${loc.altitud ?? '?'} m`,
    `# ${forecast.source} · ${LICENSE}`,
    `# Predicció emesa ${forecast.issuedAt} · consens de ${forecast.nModels} model(s)`,
    CSV_COLUMNS.join(','),
    ...rows,
  ].join('\n') + '\n';
}
