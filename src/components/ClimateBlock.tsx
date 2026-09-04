import Link from 'next/link';
import { WindRose } from './WindRose';
import { msToKmh } from '@/lib/variables';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { int, num, signed } from '@/lib/format';
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
 *
 * ## Los números pasan por `format.ts`, y aquí no pasaban
 *
 * Este bloque escribía `toFixed(1)` directamente, así que la tabla de récords
 * publicaba **«38.8 °C» y «-7.3 °C»** — punto decimal y guion de teclado— tres
 * pantallas por debajo de un «28,7 °C» con coma y de un menos tipográfico. En
 * catalán el separador es la coma, y el guion es más corto y más alto que el
 * signo menos: en una columna de cifras tabulares los negativos quedaban
 * desalineados. Es lo que `num()` y `signed()` existen para resolver.
 *
 * ## Y el recuento del mes llegaba dos días tarde sin decirlo
 *
 * El conjunto diario de la XEMA se publica con dos días de retraso, así que los
 * días 1 y 2 de cada mes los cinco contadores decían **cero** pasara lo que
 * pasara. El 2 de septiembre de 2026 esta ficha decía «0 nits tropicals aquest
 * mes» con la mínima de la madrugada en 21,2 °C escrita más arriba, en la misma
 * página. El número era correcto —cero noches *registradas*— y la lectura era
 * falsa.
 *
 * Ahora el bloque mira hasta dónde llega su propia serie y lo dice. Cuando del
 * mes todavía no hay ni un día, el contador no escribe un cero: escribe que no
 * hay datos.
 */

const MONTHS = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
];

const fmtDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short', year: 'numeric' });

