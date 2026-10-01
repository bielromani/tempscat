import type { Metadata } from 'next';
import Link from 'next/link';
import { beaufort, hikingConditions, MOUNTAIN_M } from '@/lib/activities';
import { windCardinal } from '@/lib/variables';
import { PointsMap } from '@/components/PointsMap';
import { mapOutline } from '@/lib/map';
import { gustColor, temperatureColor, temperatureInk } from '@/lib/scales';
import { ago, fromDirection, int, num } from '@/lib/format';
import { allRoutes } from '@/lib/routes';
import { JsonLd, breadcrumbLd, graph } from '@/components/JsonLd';
import { PageHero, Section } from '@/components/PageHero';
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
export const revalidate = 900;

export const metadata: Metadata = {
  title: 'Com està la muntanya: vent, fred i isoterma',
  description:
    'Ratxes, temperatura i sensació tèrmica mesurades ara mateix a les estacions '
    + 'd’alta muntanya de Catalunya, i la isoterma de zero graus.',
  alternates: { canonical: '/senderisme' },
};

/** A partir d'aquí costa caminar dret en una carena: força 8 de Beaufort. */
const HARD_KMH = 61;

/** El nom d'una estació sense l'alçada entre parèntesis: «Boí (2.537 m)» → «Boí». */
function bare(nom: string): string {
  return nom.replace(/\s*\([^)]*\)\s*$/, '');
}

/** La tinta del número damunt del color de la ratxa: el mateix tall que el mapa. */
function gustInk(kmh: number): string {
  return kmh >= HARD_KMH ? 'oklch(100% 0 0)' : 'oklch(20% 0.02 250)';
}

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

  /*
   * Dues columnes que a l'estiu no tenen res a dir.
   *
   * La sensació pel vent només existeix per sota de 10 °C, i la neu, doncs
   * quan n'hi ha. Una columna sencera de guionets sembla que estigui trencada;
   * el que passa és que aquella dada avui no aplica. Si no la té ningú, la
   * columna no hi és.
   */
  const anyChill = stations.some((s) => s.windChill != null);
  const anySnow = snowiest != null;

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
                label: bare(s.nom),
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

      {stations.length > 0 && (
        <Section id="estacions" title={`Les estacions per damunt dels ${int(MOUNTAIN_M)} metres`}>
          <div className="card">
            <div className="scroll-x">
              <table className="data-table [&_td.num]:whitespace-nowrap">
                <thead>
                  <tr>
                    <th scope="col">Estació</th>
                    <th scope="col" className="num">Alçada</th>
                    <th scope="col" className="num">Temp.</th>
                    {anyChill && <th scope="col" className="num">Es noten</th>}
                    <th scope="col" className="num">Ratxa (km/h)</th>
                    {anySnow && <th scope="col" className="num">Neu</th>}
                  </tr>
                </thead>
                <tbody>
                  {stations.map((s) => (
                    <tr key={s.codi}>
                      <td>
                        {/* L'alçada ja té columna: el nom va sense el parèntesi. */}
                        <Link href={`/estacions/${s.codi}`}>{bare(s.nom)}</Link>
                        {s.comarcaNom && (
                          <span className="block text-xs text-[var(--muted)]">{s.comarcaNom}</span>
                        )}
                      </td>
                      <td className="num">{int(s.altitud)} m</td>
                      <td className="num">
                        {s.temperature != null ? (
                          <span
                            className="temp-pill"
                            style={{ background: temperatureColor(s.temperature), color: temperatureInk(s.temperature) }}
                          >
                            {num(s.temperature, 1)}°
                          </span>
                        ) : '—'}
                      </td>
                      {anyChill && (
                        <td className="num">{s.windChill != null ? `${num(s.windChill, 0)} °C` : '—'}</td>
                      )}
                      <td className="num">
                        {s.gustKmh != null ? (
                          <>
                            <span className="mr-1.5 text-xs text-[var(--muted)]">
                              F{beaufort(s.gustKmh).force}
                              {s.windDir != null && ` · ${windCardinal(s.windDir)}`}
                            </span>
                            <span
                              className="temp-pill"
                              style={{ background: gustColor(s.gustKmh), color: gustInk(s.gustKmh) }}
                            >
                              {s.gustKmh}
                            </span>
                          </>
                        ) : '—'}
                      </td>
                      {anySnow && (
                        <td className="num">{s.snowCm != null && s.snowCm > 0 ? `${int(s.snowCm)} cm` : '—'}</td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {stations[0] && (
              <p className="source">
                Ratxa en km/h, amb la força de Beaufort i d&apos;on ve el vent. Lectures{' '}
                {ago(stations[0].ageMin)}. {data?.source}
              </p>
            )}
          </div>
        </Section>
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
