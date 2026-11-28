/**
 * El que comparteixen les comparacions privades (`google-verify.ts` i
 * `meteocat-verify.ts`): les dates de Madrid, la fitxa de cada poble i la
 * veritat de la XEMA.
 */
import { fitxaSeries, type HeadToHead } from './head-to-head.ts';
import { fetchJson } from './http.ts';
import { pullSnapshot } from './store.ts';
import type { PointForecast } from '../../src/lib/forecast-merge.ts';
import { DAILY_BIAS_SHARD, type DailyBias } from '../../src/lib/daily-bias.ts';
import { madridToUtc } from '../../src/lib/format.ts';
import { FORECAST_INDEX, forecastShard, type ForecastIndex } from '../../src/lib/shards.ts';

const XEMA = 'https://analisi.transparenciacatalunya.cat/resource/nzvn-apee.json';

interface ShardPoint { [model: string]: PointForecast }
interface ForecastShardData { points: Record<string, ShardPoint> }

export function plusDays(iso: string, n: number): string {
  return new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
}

export function localNow(): { date: string; hour: number } {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  return { date: s.slice(0, 10), hour: Number(s.slice(11, 13)) };
}

/** Les 07:00 (o l'hora que sigui) d'un dia de Madrid, en mil·lisegons. */
export function localMs(date: string, hour: number): number {
  const [y, m, d] = date.split('-').map(Number);
  return madridToUtc(y, m, d, hour, 0).getTime();
}

/** La fitxa de cada poble, llegida dels trossos de predicció com la pàgina. */
export async function fitxes(pairs: HeadToHead[]): Promise<Map<string, ReturnType<typeof fitxaSeries>>> {
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

/** La màxima o la mínima de cada estació entre dos instants, de la XEMA semihorària. */
export async function xemaExtreme(
  variable: string, fn: 'max' | 'min', from: number, to: number,
): Promise<Map<string, number>> {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 19);
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
}
