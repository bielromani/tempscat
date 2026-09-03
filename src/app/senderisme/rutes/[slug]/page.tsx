import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { networkLabel, refApart, routeBySlug, routeSlugs, routesOfComarca } from '@/lib/routes';
import { allComarques, locationById } from '@/lib/territory';
import { forecastFor, localToday, tempAtAltitude } from '@/lib/weather';
import { shareAboveSnowLine } from '@/lib/mountain';
import { comarcaName, dateShort, deComarca, int, num, relativeDayTiny, temp } from '@/lib/format';
import { weatherCode } from '@/lib/weather-codes';

/**
 * Un itinerari, amb la predicció a la seva altura.
 *
 * ## Què hi aporta aquest lloc que no hi hagi ja en un altre
 *
 * El traçat, la distància i el desnivell són a molts llocs. El que no hi és
 * enlloc és **la predicció a la cota per on va l'itinerari**: la cota de neu
 * contra el punt més alt, i la temperatura de dalt en comptes de la del poble
 * de baix. Un GR que puja a 2.400 m i un poble a 900 no tenen el mateix temps,
 * i és la diferència que decideix si s'hi va.
 *
 * ## I què s'hi corregeix i què no
 *
 * **La temperatura sí**, amb el gradient estàndard, i la pàgina ho diu: és una
 * correcció d'altura, no una mesura d'allà.
 *
 * **El vent no.** La ratxa d'un model a la cota de la vall no es pot pujar a
 * una carena amb una fórmula: en una carena el vent s'accelera per la forma del
 * terreny, i multiplicar-lo per un número inventat seria pitjor que dir d'on
 * surt. Es dona la del punt de predicció més proper, dit clarament.
 */
export const revalidate = 3_600;
export const dynamicParams = true;

export function generateStaticParams() {
  return routeSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const route = routeBySlug(slug);
  if (!route) return { title: 'Itinerari no trobat' };

  // D'una peça: un `<title>` amb diversos fills el serveix buit el servidor.
  const bits = [refApart(route), `${num(route.km, 0)} km`].filter(Boolean).join(' · ');
  return {
    title: `${route.name} — ${bits}`,
    description:
      `${route.name}: ${num(route.km, 1)} km`
      + (route.minM != null && route.maxM != null ? ` entre ${route.minM} i ${route.maxM} m` : '')
      + '. Amb la predicció a l’altura de l’itinerari: cota de neu, temperatura a dalt i vent.',
    alternates: { canonical: `/senderisme/rutes/${route.slug}` },
  };
}

