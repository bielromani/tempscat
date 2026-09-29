import { Fragment } from 'react';
import Link from 'next/link';
import { Meteogram } from './Meteogram';
import { WeatherIcon, WeatherIconSprite } from './WeatherIcon';
import { WarningBanner } from './WarningBanner';
import { LocationHero } from './LocationHero';
import { NextHours } from '@/components/NextHours';
import { HourlyTable } from './HourlyTable';
import { SunMoon } from './SunMoon';
import { ClimateBlock } from './ClimateBlock';
import { RainBlock, lastWetDay } from './RainBlock';
import { Fold } from './Fold';
import { LocalRain } from './LocalRain';
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
import { radarZoneOf } from '@/lib/radar-zones';
import type { LocalRainData } from '@/lib/local-rain';
import { temperatureColor } from '@/lib/scales';
import { aqiBand } from '@/lib/air-variables';
import { gaugeName } from '@/lib/water';
import { msToKmh, seaLevelPressure, windCardinal } from '@/lib/variables';
import {
  aComarca, aName, ago, comarcaName, dateTiny, deComarca, deName, int, monthName, num,
  relativeDayTiny, signed, tempTiny,
} from '@/lib/format';
import { localNowHour, localToday } from '@/lib/weather';
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

/** Descripción del índice UV con el consejo que le corresponde. */
function uvAdvice(uv: number): { label: string; color: string } {
  if (uv >= 11) return { label: 'extrem', color: 'var(--cap-red)' };
  if (uv >= 8) return { label: 'molt alt', color: 'var(--cap-red)' };
  if (uv >= 6) return { label: 'alt', color: 'var(--cap-orange)' };
  if (uv >= 3) return { label: 'moderat', color: 'var(--cap-yellow)' };
  return { label: 'baix', color: 'var(--good)' };
}

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

/**
 * «Ara mateix, tota la lectura»: les nou mesures en un sol lloc.
 *
 * Abans anaven escampades entre el termòmetre gran i el peu de procedència, en
 * una llista de definicions de dues o tres columnes segons l'amplada. El número
 * gran i d'on surt ara viuen al titular —`LocationHero`—, i aquí queda el que
 * de debò és una taula: nou valors del mateix instant, comparables entre ells.
 *
 * Les caselles surten **del que aquesta estació mesura**, no d'una llista fixa.
 * Nou forats amb guions serien nou maneres de dir que no ho sabem quan amb una
 * n'hi ha prou: si no hi ha ratxa, no hi ha casella de ratxa.
 */
