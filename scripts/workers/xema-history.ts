/**
 * Worker · histórico, récords y normales climáticas de las estaciones XEMA.
 *
 * Es lo que separa una ficha de lugar de un widget de predicción: la máxima
 * absoluta con su fecha, el día más lluvioso de la serie, cuántas noches
 * tropicales llevamos este año, y sobre todo **cuánto se desvía este mes de lo
 * normal en ese punto**.
 *
 * ## Dos hallazgos que definen cómo se consulta
 *
 * **Uno.** El primer intento agregaba sobre `nzvn-apee`, la serie semihoraria:
 * cientos de millones de filas, y una sola consulta superaba los 120 s. La XEMA
 * publica además `7bvh-jvq2`, ya agregada por día — 33 millones de filas — y la
 * misma pregunta se responde en menos de un segundo.
 *
 * **Dos.** En ese dataset, `ORDER BY valor` **tarda 110 segundos y expira**: no
 * hay índice sobre la columna de valores. Los agregados (`max`, `avg`) sí van
 * por otro camino y responden rápido, pero no devuelven la fecha del extremo.
 *
 * La salida es descargarse la serie diaria completa de cada estación —unos
 * 40.000 registros, 4,6 s— y calcular récords, normales y contadores **en
 * local**. Una petición en vez de nueve, y sin depender de qué indexa Socrata.
 *
 * Salida: data/cache/xema-history.json
 */
import { readFileSync } from 'node:fs';
import { soql, soqlAll } from '../lib/socrata.ts';
import { raw } from '../lib/paths.ts';
import { throttledMap } from '../lib/http.ts';
import {
  DAILY_LIMITS, QuotaGuard, publish, readSnapshot, recordFreshness, syncQuota, writeSnapshot,
} from '../lib/store.ts';
import { windCardinal } from '../../src/lib/variables.ts';
import type { Station } from '../04-fetch-stations.ts';

const DAILY = '7bvh-jvq2';

/** Códigos de variable diaria de la XEMA. */
const V = {
  tMean: '1000',
  tMax: '1001',
  tMin: '1002',
  tRange: '1004',
  rhMean: '1100',
  rhMin: '1102',
  pressure: '1200',
  precip: '1300',
  precipMax1h: '1303',
  solar: '1400',
  /*
   * Racha máxima diaria y su dirección, en las **tres alturas** de la XEMA.
   *
   * Es la misma historia que con los códigos semihorarios de `variables.ts`, y
   * cayó en la misma trampa: las estaciones de alta montaña y las de
   * emplazamiento difícil miden el viento a 6 o a 2 m, porque a 10 m el mástil no
   * aguanta el hielo. Pidiendo solo la de 10 m, 87 de 189 estaciones se quedaron
   * sin rosa de los vientos — incluidas algunas con cuatro mil días de serie.
   *
   * El orden es de preferencia: 10 m, luego 6, luego 2.
   */
  gust: '1512',
  gust6: '1513',
  gust2: '1514',
  gustDir: '1515',
  gustDir6: '1516',
  gustDir2: '1517',
  et0: '1700',
  /*
   * Espesor de nieve, que solo miden 24 estaciones y todas menos dos están en el
   * Pirineo. Es el dato que convierte «la cota de neu va a 1.800 m», que es una
   * estimación del modelo, en «i a Bonaigua hi ha 40 cm», que es una medida.
   *
   * Se usa el máximo diario (1601) y no la media (1600) porque está más presente
   * en la serie y porque el espesor de un día es lo que había, no un promedio de
   * lecturas.
   */
  snowDepth: '1601',
  snowNew: '1602',
} as const;

export interface DailyRecord {
  day: string;
  tMax: number | null;
  tMin: number | null;
  tMean: number | null;
  tRange: number | null;
  rhMean: number | null;
  precip: number | null;
  precipMax1h: number | null;
  gust: number | null;
  pressure: number | null;
  solar: number | null;
  /** Espesor de nieve, cm. Null cuando la estación no lo mide — que son 165 de 189. */
  snowDepth: number | null;
  /** Nieve nueva caída ese día, cm. */
  snowNew: number | null;
}

