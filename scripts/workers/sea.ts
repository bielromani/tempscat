/**
 * Worker · el mar: estado de las playas y modelo de oleaje.
 *
 * Dos fuentes que contestan cosas distintas, como el aire:
 *
 *  · **Las banderas de las playas** (`4baz-cjv2`) las ponen los socorristas y se
 *    publican **en vivo** — al escribir esto, la última fila tenía un minuto. Son
 *    325 playas, con bandera, motivo, estado del mar, transparencia del agua y
 *    hasta medusas con especie y abundancia. Es la respuesta buena a «puc
 *    banyar-me», y es una persona mirando el agua, no un modelo.
 *  · **El modelo marino** de Open-Meteo (CAMS/MFWAM) da temperatura del agua,
 *    altura y período de ola en cualquier punto de mar, también donde no hay
 *    socorrista y también fuera de temporada.
 *
 * ## Lo que hay que tener cuidado con las banderas
 *
 * Una bandera **caduca**. La ponen los socorristas cuando están de servicio, y
 * fuera de ese horario —de noche, o fuera de temporada— la última fila se queda
 * ahí para siempre. Publicar una verde de hace tres días como si fuera de ahora
 * es el fallo más peligroso que puede cometer este sitio: alguien se mete al agua
 * por lo que dice una web.
 *
 * Por eso cada estado lleva su antigüedad y el worker la mide; la página decide
 * a partir de qué edad deja de llamarlo «ara».
 *
 * ## Rarezas del dataset de playas
 *
 * · **`coordenada_x` es la latitud y `coordenada_y` es la longitud.** Están al
 *   revés de lo que dice el nombre. Sin darse cuenta, todas las playas caen en
 *   Somalia.
 * · **`estat_data` va en DD/MM/YYYY con una T pegada**: `01/09/2026T08:04:01.000Z`.
 *   No es ISO y `Date.parse` lo lee mal o no lo lee. Hay que trocearlo.
 * · Es un histórico: 231.530 filas. El estado actual es la última fila de cada
 *   playa, y se pide por `:updated_at`, que es el único campo ordenable de verdad.
 *
 * Salida: data/cache/sea.json
 */
import { fetchWithRetry } from '../lib/http.ts';
import { soql } from '../lib/socrata.ts';
import {
  DAILY_LIMITS, QuotaGuard, publish, recordFreshness, syncState, writeSnapshot,
} from '../lib/store.ts';

const BEACHES = '4baz-cjv2';
const MARINE = 'https://marine-api.open-meteo.com/v1/marine';

/** Separación entre puntos de mar, en km. */
const SPACING_KM = 15;
/** Cuánto se aleja de la costa cada punto. Lo justo para caer en agua. */
const OFFSHORE_KM = 5;
const FORECAST_DAYS = 3;

interface Row { [k: string]: string }

export interface Beach {
  code: string;
  name: string;
  municipality: string;
  municipalityIne5: string;
  coast: string;
  lat: number;
  lon: number;
  /** verda · groga · vermella · sense informacio · complet */
  flag: string;
  flagReason: string;
  weather: string;
  seaState: string;
  swell: string;
  transparency: string;
  temperature: string;
  /** Especie, abundancia y tamaño, tal como lo escribe el socorrista. */
  jellyfish: string | null;
  /** Instante del parte, en ISO. */
  at: string;
  /** Horas transcurridas. La página decide a partir de cuántas deja de ser «ara». */
  ageHours: number;
}

export interface SeaPoint {
  id: string;
  lat: number;
  lon: number;
  /** Playa de referencia, para poder nombrar el tramo. */
  near: string;
  times: string[];
  sst: Array<number | null>;
  waveHeight: Array<number | null>;
  wavePeriod: Array<number | null>;
  waveDirection: Array<number | null>;
  swellHeight: Array<number | null>;
}

export interface SeaData {
  beaches: Beach[];
  points: SeaPoint[];
  /** Cuántas playas tienen un parte de menos de 12 h. */
  fresh: number;
}

const NA = (v: string | undefined) => (!v || v === 'N/A' ? '' : v);

/** `01/09/2026T08:04:01.000Z` → ISO. No es ISO de origen: día primero. */
function parseBeachDate(v: string | undefined): string | null {
  if (!v) return null;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})T(\d{2}):(\d{2}):(\d{2})/.exec(v);
  if (!m) return null;
  const [, d, mo, y, hh, mm, ss] = m;
  return `${y}-${mo}-${d}T${hh}:${mm}:${ss}.000Z`;
}

const R = 6371;
const toRad = (d: number) => (d * Math.PI) / 180;
const toDeg = (r: number) => (r * 180) / Math.PI;

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = toRad(bLat - aLat);
  const dLon = toRad(bLon - aLon);
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Puntos de mar derivados de las propias playas.
 *
 * No hace falta una línea de costa: las 325 playas **son** la costa, con
 * coordenadas reales. Se ordenan de norte a sur —la costa catalana es monótona en
 * latitud de Portbou a Alcanar—, se toma una cada quince kilómetros y se empuja
 * mar adentro por la perpendicular al tramo.
 *
 * De las dos perpendiculares posibles se elige la que apunta al **este**, porque
 * en Catalunya el mar siempre está a levante. Es una regla que no vale en
 * cualquier costa y aquí es exacta.
 */
