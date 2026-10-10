import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, hikingConditions, MOUNTAIN_M } from '@/lib/activities';
import { windCardinal } from '@/lib/variables';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { gustColor, temperatureColor, temperatureInk } from '@/lib/scales';
import { ago, capFirst, fromDirection, int, num, stationShort } from '@/lib/format';
import { allRoutes } from '@/lib/routes';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero } from '@/components/PageHero';
import { Fold } from '@/components/Fold';

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

export const metadata: Metadata = {
  title: 'Com està la muntanya: vent, fred i isoterma',
  description:
    'Ratxes, temperatura i sensació tèrmica mesurades ara mateix a les estacions '
    + 'd’alta muntanya de Catalunya, i la isoterma de zero graus.',
  alternates: { canonical: '/senderisme' },
};

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
const ZONES: Array<[string, string[]]> = [
  ['Pirineu de Lleida', ["Val d'Aran", 'Alta Ribagorça', 'Pallars Sobirà', 'Pallars Jussà', 'Alt Urgell']],
  ['Cerdanya i Prepirineu', ['Cerdanya', 'Solsonès', 'Berguedà']],
  ['Pirineu de Girona', ['Ripollès', 'Garrotxa', 'Alt Empordà']],
];
const OTHER = 'Altres serres';

/** «Pirineu de Lleida» → `pirineu-de-lleida`, per a les àncores. */
const slug = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export default async function SenderismePage() {
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

  const zones: Array<[string, typeof stations]> = [...ZONES.map(([z]) => z), OTHER]
    .map((z) => [z, stations
      .filter((s) => (ZONES.find(([, cs]) => cs.includes(s.comarcaNom ?? ''))?.[0] ?? OTHER) === z)
      .sort((a, b) => b.altitud - a.altitud)] as [string, typeof stations])
    .filter(([, list]) => list.length > 0);

  const geo = mapOutline();
  const gusty = stations.filter((s) => s.gustKmh != null);
  const bf = worst?.gustKmh != null ? beaufort(worst.gustKmh) : null;

  const trail = [
    { nom: 'Catalunya', path: '/' },
    { nom: 'Muntanya', path: '/senderisme' },
  ];
  const station = (s: { codi: string; nom: string }) => <Link href={`/estacions/${s.codi}`}>{s.nom}</Link>;

  return (
    <article>
      <JsonLd data={graph(breadcrumbLd(trail))} />

      <PageHero
        crumbs={trail}
        eyebrow="Muntanya"
        icon="wind"
        title="Com està la muntanya"
        lead={stations.length === 0
          ? 'Encara no hi ha observació de les estacions d’alçada.'
          : bf && (
            /*
              L'entradilla diu què vol dir la ratxa, i les xifres de sota, quant
              i on. Els llindars són els de l'escala de Beaufort, no nostres.
            */
            <>
              La ratxa més forta és de <strong>força {bf.force}</strong>, {bf.name}
              {bf.note && <>: {bf.note}</>}.
            </>
          )}
        stats={stations.length ? [
          worst?.gustKmh != null && {
            label: 'Ratxa més forta', icon: 'wind', value: int(worst.gustKmh), unit: 'km/h',
            sub: <>{station(worst)}{worst.windDir != null && <> · vent {fromDirection(windCardinal(worst.windDir))}</>}</>,
          },
          coldest?.temperature != null && {
            label: 'Punt més fred', icon: 'thermometer', value: num(coldest.temperature, 1), unit: '°C',
            sub: <>{station(coldest)}{coldest.windChill != null && <> · es nota com {num(coldest.windChill, 0)} °C</>}</>,
          },
          snowiest?.snowCm != null && {
            label: 'Més neu', icon: 'snow', value: int(snowiest.snowCm), unit: 'cm',
            sub: station(snowiest),
          },
        ] : undefined}
        note={stations[0] && (
          <>
            Mesurat a {stations.length} estacions per damunt dels {int(MOUNTAIN_M)} m,{' '}
            {ago(stations[0].ageMin)}. No és predicció: la dels pròxims dies és a la fitxa de
            cada població.
          </>
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
          <section className="card" aria-label="Ratxa de vent a les estacions de muntanya">
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/wind.svg" width={22} height={22} alt="" />
              Ratxa ara, en km/h
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
              ariaLabel={`Mapa amb la ratxa de vent a ${gusty.length} estacions de muntanya`}
              points={gusty.map((s) => ({
                key: s.codi,
                lat: s.lat,
                lon: s.lon,
                fill: gustColor(s.gustKmh as number),
                ink: gustInk(s.gustKmh as number),
                value: String(Math.round(s.gustKmh as number)),
                label: stationShort(s.nom),
                tip: `${s.nom}: ratxa de ${Math.round(s.gustKmh as number)} km/h${
                  s.temperature != null ? ` · ${num(s.temperature, 1)} °C` : ''}`,
              }))}
              footer={(
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
              La isoterma de zero graus, mesurada
            </h2>
            <p className="text-2xl font-semibold leading-tight tracking-tight text-[var(--ink)] sm:text-3xl">
              {fz.metres != null ? (
                <>Cap als <span className="tnum">{int(fz.metres)} m</span></>
              ) : fz.beyond === 'amunt' ? (
                <>Per damunt de qualsevol cim de Catalunya</>
              ) : (
                <>Per sota de l&apos;estació més baixa: fa zero graus arreu</>
              )}
            </p>
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
          </section>
        )}

        {/* `a.card` porta `display: block`, i per això la columna va a dins. */}
        <Link href="/senderisme/rutes" className="card">
          <span className="flex h-full flex-col">
            <span className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/partly-cloudy-day.svg" width={22} height={22} alt="" />
              Itineraris
            </span>
            <span className="text-2xl font-semibold tracking-tight sm:text-3xl">
              <span className="tnum">{int(routeCount)}</span> senyalitzats
            </span>
            <span className="mt-3 text-sm leading-relaxed text-[var(--ink-2)]">
              Els GR i els PR-C, amb la distància del traçat, les cotes per on passen i la
              predicció a la seva altura.
            </span>
            <span className="mt-auto pt-3 text-sm font-medium text-[var(--accent)]">
              Tots els itineraris ›
            </span>
          </span>
        </Link>
      </div>

      {/* Les zones, per saltar-hi. Són àncores: no cal cap script. */}
      {zones.length > 1 && (
        <nav aria-label="Zones" className="mt-6 mb-2">
          <ul className="chips">
            {zones.map(([name]) => (
              <li key={name}><a href={`#zona-${slug(name)}`}>{name}</a></li>
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
              <h2 id={`h-${slug(name)}`} className="card-title">{name}</h2>
              <p className="text-[13px] text-[var(--muted)] tnum">
                {temps.length > 0 && <>de {num(Math.min(...temps), 0)} a {num(Math.max(...temps), 0)} °C</>}
                {temps.length > 0 && gusts.length > 0 && ' · '}
                {gusts.length > 0 && <>ratxes fins a {Math.max(...gusts)} km/h</>}
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
                          <small>es nota com {num(s.windChill, 0)}°</small>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>Ratxa</dt>
                      <dd>
                        {s.gustKmh != null ? (
                          <span className="temp-pill" style={{ background: gustColor(s.gustKmh), color: gustInk(s.gustKmh) }}>
                            {s.gustKmh} km/h
                          </span>
                        ) : '—'}
                        {s.gustKmh != null && (
                          <small>
                            força {beaufort(s.gustKmh).force}
                            {s.windDir != null && ` ${fromDirection(windCardinal(s.windDir))}`}
                          </small>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt>{s.snowCm != null && s.snowCm > 0 ? 'Neu' : 'Humitat'}</dt>
                      <dd>
                        {s.snowCm != null && s.snowCm > 0
                          ? <>{int(s.snowCm)} cm</>
                          : s.humidity != null ? <>{int(s.humidity)} %</> : '—'}
                      </dd>
                    </div>
                  </dl>
                  {s.gustKmh != null && (
                    <p className="tram-src">{beaufort(s.gustKmh).note}</p>
                  )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      {stations[0] && (
        <p className="source mt-6">
          Ratxa en km/h, amb la força de Beaufort i d&apos;on ve el vent. Lectures{' '}
          {ago(stations[0].ageMin)}. {data?.source}
        </p>
      )}

      <div className="folds">
        <Fold title="Els llindars, i d’on surten" summary="Força 6, força 8 i la sensació pel vent">
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
        </Fold>
      </div>
    </article>
  );
}
