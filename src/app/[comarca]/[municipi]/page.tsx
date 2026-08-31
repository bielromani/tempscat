import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocationView } from '@/components/LocationView';
import { describeMunicipi, metaDescription } from '@/lib/describe';
import {
  breadcrumbs, comarcaOf, entitatsOfMunicipi, highPriorityPaths,
  locationByPath, neighboursOf,
} from '@/lib/territory';
import { currentFor, forecastFor } from '@/lib/weather';

/**
 * Página de municipio. 947 rutas.
 *
 * `dynamicParams` deja que las que no se prerenderizan se generen en la primera
 * visita y queden cacheadas: prerenderizar las 4.293 en cada despliegue
 * convertiría un build de dos minutos en uno de cuarenta, sin ninguna ganancia
 * para el usuario ni para el crawler.
 */
export const dynamicParams = true;
export const revalidate = 10800;   // 3 h, la cadencia del refresco de predicción

type Params = Promise<{ comarca: string; municipi: string }>;

export async function generateStaticParams() {
  return highPriorityPaths()
    .filter((p) => p.split('/').filter(Boolean).length === 2)
    .map((p) => {
      const [comarca, municipi] = p.split('/').filter(Boolean);
      return { comarca, municipi };
    });
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { comarca, municipi } = await params;
  const loc = locationByPath(`/${comarca}/${municipi}`);
  if (!loc) return {};
  const com = comarcaOf(loc);
  return {
    title: `El temps a ${loc.nom} · ${com?.nom ?? 'Catalunya'}`,
    description: com ? metaDescription(loc, com) : undefined,
    alternates: { canonical: loc.path },
  };
}

export default async function MunicipiPage({ params }: { params: Params }) {
  const { comarca, municipi } = await params;
  const loc = locationByPath(`/${comarca}/${municipi}`);
  if (!loc || loc.level !== 'municipi') notFound();

  const com = comarcaOf(loc);
  if (!com) notFound();

  const entitats = entitatsOfMunicipi(loc.municipiCodi!);
  // Solo colindancia real. Un municipio que apenas está cerca no es limítrofe,
  // y decirlo en el texto sería afirmar algo falso.
  const adjacent = neighboursOf(loc.id, 'adjacent').slice(0, 8);

  return (
    <>
      <LocationView
        loc={loc}
        comarca={com}
        breadcrumbs={breadcrumbs(loc)}
        current={currentFor(loc)}
        forecast={forecastFor(loc)}
        siblings={entitats}
        siblingsLabel={`Nuclis i entitats de ${loc.nom}`}
        neighbours={adjacent}
        neighboursLabel="Municipis limítrofs"
        description={describeMunicipi(loc, com, entitats)}
      />
      <script
        type="application/ld+json"
        // `WeatherForecast` no existe en schema.org: quien lo usa inyecta
        // marcado inválido. Lo correcto es Place + BreadcrumbList.
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@graph': [
              {
                '@type': 'Place',
                name: loc.nom,
                containedInPlace: { '@type': 'AdministrativeArea', name: com.nom },
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
