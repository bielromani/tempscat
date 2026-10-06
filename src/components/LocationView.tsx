import Link from 'next/link';
import { Meteogram } from './Meteogram';
import { WarningBanner } from './WarningBanner';
import { LocationHero } from './LocationHero';
import { HourStrip } from './HourStrip';
import { DailyList } from './DailyList';
import { DetailTiles } from './DetailTiles';
import { HourlyTable } from './HourlyTable';
import { SunMoon } from './SunMoon';
import { ClimateBlock } from './ClimateBlock';
import { RainBlock, lastWetDay } from './RainBlock';
import { Fold } from './Fold';
import { rainConditionsOf } from '@/lib/conditions';
import { AirQuality } from './AirQuality';
import { ComarcaCompare } from './ComarcaCompare';
import { Headline } from './Headline';
import { WaterBlock } from './WaterBlock';
import { MeasuredAir } from './MeasuredAir';
import { SeaBlock } from './SeaBlock';
import { CameraBlock } from './CameraBlock';
import { ResortBlock } from './ResortBlock';
import { networkLabel, refApart, type Route } from '@/lib/routes';
import { aqiBand } from '@/lib/air-variables';
import { gaugeName } from '@/lib/water';
import {
  aName, comarcaName, deComarca, deName, int, monthName, num, signed,
} from '@/lib/format';
import { localClockHour, localNowHour, localToday } from '@/lib/weather';
import type {
  AirQuality as AirQualityData, Astronomy, CurrentConditions, LocationForecast,
  StationHistory, WarningGroup,
} from '@/lib/weather';
import type { ComarcaComparison } from '@/lib/comparison';
import type { Narrative } from '@/lib/narrative';
import type { WaterNearby } from '@/lib/water';
import type { NearestAirStation } from '@/lib/air-stations';
import type { SeaNearby } from '@/lib/sea';
import type { CameraNow } from '@/lib/cameras';
import { shareAboveSnowLine, type ResortNearby } from '@/lib/mountain';
import { stationByCodi, type Comarca, type Location } from '@/lib/territory';

/**
 * Una data a hora decimal local: les 14:30 de Madrid són 14,5.
 *
 * Passa per `sv-SE` amb la zona horària posada i no per `getHours()`, que dona
 * l'hora del servidor. A Vercel el servidor va en UTC, així que a l'agost el
 * cel del titular sortiria dues hores endarrerit: a les nou del vespre encara
 * seria de dia i a les set del matí encara seria de nit. Cap error, i un cel
 * equivocat dues hores segueix semblant un cel.
 */
function decimalHour(d: Date | null | undefined): number | null {
  if (!d) return null;
  const hm = d.toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(11, 16);
  const [h, m] = hm.split(':').map(Number);
  return Number.isFinite(h) && Number.isFinite(m) ? h + m / 60 : null;
}

