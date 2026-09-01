import { rankings, type PlaceRow, type StationRow } from '@/lib/rankings';

/**
 * Los extremos del día en JSON.
 *
 *     /api/ranquings
 *
 * Es el feed más pequeño y probablemente el más útil de todos: «quin poble ha fet
 * la màxima avui» es una pregunta que se hace a diario en redacciones y en
 * conversaciones, y hoy nadie la publica en un formato que se pueda consumir.
 *
 * Las dos clasificaciones van separadas y etiquetadas, igual que en la página:
 * las estaciones son medida y los municipios son estimación corregida por
 * altitud. Un consumidor que las mezcle lo hará sabiendo lo que mezcla.
 *
 * Los nombres de campo se traducen aquí y no se sirven los internos. La primera
 * versión devolvía `codi`, `nom`, `comarcaNom` y `dAltM` tal cual, y eso dejaba
 * la API con **dos sistemas de nombres**: catalán y camelCase aquí, inglés y
 * snake_case en el feed de ubicación. Es justo lo que este proyecto había
 * decidido no tener, y se colaba por la puerta de atrás.
 */

export const revalidate = 600;

export async function GET() {
  const r = await rankings();

  if (!r) {
    return new Response(JSON.stringify({ error: 'Encara no hi ha observació carregada.' }), {
      status: 503,
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
    });
  }

  const station = (r2: StationRow) => ({
    station_code: r2.codi,
    station_name: r2.nom,
    elevation: r2.altitud,
    comarca: r2.comarcaNom,
    value: r2.value,
    note: r2.note ?? null,
    nearest_place: r2.path && r2.placeNom
      ? { name: r2.placeNom, path: r2.path, distance_km: r2.distKm ?? null }
      : null,
  });

  const place = (p2: PlaceRow) => ({
    id: p2.id,
    name: p2.nom,
    path: p2.path,
    elevation: p2.altitud,
    comarca: p2.comarcaNom,
    value: p2.value,
    station_name: p2.stationNom,
    elevation_difference_m: p2.dAltM,
  });

  const body = {
    version: 1,
    generated_at: new Date().toISOString(),
    license: 'Dades sota CC-BY 4.0. Font: Servei Meteorològic de Catalunya (XEMA).',
    source: r.source,
    day: r.day,
    observed_at: r.observedAt,
    age_minutes: r.ageMin,
    /** Medido. 0 interpretación. */
    stations: {
      count: r.stations.total,
      now_coldest: r.stations.nowColdest.map(station),
      now_warmest: r.stations.nowWarmest.map(station),
      day_max: r.stations.dayMax.map(station),
      day_min: r.stations.dayMin.map(station),
      /** Amplitud térmica: máxima menos mínima del día natural. */
      day_range: r.stations.range.map(station),
      rain: r.stations.rain.map(station),
      /** Racha de la última lectura, no del día. */
      gust_kmh: r.stations.gust.map(station),
    },
    /** Estimado: lectura de la estación de referencia corregida por el desnivel. */
    municipalities: {
      count: r.places.total,
      excluded_over_300m: r.places.excluded,
      coldest: r.places.coldest.map(place),
      warmest: r.places.warmest.map(place),
    },
  };

  return new Response(JSON.stringify(body), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
      'X-Robots-Tag': 'noindex',
    },
  });
}
