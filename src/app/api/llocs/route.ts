import { allPublishedPaths, comarcaOf, locationByPath } from '@/lib/territory';

/**
 * L'índex de tots els llocs que tenen fitxa, per saber quin `path` demanar a
 * `/api/lloc`.
 *
 *     /api/llocs
 *
 * Surt del territori construït (`data/build/`), que només canvia amb un
 * desplegament: per això un dia al CDN, i no cinc minuts. És una sola petició
 * per a qui en fa un adaptador, en comptes d'endevinar camins. Les dades d'un
 * lloc són a `/api/lloc` + `path`.
 *
 * Els barris amb el contorn d'OpenStreetMap no hi són, pel mateix motiu que
 * `/api/lloc` no els serveix: són ODbL i l'API promet CC BY.
 */
export const dynamic = 'force-dynamic';

export async function GET() {
  const places = allPublishedPaths()
    .map((p) => locationByPath(p.path))
    .filter((l): l is NonNullable<typeof l> => !!l && l.level !== 'comarca' && l.geocodeSource !== 'osm')
    .map((l) => ({
      id: l.id,
      municipality_code: l.municipiCodi ?? null,
      ine_code: l.municipiIne5 ?? null,
      name: l.nom,
      level: l.level,
      path: l.path,
      comarca: comarcaOf(l)?.nom ?? null,
      latitude: l.lat == null ? null : Math.round(l.lat * 1e5) / 1e5,
      longitude: l.lon == null ? null : Math.round(l.lon * 1e5) / 1e5,
      elevation: l.altitud,
    }));

  return new Response(JSON.stringify({
    version: 1,
    generated_at: new Date().toISOString(),
    license: 'CC BY 4.0. Límits i topònims: Institut Cartogràfic i Geològic de Catalunya; Nomenclàtor: IDESCAT.',
    count: places.length,
    places,
  }), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600',
      'Vercel-CDN-Cache-Control': 'max-age=86400',
      'X-Robots-Tag': 'noindex',
    },
  });
}
