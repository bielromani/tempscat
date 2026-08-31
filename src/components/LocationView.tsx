import Link from 'next/link';
import { Meteogram } from './Meteogram';
import { WeatherIcon, WeatherIconSprite } from './WeatherIcon';
import { WarningBanner } from './WarningBanner';
import { HourlyTable } from './HourlyTable';
import { SunMoon } from './SunMoon';
import { ClimateBlock } from './ClimateBlock';
import { AirQuality } from './AirQuality';
import { ComarcaCompare } from './ComarcaCompare';
import { Headline } from './Headline';
import { WaterBlock } from './WaterBlock';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import { weatherCode } from '@/lib/weather-codes';
import {
  aName, ago, comarcaName, dateTiny, deComarca, deName, int, num, relativeDayTiny,
  signed, tempTiny,
} from '@/lib/format';
import { localNowHour, localToday } from '@/lib/weather';
import type {
  AirQuality as AirQualityData, Astronomy, CurrentConditions, LocationForecast,
  StationHistory, Warning,
} from '@/lib/weather';
import type { ComarcaComparison } from '@/lib/comparison';
import type { Narrative } from '@/lib/narrative';
import type { WaterNearby } from '@/lib/water';
import type { Comarca, Location } from '@/lib/territory';

/**
 * Página de ubicación: la plantilla que sirve a 4.293 rutas.
 *
 * Orden deliberado — la respuesta primero, la profundidad después. El 90 % del
 * tráfico entra desde Google, mira si lloverá y se va; no debe pagar el coste
 * de lo que no usa. Todo lo caro va plegado, y nada de esto se hidrata en
 * cliente: no hay una sola línea de JavaScript en la página.
 */

