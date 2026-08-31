import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocationView } from '@/components/LocationView';
import { describeLocation, metaDescription } from '@/lib/describe';
import {
  breadcrumbs, comarcaOf, entitatsOfMunicipi, locationByPath, locationById,
} from '@/lib/territory';
import {
  airQualityFor, astronomyFor, currentFor, forecastFor, historyFor,
  localNowHour, localToday, warningsFor,
} from '@/lib/weather';
import { comarcaComparison } from '@/lib/comparison';
import { aName } from '@/lib/format';
import { narrativeFor } from '@/lib/narrative';

/**
 * Página de entidad singular o núcleo. ~3.300 rutas.
 *
 * Es la razón de ser del proyecto: competir por "el temps a Lilla" en lugar de
 * por "el tiempo en Barcelona". Ninguna se prerenderiza en el build; se generan
 * la primera vez que alguien —o Googlebot— las pide.
 */
export const dynamicParams = true;
export const revalidate = 1800;

type Params = Promise<{ comarca: string; municipi: string; entitat: string }>;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { comarca, municipi, entitat } = await params;
  const loc = locationByPath(`/${comarca}/${municipi}/${entitat}`);
  if (!loc) return {};
  const com = comarcaOf(loc);
  const mun = locationById(loc.parentId ?? '');
  return {
    title: `El temps ${aName(loc.nom)}${mun ? ` (${mun.nom})` : ''} · ${com?.nom ?? 'Catalunya'}`,
    description: com ? metaDescription(loc, com) : undefined,
    alternates: { canonical: loc.path },
  };
}

export default async function EntitatPage({ params }: { params: Params }) {
  const { comarca, municipi, entitat } = await params;
  const loc = locationByPath(`/${comarca}/${municipi}/${entitat}`);
  if (!loc) notFound();

  const com = comarcaOf(loc);
  if (!com) notFound();

  const municipiLoc = locationByPath(`/${comarca}/${municipi}`) ?? null;
  const siblings = entitatsOfMunicipi(loc.municipiCodi!).filter((s) => s.id !== loc.id);

  const current = currentFor(loc);
  const forecast = forecastFor(loc);
  const history = historyFor(loc);

  return (
    <>
      <LocationView
        loc={loc}
        comarca={com}
        breadcrumbs={breadcrumbs(loc)}
        current={current}
        forecast={forecast}
        warnings={warningsFor(loc)}
        astro={astronomyFor(loc)}
        history={history}
        air={airQualityFor(loc)}
        comparison={comarcaComparison(loc)}
        narrative={narrativeFor(forecast, current, localNowHour(), localToday())}
        siblings={siblings}
        siblingsLabel={`Altres nuclis de ${municipiLoc?.nom ?? 'el municipi'}`}
        neighbours={[]}
        neighboursLabel=""
        description={describeLocation(loc, com, municipiLoc, siblings)}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Place',
                name: loc.nom,
                containedInPlace: municipiLoc
                  ? { '@type': 'AdministrativeArea', name: municipiLoc.nom }
                  : { '@type': 'AdministrativeArea', name: com.nom },
                geo: loc.lat != null ? {
                  '@type': 'GeoCoordinates',
                  latitude: loc.lat, longitude: loc.lon, elevation: loc.altitud,
                } : undefined,
              },
              {
                '@type': 'BreadcrumbList',
                itemListElement: breadcrumbs(loc).map((b, i) => ({
                  '@type': 'ListItem', position: i + 1, name: b.nom, item: b.path,
                })),
              },
            ],
          }),
        }}
      />
    </>
  );
}
