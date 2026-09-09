import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  axisBySlug, axisOfRoute, axisSlug, hoursText, networkLabel, refApart, routeBySlug, routeGeometry,
  routeSlugs, routesOfComarca, variantsOf, walkingHours,
  NAISMITH_KMH, NAISMITH_ASCENT_M_PER_H,
} from '@/lib/routes';
import { allComarques, locationById } from '@/lib/territory';
import { mapOutline } from '@/lib/map';
import { RouteMap } from '@/components/RouteMap';
import { ElevationProfile } from '@/components/ElevationProfile';
import { currentFor, forecastFor, localNowHour, localToday, tempAtAltitude } from '@/lib/weather';
import { msToKmh, windCardinal } from '@/lib/variables';
import { NextHours } from '@/components/NextHours';
import { shareAboveSnowLine } from '@/lib/mountain';
import { ago, comarcaName, dateShort, deComarca, int, num, relativeDayTiny, temp } from '@/lib/format';
import { weatherCode } from '@/lib/weather-codes';
import { External } from '@/components/External';

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

  /*
   * L'eix i el que hi penja. Es demanen aquí i no dins del JSX perquè les
   * tres preguntes —de quin eix soc, de qui soc variant, qui és variant meva—
   * es contesten amb el mateix índex i val més recórrer-lo un cop.
   */
  const axis = axisOfRoute(route);
  const prevLeg = axis && route.leg ? axis.legs[route.leg - 2] ?? null : null;
  const nextLeg = axis && route.leg ? axis.legs[route.leg] ?? null : null;
  const parentAxis = route.variantOf ? axisBySlug(axisSlug(route.variantOf)) : null;
  const variants = variantsOf(route.ref);

  const comarques = new Map(allComarques().map((c) => [c.codi, c.nom]));
  const base = route.nearest ? locationById(route.nearest.id) : undefined;
  const forecast = base ? await forecastFor(base) : null;
  const today = localToday();

  const days = (forecast?.daily ?? []).slice(0, 7);
  const current = base ? await currentFor(base) : null;
  const nowHour = localNowHour();
  const up = route.maxM;

  /*
   * La sèrie horària, amb la temperatura pujada a la cota de l'itinerari.
   *
   * Es corregeix **només la temperatura**, amb el gradient estàndard. La pluja,
   * la ratxa i el cel es queden els del punt de predicció: una tempesta no
   * canvia d'hora perquè es pugin vuit-cents metres, però el vent en una carena
   * s'accelera per la forma del terreny i no hi ha cap número honest per
   * multiplicar-lo. El peu de la taula ho diu.
   *
   * La sensació tèrmica es buida a posta: la seva fórmula porta humitat i
   * radiació, i pujar-hi només la temperatura donaria una xifra que no és ni
   * la d'aquí ni la de dalt.
   */
  const hourlyUp = up != null && base
    ? (forecast?.hourly ?? []).map((h) => ({
      ...h,
      temperature: tempAtAltitude(h.temperature, base.altitud, up),
      apparent: null,
    }))
    : (forecast?.hourly ?? []);

  /*
   * La temperatura d'ara, a dalt — i «ara» amb rellotge.
   *
   * La XEMA va de 45 a 65 minuts enrere, així que per sota de 90 una lectura és
   * la d'ara i prou. Passades sis hores no explica com està la muntanya i no
   * s'ensenya: els propers dies ja hi són a sota.
   *
   * Sense aquesta comprovació, amb la instantània aturada la fitxa deia «27 °C
   * ara, a dalt» damunt d'una mesura de feia cinc dies. El número era el que hi
   * havia; la paraula «ara» era falsa.
   */
  const NOW_MIN = 90;
  const SHOW_HOURS = 6;
  const fresh = current != null && current.ageMin <= SHOW_HOURS * 60;
  const isNow = current != null && current.ageMin <= NOW_MIN;
  /*
   * Hores que queden per davant dins de la sèrie.
   *
   * `NextHours` no dibuixa res amb menys de dues, i sense comprovar-ho la fitxa
   * escrivia el títol «Hora a hora» i el seu peu damunt del no-res. Passa al
   * final de la finestra de 120 hores, i amb una instantània aturada, sempre.
   */
  const aheadHours = hourlyUp.filter((h) => h.time.slice(0, 13) >= nowHour).length;

  const nowUp = fresh && current && up != null && base
    ? tempAtAltitude(current.temperatureAdjusted ?? current.temperature, base.altitud, up)
    : null;
  const others = route.comarques.length
    ? routesOfComarca(route.comarques[0]).filter((r) => r.slug !== route.slug).slice(0, 6)
    : [];

  /*
   * El traçat, el perfil i els pobles que caben a la vista.
   *
   * La geometria és al fitxer d'aquest itinerari i no a l'índex: són 5,7 MB
   * per als 683, i cada fitxa n'ensenya un. Els pobles surten de les comarques
   * que travessa, ordenats per població — el mapa se'n queda els que hi cauen.
   */
  const geo = routeGeometry(route.slug);
  const mapBase = mapOutline();

  /*
   * El temps a peu, per la regla de Naismith.
   *
   * Amb desnivell publicat surt la xifra sencera; sense, només el pla, i
   * llavors es diu que és un mínim. La pàgina oficial de l'Anella Verda de Vic
   * en diu 6 h per als seus 24 km i 280 m: la regla en dona 5 h 48 min, que és
   * a un 3 % — no és una casualitat, és la regla que fan servir les entitats.
   */
  const hours = walkingHours(route.km, route.ascentM);

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
          <div>
            <dt className="text-xs text-[var(--muted)]">A peu</dt>
            <dd className="tnum text-xl font-semibold text-[var(--ink)]">
              {route.ascentM == null && (
                <span className="text-sm font-normal text-[var(--muted)]">des de </span>
              )}
              {hoursText(hours)}
            </dd>
          </div>
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

        <p className="mt-3 text-xs leading-relaxed text-[var(--muted)]">
          El temps a peu surt de la regla de Naismith —{num(NAISMITH_KMH, 1)} km/h en pla
          i una hora més per cada {int(NAISMITH_ASCENT_M_PER_H)} m de pujada—, que és
          la que fan servir les entitats excursionistes. No és una predicció: és una
          referència amb el ritme dit en veu alta.
          {route.ascentM == null && (
            <> Aquest itinerari no porta el desnivell publicat, així que el temps
            només compta els quilòmetres i <strong className="font-medium text-[var(--ink-2)]">es
            queda curt</strong> si hi ha pujades.</>
          )}
        </p>
      </section>

      {/* ── L'eix del qual això és una etapa ──────────────────────────
        *
        * A OSM un GR llarg són trenta-tres relacions, una per etapa, i sense
        * això cada fitxa era una pàgina que no sabia que en tenia trenta-dues
        * germanes: ni quina va abans, ni quantes n'hi ha. Passa a 209 dels 683.
        */}
      {axis && (
        <section className="mt-8 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            Etapa {route.leg} de {axis.legs.length} del {axis.ref}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
            L&apos;eix sencer fa {num(axis.km, 1)} km, de {axis.legs[0].from ?? '—'} a{' '}
            {axis.legs[axis.legs.length - 1].to ?? '—'}.{' '}
            <Link href={`/senderisme/rutes/eix/${axis.slug}`} className="text-[var(--accent)] no-underline hover:underline">
              Les {axis.legs.length} etapes ›
            </Link>
          </p>

          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {/*
              L'anterior i la següent, i cada una diu si s'hi enllaça de debò.
              Quan la sèrie d'OSM es trenca, «la següent» no és una etapa que
              es pugui encadenar caminant, i dir-ho és el que evita prometre
              una continuïtat que no hi ha.
            */}
            {[
              { r: prevLeg, label: 'Abans', linked: prevLeg?.linked ?? false },
              { r: nextLeg, label: 'Després', linked: route.linked ?? false },
            ].map(({ r, label, linked }) => (
              <div key={label}>
                <p className="text-xs uppercase tracking-wide text-[var(--muted)]">{label}</p>
                {r ? (
                  <>
                    <Link
                      href={`/senderisme/rutes/${r.slug}`}
                      className="text-sm font-medium text-[var(--ink)] no-underline hover:underline"
                    >
                      {r.from && r.to ? `${r.from} → ${r.to}` : r.name}
                    </Link>
                    <span className="tnum ml-2 text-sm text-[var(--muted)]">{num(r.km, 1)} km</span>
                    {!linked && (
                      <p className="mt-0.5 text-xs text-[var(--muted)]">
                        No s&apos;encadena amb aquesta: a OpenStreetMap la sèrie es trenca aquí.
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-[var(--muted)]">
                    {label === 'Abans' ? 'És la primera etapa.' : 'És l’última etapa.'}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* La mare, quan això n'és una variant: «GR 11.18» penja de «GR 11». */}
      {parentAxis && (
        <section className="mt-8 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <h2 className="text-lg font-semibold tracking-tight">
            Variant del {parentAxis.ref}
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-[var(--ink-2)]">
            Aquest recorregut és una variant senyalitzada del {parentAxis.ref}, que fa{' '}
            {num(parentAxis.km, 1)} km en {parentAxis.legs.length} etapes.{' '}
            <Link href={`/senderisme/rutes/eix/${parentAxis.slug}`} className="text-[var(--accent)] no-underline hover:underline">
              Veure l&apos;eix ›
            </Link>
          </p>
        </section>
      )}

      {/*
        I al revés: les variants que pengen d'aquesta.

        Només quan l'itinerari **no** és una etapa d'un eix. Les variants
        pengen del codi, i totes les etapes d'un GR el comparteixen: sense
        aquesta condició, les cinc variants del GR 92 sortien repetides a les
        trenta-tres fitxes. D'un eix pengen a la seva pàgina, un cop.
      */}
      {!axis && variants.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-2 text-lg font-semibold tracking-tight">
            {variants.length === 1 ? 'Una variant senyalitzada' : `${variants.length} variants senyalitzades`}
          </h2>
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

      {/* ── El temps, que és a què es ve ─────────────────────────────── */}
      {route.maxM != null && base && (nowUp != null || days.length > 0) && (
        <section className="mt-8">
          <h2 className="mb-1 text-lg font-semibold tracking-tight">
            El temps a {int(route.maxM)} m
          </h2>
          <p className="mb-4 max-w-[65ch] text-sm leading-relaxed text-[var(--ink-2)]">
            La temperatura ve del punt de predicció{' '}
            {route.nearest && (
              <>de <Link href={route.nearest.path} className="text-[var(--ink)]">{route.nearest.nom}</Link>{' '}</>
            )}
            i està corregida amb el gradient estàndard fins al punt més alt de
            l&apos;itinerari. És una correcció d&apos;altura, no una mesura d&apos;allà.
          </p>
        </section>
      )}

      {/* ── Ara ── */}
      {current && nowUp != null && base && route.maxM != null && (
        <section className="mt-4 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1">
            <p className="m-0">
              <span className="tnum text-4xl font-semibold tracking-tight text-[var(--ink)]">
                {temp(nowUp, 0)}
              </span>
              <span className="ml-2 text-sm text-[var(--muted)]">
                {isNow ? 'ara, a dalt' : `a dalt, ${ago(current.ageMin)}`}
              </span>
            </p>
            <p className="m-0 text-sm text-[var(--ink-2)]">
              {[
                current.temperature != null
                  && `${temp(current.temperature, 0)} a ${int(base.altitud ?? 0)} m`,
                current.windSpeed != null
                  && `vent ${int(msToKmh(current.windSpeed))} km/h`
                  + (current.windDirection != null ? ` del ${windCardinal(current.windDirection)}` : ''),
                current.humidity != null && `${int(current.humidity)} % d’humitat`,
              ].filter(Boolean).join(' · ')}
            </p>
          </div>
          <p className="mt-2 text-xs text-[var(--muted)]">
            Mesurat a l&apos;estació de {current.station.nom}, a{' '}
            {num(current.station.distKm, 1)} km{isNow ? `, ${ago(current.ageMin)}` : ''}.
            {current.provisional && ' Dada provisional.'}
          </p>
        </section>
      )}

      {/* ── Hora a hora, que és el que decideix a quina hora se surt ── */}
      {aheadHours >= 2 && route.maxM != null && (
        <section className="mt-6">
          <h3 className="mb-2 text-base font-semibold tracking-tight">Hora a hora</h3>
          <NextHours hourly={hourlyUp} nowHour={nowHour} models={forecast?.models.length ?? 1} id="ruta" />
          <p className="mt-2 max-w-[65ch] text-xs leading-relaxed text-[var(--muted)]">
            La temperatura és la de {int(route.maxM)} m; la pluja i el vent són els del
            punt de predicció, sense pujar. Amb {hoursText(hours)} de camí, el que
            decideix l&apos;hora de sortida és com estarà a mig matí i a mitja tarda, no
            la mitjana del dia.
          </p>
        </section>
      )}

      {/* ── El temps a l'altura de l'itinerari ────────────────────────── */}
      {days.length > 0 && route.maxM != null && base && (
        <section className="mt-6">
          <h3 className="mb-2 text-base font-semibold tracking-tight">Els propers dies</h3>

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
            La ratxa és la del punt de predicció, a {int(base.altitud ?? 0)} m, i{' '}
            <strong className="font-medium text-[var(--ink-2)]">no</strong> està
            pujada a la cota de l&apos;itinerari: en una carena el vent s&apos;accelera per la
            forma del terreny, i quant s&apos;hi accelera no ho diu la predicció de
            la vall. La cota de neu diu per damunt de quina altura la
            precipitació arriba en forma de neu, no quanta se n&apos;acumula.
          </p>
        </section>
      )}

      {/* ── Per on va ─────────────────────────────────────────────────── */}
      {geo && geo.trace.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Per on va</h2>
          <RouteMap
            projection={mapBase.projection}
            trace={geo.trace}
            start={route.start}
            name={route.name}
          />
        </section>
      )}

      {/* ── El perfil ─────────────────────────────────────────────────── */}
      {geo?.profile && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Com puja i com baixa</h2>
          <ElevationProfile profile={geo.profile} km={route.km} />
        </section>
      )}

      {geo && !geo.profile && (
        <p className="mt-8 max-w-[65ch] text-sm leading-relaxed text-[var(--muted)]">
          D&apos;aquest itinerari no se&apos;n publica el perfil d&apos;alçades. A
          OpenStreetMap la relació és un conjunt de vies sense ordre, i les
          d&apos;aquesta no s&apos;encadenen —hi ha branques o trams solts—, així que
          «distància recorreguda» no vol dir res i el perfil no es pot dibuixar.
          Les cotes mínima i màxima de dalt sí que són mesurades.
        </p>
      )}

      {/* ── Enllaços ──────────────────────────────────────────────────── */}
      <section className="mt-8 max-w-[64ch] space-y-3 text-sm leading-relaxed text-[var(--ink-2)]">
        {route.website && (
          <p>
            Fitxa oficial de l&apos;itinerari:{' '}
            <External href={route.website} className="font-medium text-[var(--ink)]">
              {new URL(route.website).host.replace(/^www\./, '')}
            </External>
            {/* «PR» o «GR» com a operador no diu res: el camp de vegades porta
                el codi de la xarxa en comptes de l'entitat que la manté. */}
            {route.operator && route.operator.length > 4
              && ` · el manté ${route.operator.replace(/^https?:\/\//, '')}`}
          </p>
        )}
        <p>
          El traçat és a{' '}
          <External
            href={`https://www.openstreetmap.org/relation/${route.osmId}`}
            className="font-medium text-[var(--ink)]"
          >
            OpenStreetMap
          </External>
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
          <External href="https://www.openstreetmap.org/copyright" className="text-[var(--ink-2)]">
            OpenStreetMap i els seus col·laboradors
          </External>
          , amb llicència ODbL 1.0. Cotes calculades del model d&apos;elevació de
          Copernicus. Predicció d&apos;Open-Meteo.
        </p>
      </footer>
    </article>
  );
}
