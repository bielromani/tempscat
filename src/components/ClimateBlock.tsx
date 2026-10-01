import Link from 'next/link';
import { WindRose } from './WindRose';
import { StatGrid, type HeroStat } from './PageHero';
import { msToKmh } from '@/lib/variables';
import { temperatureColor, temperatureInk } from '@/lib/scales';
import { aName, deName, int, monthOf, num, ordinal, signed } from '@/lib/format';
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
 * «del 7 de set.» però «de l'1 d'oct.» i «de l'11»: el dia es llegeix «u» i
 * «onze», i contrau com qualsevol mot que comença per vocal. Anava escrit a mà
 * —`des del ${…}`— i el dia 1 de cada mes hauria dit «des del 1».
 */
const vowelDay = (iso: string) => iso.slice(8, 10) === '01' || iso.slice(8, 10) === '11';
const delDate = (iso: string) => `${vowelDay(iso) ? "de l'" : 'del '}${fmtDate(iso)}`;
const alDate = (iso: string) => `${vowelDay(iso) ? "a l'" : 'al '}${fmtDate(iso)}`;

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

/**
 * Un comptador de l'any, en el format de les xifres del web (`StatGrid`).
 *
 * Un zero sense cap dia comptat no vol dir zero: vol dir que encara no se sap.
 * El del mes es calla quan la sèrie encara no en té cap dia, i la nota de sota
 * ho explica una vegada per als cinc en comptes de repetir-ho cinc. Veure la
 * capçalera.
 */
function counter(
  { label, month, year, hint, monthCovered }:
  { label: string; month: number; year: number; hint: string; monthCovered: boolean },
): HeroStat {
  return {
    label,
    value: int(year),
    unit: "l'any",
    sub: (
      <>
        {monthCovered && <span className="block"><span className="tnum">{int(month)}</span> aquest mes</span>}
        <span className="block text-[var(--muted)]">{hint}</span>
      </>
    ),
  };
}

