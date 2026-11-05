import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, hikingConditions, MOUNTAIN_M } from '@/lib/activities';
import { windCardinal } from '@/lib/variables';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { gustColor, temperatureColor, temperatureInk } from '@/lib/scales';
import { MOUNTAIN_OTHER, MOUNTAIN_ZONES, anchorSlug, groupByZone, zoneLabel } from '@/lib/zones';
import { ago, capFirst, fromDirection, int, num, stationShort } from '@/lib/format';
import { allRoutes } from '@/lib/routes';
import { sourceText } from '@/lib/sea';
import { getLang } from '@/lib/i18n';
import { tr } from '@/lib/lang';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero } from '@/components/PageHero';
import { Fold } from '@/components/Fold';
import { alternatesFor } from '@/lib/site';

/**
 * Com està la muntanya ara mateix.
 *
 * ## Per què el vent va primer
 *
 * Perquè és el que fa mal. La gent mira la temperatura i la pluja, i el que
 * gira una jornada a la carena és una ratxa de 70 km/h — que és força 8, on
 * costa mantenir-se dret. Aquí surt mesurada, no prevista, i amb el que vol dir
 * l'escala al costat.
 *
 * ## Cap nota, cap índex
 *
 * Igual que a `/bolets`: un «índex excursionista» del 0 al 10 amagaria què el
 * mou. Aquí hi ha les xifres i els llindars que existeixen fora d'aquest web
 * —Beaufort, la sensació pel vent—, i la decisió és de qui puja.
 */
/*
 * Es genera a cada petició i el CDN la guarda cinc minuts, sense servir mai la
 * còpia vella: la regla i el perquè són a `next.config.ts`, «Les pàgines amb
 * dades d'ara».
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  const lang = await getLang();
  return {
    title: tr(lang, 'Com està la muntanya: vent, fred i isoterma', 'Cómo está la montaña: viento, frío e isoterma'),
    description: tr(lang,
      'Ratxes, temperatura i sensació tèrmica mesurades ara mateix a les estacions '
      + 'd’alta muntanya de Catalunya, i la isoterma de zero graus.',
      'Rachas, temperatura y sensación térmica medidas ahora mismo en las estaciones '
      + 'de alta montaña de Cataluña, y la isoterma de cero grados.'),
    alternates: alternatesFor('/senderisme'),
  };
}

/** A partir d'aquí costa caminar dret en una carena: força 8 de Beaufort. */
const HARD_KMH = 61;


/** La tinta del número damunt del color de la ratxa: el mateix tall que el mapa. */
function gustInk(kmh: number): string {
  return kmh >= HARD_KMH ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)';
}

/**
 * Les serralades, per agrupar les estacions com es pregunta: «com està el
 * Pirineu de Lleida», no «com està l'estació 2.4».
 *
 * Les agrupacions són nostres i van per comarca. Una comarca que no hi sigui
 * va a «Altres serres», i no es perd cap estació.
 */
const ZONES = MOUNTAIN_ZONES;
const OTHER = MOUNTAIN_OTHER;
const slug = anchorSlug;