function NowGrid({
  current, nowHour, stationAltitude,
}: {
  current: CurrentConditions;
  nowHour: LocationForecast['hourly'][number] | null;
  /** Per reduir la pressió al nivell del mar. Ver `seaLevelPressure()`. */
  stationAltitude: number | null;
}) {
  /*
   * Cada casella diu **d'on surt**, i no és un detall de comptabilitat: la
   * meitat les mesura l'estació i l'altra meitat les dona el model. Sense
   * distingir-ho, la nuvolositat del model queda al costat de la humitat
   * mesurada amb la mateixa cara, i el peu diria que tot és de l'estació.
   */
  const cells: Array<{ k: string; v: string; extra?: string; model?: boolean }> = [];

  if (current.windSpeed != null) {
    cells.push({
      k: 'Vent',
      v: `${msToKmh(current.windSpeed).toFixed(0)} km/h`,
      extra: current.windDirection != null ? windCardinal(current.windDirection) : undefined,
    });
  }
  // La ratxa només quan diu alguna cosa que el vent mitjà no digui.
  if (current.windGust != null && current.windGust > (current.windSpeed ?? 0) * 1.4) {
    cells.push({ k: 'Ratxa', v: `${msToKmh(current.windGust).toFixed(0)} km/h` });
  }
  if (current.humidity != null) cells.push({ k: 'Humitat', v: `${Math.round(current.humidity)} %` });
  if (nowHour?.dewPoint != null) cells.push({ k: 'Punt de rosada', v: `${nowHour.dewPoint.toFixed(0)} °C`, model: true });
  if (current.precip24h != null) cells.push({ k: 'Pluja 24 h', v: `${num(current.precip24h, 1)} mm` });
  if (current.pressure != null) {
    // Reduïda quan es pot; si no, dita pel que és. Un número de pressió sense
    // dir a quina altura és el que feia llegir 967 hPa com un temporal.
    const reduced = stationAltitude != null && current.temperature != null
      ? seaLevelPressure(current.pressure, stationAltitude, current.temperature)
      : null;
    cells.push(reduced != null
      ? { k: 'Pressió', v: `${reduced.toFixed(0)} hPa`, extra: 'nivell del mar' }
      : { k: "Pressió a l'estació", v: `${current.pressure.toFixed(0)} hPa` });
  }
  if (nowHour?.cloudCover != null) cells.push({ k: 'Nuvolositat', v: `${nowHour.cloudCover} %`, model: true });
  if (nowHour?.uvIndex != null && nowHour.uvIndex > 0) {
    cells.push({ k: 'Índex UV', v: String(nowHour.uvIndex), extra: uvAdvice(nowHour.uvIndex).label, model: true });
  }
  if (nowHour?.visibility != null && nowHour.visibility < 20000) {
    cells.push({ k: 'Visibilitat', v: `${(nowHour.visibility / 1000).toFixed(0)} km`, model: true });
  }

  if (!cells.length) return null;
  const fromModel = cells.filter((c) => c.model).map((c) => c.k);

  return (
    <div className="card">
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
        {cells.map((c) => (
          <div key={c.k}>
            <dt className="text-[12px] text-[var(--muted)]">{c.k}</dt>
            <dd className="tnum mt-0.5 text-[17px] font-medium text-[var(--ink)]">
              {c.v}
              {c.extra && <span className="ml-1.5 text-[13px] font-normal text-[var(--ink-2)]">{c.extra}</span>}
            </dd>
          </div>
        ))}
      </dl>
      {/*
        La procedència completa és al titular; aquí només cal dir que és la
        mateixa lectura, de quan, i **quines d'aquestes caselles no són seves**.

        La llista es construeix del que hi ha i no s'escriu a mà: la primera
        versió deia sempre «nuvolositat, punt de rosada, UV i visibilitat» i la
        visibilitat només surt quan baixa de 20 km, o sigui que gairebé sempre
        anomenava una casella que no hi era.
      */}
      <p className="source">
        La mateixa lectura del titular · {ago(current.ageMin)} · {current.source}
        {fromModel.length > 0 && (
          <>
            {' · '}
            {/* Només la inicial de la primera, que ve darrere d'un punt volat.
                Abaixant-les totes sortia «índex uv», que és una sigla. */}
            {`${fromModel[0][0].toLowerCase()}${fromModel[0].slice(1)}`}
            {fromModel.length > 1 && (
              fromModel.length === 2
                ? ` i ${fromModel[1]}`
                : `, ${fromModel.slice(1, -1).join(', ')} i ${fromModel.at(-1)}`
            )}
            , del model
          </>
        )}
      </p>
    </div>
  );
}

/**
 * A partir d'aquí la predicció deixa de ser una predicció i passa a ser una
 * tendència. No és un número rodó triat a ull: és on un model determinista
 * comença a tenir poca traça i on els grans deixen de posar-hi decimals.
 */
const CONFIDENT_DAYS = 7;

/**
 * Els catorze dies, amb la segona setmana dita com el que és.
 *
 * Demanar catorze dies en comptes de set **no costa cap unitat de quota** —el
 * factor de dies d'Open-Meteo té terra a 1—, així que estàvem pagant per una
 * setmana que no ensenyàvem. Però que la dada hi sigui no vol dir que valgui
 * igual, i ensenyar el dia dotze amb la mateixa cara que el de demà seria
 * prometre una precisió que no tenim.
 *
 * Per això la segona setmana va apagada, sense mil·límetres —a dotze dies vista
 * la quantitat de pluja és soroll, la probabilitat encara diu alguna cosa— i
 * amb una separació pel mig que es veu.
 */
