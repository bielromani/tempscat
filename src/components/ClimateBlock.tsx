import { msToKmh } from '@/lib/variables';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import type { StationHistory } from '@/lib/weather';
import type { StationRef } from '@/lib/territory';

/**
 * Clima, récords y últimos días de la estación de referencia.
 *
 * Es la parte que separa una ficha de lugar de un widget de predicción, y sale
 * entera de la serie diaria de la XEMA: máximas absolutas con su fecha, cuántas
 * noches tropicales llevamos, y cuánto se desvía este mes de lo normal **en ese
 * punto concreto**, no en una media regional.
 *
 * Todo va atribuido a la estación de la que procede, con su distancia y su
 * desnivel: son datos de allí, no de aquí, y decirlo es lo honesto.
 */

const MONTHS = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
];

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' });

function Counter({ label, month, year, hint }: { label: string; month: number; year: number; hint?: string }) {
  return (
    <div className="rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2.5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="tnum mt-0.5">
        <span className="text-xl font-semibold text-[var(--ink)]">{year}</span>
        <span className="ml-1.5 text-xs text-[var(--muted)]">l&apos;any</span>
      </p>
      <p className="tnum text-xs text-[var(--muted)]">{month} aquest mes</p>
      {hint && <p className="mt-1 text-[11px] leading-tight text-[var(--muted)]">{hint}</p>}
    </div>
  );
}

/** Gráfico de barras de los últimos 30 días: temperatura y lluvia. */
function RecentChart({ daily }: { daily: StationHistory['daily'] }) {
  const data = daily.slice(-30).filter((d) => d.tMax != null || d.tMin != null);
  if (data.length < 5) return null;

  const temps = data.flatMap((d) => [d.tMax, d.tMin]).filter((v): v is number => v != null);
  const lo = Math.floor(Math.min(...temps) - 1);
  const hi = Math.ceil(Math.max(...temps) + 1);
  const span = Math.max(1, hi - lo);
  const maxRain = Math.max(1, ...data.map((d) => d.precip ?? 0));

  const W = 700, H = 150, PAD_L = 26, PAD_R = 30, PAD_T = 8, RAIN_H = 34;
  const plotH = H - PAD_T - RAIN_H - 18;
  const step = (W - PAD_L - PAD_R) / data.length;

  return (
    <div className="scroll-x">
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 520 }} role="img"
        aria-label={`Temperatures màximes i mínimes i precipitació dels últims ${data.length} dies`}>
        {[lo, Math.round((lo + hi) / 2), hi].map((t) => {
          const y = PAD_T + plotH - ((t - lo) / span) * plotH;
          return (
            <g key={t}>
              <line x1={PAD_L} x2={W - PAD_R} y1={y} y2={y} stroke="var(--line)" strokeDasharray="2 4" strokeWidth={1} />
              <text x={PAD_L - 5} y={y + 3} fontSize={9} fill="var(--muted)" textAnchor="end" className="tnum">{t}°</text>
            </g>
          );
        })}

        {/* Barra vertical por día: del mínimo al máximo, con el degradado real
            de la escala de temperatura. Comunica la oscilación, que dos líneas
            separadas no dejan ver. */}
        {data.map((d, i) => {
          if (d.tMax == null || d.tMin == null) return null;
          const x = PAD_L + i * step + step / 2;
          const yMax = PAD_T + plotH - ((d.tMax - lo) / span) * plotH;
          const yMin = PAD_T + plotH - ((d.tMin - lo) / span) * plotH;
          return (
            <g key={d.day}>
              <defs>
                <linearGradient id={`g${i}`} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={temperatureColor(d.tMax)} />
                  <stop offset="100%" stopColor={temperatureColor(d.tMin)} />
                </linearGradient>
              </defs>
              <rect
                x={x - Math.max(1.5, step * 0.3)} y={yMax}
                width={Math.max(3, step * 0.6)} height={Math.max(2, yMin - yMax)}
                fill={`url(#g${i})`} rx={2}
              >
                <title>{`${fmtDate(d.day)}: ${d.tMin.toFixed(1)} a ${d.tMax.toFixed(1)} °C${d.precip ? ` · ${d.precip} mm` : ''}`}</title>
              </rect>
            </g>
          );
        })}

        <line x1={PAD_L} x2={W - PAD_R} y1={H - 18} y2={H - 18} stroke="var(--line)" strokeWidth={1} />
        {data.map((d, i) => {
          if (!d.precip) return null;
          const x = PAD_L + i * step + step / 2;
          const h = Math.max(2, (d.precip / maxRain) * (RAIN_H - 4));
          return (
            <rect key={`r${d.day}`} x={x - Math.max(1.5, step * 0.3)} y={H - 18 - h}
              width={Math.max(3, step * 0.6)} height={h} fill="oklch(52% 0.13 245)" rx={1}>
              <title>{`${fmtDate(d.day)}: ${d.precip} mm`}</title>
            </rect>
          );
        })}
        {maxRain > 1 && (
          <text x={W - PAD_R + 4} y={H - 18 - RAIN_H + 12} fontSize={9} fill="var(--muted)" className="tnum">
            {maxRain.toFixed(0)} mm
          </text>
        )}

        {data.map((d, i) => {
          if (i % 7 !== 0) return null;
          return (
            <text key={`x${d.day}`} x={PAD_L + i * step + step / 2} y={H - 5}
              fontSize={9} fill="var(--muted)" textAnchor="middle" className="tnum">
              {d.day.slice(8, 10)}/{d.day.slice(5, 7)}
            </text>
          );
        })}
      </svg>
    </div>
  );
}

