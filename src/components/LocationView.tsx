import Link from 'next/link';
import { Meteogram } from './Meteogram';
import { WeatherIcon, WeatherIconSprite } from './WeatherIcon';
import { WarningBanner } from './WarningBanner';
import { HourlyTable } from './HourlyTable';
import { SunMoon } from './SunMoon';
import { ClimateBlock } from './ClimateBlock';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import { weatherCode } from '@/lib/weather-codes';
import type { Astronomy, CurrentConditions, LocationForecast, StationHistory, Warning } from '@/lib/weather';
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

function relativeTime(minutes: number): string {
  if (minutes < 1) return 'ara mateix';
  if (minutes < 60) return `fa ${minutes} min`;
  const h = Math.floor(minutes / 60);
  return h === 1 ? 'fa 1 hora' : `fa ${h} hores`;
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
  if (current.humidity != null) rows.push({ k: 'Humitat', v: `${current.humidity.toFixed(0)} %` });
  if (nowHour?.dewPoint != null) rows.push({ k: 'Punt de rosada', v: `${nowHour.dewPoint.toFixed(0)} °C` });
  if (current.precip24h != null) rows.push({ k: 'Pluja 24 h', v: `${current.precip24h.toFixed(1).replace('.', ',')} mm` });
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
                {t != null ? t.toFixed(1).replace('.', ',') : '—'}
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
        Dada de l&apos;estació de <strong className="font-medium" style={{ color: ink, opacity: 0.9 }}>{current.station.nom}</strong>,
        a {current.station.distKm.toFixed(1).replace('.', ',')} km
        {current.station.dAltM != null && ` i ${current.station.dAltM > 0 ? '+' : '−'}${Math.abs(current.station.dAltM)} m de desnivell`}
        {' · '}{relativeTime(current.ageMin)}
        {current.provisional && ' · lectura provisional, pendent de validació del Meteocat'}
        {' · '}{current.source}
        {corrected && current.temperature != null && (
          <>
            <br />
            Temperatura corregida pel desnivell: l&apos;estació marca {current.temperature.toFixed(1).replace('.', ',')} °C
            a {loc.altitud != null && current.station.dAltM != null ? loc.altitud - current.station.dAltM : '?'} m.
          </>
        )}
      </p>
    </section>
  );
}

function DailyStrip({ daily }: { daily: LocationForecast['daily'] }) {
  const all = daily.flatMap((d) => [d.tMax, d.tMin]).filter((v): v is number => v != null);
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const span = Math.max(1, hi - lo);

  return (
    <div className="scroll-x">
      <ol className="flex min-w-max gap-2">
        {daily.map((d, i) => {
          const date = new Date(`${d.date}T12:00:00`);
          const barTop = d.tMax != null ? ((hi - d.tMax) / span) * 100 : 0;
          const barBottom = d.tMin != null ? ((d.tMin - lo) / span) * 100 : 0;
          return (
            <li key={d.date}
              className="w-[110px] shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] p-2.5 text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">
                {i === 0 ? 'Avui' : i === 1 ? 'Demà' : date.toLocaleDateString('ca-ES', { weekday: 'short' })}
              </p>
              <p className="tnum text-[11px] text-[var(--muted)]">
                {date.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
              </p>

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
                  <p className="tnum text-sm font-semibold text-[var(--ink)]">{d.tMax != null ? `${d.tMax.toFixed(0)}°` : '—'}</p>
                  <p className="tnum text-sm text-[var(--muted)]">{d.tMin != null ? `${d.tMin.toFixed(0)}°` : '—'}</p>
                </div>
              </div>

              <div className="mt-1.5 space-y-0.5 text-[11px]">
                {d.precipitation > 0 || d.precipProbability >= 20 ? (
                  <p className="tnum font-medium" style={{ color: 'oklch(52% 0.13 245)' }}>
                    {d.precipitation > 0 ? `${d.precipitation.toFixed(1).replace('.', ',')} mm` : ''}
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
                    cota {d.snowLevel} m
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
}

export function LocationView({
  loc, comarca, breadcrumbs, current, forecast, warnings, astro, history,
  siblings, siblingsLabel, neighbours, neighboursLabel, description,
}: Props) {
  /*
   * La hora en curso dentro de la serie, para completar el bloque actual con
   * las variables que la estación no mide: UV, nubosidad, punto de rocío.
   *
   * El `.replace(' ', 'T')` no es cosmético. `toLocaleString('sv-SE')` devuelve
   * `2026-08-31 10:30:00` con espacio, y la serie de Open-Meteo usa `T`. Sin
   * unificarlos la búsqueda no encontraba nunca la hora y el bloque caía
   * siempre a las 00:00 — que de madrugada tiene UV cero y cielo despejado.
   * El fallo no daba error: daba datos plausibles y equivocados.
   */
  const nowIso = new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 13);
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
          {comarca.nom}
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

      {forecast && forecast.hourly.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Pròximes 48 hores</h2>
            <p className="text-xs text-[var(--muted)]">
              {forecast.nModels > 1 ? `Consens de ${forecast.nModels} models` : 'Un sol model'}
              {forecast.altitudeCorrectionM != null &&
                ` · corregit ${forecast.altitudeCorrectionM > 0 ? '+' : '−'}${Math.abs(forecast.altitudeCorrectionM)} m d'altitud`}
            </p>
          </div>
          <Meteogram hourly={forecast.hourly} hours={48} showSpread={forecast.nModels > 1} />
        </section>
      )}

      {forecast && forecast.daily.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">7 dies</h2>
          <DailyStrip daily={forecast.daily} />
        </section>
      )}

      {forecast && forecast.hourly.length > 0 && (
        <section className="mt-6">
          <HourlyTable hourly={forecast.hourly} hours={48} />
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
          Per què el temps a {loc.nom} és diferent
        </h2>
        <p className="max-w-[65ch] leading-relaxed text-[var(--ink-2)]">{description}</p>
      </section>

      {history && current && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">Clima i rècords</h2>
          <ClimateBlock history={history} station={current.station} month={new Date().getMonth() + 1} />
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
