/**
 * El Meteocat contra la fitxa, en privat.
 *
 * ## Per què a part, i en privat
 *
 * El pla gratuït de l'API prohibeix difondre el que retorna, i els trossos de
 * `forecast-verify.ts` són al magatzem **públic**. Per això ni les prediccions
 * ni els resultats surten del cubell privat (`PUSH_R2_*`), i el registre
 * d'Actions, que també és públic, només porta recomptes. Els resultats els
 * llegeix `npm run google:encert` en local.
 *
 * ## Dues fonts
 *
 *  · `comarcal`: el fitxer de dades obertes, que amb **una sola petició i sense
 *    clau** dona la màxima i la mínima de demà i demà passat de les 43 capitals.
 *    Només compten les que tenen una estació que les representa
 *    (`headToHeadPairs()`). El Vallès Occidental no hi entra: dona un sol valor
 *    per a «Sabadell/Terrassa».
 *  · `municipal`: l'API, amb **100 prediccions al mes**. Tres municipis al dia,
 *    que van rodant, fins a quatre dies vista.
 *
 * ## Quan
 *
 * Corre cada hora i captura un cop al dia, a la primera volta que troba el
 * fitxer amb data d'avui. La fitxa es desa en aquell mateix moment: comparar el
 * que el Meteocat diu a la tarda amb el que dèiem al matí no seria just.
 *
 * El fitxer comarcal ve en graus sencers. Es desa també l'error de la fitxa
 * arrodonida (`oursRounded`), perquè l'arrodoniment sol no decideixi res.
 *
 * Mode `--dry`: llegeix el fitxer i la fitxa, i diu quantes parelles en
 * sortirien. No toca l'API ni desa res.
 */
import { headToHeadPairs, meteocatDaily, type HeadToHead } from '../lib/head-to-head.ts';
import { fetchWithRetry } from '../lib/http.ts';
import { fitxes, localMs, localNow, plusDays, xemaExtreme } from '../lib/private-verify.ts';
import { DAILY_LIMITS, QuotaGuard } from '../lib/store.ts';
import { deleteKey, getJson, listKeys, pushStoreConfig, putJson } from '../../src/lib/push-store.ts';
import type { S3Config } from '../../src/lib/s3-sign.ts';
import type { Tally } from '../../src/lib/verify.ts';

const COMARCAL = 'https://static-m.meteo.cat/content/opendata/ctermini_comarcal.xml';
const PREFIX = 'privat/meteocat/';
const PENDING = `${PREFIX}pendent/`;
export const METEOCAT_SCORES_KEY = `${PREFIX}encert.json`;
/** El pla de l'API són 100 al mes: 93 com a molt, i la comprovació no en gasta cap. */
const TOWNS_PER_DAY = 3;
const MAX_LEAD = 4;
/** L'endemà a partir d'aquesta hora, la XEMA ja té el dia sencer. */
const SCORE_HOUR = 3;
/** Passats aquests dies del seu dia, una parella sense mesura es descarta. */
const MAX_WAIT_DAYS = 7;

type Via = 'comarcal' | 'municipal';
interface Day { tMax: number | null; tMin: number | null }
interface Row { codi: string; via: Via; target: string; lead: number; ours: Day; theirs: Day }
interface Capture { issued: string; capturedAt: string; rows: Row[] }

export interface MeteocatTally { ours: Tally; oursRounded: Tally; theirs: Tally }
export interface MeteocatScores {
  /** `emès:dia`, i no un comptador: vegeu `Scores.scored` a `verify.ts`. */
  scored: string[];
  /** via → variable → antelació. */
  duels: Partial<Record<Via, Record<string, Record<string, MeteocatTally>>>>;
}

type Fitxes = Awaited<ReturnType<typeof fitxes>>;