function seaPointsFrom(beaches: Beach[]): Array<{ id: string; lat: number; lon: number; near: string }> {
  const sorted = [...beaches].sort((a, b) => b.lat - a.lat);

  const sampled: Beach[] = [];
  for (const b of sorted) {
    const last = sampled[sampled.length - 1];
    if (!last || distKm(last.lat, last.lon, b.lat, b.lon) >= SPACING_KM) sampled.push(b);
  }

  return sampled.map((b, i) => {
    const prev = sampled[Math.max(0, i - 1)];
    const next = sampled[Math.min(sampled.length - 1, i + 1)];

    // Rumbo del tramo de costa, de norte a sur.
    const dLat = next.lat - prev.lat;
    const dLon = (next.lon - prev.lon) * Math.cos(toRad(b.lat));
    const bearing = Math.atan2(dLon, dLat);

    // Las dos perpendiculares; gana la que tiene componente este positiva.
    const a = bearing + Math.PI / 2;
    const perp = Math.sin(a) > 0 ? a : bearing - Math.PI / 2;

    const dNorth = (OFFSHORE_KM / R) * Math.cos(perp);
    const dEast = (OFFSHORE_KM / R) * Math.sin(perp);

    return {
      id: `p${i}`,
      lat: Math.round((b.lat + toDeg(dNorth)) * 10000) / 10000,
      lon: Math.round((b.lon + toDeg(dEast) / Math.cos(toRad(b.lat))) * 10000) / 10000,
      near: b.name,
    };
  });
}

