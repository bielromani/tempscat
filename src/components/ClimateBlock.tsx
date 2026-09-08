import Link from 'next/link';
import { WindRose } from './WindRose';
import { msToKmh } from '@/lib/variables';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { int, num, ordinal, signed } from '@/lib/format';
import { MONTH_MIN_DAYS } from '@/lib/climate-math';
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

/**
 * Dues dates d'un mateix tram, sense repetir l'any.
 *
 * «16 de maig del 2026 – 2 d'ag. del 2026» escriu el 2026 dues vegades en una
 * cel·la estreta; l'any va un cop, al final, que és on el català el posa.
 */
function spellDates(from: string, to: string) {
  if (from.slice(0, 4) !== to.slice(0, 4)) return `${fmtDate(from)} – ${fmtDate(to)}`;
  const dayMonth = (iso: string) =>
    new Date(`${iso}T12:00:00`).toLocaleDateString('ca-ES', { day: 'numeric', month: 'short' });
  return `${dayMonth(from)} – ${fmtDate(to)}`;
}

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
  const { records, counters, normals, monthAnomaly, monthProgress, dryStreak } = history;
  const normal = normals.find((n) => n.month === month);
  const monthName = MONTHS[month - 1];

  /*
   * Cuánto se desvía el mes en curso, y **contra qué**.
   *
   * `monthProgress` compara los días que la serie ya tiene de este mes con los
   * mismos días de todos los años. `monthAnomaly` los compara con la media del
   * mes entero, y eso mete dentro de la cifra la deriva del propio mes: en
   * Raimat, el 7 de septiembre de 2026, los cinco primeros días daban **+6,9 °C**
   * contra la normal de septiembre y **+4,8 °C** contra esos mismos cinco días
   * de los otros 37 años. Los 2,1 °C de diferencia no eran anomalía: era que la
   * primera semana de septiembre es más cálida que el septiembre medio.
   *
   * Así que el número grande sale de `monthProgress` cuando existe. `monthAnomaly`
   * se queda como respaldo para las estaciones de serie corta, y entonces la
   * frase dice contra qué se compara.
   */
  const gap = monthProgress
    ? Math.round((monthProgress.tMean - monthProgress.normal) * 10) / 10
    : monthAnomaly;

  /*
   * Y si de esta estación hay temperatura, porque de cuatro no hay.
   *
   * El Pantà de Sau, Sant Joan de les Abadesses, la Roca del Vallès i Navès
   * solo miden lluvia. Con la tarjeta condicionada a la temperatura, las **124
   * fichas** que tienen una de esas cuatro como estación de referencia no
   * enseñaban ni la comparación de lluvia del mes ni el enlace a los treinta
   * años de pluviómetro que sí hay. La tarjeta se da ahora con cualquiera de
   * las dos cosas.
   */
  const hasTemp = gap != null && normal?.tMean != null;

  // Hasta dónde llega de verdad el mes en curso dentro de la serie.
  const monthPrefix = today.slice(0, 7);
  const monthDays = history.daily.filter((d) => d.day.startsWith(monthPrefix));
  const lastMonthDay = monthDays.at(-1)?.day ?? null;
  const monthCovered = monthDays.length > 0;

  /*
   * Què mesura aquest aparell, que no és tot a tot arreu.
   *
   * Cinc estacions no tenen termòmetre —i quatre alimenten 124 fitxes— i dues
   * no tenen pluviòmetre. Amb els comptadors donats sempre, la Tosa d'Alp deia
   * «0 dies de pluja l'any» a 2.478 m i el Pantà de Sau, «0 dies d'estiu»: el
   * `?? 0` del comptador convertia la manca de sensor en una mesura. Un
   * comptador sense sensor no es dona.
   *
   * El senyal és el rècord: `extremeOf` torna nul quan **no hi ha cap fila** de
   * la variable, i una sèrie de zeros —una estació en un lloc molt sec— sí que
   * en torna un.
   */
  const hasThermometer = records.tMaxAbs != null || records.tMinAbs != null;
  const hasGauge = records.precipMaxDay != null;

  /*
   * Les columnes de la taula diària, les que aquesta estació té.
   *
   * Fixes, la fitxa del Pantà de Sau ensenyava trenta files de guions amb una
   * xifra de pluja perduda enmig: set columnes per a una variable. Una taula
   * amb sis columnes buides no diu que allí no es mesuri res —no diu res—, i
   * per això cada columna es demana als dies que hi ha.
   */
  const recent = history.daily.slice(-30);
  const columns = ([
    { label: 'Màx.', cell: (d: typeof recent[0]) => (d.tMax != null ? `${num(d.tMax, 1)}°` : null) },
    { label: 'Mín.', cell: (d: typeof recent[0]) => (d.tMin != null ? `${num(d.tMin, 1)}°` : null) },
    { label: 'Mitj.', dim: true, cell: (d: typeof recent[0]) => (d.tMean != null ? `${num(d.tMean, 1)}°` : null) },
    /*
     * Zero mil·límetres mesurats i cap mesura no són el mateix, i aquí sortien
     * tots dos com el mateix guio pal·lid. En una taula d'una estació que
     * només mesura pluja, aquesta diferència és tota la columna.
     */
    { label: 'Pluja', cell: (d: typeof recent[0]) => (d.precip != null ? (d.precip ? `${num(d.precip, 1)} mm` : '0') : null) },
    { label: 'Ratxa', dim: true, cell: (d: typeof recent[0]) => (d.gust != null ? `${msToKmh(d.gust).toFixed(0)}` : null) },
    { label: 'HR', dim: true, cell: (d: typeof recent[0]) => (d.rhMean != null ? `${d.rhMean} %` : null) },
  ] as Array<{ label: string; dim?: boolean; cell: (d: typeof recent[0]) => string | null }>)
    // La pluja és el cas que ho demana: un dia de 0 mm és una mesura, i
    // `d.precip ? ...` el pinta com un buit. Es mira la dada, no la cel·la.
    .filter((c) => (c.label === 'Pluja'
      ? recent.some((d) => d.precip != null)
      : recent.some((d) => c.cell(d) != null)));
  const hasChart = recent.filter((d) => d.tMax != null || d.tMin != null).length >= 5;

  const yearsOfSeries = records.since
    ? new Date().getFullYear() - Number(records.since.slice(0, 4))
    : null;

  return (
    <section className="flex flex-col gap-5">
      {/* ── Anomalía del mes ── */}
      {normal && (hasTemp || normal.precip != null) && (
        <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-5">
          <h3 className="text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Com va aquest {monthName}
          </h3>
          {hasTemp && gap != null && (
          <p className="mt-2 flex flex-wrap items-baseline gap-x-3">
            <span
              className="tnum text-3xl font-semibold"
              style={{ color: gap > 0 ? 'var(--bad)' : gap < 0 ? 'var(--accent)' : 'var(--ink)' }}
            >
              {signed(gap, 1, '°C')}
            </span>
            {/* «per damunt» i «per sota» demanen «de», i amb l'article
                «dels»: sense contreure surt «per damunt els mateixos dies». */}
            <span className="text-[var(--ink-2)]">
              {monthProgress
                ? gap === 0
                  ? 'igual que aquests mateixos dies els altres anys'
                  : `per ${gap > 0 ? 'damunt' : 'sota'} dels mateixos dies dels altres anys`
                : gap === 0
                  ? 'igual que la mitjana'
                  : `per ${gap > 0 ? 'damunt' : 'sota'} de la mitjana`}
            </span>
          </p>
          )}

          {/*
            Y el lugar que ocupa entre esos mismos años, que es la frase que
            contesta «¿este septiembre es más cálido que los últimos diez?».
            Solo aparece con diez años comparables o más: «el 3.º de 4» no
            responde nada. El cálculo es del worker —la página solo tiene 45
            días de serie— y está en `monthProgressOf`.
          */}
          {monthProgress && (
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
              Amb {monthProgress.days} {monthProgress.days === 1 ? 'dia' : 'dies'} de{' '}
              {monthName} mesurats, a {station.nom} hi ha fet{' '}
              <strong className="font-semibold text-[var(--ink)]">{num(monthProgress.tMean, 1)} °C</strong>{' '}
              de mitjana, contra els {num(monthProgress.normal, 1)} °C que hi solen fer
              aquests mateixos dies. És el{' '}
              <strong className="font-semibold text-[var(--ink)]">
                {monthProgress.rank === 1
                  ? `${monthName} més càlid de ${monthProgress.total}`
                  : monthProgress.rank === monthProgress.total
                    ? `${monthName} més fred de ${monthProgress.total}`
                    : `${ordinal(monthProgress.rank)} ${monthName} més càlid de ${monthProgress.total}`}
              </strong>{' '}
              en aquest tram del mes.
              {/* «El rècord» no serveix aquí: en un mes que és el més fred de
                  la sèrie, la paraula sembla contradir la frase d'abans. Es
                  diu quin any va ser el més càlid i s'acaba. */}
              {monthProgress.rank !== 1 && (
                ` El més càlid va ser el ${monthProgress.warmest.year}, amb `
                + `${num(monthProgress.warmest.tMean, 1)} °C.`
              )}
            </p>
          )}

          {/*
            Y cuando no hay comparación de tramo, la cifra grande viene de
            comparar los días que hay contra el mes entero, y **eso se dice**.
            La primera semana de septiembre es más cálida que el septiembre
            medio: en Raimat, 2,1 de los 6,9 grados que da esa cuenta eran la
            deriva del calendario y no una anomalía. No se calla porque un
            número grande sin decir contra qué se mide es el que se cita.
          */}
          {hasTemp && !monthProgress && monthCovered && monthDays.length < MONTH_MIN_DAYS && (
            <p className="mt-2 text-sm leading-relaxed text-[var(--ink-2)]">
              Són {monthDays.length} {monthDays.length === 1 ? 'dia' : 'dies'} comparats amb la
              mitjana de {monthName} sencer, i el {monthName} no comença com acaba:
              una part d&apos;aquests graus és el pas del mes i no una desviació.
            </p>
          )}

          <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">
            {hasTemp && (
              `La mitjana de ${monthName} sencer a ${station.nom} és de `
              + `${num(normal.tMean, 1)} °C, calculada sobre ${normal.years} anys `
              + 'de sèrie de la mateixa estació.'
            )}
            {/*
              El total del mes va amb els dies que cobreix, sempre.

              Deia «Hi sol ploure 86 mm, i aquest mes en porta 0 mm» el 4 de
              setembre, quan la sèrie diària de la XEMA —que va dos dies enrere—
              només tenia el dia 1 i el 2. El número era cert i la lectura,
              falsa: comparar dos dies contra la normal de trenta no és comparar
              res. Es va veure quan el bloc de pluja acumulada, just a sobre,
              va escriure 168,8 mm dels últims trenta dies a la mateixa pàgina.

              El «Hi» va gran quan obre el paràgraf: a les quatre estacions que
              només mesuren pluja no hi ha frase de temperatura al davant.
            */}
            {normal.precip != null && (
              (hasTemp ? ' Hi' : 'Hi')
              + (monthCovered
                ? ` sol ploure ${int(normal.precip)} mm en tot el mes, i dels `
                  + `${monthDays.length} ${monthDays.length === 1 ? 'dia' : 'dies'} `
                  + `de ${monthName} que la sèrie ja té, n'han caigut `
                  + `${int(counters.precip.month)} mm.`
                : ` sol ploure ${int(normal.precip)} mm en tot el mes; de ${monthName} `
                  + 'la sèrie encara no en té cap dia.')
            )}
            {/*
              I si l'estació no mesura temperatura, es diu: altrament aquesta
              targeta és una que parla només de pluja sense que se sàpiga per què.
            */}
            {!hasTemp && (
              (normal.precipYears ? ` És la mitjana de ${normal.precipYears} anys.` : '')
              + ` A ${station.nom} no es mesura la temperatura: només hi ha pluviòmetre.`
            )}
          </p>

          {/*
            Y la puerta al histórico entero, que es lo que sigue a la frase de
            arriba: si este septiembre va el primero de 38, la pregunta
            siguiente es cómo han ido esos 38. Los gráficos —media de cada año
            con su recta, el mismo mes año a año, la lluvia— viven en la ficha
            de la estación y no aquí: son 24 kB de serie mensual que ninguna de
            las 4.293 fichas de lugar dibuja. `climateShard()` en `shards.ts`.
          */}
          {stationHref && (
            <p className="mt-3 text-sm">
              <Link href={`${stationHref}#anys`} className="font-medium text-[var(--accent)] no-underline hover:underline">
                Com han anat els anys a {station.nom} ›
              </Link>
            </p>
          )}
        </div>
      )}

      {/* ── Contadores ── */}
      {(hasThermometer || hasGauge) && (
      <div>
        <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
          Comptadors de l&apos;any
        </h3>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {hasThermometer && (
            <>
              <Counter label="Dies d'estiu" month={counters.summerDays.month} year={counters.summerDays.year} hint="màxima ≥ 25 °C" monthCovered={monthCovered} />
              <Counter label="Dies de calor" month={counters.hotDays.month} year={counters.hotDays.year} hint="màxima ≥ 30 °C" monthCovered={monthCovered} />
              <Counter label="Nits tropicals" month={counters.tropicalNights.month} year={counters.tropicalNights.year} hint="mínima ≥ 20 °C" monthCovered={monthCovered} />
              <Counter label="Dies de glaçada" month={counters.frostDays.month} year={counters.frostDays.year} hint="mínima < 0 °C" monthCovered={monthCovered} />
            </>
          )}
          {hasGauge && (
            <Counter label="Dies de pluja" month={counters.rainDays.month} year={counters.rainDays.year} hint="≥ 0,2 mm" monthCovered={monthCovered} />
          )}
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
      )}

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
              {/*
                La ratxa seca més llarga porta les dues dates i no una: «noranta
                dies» sol és un número, i «del novembre al febrer» diu quin hivern
                va ser. Un dia sense dada la talla, com talla la d'ara.
              */}
              {records.drySpell && records.drySpell.days >= 20 && (
                <tr className="border-b border-[var(--line-soft)] last:border-0">
                  <th scope="row" className="px-4 py-2.5 text-left font-normal text-[var(--muted)]">Ratxa seca més llarga</th>
                  <td className="tnum px-4 py-2.5 text-right font-semibold text-[var(--ink)]">{int(records.drySpell.days)} dies</td>
                  <td className="tnum px-4 py-2.5 text-right text-[var(--muted)]">
                    {spellDates(records.drySpell.from, records.drySpell.to)}
                  </td>
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
          {/*
            El punt final anava sempre, també quan no hi havia sèrie a dir: les
            fitxes de les estacions sense termòmetre acabaven la frase amb
            «de desnivell . .». Ara la cua es munta d'una peça i el punt és seu.
          */}
          {records.since && (
            ` Sèrie des del ${fmtDate(records.since)}`
            + (records.days > 0 ? ` · ${records.days.toLocaleString('ca-ES')} dies amb dada` : '')
            + (yearsOfSeries != null && yearsOfSeries > 0 ? ` (${yearsOfSeries} anys)` : '')
            + '.'
          )}
          {/*
            I sobre quants anys s'ha buscat la ratxa seca, que no són els de la
            sèrie. Sense dir-ho, el lector compta els que acaba de llegir a la
            frase de dalt —a Tàrrega, 31— i el rècord s'ha mirat en 21: en un any
            amb dies perduts, una ratxa surt partida i sembla més curta, i com
            que els anys perduts són els vells, deixar-los dins faria guanyar
            sempre els recents.
          */}
          {records.drySpell && records.drySpell.days >= 20
            && records.drySpell.years < records.drySpell.ofYears && (
            ` La ratxa seca es busca als ${records.drySpell.years} anys sencers dels `
            + `${records.drySpell.ofYears}: `
            + 'a un any amb dies perduts, una ratxa surt partida i sembla més curta.'
          )}
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
      {columns.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-[var(--muted)]">
            Els últims 30 dies
          </h3>
          {/* La caixa només si hi ha dibuix: `RecentChart` torna nul sense cinc
              dies de màxima i mínima, i quedava un requadre buit. */}
          {hasChart && (
            <div className="rounded-lg border border-[var(--line-soft)] bg-[var(--surface)] p-4">
              <RecentChart daily={history.daily} />
            </div>
          )}

          <details className={hasChart ? 'mt-2' : ''} open={!hasChart}>
            <summary className="cursor-pointer text-sm text-[var(--muted)] hover:text-[var(--ink)]">
              Veure la taula diària
            </summary>
            <div className="scroll-x mt-2 rounded-lg border border-[var(--line-soft)] bg-[var(--surface)]">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="text-left text-[11px] uppercase tracking-wide text-[var(--muted)]">
                    <th scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">Dia</th>
                    {columns.map((c) => (
                      <th key={c.label} scope="col" className="bg-[var(--surface-2)] px-3 py-2 font-semibold">
                        {c.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.slice().reverse().map((d) => (
                    <tr key={d.day} className="border-t border-[var(--line-soft)]">
                      <th scope="row" className="tnum px-3 py-1.5 text-left font-medium text-[var(--ink-2)]">
                        {d.day.slice(8, 10)}/{d.day.slice(5, 7)}
                      </th>
                      {columns.map((c) => (
                        <td key={c.label} className={`tnum px-3 py-1.5${c.dim ? ' text-[var(--muted)]' : ''}`}>
                          {c.cell(d) ?? <span className="text-[var(--line)]">—</span>}
                        </td>
                      ))}
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
