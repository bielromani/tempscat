import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocationView } from '@/components/LocationView';
import { describeMunicipi, metaDescription } from '@/lib/describe';
import {
  breadcrumbs, comarcaOf, entitatsOfMunicipi, highPriorityPaths,
  locationByPath, neighboursOf,
} from '@/lib/territory';
import {
  airQualityFor, astronomyFor, currentFor, forecastFor, historyFor,
  groupWarnings, localNowHour, localToday, rainWarningsOf, warningsFor,
} from '@/lib/weather';
import { comarcaComparison } from '@/lib/comparison';
import { waterNear } from '@/lib/water';
import { nearestAirStation } from '@/lib/air-stations';
import { seaNear } from '@/lib/sea';
import { camerasNear } from '@/lib/cameras';
import { resortNear } from '@/lib/mountain';
import { routesNear } from '@/lib/routes';
import { aName, deName } from '@/lib/format';
import { narrativeFor } from '@/lib/narrative';
import { localRainFor } from '@/lib/local-rain';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';

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
 * Una hora, y media hora era comprar una frescura que no existe.
 *
 * El razonamiento anterior decía «la observación de la XEMA llega con 45-65 min
 * de retraso, así que media hora es la cadencia que le corresponde», y es
 * exactamente al revés: **si el dato tarda 45 minutos en existir, una ventana de
 * 30 reconstruye la página dos veces con la misma lectura**. La segunda no
 * añadía un solo número nuevo.
 *
 * Lo que sí añadía era la factura. Medido en septiembre de 2026, con las cifras
 * de la propia plataforma: 1.047.191 lecturas y 2.108.560 escrituras de ISR
 * —el doble exacto, que son el HTML y la carga RSC de cada regeneración— y
 * 29,19 GB de salida contra un techo de 10. Sale a 28 kB por lectura, que es lo
 * que pesa esta página comprimida: o sea que **prácticamente cada visita
 * regeneraba la ficha entera**.
 *
 * Con 4.293 fichas y menos de una visita diaria por ficha, ISR juega en contra:
 * su trato es repartir una regeneración entre muchos lectores, y aquí no hay
 * muchos lectores por página. Peor aún, el que paga la regeneración es el que se
 * lleva la copia vieja —ISR sirve primero y refresca después—, así que la
 * ventana corta no solo costaba más: hacía que casi todo el mundo viera el dato
 * caducado.
 *
 * Esto no arregla eso último, solo deja de pagar por ello. Lo que lo arregla es
 * sacar las cifras vivas del HTML y pedirlas al almacén desde el navegador, que
 * es una decisión con precio —el JavaScript que las fichas no tienen— y está
 * pendiente.
 *
 * Se estudió aislar ese bloque en su propio segmento cacheado y **se descartó
 * con el cronómetro delante**: un render completo cuesta 9-14 ms en caliente y
 * hasta 229 ms en frío, y con ISR nadie espera a esa regeneración. El mecanismo
 * de Next 16 es `cacheComponents`, que cambia el comportamiento por defecto de
 * toda la aplicación. Sesenta milisegundos en segundo plano no lo pagan.
 */
export const revalidate = 3600;

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

  // Se resuelven aquí y se pasan una sola vez: el titular necesita los tres a la
  // vez, y volver a pedirlos dentro del JSX era pedirlos dos veces.
  const current = await currentFor(loc);
  const forecast = await forecastFor(loc);
  const history = await historyFor(loc);
  const warnings = await warningsFor(loc);

  return (
    <>
      <LocationView
        loc={loc}
        comarca={com}
        breadcrumbs={breadcrumbs(loc)}
        current={current}
        forecast={forecast}
        warnings={groupWarnings(warnings)}
        astro={astronomyFor(loc)}
        history={history}
        air={await airQualityFor(loc)}
        comparison={await comarcaComparison(loc)}
        narrative={narrativeFor(forecast, current, localNowHour(), localToday(), rainWarningsOf(warnings))}
        water={await waterNear(loc)}
        airStation={await nearestAirStation(loc)}
        sea={await seaNear(loc)}
        cameras={await camerasNear(loc)}
        resort={await resortNear(loc)}
        routes={routesNear(loc)}
        localRain={await localRainFor(forecast, loc.lat, loc.lon)}
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