/** L'etiqueta de dins de cada targeta del bloc: la icona i el nom. */
function Label({ icon, children }: { icon: string; children: React.ReactNode }) {
  return (
    <h3 className="card-label">
      {/* eslint-disable-next-line @next/next/no-img-element -- icona SVG de 2 kB */}
      <img src={`/icons/w/${icon}.svg`} width={22} height={22} alt="" />
      {children}
    </h3>
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
    /* Al mòbil no hi cap i es desplaça; arrenca per la dreta, que és on hi ha
       els dies d'ara. `rtl` a la caixa i `ltr` al dibuix, que dins d'un SVG la
       direcció gira el sentit de `text-anchor`. */
    <div className="scroll-x" style={{ direction: 'rtl' }}>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" style={{ minWidth: 520, direction: 'ltr' }} role="img"
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
  /**
   * Dies seguits sense pluja, comptats fins avui amb el que l'estació ja ha
   * mesurat. El de `history` s'acaba on s'acaba la sèrie diària —dos dies
   * enrere— i no veu la pluja d'avui: a Malgrat deia «fa 11 dies que no hi
   * plou» el dia que n'hi queien 0,7 mm. Ver `recent-rain.ts`.
   */
  dryStreak?: number;
  /**
   * Si la rosa dels vents va dins del bloc.
   *
   * A les fitxes de lloc hi va —és l'únic lloc on la veuen les 4.293—, però
   * la fitxa de l'estació ja la porta en una secció pròpia, i amb les dues la
   * mateixa rosa sortia dues vegades a la mateixa pàgina.
   */
  withRose?: boolean;
}

export function ClimateBlock({
  history, station, month, today, stationHref, dryStreak: dryStreakNow, withRose = true,
}: Props) {
  const { records, counters, normals, monthAnomaly, monthProgress } = history;
  const dryStreak = dryStreakNow ?? history.dryStreak;
  const normal = normals.find((n) => n.month === month);
  const monthName = MONTHS[month - 1];
  /*
   * «de setembre» però «d'octubre», «d'abril» i «d'agost». Anava escrit a mà
   * —`de ${monthName}`— i al setembre no es notava: l'1 d'octubre totes les
   * fitxes haurien dit «dies de octubre». Ver `monthOf()`.
   */
  const deMonth = monthOf(month);

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

  const hasMonthCard = normal != null && (hasTemp || normal.precip != null);

  /*
   * Dues columnes quan el bloc té lloc, i no quan la pantalla en té.
   *
   * El bloc viu a dos llocs —plegat a la fitxa de cada poble i obert a la de
   * l'estació— i els dos no tenen la mateixa amplada, així que la graella la
   * decideix l'amplada del bloc (`@container`) i no la de la finestra. El mes i
   * els rècords van de costat; la resta, que són dibuixos, a tota l'amplada.
   */
  return (
    <section className="@container">
      <div className="grid grid-cols-1 gap-4 @3xl:grid-cols-2">
        {/* ── Anomalía del mes ── */}
        {hasMonthCard && (
          <div className="card">
            <Label icon="thermometer">Com va aquest {monthName}</Label>
            {hasTemp && gap != null && (
            <p className="flex flex-wrap items-baseline gap-x-3">
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
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-2)]">
                Amb {monthProgress.days} {monthProgress.days === 1 ? 'dia' : 'dies'}{' '}
                {deMonth} mesurats, {aName(station.nom)} hi ha fet{' '}
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
              <p className="mt-2 text-[15px] leading-relaxed text-[var(--ink-2)]">
                Són {monthDays.length} {monthDays.length === 1 ? 'dia' : 'dies'} comparats amb la
                mitjana {deMonth} sencer, i el {monthName} no comença com acaba:
                una part d&apos;aquests graus és el pas del mes i no una desviació.
              </p>
            )}

            <p className="mt-2 text-sm leading-relaxed text-[var(--muted)]">
              {hasTemp && (
                `La mitjana ${deMonth} sencer ${aName(station.nom)} és de `
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
                    + `${deMonth} que la sèrie ja té, n'han caigut `
                    + `${int(counters.precip.month)} mm.`
                  : ` sol ploure ${int(normal.precip)} mm en tot el mes; ${deMonth} `
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
              <p className="card-foot">
                <Link href={`${stationHref}#anys`}>
                  Com han anat els anys {aName(station.nom)} ›
                </Link>
              </p>
            )}
          </div>
        )}

        {/* ── Récords ── */}
        <div className={hasMonthCard ? 'card' : 'card @3xl:col-span-2'}>
          <Label icon="thermometer">Rècords de l&apos;estació</Label>
          {/*
            Files i no una taula de tres columnes: la data va sota el nom del
            rècord, així que al mòbil no hi ha res a desplaçar de costat.
          */}
          <ul className="rows">
            {records.tMaxAbs && (
              <li>
                <span className="row-main">
                  <span className="row-title">Temperatura més alta</span>
                  <span className="row-sub tnum">{fmtDate(records.tMaxAbs.date)}</span>
                </span>
                <span
                  className="temp-pill"
                  style={{ background: temperatureColor(records.tMaxAbs.value), color: temperatureInk(records.tMaxAbs.value) }}
                >
                  {num(records.tMaxAbs.value, 1)} °C
                </span>
              </li>
            )}
            {records.tMinAbs && (
              <li>
                <span className="row-main">
                  <span className="row-title">Temperatura més baixa</span>
                  <span className="row-sub tnum">{fmtDate(records.tMinAbs.date)}</span>
                </span>
                <span
                  className="temp-pill"
                  style={{ background: temperatureColor(records.tMinAbs.value), color: temperatureInk(records.tMinAbs.value) }}
                >
                  {num(records.tMinAbs.value, 1)} °C
                </span>
              </li>
            )}
            {records.precipMaxDay && (
              <li>
                <span className="row-main">
                  <span className="row-title">Dia amb més pluja</span>
                  <span className="row-sub tnum">{fmtDate(records.precipMaxDay.date)}</span>
                </span>
                <span className="row-value">{num(records.precipMaxDay.value, 1)} mm</span>
              </li>
            )}
            {records.gustMax && (
              <li>
                <span className="row-main">
                  <span className="row-title">Ratxa de vent més forta</span>
                  <span className="row-sub tnum">{fmtDate(records.gustMax.date)}</span>
                </span>
                <span className="row-value">{int(msToKmh(records.gustMax.value))} km/h</span>
              </li>
            )}
            {/*
              La ratxa seca més llarga porta les dues dates i no una: «noranta
              dies» sol és un número, i «del novembre al febrer» diu quin hivern
              va ser. Un dia sense dada la talla, com talla la d'ara.
            */}
            {records.drySpell && records.drySpell.days >= 20 && (
              <li>
                <span className="row-main">
                  <span className="row-title">Ratxa seca més llarga</span>
                  <span className="row-sub tnum">{spellDates(records.drySpell.from, records.drySpell.to)}</span>
                </span>
                <span className="row-value">{int(records.drySpell.days)} dies</span>
              </li>
            )}
          </ul>
          <p className="source">
            Mesurats a l&apos;estació{' '}
            {stationHref
              ? (
                <Link href={stationHref} className="font-medium text-[var(--ink-2)] no-underline hover:underline">
                  {deName(station.nom)}
                </Link>
              )
              : <strong className="font-medium text-[var(--ink-2)]">{deName(station.nom)}</strong>}
            {/* A la fitxa de la mateixa estació la distància és zero, i «a 0,0
                km» no diu res. */}
            {station.distKm > 0 && `, a ${num(station.distKm, 1)} km`}
            {station.dAltM != null && Math.abs(station.dAltM) >= 25 && ` i ${station.dAltM > 0 ? '' : '−'}${Math.abs(station.dAltM)} m de desnivell`}.
            {/*
              El punt final anava sempre, també quan no hi havia sèrie a dir: les
              fitxes de les estacions sense termòmetre acabaven la frase amb
              «de desnivell . .». Ara la cua es munta d'una peça i el punt és seu.
            */}
            {records.since && (
              ` Sèrie des ${delDate(records.since)}`
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

        {/* ── Contadores ── */}
        {(hasThermometer || hasGauge) && (
          <div className="@3xl:col-span-2">
            <Label icon="thermometer">Comptadors de l&apos;any</Label>
            <StatGrid
              stats={[
                hasThermometer && counter({ label: "Dies d'estiu", month: counters.summerDays.month, year: counters.summerDays.year, hint: 'màxima ≥\u00a025\u00a0°C', monthCovered }),
                hasThermometer && counter({ label: 'Dies de calor', month: counters.hotDays.month, year: counters.hotDays.year, hint: 'màxima ≥\u00a030\u00a0°C', monthCovered }),
                hasThermometer && counter({ label: 'Nits tropicals', month: counters.tropicalNights.month, year: counters.tropicalNights.year, hint: 'mínima ≥\u00a020\u00a0°C', monthCovered }),
                hasThermometer && counter({ label: 'Dies de glaçada', month: counters.frostDays.month, year: counters.frostDays.year, hint: 'mínima <\u00a00\u00a0°C', monthCovered }),
                hasGauge && counter({ label: 'Dies de pluja', month: counters.rainDays.month, year: counters.rainDays.year, hint: '≥\u00a00,2\u00a0mm', monthCovered }),
              ]}
            />
            {dryStreak >= 5 && (
              <p className="mt-3 text-[15px] text-[var(--ink-2)]">
                Fa <strong className="font-semibold text-[var(--ink)]">{dryStreak} dies</strong> seguits que no hi plou gens.
              </p>
            )}
            {/* Una vegada per als cinc, i no cinc vegades. */}
            <p className="source">
              {lastMonthDay
                ? `El recompte del mes arriba fins ${alDate(lastMonthDay)}: el conjunt diari de la XEMA es publica amb dos dies de retard.`
                : 'El conjunt diari de la XEMA es publica amb dos dies de retard, i d’aquest mes encara no n’hi ha cap dia.'}
            </p>
          </div>
        )}

        {/* ── De dónde viene el viento ── */}
        {/*
          La rosa vive aquí y no solo en la ficha de la estación, y es una decisión
          de alcance: en /estacions la ven 189 páginas y en el bloque de clima la ven
          4.293. El dato es el mismo —es de la estación de referencia— y esta sección
          ya va toda atribuida a ella.
        */}
        {withRose && history.rose && (
          <div className="card @3xl:col-span-2">
            <Label icon="wind">D&apos;on ve el vent</Label>
            <WindRose rose={history.rose} />
            {stationHref && (
              <p className="card-foot">
                <Link href={stationHref}>
                  Fitxa completa de l&apos;estació {deName(station.nom)} ›
                </Link>
              </p>
            )}
          </div>
        )}

        {/* ── Últimos 30 días ── */}
        {columns.length > 0 && (
          <div className="card @3xl:col-span-2">
            <Label icon="raindrops">Els últims 30 dies</Label>
            {/* El dibuix només si n'hi ha: `RecentChart` torna nul sense cinc
                dies de màxima i mínima, i quedava un requadre buit. */}
            {hasChart && <RecentChart daily={history.daily} />}

            <details className={hasChart ? 'mt-3' : ''} open={!hasChart}>
              <summary className="cursor-pointer text-sm font-medium text-[var(--accent)] hover:underline">
                Veure la taula diària
              </summary>
              <div className="scroll-x mt-2">
                <table className="data-table whitespace-nowrap">
                  <thead>
                    <tr>
                      <th scope="col">Dia</th>
                      {columns.map((c) => (
                        <th key={c.label} scope="col" className="num">{c.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {recent.slice().reverse().map((d) => (
                      <tr key={d.day}>
                        <td className="tnum">
                          <span className="font-medium text-[var(--ink)]">{d.day.slice(8, 10)}/{d.day.slice(5, 7)}</span>
                        </td>
                        {columns.map((c) => (
                          <td key={c.label} className="num">
                            {c.cell(d) != null
                              ? <span className={c.dim ? 'text-[var(--muted)]' : 'text-[var(--ink)]'}>{c.cell(d)}</span>
                              : <span className="text-[var(--line)]">—</span>}
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
      </div>
    </section>
  );
}
