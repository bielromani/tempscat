/**
 * Google contra la fitxa, en privat.
 *
 * ## Per què a part
 *
 * La comparació diària (`forecast-verify.ts`) desa el que diu cada rival en
 * un tros **públic** del magatzem i el puntua l'endemà. Amb Google no es pot:
 * les condicions de la Weather API (Service Specific Terms, §22.2.1) només
 * deixen desar **trenta dies** la predicció del dia en curs («Today's
 * Forecast») i vint-i-quatre hores la dels dies següents, i prohibeixen fer-ne
 * servir el contingut per refer un producte del temps de Google (§22.1). Així
 * que aquí:
 *
 *  · només es demana **el dia en curs**, i a les 07:50, quan el dia de Google
 *    (que va de 07:00 a 07:00) ja ha començat;
 *  · es desa al cubell **privat** (`PUSH_R2_*`), el mateix de les
 *    subscripcions, mai al de les dades, que és públic;
 *  · l'endemà es puntua contra la XEMA i **s'esborra** el que deia Google: en
 *    queden només els errors acumulats, també al cubell privat;
 *  · no s'escriu cap xifra de Google al registre d'Actions, que en un
 *    repositori públic és públic. Els resultats els llegeix
 *    `npm run google:encert` en local.
 *
 * Res d'això surt al web.
 *
 * ## Què es compara, i contra què
 *
 * A la mateixa hora, de les mateixes ~140 estacions que representen el seu
 * poble (`headToHeadPairs()`): Google, la fitxa, yr.no i OpenWeather.
 *
 *  · `tMax`: la màxima del dia natural, contra la màxima de la XEMA de 00 a
 *    24 h. La de Google és la del seu dia de 07 a 07, però la màxima sempre cau
 *    de dia.
 *  · `tMinNit`: la mínima de 07:00 a 07:00 de l'endemà, que és com Google
 *    compta el dia. La seva mínima del dia és la de la matinada **següent**, i
 *    comparar-la amb la mínima natural seria comparar dues nits diferents. Es
 *    calcula igual per a la fitxa (de les seves hores) i per a yr.no, i la
 *    veritat és la mínima de la XEMA en la mateixa finestra. OpenWeather només
 *    dona el dia natural, i aquí no hi entra.
 *
 * Cada variable es puntua només a les estacions on totes les fonts del dia
 * tenen valor: amb pobles diferents, els números no es poden posar de costat.
 *
 * Mode `--dry`: tot menys Google, sense desar res, per provar-ho en local.
 *
 * Mode `--check`: una sola petició a Google i una a OpenWeather, per veure que
 * les claus funcionen. No desa res, i només diu si la resposta té el format
 * esperat.
 */
import {
  fitxaSeries, headToHeadPairs, madridDate, meteocatDaily, openWeatherDaily, yrnoSeries,
  type HeadToHead, type YrStep,
} from '../lib/head-to-head.ts';
import { fetchJson } from '../lib/http.ts';
import { DAILY_LIMITS, QuotaGuard, pullSnapshot } from '../lib/store.ts';
import type { PointForecast } from '../../src/lib/forecast-merge.ts';
import { DAILY_BIAS_SHARD, type DailyBias } from '../../src/lib/daily-bias.ts';
import { instantOf, madridToUtc } from '../../src/lib/format.ts';
import { FORECAST_INDEX, forecastShard, type ForecastIndex } from '../../src/lib/shards.ts';
import { deleteKey, getJson, listKeys, pushStoreConfig, putJson } from '../../src/lib/push-store.ts';
import type { S3Config } from '../../src/lib/s3-sign.ts';
import type { Tally } from '../../src/lib/verify.ts';

const PREFIX = 'privat/google/';
const PENDING = `${PREFIX}pendent/`;
const SCORES_KEY = `${PREFIX}encert.json`;
/** L'hora local de la captura: el dia de Google ja ha començat a les 07:00. */
const CAPTURE_HOUR = 7;
/** A partir d'aquesta hora de l'endemà, la XEMA ja té la finestra de 07 a 07. */
const SCORE_HOUR = 10;
/** Més vell que això, s'esborra encara que no s'hagi pogut puntuar. */
const MAX_KEEP_DAYS = 7;

