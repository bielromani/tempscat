import { atomFeed, icsFeed } from '@/lib/syndication';
import { activeWarnings } from '@/lib/weather';
import { comarcaBySlug } from '@/lib/territory';
import { comarcaName } from '@/lib/format';

/**
 * Los avisos como feed, de toda Catalunya o de una comarca.
 *
 *     /avisos/feed                     Atom de tot Catalunya
 *     /avisos/feed/bages               Atom del Bages
 *     /avisos/feed/bages?format=ics    el mateix, com a calendari
 *
 * La ruta es opcional-catch-all para que el feed general y el comarcal compartan
 * una sola implementación: la diferencia entre los dos es un filtro.
 *
 * Va sin `noindex`, al contrario que los feeds de datos: un feed de avisos es un
 * documento que la gente enlaza y comparte, y que un buscador lo conozca no crea
 * páginas duplicadas — es un tipo de contenido distinto, no una copia.
 */
export const revalidate = 300;

const SITE = 'https://meteo.example';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ comarca?: string[] }> },
) {
  const { comarca } = await params;

  if (comarca && comarca.length > 1) {
    return new Response('Not found', { status: 404 });
  }

  const slug = comarca?.[0];
  const c = slug ? comarcaBySlug(slug) : undefined;
  if (slug && !c) {
    return new Response(`No hi ha cap comarca a /${slug}`, { status: 404 });
  }

  const warnings = activeWarnings()
    .filter((w) => !c || w.comarcaCodis.includes(c.codi))
    .sort((a, b) => a.onset.localeCompare(b.onset));

  const where = c ? comarcaName(c.nom) : 'Catalunya';
  const title = `Avisos meteorològics · ${where}`;
  const path = `/avisos/feed${slug ? `/${slug}` : ''}`;

  const headers = {
    'Access-Control-Allow-Origin': '*',
    // Cinco minutos, como la página: en un episodio el retraso se nota.
    'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=900',
  };

  if (new URL(req.url).searchParams.get('format') === 'ics') {
    return new Response(icsFeed(warnings, title), {
      headers: {
        ...headers,
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': `inline; filename="avisos-${slug ?? 'catalunya'}.ics"`,
      },
    });
  }

  return new Response(
    atomFeed(warnings, {
      self: `${SITE}${path}`,
      site: SITE,
      title,
      subtitle: c
        ? `Avisos oficials de l'AEMET vigents ${comarcaName(c.nom)}`
        : "Avisos oficials de l'AEMET vigents a Catalunya",
    }),
    { headers: { ...headers, 'Content-Type': 'application/atom+xml; charset=utf-8' } },
  );
}
