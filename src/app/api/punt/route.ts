import { nearestPlace } from '@/lib/nearby';
import { locationById, locationByPath } from '@/lib/territory';
import { absolute } from '@/lib/site';
import { langFromHost, tr } from '@/lib/lang';

/**
 * De una coordenada al lloc que li toca.
 *
 *     /api/punt?lat=41.39&lon=2.17
 *
 * Torna el lloc —el mateix que trobaria «On sóc»: el municipi on cau el punt i
 * el nucli publicat més proper d'aquell municipi— i l'adreça de `/api/lloc` on
 * hi ha les dades. No les torna aquí mateix a posta: així cada lloc té una sola
 * adreça de dades i una sola entrada a la memòria cau.
 *
 * ## Per què GET, si «On sóc» va per POST
 *
 * `/api/aprop` el fa servir el web amb la ubicació d'una **persona**, i per
 * això va pel cos de la petició, que no queda als registres. Aquí la
 * coordenada la posa un programa —una estació, un mapa, un adaptador— i ha de
 * poder-se desar en memòria cau. Per no fer-ne una entrada per cada decimal,
 * només s'accepten **dos decimals** (un quilòmetre, que és la resolució de
 * `nearestPlace()`): amb més, una redirecció a la coordenada arrodonida.
 */
export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Access-Control-Allow-Origin': '*',
  'X-Robots-Tag': 'noindex',
};

export async function GET(req: Request) {
  const lang = langFromHost(req.headers.get('host'));
  const url = new URL(req.url);
  const rawLat = url.searchParams.get('lat');
  const rawLon = url.searchParams.get('lon');
  const extra = [...url.searchParams.keys()].some((k) => k !== 'lat' && k !== 'lon');
  const num = /^-?\d{1,3}(\.\d+)?$/;
  if (extra || !rawLat || !rawLon || !num.test(rawLat) || !num.test(rawLon)
    || Math.abs(Number(rawLat)) > 90 || Math.abs(Number(rawLon)) > 180) {
    return new Response(JSON.stringify({ error: tr(
      lang,
      'Cal «lat» i «lon» en graus decimals, i res més: /api/punt?lat=41.39&lon=2.17',
      'Hacen falta «lat» y «lon» en grados decimales, y nada más: /api/punt?lat=41.39&lon=2.17',
    ) }), { status: 400, headers: HEADERS });
  }

  const lat = (Math.round(Number(rawLat) * 100) / 100).toFixed(2);
  const lon = (Math.round(Number(rawLon) * 100) / 100).toFixed(2);
  if (lat !== rawLat || lon !== rawLon) {
    return new Response(null, {
      status: 308,
      headers: { ...HEADERS, Location: `/api/punt?lat=${lat}&lon=${lon}`, 'Vercel-CDN-Cache-Control': 'max-age=86400' },
    });
  }

  const near = nearestPlace(Number(lat), Number(lon));
  const found = near ? locationByPath(near.path) : undefined;
  // Un barri d'OpenStreetMap és ODbL i no entra a l'API (CC BY): es torna el municipi.
  const loc = found?.geocodeSource === 'osm' ? locationById(found.parentId ?? '') : found;
  const cache = { 'Cache-Control': 'public, max-age=3600', 'Vercel-CDN-Cache-Control': 'max-age=86400' };
  if (!near || !loc) {
    return new Response(JSON.stringify({ error: tr(lang, 'El punt és fora de Catalunya.', 'El punto está fuera de Cataluña.') }), {
      status: 404, headers: { ...HEADERS, ...cache },
    });
  }

  return new Response(JSON.stringify({
    version: 1,
    query: { latitude: Number(lat), longitude: Number(lon) },
    place: {
      id: loc.id,
      municipality_code: loc.municipiCodi ?? null,
      ine_code: loc.municipiIne5 ?? null,
      name: loc.nom,
      level: loc.level,
      path: loc.path,
      distance_km: near.distKm,
      latitude: loc.lat,
      longitude: loc.lon,
      elevation: loc.altitud,
    },
    api: absolute(`/api/lloc${loc.path}`, lang),
    web: absolute(loc.path, lang),
  }), { headers: { ...HEADERS, ...cache } });
}