const GOOGLE_BASE = 'https://weather.googleapis.com/v1/forecast/days:lookup';
const XEMA = 'https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json';

export const SOURCES = ['google', 'tempscat', 'yrno', 'openweather'] as const;
export type Source = typeof SOURCES[number];
export const VARS = ['tMax', 'tMinNit'] as const;
export type Var = typeof VARS[number];

type Values = Partial<Record<Var, number>>;
interface PendingDay {
  date: string;
  capturedAt: string;
  stations: Record<string, Partial<Record<Source, Values>>>;
}
export interface GoogleScores {
  scored: string[];
  vars: Partial<Record<Var, Partial<Record<Source, Tally>>>>;
  /** Estacions puntuades per variable i dia, per saber sobre quantes va cada número. */
  pairs: Partial<Record<Var, number>>;
}

interface ShardPoint { [model: string]: PointForecast }
interface ForecastShardData { points: Record<string, ShardPoint> }

const round1 = (v: number) => Math.round(v * 10) / 10;

function plusDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

function localNow(): { date: string; hour: number } {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  return { date: s.slice(0, 10), hour: Number(s.slice(11, 13)) };
}

/** Les 07:00 (o l'hora que sigui) d'un dia de Madrid, en mil·lisegons. */
function localMs(date: string, hour: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return madridToUtc(y, m, d, hour, 0).getTime();
}

/** La predicció de Google del dia `date`, del seu dia de 07 a 07. */
async function googleDay(h: HeadToHead, date: string, key: string, quota: QuotaGuard): Promise<Values> {
  const url = `${GOOGLE_BASE}?key=${encodeURIComponent(key)}`
    + `&location.latitude=${h.town.lat.toFixed(4)}&location.longitude=${h.town.lon.toFixed(4)}`
    + '&days=2&unitsSystem=METRIC';
  const body = await fetchJson<{
    forecastDays?: Array<{
      displayDate?: { year: number; month: number; day: number };
      maxTemperature?: { degrees?: number; unit?: string };
      minTemperature?: { degrees?: number; unit?: string };
    }>;
  }>(url, { timeoutMs: 30_000 });
  quota.spend('google', 1);
  if (!Array.isArray(body.forecastDays)) throw new Error('resposta sense `forecastDays`: ha canviat el format?');
  const day = body.forecastDays.find((d) => {
    const dd = d.displayDate;
    return dd && `${dd.year}-${String(dd.month).padStart(2, '0')}-${String(dd.day).padStart(2, '0')}` === date;
  });
  if (!day) throw new Error(`cap dia amb data ${date}`);
  const out: Values = {};
  const ok = (t?: { degrees?: number; unit?: string }) =>
    typeof t?.degrees === 'number' && (t.unit == null || t.unit === 'CELSIUS');
  if (ok(day.maxTemperature)) out.tMax = round1(day.maxTemperature!.degrees!);
  if (ok(day.minTemperature)) out.tMinNit = round1(day.minTemperature!.degrees!);
  return out;
}

/** La màxima del dia i la mínima de 07 a 07, de les hores de la fitxa. */
function fitxaValues(
  hourly: Array<{ time: string; temperature: number | null }>,
  daily: Array<{ date: string; tMax: number | null }>,
  date: string,
): Values {
  const out: Values = {};
  const d = daily.find((x) => x.date === date);
  if (d?.tMax != null) out.tMax = round1(d.tMax);
  const from = localMs(date, 7);
  const to = localMs(plusDays(date, 1), 7);
  const night = hourly
    .filter((h) => h.temperature != null)
    .map((h) => ({ ms: instantOf(h.time), t: h.temperature! }))
    .filter((h) => h.ms > from && h.ms <= to);
  if (night.length >= 22) out.tMinNit = round1(Math.min(...night.map((h) => h.t)));
  return out;
}