function Breadcrumbs({ items }: { items: Array<{ nom: string; path: string }> }) {
  return (
    <nav aria-label="Ruta de navegació" className="mb-5 text-sm text-[var(--muted)]">
      <ol className="flex flex-wrap items-center gap-1.5">
        {items.map((it, i) => (
          <li key={it.path} className="flex items-center gap-1.5">
            {i > 0 && <span aria-hidden className="text-[var(--line)]">›</span>}
            {i === items.length - 1 ? (
              <span className="text-[var(--ink-2)]">{it.nom}</span>
            ) : (
              <Link href={it.path} className="no-underline hover:text-[var(--ink)]">{it.nom}</Link>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

/** Descripción del índice UV con el consejo que le corresponde. */
function uvAdvice(uv: number): { label: string; color: string } {
  if (uv >= 11) return { label: 'extrem', color: 'var(--cap-red)' };
  if (uv >= 8) return { label: 'molt alt', color: 'var(--cap-red)' };
  if (uv >= 6) return { label: 'alt', color: 'var(--cap-orange)' };
  if (uv >= 3) return { label: 'moderat', color: 'var(--cap-yellow)' };
  return { label: 'baix', color: 'var(--good)' };
}

function Current({
  current, loc, nowHour,
}: {
  current: CurrentConditions;
  loc: Location;
  nowHour: LocationForecast['hourly'][number] | null;
}) {
  const t = current.temperatureAdjusted;
  const corrected = current.station.dAltM != null && Math.abs(current.station.dAltM) >= 25;

  /*
   * El panel se pinta con la escala de temperatura, así que **todo** el texto
   * de dentro deriva su color de esa misma temperatura, no de los tokens del
   * tema. Mezclarlos fue un error real: en modo oscuro los tokens dan gris
   * claro, y sobre un fondo cálido claro las etiquetas desaparecían.
   */
  const ink = t != null ? temperatureInk(t) : 'var(--ink)';
  const soft = t != null ? { color: ink, opacity: 0.72 } : { color: 'var(--muted)' };
  const faint = t != null ? { color: ink, opacity: 0.62 } : { color: 'var(--muted)' };

  const code = nowHour?.weatherCode ?? null;
  const sky = weatherCode(code);

  const rows: Array<{ k: string; v: string; extra?: string }> = [];
  if (current.windSpeed != null) {
    rows.push({
      k: 'Vent',
      v: `${msToKmh(current.windSpeed).toFixed(0)} km/h`,
      extra: current.windDirection != null ? windCardinal(current.windDirection) : undefined,
    });
  }
  if (current.windGust != null && current.windGust > (current.windSpeed ?? 0) * 1.4) {
    rows.push({ k: 'Ratxa', v: `${msToKmh(current.windGust).toFixed(0)} km/h` });
  }
  if (current.humidity != null) rows.push({ k: 'Humitat', v: `${Math.round(current.humidity)} %` });
  if (nowHour?.dewPoint != null) rows.push({ k: 'Punt de rosada', v: `${nowHour.dewPoint.toFixed(0)} °C` });
  if (current.precip24h != null) rows.push({ k: 'Pluja 24 h', v: `${num(current.precip24h, 1)} mm` });
  if (current.pressure != null) rows.push({ k: 'Pressió', v: `${current.pressure.toFixed(0)} hPa` });
  if (nowHour?.cloudCover != null) rows.push({ k: 'Nuvolositat', v: `${nowHour.cloudCover} %` });
  if (nowHour?.visibility != null && nowHour.visibility < 20000) {
    rows.push({ k: 'Visibilitat', v: `${(nowHour.visibility / 1000).toFixed(0)} km` });
  }

  return (
    <section
      className="rounded-lg border p-5 sm:p-6"
      style={{
        background: t != null
          ? `linear-gradient(135deg, ${temperatureColor(t)} 0%, ${temperatureColor(t - 3)} 100%)`
          : 'var(--surface)',
        borderColor: t != null ? 'transparent' : 'var(--line-soft)',
        color: ink,
      }}
    >
      <div className="flex flex-wrap items-start gap-x-8 gap-y-4">
        <div className="flex items-start gap-3">
          {code != null && <WeatherIcon code={code} isDay={nowHour?.isDay ?? true} size={54} />}
          <div>
            <div className="flex items-baseline gap-2">
              <span className="tnum text-6xl font-semibold tracking-tight sm:text-7xl" style={{ color: ink }}>
                {num(t, 1)}
              </span>
              <span className="text-2xl" style={soft}>°C</span>
            </div>
            {code != null && <p className="mt-0.5 text-sm font-medium" style={soft}>{sky.caLong}</p>}
            {current.apparent != null && Math.abs(current.apparent - (t ?? 0)) >= 1 && (
              <p className="text-sm" style={soft}>Sensació de {current.apparent.toFixed(0)} °C</p>
            )}
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {rows.map((r) => (
            <div key={r.k}>
              <dt style={faint}>{r.k}</dt>
              <dd className="tnum font-medium" style={{ color: ink }}>
                {r.v}{r.extra && <span className="ml-1 font-normal" style={soft}>{r.extra}</span>}
              </dd>
            </div>
          ))}
          {nowHour?.uvIndex != null && nowHour.uvIndex > 0 && (
            <div>
              <dt style={faint}>Índex UV</dt>
              <dd className="tnum font-medium" style={{ color: ink }}>
                {nowHour.uvIndex}
                <span className="ml-1 font-normal" style={soft}>{uvAdvice(nowHour.uvIndex).label}</span>
              </dd>
            </div>
          )}
        </dl>
      </div>

      {/*
        Honestidad radical sobre la procedencia. Cumple la licencia CC-BY y, más
        importante, es lo que ningún competidor hace: decir exactamente de qué
        estación viene el número, a qué distancia y con cuánto desnivel.
      */}
      <hr className="mt-5 border-0 border-t" style={{ borderColor: ink, opacity: 0.18 }} />
      <p className="mt-3 text-xs leading-relaxed" style={faint}>
        Dada de l&apos;estació{' '}
        {/* Enlace a la ficha de la estación: es donde están sus récords y su rosa
            de vientos, y hasta ahora no había forma de llegar. */}
        <Link
          href={`/estacions/${current.station.codi}`}
          className="font-medium underline decoration-1 underline-offset-2"
          style={{ color: ink, opacity: 0.9 }}
        >
          {deName(current.station.nom)}
        </Link>,
        a {num(current.station.distKm, 1)} km
        {current.station.dAltM != null && ` i ${signed(current.station.dAltM, 0, 'm')} de desnivell`}
        {' · '}{ago(current.ageMin)}
        {current.provisional && ' · lectura provisional, pendent de validació del Meteocat'}
        {' · '}{current.source}
        {corrected && current.temperature != null && (
          <>
            <br />
            Temperatura corregida pel desnivell: l&apos;estació marca {num(current.temperature, 1)} °C
            a {loc.altitud != null && current.station.dAltM != null ? loc.altitud - current.station.dAltM : '?'} m.
          </>
        )}
      </p>
    </section>
  );
}

function DailyStrip({ daily, today }: { daily: LocationForecast['daily']; today: string }) {
  const all = daily.flatMap((d) => [d.tMax, d.tMin]).filter((v): v is number => v != null);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(1, hi - lo);

  return (
    <div className="scroll-x">
      <ol className="flex min-w-max gap-2">
        {daily.map((d) => {
          const barTop = d.tMax != null ? ((hi - d.tMax) / span) * 100 : 0;
          const barBottom = d.tMin != null ? ((d.tMin - lo) / span) * 100 : 0;
          return (
            <li key={d.date}
              className="w-[110px] shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] p-2.5 text-center">
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
                    {d.precipitation > 0 ? `${num(d.precipitation, 1)} mm` : ''}
                    {d.precipProbability > 0 && (
                      <span className={d.precipitation > 0 ? 'ml-1 opacity-75' : ''}>{d.precipProbability} %</span>
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
          );
        })}
      </ol>
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
  warnings: Warning[];
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
}

export function LocationView({
  loc, comarca, breadcrumbs, current, forecast, warnings, astro, history,
  siblings, siblingsLabel, neighbours, neighboursLabel, description,
  air, comparison, narrative, water,
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
  // La comarca se nombra con su artículo: és «l'Alt Camp», no «Alt Camp».
  const comarcaLabel = comarcaName(comarca.nom);
  const nowHour = forecast?.hourly.find((h) => h.time.slice(0, 13) === nowIso) ?? forecast?.hourly[0] ?? null;

  return (
    <article>
      {/* El sprite va una sola vez; los 48 iconos de la tabla horaria lo
          referencian con <use> en vez de repetir el dibujo entero. */}
      <WeatherIconSprite />
      <Breadcrumbs items={breadcrumbs} />

      <header className="mb-5">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{loc.nom}</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          {loc.level !== 'municipi' && breadcrumbs.length > 2 && `${breadcrumbs[breadcrumbs.length - 2].nom} · `}
          {comarcaLabel}
          {loc.altitud != null && ` · ${loc.altitud} m`}
          {loc.poblacio != null && loc.poblacio > 0 && ` · ${loc.poblacio.toLocaleString('ca-ES')} hab.`}
        </p>
      </header>

      <WarningBanner warnings={warnings} />

      {current ? (
        <Current current={current} loc={loc} nowHour={nowHour} />
      ) : (
        <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
          Encara no hi ha observació disponible per a aquest punt.
        </section>
      )}

      {/* La interpretación va inmediatamente después del número grande: el
          termómetro es el gancho y la frase es la respuesta. */}
      {narrative && <Headline narrative={narrative} />}

      {forecast && forecast.hourly.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Pròximes 48 hores</h2>
            <p className="text-xs text-[var(--muted)]">
              {forecast.nModels > 1
                ? `Consens de ${forecast.nModels} models de predicció`
                : 'Un sol model de predicció'}
              {forecast.altitudeCorrectionM != null &&
                ` · corregit ${signed(forecast.altitudeCorrectionM, 0, 'm')} d'altitud`}
            </p>
          </div>
          <Meteogram hourly={forecast.hourly} hours={48} showSpread={forecast.nModels > 1} nowHour={nowIso} />
          {/* La franja de desacuerdo del gráfico es correcta y nadie la sabe
              leer. Lo que hace falta saber es hasta qué día se puede confiar en
              el número, y eso es una frase, no un área sombreada. */}
          {narrative?.uncertainty && (
            <p className="mt-2 max-w-[70ch] text-xs leading-relaxed text-[var(--muted)]">
              {narrative.uncertainty}
            </p>
          )}
        </section>
      )}

      {forecast && forecast.daily.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">7 dies</h2>
          <DailyStrip daily={forecast.daily} today={today} />
        </section>
      )}

      {forecast && forecast.hourly.length > 0 && (
        <section className="mt-6">
          <HourlyTable hourly={forecast.hourly} hours={48} today={today} />
        </section>
      )}

      {air && (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Qualitat de l&apos;aire</h2>
            <p className="text-xs text-[var(--muted)]">Model CAMS · cel·la de {air.cellKm} km</p>
          </div>
          <AirQuality air={air} today={today} />
        </section>
      )}

      {water && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Aigua</h2>
          <WaterBlock water={water} nom={loc.nom} />
        </section>
      )}

      {comparison && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">
            Com queda dins {deComarca(comparison.comarca.nom)}
          </h2>
          <ComarcaCompare cmp={comparison} nom={loc.nom} />
        </section>
      )}

      {astro && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Sol i lluna</h2>
          <SunMoon astro={astro} />
        </section>
      )}

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold tracking-tight">
          Per què el temps {aName(loc.nom)} és diferent
        </h2>
        <p className="max-w-[65ch] leading-relaxed text-[var(--ink-2)]">{description}</p>
      </section>

      {history && current && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Clima i rècords</h2>
          <ClimateBlock
            history={history}
            station={current.station}
            month={Number(today.slice(5, 7))}
            stationHref={`/estacions/${current.station.codi}`}
          />
        </section>
      )}

      {siblings.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{siblingsLabel}</h2>
          <LinkChips items={siblings.map((s) => ({
            href: s.path, label: s.nom, note: s.altitud != null ? `${s.altitud} m` : undefined,
          }))} />
        </section>
      )}

      {neighbours.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{neighboursLabel}</h2>
          <LinkChips items={neighbours.map((n) => ({
            href: n.location.path, label: n.location.nom, note: `${n.distKm.toFixed(0)} km`,
          }))} />
        </section>
      )}

      {forecast && !forecast.skillWeighted && (
        <p className="mt-10 rounded-md border border-[var(--line-soft)] bg-[var(--surface-2)] px-4 py-3 text-xs leading-relaxed text-[var(--muted)]">
          Els models pesen igual en aquest consens. La ponderació per encert
          verificat contra les estacions de la XEMA encara no està activa: cal
          acumular històric per calcular-la, i fins llavors seria deshonest
          prometre-la.
        </p>
      )}
    </article>
  );
}
