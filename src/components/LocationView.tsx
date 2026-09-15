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
import { RainBlock } from './RainBlock';
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
import { msToKmh, windCardinal } from '@/lib/variables';
import {
  aComarca, aName, ago, comarcaName, dateTiny, deComarca, int, num, relativeDayTiny,
  signed, tempTiny,
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
import type { Comarca, Location } from '@/lib/territory';

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
  current, nowHour,
}: {
  current: CurrentConditions;
  nowHour: LocationForecast['hourly'][number] | null;
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
  if (current.pressure != null) cells.push({ k: 'Pressió', v: `${current.pressure.toFixed(0)} hPa` });
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
    <section className="card card-block" aria-label="Totes les mesures d'ara mateix">
      <h2 className="card-title">Ara mateix, tota la lectura</h2>
      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-3.5 sm:grid-cols-3">
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
    </section>
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
          Els dies que queden després de la ratlla són <strong className="font-medium text-[var(--ink-2)]">tendència,
          no predicció</strong>. Un model encerta força la setmana que ve i molt
          menys la següent, així que allà no hi ha mil·límetres —a dotze dies
          vista la quantitat és soroll— i sí la probabilitat, que encara diu
          alguna cosa. Serveixen per veure cap on va, no per fer plans.
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
  const rain = history ? rainConditionsOf(history, today) : null;
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
      />

      <WarningBanner warnings={warnings} />

      {current && <NowGrid current={current} nowHour={nowHour} />}

      {/* La interpretación va inmediatamente después del número grande: el
          termómetro es el gancho y la frase es la respuesta. */}
      {narrative && <Headline narrative={narrative} />}
      {/*
        * ── L'ordre d'aquesta pàgina ─────────────────────────────────────────
        *
        * Havia crescut per acumulació: cada bloc nou anava a continuació de
        * l'anterior, i la qualitat de l'aire —que va ser dels primers— havia
        * quedat entre el termòmetre i la predicció. En una fitxa de nucli això
        * volia dir una pantalla sencera de contaminants i pol·len abans de
        * saber si plouria.
        *
        * Ara mana la pregunta que porta el lector aquí:
        *
        *   1. Quant fa ara            → Current
        *   2. Què vol dir             → Headline
        *   3. Què passarà aviat       → NextHours, 7 dies, meteograma, taula
        *   4. La resta                → aire, mar, aigua, comparativa, clima
        *
        * Si algun dia s'hi afegeix un bloc, va al calaix 4 mentre no respongui
        * una pregunta més urgent que les tres primeres.
        */}

      {/*
        * Les pròximes hores, abans que res.
        *
        * L'ordre d'aquesta pàgina havia anat creixent per acumulació, i acabava
        * posant la qualitat de l'aire —sis contaminants, la tira del dia i el
        * pol·len— entre el termòmetre i la predicció. O sigui: allò que ve a
        * mirar gairebé tothom quedava sota una pantalla de dades secundàries.
        *
        * Aquesta tira respon «què passarà d'aquí a tres hores» d'un cop d'ull.
        * El meteograma i la taula es queden, més avall: serveixen per veure
        * relacions i per buscar un valor, que són preguntes diferents.
        */}
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
            La porta al radar del seu tros, que no existia.

            Des d'una fitxa l'única manera d'arribar-hi era el menú, que obre
            Catalunya sencera; des d'allà calia endevinar en quina de les sis
            zones cau el teu poble. I la pregunta que porta algú al radar des
            d'aquí no és «on plou» en general: és si allò que ve li tocarà.

            No hi ha zoom més enllà d'aquestes zones i no n'hi pot haver: la
            imatge de radar té un píxel cada 457 m, que ja és més fi que la
            pròpia mesura, i una comarca sencera hi són seixanta-sis píxels.
            El que canvia és **on** es mira, no com de prop.
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
        Cap on va la pluja, i només quan n'hi ha.

        Va aquí, just després de les hores i abans dels dies: la pregunta que
        contesta —«això que ve, em tocarà?»— es fa mirant les pròximes hores,
        no la setmana. I la porta és la predicció d'aquest punt, no el radar:
        un eco a cent quilòmetres que se'n va cap a França no fa que aquesta
        fitxa hagi d'ensenyar cap mapa. Ver `localRainFor()`.
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

      {/*
        * Les mateixes 48 hores, com a dibuix o com a xifres.
        *
        * Estaven en dos blocs seguits —el gràfic, els pròxims dies, i després
        * la taula— i eren la mateixa predicció dues vegades: temperatura, pluja
        * i vent al gràfic, i temperatura, pluja i vent a la taula. Es notava, i
        * amb raó.
        *
        * Cadascun té el seu motiu, així que no en sobra cap: el gràfic ensenya
        * la forma i el marge de desacord entre models; la taula ensenya el que
        * el gràfic no pot dir —sensació, humitat, UV, neu— hora per hora. El
        * que sobrava era llegir-los un darrere l'altre.
        *
        * Les pestanyes són dos radios i dos panells amb `:checked`, com les de
        * `NextHours`. Els panells han de ser `section` i la barra un `div`:
        * `nth-of-type` compta per etiqueta i no per classe, i barrejar-los
        * corre tots els índexs — ja va passar.
        */}
      {forecast && forecast.hourly.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="card-title">Pròximes 48 hores</h2>
            <p className="text-xs text-[var(--muted)]">
              {forecast.nModels > 1
                ? `Consens de ${forecast.nModels} models de predicció`
                : 'Un sol model de predicció'}
              {forecast.altitudeCorrectionM != null &&
                ` · corregit ${signed(forecast.altitudeCorrectionM, 0, 'm')} d'altitud`}
            </p>
          </div>

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
              {/* La franja de desacord del gràfic és correcta i ningú la sap
                  llegir. El que cal saber és fins quin dia es pot confiar en el
                  número, i això és una frase, no una àrea ombrejada. */}
              {narrative?.uncertainty && (
                <p className="mt-2 measure text-xs leading-relaxed text-[var(--muted)]">
                  {narrative.uncertainty}
                </p>
              )}
            </section>

            <section className="panel scroll-x">
              <HourlyTable hourly={forecast.hourly} hours={48} today={today} />
            </section>
          </div>
        </section>
      )}

      {forecast && forecast.daily.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">Els pròxims dies</h2>
          <DailyStrip daily={forecast.daily} today={today} />
        </section>
      )}


      {(air || airStation) && (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="card-title">Qualitat de l&apos;aire</h2>
            {air && (
              <p className="text-xs text-[var(--muted)]">Model CAMS · cel·la de {air.cellKm} km</p>
            )}
          </div>
          {air && <AirQuality air={air} today={today} />}
          {/* La medida real debajo del modelo, y diciendo que es de ayer. */}
          {airStation && <MeasuredAir station={airStation} />}
        </section>
      )}


      {sea && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">El mar</h2>
          <SeaBlock sea={sea} nom={loc.nom} />
        </section>
      )}

      {water && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">Aigua</h2>
          <WaterBlock water={water} nom={loc.nom} />
        </section>
      )}

      {routes.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">
            Itineraris senyalitzats {deComarca(comarca.nom)}
          </h2>
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
        </section>
      )}

      {comparison && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">
            Com queda dins {deComarca(comparison.comarca.nom)}
          </h2>
          <ComarcaCompare cmp={comparison} nom={loc.nom} />
        </section>
      )}

      {astro && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">Sol i lluna</h2>
          <SunMoon astro={astro} />
        </section>
      )}

      {resort && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">
            {resort.resort.name}, l’estació d’esquí més propera
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

      <section className="mt-8">
        <h2 className="mb-2 card-title">
          Per què el temps {aName(loc.nom)} és diferent
        </h2>
        <p className="measure leading-relaxed text-[var(--ink-2)]">{description}</p>
      </section>

      {/*
        L'aigua acumulada. Surt de la mateixa sèrie diària que el bloc de clima,
        que la fitxa ja s'ha baixat: no costa cap petició ni cap byte de més.
      */}
      {rain && current && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">
            L&apos;aigua que ha caigut
          </h2>
          <RainBlock
            conditions={rain}
            station={current.station}
            stationHref={`/estacions/${current.station.codi}`}
            ytd={history?.rainProgress}
          />
        </section>
      )}

      {history && current && (
        <section className="mt-8">
          <h2 className="mb-3 card-title">Clima i rècords</h2>
          <ClimateBlock
            history={history}
            station={current.station}
            month={Number(today.slice(5, 7))}
            today={today}
            stationHref={`/estacions/${current.station.codi}`}
          />
        </section>
      )}

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

      {forecast && !forecast.skillWeighted && (
        <p className="mt-10 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
          Els models pesen igual en aquest consens: cap no compta més que un
          altre pel que hagi encertat abans.
        </p>
      )}
    </article>
  );
}