/**
 * El mateix de yr.no. Les hores que ja han passat no hi són, però la màxima és
 * de tarda; els trams de sis hores compten si cauen sencers dins de la finestra.
 */
function yrValues(series: YrStep[], date: string): Values {
  const out: Values = {};
  const dayEnd = localMs(plusDays(date, 1), 0);
  const highs: number[] = [];
  for (const s of series) {
    if (madridDate(s.ms) !== date) continue;
    if (s.t != null) highs.push(s.t);
    if (s.max6 != null && s.ms + 6 * 3_600_000 <= dayEnd) highs.push(s.max6);
  }
  if (highs.length >= 8) out.tMax = round1(Math.max(...highs));
  const from = localMs(date, 7);
  const to = localMs(plusDays(date, 1), 7);
  const lows: number[] = [];
  let covered = 0;
  for (const s of series) {
    if (s.ms > from && s.ms <= to && s.t != null) { lows.push(s.t); covered++; }
    if (s.min6 != null && s.ms >= from && s.ms + 6 * 3_600_000 <= to) lows.push(s.min6);
  }
  if (lows.length && covered >= 4) out.tMinNit = round1(Math.min(...lows));
  return out;
}

/** La fitxa de cada poble, llegida dels trossos de predicció com la pàgina. */
async function fitxes(pairs: HeadToHead[]): Promise<Map<string, ReturnType<typeof fitxaSeries>>> {
  const index = await pullSnapshot<ForecastIndex>(FORECAST_INDEX);
  if (!index) throw new Error('no hi ha índex de predicció');
  const wanted = new Set(pairs.map((p) => p.town.forecastPointId!));
  const found = new Map<string, ShardPoint>();
  for (const c of index.data.comarques) {
    const shard = await pullSnapshot<ForecastShardData>(forecastShard(c.codi));
    for (const [id, models] of Object.entries(shard?.data.points ?? {})) {
      if (wanted.has(id) && !found.has(id)) found.set(id, models);
    }
  }
  let bias: DailyBias | null = null;
  try { bias = (await pullSnapshot<DailyBias>(DAILY_BIAS_SHARD))?.data ?? null; } catch { bias = null; }
  const out = new Map<string, ReturnType<typeof fitxaSeries>>();
  for (const p of pairs) {
    const byModel = found.get(p.town.forecastPointId!);
    if (byModel) out.set(p.station.codi, fitxaSeries(p.town, p.station.codi, byModel, index.data.times, bias));
  }
  return out;
}

async function capture(
  store: S3Config | null, date: string, googleKey: string | null, quota: QuotaGuard,
): Promise<void> {
  const pairs = headToHeadPairs();
  const owmKey = process.env.OPENWEATHER_API_KEY;
  const ours = await fitxes(pairs);
  const day: PendingDay = { date, capturedAt: new Date().toISOString(), stations: {} };
  const failed: Record<string, number> = {};
  const fail = (s: string) => { failed[s] = (failed[s] ?? 0) + 1; };

  for (const p of pairs) {
    const slot: Partial<Record<Source, Values>> = {};
    if (googleKey) {
      try { slot.google = await googleDay(p, date, googleKey, quota); } catch { fail('google'); }
      if (!slot.google) continue;
    }
    const f = ours.get(p.station.codi);
    if (f) slot.tempscat = fitxaValues(f.hourly, f.daily, date);
    try { slot.yrno = yrValues(await yrnoSeries(p.town, quota), date); } catch { fail('yrno'); }
    if (owmKey) {
      try {
        const t = (await openWeatherDaily(p.town, owmKey, quota)).get(date)?.tMax;
        if (t != null) slot.openweather = { tMax: t };
      } catch { fail('openweather'); }
    }
    day.stations[p.station.codi] = slot;
  }
  const n = Object.keys(day.stations).length;
  console.log(`Captura del ${date}: ${n} de ${pairs.length} estacions · fallades ${JSON.stringify(failed)}`);
  if (!store) {
    for (const src of SOURCES) {
      for (const v of VARS) {
        const k = Object.values(day.stations).filter((st) => st[src]?.[v] != null).length;
        if (k) console.log(`  ${src} · ${v}: ${k}`);
      }
    }
    return;
  }
  if (!n) throw new Error('Google no ha tornat cap poble');
  await putJson(store, `${PENDING}${date}.json`, day);
}

