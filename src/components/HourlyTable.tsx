import { WeatherIcon } from './WeatherIcon';
import { temperatureColor, temperatureInk, precipitationColor } from '@/lib/scales';
import { msToKmh, windCardinal } from '@/lib/variables';
import { weatherCode } from '@/lib/weather-codes';
import type { HourlyPoint } from '@/lib/weather';

/**
 * Tabla horaria detallada.
 *
 * Es una `<table>` semántica de verdad, no una rejilla de divs, por tres
 * razones: un lector de pantalla la puede recorrer por filas y columnas, el
 * crawler la entiende como datos estructurados —y puede acabar en un fragmento
 * destacado—, y el usuario puede copiarla y pegarla en una hoja de cálculo.
 *
 * Va plegada por defecto: el 90 % del tráfico mira si lloverá y se va, y no
 * debe pagar el desplazamiento de 48 filas para llegar al resto de la página.
 */

interface Props {
  hourly: HourlyPoint[];
  hours?: number;
  /** Abierta de entrada en las páginas donde el detalle es el motivo de la visita. */
  open?: boolean;
}

function hourLabel(iso: string): string {
  return iso.slice(11, 16);
}

function dayLabel(iso: string): string {
  return new Date(`${iso}:00`).toLocaleDateString('ca-ES', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
}

export function HourlyTable({ hourly, hours = 48, open = false }: Props) {
  const data = hourly.slice(0, hours);
  if (!data.length) return null;

  // Agrupar por día para intercalar cabeceras legibles.
  const days = new Map<string, HourlyPoint[]>();
  for (const h of data) {
    const d = h.time.slice(0, 10);
    const arr = days.get(d) ?? [];
    arr.push(h);
    days.set(d, arr);
  }

  const hasUv = data.some((h) => h.uvIndex != null);
  const hasSnow = data.some((h) => (h.snowfall ?? 0) > 0);

  return (
    <details open={open} className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)]">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-[var(--ink)] hover:bg-[var(--surface-2)]">
        Detall hora a hora · {data.length} hores
      </summary>

      <div className="scroll-x border-t border-[var(--line-soft)]">
        <table className="w-full border-collapse text-sm">
          <caption className="sr-only">
            Predicció hora a hora: temperatura, precipitació, vent i cel
          </caption>
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
              <th scope="col" className="sticky left-0 z-10 bg-[var(--surface-2)] px-3 py-2 font-semibold">Hora</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Cel</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Temp.</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Sens.</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Precip.</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Prob.</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Vent</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Ratxa</th>
              <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">HR</th>
              {hasUv && <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">UV</th>}
              {hasSnow && <th scope="col" className="bg-[var(--surface-2)] px-2 py-2 font-semibold">Neu</th>}
            </tr>
          </thead>

          {[...days].map(([day, hs]) => (
            <tbody key={day}>
              <tr>
                <th
                  scope="colgroup"
                  colSpan={hasUv && hasSnow ? 11 : hasUv || hasSnow ? 10 : 9}
                  className="border-y border-[var(--line-soft)] bg-[var(--surface-2)] px-3 py-1.5 text-left text-xs font-semibold text-[var(--ink-2)]"
                >
                  {dayLabel(hs[0].time)}
                </th>
              </tr>
              {hs.map((h) => {
                const w = weatherCode(h.weatherCode);
                return (
                  <tr key={h.time} className="border-b border-[var(--line-soft)] last:border-0">
                    <th scope="row" className="tnum sticky left-0 z-10 bg-[var(--surface)] px-3 py-1.5 text-left font-medium text-[var(--ink-2)]">
                      {hourLabel(h.time)}
                    </th>
                    <td className="px-2 py-1.5">
                      <span className="flex items-center gap-1.5">
                        <WeatherIcon code={h.weatherCode} isDay={h.isDay} size={22} />
                        <span className="hidden text-xs text-[var(--muted)] sm:inline">{w.ca}</span>
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      {h.temperature != null && (
                        <span
                          className="tnum inline-block rounded px-1.5 py-0.5 text-xs font-semibold"
                          style={{ background: temperatureColor(h.temperature), color: temperatureInk(h.temperature) }}
                        >
                          {h.temperature.toFixed(0)}°
                        </span>
                      )}
                    </td>
                    <td className="tnum px-2 py-1.5 text-[var(--muted)]">
                      {h.apparent != null ? `${h.apparent.toFixed(0)}°` : '—'}
                    </td>
                    <td className="tnum px-2 py-1.5">
                      {h.precipitation ? (
                        <span
                          className="inline-block rounded px-1.5 py-0.5 text-xs font-medium"
                          style={{ background: precipitationColor(h.precipitation), color: 'oklch(20% 0.02 245)' }}
                        >
                          {h.precipitation.toFixed(1)}
                        </span>
                      ) : <span className="text-[var(--line)]">—</span>}
                    </td>
                    <td className="tnum px-2 py-1.5 text-[var(--ink-2)]">
                      {h.precipProbability != null && h.precipProbability > 0 ? `${h.precipProbability} %` : '—'}
                    </td>
                    <td className="tnum px-2 py-1.5 text-[var(--ink-2)]">
                      {h.windSpeed != null ? `${msToKmh(h.windSpeed).toFixed(0)}` : '—'}
                      {h.windDirection != null && <span className="ml-1 text-xs text-[var(--muted)]">{windCardinal(h.windDirection)}</span>}
                    </td>
                    <td className="tnum px-2 py-1.5 text-[var(--ink-2)]">
                      {h.windGust != null ? (
                        <span style={msToKmh(h.windGust) >= 60 ? { color: 'var(--bad)', fontWeight: 600 } : undefined}>
                          {msToKmh(h.windGust).toFixed(0)}
                        </span>
                      ) : '—'}
                    </td>
                    <td className="tnum px-2 py-1.5 text-[var(--muted)]">
                      {h.humidity != null ? `${h.humidity} %` : '—'}
                    </td>
                    {hasUv && (
                      <td className="tnum px-2 py-1.5">
                        {h.uvIndex != null && h.uvIndex > 0 ? (
                          <span style={h.uvIndex >= 8 ? { color: 'var(--bad)', fontWeight: 600 } : h.uvIndex >= 6 ? { color: 'var(--warn)', fontWeight: 600 } : undefined}>
                            {h.uvIndex}
                          </span>
                        ) : <span className="text-[var(--line)]">—</span>}
                      </td>
                    )}
                    {hasSnow && (
                      <td className="tnum px-2 py-1.5 text-[var(--ink-2)]">
                        {h.snowfall ? `${h.snowfall.toFixed(1)} cm` : <span className="text-[var(--line)]">—</span>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          ))}
        </table>
      </div>

      <p className="border-t border-[var(--line-soft)] px-4 py-2 text-xs text-[var(--muted)]">
        Vent i ratxa en km/h. La probabilitat és la del model, no el percentatge
        de models que preveuen pluja.
      </p>
    </details>
  );
}
