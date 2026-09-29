import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allAxes, axisBySlug, networkLabel, variantsOf, walkingHours } from '@/lib/routes';
import { allComarques } from '@/lib/territory';
import { mapOutline } from '@/lib/map';
import { PointsMap } from '@/components/PointsMap';
import { aName, comarcaName, deComarca, deName, int, num } from '@/lib/format';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';

/**
 * Un eix sencer: el GR amb totes les seves etapes, en ordre de caminar-lo.
 *
 * ## Per què existeix aquesta pàgina
 *
 * Perquè a OpenStreetMap un GR llarg **no és una relació**: són trenta-tres,
 * una per etapa, i totes amb el mateix codi. Fins ara cada una era una fitxa
 * solta, així que qui buscava «GR 92» —que és com se'n parla— es trobava
 * trenta-tres pàgines que no es coneixien entre elles: ni quina va abans, ni
 * quantes n'hi ha, ni quants quilòmetres fa el conjunt. Són **209 dels 683
 * itineraris**, o sigui que no és cap cas de vora.
 *
 * L'ordre no se l'inventa la pàgina: el calcula el build encadenant el final
 * d'una etapa amb el principi de la següent.
 *
 * ## El mapa és de punts d'inici, i no del traçat
 *
 * Dibuixar les 33 etapes voldria dir baixar-ne les 33 geometries —cinc megues
 * per a un dibuix de set-cents píxels— quan el que aquesta pàgina ha de
 * contestar és «per on va, a grans trets». El traçat de debò és a la fitxa de
 * cada etapa, que és on es mira abans de sortir.
 */

export const revalidate = 86_400;