/** La màxima natural i la mínima de 07 a 07 de cada estació, de la XEMA semihorària. */
async function truthOf(date: string): Promise<Map<string, Values>> {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
  const query = async (variable: string, fn: 'max' | 'min', from: number, to: number) => {
    const rows = await fetchJson<Array<{ codi_estacio: string; v: string; n: string }>>(
      `${XEMA}?` + new URLSearchParams({
        $select: `codi_estacio,${fn}(valor_lectura) as v,count(valor_lectura) as n`,
        $where: `data_lectura > '${iso(from)}' AND data_lectura <= '${iso(to)}' AND codi_variable='${variable}'`,
        $group: 'codi_estacio',
        $limit: '500',
      }),
      { timeoutMs: 60_000 },
    );
    // 48 lectures de mitja hora: amb més de quatre forats, el dia no és sencer.
    return new Map(rows.filter((r) => Number(r.n) >= 44 && Number.isFinite(Number(r.v)))
      .map((r) => [r.codi_estacio, Number(r.v)]));
  };
  const [max, min] = await Promise.all([
    query('40', 'max', localMs(date, 0), localMs(plusDays(date, 1), 0)),
    query('42', 'min', localMs(date, 7), localMs(plusDays(date, 1), 7)),
  ]);
  const out = new Map<string, Values>();
  for (const [codi, v] of max) (out.get(codi) ?? out.set(codi, {}).get(codi)!).tMax = round1(v);
  for (const [codi, v] of min) (out.get(codi) ?? out.set(codi, {}).get(codi)!).tMinNit = round1(v);
  return out;
}

async function score(store: S3Config, today: string, hour: number): Promise<void> {
  const keys = await listKeys(store, PENDING);
  if (!keys.length) return;
  const scores = (await getJson<GoogleScores>(store, SCORES_KEY)) ?? { scored: [], vars: {}, pairs: {} };
  let changed = false;

  for (const key of keys.sort()) {
    const date = key.slice(PENDING.length, PENDING.length + 10);
    const ready = today > plusDays(date, 1) || (today === plusDays(date, 1) && hour >= SCORE_HOUR);
    const stale = today > plusDays(date, MAX_KEEP_DAYS);
    if (!ready && !stale) continue;

    if (ready && !scores.scored.includes(date)) {
      const day = await getJson<PendingDay>(store, key);
      let truth: Map<string, Values> | null = null;
      try { truth = await truthOf(date); } catch (err) {
        console.log(`  Sense la XEMA del ${date}: ${(err as Error).message}`);
      }
      if (day && truth?.size) {
        for (const v of VARS) {
          const present = SOURCES.filter((s) => Object.values(day.stations).some((st) => st[s]?.[v] != null));
          if (!present.includes('google')) continue;
          let pairs = 0;
          for (const [codi, st] of Object.entries(day.stations)) {
            const got = truth.get(codi)?.[v];
            if (got == null || present.some((s) => st[s]?.[v] == null)) continue;
            pairs++;
            for (const s of present) {
              const t = ((scores.vars[v] ??= {})[s] ??= { n: 0, sumError: 0, sumAbs: 0 });
              const err = st[s]![v]! - got;
              t.n++;
              t.sumError += err;
              t.sumAbs += Math.abs(err);
            }
          }
          scores.pairs[v] = (scores.pairs[v] ?? 0) + pairs;
          console.log(`  ${date} · ${v}: ${pairs} estacions amb ${present.length} fonts`);
        }
        scores.scored.push(date);
        scores.scored.sort();
        changed = true;
      } else if (!stale) {
        continue; // es torna a provar a la volta següent
      }
    }
    // Puntuat, o massa vell: el que deia Google no es guarda més.
    await deleteKey(store, key);
    console.log(`  Esborrada la captura del ${date}.`);
  }
  if (changed) await putJson(store, SCORES_KEY, scores);
}