/** 07:44 — l'hora de Madrid d'un instant, per a les línies de resum. */
function clock(d: Date | null | undefined): string | null {
  return d ? d.toLocaleTimeString('ca-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : null;
}

/** Les peces que hi són, separades per un punt volat. */
function joinBits(bits: Array<string | false | null | undefined>): string {
  return bits.filter(Boolean).join(' · ');
}

/** L'etiqueta d'una targeta, amb la seva icona. */
function CardLabel({ id, icon, children }: { id?: string; icon: string; children: React.ReactNode }) {
  return (
    <h2 id={id} className="card-label">
      {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
      <img src={`/icons/w/${icon}.svg`} width={22} height={22} alt="" />
      {children}
    </h2>
  );
}

function LinkChips({ items }: { items: Array<{ href: string; label: string; note?: string }> }) {
  return (
    <ul className="chips">
      {items.map((it) => (
        <li key={it.href}>
          <Link href={it.href}>
            {it.label}
            {it.note && <span className="tnum">{it.note}</span>}
          </Link>
        </li>
      ))}
    </ul>
  );
}

interface Props {
  loc: Location;
  comarca: Comarca;
  breadcrumbs: Array<{ nom: string; path: string }>;
  current: CurrentConditions | null;
  forecast: LocationForecast | null;
  /**
   * Avisos vigents, ja agrupats.
   *
   * Agrupats i no crus: AEMET emet un fitxer per dia i per zona, i sense
   * agrupar-los una onada de calor de tres dies sortien tres targetes
   * gairebe identiques. El perque, a `groupWarnings()`.
   */
  warnings: WarningGroup[];
  astro: Astronomy | null;
  history: StationHistory | null;
  siblings: Location[];
  siblingsLabel: string;
  neighbours: Array<{ location: Location; distKm: number }>;
  neighboursLabel: string;
  description: string;
  /** Calidad del aire de la celda de 11 km que contiene el punto. */
  air: AirQualityData | null;
  /** Posición dentro de la comarca, ahora y este mes. */
  comparison: ComarcaComparison | null;
  /** El titular en catalán y las advertencias del día. */
  narrative: Narrative | null;
  /** Embalse, aforo y estado de sequía cercanos. Null cuando no hay nada que decir. */
  water: WaterNearby | null;
  /** La estación de la XVPCA más cercana, con su medida de ayer. */
  airStation: NearestAirStation | null;
  /** Playas del municipio y estado del mar. Null si no tiene costa. */
  sea: SeaNearby | null;
  /**
   * Cámaras de montaña a menos de 25 km, con imagen vigente.
   *
   * Vacío en casi todas las fichas: solo hay cámaras en siete estaciones del
   * Pirineu y en el Montsec.
   */
  cameras: Array<CameraNow & { distKm: number }>;
  /**
   * L'estació d'esquí més propera, si n'hi ha cap a menys de 30 km.
   *
   * Nul a la immensa majoria de les fitxes: només hi ha sis estacions.
   */
  resort: ResortNearby | null;
  /**
   * Itineraris senyalitzats que travessen la comarca.
   *
   * Per comarca i no per distància: un GR de dues-centes hores no té «una
   * distància» a un poble, hi passa o no hi passa.
   */
  routes: Route[];
}

export function LocationView({
  loc, comarca, breadcrumbs, current, forecast, warnings, astro, history,
  siblings, siblingsLabel, neighbours, neighboursLabel, description,
  air, comparison, narrative, water, airStation, sea, cameras, resort, routes,
}: Props) {
  /*
   * La hora en curso dentro de la serie, para completar lo que la estación no
   * mide: UV, nubosidad, punto de rocío. El cálculo de la hora local vive en la
   * capa de datos: tiene una trampa —el separador de sv-SE es un espacio y las
   * series usan T— que hay que arreglar en un solo lugar.
   */
  const nowIso = localNowHour();
  const today = localToday();

  /*
   * La pluja acumulada surt de la sèrie que el bloc de clima ja té, més el que
   * l'estació ja ha mesurat avui i ahir. Ver `recent-rain.ts`.
   */
  const rain = history
    ? rainConditionsOf(history, today, current && {
      day: current.aggregatesDay, today: current.todayPrecip, yesterday: current.yesterdayPrecip,
    })
    : null;
  // La comarca se nombra con su artículo: és «l'Alt Camp», no «Alt Camp».
  const comarcaLabel = comarcaName(comarca.nom);
  const nowHour = forecast?.hourly.find((h) => h.time.slice(0, 13) === nowIso) ?? forecast?.hourly[0] ?? null;

  return (
    /*
     * ── L'ordre d'aquesta pàgina ─────────────────────────────────────────────
     *
     * Redisseny «Cel», 29 de setembre de 2026. Tres parts:
     *
     *   1. El titular: el cel d'aquell lloc a tota l'amplada, el nom, la xifra
     *      d'ara i d'on surt.
     *   2. El que es consulta, seguit: el resum, les pròximes 24 hores i els
     *      catorze dies; i al costat —o a sota, al mòbil— les rajoles del
     *      detall d'ara i per què el temps d'aquí és diferent.
     *   3. Plegat, amb la xifra que el resumeix a la vista: el gràfic i la
     *      taula de 48 hores, l'aire, el mar, l'aigua, la pluja caiguda, el
     *      clima, la comarca, el sol i la lluna, els itineraris.
     *
     * El que ja no hi és: «Cap on va la pluja», el radar seguit de tres hores
     * de predicció. Es va treure a petició de l'usuari, com el futur de
     * `/radar`: el radar només ensenya passat i present, i on plourà ho diuen
     * les hores de sota, en mil·límetres.
     *
     * `data-wide` dona a `main` els 70 rem que necessiten les dues columnes.
     */
    <article data-wide>
      <LocationHero
        loc={loc}
        comarcaLabel={comarcaLabel}
        breadcrumbs={breadcrumbs}
        current={current}
        nowHour={nowHour}
        today={forecast?.daily[0] ?? null}
        hour={localClockHour()}
        sunriseH={decimalHour(astro?.sunrise)}
        sunsetH={decimalHour(astro?.sunset)}
        moonPhase={astro?.moon.phase ?? 0}
        rainWarned={narrative?.rainWarnedNow ?? false}
      />

      <WarningBanner warnings={warnings} />

      <div className="ficha-grid">
        <div className="ficha-col">
          {narrative && <Headline narrative={narrative} />}

          {forecast && forecast.hourly.length > 0 && (
            <section className="card" aria-labelledby="h-hores">
              <CardLabel id="h-hores" icon="clear-day">Pròximes 24 hores</CardLabel>
              <HourStrip hourly={forecast.hourly} daily={forecast.daily} nowHour={nowIso} rainWarnings={narrative?.rainWarnings} />
              {/* El radar obre centrat aquí, amb el lloc marcat: d'on ve la pluja i cap on va. */}
              {loc.lat != null && loc.lon != null && (
                <p className="card-foot">
                  <Link href={`/radar?lloc=${loc.path}`}>
                    El radar al voltant {deName(loc.nom)} ›
                  </Link>
                </p>
              )}
            </section>
          )}

          {forecast && forecast.daily.length > 0 && (
            <section className="card" aria-labelledby="h-dies">
              <CardLabel id="h-dies" icon="partly-cloudy-day">Els pròxims {forecast.daily.length} dies</CardLabel>
              <DailyList daily={forecast.daily} today={today} rainWarnings={narrative?.rainWarnings} />
            </section>
          )}
        </div>

        <div className="ficha-col">
          <DetailTiles
            current={current}
            nowHour={nowHour}
            today={forecast?.daily[0] ?? null}
            tomorrow={forecast?.daily[1] ?? null}
            astro={astro}
            air={air}
            sea={sea}
            rain={rain}
            stationAltitude={current ? stationByCodi(current.station.codi)?.altitud ?? null : null}
          />

          {/* El lloc: l'altitud, el relleu i on queda dins la comarca, que és el
              que fa que aquí faci un temps diferent del poble del costat. */}
          {description && (
            <section className="card thesis" aria-labelledby="h-lloc">
              <CardLabel id="h-lloc" icon="thermometer">El lloc</CardLabel>
              <p>{description}</p>
              {loc.lat != null && loc.lon != null && (
                <p className="thesis-coords tnum">
                  {num(loc.lat, 3)} N · {num(loc.lon, 3)} E{loc.altitud != null && ` · ${loc.altitud} m`}
                </p>
              )}
            </section>
          )}
        </div>
      </div>

      {/* Rars —sis estacions d'esquí i vint-i-quatre càmeres— i molt visuals:
          quan hi són, van oberts i a tota l'amplada. */}
      {resort && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">
            {resort.resort.name}, l&apos;estació d&apos;esquí més propera
          </h2>
          <ResortBlock
            resort={resort.resort}
            stations={resort.stations}
            distKm={resort.resort.distKm}
            /*
             * La cota de neu ve de la predicció que aquesta fitxa ja té
             * carregada, i el desnivell del catàleg de pistes. A la pàgina de
             * neu això no hi és: caldria un tros de predicció per estació, i
             * són fins a dos megues cadascun per una frase.
             */
            snowShare={shareAboveSnowLine(
              forecast?.daily.find((d) => d.snowLevel != null)?.snowLevel ?? null,
              resort.resort.slopes,
            )}
          />
        </section>
      )}

      {cameras.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">
            {cameras.length === 1 ? 'Una càmera a prop' : 'Càmeres a prop'}
          </h2>
          <CameraBlock cameras={cameras} />
        </section>
      )}

      <div className="folds">
        <h2 className="card-title">Més dades {aName(loc.nom)}</h2>

        {/*
          * Les mateixes 48 hores, com a dibuix o com a xifres.
          *
          * El gràfic ensenya la forma i el marge de desacord entre models; la
          * taula, el que el gràfic no pot dir —sensació, humitat, UV, neu— hora
          * per hora. Les pestanyes són dos radios i dos panells amb `:checked`:
          * els panells han de ser `section` i la barra un `div`, perquè
          * `nth-of-type` compta per etiqueta i no per classe.
          */}
        {forecast && forecast.hourly.length > 0 && (
          <Fold
            id="48h"
            title="Gràfic i taula de 48 hores"
            summary={joinBits([
              forecast.nModels > 1 ? `Consens de ${forecast.nModels} models de predicció` : 'Un sol model de predicció',
              forecast.altitudeCorrectionM != null && `corregit ${signed(forecast.altitudeCorrectionM, 0, 'm')} d'altitud`,
            ])}
          >
            <div className="card">
              <div className="tabs">
                <input type="radio" name={`h-${loc.id}`} id={`h-${loc.id}-1`} defaultChecked />
                <input type="radio" name={`h-${loc.id}`} id={`h-${loc.id}-2`} />

                <div className="tablist mb-3 flex gap-5 border-b border-[var(--line-soft)] text-sm">
                  <label htmlFor={`h-${loc.id}-1`} className="pb-2">Gràfic</label>
                  <label htmlFor={`h-${loc.id}-2`} className="pb-2">Hora per hora</label>
                </div>

                <section className="panel">
                  <Meteogram
                    hourly={forecast.hourly}
                    hours={48}
                    showSpread={forecast.nModels > 1}
                    nowHour={nowIso}
                    tableFor={`h-${loc.id}-2`}
                  />
                  {narrative?.uncertainty && (
                    <p className="mt-2 measure text-xs leading-relaxed text-[var(--muted)]">
                      {narrative.uncertainty}
                    </p>
                  )}
                </section>

                <section className="panel scroll-x">
                  <HourlyTable
                    hourly={forecast.hourly}
                    hours={48}
                    today={today}
                    rainWarnings={narrative?.rainWarnings}
                  />
                </section>
              </div>
            </div>
          </Fold>
        )}

        {(air || airStation) && (
          <Fold
            id="aire"
            title="Qualitat de l'aire"
            summary={air?.aqi != null
              ? `Índex europeu ${air.aqi} · ${aqiBand(air.aqi).ca}`
              : "Mesurada a l'estació més propera"}
          >
            {air && (
              <p className="mb-2 text-xs text-[var(--muted)]">Model CAMS · cel·la de {air.cellKm} km</p>
            )}
            {air && <AirQuality air={air} today={today} />}
            {/* La medida real debajo del modelo, y diciendo que es de ayer. */}
            {airStation && <MeasuredAir station={airStation} />}
          </Fold>
        )}

        {sea && (
          <Fold
            id="mar"
            title="El mar i les platges"
            summary={joinBits([
              sea.now?.sst != null && `Aigua a ${num(sea.now.sst, 1)} °C`,
              sea.now?.waveHeight != null && `onada de ${num(sea.now.waveHeight, 1)} m`,
            ]) || undefined}
          >
            <SeaBlock sea={sea} nom={loc.nom} />
          </Fold>
        )}

        {water && (
          <Fold
            id="aigua"
            title="Embassaments i rius"
            summary={water.reservoir?.pct != null
              ? `${water.reservoir.name}, al ${num(water.reservoir.pct, 1)} %`
              : water.river?.flow != null
                ? `${gaugeName(water.river.name)}, ${num(water.river.flow, 2)} m³/s`
                : undefined}
          >
            <WaterBlock water={water} nom={loc.nom} />
          </Fold>
        )}

        {rain && current && (
          <Fold
            id="pluja"
            title="La pluja que ha caigut"
            summary={`${num(rain.rain15, 1)} mm en 15 dies · últim dia de més de 5 mm: ${lastWetDay(rain)}`}
          >
            <RainBlock
              conditions={rain}
              station={current.station}
              stationHref={`/estacions/${current.station.codi}`}
              ytd={history?.rainProgress}
            />
          </Fold>
        )}

        {history && current && (
          <Fold
            id="clima"
            title="Clima i rècords"
            summary={history.monthProgress
              ? `Aquest ${monthName(Number(today.slice(5, 7)))}, ${signed(
                Math.round((history.monthProgress.tMean - history.monthProgress.normal) * 10) / 10, 1, '°C',
              )} respecte dels mateixos dies d'altres anys`
              : `Rècords i normals de l'estació ${deName(current.station.nom)}`}
          >
            <ClimateBlock
              history={history}
              station={current.station}
              month={Number(today.slice(5, 7))}
              today={today}
              stationHref={`/estacions/${current.station.codi}`}
              dryStreak={rain?.dryStreak}
            />
          </Fold>
        )}

        {comparison && (
          <Fold
            id="comarca"
            title={`Com queda dins ${deComarca(comparison.comarca.nom)}`}
            summary={comparison.now
              ? (Math.abs(comparison.now.vsMedian) < 0.3
                ? 'Ara, pràcticament igual que la mediana de la comarca'
                : `Ara, ${signed(comparison.now.vsMedian, 1, '°C')} respecte de la mediana de la comarca`)
              : undefined}
          >
            <ComarcaCompare cmp={comparison} nom={loc.nom} />
          </Fold>
        )}

        {astro && (
          <Fold
            id="sol"
            title="Sol i lluna"
            summary={joinBits([
              clock(astro.sunrise) && `Surt a les ${clock(astro.sunrise)}`,
              clock(astro.sunset) && `es pon a les ${clock(astro.sunset)}`,
              astro.moon.name.toLowerCase(),
            ])}
          >
            <SunMoon astro={astro} />
          </Fold>
        )}

        {routes.length > 0 && (
          <Fold
            id="itineraris"
            title={`Itineraris senyalitzats ${deComarca(comarca.nom)}`}
            summary={`${routes.length} ${routes.length === 1 ? 'itinerari passa' : 'itineraris passen'} per la comarca`}
          >
            <ul className="grid list-none gap-2 p-0 sm:grid-cols-2">
              {routes.map((r) => (
                <li key={r.slug}>
                  <Link href={`/senderisme/rutes/${r.slug}`} className="card block no-underline">
                    <span className="text-sm font-medium text-[var(--ink)]">{r.name}</span>
                    <span className="block text-xs text-[var(--muted)]">
                      {[
                        refApart(r),
                        networkLabel(r.network),
                        `${num(r.km, 1)} km`,
                        r.minM != null && r.maxM != null && `${int(r.minM)}–${int(r.maxM)} m`,
                      ].filter(Boolean).join(' · ')}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-[var(--muted)]">
              Traçats d&apos;OpenStreetMap (ODbL).{' '}
              <Link href="/senderisme/rutes" className="text-[var(--ink-2)]">Tots els itineraris</Link>.
            </p>
          </Fold>
        )}
      </div>

      {siblings.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 card-title">{siblingsLabel}</h2>
          <LinkChips items={siblings.map((s) => ({
            href: s.path, label: s.nom, note: s.altitud != null ? `${s.altitud} m` : undefined,
          }))} />
        </section>
      )}

      {neighbours.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">{neighboursLabel}</h2>
          <LinkChips items={neighbours.map((n) => ({
            href: n.location.path, label: n.location.nom, note: `${n.distKm.toFixed(0)} km`,
          }))} />
        </section>
      )}

      {/*
        Només quan hi ha consens. Nou de cada deu fitxes porten un sol model
        —ver `PLAN_BY_TIER` al worker de predicció— i allà la capçalera del
        gràfic ja diu «Un sol model de predicció»: parlar al peu del pes dels
        models en «aquest consens» contradeia la mateixa pàgina.
      */}
      {forecast && !forecast.skillWeighted && forecast.nModels > 1 && (
        <p className="mt-10 text-xs leading-relaxed text-[var(--muted)]">
          Els models pesen igual en aquest consens: cap no compta més que un
          altre pel que hagi encertat abans.
        </p>
      )}
    </article>
  );
}
