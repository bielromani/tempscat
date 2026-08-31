import Link from 'next/link';
import { Meteogram } from './Meteogram';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import type { CurrentConditions, LocationForecast } from '@/lib/weather';
import type { Comarca, Location } from '@/lib/territory';

/**
 * Página de ubicación: la plantilla que sirve a 4.293 rutas.
 *
 * Orden deliberado — la respuesta arriba, la profundidad debajo. El 90 % del
 * tráfico entra desde Google, mira si lloverá y se va; no debe pagar el coste
 * de lo que no usa. Nada de lo que hay aquí se hidrata en cliente.
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

function Current({ current, loc }: { current: CurrentConditions; loc: Location }) {
  const t = current.temperatureAdjusted;
  const corrected = current.station.dAltM != null && Math.abs(current.station.dAltM) >= 25;

  /*
   * El panel se pinta con la escala de temperatura, así que **todo** el texto
   * de dentro deriva su color de esa misma temperatura, no de los tokens del
   * tema. Mezclarlos fue un error real: en modo oscuro los tokens dan gris
   * claro, y sobre un fondo cálido claro las etiquetas desaparecían.
   *
   * Con la tinta derivada del dato, el panel es legible a −10 °C y a 40 °C, y
   * en los dos temas, porque no depende de ninguno.
   */
  const ink = t != null ? temperatureInk(t) : 'var(--ink)';
  const inkSoft = t != null ? { color: ink, opacity: 0.72 } : { color: 'var(--muted)' };
  const inkFaint = t != null ? { color: ink, opacity: 0.62 } : { color: 'var(--muted)' };

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
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <div>
          <div className="flex items-baseline gap-3">
            <span className="tnum text-6xl font-semibold tracking-tight sm:text-7xl" style={{ color: ink }}>
              {t != null ? t.toFixed(1).replace('.', ',') : '—'}
            </span>
            <span className="text-2xl" style={inkSoft}>°C</span>
          </div>
          {current.apparent != null && Math.abs(current.apparent - (t ?? 0)) >= 1 && (
            <p className="mt-1 text-sm" style={inkSoft}>
              Sensació de {current.apparent.toFixed(0)} °C
            </p>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-3">
          {current.windSpeed != null && (
            <div>
              <dt style={inkFaint}>Vent</dt>
              <dd className="tnum font-medium" style={{ color: ink }}>
                {msToKmh(current.windSpeed).toFixed(0)} km/h
                {current.windDirection != null && ` ${windCardinal(current.windDirection)}`}
              </dd>
            </div>
          )}
          {current.humidity != null && (
            <div>
              <dt style={inkFaint}>Humitat</dt>
              <dd className="tnum font-medium" style={{ color: ink }}>{current.humidity.toFixed(0)} %</dd>
            </div>
          )}
          {current.precip24h != null && (
            <div>
              <dt style={inkFaint}>Pluja 24 h</dt>
              <dd className="tnum font-medium" style={{ color: ink }}>
                {current.precip24h.toFixed(1).replace('.', ',')} mm
              </dd>
            </div>
          )}
          {current.pressure != null && (
            <div>
              <dt style={inkFaint}>Pressió</dt>
              <dd className="tnum font-medium" style={{ color: ink }}>{current.pressure.toFixed(0)} hPa</dd>
            </div>
          )}
          {current.windGust != null && current.windGust > (current.windSpeed ?? 0) * 1.4 && (
            <div>
              <dt style={inkFaint}>Ratxa</dt>
              <dd className="tnum font-medium" style={{ color: ink }}>{msToKmh(current.windGust).toFixed(0)} km/h</dd>
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
      <p className="mt-3 text-xs leading-relaxed" style={inkFaint}>
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
            <li
              key={d.date}
              className="w-[92px] shrink-0 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] p-2.5 text-center"
            >
              <p className="text-xs font-semibold uppercase tracking-wide text-[var(--ink-2)]">
                {i === 0 ? 'Avui' : i === 1 ? 'Demà' : date.toLocaleDateString('ca-ES', { weekday: 'short' })}
              </p>
              <p className="tnum text-[11px] text-[var(--muted)]">
                {date.toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' })}
              </p>

              {/* Barra de rango térmico: comunica de un vistazo si el día es
                  suave o de gran oscilación, que un par de números no dice. */}
              <div className="relative mx-auto my-2 h-16 w-2 rounded-full bg-[var(--surface-2)]">
                <div
                  className="absolute inset-x-0 rounded-full"
                  style={{
                    top: `${barTop}%`,
                    bottom: `${barBottom}%`,
                    background: d.tMax != null && d.tMin != null
                      ? `linear-gradient(to bottom, ${temperatureColor(d.tMax)}, ${temperatureColor(d.tMin)})`
                      : 'var(--line)',
                  }}
                />
              </div>

              <p className="tnum text-sm font-semibold text-[var(--ink)]">
                {d.tMax != null ? `${d.tMax.toFixed(0)}°` : '—'}
              </p>
              <p className="tnum text-sm text-[var(--muted)]">
                {d.tMin != null ? `${d.tMin.toFixed(0)}°` : '—'}
              </p>

              {d.precipitation > 0 ? (
                <p className="tnum mt-1.5 text-[11px] font-medium" style={{ color: 'oklch(52% 0.13 245)' }}>
                  {d.precipitation.toFixed(1).replace('.', ',')} mm
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-[var(--line)]">—</p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

interface Props {
  loc: Location;
  comarca: Comarca;
  breadcrumbs: Array<{ nom: string; path: string }>;
  current: CurrentConditions | null;
  forecast: LocationForecast | null;
  siblings: Location[];
  siblingsLabel: string;
  neighbours: Array<{ location: Location; distKm: number }>;
  neighboursLabel: string;
  description: string;
}

export function LocationView({
  loc, comarca, breadcrumbs, current, forecast,
  siblings, siblingsLabel, neighbours, neighboursLabel, description,
}: Props) {
  return (
    <article>
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

      {current
        ? <Current current={current} loc={loc} />
        : (
          <section className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5 text-sm text-[var(--muted)]">
            Encara no hi ha observació disponible per a aquest punt.
          </section>
        )}

      {forecast && forecast.hourly.length > 0 && (
        <section className="mt-8">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-semibold tracking-tight">Pròximes 48 hores</h2>
            <p className="text-xs text-[var(--muted)]">
              {forecast.nModels > 1
                ? `Consens de ${forecast.nModels} models`
                : 'Un sol model'}
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

      <section className="mt-8">
        <h2 className="mb-2 text-lg font-semibold tracking-tight">
          Per què el temps a {loc.nom} és diferent
        </h2>
        <p className="max-w-[65ch] leading-relaxed text-[var(--ink-2)]">{description}</p>
      </section>

      {siblings.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{siblingsLabel}</h2>
          <ul className="flex flex-wrap gap-2">
            {siblings.map((s) => (
              <li key={s.id}>
                <Link
                  href={s.path}
                  className="inline-flex items-baseline gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm no-underline text-[var(--ink)] hover:border-[var(--accent)]"
                >
                  {s.nom}
                  {s.altitud != null && <span className="tnum text-xs text-[var(--muted)]">{s.altitud} m</span>}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {neighbours.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-lg font-semibold tracking-tight">{neighboursLabel}</h2>
          <ul className="flex flex-wrap gap-2">
            {neighbours.map((n) => (
              <li key={n.location.id}>
                <Link
                  href={n.location.path}
                  className="inline-flex items-baseline gap-2 rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-1.5 text-sm no-underline text-[var(--ink)] hover:border-[var(--accent)]"
                >
                  {n.location.nom}
                  <span className="tnum text-xs text-[var(--muted)]">{n.distKm.toFixed(0)} km</span>
                </Link>
              </li>
            ))}
          </ul>
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