export interface Extreme { value: number; date: string; hour?: string }

/**
 * Rosa de los vientos, en 16 sectores.
 *
 * Se construye con la **dirección de la racha máxima de cada día** (variable
 * 1515), no con la dirección media diaria (1509). La razón es que la media
 * vectorial de un día entero cancela el ciclo diurno: en el litoral, marinada de
 * tarde y terral de madrugada se anulan y la media apunta a un sector donde casi
 * nunca sopla. La racha del día, en cambio, es un evento real con una dirección
 * real.
 *
 * Lo que esta rosa contesta es «d'on ve el vent fort aquí», que es la pregunta
 * que distingue la tramuntana del mestral y la que explica por qué un pueblo
 * tiene los árboles inclinados. Lo que **no** contesta es la frecuencia de las
 * brisas suaves: la página lo dice.
 */
export interface WindRose {
  sectors: Array<{
    /** Centro del sector en grados, 0 = norte. */
    deg: number;
    label: string;
    days: number;
    /** Fracción de días, 0–1. */
    share: number;
    gustMean: number | null;
    gustMax: number | null;
  }>;
  /** Días con dirección y racha en la misma fecha. */
  days: number;
  prevailing: { label: string; share: number } | null;
  /**
   * Altura del anemómetro, en metros.
   *
   * Se publica porque cambia las cifras: a 2 m el viento es sensiblemente más
   * flojo que a 10 m, y comparar la racha media de una estación de alta montaña
   * medida a 2 m con una de llano medida a 10 sin decirlo es comparar dos cosas
   * distintas.
   */
  heightM: number;
}

export interface StationHistory {
  station: string;
  /** Últimos 45 días, para la tabla y el gráfico. */
  daily: DailyRecord[];
  records: {
    tMaxAbs: Extreme | null;
    tMinAbs: Extreme | null;
    precipMaxDay: Extreme | null;
    precipMax1h: Extreme | null;
    gustMax: Extreme | null;
    /** Espesor de nieve más alto de la serie. Solo en las 24 estaciones que lo miden. */
    snowMax: Extreme | null;
    since: string | null;
    days: number;
  };
  /**
   * Media de cada mes en toda la serie de esta estación. Es la referencia
   * contra la que se mide la anomalía, y sale de la propia estación: no hace
   * falta ninguna reanálisis externa.
   */
  normals: Array<{ month: number; tMean: number | null; precip: number | null; years: number }>;
  counters: {
    summerDays: { month: number; year: number };
    hotDays: { month: number; year: number };
    tropicalNights: { month: number; year: number };
    frostDays: { month: number; year: number };
    rainDays: { month: number; year: number };
    precip: { month: number; year: number };
  };
  /** Anomalía del mes en curso respecto a la normal de la estación, °C. */
  monthAnomaly: number | null;
  /** Días consecutivos sin precipitación apreciable hasta hoy. */
  dryStreak: number;
  /** De dónde vienen las rachas. Null si la estación no mide viento. */
  rose: WindRose | null;
  /**
   * La última medida de nieve, con su fecha.
   *
   * Null cuando la estación **no tiene sensor**, que es el caso de 165 de las
   * 189. Es la distinción que hay que mantener a toda costa: cero centímetros
   * medidos y ausencia de sensor no son lo mismo, y confundirlos es el fallo que
   * ya dio una racha seca de 398 días en el Port de Barcelona.
   */
  snow: { depthCm: number; newCm: number | null; day: string } | null;
}

interface Row { [k: string]: string }
const num = (v: string | undefined | null) => (v == null || v === '' ? null : Number(v));
const r1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10);

const ALL_VARS = Object.values(V);