/** El fitxer comarcal: la data d'emissió i, per capital, cada dia. */
function parseComarcal(xml: string): {
  issued: string; capitals: Array<{ comarca: string; nom: string; days: Map<string, Day> }>;
} {
  const attr = (tag: string, name: string) => tag.match(new RegExp(`\\b${name}="([^"]*)"`))?.[1];
  const iso = (dmy: string | undefined) => {
    const m = dmy?.match(/^(\d{2})-(\d{2})-(\d{4})/);
    if (!m) throw new Error('fitxer comarcal: una data no és DD-MM-AAAA');
    return `${m[3]}-${m[2]}-${m[1]}`;
  };
  const num = (v: string | undefined) => {
    const n = v?.trim() ? Number(v) : NaN;
    return Number.isFinite(n) ? n : null;
  };
  const issued = iso(attr(xml.match(/<smc\b[^>]*>/)?.[0] ?? '', 'datacreacio'));
  const noms = new Map([...xml.matchAll(/<comarca\b[^>]*>/g)]
    .map(([tag]) => [attr(tag, 'id')!, attr(tag, 'nomCAPITALCO')!]));
  const capitals = [...xml.matchAll(/<prediccio\b([^>]*)>([\s\S]*?)<\/prediccio>/g)].map(([, head, body]) => {
    const id = attr(head, 'idcomarca')!;
    const days = new Map([...body.matchAll(/<variable\b[^>]*>/g)].map(([tag]) => [
      iso(attr(tag, 'data')), { tMax: num(attr(tag, 'tempmax')), tMin: num(attr(tag, 'tempmin')) },
    ]));
    return { comarca: id.padStart(2, '0'), nom: noms.get(id) ?? '', days };
  });
  if (capitals.length < 40) throw new Error(`fitxer comarcal amb ${capitals.length} comarques: ha canviat el format?`);
  return { issued, capitals };
}

/** Les parelles d'un poble: el que diuen ells i el que diu la fitxa, dia a dia. */
function rowsOf(p: HeadToHead, via: Via, days: Map<string, Day>, issued: string, ours: Fitxes): Row[] {
  const f = ours.get(p.station.codi);
  if (!f) return [];
  const out: Row[] = [];
  for (let lead = 1; lead <= MAX_LEAD; lead++) {
    const target = plusDays(issued, lead);
    const theirs = days.get(target);
    const d = f.daily.find((x) => x.date === target);
    // Un dia a mitges dona una màxima feta amb la matinada.
    const hours = f.hourly.filter((h) => h.time.slice(0, 10) === target && h.temperature != null).length;
    if (!theirs || !d || hours < 23 || theirs.tMax == null || theirs.tMin == null) continue;
    out.push({ codi: p.station.codi, via, target, lead, theirs, ours: { tMax: d.tMax, tMin: d.tMin } });
  }
  return out;
}

async function capture(store: S3Config | null, today: string, quota: QuotaGuard): Promise<void> {
  const key = `${PENDING}${today}.json`;
  if (store && await getJson<Capture>(store, key)) return;

  const res = await fetchWithRetry(COMARCAL, { timeoutMs: 30_000 });
  const { issued, capitals } = parseComarcal(await res.text());
  if (issued !== today) {
    console.log(`El fitxer comarcal encara és del ${issued}.`);
    return;
  }
  const pairs = headToHeadPairs();
  const ours = await fitxes(pairs);
  const cap: Capture = { issued, capturedAt: new Date().toISOString(), rows: [] };
  for (const c of capitals) {
    for (const p of pairs.filter((x) => x.town.comarcaCodi === c.comarca && x.town.nom === c.nom)) {
      cap.rows.push(...rowsOf(p, 'comarcal', c.days, issued, ours));
    }
  }
  const stations = new Set(cap.rows.map((r) => r.codi)).size;
  console.log(`Fitxer comarcal del ${issued}: ${stations} estacions · ${cap.rows.length} parelles`);
  if (!cap.rows.length) throw new Error('cap capital del fitxer comarcal coincideix amb cap poble');
  if (!store) return;
  // Abans de l'API: si petés, la volta següent no en tornaria a gastar la quota.
  await putJson(store, key, cap);

  const apiKey = process.env.METEOCAT_API_KEY;
  if (!apiKey) return;
  const ines = [...new Set(pairs.map((p) => p.ine))].sort();
  const start = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000) * TOWNS_PER_DAY;
  let got = 0;
  for (let k = 0; k < TOWNS_PER_DAY; k++) {
    const ine = ines[(start + k) % ines.length];
    const here = pairs.filter((p) => p.ine === ine);
    try {
      const days = await meteocatDaily(here[0].ine6, apiKey, quota);
      for (const p of here) cap.rows.push(...rowsOf(p, 'municipal', days, issued, ours));
      got++;
    } catch (err) {
      console.log(`  API del Meteocat: ${(err as Error).message}`);
      break;
    }
  }
  console.log(`API del Meteocat: ${got} municipis`);
  if (got) await putJson(store, key, cap);
}

