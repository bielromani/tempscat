import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocationView } from '@/components/LocationView';
import { describeMunicipi, metaDescription } from '@/lib/describe';
import {
  breadcrumbs, comarcaOf, entitatsOfMunicipi,
  locationByPath, neighboursOf,
} from '@/lib/territory';
import { fichaData } from '@/lib/ficha-data';
import { aName, deName } from '@/lib/format';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';

/**
 * Página de municipio. 947 rutas.
 *
 * Se genera en cada petición, igual que la de núcleo, y el CDN la guarda cinco
 * minutos: la regla y el porqué están en `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 *
 * Hasta el 2 de octubre de 2026 iba con ISR y una ventana de una hora, y el
 * resultado es el que ISR da con menos de una visita por ficha y ventana:
 * **sirve primero la copia vieja y la refresca después**, así que quien entraba
 * veía la temperatura y el cielo de hacía horas —el titular dibujando la noche
 * a media mañana— y tenía que recargar para ver la buena. La prueba con las
 * fichas de núcleo, del 29 de septiembre, dio lo que se esperaba, y con el plan
 * Pro de Vercel el coste de generar en cada visita ya no manda.
 *
 * De paso, estas 947 dejan de pregenerarse en cada despliegue.
 */
export const dynamic = 'force-dynamic';

type Params = Promise<{ comarca: string; municipi: string }>;

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

  // Totes les lectures alhora, i les mateixes que la fitxa d'un nucli: ver `fichaData()`.
  const data = await fichaData(loc);

  return (
    <>
      <LocationView
        {...data}
        loc={loc}
        comarca={com}
        breadcrumbs={breadcrumbs(loc)}
        siblings={entitats}
        siblingsLabel={`Nuclis i entitats ${deName(loc.nom)}`}
        neighbours={adjacent}
        neighboursLabel="Municipis limítrofs"
        description={describeMunicipi(loc, com, entitats)}
      />
      <JsonLd data={graph(
        {
          '@type': 'Place',
          name: loc.nom,
          containedInPlace: { '@type': 'AdministrativeArea', name: com.nom },
          geo: loc.lat != null ? {
            '@type': 'GeoCoordinates',
            latitude: loc.lat, longitude: loc.lon, elevation: loc.altitud,
          } : undefined,
        },
        breadcrumbLd(breadcrumbs(loc)),
      )} />
    </>
  );
}
