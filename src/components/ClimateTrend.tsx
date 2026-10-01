import { int, num } from '@/lib/format';
import { StatGrid } from './PageHero';
import { temperatureColor } from '@/lib/scales';
import { MONTH_MIN_DAYS } from '@/lib/climate';
import type { ClimateYear, RainYear, StationMonth, Trend } from '@/lib/climate';

/**
 * La sèrie llarga d'una estació: com han anat els anys i com va aquest mes.
 *
 * ## Què contesta
 *
 * «Aquest setembre és més càlid que els deu anteriors?», «puja la temperatura
 * aquí?», «quin va ser l'any més càlid?». Són preguntes d'una sèrie llarga, i
 * la XEMA en té: la mediana de la xarxa són vint-i-sis anys i la més antiga
 * arrenca el setembre del 1988.
 *
 * ## Per què la recta i no les fletxes
 *
 * Perquè un pendent es mira, no es resumeix. Amb només la xifra —«+0,4 graus
 * per dècada»— no es veu que hi ha anys que se surten, ni si la pujada és
 * regular o va a salts. Amb els punts i la recta a sobre es veuen totes dues
 * coses, i la xifra queda com el que és: el pendent d'aquella recta.
 *
 * ## Els anys incomplets no hi són
 *
 * Ni els mesos. Un mes amb quatre dies de dada no es pot comparar amb un mes
 * sencer, i un any al qual li falta el gener surt més càlid que un que el té.
 * `climate.ts` els descarta, i el peu diu quants n'han entrat.
 *
 * ## I això no és el clima d'una comarca
 *
 * És el que ha mesurat **un aparell**. Una estació es mou, canvia de sensor i
 * li creixen cases al voltant, i qualsevol de les tres coses mou una sèrie tant
 * com una dècada. Va dit al peu, no en lletra petita.
 */

const MONTHS = [
  'gener', 'febrer', 'març', 'abril', 'maig', 'juny',
  'juliol', 'agost', 'setembre', 'octubre', 'novembre', 'desembre',
];