export function generateStaticParams() {
  return allAxes().map((a) => ({ ref: a.slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ ref: string }> },
): Promise<Metadata> {
  const axis = axisBySlug((await params).ref);
  if (!axis) return {};
  const title = `${axis.ref}: les ${axis.legs.length} etapes, ${num(axis.km, 0)} km`;
  return {
    title,
    description:
      `Les ${axis.legs.length} etapes del ${axis.ref} en ordre, amb la distància `
      + `de cada una, les cotes i les comarques que travessa. ${num(axis.km, 0)} km en total.`,
    alternates: { canonical: `/senderisme/rutes/eix/${axis.slug}` },
  };
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function EixPage({ params }: { params: Promise<{ ref: string }> }) {
  const axis = axisBySlug((await params).ref);
  if (!axis) notFound();

  const comarques = new Map(allComarques().map((c) => [c.codi, c.nom]));
  const geo = mapOutline();
  const hours = axis.legs.reduce((s, r) => s + walkingHours(r.km, r.ascentM), 0);
  /*
   * Les variants pengen del codi, no de cap etapa concreta: «GR 92.1» és una
   * variant del GR 92 sencer. Van aquí i un sol cop — posant-les a la fitxa
   * de cada etapa sortirien trenta-tres vegades les mateixes cinc.
   */
  const variants = variantsOf(axis.ref);

  const first = axis.legs[0];
  const last = axis.legs[axis.legs.length - 1];
  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Muntanya', path: '/senderisme' },
    { nom: 'Itineraris', path: '/senderisme/rutes' },
    { nom: axis.ref, path: `/senderisme/rutes/eix/${axis.slug}` },
  ];

  // Els topònims passen per `deName` i `aName`: «de el Cortalet» és la falta
  // que surt escrivint la preposició a mà.
  const ends = `${capital(deName(first.from ?? first.name))} ${aName(last.to ?? last.name)}`;

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow={`Itinerari de ${networkLabel(first.network)}`}
        icon="partly-cloudy-day"
        title={axis.ref}
        lead={(
          <>
            {ends}
            {axis.minM != null && axis.maxM != null && (
              <>, dels <span className="tnum">{int(axis.minM)}</span> als{' '}
              <span className="tnum">{int(axis.maxM)} m</span></>
            )}.
          </>
        )}
        stats={[
          {
            label: 'Etapes', value: int(axis.legs.length),
            sub: axis.breaks > 0
              ? `la sèrie es trenca ${axis.breaks === 1 ? 'un cop' : `${axis.breaks} cops`}`
              : 'totes encadenades',
          },
          { label: 'Distància', value: num(axis.km, 1), unit: 'km' },
          /*
            Arrodonit a l'hora, i no a set minuts.

            `hoursText` dona «128 h 53 min», que en una etapa de vint
            quilòmetres és una xifra i en la suma de trenta-tres és una
            precisió que la regla de Naismith no té. Qui mira un eix sencer
            vol l'ordre de magnitud.
          */
          { label: 'A peu', value: int(Math.round(hours)), unit: 'h', sub: 'sumant les etapes, per la regla de Naismith' },
        ]}
        note={(
          <>
            Distàncies calculades del traçat i cotes d&apos;un model d&apos;elevació; el
            detall de cada etapa és a la seva fitxa.
            {axis.comarques.length > 0 && (
              axis.comarques.length === 1
                ? <> Tot l&apos;eix és dins {deComarca(comarques.get(axis.comarques[0]) ?? axis.comarques[0])}.</>
                : <> Passa per {axis.comarques.length} comarques.</>
            )}
          </>
        )}
        aside={(
          /*
            On cau cada etapa. El número és la posició, que és el que lliga el
            mapa amb la llista de sota: sense ell serien vint punts iguals.
          */
          <section className="card" aria-labelledby="h-mapa">
            <h2 id="h-mapa" className="card-label">On comença cada etapa</h2>
            <PointsMap
              scale={1.4}
              outline={geo.features}
              projection={geo.projection}
              width={geo.width}
              height={geo.height}
              labels={false}
              values
              maxHeight={440}
              ariaLabel={`Mapa amb l'inici de les ${axis.legs.length} etapes del ${axis.ref}`}
              points={axis.legs.map((r) => ({
                key: r.slug,
                lat: r.start.lat,
                lon: r.start.lon,
                fill: 'var(--accent)',
                ink: 'var(--paper)',
                value: String(r.leg),
                r: 13,
                tip: `${r.leg}. ${r.name} · ${num(r.km, 1)} km`,
              }))}
              footer={(
                <>
                  El número és la posició de l&apos;etapa dins de l&apos;eix, i el punt és
                  on comença. El traçat de cada una és a la seva fitxa.
                </>
              )}
            />
          </section>
        )}
      />

      <Section id="etapes" title={`Les ${axis.legs.length} etapes, en ordre`}>
        <div className="card">
          {/*
            En dues columnes que es llegeixen de dalt a baix, i no fila a fila:
            l'ordre és el de caminar-les. Per això són columnes de CSS i no la
            graella de `.rows-cols`, que ompliria 1-2 / 3-4. D'aquella classe
            se'n fa servir la ratlla a sota de cada fila —amb la de dalt, la
            segona columna començava amb una ratlla penjada— i el `display` en
            línia li treu la graella.
          */}
          <ol
            className="rows rows-cols lg:columns-2 lg:gap-x-10 [&>li]:break-inside-avoid"
            style={{ display: 'block' }}
          >
            {axis.legs.map((r, i) => {
              /*
                El salt es diu on passa, i només quan passa.

                A quatre eixos la sèrie d'OSM es parteix —hi falta un enllaç, o
                el recorregut és circular— i llavors passar d'una etapa a la
                següent no és una cosa que es pugui caminar. Posant-les seguides
                sense dir res, la llista prometria una continuïtat que no hi és.
              */
              const breaks = i < axis.legs.length - 1 && !r.linked;
              return (
                <li key={r.slug} className={breaks ? 'flex-wrap' : undefined}>
                  <span
                    aria-hidden
                    className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--accent)] text-xs font-semibold tabular-nums text-[var(--paper)]"
                  >
                    {r.leg}
                  </span>
                  <Link href={`/senderisme/rutes/${r.slug}`} className="row-main flex-1">
                    <span className="block text-[15px] font-[550] leading-snug">
                      <span className="sr-only">{r.leg}. </span>
                      {r.from && r.to ? `${r.from} → ${r.to}` : r.name}
                    </span>
                    <span className="mt-0.5 block text-[12.5px] leading-snug text-[var(--muted)]">
                      {[
                        r.from && r.to ? r.name : null,
                        r.minM != null && r.maxM != null ? `${int(r.minM)}–${int(r.maxM)} m` : null,
                        r.comarques.length
                          ? r.comarques.map((c) => comarcaName(comarques.get(c) ?? c)).join(' · ')
                          : null,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                  <span className="row-value">{num(r.km, 1)} km</span>
                  {breaks && (
                    <p className="w-full pl-10 text-xs text-[var(--muted)]">
                      Aquí la sèrie d&apos;OpenStreetMap es trenca: l&apos;etapa següent no
                      comença on acaba aquesta.
                    </p>
                  )}
                </li>
              );
            })}
          </ol>
          <p className="source measure">
            A OpenStreetMap un itinerari llarg és una relació per etapa, totes amb el
            mateix codi. L&apos;ordre d&apos;aquesta llista surt d&apos;encadenar el final
            de cada etapa amb el principi de la següent, no de com estiguin numerades.
            {axis.breaks > 0 && (
              <> En aquest {axis.breaks === 1 ? "se'n trenca una" : `se'n trenquen ${axis.breaks}`}, i
              queda dit a la llista.</>
            )}
          </p>
        </div>
      </Section>

      {variants.length > 0 && (
        <Section
          id="variants"
          title={variants.length === 1 ? 'Una variant senyalitzada' : `${variants.length} variants senyalitzades`}
        >
          <div className="card">
            <ul className="rows">
              {variants.map((v) => (
                <li key={v.slug}>
                  <Link href={`/senderisme/rutes/${v.slug}`} className="row-main">
                    <span className="row-title">{v.name}</span>
                    <span className="row-sub tnum">{v.ref}</span>
                  </Link>
                  <span className="row-value">{num(v.km, 1)} km</span>
                </li>
              ))}
            </ul>
            <p className="source measure">
              Recorreguts alternatius amb codi propi: el número de després del punt és el
              que diu que són variants del {axis.ref}.
            </p>
          </div>
        </Section>
      )}
    </article>
  );
}