function DailyStrip({ daily, today }: { daily: LocationForecast['daily']; today: string }) {
  const all = daily.flatMap((d) => [d.tMax, d.tMin]).filter((v): v is number => v != null);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(1, hi - lo);

  return (
    <div className="scroll-x">
      <ol className="flex min-w-max items-stretch gap-2">
        {daily.map((d, i) => {
          const barTop = d.tMax != null ? ((hi - d.tMax) / span) * 100 : 0;
          const barBottom = d.tMin != null ? ((d.tMin - lo) / span) * 100 : 0;
          const tendency = i >= CONFIDENT_DAYS;
          return (
            <Fragment key={d.date}>
              {i === CONFIDENT_DAYS && (
                <li aria-hidden className="flex w-8 shrink-0 items-center justify-center">
                  <span className="h-full w-px bg-[var(--line)]" />
                </li>
              )}
            <li
              className="w-[110px] shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] p-2.5 text-center"
              style={tendency ? { opacity: 0.62 } : undefined}>
              <p className="text-xs font-semibold capitalize tracking-wide text-[var(--ink-2)]">
                {relativeDayTiny(d.date, today)}
              </p>
              <p className="tnum text-[11px] text-[var(--muted)]">{dateTiny(d.date)}</p>

              <div className="my-1.5 flex justify-center">
                <WeatherIcon code={d.weatherCode} size={34} />
              </div>

              <div className="flex items-stretch justify-center gap-2">
                <div className="relative my-0.5 w-1.5 rounded-full bg-[var(--surface-2)]" style={{ height: 44 }}>
                  <div className="absolute inset-x-0 rounded-full"
                    style={{
                      top: `${barTop}%`, bottom: `${barBottom}%`,
                      background: d.tMax != null && d.tMin != null
                        ? `linear-gradient(to bottom, ${temperatureColor(d.tMax)}, ${temperatureColor(d.tMin)})`
                        : 'var(--line)',
                    }} />
                </div>
                <div className="text-left">
                  <p className="tnum text-sm font-semibold text-[var(--ink)]">{tempTiny(d.tMax)}</p>
                  <p className="tnum text-sm text-[var(--muted)]">{tempTiny(d.tMin)}</p>
                </div>
              </div>

              <div className="mt-1.5 space-y-0.5 text-[11px]">
                {d.precipitation > 0 || d.precipProbability >= 20 ? (
                  <p className="tnum font-medium" style={{ color: 'oklch(52% 0.13 245)' }}>
                    {/* A la segona setmana, la quantitat és soroll i la
                        probabilitat encara diu alguna cosa. Només la segona. */}
                    {!tendency && d.precipitation > 0 ? `${num(d.precipitation, 1)} mm` : ''}
                    {d.precipProbability > 0 && (
                      <span className={!tendency && d.precipitation > 0 ? 'ml-1 opacity-75' : ''}>
                        {d.precipProbability} %
                      </span>
                    )}
                  </p>
                ) : <p className="text-[var(--line)]">—</p>}
                {/* Solo si la racha es realmente destacable. A 40 km/h salía en
                    las siete tarjetas y dejaba de significar nada. */}
                {d.gustMax != null && msToKmh(d.gustMax) >= 50 && (
                  <p className="tnum text-[var(--muted)]">
                    ratxa {msToKmh(d.gustMax).toFixed(0)}
                  </p>
                )}
                {d.snowLevel != null && (
                  <p className="tnum font-medium" style={{ color: 'var(--accent)' }}>
                    neu a {int(d.snowLevel)} m
                  </p>
                )}
              </div>
            </li>
            </Fragment>
          );
        })}
      </ol>
      {daily.length > CONFIDENT_DAYS && (
        <p className="mt-3 measure text-xs leading-relaxed text-[var(--muted)]">
          Després de la ratlla, <strong className="font-medium text-[var(--ink-2)]">tendència
          i no predicció</strong>: sense mil·límetres, només la probabilitat de pluja.
        </p>
      )}
    </div>
  );
}