function Counter(
  { label, month, year, hint, monthCovered }:
  { label: string; month: number; year: number; hint?: string; monthCovered: boolean },
) {
  return (
    <div className="rounded-md border border-[var(--line-soft)] bg-[var(--surface)] px-3 py-2.5">
      <p className="text-xs text-[var(--muted)]">{label}</p>
      <p className="tnum mt-0.5">
        <span className="text-xl font-semibold text-[var(--ink)]">{int(year)}</span>
        <span className="ml-1.5 text-xs text-[var(--muted)]">l&apos;any</span>
      </p>
      {/* Un zero sense cap dia comptat no vol dir zero: vol dir que encara no
          se sap. Es calla, i la nota de sota ho explica una vegada per als cinc
          en comptes de repetir-ho cinc. Veure la capcalera. */}
      {monthCovered && (
        <p className="tnum text-xs text-[var(--muted)]">{int(month)} aquest mes</p>
      )}
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
                <title>{`${fmtDate(d.day)}: ${num(d.tMin, 1)} a ${num(d.tMax, 1)} °C${d.precip ? ` · ${num(d.precip, 1)} mm` : ''}`}</title>
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
              <title>{`${fmtDate(d.day)}: ${num(d.precip, 1)} mm`}</title>
            </rect>
          );
        })}
        {maxRain > 1 && (
          <text x={W - PAD_R + 4} y={H - 18 - RAIN_H + 12} fontSize={9} fill="var(--muted)" className="tnum">
            {int(maxRain)} mm
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
  /**
   * La fecha local de hoy, `AAAA-MM-DD`.
   *
   * Hace falta el año además del mes: la serie que llega son 45 días, y en enero
   * eso incluye diciembre. Con solo el número de mes, «los días de este mes» y
   * «los días del mismo mes del año pasado» son indistinguibles.
   */
  today: string;
  /**
   * Enlace a la ficha de la estación. Se omite cuando el bloque **está** en esa
   * ficha: un enlace a la página en la que ya estás es ruido.
   */
  stationHref?: string;
}

export function ClimateBlock({ history, station, month, today, stationHref }: Props) {
  const { records, counters, normals, monthAnomaly, dryStreak } = history;
  const normal = normals.find((n) => n.month === month);
  const monthName = MONTHS[month - 1];

  // Hasta dónde llega de verdad el mes en curso dentro de la serie.
  const monthPrefix = today.slice(0, 7);
  const monthDays = history.daily.filter((d) => d.day.startsWith(monthPrefix));
  const lastMonthDay = monthDays.at(-1)?.day ?? null;
  const monthCovered = monthDays.length > 0;

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
              {signed(monthAnomaly, 1, '°C')}
            </span>
            <span className="text-[var(--ink-2)]">
              {monthAnomaly > 0 ? 'per damunt' : monthAnomaly < 0 ? 'per sota' : 'igual que'} la mitjana
            </span>
          </p>
          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
            La mitjana de {monthName} a {station.nom} és de {num(normal.tMean, 1)} °C,
            calculada sobre {normal.years} anys de sèrie de la mateixa estació.
            {/*
              El total del mes va amb els dies que cobreix, sempre.

              Deia «Hi sol ploure 86 mm, i aquest mes en porta 0 mm» el 4 de
              setembre, quan la sèrie diària de la XEMA —que va dos dies enrere—
              només tenia el dia 1 i el 2. El número era cert i la lectura,
              falsa: comparar dos dies contra la normal de trenta no és comparar
              res. Es va veure quan el bloc de pluja acumulada, just a sobre,
              va escriure 168,8 mm dels últims trenta dies a la mateixa pàgina.
            */}
            {normal.precip != null && (
              monthCovered
                ? ` Hi sol ploure ${int(normal.precip)} mm en tot el mes, i dels `
                  + `${monthDays.length} ${monthDays.length === 1 ? 'dia' : 'dies'} `
                  + `de ${monthName} que la sèrie ja té, n'han caigut `
                  + `${int(counters.precip.month)} mm.`
                : ` Hi sol ploure ${int(normal.precip)} mm en tot el mes; de ${monthName} `
                  + 'la sèrie encara no en té cap dia.'
            )}
          </p>
        </div>
      )}

      {/* ── Contadores ── */}
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Comptadors de l&apos;any
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          <Counter label="Dies d'estiu" month={counters.summerDays.month} year={counters.summerDays.year} hint="màxima ≥ 25 °C" monthCovered={monthCovered} />
          <Counter label="Dies de calor" month={counters.hotDays.month} year={counters.hotDays.year} hint="màxima ≥ 30 °C" monthCovered={monthCovered} />
          <Counter label="Nits tropicals" month={counters.tropicalNights.month} year={counters.tropicalNights.year} hint="mínima ≥ 20 °C" monthCovered={monthCovered} />
          <Counter label="Dies de glaçada" month={counters.frostDays.month} year={counters.frostDays.year} hint="mínima < 0 °C" monthCovered={monthCovered} />
          <Counter label="Dies de pluja" month={counters.rainDays.month} year={counters.rainDays.year} hint="≥ 0,2 mm" monthCovered={monthCovered} />
        </div>
        {/* Una vegada per als cinc, i no cinc vegades. */}
        <p className="mt-2 text-[11px] leading-relaxed text-[var(--muted)]">
          {lastMonthDay
            ? `El recompte del mes arriba fins al ${fmtDate(lastMonthDay)}: el conjunt diari de la XEMA es publica amb dos dies de retard.`
            : 'El conjunt diari de la XEMA es publica amb dos dies de retard, i d’aquest mes encara no n’hi ha cap dia.'}
        </p>
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
                      {num(records.tMaxAbs.value, 1)} °C
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
                      {num(records.tMinAbs.value, 1)} °C
                    </span>
                  </td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">{fmtDate(records.tMinAbs.date)}</td>
                </tr>
              )}
              {records.precipMaxDay && (
                <tr className="border-b border-[var(--line-soft)]">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-[var(--muted)]">Dia amb més pluja</th>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-[var(--ink)]">{num(records.precipMaxDay.value, 1)} mm</td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">{fmtDate(records.precipMaxDay.date)}</td>
                </tr>
              )}
              {records.gustMax && (
                <tr className="border-b border-[var(--line-soft)] last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-[var(--muted)]">Ratxa de vent més forta</th>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-[var(--ink)]">{int(msToKmh(records.gustMax.value))} km/h</td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">{fmtDate(records.gustMax.date)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-[var(--muted)]">
          Mesurats a l&apos;estació de{' '}
          {stationHref
            ? (
              <Link href={stationHref} className="font-medium text-[var(--ink-2)] no-underline hover:underline">
                {station.nom}
              </Link>
            )
            : <strong className="font-medium text-[var(--ink-2)]">{station.nom}</strong>},
          a {num(station.distKm, 1)} km
          {station.dAltM != null && Math.abs(station.dAltM) >= 25 && ` i ${station.dAltM > 0 ? '' : '−'}${Math.abs(station.dAltM)} m de desnivell`}.
          {records.since && ` Sèrie des del ${fmtDate(records.since)}`}
          {records.days > 0 && ` · ${records.days.toLocaleString('ca-ES')} dies amb dada`}
          {yearsOfSeries != null && yearsOfSeries > 0 && ` (${yearsOfSeries} anys)`}.
        </p>
      </div>

      {/* ── De dónde viene el viento ── */}
      {/*
        La rosa vive aquí y no solo en la ficha de la estación, y es una decisión
        de alcance: en /estacions la ven 189 páginas y en el bloque de clima la ven
        4.293. El dato es el mismo —es de la estación de referencia— y esta sección
        ya va toda atribuida a ella.
      */}
      {history.rose && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            D&apos;on ve el vent
          </h3>
          <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
            <WindRose rose={history.rose} />
          </div>
          {stationHref && (
            <p className="mt-2 text-xs text-[var(--muted)]">
              <Link href={stationHref} className="text-[var(--ink-2)] no-underline hover:underline">
                Fitxa completa de l&apos;estació de {station.nom} ›
              </Link>
            </p>
          )}
        </div>
      )}

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
                      <td className="tnum px-3 py-1.5">{d.tMax != null ? `${num(d.tMax, 1)}°` : '—'}</td>
                      <td className="tnum px-3 py-1.5">{d.tMin != null ? `${num(d.tMin, 1)}°` : '—'}</td>
                      <td className="tnum px-3 py-1.5 text-[var(--muted)]">{d.tMean != null ? `${num(d.tMean, 1)}°` : '—'}</td>
                      <td className="tnum px-3 py-1.5">{d.precip ? `${num(d.precip, 1)} mm` : <span className="text-[var(--line)]">—</span>}</td>
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