async function main() {
  // El comptador de quota i el registre de frescor viuen al magatzem:
  // sense això, cada execució automàtica començaria de zero i en
  // publicaria un amb una sola entrada. Abans de construir el guardià.
  await syncState();
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  // ── Banderas ──────────────────────────────────────────────────────────────
  //
  // El estado actual es la última fila de cada playa. Se piden las más recientes
  // por `:updated_at` —el único campo ordenable, porque `estat_data` es texto en
  // formato de día primero— y se reduce localmente.
  const rows = await soql<Row>(BEACHES, {
    select: ':updated_at,codiplatja,platja,municipi_municipi,municipi_codimunicipi,'
      + 'municipi_costa,coordenada_x,coordenada_y,estat_data,estat_bandera,'
      + 'estat_motiubandera,estat_meteorologia,estat_estatmar,estat_mardefons,'
      + 'estat_transparenciaaigua,estat_temperatura,estat_meduses',
    order: ':updated_at DESC',
    limit: 8_000,
  });
  quota.spend('socrata', 1);
  console.log(`Files de platges descarregades: ${rows.length}`);

  const latest = new Map<string, Row>();
  for (const r of rows) {
    if (!latest.has(r.codiplatja)) latest.set(r.codiplatja, r);
  }

  const now = Date.now();
  const beaches: Beach[] = [];
  for (const r of latest.values()) {
    // OJO: coordenada_x es la latitud y coordenada_y la longitud. Los nombres
    // están cambiados en el origen.
    const lat = Number(r.coordenada_x);
    const lon = Number(r.coordenada_y);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) continue;

    const at = parseBeachDate(r.estat_data);
    if (!at) continue;

    beaches.push({
      code: r.codiplatja,
      name: r.platja ?? '',
      municipality: r.municipi_municipi ?? '',
      // El código del municipio lleva seis dígitos, como el de la sequía.
      municipalityIne5: (r.municipi_codimunicipi ?? '').slice(0, 5),
      coast: r.municipi_costa ?? '',
      lat: Math.round(lat * 100000) / 100000,
      lon: Math.round(lon * 100000) / 100000,
      flag: NA(r.estat_bandera) || 'sense informacio',
      flagReason: NA(r.estat_motiubandera),
      weather: NA(r.estat_meteorologia),
      seaState: NA(r.estat_estatmar),
      swell: NA(r.estat_mardefons),
      transparency: NA(r.estat_transparenciaaigua),
      temperature: NA(r.estat_temperatura),
      jellyfish: NA(r.estat_meduses) || null,
      at,
      ageHours: Math.round((now - Date.parse(at)) / 3_600_000),
    });
  }
  beaches.sort((a, b) => b.lat - a.lat);

  const fresh = beaches.filter((b) => b.ageHours <= 12).length;
  console.log(`Platges amb estat: ${beaches.length} · amb parte de menys de 12 h: ${fresh}`);

  const byFlag = new Map<string, number>();
  for (const b of beaches.filter((x) => x.ageHours <= 12)) {
    byFlag.set(b.flag, (byFlag.get(b.flag) ?? 0) + 1);
  }
  if (byFlag.size) {
    console.log('Banderes vigents:');
    for (const [f, n] of [...byFlag].sort((a, b) => b[1] - a[1])) console.log(`  ${f.padEnd(20)} ${n}`);
  }
  const jelly = beaches.filter((b) => b.ageHours <= 12 && b.jellyfish);
  if (jelly.length) console.log(`Platges amb meduses reportades: ${jelly.length}`);

  // ── Modelo marino ─────────────────────────────────────────────────────────
  const points = seaPointsFrom(beaches);
  console.log(`\nPunts de mar derivats de la costa: ${points.length}`);

  const params = new URLSearchParams({
    latitude: points.map((p) => p.lat.toFixed(4)).join(','),
    longitude: points.map((p) => p.lon.toFixed(4)).join(','),
    hourly: 'sea_surface_temperature,wave_height,wave_period,wave_direction,swell_wave_height',
    forecast_days: String(FORECAST_DAYS),
    timezone: 'Europe/Madrid',
  });

  const res = await fetchWithRetry(`${MARINE}?${params}`, { retries: 4, timeoutMs: 90_000 });
  const text = (await res.text()).replace(/:\s*-?nan\b/gi, ':null');
  const parsed = JSON.parse(text) as Array<{ hourly: Record<string, Array<number | null>> & { time: string[] } }>;
  const list = Array.isArray(parsed) ? parsed : [parsed];

  /*
   * El coste, medido y no supuesto: la fórmula de Open-Meteo es
   * max(1, variables/10) × max(1, días/14) × ubicaciones. Con 5 variables y 3
   * días los dos factores valen 1, así que el peso es el número de puntos.
   *
   * Unas pocas decenas por refresco. Aunque compartiera contador con la
   * predicción —que va justa—, sería un uno por ciento del techo diario: no hay
   * ninguna decisión de reparto que tomar.
   */
  const cost = points.length;
  quota.spend('open-meteo-marine', cost);
  console.log(`Cost del model marí: ${cost} unitats`);

  const seaPoints: SeaPoint[] = [];
  let dry = 0;
  list.forEach((r, i) => {
    const p = points[i];
    if (!p || !r?.hourly) return;
    const sst = r.hourly.sea_surface_temperature ?? [];
    // Un punto que cae en tierra devuelve la serie entera a null. No se guarda:
    // un punto de mar sin mar no es un punto de mar.
    if (!sst.some((v) => v != null)) { dry++; return; }
    seaPoints.push({
      id: p.id,
      lat: p.lat,
      lon: p.lon,
      near: p.near,
      times: r.hourly.time,
      sst,
      waveHeight: r.hourly.wave_height ?? [],
      wavePeriod: r.hourly.wave_period ?? [],
      waveDirection: r.hourly.wave_direction ?? [],
      swellHeight: r.hourly.swell_wave_height ?? [],
    });
  });

  console.log(`Punts amb dada de mar: ${seaPoints.length}${dry ? ` · ${dry} han caigut a terra i es descarten` : ''}`);

  const nowIso = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).replace(' ', 'T').slice(0, 13);
  const idx = Math.max(0, seaPoints[0]?.times.findIndex((t) => t.slice(0, 13) === nowIso) ?? 0);
  const temps = seaPoints.map((p) => p.sst[idx]).filter((v): v is number => v != null);
  const waves = seaPoints.map((p) => p.waveHeight[idx]).filter((v): v is number => v != null);
  if (temps.length) {
    console.log(`\nAigua ara: de ${Math.min(...temps).toFixed(1)} a ${Math.max(...temps).toFixed(1)} °C`);
  }
  if (waves.length) {
    console.log(`Onatge ara: de ${Math.min(...waves).toFixed(2)} a ${Math.max(...waves).toFixed(2)} m`);
  }

  const data: SeaData = { beaches, points: seaPoints, fresh };
  const newest = beaches[0] ? beaches.reduce((a, b) => (b.at > a ? b.at : a), beaches[0].at) : null;

  writeSnapshot('sea', 'Protecció Civil i socorristes · dades obertes · onatge d’Open-Meteo', data, newest);
  recordFreshness({
    source: 'sea',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: newest,
    // Las banderas son estacionales: fuera de temporada no se actualizan y eso no
    // es una avería. Tres días de margen para no pintar de rojo lo normal.
    stalenessLimitMin: 60 * 72,
    rows: beaches.length + seaPoints.length,
    apiCalls: 2,
  });

  console.log(`\n${quota.report()}`);
  console.log(`→ data/cache/sea.json (${((Date.now() - started) / 1000).toFixed(1)} s)`);

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
    if (pub.origin && process.env.BLOB_BASE_URL !== pub.origin) {
      console.log(`   BLOB_BASE_URL = ${pub.origin}`);
    }
  }
}

main().catch((err) => {
  recordFreshness({
    source: 'sea', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 72, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
