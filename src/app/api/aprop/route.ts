import { nearestPlace } from '@/lib/nearby';

/**
 * «On sóc»: de la ubicació del mòbil a la fitxa del lloc.
 *
 *     POST /api/aprop   {"lat": 41.42, "lon": 2.11}
 *
 * ## Per què POST i no `?lat=&lon=`
 *
 * Perquè una adreça es queda als registres —els del CDN, els de les funcions,
 * l'historial del navegador— i el cos d'una petició, no. Una ubicació és una
 * dada personal encara que vagi arrodonida, i la política de privadesa diu que
 * no se'n desa cap. Per això tampoc és una pàgina: no hi ha res a indexar ni a
 * desar en memòria cau.
 *
 * El navegador ja l'envia arrodonida a dos decimals —un quilòmetre— i
 * `nearestPlace()` la torna a arrodonir. No dispara cap crida externa.
 */

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

export async function POST(req: Request) {
  let lat: unknown;
  let lon: unknown;
  try {
    ({ lat, lon } = await req.json() as { lat?: unknown; lon?: unknown });
  } catch {
    return answer({ error: 'bad-request' }, 400);
  }
  if (typeof lat !== 'number' || typeof lon !== 'number'
    || !Number.isFinite(lat) || !Number.isFinite(lon)
    || Math.abs(lat) > 90 || Math.abs(lon) > 180) {
    return answer({ error: 'bad-request' }, 400);
  }

  const place = nearestPlace(lat, lon);
  return place ? answer(place) : answer({ error: 'outside' });
}
