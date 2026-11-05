/**
 * Worker · la temperatura de la fitxa contra la de yr.no, hora a hora.
 *
 * La comparació diària (`forecast-verify.ts`) mira la màxima i la mínima, que
 * és el que dona tothom per a demà. Aquí es mira el número que es consulta
 * cada matí: **la temperatura d'ara**, i la de **cada hora de demà**. Només
 * contra yr.no, perquè és l'únic que la dona per a un lloc i hora a hora en
 * una API oberta (l'AEMET dona la diària; Google i Apple, res que es pugui
 * desar).
 *
 * ## Les dues meitats, com a la diària
 *
 * **Capturar** (cada hora): el que ensenya ara la fitxa de cada poble —la xifra
 * que el worker d'observació calcula cada deu minuts, a la cota del poble, com
 * `currentFor()`— i el que diu yr.no **del mateix instant**. Sense desar-ho no
 * es podria comparar mai: ni la fitxa ni yr.no guarden què deien fa una hora.
 * Les hores de demà les desa la diària, que ja demana la sèrie sencera.
 *
 * **Puntuar** (un cop per dia UTC tancat): contra la lectura de la XEMA de
 * l'estació que representa el poble (`headToHeadPairs()`). La XEMA llegeix cada
 * mitja hora; la temperatura d'un instant qualsevol s'interpola entre les dues
 * lectures que l'envolten, i la d'una hora en punt és la lectura d'aquella hora.
 *
 * Cada comparació entra a les dues bandes alhora o a cap, com `Scores.duels`.
 *
 * Sortida: verify/hora/<dia UTC>-ara.json i verify/hora-encert.json
 */
import { soqlAll } from '../lib/socrata.ts';
import {
  QuotaGuard, DAILY_LIMITS, publish, pullSnapshot, recordFreshness, reportFailure, syncState, writeSnapshot,
} from '../lib/store.ts';
import { headToHeadPairs, yrnoAt, yrnoSeries, type YrStep } from '../lib/head-to-head.ts';
import { LAPSE_RATE } from '../../src/lib/variables.ts';
import { NOW_SHARD, type NowTemperature } from '../../src/lib/now-temperature.ts';
import {
  aheadShard, emptyHourlyScores, hourlyScoresShard, nowShard,
  type AheadCapture, type HourPair, type HourlyScores, type NowCapture, type Tally,
} from '../../src/lib/verify.ts';

const SOURCE = 'hourly-verify';

/** Una xifra de la fitxa més vella no és la que ensenya la pàgina (`NOW_MAX_AGE_MIN`). */
const NOW_MAX_AGE_MIN = 30;
/**
 * Quan es pot puntuar un dia UTC: la XEMA arriba amb 45–65 minuts de retard,
 * així que la lectura de les 23:30 no hi és fins ben passada la mitjanit.
 */
const SCORE_AFTER_H = 3;
/** Quants dies enrere es mira si n'hi ha cap per puntuar. */
const LOOKBACK_DAYS = 4;
/**
 * Una lectura que s'allunya tant de les dues prediccions és el termòmetre, no
 * el temps: castigaria les dues igual i no diria res de cap.
 */
const BOTH_WRONG_C = 12;

interface Reading { codi_estacio: string; data_lectura: string; valor_lectura: string }

function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function add(t: Tally, err: number): void {
  t.n++;
  t.sumError += err;
  t.sumAbs += Math.abs(err);
}