export default async function SenderismePage() {
  const lang = await getLang();
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const routeCount = allRoutes().routes.length;
  const data = await hikingConditions();
  const stations = data?.stations ?? [];
  const worst = stations
    .filter((s) => s.gustKmh != null)
    .sort((a, b) => (b.gustKmh ?? 0) - (a.gustKmh ?? 0))[0];
  const coldest = stations
    .filter((s) => s.temperature != null)
    .sort((a, b) => (a.temperature ?? 0) - (b.temperature ?? 0))[0];
  const snowiest = stations
    .filter((s) => s.snowCm != null && s.snowCm > 0)
    .sort((a, b) => (b.snowCm ?? 0) - (a.snowCm ?? 0))[0];
  const fz = data?.freezing;

  const zones = groupByZone(ZONES, [...stations].sort((a, b) => b.altitud - a.altitud), (s) => s.comarcaNom, OTHER);

  const geo = mapOutline();
  const gusty = stations.filter((s) => s.gustKmh != null);
  const bf = worst?.gustKmh != null ? beaufort(worst.gustKmh, lang) : null;

  const trail = [
    { nom: t('Catalunya', 'Cataluña'), path: '/' },
    { nom: t('Muntanya', 'Montaña'), path: '/senderisme' },
  ];
  const station = (s: { codi: string; nom: string }) => <Link href={`/estacions/${s.codi}`}>{s.nom}</Link>;

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail, lang))} />

      <PageHero
        crumbs={trail}
        eyebrow={t('Muntanya', 'Montaña')}
        icon="wind"
        title={t('Com està la muntanya', 'Cómo está la montaña')}
        lead={stations.length === 0
          ? t('Encara no hi ha observació de les estacions d’alçada.', 'Todavía no hay observación de las estaciones de altura.')
          : bf && (
            /*
              L'entradilla diu què vol dir la ratxa, i les xifres de sota, quant
              i on. Els llindars són els de l'escala de Beaufort, no nostres.
            */
            lang === 'es' ? (
              <>
                La racha más fuerte es de <strong>fuerza {bf.force}</strong>, {bf.name}
                {bf.note && <>: {bf.note}</>}.
              </>
            ) : (
              <>
                La ratxa més forta és de <strong>força {bf.force}</strong>, {bf.name}
                {bf.note && <>: {bf.note}</>}.
              </>
            )
          )}
        stats={stations.length ? [
          worst?.gustKmh != null && {
            label: t('Ratxa més forta', 'Racha más fuerte'), icon: 'wind', value: int(worst.gustKmh), unit: 'km/h',
            sub: <>{station(worst)}{worst.windDir != null && <> · {t('vent', 'viento')} {fromDirection(windCardinal(worst.windDir), lang)}</>}</>,
          },
          coldest?.temperature != null && {
            label: t('Punt més fred', 'Punto más frío'), icon: 'thermometer', value: num(coldest.temperature, 1), unit: '°C',
            sub: <>{station(coldest)}{coldest.windChill != null && <> · {t('es nota com', 'se nota como')} {num(coldest.windChill, 0)} °C</>}</>,
          },
          snowiest?.snowCm != null && {
            label: t('Més neu', 'Más nieve'), icon: 'snow', value: int(snowiest.snowCm), unit: 'cm',
            sub: station(snowiest),
          },
        ] : undefined}
        note={stations[0] && (
          lang === 'es' ? (
            <>
              Medido en {stations.length} estaciones por encima de los {int(MOUNTAIN_M)} m,{' '}
              {ago(stations[0].ageMin, lang)}. No es predicción: la de los próximos días está en la ficha de
              cada población.
            </>
          ) : (
            <>
              Mesurat a {stations.length} estacions per damunt dels {int(MOUNTAIN_M)} m,{' '}
              {ago(stations[0].ageMin)}. No és predicció: la dels pròxims dies és a la fitxa de
              cada població.
            </>
          )
        )}
        aside={gusty.length > 0 && (
          /*
            Les estacions de muntanya, amb la ratxa de cada una.

            El que un excursionista decideix amb aquesta pàgina és **on** no anar
            avui, i una llista de noms de cims no ho diu si no te'ls saps: si el
            vent és a l'Aran o al Cadí és la resposta. El número de dins és la
            ratxa, no la temperatura: a dos mil metres el que fa girar cua és el
            vent. Els noms només quan n'hi ha pocs.
          */
          <section className="card" aria-label={t('Ratxa de vent a les estacions de muntanya', 'Racha de viento en las estaciones de montaña')}>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/wind.svg" width={22} height={22} alt="" />
              {t('Ratxa ara, en km/h', 'Racha ahora, en km/h')}
            </p>
            <PointsMap
              scale={1.7}
              outline={geo.features}
              projection={geo.projection}
              width={geo.width}
              height={geo.height}
              values
              labels={gusty.length <= 10}
              maxHeight={440}
              ariaLabel={t(
                `Mapa amb la ratxa de vent a ${gusty.length} estacions de muntanya`,
                `Mapa con la racha de viento en ${gusty.length} estaciones de montaña`,
              )}
              points={gusty.map((s) => ({
                key: s.codi,
                lat: s.lat,
                lon: s.lon,
                fill: gustColor(s.gustKmh as number),
                ink: gustInk(s.gustKmh as number),
                value: String(Math.round(s.gustKmh as number)),
                label: stationShort(s.nom),
                tip: `${s.nom}: ${t('ratxa de', 'racha de')} ${Math.round(s.gustKmh as number)} km/h${
                  s.temperature != null ? ` · ${num(s.temperature, 1)} °C` : ''}`,
              }))}
              footer={lang === 'es' ? (
                <>
                  Racha máxima en las estaciones por encima de los {int(MOUNTAIN_M)} m. A
                  partir de <strong className="font-medium text-[var(--ink-2)]">{HARD_KMH} km/h</strong>{' '}
                  cuesta caminar erguido en una cresta, y el color cambia.
                </>
              ) : (
                <>
                  Ratxa màxima a les estacions per damunt dels {int(MOUNTAIN_M)} m. A
                  partir de <strong className="font-medium text-[var(--ink-2)]">{HARD_KMH} km/h</strong>{' '}
                  costa caminar dret en una carena, i el color hi gira.
                </>
              )}
            />
          </section>
        )}
      />

      {/*
        La isoterma, destacada, i al costat els itineraris.

        L'enllaç als itineraris va aquí dalt i no al peu: qui entra a mirar com
        està la muntanya sovint hi entra per decidir on va, i la llista dels
        senyalitzats és la resposta a aquella pregunta.
      */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        {fz && (
          <section className="card" aria-labelledby="h-isoterma">
            <h2 id="h-isoterma" className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              {t('La isoterma de zero graus, mesurada', 'La isoterma de cero grados, medida')}
            </h2>
            <p className="text-2xl font-semibold leading-tight tracking-tight text-[var(--ink)] sm:text-3xl">
              {fz.metres != null ? (
                <>{t('Cap als', 'Hacia los')} <span className="tnum">{int(fz.metres)} m</span></>
              ) : fz.beyond === 'amunt' ? (
                <>{t('Per damunt de qualsevol cim de Catalunya', 'Por encima de cualquier cima de Cataluña')}</>
              ) : (
                <>{t("Per sota de l'estació més baixa: fa zero graus arreu", 'Por debajo de la estación más baja: hace cero grados en todas partes')}</>
              )}
            </p>
            {lang === 'es' ? (
              <>
                <p className="mt-3 measure text-sm leading-relaxed text-[var(--ink-2)]">
                  No es la cota de nieve: la nieve se funde mientras cae y llega blanca unos
                  doscientos o trescientos metros más abajo.
                </p>
                <p className="source measure">
                  Regresión de la temperatura contra la altitud en las{' '}
                  <span className="tnum">{fz.stations}</span> estaciones que ahora dan las dos
                  cosas, de {int(fz.lowest)} a {int(fz.highest)} m: el gradiente es de{' '}
                  <span className="tnum">{num(fz.lapse, 1)} °C</span> por cada 1.000 m —el de
                  manual es −6,5— y el ajuste vale <span className="tnum">{num(fz.r2, 2)}</span> sobre 1.
                  {fz.metres == null && fz.beyond === 'amunt' && (
                    <> No se da la cifra: la recta cruza el cero muy por encima de
                    la estación más alta, y sería una extrapolación.</>
                  )}
                </p>
              </>
            ) : (
              <>
                <p className="mt-3 measure text-sm leading-relaxed text-[var(--ink-2)]">
                  No és la cota de neu: la neu es fon mentre baixa i arriba blanca uns
                  dos-cents o tres-cents metres per sota.
                </p>
                <p className="source measure">
                  Regressió de la temperatura contra l&apos;altitud a les{' '}
                  <span className="tnum">{fz.stations}</span> estacions que ara donen les dues
                  coses, de {int(fz.lowest)} a {int(fz.highest)} m: el gradient és de{' '}
                  <span className="tnum">{num(fz.lapse, 1)} °C</span> per cada 1.000 m —el de
                  manual és −6,5— i l&apos;ajust val <span className="tnum">{num(fz.r2, 2)}</span> sobre 1.
                  {fz.metres == null && fz.beyond === 'amunt' && (
                    <> No se&apos;n dona la xifra: la recta creua el zero molt per damunt de
                    l&apos;estació més alta, i seria una extrapolació.</>
                  )}
                </p>
              </>
            )}
          </section>
        )}

        {/* `a.card` porta `display: block`, i per això la columna va a dins. */}
        <Link href="/senderisme/rutes" className="card">
          <span className="flex h-full flex-col">
            <span className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/partly-cloudy-day.svg" width={22} height={22} alt="" />
              {t('Itineraris', 'Rutas')}
            </span>
            <span className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="tnum">{int(routeCount)}</span> {t('senyalitzats', 'señalizadas')}
            </span>
            <span className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
              {lang === 'es' ? (
                <>
                  Los GR y los PR-C, con la distancia del trazado, las cotas por donde pasan y la
                  predicción a su altura.
                </>
              ) : (
                <>
                  Els GR i els PR-C, amb la distància del traçat, les cotes per on passen i la
                  predicció a la seva altura.
                </>
              )}
            </span>
            <span className="mt-auto pt-3 text-sm font-medium text-[var(--accent)]">
              {t('Tots els itineraris ›', 'Todas las rutas ›')}
            </span>
          </span>
        </Link>
      </div>

      {/* Les zones, per saltar-hi. Són àncores: no cal cap script. */}
      {zones.length > 1 && (
        <nav aria-label={t('Zones', 'Zonas')} className="mt-6 mb-2">
          <ul className="chips">
            {zones.map(([name]) => (
              <li key={name}><a href={`#zona-${slug(name)}`}>{zoneLabel(name, lang)}</a></li>
            ))}
          </ul>
        </nav>
      )}

      {/*
        Les estacions, zona per zona.

        Fins al 9 d'octubre de 2026 era una taula de sis columnes ordenada per
        alçada, que al mòbil calia arrossegar de costat i que no deia si el vent
        era a l'Aran o al Montseny. Ara, com a /mar: una targeta per estació amb
        la temperatura, la ratxa i el que se'n nota, agrupades per serralada.
      */}
      {zones.map(([name, list]) => {
        const gusts = list.map((s) => s.gustKmh).filter((v): v is number => v != null);
        const temps = list.map((s) => s.temperature).filter((v): v is number => v != null);
        return (
          <section key={name} id={`zona-${slug(name)}`} className="section scroll-mt-4" aria-labelledby={`h-${slug(name)}`}>
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4">
              <h2 id={`h-${slug(name)}`} className="card-title">{zoneLabel(name, lang)}</h2>
              <p className="text-[13px] text-[var(--muted)] tnum">
                {temps.length > 0 && <>de {num(Math.min(...temps), 0)} a {num(Math.max(...temps), 0)} °C</>}
                {temps.length > 0 && gusts.length > 0 && ' · '}
                {gusts.length > 0 && <>{t('ratxes fins a', 'rachas de hasta')} {Math.max(...gusts)} km/h</>}
              </p>
            </div>
            <ul className="card-grid">
              {list.map((s) => (
                <li key={s.codi} className="card tram">
                  <h3 className="tram-name">
                    <Link href={`/estacions/${s.codi}`} className="text-[var(--ink)] no-underline hover:underline">{capFirst(stationShort(s.nom))}</Link>
                    <span className="block text-[12.5px] font-normal text-[var(--muted)]">
                      {int(s.altitud)} m{s.comarcaNom && <> · {s.comarcaNom}</>}
                    </span>
                  </h3>
                  <dl className="tram-now">
                    <div>
                      <dt>Temperatura</dt>
                      <dd>
                        {s.temperature != null ? (
                          <span className="temp-pill" style={{ background: temperatureColor(s.temperature), color: temperatureInk(s.temperature) }}>
                            {num(s.temperature, 1)}°
                          </span>
                        ) : '—'}
                        {s.windChill != null && Math.round(s.windChill) !== Math.round(s.temperature ?? NaN) && (
                          <small>{t('es nota com', 'se nota como')} {num(s.windChill, 0)}°</small>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{t('Ratxa', 'Racha')}</dt>
                      <dd>
                        {s.gustKmh != null ? (
                          <span className="temp-pill" style={{ background: gustColor(s.gustKmh), color: gustInk(s.gustKmh) }}>
                            {s.gustKmh} km/h
                          </span>
                        ) : '—'}
                        {s.gustKmh != null && (
                          <small>
                            {t('força', 'fuerza')} {beaufort(s.gustKmh).force}
                            {s.windDir != null && ` ${fromDirection(windCardinal(s.windDir), lang)}`}
                          </small>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{s.snowCm != null && s.snowCm > 0 ? t('Neu', 'Nieve') : t('Humitat', 'Humedad')}</dt>
                      <dd>
                        {s.snowCm != null && s.snowCm > 0
                          ? <>{int(s.snowCm)} cm</>
                          : s.humidity != null ? <>{int(s.humidity)} %</> : '—'}
                      </dd>
                    </div>
                  </dl>
                  {s.gustKmh != null && (
                    <p className="tram-src">{beaufort(s.gustKmh, lang).note}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {stations[0] && (
        <p className="source mt-6">
          {lang === 'es' ? (
            <>
              Racha en km/h, con la fuerza de Beaufort y de dónde viene el viento. Lecturas{' '}
              {ago(stations[0].ageMin, lang)}. {data?.source && sourceText(data.source, lang)}
            </>
          ) : (
            <>
              Ratxa en km/h, amb la força de Beaufort i d&apos;on ve el vent. Lectures{' '}
              {ago(stations[0].ageMin)}. {data?.source}
            </>
          )}
        </p>
      )}

      <div className="folds">
        <Fold
          title={t('Els llindars, i d’on surten', 'Los umbrales, y de dónde salen')}
          summary={t('Força 6, força 8 i la sensació pel vent', 'Fuerza 6, fuerza 8 y la sensación por viento')}
        >
          {lang === 'es' ? (
            <div className="card prose">
              <p>
                <strong>Fuerza 6 (39 km/h)</strong> es donde caminar de cara al viento deja de ser
                cómodo. <strong>Fuerza 8 (62 km/h)</strong> es donde cuesta mantenerse en pie: en la
                cresta, con una pendiente al lado, ya no es cuestión de comodidad. Son los
                umbrales de la escala de Beaufort.
              </p>
              <p>
                <strong>La sensación por viento</strong> sale del índice estadounidense y
                canadiense, que solo vale por debajo de 10 °C y con más de 5 km/h. Fuera
                de ese rango la casilla queda vacía.
              </p>
            </div>
          ) : (
          <div className="card prose">
            <p>
              <strong>Força 6 (39 km/h)</strong> és on caminar de cara al vent deixa de ser
              còmode. <strong>Força 8 (62 km/h)</strong> és on costa mantenir-se dret: a la
              carena, amb un pendent al costat, ja no és qüestió de comoditat. Són els
              llindars de l&apos;escala de Beaufort.
            </p>
            <p>
              <strong>La sensació pel vent</strong> surt de l&apos;índex nord-americà i
              canadenc, que només val per sota de 10 °C i amb més de 5 km/h. Fora
              d&apos;aquest rang la casella queda buida.
            </p>
          </div>
          )}
        </Fold>
      </div>
    </article>
  );
}
