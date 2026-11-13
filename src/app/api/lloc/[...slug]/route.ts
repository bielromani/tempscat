import { locationCsv, locationFeed, parseFeedHours, FEED_HOURS } from '@/lib/feed';
import { langFromHost, tr } from '@/lib/lang';
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
 *  · **Cinc minuts al CDN i prou**, com les fitxes (`LIVE_PAGES` a
 *    `next.config.ts`). Abans era ISR —`revalidate = 600` amb
 *    `stale-while-revalidate=3600`— i ISR serveix primer la còpia vella: un
 *    endpoint que ningú no havia demanat en dies tornava, a la primera petició,
 *    dades de dies enrere. Va passar amb `/api/ranquings`, que va donar les del
 *    6 de novembre el 13. Passats els cinc minuts no se serveix la vella: es
 *    torna a generar.
 */

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Cache-Control': 'public, max-age=0, must-revalidate',
  'Vercel-CDN-Cache-Control': 'max-age=300',
  'X-Robots-Tag': 'noindex',
};

export async function GET(
  req: Request,
  { params }: { params: Promise<{ slug: string[] }> },
) {
  const { slug } = await params;
  // No passa per `[lang]`: l'idioma surt del domini, com als feeds d'avisos.
  const lang = langFromHost(req.headers.get('host'));

  // Una ubicación son dos o tres segmentos: comarca/municipi[/entitat]. Más allá
  // no existe, y validarlo aquí evita que la resolución de rutas dependa de lo
  // que devuelva un mapa con una clave inventada.
  if (!slug?.length || slug.length > 3) {
    return json({ error: tr(
      lang,
      'Ruta no vàlida. Format: /api/lloc/{comarca}/{municipi}[/{entitat}]',
      'Ruta no válida. Formato: /api/lloc/{comarca}/{municipi}[/{entitat}]',
    ) }, 400);
  }

  const loc = locationByPath(`/${slug.join('/')}`);
  if (!loc) {
    return json({ error: tr(
      lang,
      `No hi ha cap ubicació publicada a /${slug.join('/')}`,
      `No hay ninguna ubicación publicada en /${slug.join('/')}`,
    ) }, 404);
  }
  /*
   * Els barris que surten d'OpenStreetMap són ODbL, i aquesta API promet CC BY:
   * posar-los-hi en faria una base de dades derivada, com passaria amb els
   * itineraris. La fitxa sí que els ensenya, dient d'on surten.
   */
  if (loc.geocodeSource === 'osm') {
    return json({ error: tr(
      lang,
      `/${slug.join('/')} és un barri amb el contorn d'OpenStreetMap (ODbL), que no entra a l'API de dades (CC BY)`,
      `/${slug.join('/')} es un barrio con el contorno de OpenStreetMap (ODbL), que no entra en la API de datos (CC BY)`,
    ) }, 404);
  }

  const url = new URL(req.url);
  const hours = parseFeedHours(url.searchParams.get('hours'));
  if (hours === null) {
    return json({ error: tr(
      lang,
      `«hours» ha de ser un nombre enter entre 1 i ${FEED_HOURS.max}. Sense, en torna ${FEED_HOURS.default}.`,
      `«hours» debe ser un número entero entre 1 y ${FEED_HOURS.max}. Sin él, devuelve ${FEED_HOURS.default}.`,
    ) }, 400);
  }

  if (url.searchParams.get('format') === 'csv') {
    return new Response(await locationCsv(loc, { hours, lang }), {
      headers: {
        ...HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${loc.slug}-prediccio.csv"`,
      },
    });
  }

  return json(await locationFeed(loc, { hours, lang }), 200);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body, null, status === 200 ? 0 : 1), {
    status,
    headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
