import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { allAxes, axisBySlug, networkLabel, variantsOf, walkingHours } from '@/lib/routes';
import { allComarques } from '@/lib/territory';
import { mapOutline } from '@/lib/map';
import { PointsMap } from '@/components/PointsMap';
import { comarcaName, int, num } from '@/lib/format';

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

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/senderisme" className="no-underline hover:text-[var(--ink)]">Muntanya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/senderisme/rutes" className="no-underline hover:text-[var(--ink)]">Itineraris</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">{axis.ref}</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{axis.ref}</h1>
        <p className="mt-3 leading-relaxed text-[var(--ink-2)]">
          <strong className="font-semibold text-[var(--ink)]">
            {axis.legs.length} etapes
          </strong>{' '}
          i <strong className="font-semibold text-[var(--ink)]">{num(axis.km, 1)} km</strong> en
          total{axis.minM != null && axis.maxM != null && (
            <>, dels {int(axis.minM)} als {int(axis.maxM)} m</>
          )}. De{' '}
          <strong className="font-medium text-[var(--ink)]">{axis.legs[0].from ?? axis.legs[0].name}</strong>{' '}
          a{' '}
          <strong className="font-medium text-[var(--ink)]">
            {axis.legs[axis.legs.length - 1].to ?? axis.legs[axis.legs.length - 1].name}
          </strong>.{' '}
          {/*
            Arrodonit a l'hora, i no a set minuts.

            `hoursText` dona «128 h 53 min», que en una etapa de vint
            quilòmetres és una xifra i en la suma de trenta-tres és una
            precisió que la regla de Naismith no té. Qui mira un eix sencer
            vol l'ordre de magnitud.
          */}
          Unes {int(Math.round(hours))} hores a peu sumant les etapes.
        </p>
      </header>

      {/*
        On cau cada etapa. El número és la posició, que és el que lliga el mapa
        amb la taula de sota: sense ell serien vint punts iguals.
      */}
      <section className="mb-8">
        <PointsMap
          outline={geo.features}
          projection={geo.projection}
          width={geo.width}
          height={geo.height}
          labels={false}
          values
          maxHeight={520}
          ariaLabel={`Mapa amb l'inici de les ${axis.legs.length} etapes del ${axis.ref}`}
          points={axis.legs.map((r) => ({
            key: r.slug,
            lat: r.start.lat,
            lon: r.start.lon,
            fill: 'var(--accent-soft)',
            ink: 'var(--ink)',
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

      <h2 className="mb-3 text-lg font-semibold tracking-tight">Les etapes, en ordre</h2>
      <ol className="mb-8 space-y-2">
        {axis.legs.map((r, i) => (
          <li key={r.slug}>
            <Link
              href={`/senderisme/rutes/${r.slug}`}
              className="flex items-baseline gap-3 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] px-4 py-3 no-underline hover:border-[var(--line)]"
            >
              <span className="tnum w-6 shrink-0 text-sm text-[var(--muted)]">{r.leg}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium text-[var(--ink)]">
                  {r.from && r.to ? `${r.from} → ${r.to}` : r.name}
                </span>
                <span className="block text-xs text-[var(--muted)]">
                  {[
                    r.from && r.to ? r.name : null,
                    r.minM != null && r.maxM != null ? `${int(r.minM)}–${int(r.maxM)} m` : null,
                    r.comarques.length
                      ? r.comarques.map((c) => comarcaName(comarques.get(c) ?? c)).join(' · ')
                      : null,
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              <span className="tnum shrink-0 text-sm text-[var(--ink-2)]">{num(r.km, 1)} km</span>
            </Link>
            {/*
              El salt es diu on passa, i només quan passa.

              A quatre eixos la sèrie d'OSM es parteix —hi falta un enllaç, o el
              recorregut és circular— i llavors passar d'una etapa a la següent
              no és una cosa que es pugui caminar. Posant-les seguides sense dir
              res, la llista prometria una continuïtat que no hi és.
            */}
            {i < axis.legs.length - 1 && !r.linked && (
              <p className="mt-1 pl-9 text-xs text-[var(--muted)]">
                Aquí la sèrie d&apos;OpenStreetMap es trenca: l&apos;etapa següent no
                comença on acaba aquesta.
              </p>
            )}
          </li>
        ))}
      </ol>

      {variants.length > 0 && (
        <section className="mb-8">
          <h2 className="mb-1 text-lg font-semibold tracking-tight">
            {variants.length === 1 ? 'Una variant senyalitzada' : `${variants.length} variants senyalitzades`}
          </h2>
          <p className="mb-3 max-w-[62ch] text-sm text-[var(--muted)]">
            Recorreguts alternatius amb codi propi: el número de després del punt
            és el que diu que són variants del {axis.ref}.
          </p>
          <ul className="space-y-1.5">
            {variants.map((v) => (
              <li key={v.slug}>
                <Link
                  href={`/senderisme/rutes/${v.slug}`}
                  className="flex items-baseline justify-between gap-3 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 no-underline hover:border-[var(--line)]"
                >
                  <span className="min-w-0 text-sm text-[var(--ink)]">
                    <span className="tnum mr-2 text-[var(--muted)]">{v.ref}</span>
                    {v.name}
                  </span>
                  <span className="tnum shrink-0 text-sm text-[var(--muted)]">{num(v.km, 1)} km</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="max-w-[65ch] space-y-3 text-sm leading-relaxed text-[var(--muted)]">
        <p>
          A OpenStreetMap un itinerari llarg no és una relació sinó una per
          etapa, totes amb el mateix codi. L&apos;ordre d&apos;aquesta llista surt
          d&apos;encadenar el final de cada etapa amb el principi de la següent,
          no de com estiguin numerades.
          {axis.breaks > 0 && (
            <> En aquest {axis.breaks === 1 ? "se'n trenca una" : `se'n trenquen ${axis.breaks}`}, i
            queda dit a la llista.</>
          )}
        </p>
        <p>
          {axis.legs.length} {axis.legs.length === 1 ? 'etapa' : 'etapes'} de xarxa{' '}
          {networkLabel(axis.legs[0].network).toLowerCase()}. Les distàncies es calculen del
          traçat i les cotes, d&apos;un model d&apos;elevació: el detall de cada una és a
          la seva fitxa.{' '}
          {axis.comarques.length > 0 && (
            <>Passa per {axis.comarques.length}{' '}
            {axis.comarques.length === 1 ? 'comarca' : 'comarques'}.</>
          )}
        </p>
      </section>
    </article>
  );
}