const empty = (): Tally => ({ n: 0, sumError: 0, sumAbs: 0 });
function add(t: Tally, err: number): void {
  t.n++;
  t.sumError += err;
  t.sumAbs += Math.abs(err);
}

type Truth = { tMax: Map<string, number>; tMin: Map<string, number> };

async function truthOf(target: string): Promise<Truth | null> {
  const [from, to] = [localMs(target, 0), localMs(plusDays(target, 1), 0)];
  try {
    const [tMax, tMin] = await Promise.all([
      xemaExtreme('40', 'max', from, to), xemaExtreme('42', 'min', from, to),
    ]);
    return tMax.size && tMin.size ? { tMax, tMin } : null;
  } catch (err) {
    console.log(`  Sense la XEMA del ${target}: ${(err as Error).message}`);
    return null;
  }
}

async function score(store: S3Config, today: string, hour: number): Promise<void> {
  const keys = (await listKeys(store, PENDING)).sort();
  if (!keys.length) return;
  const scores = (await getJson<MeteocatScores>(store, METEOCAT_SCORES_KEY)) ?? { scored: [], duels: {} };
  const truth = new Map<string, Truth | null>();

  for (const key of keys) {
    const cap = await getJson<Capture>(store, key);
    if (!cap) continue;
    const done = new Set<string>();
    let changed = false;
    for (const target of [...new Set(cap.rows.map((r) => r.target))].sort()) {
      const ready = today > plusDays(target, 1) || (today > target && hour >= SCORE_HOUR);
      if (!ready) continue;
      const id = `${cap.issued}:${target}`;
      // Ja comptat: la volta que ho va fer no va arribar a aprimar la captura.
      if (scores.scored.includes(id)) { done.add(target); continue; }
      if (!truth.has(target)) truth.set(target, await truthOf(target));
      const real = truth.get(target);
      if (!real) {
        if (today > plusDays(target, MAX_WAIT_DAYS)) done.add(target);
        continue;
      }
      let n = 0;
      for (const r of cap.rows.filter((x) => x.target === target)) {
        for (const v of ['tMax', 'tMin'] as const) {
          const got = real[v].get(r.codi);
          const a = r.ours[v];
          const b = r.theirs[v];
          if (got == null || a == null || b == null) continue;
          const d = (((scores.duels[r.via] ??= {})[v] ??= {})[String(r.lead)]
            ??= { ours: empty(), oursRounded: empty(), theirs: empty() });
          add(d.ours, a - got);
          add(d.oursRounded, Math.round(a) - got);
          add(d.theirs, b - got);
          n++;
        }
      }
      console.log(`  Puntuat ${target} (emès el ${cap.issued}): ${n} comparacions`);
      scores.scored.push(id);
      changed = true;
      done.add(target);
    }
    // Primer el registre: al revés, un tall entremig perdria les parelles.
    if (changed) await putJson(store, METEOCAT_SCORES_KEY, scores);
    if (!done.size) continue;
    cap.rows = cap.rows.filter((r) => !done.has(r.target));
    if (cap.rows.length) await putJson(store, key, cap);
    else await deleteKey(store, key);
  }
}

async function main() {
  const quota = new QuotaGuard(DAILY_LIMITS);
  const { date, hour } = localNow();
  if (process.argv.includes('--dry')) return capture(null, date, quota);
  const store = pushStoreConfig();
  if (!store) {
    console.log('Sense cubell privat: no es compara amb el Meteocat.');
    return;
  }
  await score(store, date, hour);
  await capture(store, date, quota);
}

// `google-encert.ts` n'importa la clau: no s'ha d'executar en carregar-lo.
if (process.argv[1]?.endsWith('meteocat-verify.ts')) {
  main().catch((err) => {
    console.error(String((err as Error)?.stack ?? err));
    process.exit(1);
  });
}