/**
 * Variables que se descargan de toda la serie histórica.
 *
 * No las treinta: con todas, una estación de 1988 pasa de 40.000 registros a más
 * de 100.000 y la descarga deja de compensar. Estas diez son las cuatro de los
 * récords más las tres parejas de racha y dirección, que la rosa necesita de toda
 * la serie. Pedirlas aparte costaría otra consulta por estación.
 */
const RECORD_VARS = [
  V.tMean, V.tMax, V.tMin, V.precip,
  V.gust, V.gust6, V.gust2,
  V.gustDir, V.gustDir6, V.gustDir2,
  V.snowDepth,
];

/**
 * Alturas de medida del viento, en orden de preferencia.
 *
 * Cada estación mide a una sola, así que en la práctica las tres parejas no
 * inflan la descarga: solo aparecen las filas de la altura que esa estación usa.
 */
const WIND_HEIGHTS = [
  { m: 10, gust: V.gust, dir: V.gustDir },
  { m: 6, gust: V.gust6, dir: V.gustDir6 },
  { m: 2, gust: V.gust2, dir: V.gustDir2 },
] as const;

/** Serie diaria: una sola consulta trae todas las variables de todos los días. */
async function dailySeries(station: string, fromDay: string): Promise<DailyRecord[]> {
  const rows = await soql<Row>(DAILY, {
    select: 'data_lectura,codi_variable,valor',
    where: `codi_estacio='${station}' AND data_lectura >= '${fromDay}' AND codi_variable in(${ALL_VARS.map((v) => `'${v}'`).join(',')})`,
    order: 'data_lectura',
    limit: 50_000,
  });

  const byDay = new Map<string, DailyRecord>();
  for (const row of rows) {
    const day = row.data_lectura.slice(0, 10);
    let rec = byDay.get(day);
    if (!rec) {
      rec = {
        day, tMax: null, tMin: null, tMean: null, tRange: null,
        rhMean: null, precip: null, precipMax1h: null, gust: null, pressure: null, solar: null,
        snowDepth: null, snowNew: null,
      };
      byDay.set(day, rec);
    }
    const value = num(row.valor);
    switch (row.codi_variable) {
      case V.tMax: rec.tMax = value; break;
      case V.tMin: rec.tMin = value; break;
      case V.tMean: rec.tMean = r1(value); break;
      case V.tRange: rec.tRange = r1(value); break;
      case V.rhMean: rec.rhMean = value == null ? null : Math.round(value); break;
      case V.precip: rec.precip = r1(value); break;
      case V.precipMax1h: rec.precipMax1h = r1(value); break;
      case V.gust: rec.gust = value; break;
      case V.pressure: rec.pressure = r1(value); break;
      case V.solar: rec.solar = value == null ? null : Math.round(value); break;
      case V.snowDepth: rec.snowDepth = r1(value); break;
      case V.snowNew: rec.snowNew = r1(value); break;
    }
  }
  return [...byDay.values()].sort((a, b) => a.day.localeCompare(b.day));
}

/** Serie diaria completa de una estación, para récords y normales. */
async function fullSeries(station: string): Promise<Array<{ day: string; variable: string; value: number; hour?: string }>> {
  const rows = await soqlAll<Row>(DAILY, {
    select: 'data_lectura,codi_variable,valor,hora_tu',
    where: `codi_estacio='${station}' AND codi_variable in(${RECORD_VARS.map((v) => `'${v}'`).join(',')})`,
    order: 'data_lectura',
  }, { pageSize: 50_000 });

  return rows
    .map((r) => ({
      day: r.data_lectura.slice(0, 10),
      variable: r.codi_variable,
      value: Number(r.valor),
      hour: r.hora_tu || undefined,
    }))
    .filter((r) => Number.isFinite(r.value));
}

/** Extremo de una variable en la serie ya descargada. */
function extremeOf(
  series: Array<{ day: string; variable: string; value: number; hour?: string }>,
  variable: string,
  dir: 'max' | 'min',
): Extreme | null {
  let best: { day: string; value: number; hour?: string } | null = null;
  for (const r of series) {
    if (r.variable !== variable) continue;
    if (!best || (dir === 'max' ? r.value > best.value : r.value < best.value)) {
      best = { day: r.day, value: r.value, hour: r.hour };
    }
  }
  return best ? { value: best.value, date: best.day, hour: best.hour } : null;
}

