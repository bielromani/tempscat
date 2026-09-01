import { locationCsv, locationFeed } from '@/lib/feed';
import { locationByPath } from '@/lib/territory';

/**
 * Feed público de una ubicación.
 *
 *     /api/lloc/conca-de-barbera/montblanc
 *     /api/lloc/conca-de-barbera/montblanc/lilla?hours=168
 *     /api/lloc/conca-de-barbera/montblanc?format=csv
 *
 * Lee lo mismo que la página, así que no dispara ninguna llamada externa ni
 * consume cuota: la ruta del feed y la de la ficha comparten hasta la
 * memorización del snapshot.
 *
 * Tres cabeceras que no son decorativas:
 *
 *  · **`Access-Control-Allow-Origin: *`.** Son datos abiertos y el destino
 *    natural es un widget en el navegador de otra persona. Sin esto, ese uso es
 *    imposible.
 *  · **`X-Robots-Tag: noindex`.** El riesgo declarado de este proyecto es el
 *    *index bloat* de 4.293 rutas; duplicarlas en JSON sería alimentarlo.
 *  · **`s-maxage=600`**, la cadencia del worker de observación, con
 *    `stale-while-revalidate` para que nadie espere a la regeneración.
 */

export const revalidate = 600;

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, s-maxage=600, stale-while-revalidate=3600',
  'X-Robots-Tag': 'noindex',
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;

  // Una ubicación son dos o tres segmentos: comarca/municipi[/entitat]. Más allá
  // no existe, y validarlo aquí evita que la resolución de rutas dependa de lo
  // que devuelva un mapa con una clave inventada.
  if (!slug?.length || slug.length > 3) {
    return json({ error: 'Ruta no vàlida. Format: /api/lloc/{comarca}/{municipi}[/{entitat}]' }, 400);
  }

  const loc = locationByPath(`/${slug.join('/')}`);
  if (!loc) {
    return json({ error: `No hi ha cap ubicació publicada a /${slug.join('/')}` }, 404);
  }

  const url = new URL(req.url);
  const hours = Number(url.searchParams.get('hours')) || undefined;

  if (url.searchParams.get('format') === 'csv') {
    return new Response(await locationCsv(loc, { hours }), {
      headers: {
        ...HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${loc.slug}-prediccio.csv"`,
      },
    });
  }

  return json(await locationFeed(loc, { hours }), 200);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, status === 200 ? 0 : 1), {
    status,
    headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