async function main() {
  await syncState(SOURCE);
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();
  const pairs = headToHeadPairs();

  // ── 1. Capturar l'ara ───────────────────────────────────────────────────
  const snap = await pullSnapshot<NowTemperature>(NOW_SHARD);
  const at = snap ? Date.parse(snap.data.at) : NaN;
  const ageMin = (Date.now() - at) / 60_000;
  let captured = 0;
  if (!snap || !Number.isFinite(at) || ageMin > NOW_MAX_AGE_MIN) {
    console.log(`La xifra d'ara de les fitxes no hi és o té ${Math.round(ageMin)} min: no es captura res.`);
  } else {
    const instant = new Date(at).toISOString();
    const row: Record<string, HourPair> = {};
    let failed = 0;
    for (const { station, town } of pairs) {
      const p = snap.data.points[town.forecastPointId!];
      if (!p) continue;
      // La mateixa conversió que `estimateFor()` a la pàgina.
      const ours = town.altitud != null ? p.t - (town.altitud - p.e) * LAPSE_RATE : p.t;
      let series: YrStep[];
      try {
        series = await yrnoSeries(town, quota);
      } catch (err) {
        failed++;
        console.log(`  yr.no ${town.nom}: ${(err as Error).message}`);
        continue;
      }
      const theirs = yrnoAt(series, at);
      if (theirs == null) continue;
      row[station.codi] = { tempscat: Math.round(ours * 10) / 10, yrno: theirs };
    }
    captured = Object.keys(row).length;
    const day = instant.slice(0, 10);
    const prev = (await pullSnapshot<NowCapture>(nowShard(day)))?.data;
    writeSnapshot(nowShard(day), 'Open-Meteo + Meteocat XEMA + MET Norway', { ...(prev ?? {}), [instant]: row }, instant);
    console.log(`Ara (${instant}): ${captured} estacions amb les dues xifres · yr.no fallades: ${failed}`);
  }

  // ── 2. Puntuar els dies UTC tancats ─────────────────────────────────────
  const stored = (await pullSnapshot<HourlyScores>(hourlyScoresShard()))?.data;
  const scores: HourlyScores = stored?.scored ? stored : emptyHourlyScores();
  const nowUtc = new Date();
  const todayUtc = nowUtc.toISOString().slice(0, 10);
  const ready = (d: string) => Date.parse(`${plusDays(d, 1)}T00:00:00Z`) + SCORE_AFTER_H * 3_600_000 <= nowUtc.getTime();
  const days = Array.from({ length: LOOKBACK_DAYS }, (_, i) => plusDays(todayUtc, -1 - i))
    .filter((d) => ready(d) && !scores.scored.includes(d))
    .reverse();

  const codis = new Set(pairs.map((p) => p.station.codi));
  for (const day of days) {
    const capture = {
      now: (await pullSnapshot<NowCapture>(nowShard(day)))?.data ?? {},
      ahead: (await pullSnapshot<AheadCapture>(aheadShard(day)))?.data ?? {},
    };
    if (!Object.keys(capture.now).length && !Object.keys(capture.ahead).length) {
      console.log(`${day}: no es va capturar res.`);
      continue;
    }

    // Les lectures del dia, amb mitja hora a cada banda per poder interpolar.
    const rows = await soqlAll<Reading>('nzvn-apee', {
      select: 'codi_estacio,data_lectura,valor_lectura',
      where: `codi_variable='32' AND data_lectura >= '${plusDays(day, -1)}T23:30:00'`
        + ` AND data_lectura <= '${plusDays(day, 1)}T00:30:00'`,
      order: 'data_lectura,codi_estacio',
    });
    // estació → instant (ms) → °C
    const truth = new Map<string, Map<number, number>>();
    for (const r of rows) {
      if (!codis.has(r.codi_estacio)) continue;
      const v = Number(r.valor_lectura);
      if (!Number.isFinite(v)) continue;
      const ms = Date.parse(`${r.data_lectura.slice(0, 19)}Z`);
      (truth.get(r.codi_estacio) ?? truth.set(r.codi_estacio, new Map()).get(r.codi_estacio)!).set(ms, v);
    }
    if (!truth.size) {
      console.log(`${day}: la XEMA encara no té lectures; es tornarà a provar.`);
      continue;
    }

    const measuredAt = (codi: string, ms: number): number | null => {
      const byTime = truth.get(codi);
      if (!byTime) return null;
      const half = 30 * 60_000;
      const a = Math.floor(ms / half) * half;
      const va = byTime.get(a);
      if (a === ms) return va ?? null;
      const vb = byTime.get(a + half);
      if (va == null || vb == null) return null;
      return va + (vb - va) * ((ms - a) / half);
    };

    let nNow = 0;
    let nAhead = 0;
    let skipped = 0;
    const score = (slot: { ours: Tally; theirs: Tally }, pair: HourPair, got: number): boolean => {
      const eo = pair.tempscat - got;
      const et = pair.yrno - got;
      if (Math.abs(eo) > BOTH_WRONG_C && Math.abs(et) > BOTH_WRONG_C) {
        skipped++;
        return false;
      }
      add(slot.ours, eo);
      add(slot.theirs, et);
      return true;
    };
    for (const [instant, byStation] of Object.entries(capture.now)) {
      const ms = Date.parse(instant);
      for (const [codi, pair] of Object.entries(byStation)) {
        const got = measuredAt(codi, ms);
        if (got != null && score(scores.now, pair, got)) nNow++;
      }
    }
    for (const [hour, byStation] of Object.entries(capture.ahead)) {
      const ms = Date.parse(`${hour}:00:00Z`);
      for (const [codi, pair] of Object.entries(byStation)) {
        const got = measuredAt(codi, ms);
        if (got != null && score(scores.ahead, pair, got)) nAhead++;
      }
    }
    scores.scored.push(day);
    scores.scored.sort();
    console.log(
      `Puntuat ${day}: ${nNow} d'ara i ${nAhead} d'hores de demà`
      + (skipped ? ` · ${skipped} descartades per termòmetre` : ''),
    );
  }

  const mae = (t: Tally) => (t.n ? (t.sumAbs / t.n).toFixed(2) : '—');
  console.log(
    `Acumulat · ara: fitxa ${mae(scores.now.ours)} °C, yr.no ${mae(scores.now.theirs)} °C (${scores.now.ours.n})`
    + ` · hores de demà: fitxa ${mae(scores.ahead.ours)} °C, yr.no ${mae(scores.ahead.theirs)} °C (${scores.ahead.ours.n})`,
  );
  writeSnapshot(hourlyScoresShard(), 'Open-Meteo + Meteocat XEMA + MET Norway', scores, scores.scored.at(-1) ?? null);

  recordFreshness({
    source: SOURCE,
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: Number.isFinite(at) ? new Date(at).toISOString() : null,
    // Corre cada hora; amb tres sense capturar res, alguna cosa no va.
    stalenessLimitMin: 3 * 60,
    rows: captured,
    apiCalls: captured,
  });
  console.log(`${((Date.now() - started) / 1000).toFixed(1)} s · ${quota.report()}`);
  const pub = await publish();
  if (!pub.skipped) console.log(`Publicat: ${pub.uploaded} fitxers`);
}

main().catch((err) => reportFailure({
  source: SOURCE, lastSuccessAt: '', lastDataTs: null,
  stalenessLimitMin: 3 * 60, rows: 0, apiCalls: 0,
}, err));