/**
 * Normales mensuales calculadas sobre la serie completa de la propia estación.
 *
 * La referencia sale del mismo punto que se mide, no de una reanálisis global:
 * para un fondo de valle con inversión térmica, la media de ERA5 en su celda de
 * 25 km no describe lo que pasa allí.
 */
function normalsOf(
  series: Array<{ day: string; variable: string; value: number }>,
): StationHistory['normals'] {
  const acc = new Map<number, { tSum: number; tN: number; pSum: number; years: Set<number> }>();
  for (let m = 1; m <= 12; m++) acc.set(m, { tSum: 0, tN: 0, pSum: 0, years: new Set() });

  for (const r of series) {
    const month = Number(r.day.slice(5, 7));
    const year = Number(r.day.slice(0, 4));
    const a = acc.get(month);
    if (!a) continue;
    if (r.variable === V.tMean) { a.tSum += r.value; a.tN++; a.years.add(year); }
    if (r.variable === V.precip) { a.pSum += r.value; a.years.add(year); }
  }

  return [...acc].map(([month, a]) => ({
    month,
    tMean: a.tN ? r1(a.tSum / a.tN) : null,
    precip: a.years.size ? r1(a.pSum / a.years.size) : null,
    years: a.years.size,
  }));
}

function count(daily: DailyRecord[], from: string, pred: (d: DailyRecord) => boolean): number {
  return daily.filter((d) => d.day >= from && pred(d)).length;
}

/**
 * Rosa de los vientos a partir de la serie completa.
 *
 * Empareja por día la dirección de la racha con su velocidad: vienen en filas
 * distintas del mismo dataset, y sin emparejarlas se puede contar la frecuencia
 * pero no decir con qué fuerza sopla de cada lado — que es la mitad de la
 * información.
 */
function roseOf(
  series: Array<{ day: string; variable: string; value: number }>,
): WindRose | null {
  // La altura con más días de dirección gana. No se mezclan: una rosa que junta
  // rachas de 10 m y de 2 m tiene dos escalas dentro y ninguna forma de decirlo.
  const byHeight = WIND_HEIGHTS.map((h) => ({
    ...h,
    dirByDay: new Map<string, number>(),
    gustByDay: new Map<string, number>(),
  }));

  for (const r of series) {
    for (const h of byHeight) {
      if (r.variable === h.dir) h.dirByDay.set(r.day, r.value);
      else if (r.variable === h.gust) h.gustByDay.set(r.day, r.value);
    }
  }

  const chosen = byHeight.reduce((a, b) => (b.dirByDay.size > a.dirByDay.size ? b : a));
  const { dirByDay, gustByDay } = chosen;
  if (dirByDay.size < 90) return null;   // menos de tres meses no es una rosa

  const sectors = Array.from({ length: 16 }, (_, i) => ({
    deg: i * 22.5,
    label: windCardinal(i * 22.5),
    days: 0,
    share: 0,
    gustSum: 0,
    gustN: 0,
    gustMax: null as number | null,
  }));

  let total = 0;
  for (const [day, deg] of dirByDay) {
    if (!Number.isFinite(deg)) continue;
    // El sector 0 va de 348,75° a 11,25°, así que el redondeo tiene que dar la
    // vuelta: sin el módulo, los 355° caen en un sector 16 que no existe.
    const i = Math.round((((deg % 360) + 360) % 360) / 22.5) % 16;
    const sec = sectors[i];
    sec.days++;
    total++;
    const gust = gustByDay.get(day);
    if (gust != null && Number.isFinite(gust)) {
      sec.gustSum += gust;
      sec.gustN++;
      if (sec.gustMax == null || gust > sec.gustMax) sec.gustMax = gust;
    }
  }
  if (!total) return null;

  const out = sectors.map((sec) => ({
    deg: sec.deg,
    label: sec.label,
    days: sec.days,
    share: Math.round((sec.days / total) * 1000) / 1000,
    gustMean: sec.gustN ? r1(sec.gustSum / sec.gustN) : null,
    gustMax: r1(sec.gustMax),
  }));

  const top = out.reduce((a, b) => (b.share > a.share ? b : a));
  return {
    sectors: out,
    days: total,
    prevailing: top.share > 0 ? { label: top.label, share: top.share } : null,
    heightM: chosen.m,
  };
}

