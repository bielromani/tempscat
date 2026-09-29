import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { LocationView } from '@/components/LocationView';
import { describeLocation, metaDescription } from '@/lib/describe';
import {
  breadcrumbs, comarcaOf, entitatsOfMunicipi, locationByPath, locationById,
} from '@/lib/territory';
import { fichaData } from '@/lib/ficha-data';
import { aName, deName } from '@/lib/format';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';

/**
 * Página de entidad singular o núcleo. ~3.300 rutas.
 *
 * Es la razón de ser del proyecto: competir por "el temps a Lilla" en lugar de
 * por "el tiempo en Barcelona". Ninguna se prerenderiza en el build; se generan
 * la primera vez que alguien —o Googlebot— las pide.
 */
export const dynamicParams = true;
/*
 * Una hora, por lo mismo que la ficha de municipio, y el porqué está allí
 * entero: con la XEMA llegando 45-65 min tarde, media hora reconstruía la
 * página dos veces con la misma lectura. Estas ~3.300 son, además, las que más
 * pesan en la cuenta: son las que menos visitas tienen cada una.
 */
export const revalidate = 3600;

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

  const data = await fichaData(loc);

  return (
    <>
      <LocationView
        {...data}
        loc={loc}
        comarca={com}
        breadcrumbs={breadcrumbs(loc)}
        siblings={siblings}
        siblingsLabel={municipiLoc ? `Altres nuclis ${deName(municipiLoc.nom)}` : 'Altres nuclis del municipi'}
        neighbours={[]}
        neighboursLabel=""
        description={describeLocation(loc, com, municipiLoc, siblings)}
      />
      <JsonLd data={graph(
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
        breadcrumbLd(breadcrumbs(loc)),
      )} />
    </>
  );
}
