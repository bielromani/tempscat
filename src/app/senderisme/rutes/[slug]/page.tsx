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
import { WeatherIcon } from '@/components/WeatherIcon';
import { shareAboveSnowLine } from '@/lib/mountain';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import {
  aName, ago, comarcaName, dateShort, deComarca, deName, fromDirection, int, num, relativeDayTiny, temp,
} from '@/lib/format';
import { weatherCode } from '@/lib/weather-codes';
import { External } from '@/components/External';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section, StatGrid, type HeroStat } from '@/components/PageHero';

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
 *
 * ## Per què no fa servir `HourStrip` ni `DailyList` de la fitxa
 *
 * Perquè les dades no hi caben. La tira de la fitxa només porta temperatura i
 * probabilitat, i aquí les hores porten també els mil·límetres i el vent; i la
 * llista de dies no té on posar la cota de neu contra el punt més alt, que és
 * justament el que aquesta pàgina hi aporta.
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

/** L'etiqueta d'una targeta, amb la seva icona. */
function CardLabel({ id, icon, children }: { id: string; icon: string; children: React.ReactNode }) {
  return (
    <h3 id={id} className="card-label">
      {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
      <img src={`/icons/w/${icon}.svg`} width={22} height={22} alt="" />
      {children}
    </h3>
  );
}

/** «A», «A i B», «A, B i C». */
function listOf(items: string[]): string {
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} i ${items[items.length - 1]}`;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
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
   * multiplicar-lo. El peu de la targeta ho diu.
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
   * per als 683, i cada fitxa n'ensenya un.
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

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Muntanya', path: '/senderisme' },
    { nom: 'Itineraris', path: '/senderisme/rutes' },
    { nom: route.name, path: `/senderisme/rutes/${route.slug}` },
  ];

  /*
   * L'entradilla: d'on a on i per quines comarques.
   *
   * Els topònims i les comarques passen per `deName`, `aName` i `deComarca`:
   * «de el Port de la Selva» o «dins de Osona» són les faltes que surten
   * escrivint la preposició a mà. Amb un verb transitiu —«travessa»— la
   * comarca va amb el seu article i no cal contreure res.
   */
  const comarcaNames = route.comarques
    .map((c) => comarques.get(c))
    .filter((n): n is string => Boolean(n));
  const shape = route.from && route.to && route.from !== route.to
    ? `${capital(deName(route.from))} ${aName(route.to)}`
    : route.roundtrip ? 'Itinerari circular' : null;
  const lead = comarcaNames.length === 1
    ? (shape ? `${shape}, dins ${deComarca(comarcaNames[0])}.` : `Tot el recorregut és dins ${deComarca(comarcaNames[0])}.`)
    : comarcaNames.length > 1
      ? `${shape ? `${shape}. ` : ''}Travessa ${listOf(comarcaNames.map(comarcaName))}.`
      : shape && `${shape}.`;

  /*
   * «6 h 17 min» a 28 px no cap a mitja columna del mòbil i baixava de línia.
   * La darrera unitat va petita al costat, com a totes les xifres del titular:
   * «6 h 17» i «min». Surt de `hoursText`, que és qui decideix com s'escriu.
   */
  const walkText = hoursText(hours);
  const walkSplit = /^(.*)\s(min|h)$/.exec(walkText);
  const walk = walkSplit ? { value: walkSplit[1], unit: walkSplit[2] } : { value: walkText, unit: undefined };

  const stats = ([
    {
      label: 'Distància', value: num(route.km, 1), unit: 'km',
      sub: route.roundtrip ? 'circular' : 'del traçat',
    },
    route.minM != null && route.maxM != null && {
      label: 'Cotes', value: `${int(route.minM)}–${int(route.maxM)}`, unit: 'm',
      sub: 'la mínima i la màxima',
    },
    route.ascentM != null && {
      label: 'Desnivell', value: `+${int(route.ascentM)}`, unit: 'm',
      sub: 'acumulat, segons OpenStreetMap',
    },
    {
      label: 'A peu', value: walk.value, unit: walk.unit,
      sub: route.ascentM == null ? 'com a mínim: sense les pujades' : 'per la regla de Naismith',
    },
  ] as Array<HeroStat | false>).filter((x): x is HeroStat => Boolean(x));

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow={[refApart(route), networkLabel(route.network)].filter(Boolean).join(' · ')}
        icon="partly-cloudy-day"
        title={route.name}
        lead={lead || undefined}
        stats={stats.length < 4 ? stats : undefined}
        note={(
          <>
            El temps a peu surt de la regla de Naismith —{num(NAISMITH_KMH, 1)} km/h en pla i
            una hora més per cada {int(NAISMITH_ASCENT_M_PER_H)} m de pujada—, la que fan
            servir les entitats excursionistes. És una referència, no una predicció.
            {route.ascentM == null && (
              <> Aquest itinerari no porta el desnivell publicat: el temps només compta els
              quilòmetres i es queda curt si hi ha pujades.</>
            )}
            {route.kmTagged != null && Math.abs(route.kmTagged - route.km) > route.km * 0.25 && (
              <> El traçat mesura {num(route.km, 1)} km i la fitxa d&apos;OpenStreetMap en
              diu {num(route.kmTagged, 1)}: es publica la del traçat.</>
            )}
          </>
        )}
        aside={geo && geo.trace.length > 0 && (
          <section className="card" aria-labelledby="h-tracat">
            <h2 id="h-tracat" className="card-label">Per on va</h2>
            <RouteMap
              projection={mapBase.projection}
              trace={geo.trace}
              start={route.start}
              name={route.name}
            />
            <p className="card-foot">
              <External href={`https://www.openstreetmap.org/relation/${route.osmId}`}>
                El traçat a OpenStreetMap
              </External>
            </p>
          </section>
        )}
      >
        {/*
          Quatre xifres no caben en una fila al costat del mapa, i la graella en
          posava tres i deixava la quarta sola a sota. Més estreta, fa dues i dues.
        */}
        {stats.length === 4 && <StatGrid stats={stats} className="mt-6 max-w-[29rem]" />}
        {route.website && (
          <p className="mt-5 text-sm text-[var(--ink-2)]">
            <External
              href={route.website}
              className="font-medium text-[var(--accent)] no-underline hover:underline"
            >
              Fitxa oficial a {new URL(route.website).host.replace(/^www\./, '')}
            </External>
            {/* «PR» o «GR» com a operador no diu res: el camp de vegades porta
                el codi de la xarxa en comptes de l'entitat que la manté. */}
            {route.operator && route.operator.length > 4
              && ` · el manté ${route.operator.replace(/^https?:\/\//, '')}`}
          </p>
        )}
      </PageHero>

      {/* ── El temps, que és a què es ve ─────────────────────────────── */}
      {route.maxM != null && base && (nowUp != null || days.length > 0 || aheadHours >= 2) && (
        <Section id="temps" title={`El temps a ${int(route.maxM)} m`}>
          <div className="space-y-3">
            {current && nowUp != null && (
              <section className="card" aria-labelledby="h-ara">
                <CardLabel id="h-ara" icon="thermometer">
                  {isNow ? 'Ara, a dalt' : `A dalt, ${ago(current.ageMin)}`}
                </CardLabel>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  <p className="tnum text-5xl font-semibold leading-none tracking-tight text-[var(--ink)] sm:text-6xl">
                    {temp(nowUp, 0)}
                  </p>
                  <ul className="space-y-1 text-[15px] text-[var(--ink-2)]">
                    {current.temperature != null && (
                      <li>
                        <span className="tnum font-medium text-[var(--ink)]">{temp(current.temperature, 0)}</span>{' '}
                        a {int(base.altitud ?? 0)} m
                      </li>
                    )}
                    {current.windSpeed != null && (
                      <li>
                        Vent de <span className="tnum font-medium text-[var(--ink)]">{int(msToKmh(current.windSpeed))} km/h</span>
                        {current.windDirection != null && ` ${fromDirection(windCardinal(current.windDirection))}`}
                      </li>
                    )}
                    {current.humidity != null && (
                      <li><span className="tnum font-medium text-[var(--ink)]">{int(current.humidity)} %</span> d&apos;humitat</li>
                    )}
                  </ul>
                </div>
                <p className="source">
                  Mesurat a l&apos;estació {deName(current.station.nom)}, a{' '}
                  {num(current.station.distKm, 1)} km{isNow ? `, ${ago(current.ageMin)}` : ''}.
                  {current.provisional && ' Dada provisional.'} La temperatura de dalt està
                  corregida amb el gradient estàndard fins al punt més alt de l&apos;itinerari:
                  és una correcció d&apos;altura, no una mesura d&apos;allà.
                </p>
              </section>
            )}

            {/* ── Hora a hora, que és el que decideix a quina hora se surt ── */}
            {aheadHours >= 2 && (
              <section className="card" aria-labelledby="h-hores">
                <CardLabel id="h-hores" icon="clear-day">Hora a hora</CardLabel>
                <NextHours hourly={hourlyUp} nowHour={nowHour} models={forecast?.models.length ?? 1} id="ruta" />
                <p className="source">
                  La temperatura és la de {int(route.maxM)} m, pujada des del punt de predicció
                  {route.nearest && (
                    <> —<Link href={route.nearest.path} className="text-[var(--ink-2)]">{route.nearest.nom}</Link>,
                    a {int(base.altitud ?? 0)} m—</>
                  )}; la pluja i el vent són els d&apos;allà, sense pujar.
                </p>
              </section>
            )}

            {days.length > 0 && (
              <section className="card" aria-labelledby="h-dies">
                <CardLabel id="h-dies" icon="partly-cloudy-day">Els pròxims {days.length} dies</CardLabel>
                <div className="scroll-x">
                  <table className="data-table [&_td.num]:whitespace-nowrap">
                    <thead>
                      <tr>
                        <th scope="col">Dia</th>
                        <th scope="col">Cel</th>
                        <th scope="col" className="num">A dalt</th>
                        <th scope="col" className="num">Pluja</th>
                        <th scope="col" className="num">Cota de neu</th>
                        <th scope="col" className="num">Ratxa a la vall</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d) => {
                        const hi = tempAtAltitude(d.tMax, base.altitud, route.maxM);
                        const lo = tempAtAltitude(d.tMin, base.altitud, route.maxM);
                        const share = shareAboveSnowLine(d.snowLevel, route);
                        return (
                          <tr key={d.date}>
                            <td className="whitespace-nowrap">
                              <span className="font-medium text-[var(--ink)]">{relativeDayTiny(d.date, today)}</span>
                              <span className="block text-xs text-[var(--muted)]">{dateShort(d.date)}</span>
                            </td>
                            <td>
                              <span className="flex items-center gap-2">
                                <WeatherIcon code={d.weatherCode} size={30} decorative />
                                <span className="text-[13px]">
                                  {d.weatherCode != null ? weatherCode(d.weatherCode).ca : '—'}
                                </span>
                              </span>
                            </td>
                            <td className="num">
                              {hi != null ? (
                                <span
                                  className="temp-pill"
                                  style={{ background: temperatureColor(hi), color: temperatureInk(hi) }}
                                >
                                  {temp(hi, 0)}
                                </span>
                              ) : '—'}
                              <span className="ml-2 text-[var(--muted)]">{temp(lo, 0)}</span>
                            </td>
                            {/* Sense mil·límetres però amb probabilitat, es diu la
                                probabilitat i prou: «—3 %» no vol dir res. */}
                            <td className="num">
                              {d.precipitation > 0 ? (
                                <>
                                  <span className="text-[var(--ink)]">{num(d.precipitation, 1)} mm</span>
                                  {d.precipProbability > 0 && (
                                    <span className="block text-xs text-[var(--muted)]">
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
                            <td className="num">
                              {d.snowLevel != null ? (
                                <>
                                  {int(d.snowLevel)} m
                                  {share != null && share > 0 && (
                                    <span className="block text-xs text-[var(--muted)]">
                                      {share === 100 ? 'tot nevat' : `${share} % de dalt`}
                                    </span>
                                  )}
                                </>
                              ) : '—'}
                            </td>
                            <td className="num">
                              {d.gustMax != null ? `${int(d.gustMax)} km/h` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                <p className="source">
                  «A dalt» és la màxima i la mínima a {int(route.maxM)} m. La ratxa és la del punt
                  de predicció, a {int(base.altitud ?? 0)} m, i <strong>no</strong> està pujada:
                  en una carena el vent s&apos;accelera per la forma del terreny, i quant no ho
                  diu la predicció de la vall. La cota de neu diu per damunt de quina altura la
                  precipitació arriba en forma de neu, no quanta se n&apos;acumula.
                </p>
              </section>
            )}
          </div>
        </Section>
      )}

      {/* ── El perfil ─────────────────────────────────────────────────── */}
      {geo && (
        <Section id="perfil" title="Com puja i com baixa">
          <div className="card">
            {geo.profile ? (
              <ElevationProfile profile={geo.profile} km={route.km} />
            ) : (
              <p className="measure text-sm leading-relaxed text-[var(--ink-2)]">
                D&apos;aquest itinerari no se&apos;n publica el perfil d&apos;alçades. A
                OpenStreetMap la relació és un conjunt de vies sense ordre, i les
                d&apos;aquesta no s&apos;encadenen —hi ha branques o trams solts—, així que
                «distància recorreguda» no vol dir res i el perfil no es pot dibuixar. Les
                cotes mínima i màxima de dalt sí que són mesurades.
              </p>
            )}
          </div>
        </Section>
      )}

      {/* ── L'eix del qual això és una etapa ──────────────────────────
        *
        * A OSM un GR llarg són trenta-tres relacions, una per etapa, i sense
        * això cada fitxa era una pàgina que no sabia que en tenia trenta-dues
        * germanes: ni quina va abans, ni quantes n'hi ha. Passa a 209 dels 683.
        */}
      {axis && (
        <Section id="eix" title={`Etapa ${route.leg} de ${axis.legs.length} del ${axis.ref}`}>
          <div className="card">
            <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">
              L&apos;eix sencer fa <span className="tnum">{num(axis.km, 1)} km</span>
              {axis.legs[0].from && axis.legs[axis.legs.length - 1].to && (
                <>, {deName(axis.legs[0].from)} {aName(axis.legs[axis.legs.length - 1].to as string)}</>
              )}.
            </p>

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
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
                <div key={label} className="rounded-2xl border border-[var(--line-soft)] px-4 py-3">
                  <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</p>
                  {r ? (
                    <>
                      <p className="mt-1">
                        <Link
                          href={`/senderisme/rutes/${r.slug}`}
                          className="font-medium text-[var(--ink)] no-underline hover:underline"
                        >
                          {r.from && r.to ? `${r.from} → ${r.to}` : r.name}
                        </Link>
                        <span className="tnum ml-2 text-sm text-[var(--muted)]">{num(r.km, 1)} km</span>
                      </p>
                      {!linked && (
                        <p className="mt-1 text-xs text-[var(--muted)]">
                          No s&apos;encadena amb aquesta: a OpenStreetMap la sèrie es trenca aquí.
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--ink-2)]">
                      {label === 'Abans' ? 'És la primera etapa.' : 'És l’última etapa.'}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="card-foot">
              <Link href={`/senderisme/rutes/eix/${axis.slug}`}>Les {axis.legs.length} etapes ›</Link>
            </p>
          </div>
        </Section>
      )}

      {/* La mare, quan això n'és una variant: «GR 11.18» penja de «GR 11». */}
      {parentAxis && (
        <Section id="variant" title={`Variant del ${parentAxis.ref}`}>
          <div className="card">
            <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">
              És una variant senyalitzada del {parentAxis.ref}, que fa{' '}
              <span className="tnum">{num(parentAxis.km, 1)} km</span> en {parentAxis.legs.length} etapes.
            </p>
            <p className="card-foot">
              <Link href={`/senderisme/rutes/eix/${parentAxis.slug}`}>L&apos;eix sencer ›</Link>
            </p>
          </div>
        </Section>
      )}

      {/*
        I al revés: les variants que pengen d'aquesta.

        Només quan l'itinerari **no** és una etapa d'un eix. Les variants
        pengen del codi, i totes les etapes d'un GR el comparteixen: sense
        aquesta condició, les cinc variants del GR 92 sortien repetides a les
        trenta-tres fitxes. D'un eix pengen a la seva pàgina, un cop.
      */}
      {!axis && variants.length > 0 && (
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
          </div>
        </Section>
      )}

      {others.length > 0 && (
        <Section
          id="altres"
          title={`Altres itineraris ${comarques.get(route.comarques[0])
            ? deComarca(comarques.get(route.comarques[0])!)
            : 'a prop'}`}
        >
          <ul className="card-grid">
            {others.map((r) => (
              <li key={r.slug}>
                <Link href={`/senderisme/rutes/${r.slug}`} className="card h-full">
                  <span className="block font-semibold leading-snug">{r.name}</span>
                  <span className="mt-1 block text-[13px] text-[var(--muted)]">
                    {[refApart(r), `${num(r.km, 1)} km`, r.minM != null && r.maxM != null && `${int(r.minM)}–${int(r.maxM)} m`]
                      .filter(Boolean).join(' · ')}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <p className="source measure mt-10">
        Les marques de pintura i el manteniment són de les entitats excursionistes, i el
        recorregut pot canviar. Traçat d&apos;
        <External href="https://www.openstreetmap.org/copyright" className="text-[var(--ink-2)]">
          OpenStreetMap i els seus col·laboradors
        </External>
        , amb llicència ODbL 1.0. Cotes calculades del model d&apos;elevació de
        Copernicus. Predicció d&apos;Open-Meteo.
      </p>
    </article>
  );
}