/**
 * Filtro de plausibilidad para el espesor de nieve.
 *
 * ## Por qué hace falta uno propio
 *
 * El sensor de nieve es un ultrasonido que mide la distancia al suelo, y en
 * verano se le cuela cualquier cosa: hierba que crece, un objeto, una
 * recalibración. El dataset daba **12 cm de neu a Das el 28 d'agost**, a 1.100 m,
 * con la mínima de aquel día en 9,3 °C — y 37 cm de nieve nueva en Mollò el mismo
 * día. Es imposible.
 *
 * Y el portal **no lo detecta**: esas filas vienen marcadas `Representatiu`, que
 * es su estado de validación bueno. Así que la comprobación tiene que ser
 * nuestra, y tiene que ser física, no estadística.
 *
 * ## La regla
 *
 * Una lectura de espesor se acepta si **la mínima del día bajó de 2 °C** o si el
 * espesor **no ha aumentado** respecto de la última lectura aceptada.
 *
 * Los dos casos que la regla tiene que respetar, y respeta:
 *
 *  · **Nieve de primavera fundiéndose.** Mínima de 6 °C y el manto pasa de 80 a
 *    70 cm: no aumenta, se acepta. Un metro de nieve no desaparece porque un día
 *    haga bueno, y una regla que solo mirase la temperatura la borraría.
 *  · **Nevada de invierno.** Mínima de −4 °C y de 0 a 40 cm: se acepta aunque sea
 *    un salto enorme, porque a esa temperatura el salto es lo que pasa.
 *
 * Lo que cae es exactamente el caso imposible: el manto que **crece** en un día
 * que no ha helado ni de lejos.
 */
const SNOW_MAX_MIN_TEMP = 2;

function filterSnow(days: DailyRecord[]): { dropped: number } {
  let lastAccepted: number | null = null;
  let dropped = 0;

  for (const d of days) {
    if (d.snowDepth == null) continue;

    const grew = lastAccepted != null && d.snowDepth > lastAccepted;
    const fromNothing = lastAccepted == null && d.snowDepth > 0;
    const cold = d.tMin != null && d.tMin <= SNOW_MAX_MIN_TEMP;

    if ((grew || fromNothing) && !cold) {
      // Se anula, no se pone a cero: no sabemos cuánta nieve había, sabemos que
      // la cifra no es creíble. Un cero diría que no había, que es otra cosa.
      d.snowDepth = null;
      d.snowNew = null;
      dropped++;
      continue;
    }
    lastAccepted = d.snowDepth;
  }
  return { dropped };
}

/**
 * La misma regla sobre la serie completa, para que no contamine los récords.
 *
 * Sin esto, el récord de Mollò habría quedado en «40 cm el 28 d'agost de 2026»,
 * que es la lectura falsa, en vez de en el máximo real de su historia.
 */
function plausibleSnowExtreme(
  series: Array<{ day: string; variable: string; value: number; hour?: string }>,
): Extreme | null {
  const tMinByDay = new Map<string, number>();
  for (const r of series) if (r.variable === V.tMin) tMinByDay.set(r.day, r.value);

  const snowDays = series
    .filter((r) => r.variable === V.snowDepth)
    .sort((a, b) => a.day.localeCompare(b.day));

  let lastAccepted: number | null = null;
  let best: Extreme | null = null;

  for (const r of snowDays) {
    const tMin = tMinByDay.get(r.day) ?? null;
    const grew = lastAccepted != null && r.value > lastAccepted;
    const fromNothing = lastAccepted == null && r.value > 0;
    const cold = tMin != null && tMin <= SNOW_MAX_MIN_TEMP;
    if ((grew || fromNothing) && !cold) continue;

    lastAccepted = r.value;
    if (r.value > 0 && (!best || r.value > best.value)) {
      best = { value: r.value, date: r.day, hour: r.hour };
    }
  }
  return best;
}

