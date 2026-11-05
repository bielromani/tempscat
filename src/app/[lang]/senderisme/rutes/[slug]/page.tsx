import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  axisBySlug, axisOfRoute, axisSlug, hoursText, networkLabel, refApart, routeBySlug, routeGeometry,
  routesOfComarca, variantsOf, walkingHours,
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
import { snowLevelFrom } from '@/lib/forecast-merge';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import {
  aName, ago, comarcaName, dateShort, deComarca, deName, fromDirection, int, num, placeName, relativeDayTiny, temp,
} from '@/lib/format';
import { codeLabel, weatherCode } from '@/lib/weather-codes';
import { getLang } from '@/lib/i18n';
import { tr, type Lang } from '@/lib/lang';
import { External } from '@/components/External';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section, StatGrid, type HeroStat } from '@/components/PageHero';
import { alternatesFor } from '@/lib/site';

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
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
): Promise<Metadata> {
  const { slug } = await params;
  const lang = await getLang();
  const route = routeBySlug(slug);
  if (!route) return { title: tr(lang, 'Itinerari no trobat', 'Ruta no encontrada') };

  // D'una peça: un `<title>` amb diversos fills el serveix buit el servidor.
  const bits = [refApart(route), `${num(route.km, 0)} km`].filter(Boolean).join(' · ');
  return {
    title: `${route.name} — ${bits}`,
    description: lang === 'es'
      ? `${route.name}: ${num(route.km, 1)} km`
        + (route.minM != null && route.maxM != null ? ` entre ${int(route.minM)} y ${int(route.maxM)} m` : '')
        + '. Con la predicción a la altura de la ruta: cota de nieve, temperatura arriba y viento.'
      : `${route.name}: ${num(route.km, 1)} km`
        + (route.minM != null && route.maxM != null ? ` entre ${int(route.minM)} i ${int(route.maxM)} m` : '')
        + '. Amb la predicció a l’altura de l’itinerari: cota de neu, temperatura a dalt i vent.',
    alternates: alternatesFor(`/senderisme/rutes/${route.slug}`),
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

/** «A», «A i B», «A, B i C» — en castellà, «y». */
function listOf(items: string[], lang: Lang): string {
  const and = lang === 'es' ? 'y' : 'i';
  return items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} ${and} ${items[items.length - 1]}`;
}

function capital(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function RutaPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const route = routeBySlug(slug);
  if (!route) notFound();
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);

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

  /*
   * La cota de neu de cada dia, **també quan a la vall plou**.
   *
   * El resum diari només la porta els dies que el punt de predicció rep neu, i
   * aquest punt és el poble de baix: un dia de pluja a 900 m amb la isozero a
   * 1.800, a dalt d'un itinerari de 2.400 hi neva, i la columna deia «—». Amb
   * la sèrie horària —cinc dies— es calcula igual, sobre les hores amb
   * precipitació. Un dia sec no en té, i es diu.
   */
  const snowLevelOf = (d: (typeof days)[number]): number | null => {
    if (d.snowLevel != null) return d.snowLevel;
    const wet = (forecast?.hourly ?? []).filter((h) => h.time.startsWith(d.date) && (h.precipitation ?? 0) >= 0.1);
    return wet.length ? snowLevelFrom(wet) : null;
  };
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
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Muntanya', 'Montaña'), path: '/senderisme' },
    { nom: t('Itineraris', 'Rutas'), path: '/senderisme/rutes' },
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
  const shape = lang === 'es'
    ? route.from && route.to && route.from !== route.to
      ? `${capital(deName(route.from, lang))} a ${placeName(route.to, lang)}`
      : route.roundtrip ? 'Ruta circular' : null
    : route.from && route.to && route.from !== route.to
      ? `${capital(deName(route.from))} ${aName(route.to)}`
      : route.roundtrip ? 'Itinerari circular' : null;
  const lead = lang === 'es'
    ? comarcaNames.length === 1
      ? (shape
        ? `${shape}, dentro ${deComarca(comarcaNames[0], lang)}.`
        : `Todo el recorrido está dentro ${deComarca(comarcaNames[0], lang)}.`)
      : comarcaNames.length > 1
        ? `${shape ? `${shape}. ` : ''}Atraviesa ${listOf(comarcaNames.map((c) => comarcaName(c, lang)), lang)}.`
        : shape && `${shape}.`
    : comarcaNames.length === 1
      ? (shape ? `${shape}, dins ${deComarca(comarcaNames[0])}.` : `Tot el recorregut és dins ${deComarca(comarcaNames[0])}.`)
      : comarcaNames.length > 1
        ? `${shape ? `${shape}. ` : ''}Travessa ${listOf(comarcaNames.map((c) => comarcaName(c)), lang)}.`
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
      label: t('Distància', 'Distancia'), value: num(route.km, 1), unit: 'km',
      sub: route.roundtrip ? 'circular' : t('del traçat', 'del trazado'),
    },
    route.minM != null && route.maxM != null && {
      label: t('Cotes', 'Cotas'), value: `${int(route.minM)}–${int(route.maxM)}`, unit: 'm',
      sub: t('la mínima i la màxima', 'la mínima y la máxima'),
    },
    route.ascentM != null && {
      label: t('Desnivell', 'Desnivel'), value: `+${int(route.ascentM)}`, unit: 'm',
      sub: t('acumulat, segons OpenStreetMap', 'acumulado, según OpenStreetMap'),
    },
    {
      label: t('A peu', 'A pie'), value: walk.value, unit: walk.unit,
      sub: route.ascentM == null
        ? t('com a mínim: sense les pujades', 'como mínimo: sin las subidas')
        : t('per la regla de Naismith', 'por la regla de Naismith'),
    },
  ] as Array<HeroStat | false>).filter((x): x is HeroStat => Boolean(x));

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={[refApart(route), networkLabel(route.network, lang)].filter(Boolean).join(' · ')}
        icon="partly-cloudy-day"
        title={route.name}
        lead={lead || undefined}
        stats={stats.length < 4 ? stats : undefined}
        note={lang === 'es' ? (
          <>
            El tiempo a pie sale de la regla de Naismith —{num(NAISMITH_KMH, 1)} km/h en llano y
            una hora más por cada {int(NAISMITH_ASCENT_M_PER_H)} m de subida—, la que usan
            las entidades excursionistas. Es una referencia, no una predicción.
            {route.ascentM == null && (
              <> Esta ruta no tiene el desnivel publicado: el tiempo solo cuenta los
              kilómetros y se queda corto si hay subidas.</>
            )}
            {route.kmTagged != null && Math.abs(route.kmTagged - route.km) > route.km * 0.25 && (
              <> El trazado mide {num(route.km, 1)} km y la ficha de OpenStreetMap
              indica {num(route.kmTagged, 1)}: se publica la del trazado.</>
            )}
          </>
        ) : (
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
            <h2 id="h-tracat" className="card-label">{t('Per on va', 'Por dónde va')}</h2>
            <RouteMap
              projection={mapBase.projection}
              trace={geo.trace}
              start={route.start}
              name={route.name}
              lang={lang}
            />
            <p className="card-foot">
              <External href={`https://www.openstreetmap.org/relation/${route.osmId}`}>
                {t('El traçat a OpenStreetMap', 'El trazado en OpenStreetMap')}
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
              {t('Fitxa oficial a', 'Ficha oficial en')} {new URL(route.website).host.replace(/^www\./, '')}
            </External>
            {/* «PR» o «GR» com a operador no diu res: el camp de vegades porta
                el codi de la xarxa en comptes de l'entitat que la manté. */}
            {route.operator && route.operator.length > 4
              && ` · ${t('el manté', 'la mantiene')} ${route.operator.replace(/^https?:\/\//, '')}`}
          </p>
        )}
      </PageHero>

      {/* ── El temps, que és a què es ve ─────────────────────────────── */}
      {route.maxM != null && base && (nowUp != null || days.length > 0 || aheadHours >= 2) && (
        <Section id="temps" title={t(`El temps a ${int(route.maxM)} m`, `El tiempo a ${int(route.maxM)} m`)}>
          <div className="space-y-3">
            {current && nowUp != null && (
              <section className="card" aria-labelledby="h-ara">
                <CardLabel id="h-ara" icon="thermometer">
                  {isNow
                    ? t('Ara, a dalt', 'Ahora, arriba')
                    : t(`A dalt, ${ago(current.ageMin)}`, `Arriba, ${ago(current.ageMin, lang)}`)}
                </CardLabel>
                <div className="flex flex-wrap items-center gap-x-8 gap-y-3">
                  <p className="tnum text-5xl font-semibold leading-none tracking-tight text-[var(--ink)] sm:text-6xl">
                    {temp(nowUp, 0)}
                  </p>
                  <ul className="space-y-1 text-[15px] text-[var(--ink-2)]">
                    {/* La del lloc de sortida, que és d'on es corregeix la de dalt. */}
                    {(current.temperatureAdjusted ?? current.temperature) != null && (
                      <li>
                        <span className="tnum font-medium text-[var(--ink)]">{temp(current.temperatureAdjusted ?? current.temperature, 0)}</span>{' '}
                        a {int(base.altitud ?? 0)} m
                      </li>
                    )}
                    {current.windSpeed != null && (
                      <li>
                        {t('Vent de', 'Viento de')} <span className="tnum font-medium text-[var(--ink)]">{int(msToKmh(current.windSpeed))} km/h</span>
                        {current.windDirection != null && ` ${fromDirection(windCardinal(current.windDirection), lang)}`}
                      </li>
                    )}
                    {current.humidity != null && (
                      <li><span className="tnum font-medium text-[var(--ink)]">{int(current.humidity)} %</span> {t("d'humitat", 'de humedad')}</li>
                    )}
                  </ul>
                </div>
                {lang === 'es' ? (
                  <p className="source">
                    {current.estimate
                      ? <>La temperatura es la del modelo, corregida con las estaciones de alrededor; el viento y la humedad, de la estación {deName(current.station.nom, lang)}, a{' '}</>
                      : <>Medido en la estación {deName(current.station.nom, lang)}, a{' '}</>}
                    {num(current.station.distKm, 1)} km{isNow ? `, ${ago(current.ageMin, lang)}` : ''}.
                    {current.provisional && ' Dato provisional.'} La temperatura de arriba está
                    corregida con el gradiente estándar hasta el punto más alto de la ruta:
                    es una corrección de altura, no una medida de allí.
                  </p>
                ) : (
                  <p className="source">
                    {current.estimate
                      ? <>La temperatura és la del model, corregida amb les estacions del voltant; el vent i la humitat, de l&apos;estació {deName(current.station.nom)}, a{' '}</>
                      : <>Mesurat a l&apos;estació {deName(current.station.nom)}, a{' '}</>}
                    {num(current.station.distKm, 1)} km{isNow ? `, ${ago(current.ageMin)}` : ''}.
                    {current.provisional && ' Dada provisional.'} La temperatura de dalt està
                    corregida amb el gradient estàndard fins al punt més alt de l&apos;itinerari:
                    és una correcció d&apos;altura, no una mesura d&apos;allà.
                  </p>
                )}
              </section>
            )}

            {/* ── Hora a hora, que és el que decideix a quina hora se surt ── */}
            {aheadHours >= 2 && (
              <section className="card" aria-labelledby="h-hores">
                <CardLabel id="h-hores" icon="clear-day">Hora a hora</CardLabel>
                <NextHours hourly={hourlyUp} nowHour={nowHour} models={forecast?.models.length ?? 1} id="ruta" lang={lang} />
                {lang === 'es' ? (
                  <p className="source">
                    La temperatura es la de {int(route.maxM)} m, subida desde el punto de predicción
                    {route.nearest && (
                      <> —<Link href={route.nearest.path} className="text-[var(--ink-2)]">{placeName(route.nearest.nom, lang)}</Link>,
                      a {int(base.altitud ?? 0)} m—</>
                    )}; la lluvia y el viento son los de allí, sin subir.
                  </p>
                ) : (
                  <p className="source">
                    La temperatura és la de {int(route.maxM)} m, pujada des del punt de predicció
                    {route.nearest && (
                      <> —<Link href={route.nearest.path} className="text-[var(--ink-2)]">{route.nearest.nom}</Link>,
                      a {int(base.altitud ?? 0)} m—</>
                    )}; la pluja i el vent són els d&apos;allà, sense pujar.
                  </p>
                )}
              </section>
            )}

            {days.length > 0 && (
              <section className="card" aria-labelledby="h-dies">
                <CardLabel id="h-dies" icon="partly-cloudy-day">
                  {t(`Els pròxims ${days.length} dies`, `Los próximos ${days.length} días`)}
                </CardLabel>
                <div className="scroll-x">
                  <table className="data-table [&_td.num]:whitespace-nowrap">
                    <thead>
                      <tr>
                        <th scope="col">{t('Dia', 'Día')}</th>
                        <th scope="col">{t('Cel', 'Cielo')}</th>
                        <th scope="col" className="num">{t('A dalt', 'Arriba')}</th>
                        <th scope="col" className="num">{t('Pluja', 'Lluvia')}</th>
                        <th scope="col" className="num">{t('Cota de neu', 'Cota de nieve')}</th>
                        <th scope="col" className="num">{t('Ratxa a la vall', 'Racha en el valle')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {days.map((d) => {
                        const hi = tempAtAltitude(d.tMax, base.altitud, route.maxM);
                        const lo = tempAtAltitude(d.tMin, base.altitud, route.maxM);
                        const snowLevel = snowLevelOf(d);
                        const share = shareAboveSnowLine(snowLevel, route);
                        return (
                          <tr key={d.date}>
                            <td className="whitespace-nowrap">
                              <span className="font-medium text-[var(--ink)]">{relativeDayTiny(d.date, today, lang)}</span>
                              <span className="block text-xs text-[var(--muted)]">{dateShort(d.date, lang)}</span>
                            </td>
                            <td>
                              <span className="flex items-center gap-2">
                                <WeatherIcon code={d.weatherCode} size={30} decorative />
                                <span className="text-[13px]">
                                  {d.weatherCode != null ? codeLabel(weatherCode(d.weatherCode), lang) : '—'}
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
                                  {int(d.precipProbability)} {t('% de possibilitat', '% de probabilidad')}
                                </span>
                              ) : '—'}
                            </td>
                            <td className="num">
                              {snowLevel != null ? (
                                <>
                                  {int(snowLevel)} m
                                  {share != null && share > 0 && (
                                    <span className="block text-xs text-[var(--muted)]">
                                      {share === 100
                                        ? t('tot nevat', 'todo nevado')
                                        : t(`${share} % de dalt`, `${share} % de la parte alta`)}
                                    </span>
                                  )}
                                </>
                              ) : d.precipitation === 0 && d.precipProbability < 20 ? (
                                <span className="text-xs text-[var(--muted)]">{t('sense precipitació', 'sin precipitación')}</span>
                              ) : '—'}
                            </td>
                            <td className="num">
                              {d.gustMax != null ? `${int(msToKmh(d.gustMax))} km/h` : '—'}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {lang === 'es' ? (
                  <p className="source">
                    «Arriba» es la máxima y la mínima a {int(route.maxM)} m. La racha es la del punto
                    de predicción, a {int(base.altitud ?? 0)} m, y <strong>no</strong> está subida:
                    en una cresta el viento se acelera por la forma del terreno, y cuánto no lo
                    dice la predicción del valle. La cota de nieve indica por encima de qué altura la
                    precipitación llega en forma de nieve, no cuánta se acumula.
                  </p>
                ) : (
                  <p className="source">
                    «A dalt» és la màxima i la mínima a {int(route.maxM)} m. La ratxa és la del punt
                    de predicció, a {int(base.altitud ?? 0)} m, i <strong>no</strong> està pujada:
                    en una carena el vent s&apos;accelera per la forma del terreny, i quant no ho
                    diu la predicció de la vall. La cota de neu diu per damunt de quina altura la
                    precipitació arriba en forma de neu, no quanta se n&apos;acumula.
                  </p>
                )}
              </section>
            )}
          </div>
        </Section>
      )}

      {/* ── El perfil ─────────────────────────────────────────────────── */}
      {geo && (
        <Section id="perfil" title={t('Com puja i com baixa', 'Cómo sube y cómo baja')}>
          <div className="card">
            {geo.profile ? (
              <ElevationProfile profile={geo.profile} km={route.km} lang={lang} />
            ) : lang === 'es' ? (
              <p className="measure text-sm leading-relaxed text-[var(--ink-2)]">
                De esta ruta no se publica el perfil de altitudes. En
                OpenStreetMap la relación es un conjunto de vías sin orden, y las
                de esta no se encadenan —hay ramales o tramos sueltos—, así que
                «distancia recorrida» no significa nada y el perfil no se puede dibujar. Las
                cotas mínima y máxima de arriba sí que están medidas.
              </p>
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
            {lang === 'es' ? (
              <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">
                El eje completo tiene <span className="tnum">{num(axis.km, 1)} km</span>
                {axis.legs[0].from && axis.legs[axis.legs.length - 1].to && (
                  <>, {deName(axis.legs[0].from, lang)} a {placeName(axis.legs[axis.legs.length - 1].to as string, lang)}</>
                )}.
              </p>
            ) : (
              <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">
                L&apos;eix sencer fa <span className="tnum">{num(axis.km, 1)} km</span>
                {axis.legs[0].from && axis.legs[axis.legs.length - 1].to && (
                  <>, {deName(axis.legs[0].from)} {aName(axis.legs[axis.legs.length - 1].to as string)}</>
                )}.
              </p>
            )}

            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              {/*
                L'anterior i la següent, i cada una diu si s'hi enllaça de debò.
                Quan la sèrie d'OSM es trenca, «la següent» no és una etapa que
                es pugui encadenar caminant, i dir-ho és el que evita prometre
                una continuïtat que no hi ha.
              */}
              {[
                { r: prevLeg, label: t('Abans', 'Antes'), first: true, linked: prevLeg?.linked ?? false },
                { r: nextLeg, label: t('Després', 'Después'), first: false, linked: route.linked ?? false },
              ].map(({ r, label, first, linked }) => (
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
                          {t(
                            "No s'encadena amb aquesta: a OpenStreetMap la sèrie es trenca aquí.",
                            'No se encadena con esta: en OpenStreetMap la serie se rompe aquí.',
                          )}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-1 text-sm text-[var(--ink-2)]">
                      {first
                        ? t('És la primera etapa.', 'Es la primera etapa.')
                        : t('És l’última etapa.', 'Es la última etapa.')}
                    </p>
                  )}
                </div>
              ))}
            </div>
            <p className="card-foot">
              <Link href={`/senderisme/rutes/eix/${axis.slug}`}>
                {t(`Les ${axis.legs.length} etapes ›`, `Las ${axis.legs.length} etapas ›`)}
              </Link>
            </p>
          </div>
        </Section>
      )}

      {/* La mare, quan això n'és una variant: «GR 11.18» penja de «GR 11». */}
      {parentAxis && (
        <Section id="variant" title={t(`Variant del ${parentAxis.ref}`, `Variante del ${parentAxis.ref}`)}>
          <div className="card">
            {lang === 'es' ? (
              <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">
                Es una variante señalizada del {parentAxis.ref}, que tiene{' '}
                <span className="tnum">{num(parentAxis.km, 1)} km</span> en {parentAxis.legs.length} etapas.
              </p>
            ) : (
              <p className="text-[15px] leading-relaxed text-[var(--ink-2)]">
                És una variant senyalitzada del {parentAxis.ref}, que fa{' '}
                <span className="tnum">{num(parentAxis.km, 1)} km</span> en {parentAxis.legs.length} etapes.
              </p>
            )}
            <p className="card-foot">
              <Link href={`/senderisme/rutes/eix/${parentAxis.slug}`}>{t("L'eix sencer ›", 'El eje completo ›')}</Link>
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
          title={lang === 'es'
            ? (variants.length === 1 ? 'Una variante señalizada' : `${variants.length} variantes señalizadas`)
            : (variants.length === 1 ? 'Una variant senyalitzada' : `${variants.length} variants senyalitzades`)}
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
          title={lang === 'es'
            ? `Otras rutas ${comarques.get(route.comarques[0])
              ? deComarca(comarques.get(route.comarques[0])!, lang)
              : 'cerca'}`
            : `Altres itineraris ${comarques.get(route.comarques[0])
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

      {lang === 'es' ? (
        <p className="source measure mt-10">
          Las marcas de pintura y el mantenimiento son de las entidades excursionistas, y el
          recorrido puede cambiar. Trazado de{' '}
          <External href="https://www.openstreetmap.org/copyright" className="text-[var(--ink-2)]">
            OpenStreetMap y sus colaboradores
          </External>
          , con licencia ODbL 1.0. Cotas calculadas a partir del modelo de elevación de
          Copernicus. Predicción de Open-Meteo.
        </p>
      ) : (
        <p className="source measure mt-10">
          Les marques de pintura i el manteniment són de les entitats excursionistes, i el
          recorregut pot canviar. Traçat d&apos;
          <External href="https://www.openstreetmap.org/copyright" className="text-[var(--ink-2)]">
            OpenStreetMap i els seus col·laboradors
          </External>
          , amb llicència ODbL 1.0. Cotes calculades del model d&apos;elevació de
          Copernicus. Predicció d&apos;Open-Meteo.
        </p>
      )}
    </article>
  );
}