async function check(googleKey: string | undefined, quota: QuotaGuard): Promise<void> {
  const [p] = headToHeadPairs();
  const { date } = localNow();
  let bad = false;
  if (googleKey) {
    try {
      const g = await googleDay(p, date, googleKey, quota);
      const ok = g.tMax != null && g.tMinNit != null;
      console.log(`Google: ${ok ? 'resposta bona' : 'resposta sense màxima o mínima'}`);
      bad ||= !ok;
    } catch (err) {
      console.log(`Google: ${(err as Error).message.replace(/key=[^&\s]+/g, 'key=***')}`);
      bad = true;
    }
  } else {
    console.log('Google: no hi ha GOOGLE_WEATHER_API_KEY');
    bad = true;
  }
  const owmKey = process.env.OPENWEATHER_API_KEY;
  if (owmKey) {
    try {
      const days = await openWeatherDaily(p.town, owmKey, quota);
      const ok = days.get(date)?.tMax != null;
      console.log(`OpenWeather: ${ok ? `resposta bona, ${days.size} dies` : "resposta sense el dia d'avui"}`);
      bad ||= !ok;
    } catch (err) {
      console.log(`OpenWeather: ${(err as Error).message.replace(/appid=[^&\s]+/g, 'appid=***')}`);
      bad = true;
    }
  } else {
    console.log('OpenWeather: no hi ha OPENWEATHER_API_KEY');
    bad = true;
  }
  const meteocatKey = process.env.METEOCAT_API_KEY;
  if (meteocatKey) {
    try {
      const days = await meteocatDaily(p.ine6, meteocatKey, quota);
      const ok = days.get(date)?.tMax != null || days.get(plusDays(date, 1))?.tMax != null;
      console.log(`Meteocat: ${ok ? `resposta bona, ${days.size} dies` : 'resposta sense màximes: ha canviat el format?'}`);
      bad ||= !ok;
    } catch (err) {
      console.log(`Meteocat: ${(err as Error).message}`);
      bad = true;
    }
  } else {
    console.log('Meteocat: no hi ha METEOCAT_API_KEY');
  }
  console.log(`Cubell privat: ${pushStoreConfig() ? 'configurat' : 'no configurat'}`);
  if (bad) process.exitCode = 1;
}

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const googleKey = process.env.GOOGLE_WEATHER_API_KEY;
  if (process.argv.includes('--check')) return check(googleKey, quota);
  if (process.argv.includes('--dry')) {
    // Sense Google ni cubell: què en sortiria de la resta, i quantes estacions té la XEMA d'ahir.
    const { date } = localNow();
    await capture(null, date, null, quota);
    const truth = await truthOf(plusDays(date, -1));
    const k = (v: Var) => [...truth.values()].filter((t) => t[v] != null).length;
    console.log(`XEMA del ${plusDays(date, -1)}: tMax ${k('tMax')} · tMinNit ${k('tMinNit')}`);
    return;
  }

  const store = pushStoreConfig();
  if (!store || !googleKey) {
    console.log('Sense cubell privat o sense GOOGLE_WEATHER_API_KEY: no es compara amb Google.');
    return;
  }
  const { date, hour } = localNow();
  await score(store, date, hour);

  const force = process.argv.includes('--capture');
  if (hour === CAPTURE_HOUR || force) {
    const exists = (await getJson<PendingDay>(store, `${PENDING}${date}.json`)) != null;
    if (exists) console.log(`La captura del ${date} ja hi és.`);
    else await capture(store, date, googleKey, quota);
  }
}

main().catch((err) => {
  // L'URL porta la clau: que no surti mai al registre.
  console.error(String((err as Error)?.stack ?? err).replace(/(key|appid)=[^&\s]+/g, '$1=***'));
  process.exit(1);
});