function LinkChips({ items }: { items: Array<{ href: string; label: string; note?: string }> }) {
  return (
    <ul className="flex flex-wrap gap-2">
      {items.map((it) => (
        <li key={it.href}>
          <Link href={it.href}
            className="inline-flex items-baseline gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm no-underline text-[var(--ink)] hover:border-[var(--accent)]">
            {it.label}
            {it.note && <span className="tnum text-xs text-[var(--muted)]">{it.note}</span>}
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
  /** El titular en catalán, las franjas del día y las respuestas de decisión. */
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
  /**
   * Cap on va la pluja, quan n'hi ha.
   *
   * Nul la immensa majoria dels dies, i és el cas normal: la porta la mira
   * `localRainFor()` contra la predicció d'aquest punt, i un mapa de pluja
   * sense pluja no és informació.
   */
  localRain: LocalRainData | null;
}

export function LocationView({
  localRain, loc, comarca, breadcrumbs, current, forecast, warnings, astro, history,
  siblings, siblingsLabel, neighbours, neighboursLabel, description,
  air, comparison, narrative, water, airStation, sea, cameras, resort, routes,
}: Props) {
  /*
   * La hora en curso dentro de la serie, para completar el bloque actual con las
   * variables que la estación no mide: UV, nubosidad, punto de rocío.
   *
   * El cálculo de la hora local vive en la capa de datos, no aquí: lo necesitan
   * ya cuatro sitios y tiene una trampa —el separador de sv-SE es un espacio y
   * las series usan T— que hay que arreglar en un solo lugar.
   */
  const nowIso = localNowHour();
  const today = localToday();

  /*
   * La pluja acumulada surt de la sèrie que el bloc de clima ja té. Vivia només
   * a `/bolets`, que ordenava les 189 estacions per acumulat i donava «la millor
   * zona de bolets és Torredembarra»: ordenar aparells quan la pregunta és sobre
   * boscos. La pregunta es fa d'un lloc, i aquí és on hi ha el lloc.
   */
  const rain = history
    ? rainConditionsOf(history, today, current && {
      day: current.aggregatesDay, today: current.todayPrecip, yesterday: current.yesterdayPrecip,
    })
    : null;
  // La comarca se nombra con su artículo: és «l'Alt Camp», no «Alt Camp».
  const comarcaLabel = comarcaName(comarca.nom);
  const zone = radarZoneOf(comarca.codi);
  const nowHour = forecast?.hourly.find((h) => h.time.slice(0, 13) === nowIso) ?? forecast?.hourly[0] ?? null;

  return (
    /*
     * ── Una sola columna, i la mateixa per a tot ────────────────────────────
     *
     * La pàgina vivia dins dels 1.024 px de `main`, però els paràgrafs porten
     * un límit de mesura —64 caràcters, que a 18 px són **552**— i les targetes
     * no: el resultat eren blocs de text que s'acabaven a mig camí amb 432 px
     * de blanc a la dreta, al costat de targetes que arribaven fins al final.
     * Cada bloc per separat estava bé i junts semblaven mal alineats.
     *
     * Ara la columna és una i la posa `main` per a tot el web: 38 rem, que és
     * on la mesura del text hi cap sencera. Tot comparteix les dues vores.
     *
     * Els onze blocs que necessiten més amplada —el meteograma, la tira de les
     * hores, la dels catorze dies, les taules— ja porten `scroll-x` i es
     * desplacen, que és el que ja feien al telèfon. En un mòbil això no canvia
     * res: allà la columna sempre ha estat l'amplada de la pantalla.
     */
    <article>
      {/* El sprite va una sola vez; los 48 iconos de la tabla horaria lo
          referencian con <use> en vez de repetir el dibujo entero. */}
      <WeatherIconSprite />

      <LocationHero
        loc={loc}
        comarcaLabel={comarcaLabel}
        breadcrumbs={breadcrumbs}
        current={current}
        nowHour={nowHour}
        today={forecast?.daily[0] ?? null}
        sunriseH={decimalHour(astro?.sunrise)}
        sunsetH={decimalHour(astro?.sunset)}
        moonPhase={astro?.moon.phase ?? 0}
        rainWarned={narrative?.rainWarnedNow ?? false}
      />

      <WarningBanner warnings={warnings} />

      {/*
        * ── L'ordre d'aquesta pàgina ─────────────────────────────────────────
        *
        * Havia crescut per acumulació fins a onze pantalles de mòbil, i tots els
        * blocs pesaven igual. Ara n'hi ha dues parts:
        *
        *   1. Oberta, i seguida: què fa ara (el titular), què vol dir (la frase
        *      i les franges), què passarà aviat (les hores) i la setmana (els
        *      dies). És el que ve a buscar gairebé tothom.
        *   2. Plegada, amb la xifra que la resumeix a la vista: la lectura
        *      sencera, el gràfic i la taula de 48 h, l'aire, el mar, l'aigua,
        *      la pluja caiguda, el clima, la comarca, el sol i la lluna.
        *
        * Si algun dia s'hi afegeix un bloc, va plegat mentre no respongui una
        * pregunta més urgent que les de la primera part.
        */}
      {narrative && <Headline narrative={narrative} />}

      {forecast && forecast.hourly.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">Les pròximes hores</h2>
          <NextHours
            hourly={forecast.hourly}
            nowHour={nowIso}
            models={forecast.nModels}
            id={loc.id}
          />
          {/*
            La porta al radar del seu tros. La pregunta que porta algú al radar
            des d'aquí no és «on plou» en general: és si allò que ve li tocarà.
          */}
          {zone && (
            <p className="mt-2 text-sm">
              <Link
                href={`/radar?zona=${zone.key}`}
                className="font-medium text-[var(--accent)] no-underline hover:underline"
              >
                Veure el radar {aComarca(comarca.nom)} i rodalia ›
              </Link>
            </p>
          )}
        </section>
      )}

      {/*
        Cap on va la pluja, i només quan n'hi ha: la porta és la predicció
        d'aquest punt, no el radar. Ver `localRainFor()`.
      */}
      {localRain && loc.lat != null && loc.lon != null && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">Cap on va la pluja</h2>
          <LocalRain
            frames={localRain.frames}
            grid={localRain.grid}
            tiles={localRain.tiles}
            fieldBox={localRain.fieldBox}
            terrain={localRain.terrain}
            paths={localRain.paths}
            lat={loc.lat}
            lon={loc.lon}
            nom={loc.nom}
            zoneKey={zone?.key ?? null}
          />
        </section>
      )}

      {forecast && forecast.daily.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">Els pròxims dies</h2>
          <DailyStrip daily={forecast.daily} today={today} />
        </section>
      )}

      {/* La tesi del lloc, a la vista: és el que no diu cap altre web. */}
      <section className="mt-8">
        <h2 className="mb-2 card-title">
          Per què el temps {aName(loc.nom)} és diferent
        </h2>
        <p className="measure leading-relaxed text-[var(--ink-2)]">{description}</p>
      </section>

      {/* Rars —sis estacions d'esquí i vint-i-quatre càmeres— i molt visuals:
          quan hi són, van oberts. */}
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
        {current && (
          <Fold
            id="ara"
            title="Ara mateix, tota la lectura"
            summary={joinBits([
              current.humidity != null && `Humitat ${Math.round(current.humidity)} %`,
              current.precip24h != null && `pluja 24 h ${num(current.precip24h, 1)} mm`,
              current.windGust != null && `ratxa ${msToKmh(current.windGust).toFixed(0)} km/h`,
            ])}
          >
            <NowGrid
              current={current}
              nowHour={nowHour}
              stationAltitude={stationByCodi(current.station.codi)?.altitud ?? null}
            />
          </Fold>
        )}

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
            title="El mar"
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
            title="Aigua"
            summary={water.reservoir?.pct != null
              ? `${water.reservoir.name}, al ${num(water.reservoir.pct, 1)} %`
              : water.river?.flow != null
                ? `${gaugeName(water.river.name)}, ${num(water.river.flow, 2)} m³/s`
                : undefined}
          >
            <WaterBlock water={water} nom={loc.nom} />
          </Fold>
        )}

        {/*
          L'aigua acumulada. Surt de la mateixa sèrie diària que el bloc de clima,
          que la fitxa ja s'ha baixat: no costa cap petició ni cap byte de més.
        */}
        {rain && current && (
          <Fold
            id="pluja"
            title="L'aigua que ha caigut"
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
                  <Link
                    href={`/senderisme/rutes/${r.slug}`}
                    className="block rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2 no-underline"
                  >
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
        <section className="mt-8">
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
        <p className="mt-10 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
          Els models pesen igual en aquest consens: cap no compta més que un
          altre pel que hagi encertat abans.
        </p>
      )}
    </article>
  );
}