export function ClimateTrend({
  years, rainYears, trend, month, monthSeries, monthNow, monthly,
}: {
  years: ClimateYear[];
  /**
   * Els anys sencers de pluja, que **no són els mateixos**.
   *
   * Van a part perquè quatre estacions de la XEMA només mesuren pluja —el
   * Pantà de Sau en porta trenta anys— i, demanant-los la temperatura,
   * aquesta secció no els ensenyava res. Cada dibuix es dona per les seves
   * pròpies dades.
   */
  rainYears: RainYear[];
  trend: Trend | null;
  /** El mes en curs, d'1 a 12. */
  month: number;
  /** Aquell mes al llarg de tots els anys. */
  monthSeries: Array<StationMonth & { year: number }>;
  /** El mes en curs d'enguany, encara que no estigui complet. */
  monthNow: StationMonth | null;
  /** La sèrie mensual sencera, per als extrems que no són d'un any ni d'un mes. */
  monthly: StationMonth[];
}) {
  const hasTemp = years.length >= 5;
  const hasRain = rainYears.length >= 5;
  /*
   * Els mesos amb mitjana són els que el dibuix pot pintar; els extrems del mes,
   * en canvi, surten de tots —`best()` es salta el que no consta— i per això
   * una estació que només mesura pluja pot dir quin va ser el seu setembre més
   * plujós sense tenir cap termòmetre.
   */
  const monthTemp = monthSeries.filter((m) => m.tMean != null);
  const hasMonth = monthTemp.length >= 5;
  if (!hasTemp && !hasRain) return null;

  const hottest = hasTemp ? years.reduce((a, b) => (b.tMean > a.tMean ? b : a)) : null;
  const coldest = hasTemp ? years.reduce((a, b) => (b.tMean < a.tMean ? b : a)) : null;
  const wettest = hasRain ? rainYears.reduce((a, b) => (b.precip > a.precip ? b : a)) : null;
  const driest = hasRain ? rainYears.reduce((a, b) => (b.precip < a.precip ? b : a)) : null;

  /*
   * El mes més plujós de tota la sèrie, que no és ni el dia més plujós ni l'any.
   *
   * Són tres preguntes diferents i la del mes és la que fa qui recorda un
   * temporal: el dia diu quant va caure d'una tirada i l'any dilueix un mes de
   * 300 mm dins de dotze. Només de mesos sencers: el mes que li falten deu dies
   * no pot ser el més plujós de res.
   */
  const wetMonth = monthly
    .filter((m) => m.days >= MONTH_MIN_DAYS && m.precip != null)
    .reduce<StationMonth | null>((a, b) => (a == null || (b.precip as number) > (a.precip as number) ? b : a), null);

  /**
   * Fins on ha arribat aquest mes al llarg de la sèrie.
   *
   * Són extrems **absoluts del mes** —el dia més calorós d'aquell setembre, no
   * la mitjana de màximes— i només dels mesos sencers, que són els que la
   * gràfica del costat dibuixa. Es descarta el que no consta en comptes
   * d'ensenyar un zero: un setembre sense dada de pluja no és un setembre sec.
   */
  const best = <T,>(xs: T[], key: (x: T) => number | null, desc: boolean) => {
    const v = xs.filter((x) => key(x) != null);
    return v.length
      ? v.reduce((a, b) => ((desc ? key(b)! > key(a)! : key(b)! < key(a)!) ? b : a))
      : null;
  };
  const mName = MONTHS[month - 1];
  /** Si el mes d'enguany és a la gràfica, que és quan surt ressaltat. */
  const nowInChart = monthNow != null
    && monthTemp.some((m) => m.year === Number(monthNow.ym.slice(0, 4)));
  const monthExtremes = [
    { label: `${mName} més calorós`, m: best(monthSeries, (m) => m.tMax, true), unit: '°C', of: 'tMax' },
    { label: `nit més freda d'un ${mName}`, m: best(monthSeries, (m) => m.tMin, false), unit: '°C', of: 'tMin' },
    { label: `${mName} més plujós`, m: best(monthSeries, (m) => m.precip, true), unit: 'mm', of: 'precip' },
    { label: `${mName} més sec`, m: best(monthSeries, (m) => m.precip, false), unit: 'mm', of: 'precip' },
  ]
    .filter((e): e is typeof e & { m: StationMonth & { year: number } } => e.m != null)
    .map((e) => ({
      // El nom del mes va en minúscula en català, però un ròtul comença gran.
      label: e.label[0].toUpperCase() + e.label.slice(1),
      year: e.m.year,
      value: e.of === 'precip'
        ? `${int(e.m.precip)} ${e.unit}`
        : `${num(e.of === 'tMax' ? e.m.tMax : e.m.tMin, 1)} ${e.unit}`,
    }));

  return (
    <div className="grid grid-cols-1 gap-4">
      {/*
        Els extrems de la sèrie, primer: és el que es busca abans de mirar cap
        dibuix —quin va ser l'any més càlid, el més plujós—, i en xifres grans
        es llegeix d'una ullada.
      */}
      <StatGrid
        stats={[
          hottest && {
            label: 'Any més càlid', icon: 'thermometer', value: num(hottest.tMean, 1), unit: '°C', sub: String(hottest.year),
          },
          coldest && {
            label: 'Any més fred', icon: 'thermometer', value: num(coldest.tMean, 1), unit: '°C', sub: String(coldest.year),
          },
          wettest && {
            label: 'Any més plujós', icon: 'raindrops', value: int(wettest.precip), unit: 'mm', sub: String(wettest.year),
          },
          wetMonth && {
            label: 'Mes més plujós', icon: 'raindrops', value: int(wetMonth.precip), unit: 'mm',
            sub: `${MONTHS[Number(wetMonth.ym.slice(5, 7)) - 1]} del ${wetMonth.ym.slice(0, 4)}`,
          },
          driest && {
            label: 'Any més sec', icon: 'raindrop', value: int(driest.precip), unit: 'mm', sub: String(driest.year),
          },
        ]}
      />

      {/* ── La temperatura, any rere any ── */}
      {hasTemp && (
        <figure className="card m-0">
          <figcaption>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              Temperatura mitjana de cada any
            </p>
            {trend && (
              <p className="-mt-1 mb-3 text-[15px] text-[var(--ink-2)]">
                <strong className="tnum font-semibold text-[var(--ink)]">
                  {trend.perDecade > 0 ? '+' : '−'}{num(Math.abs(trend.perDecade), 2)} °C per dècada
                </strong>{' '}
                entre {trend.from} i {trend.to}
              </p>
            )}
          </figcaption>
          <Chart><YearChart years={years} trend={trend} /></Chart>
        </figure>
      )}

      {/* ── Aquest mes, contra tots els altres ── */}
      {(hasMonth || monthExtremes.length > 0) && (
        <figure className="card m-0">
          <figcaption>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/thermometer.svg" width={22} height={22} alt="" />
              Els {MONTHS[month - 1]}s de la sèrie
            </p>
            {hasMonth && (
              <p className="-mt-1 mb-3 text-[15px] text-[var(--ink-2)]">
                La mitjana de cada un, {monthTemp.length} anys
                {nowInChart ? ". La barra marcada és la d'enguany, que encara no s'ha acabat." : '.'}
              </p>
            )}
          </figcaption>
          {hasMonth && <Chart><MonthChart series={monthTemp} now={monthNow} /></Chart>}

          {/*
            Y los extremos de **ese mes**, que no son los de la serie entera.
            «La máxima absoluta de la estación» casi siempre es de julio o de
            agosto y no dice nada de septiembre; lo que contesta la pregunta de
            quién mira un septiembre es hasta dónde ha llegado un septiembre.

            Salen de los meses completos, los mismos que dibuja la gráfica: un
            mes con cuatro días puede tener la lectura más alta de la serie y
            no ser «el septiembre más caluroso» de nada.
          */}
          <dl className={`grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4${hasMonth ? ' mt-4 border-t border-[var(--line-soft)] pt-4' : ''}`}>
            {monthExtremes.map((e) => (
              <div key={e.label}>
                <dt className="text-xs text-[var(--muted)]">{e.label}</dt>
                <dd className="tnum mt-0.5 text-[15px] font-semibold text-[var(--ink)]">
                  {e.value} <span className="font-normal text-[var(--ink-2)]">· {e.year}</span>
                </dd>
              </div>
            ))}
          </dl>
        </figure>
      )}

      {/* ── La pluja ── */}
      {hasRain && (
        <figure className="card m-0">
          <figcaption>
            <p className="card-label">
              {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
              <img src="/icons/w/raindrops.svg" width={22} height={22} alt="" />
              Pluja de cada any
            </p>
            <p className="-mt-1 mb-3 text-[15px] text-[var(--ink-2)]">
              En mil·límetres, {rainYears.length} anys sencers.
            </p>
          </figcaption>
          <Chart><RainChart years={rainYears} /></Chart>
        </figure>
      )}
    </div>
  );
}

/**
 * Un dibuix de la sèrie, amb una amplada mínima.
 *
 * Els tres són de 1.000 unitats d'ample amb el text a 15: a l'amplada d'un
 * mòbil el text quedava a cinc píxels. Amb un mínim de 600 px es llegeix, i el
 * que no cap es desplaça dins de la targeta, no la pàgina.
 *
 * El desplaçament arrenca per la dreta —`direction: rtl` a la caixa i `ltr` a
 * dins, sense JavaScript—, perquè el que es mira primer d'una sèrie són els
 * anys recents. El dibuix torna a `ltr` perquè a l'SVG la direcció gira el
 * sentit de `text-anchor`.
 */
function Chart({ children }: { children: React.ReactNode }) {
  return (
    <div className="scroll-x" style={{ direction: 'rtl' }}>
      <div style={{ minWidth: 600, direction: 'ltr' }}>{children}</div>
    </div>
  );
}

// ── Els dibuixos ────────────────────────────────────────────────────────────

const W = 1000;
const H = 260;
const PAD_L = 46;
const PAD_B = 26;
const PAD_T = 10;

function scales(values: number[]) {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  const span = Math.max(0.5, hi - lo);
  const y0 = lo - span * 0.15;
  const y1 = hi + span * 0.15;
  return {
    y0,
    y1,
    Y: (v: number) => PAD_T + (1 - (v - y0) / (y1 - y0)) * (H - PAD_T - PAD_B),
  };
}

function xAt(i: number, n: number) {
  return PAD_L + (n === 1 ? 0.5 : i / (n - 1)) * (W - PAD_L - 12);
}

function YearChart({ years, trend }: { years: ClimateYear[]; trend: Trend | null }) {
  const { y0, y1, Y } = scales(years.map((y) => y.tMean));
  const n = years.length;

  const line = years
    .map((y, i) => `${i ? 'L' : 'M'} ${xAt(i, n).toFixed(1)} ${Y(y.tMean).toFixed(1)}`)
    .join(' ');

  /*
   * La recta es torna a calcular aquí, del mateix pendent.
   *
   * `trendOf()` dona graus per dècada; per dibuixar-la calen els dos extrems, i
   * surten del pendent i de la mitjana — que és per on passa qualsevol recta de
   * mínims quadrats. Així el que es dibuixa és exactament el número que es diu.
   */
  const mean = years.reduce((a, y) => a + y.tMean, 0) / n;
  const midYear = years.reduce((a, y) => a + y.year, 0) / n;
  const slope = trend ? trend.perDecade / 10 : 0;
  const at = (year: number) => mean + slope * (year - midYear);

  const ticks = [y0, (y0 + y1) / 2, y1].map((v) => Math.round(v * 2) / 2);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Temperatura mitjana de cada any, de ${years[0].year} a ${years[n - 1].year}`}
      className="block h-auto w-full"
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={PAD_L} y1={Y(t)} x2={W - 12} y2={Y(t)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={PAD_L - 8} y={Y(t)} textAnchor="end" dominantBaseline="central" fontSize="15" fill="var(--muted)">
            {num(t, 1)}
          </text>
        </g>
      ))}

      {trend && (
        <line
          x1={xAt(0, n)} y1={Y(at(years[0].year))}
          x2={xAt(n - 1, n)} y2={Y(at(years[n - 1].year))}
          stroke="var(--bad)" strokeWidth="3" strokeDasharray="9 7" opacity={0.75}
        />
      )}

      <path d={line} fill="none" stroke="var(--ink-2)" strokeWidth="2" strokeLinejoin="round" opacity={0.55} />

      {years.map((y, i) => (
        <circle
          key={y.year}
          cx={xAt(i, n)} cy={Y(y.tMean)} r={5}
          fill={temperatureColor(y.tMean)} stroke="var(--surface)" strokeWidth="1.5"
        >
          <title>{`${y.year}: ${num(y.tMean, 1)} °C`}</title>
        </circle>
      ))}

      {[0, n - 1].map((i) => (
        <text
          key={i}
          x={xAt(i, n)} y={H - 6}
          textAnchor={i === 0 ? 'start' : 'end'}
          fontSize="15" fill="var(--muted)"
        >
          {years[i].year}
        </text>
      ))}
    </svg>
  );
}

function MonthChart({
  series, now,
}: {
  series: Array<StationMonth & { year: number }>;
  now: StationMonth | null;
}) {
  const values = series.map((m) => m.tMean as number);
  const nowYear = now ? Number(now.ym.slice(0, 4)) : null;
  const { y0, y1, Y } = scales(values);
  const n = series.length;
  const bw = Math.min(26, (W - PAD_L - 12) / n - 3);
  const mean = values.reduce((a, v) => a + v, 0) / n;

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Mitjana d'aquest mes a cada any de la sèrie"
      className="block h-auto w-full"
    >
      {[y0, y1].map((t) => (
        <text key={t} x={PAD_L - 8} y={Y(t)} textAnchor="end" dominantBaseline="central" fontSize="15" fill="var(--muted)">
          {num(Math.round(t * 2) / 2, 1)}
        </text>
      ))}

      {/* La mitjana de tots, per veure d'un cop qui hi queda per sobre. */}
      <line x1={PAD_L} y1={Y(mean)} x2={W - 12} y2={Y(mean)} stroke="var(--line)" strokeWidth="2" strokeDasharray="6 6" />
      {/* Amb un halo del color de la targeta: les barres més altes passaven per
          sota del rètol i se'l menjaven. */}
      <text
        x={W - 12} y={Y(mean) - 8} textAnchor="end" fontSize="14" fill="var(--ink-2)"
        stroke="var(--surface)" strokeWidth={6} paintOrder="stroke"
      >
        mitjana {num(mean, 1)} °C
      </text>

      {series.map((m, i) => {
        const x = xAt(i, n) - bw / 2;
        const top = Y(m.tMean as number);
        const isNow = nowYear != null && m.year === nowYear;
        return (
          <g key={m.year}>
            <rect
              x={x} y={top} width={bw} height={Math.max(1, Y(y0) - top)}
              fill={temperatureColor(m.tMean as number)}
              stroke={isNow ? 'var(--ink)' : 'none'}
              strokeWidth={isNow ? 2.5 : 0}
              rx="2"
            >
              <title>{`${m.year}: ${num(m.tMean, 1)} °C`}</title>
            </rect>
          </g>
        );
      })}

      {[0, n - 1].map((i) => (
        <text
          key={i}
          x={xAt(i, n)} y={H - 6}
          textAnchor={i === 0 ? 'start' : 'end'}
          fontSize="15" fill="var(--muted)"
        >
          {series[i].year}
        </text>
      ))}
    </svg>
  );
}

function RainChart({ years }: { years: RainYear[] }) {
  const values = years.map((y) => y.precip);
  const hi = Math.max(...values);
  const n = years.length;
  const bw = Math.min(26, (W - PAD_L - 12) / n - 3);
  const mean = values.reduce((a, v) => a + v, 0) / n;
  const Y = (v: number) => PAD_T + (1 - v / (hi * 1.1)) * (H - PAD_T - PAD_B);

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label="Pluja acumulada de cada any sencer de la sèrie"
      className="block h-auto w-full"
    >
      {[0, Math.round(hi / 2), Math.round(hi)].map((t) => (
        <g key={t}>
          <line x1={PAD_L} y1={Y(t)} x2={W - 12} y2={Y(t)} stroke="var(--line-soft)" strokeWidth="1" />
          <text x={PAD_L - 8} y={Y(t)} textAnchor="end" dominantBaseline="central" fontSize="15" fill="var(--muted)">
            {int(t)}
          </text>
        </g>
      ))}

      <line x1={PAD_L} y1={Y(mean)} x2={W - 12} y2={Y(mean)} stroke="var(--line)" strokeWidth="2" strokeDasharray="6 6" />
      <text
        x={W - 12} y={Y(mean) - 8} textAnchor="end" fontSize="14" fill="var(--ink-2)"
        stroke="var(--surface)" strokeWidth={6} paintOrder="stroke"
      >
        mitjana {int(mean)} mm
      </text>

      {years.map((y, i) => {
        const top = Y(y.precip);
        return (
          <rect
            key={y.year}
            x={xAt(i, n) - bw / 2} y={top} width={bw} height={Math.max(1, Y(0) - top)}
            fill="var(--accent)" opacity={0.75} rx="2"
          >
            <title>{`${y.year}: ${int(y.precip)} mm`}</title>
          </rect>
        );
      })}

      {[0, n - 1].map((i) => (
        <text
          key={i}
          x={xAt(i, n)} y={H - 6}
          textAnchor={i === 0 ? 'start' : 'end'}
          fontSize="15" fill="var(--muted)"
        >
          {years[i].year}
        </text>
      ))}
    </svg>
  );
}