interface Props {
  history: StationHistory;
  station: StationRef;
  /** Mes en curso, 1–12. */
  month: number;
}

export function ClimateBlock({ history, station, month }: Props) {
  const { records, counters, normals, monthAnomaly, dryStreak } = history;
  const normal = normals.find((n) => n.month === month);
  const monthName = MONTHS[month - 1];

  const yearsOfSeries = records.since
    ? new Date().getFullYear() - Number(records.since.slice(0, 4))
    : null;

  return (
    <section className="flex flex-col gap-5">
      {/* ── Anomalía del mes ── */}
      {monthAnomaly != null && normal?.tMean != null && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Com va aquest {monthName}
          </h3>
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <span
              className="tnum text-3xl font-semibold"
              style={{ color: monthAnomaly > 0 ? 'var(--bad)' : monthAnomaly < 0 ? 'var(--accent)' : 'var(--ink)' }}
            >
              {monthAnomaly > 0 ? '+' : ''}{monthAnomaly.toFixed(1)} °C
            </span>
            <span className="text-[var(--ink-2)]">
              {monthAnomaly > 0 ? 'per damunt' : monthAnomaly < 0 ? 'per sota' : 'igual que'} la mitjana
            </span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
            La mitjana de {monthName} a {station.nom} és de {normal.tMean.toFixed(1)} °C,
            calculada sobre {normal.years} anys de sèrie de la mateixa estació.
            {normal.precip != null && ` Hi sol ploure ${normal.precip.toFixed(0)} mm, i aquest mes en porta ${counters.precip.month.toFixed(0)} mm.`}
          </p>
        </div>
      )}

      {/* ── Contadores ── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Comptadors de l&apos;any
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Counter label="Dies d'estiu" month={counters.summerDays.month} year={counters.summerDays.year} hint="màxima ≥ 25 °C" />
          <Counter label="Dies de calor" month={counters.hotDays.month} year={counters.hotDays.year} hint="màxima ≥ 30 °C" />
          <Counter label="Nits tropicals" month={counters.tropicalNights.month} year={counters.tropicalNights.year} hint="mínima ≥ 20 °C" />
          <Counter label="Dies de glaçada" month={counters.frostDays.month} year={counters.frostDays.year} hint="mínima < 0 °C" />
          <Counter label="Dies de pluja" month={counters.rainDays.month} year={counters.rainDays.year} hint="≥ 0,2 mm" />
        </div>
        {dryStreak >= 5 && (
          <p className="mt-2 text-sm text-[var(--ink-2)]">
            Fa <strong className="font-semibold">{dryStreak} dies</strong> que no hi plou de manera apreciable.
          </p>
        )}
      </div>

      {/* ── Récords ── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Rècords de l&apos;estació
        </h3>
        <div className="scroll-x rounded-lg border border-[var(--line-soft)] bg-[var(--surface)]">
          <table className="w-full border-collapse text-sm">
            <tbody>
              {records.tMaxAbs && (
                <tr className="border-b border-[var(--line-soft)]">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-[var(--muted)]">Temperatura més alta</th>
                  <td className="px-4 py-2.5 text-right">
                    <span className="tnum rounded px-2 py-0.5 font-semibold"
                      style={{ background: temperatureColor(records.tMaxAbs.value), color: temperatureInk(records.tMaxAbs.value) }}>
                      {records.tMaxAbs.value.toFixed(1)} °C
                    </span>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">{fmtDate(records.tMaxAbs.date)}</td>
                </tr>
              )}
              {records.tMinAbs && (
                <tr className="border-b border-[var(--line-soft)]">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-[var(--muted)]">Temperatura més baixa</th>
                  <td className="px-4 py-2.5 text-right">
                    <span className="tnum rounded px-2 py-0.5 font-semibold"
                      style={{ background: temperatureColor(records.tMinAbs.value), color: temperatureInk(records.tMinAbs.value) }}>
                      {records.tMinAbs.value.toFixed(1)} °C
                    </span>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">{fmtDate(records.tMinAbs.date)}</td>
                </tr>
              )}
              {records.precipMaxDay && (
                <tr className="border-b border-[var(--line-soft)]">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-[var(--muted)]">Dia amb més pluja</th>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-[var(--ink)]">{records.precipMaxDay.value.toFixed(1)} mm</td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">{fmtDate(records.precipMaxDay.date)}</td>
                </tr>
              )}
              {records.gustMax && (
                <tr className="border-b border-[var(--line-soft)] last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-[var(--muted)]">Ratxa de vent més forta</th>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-[var(--ink)]">{msToKmh(records.gustMax.value).toFixed(0)} km/h</td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">{fmtDate(records.gustMax.date)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          Mesurats a l&apos;estació de <strong className="font-medium text-[var(--ink-2)]">{station.nom}</strong>,
          a {station.distKm.toFixed(1).replace('.', ',')} km
          {station.dAltM != null && Math.abs(station.dAltM) >= 25 && ` i ${station.dAltM > 0 ? '' : '−'}${Math.abs(station.dAltM)} m de desnivell`}.
          {records.since && ` Sèrie des del ${fmtDate(records.since)}`}
          {records.days > 0 && ` · ${records.days.toLocaleString('ca-ES')} dies amb dada`}
          {yearsOfSeries != null && yearsOfSeries > 0 && ` (${yearsOfSeries} anys)`}.
        </p>
      </div>

      {/* ── Últimos 30 días ── */}
      {history.daily.length >= 5 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Els últims 30 dies
          </h3>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
            <RecentChart daily={history.daily} />
          </div>

          <details className="mt-2">
            <summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--ink)]">
              Veure la taula diària
            </summary>
            <div className="scroll-x mt-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">Dia</th>
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">Màx.</th>
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">Mín.</th>
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">Mitj.</th>
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">Pluja</th>
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">Ratxa</th>
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">HR</th>
                  </tr>
                </thead>
                <tbody>
                  {history.daily.slice(-30).reverse().map((d) => (
                    <tr key={d.day} className="border-t border-[var(--line-soft)]">
                      <th scope="row" className="tnum px-3 py-1.5 text-left font-medium text-[var(--ink-2)]">
                        {d.day.slice(8, 10)}/{d.day.slice(5, 7)}
                      </th>
                      <td className="tnum px-3 py-1.5">{d.tMax != null ? `${d.tMax.toFixed(1)}°` : '—'}</td>
                      <td className="tnum px-3 py-1.5">{d.tMin != null ? `${d.tMin.toFixed(1)}°` : '—'}</td>
                      <td className="tnum px-3 py-1.5 text-[var(--muted)]">{d.tMean != null ? `${d.tMean.toFixed(1)}°` : '—'}</td>
                      <td className="tnum px-3 py-1.5">{d.precip ? `${d.precip} mm` : <span className="text-[var(--line)]">—</span>}</td>
                      <td className="tnum px-3 py-1.5 text-[var(--muted)]">{d.gust != null ? `${msToKmh(d.gust).toFixed(0)}` : '—'}</td>
                      <td className="tnum px-3 py-1.5 text-[var(--muted)]">{d.rhMean != null ? `${d.rhMean} %` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </div>
      )}
    </section>
  );
}