async function main() {
  // El comptador viu al magatzem: sense això, cada execució automàtica
  // començaria el dia de zero. Ha d'anar abans de construir el guardià.
  await syncQuota();
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const { stations } = JSON.parse(readFileSync(raw('stations.json'), 'utf8')) as { stations: Station[] };
  const operative = stations.filter((s) => s.operativa);
  const onlyOne = process.argv.find((a) => a.startsWith('--station='))?.split('=')[1];
  const targets = onlyOne ? operative.filter((s) => s.codi === onlyOne) : operative;

  const now = new Date();
  const year = now.getUTCFullYear();
  const month = now.getUTCMonth() + 1;
  const yearStart = `${year}-01-01`;
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  // 400 días cubren el año en curso completo y parte del anterior.
  const from = new Date(Date.now() - 400 * 86_400_000).toISOString().slice(0, 10);

  console.log(`Estacions: ${targets.length}${onlyOne ? ` (només ${onlyOne})` : ''}`);
  console.log(`Sèrie diària des de ${from} · dataset ${DAILY}\n`);

  let calls = 0;
  const failed: string[] = [];
  const suspectSnow: string[] = [];
  const results = await throttledMap(
    targets,
    async (s) => {
      /*
       * Una estación que falla no puede tumbar la ejecución entera.
       *
       * Sin este try, un `fetch failed` en la primera de 189 abortaba tres
       * minutos y medio de trabajo y no escribía nada — pasó al añadir la nieve.
       * El resto del worker ya filtraba nulos, así que esperaba poder recibirlos:
       * lo único que faltaba era producirlos.
       *
       * Y el fichero anterior se conserva porque `writeSnapshot` es atómico, que
       * es lo que hace que un fallo a media descarga no deje la web sin clima.
       */
      let daily: DailyRecord[];
      let series: Array<{ day: string; variable: string; value: number; hour?: string }>;
      try {
        [daily, series] = await Promise.all([
          dailySeries(s.codi, from),
          fullSeries(s.codi),
        ]);
      } catch (err) {
        failed.push(s.codi);
        console.warn(`
  ${s.codi} ${s.nom}: ${String(err).slice(0, 80)}`);
        return null;
      }
      calls += 2;

      const snowDropped = filterSnow(daily).dropped;
      if (snowDropped) suspectSnow.push(`${s.codi}:${snowDropped}`);
      const snowMax = plausibleSnowExtreme(series);
      const tMaxAbs = extremeOf(series, V.tMax, 'max');
      const tMinAbs = extremeOf(series, V.tMin, 'min');
      const gustMax = extremeOf(series, V.gust, 'max');
      const norm = normalsOf(series);

      // El día más lluvioso y la punta horaria salen de la serie reciente y de
      // la completa respectivamente; la de 1 hora solo está en la detallada.
      const precipMaxDay = extremeOf(series, V.precip, 'max');
      const precipMax1h = daily.reduce<Extreme | null>((best, d) => (
        d.precipMax1h != null && (!best || d.precipMax1h > best.value)
          ? { value: d.precipMax1h, date: d.day }
          : best
      ), null);

      const days = new Set(series.filter((r) => r.variable === V.tMean).map((r) => r.day));
      const firstDay = [...days].sort()[0] ?? null;

      /*
       * Días seguidos sin lluvia, contando hacia atrás desde hoy.
       *
       * Un dato **ausente corta la cuenta**, no la alimenta. Con `?? 0`, una
       * estación que no mide precipitación acumulaba una racha seca de 398 días
       * —el Port de Barcelona, visto en el registro— y eso no es una sequía: es
       * que allí no hay pluviómetro.
       */
      let dryStreak = 0;
      for (let i = daily.length - 1; i >= 0; i--) {
        const mm = daily[i].precip;
        if (mm == null || mm >= 0.2) break;
        dryStreak++;
      }

      const c = (pred: (d: DailyRecord) => boolean) => ({
        month: count(daily, monthStart, pred),
        year: count(daily, yearStart, pred),
      });
      const sumPrecip = (fromDay: string) =>
        r1(daily.filter((d) => d.day >= fromDay).reduce((a, d) => a + (d.precip ?? 0), 0)) ?? 0;

      // Anomalía del mes en curso frente a la normal de la propia estación.
      const monthDays = daily.filter((d) => d.day >= monthStart && d.tMean != null);
      const monthMean = monthDays.length
        ? monthDays.reduce((a, d) => a + d.tMean!, 0) / monthDays.length
        : null;
      const normal = norm.find((n) => n.month === month)?.tMean ?? null;

      const history: StationHistory = {
        station: s.codi,
        daily: daily.slice(-45),
        records: {
          tMaxAbs, tMinAbs, precipMaxDay, precipMax1h, gustMax, snowMax,
          since: firstDay,
          days: days.size,
        },
        normals: norm,
        counters: {
          summerDays: c((d) => (d.tMax ?? -99) >= 25),
          hotDays: c((d) => (d.tMax ?? -99) >= 30),
          tropicalNights: c((d) => (d.tMin ?? -99) >= 20),
          frostDays: c((d) => (d.tMin ?? 99) < 0),
          rainDays: c((d) => (d.precip ?? 0) >= 0.2),
          precip: { month: sumPrecip(monthStart), year: sumPrecip(yearStart) },
        },
        monthAnomaly: monthMean != null && normal != null ? r1(monthMean - normal) : null,
        dryStreak,
        rose: roseOf(series),
        // El último día **con lectura**, no el último día del calendario: en una
        // estación de alta montaña la serie tiene huecos, y quedarse con la fecha
        // de hoy y un valor nulo diría «avui no hi ha neu» cuando lo que pasa es
        // que hoy no hay dato.
        snow: (() => {
          const last = [...daily].reverse().find((d) => d.snowDepth != null);
          return last ? { depthCm: last.snowDepth!, newCm: last.snowNew, day: last.day } : null;
        })(),
      };
      return history;
    },
    {
      concurrency: 3,
      minIntervalMs: 100,
      onProgress: (done, total) => {
        if (done % 10 === 0 || done === total) process.stdout.write(`\r  ${done}/${total} estacions   `);
      },
    },
  );
  process.stdout.write('\n');
  quota.spend('socrata', calls);

  const fresh = results.filter((r): r is StationHistory => !!r);
  if (failed.length) {
    console.warn(`
avís: ${failed.length} estacions han fallat i es conserven les anteriors: ${failed.join(', ')}`);
  }
  if (suspectSnow.length) {
    console.warn('');
    console.warn('Lectures de neu descartades per impossibles (mantell que creix sense glaçar):');
    console.warn(`  ${suspectSnow.join(' · ')}`);
  }

  /*
   * Con `--station=`, el resultado se **fusiona** sobre el snapshot anterior.
   *
   * Antes lo sustituía, y eso convertía una comprobación de una estación en un
   * fichero con una sola estación: el bloque de clima desaparecía de las 4.293
   * páginas hasta la siguiente ejecución completa, sin que nada diera error.
   * Pasó al probar la rosa de los vientos.
   */
  /*
   * Las que han fallado conservan su fila anterior en vez de desaparecer. Es la
   * misma lógica que el modo --station y por la misma razón: un corte de red no
   * debe borrar el clima de un pueblo.
   */
  let valid = fresh;
  if (onlyOne || failed.length) {
    const previous = readSnapshot<StationHistory[]>('xema-history')?.data ?? [];
    const byStation = new Map(previous.map((h) => [h.station, h]));
    for (const h of fresh) byStation.set(h.station, h);
    valid = [...byStation.values()].sort((a, b) => a.station.localeCompare(b.station));
    console.log(`${fresh.length} refrescades · ${valid.length - fresh.length} conservades de l'execució anterior`);
  }

  const nom = new Map(stations.map((s) => [s.codi, s.nom]));

  const withRec = valid.filter((v) => v.records.tMaxAbs);
  console.log(`\nAmb rècords: ${withRec.length} / ${valid.length}`);
  const totalDays = valid.reduce((a, v) => a + v.records.days, 0);
  console.log(`Dies de sèrie agregats: ${totalDays.toLocaleString('ca-ES')}`);

  const top = <T>(arr: T[], key: (x: T) => number | null | undefined, desc = true) =>
    arr.filter((x) => key(x) != null).sort((a, b) => desc ? key(b)! - key(a)! : key(a)! - key(b)!)[0];

  const hottest = top(withRec, (v) => v.records.tMaxAbs?.value);
  const coldest = top(withRec, (v) => v.records.tMinAbs?.value, false);
  const wettest = top(valid, (v) => v.records.precipMaxDay?.value);
  const windiest = top(valid, (v) => v.records.gustMax?.value);

  console.log('\nRècords absoluts de la xarxa:');
  if (hottest) console.log(`  màxima     ${hottest.records.tMaxAbs!.value} °C   ${nom.get(hottest.station)} · ${hottest.records.tMaxAbs!.date}`);
  if (coldest) console.log(`  mínima     ${coldest.records.tMinAbs!.value} °C   ${nom.get(coldest.station)} · ${coldest.records.tMinAbs!.date}`);
  if (wettest) console.log(`  pluja/dia  ${wettest.records.precipMaxDay!.value} mm  ${nom.get(wettest.station)} · ${wettest.records.precipMaxDay!.date}`);
  if (windiest) console.log(`  ratxa      ${(windiest.records.gustMax!.value * 3.6).toFixed(0)} km/h ${nom.get(windiest.station)} · ${windiest.records.gustMax!.date}`);

  const anomalies = valid.filter((v) => v.monthAnomaly != null).map((v) => v.monthAnomaly!);
  if (anomalies.length) {
    const mean = anomalies.reduce((a, b) => a + b, 0) / anomalies.length;
    const warm = top(valid, (v) => v.monthAnomaly);
    console.log(`\nAnomalia del mes en curs: ${mean > 0 ? '+' : ''}${mean.toFixed(1)} °C de mitjana a la xarxa`);
    if (warm) console.log(`  màxima desviació: ${warm.monthAnomaly! > 0 ? '+' : ''}${warm.monthAnomaly} °C a ${nom.get(warm.station)}`);
  }

  const dry = top(valid, (v) => v.dryStreak);
  if (dry) console.log(`\nRatxa seca més llarga ara: ${dry.dryStreak} dies a ${nom.get(dry.station)}`);

  const newest = valid.flatMap((v) => v.daily.map((d) => d.day)).sort().at(-1) ?? null;
  writeSnapshot('xema-history', 'Meteocat XEMA · dades obertes', valid, newest ? `${newest}T00:00:00Z` : null);
  recordFreshness({
    source: 'xema-history',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: newest ? `${newest}T00:00:00Z` : null,
    stalenessLimitMin: 60 * 36,
    rows: valid.length,
    apiCalls: calls,
  });

  console.log(`\n→ data/cache/xema-history.json (${((Date.now() - started) / 1000 / 60).toFixed(1)} min, ${calls} consultes)`);

  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat a l'emmagatzematge: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB`);
    if (pub.origin && process.env.BLOB_BASE_URL !== pub.origin) {
      console.log(`   BLOB_BASE_URL = ${pub.origin}`);
    }
  }
}

main().catch((err) => {
  recordFreshness({
    source: 'xema-history', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 36, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