export default async function RutaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const route = routeBySlug(slug);
  if (!route) notFound();

  const comarques = new Map(allComarques().map((c) => [c.codi, c.nom]));
  const base = route.nearest ? locationById(route.nearest.id) : undefined;
  const forecast = base ? await forecastFor(base) : null;
  const today = localToday();

  const days = (forecast?.daily ?? []).slice(0, 5);
  const others = route.comarques.length
    ? routesOfComarca(route.comarques[0]).filter((r) => r.slug !== route.slug).slice(0, 6)
    : [];

  return (
    <article>
      <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
        <Link href="/" className="no-underline hover:text-[var(--ink)]">Catalunya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/senderisme" className="no-underline hover:text-[var(--ink)]">Muntanya</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <Link href="/senderisme/rutes" className="no-underline hover:text-[var(--ink)]">Itineraris</Link>
        <span aria-hidden className="mx-1.5 text-[var(--line)]">›</span>
        <span className="text-[var(--ink-2)]">{route.name}</span>
      </nav>

      <header className="mb-6 max-w-[64ch]">
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{route.name}</h1>
        <p className="mt-1.5 text-sm text-[var(--ink-2)]">
          {[
            refApart(route),
            networkLabel(route.network),
            route.roundtrip === true && 'circular',
            route.from && route.to && `${route.from} → ${route.to}`,
          ].filter(Boolean).join(' · ')}
        </p>
      </header>

      {/* ── El traçat ─────────────────────────────────────────────────── */}
      <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
          <div>
            <dt className="text-xs text-[var(--muted)]">Distància</dt>
            <dd className="tnum text-xl font-semibold text-[var(--ink)]">{num(route.km, 1)} km</dd>
          </div>
          {route.minM != null && route.maxM != null && (
            <div>
              <dt className="text-xs text-[var(--muted)]">Cotes</dt>
              <dd className="tnum text-xl font-semibold text-[var(--ink)]">
                {int(route.minM)}–{int(route.maxM)} m
              </dd>
            </div>
          )}
          {route.ascentM != null && (
            <div>
              <dt className="text-xs text-[var(--muted)]">Desnivell</dt>
              <dd className="tnum text-xl font-semibold text-[var(--ink)]">+{int(route.ascentM)} m</dd>
            </div>
          )}
          {route.comarques.length > 0 && (
            <div>
              <dt className="text-xs text-[var(--muted)]">Comarques</dt>
              <dd className="text-sm font-medium text-[var(--ink)]">
                {route.comarques
                  .map((c) => { const n = comarques.get(c); return n ? comarcaName(n) : null; })
                  .filter(Boolean)
                  .join(', ')}
              </dd>
            </div>
          )}
        </dl>

        {route.kmTagged != null && Math.abs(route.kmTagged - route.km) > route.km * 0.25 && (
          <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
            El traçat mesura {num(route.km, 1)} km i la fitxa d&apos;OpenStreetMap en diu{' '}
            {num(route.kmTagged, 1)}. Aquí es publica la del traçat.
          </p>
        )}
      </section>

      {/* ── El temps a l'altura de l'itinerari ────────────────────────── */}
      {days.length > 0 && route.maxM != null && base && (
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold tracking-tight">
            El temps a {int(route.maxM)} m
          </h2>
          <p className="mb-3 max-w-[65ch] text-sm leading-relaxed text-[var(--ink-2)]">
            La temperatura ve del punt de predicció{' '}
            {route.nearest && (
              <>de <Link href={route.nearest.path} className="text-[var(--ink)]">{route.nearest.nom}</Link>{' '}</>
            )}
            i està corregida amb el gradient estàndard fins al punt més alt de
            l&apos;itinerari. És una correcció d&apos;altura, no una mesura d&apos;allà.
          </p>

          <div className="scroll-x">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Dia</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">A dalt</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Cel</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Pluja</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 pr-4 font-semibold">Cota de neu</th>
                  <th scope="col" className="border-b border-[var(--line)] py-2 font-semibold">Ratxa a la vall</th>
                </tr>
              </thead>
              <tbody>
                {days.map((d) => {
                  const hi = tempAtAltitude(d.tMax, base.altitud, route.maxM);
                  const lo = tempAtAltitude(d.tMin, base.altitud, route.maxM);
                  const share = shareAboveSnowLine(d.snowLevel, route);
                  return (
                    <tr key={d.date} className="border-b border-[var(--line-soft)]">
                      <td className="py-2.5 pr-4 text-[var(--ink)]">
                        {relativeDayTiny(d.date, today)}
                        <span className="block text-xs text-[var(--muted)]">{dateShort(d.date)}</span>
                      </td>
                      <td className="tnum py-2.5 pr-4 font-medium text-[var(--ink)]">
                        {temp(hi, 0)} / <span className="text-[var(--ink-2)]">{temp(lo, 0)}</span>
                      </td>
                      <td className="py-2.5 pr-4 text-xs text-[var(--ink-2)]">
                        {d.weatherCode != null ? weatherCode(d.weatherCode).ca : '—'}
                      </td>
                      {/* Sense mil·límetres però amb probabilitat, es diu la
                          probabilitat i prou: «—3 %» no vol dir res. */}
                      <td className="tnum py-2.5 pr-4 text-[var(--ink-2)]">
                        {d.precipitation > 0 ? (
                          <>
                            {num(d.precipitation, 1)} mm
                            {d.precipProbability > 0 && (
                              <span className="ml-1 text-xs text-[var(--muted)]">
                                {int(d.precipProbability)} %
                              </span>
                            )}
                          </>
                        ) : d.precipProbability > 0 ? (
                          <span className="text-xs text-[var(--muted)]">
                            {int(d.precipProbability)} % de possibilitat
                          </span>
                        ) : '—'}
                      </td>
                      <td className="tnum py-2.5 pr-4 text-[var(--ink-2)]">
                        {d.snowLevel != null ? (
                          <>
                            {int(d.snowLevel)} m
                            {share != null && share > 0 && (
                              <span className="ml-1 text-xs text-[var(--muted)]">
                                {share === 100 ? 'tot nevat' : `${share} % de dalt`}
                              </span>
                            )}
                          </>
                        ) : '—'}
                      </td>
                      <td className="tnum py-2.5 text-[var(--ink-2)]">
                        {d.gustMax != null ? `${int(d.gustMax)} km/h` : '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="mt-2 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
            La ratxa és la del punt de predicció, a {int(base.altitud ?? 0)} m, i **no** està
            pujada a la cota de l&apos;itinerari: en una carena el vent s&apos;accelera per la
            forma del terreny i multiplicar-lo per un número inventat seria pitjor que
            dir d&apos;on surt. La cota de neu diu per damunt de quina altura la
            precipitació arriba en forma de neu, no quanta se n&apos;acumula.
          </p>
        </section>
      )}

      {/* ── Enllaços ──────────────────────────────────────────────────── */}
      <section className="mt-8 max-w-[64ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        {route.website && (
          <p>
            Fitxa oficial de l&apos;itinerari:{' '}
            <a href={route.website} rel="noopener noreferrer" className="font-medium text-[var(--ink)]">
              {new URL(route.website).host.replace(/^www\./, '')}
            </a>
            {/* «PR» o «GR» com a operador no diu res: el camp de vegades porta
                el codi de la xarxa en comptes de l'entitat que la manté. */}
            {route.operator && route.operator.length > 4
              && ` · el manté ${route.operator.replace(/^https?:\/\//, '')}`}
          </p>
        )}
        <p>
          El traçat és a{' '}
          <a
            href={`https://www.openstreetmap.org/relation/${route.osmId}`}
            rel="noopener noreferrer"
            className="font-medium text-[var(--ink)]"
          >
            OpenStreetMap
          </a>
          . Les marques de pintura i el manteniment són de les entitats excursionistes,
          i el recorregut pot canviar sense que això ho sàpiga.
        </p>
      </section>

      {others.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            Altres itineraris {comarques.get(route.comarques[0])
              ? deComarca(comarques.get(route.comarques[0])!)
              : 'a prop'}
          </h2>
          <ul className="grid list-none gap-2 p-0 sm:grid-cols-2">
            {others.map((r) => (
              <li key={r.slug}>
                <Link
                  href={`/senderisme/rutes/${r.slug}`}
                  className="block rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 no-underline"
                >
                  <span className="text-sm font-medium text-[var(--ink)]">{r.name}</span>
                  <span className="block text-xs text-[var(--muted)]">
                    {[refApart(r), `${num(r.km, 1)} km`, r.minM != null && r.maxM != null && `${int(r.minM)}–${int(r.maxM)} m`]
                      .filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <footer className="mt-8 border-t border-[var(--line-soft)] pt-4 text-xs leading-relaxed text-[var(--muted)]">
        <p>
          Traçat d&apos;
          <a href="https://www.openstreetmap.org/copyright" rel="noopener noreferrer" className="text-[var(--ink-2)]">
            OpenStreetMap i els seus col·laboradors
          </a>
          , amb llicència ODbL 1.0. Cotes calculades del model d&apos;elevació de
          Copernicus. Predicció d&apos;Open-Meteo.
        </p>
      </footer>
    </article>
  );
}
