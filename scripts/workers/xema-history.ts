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
import { DAILY_LIMITS, QuotaGuard, readSnapshot, recordFreshness, writeSnapshot } from '../lib/store.ts';
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

async function main() {
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
  const results = await throttledMap(
    targets,
    async (s) => {
      const [daily, series] = await Promise.all([
        dailySeries(s.codi, from),
        fullSeries(s.codi),
      ]);
      calls += 2;

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
          tMaxAbs, tMinAbs, precipMaxDay, precipMax1h, gustMax,
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

  /*
   * Con `--station=`, el resultado se **fusiona** sobre el snapshot anterior.
   *
   * Antes lo sustituía, y eso convertía una comprobación de una estación en un
   * fichero con una sola estación: el bloque de clima desaparecía de las 4.293
   * páginas hasta la siguiente ejecución completa, sin que nada diera error.
   * Pasó al probar la rosa de los vientos.
   */
  let valid = fresh;
  if (onlyOne) {
    const previous = readSnapshot<StationHistory[]>('xema-history')?.data ?? [];
    const byStation = new Map(previous.map((h) => [h.station, h]));
    for (const h of fresh) byStation.set(h.station, h);
    valid = [...byStation.values()].sort((a, b) => a.station.localeCompare(b.station));
    console.log(`Mode --station: ${fresh.length} refrescada(es), ${previous.length} conservades`);
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
}

main().catch((err) => {
  recordFreshness({
    source: 'xema-history', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 36, rows: 0, apiCalls: 0, error: String(err).slice(0, 300),
  });
  console.error(err);
  process.exit(1);
});
