import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocationView } from '@/components/LocationView';
import { describeMunicipi, metaDescription } from '@/lib/describe';
import {
  breadcrumbs, comarcaOf, entitatsOfMunicipi, highPriorityPaths,
  locationByPath, neighboursOf,
} from '@/lib/territory';
import { airQualityFor, astronomyFor, currentFor, forecastFor, historyFor, warningsFor } from '@/lib/weather';
import { comarcaComparison } from '@/lib/comparison';
import { aName } from '@/lib/format';

/**
 * Página de municipio. 947 rutas.
 *
 * `dynamicParams` deja que las que no se prerenderizan se generen en la primera
 * visita y queden cacheadas: prerenderizar las 4.293 en cada despliegue
 * convertiría un build de dos minutos en uno de cuarenta, sin ninguna ganancia
 * para el usuario ni para el crawler.
 */
export const dynamicParams = true;
/*
 * 30 minutos, no 3 horas.
 *
 * La predicción se refresca cada 8-12 h, pero el bloque de condiciones actuales
 * se genera con la página: con 3 horas de ventana, el índice UV y el estado del
 * cielo que se muestran podían ser de hace tres horas. La observación de la
 * XEMA llega con 45-65 min de retraso, así que media hora es la cadencia que le
 * corresponde.
 *
 * Pendiente: aislar ese bloque en su propio segmento cacheado para no
 * regenerar la página entera por un número que cambia cada hora.
 */
export const revalidate = 1800;

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
    title: `El temps ${aName(loc.nom)} · ${com?.nom ?? 'Catalunya'}`,
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
        warnings={warningsFor(loc)}
        astro={astronomyFor(loc)}
        history={historyFor(loc)}
        air={airQualityFor(loc)}
        comparison={comarcaComparison(loc)}
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
