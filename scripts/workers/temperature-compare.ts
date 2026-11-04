/**
 * Worker · la temperatura d'ara d'aquest web contra la dels models.
 *
 * El què i el perquè són a `src/lib/temperature-compare.ts`. Aquí, el com.
 *
 * ## Per què no cal esperar un mes
 *
 * La verificació de la predicció (`forecast-verify.ts`) ha de capturar cada
 * dia el que diuen els models, perquè la predicció d'ahir ja no existeix
 * enlloc. Aquí la pregunta és una altra —què deia el model per a l'hora que
 * acaba de passar— i Open-Meteo sí que ho guarda: l'API de predicció
 * històrica enganxa, hora a hora, la sortida més recent de cada model. Així
 * que el primer cop es recuperen els trenta dies anteriors de cop, i després
 * cada volta només el dia que falta.
 *
 * ## Les tres decisions que fan que el número sigui honest
 *
 * **La nostra xifra es fa exactament com la fa una fitxa**: la veïna amb menys
 * `stationCost` dins de 60 km, i la lectura corregida per la diferència de
 * cota amb el mateix gradient. Si aquí es fes més llest que a la pàgina, es
 * mesuraria un mètode que ningú no veu.
 *
 * **El model rep la cota de l'estació** (`elevation=`). Open-Meteo hi baixa la
 * temperatura de la seva casella, que és el mateix que fem nosaltres amb la
 * veïna. Sense, se'l castigaria per una diferència d'altura que ell mateix sap
 * corregir.
 *
 * **Una hora només compta si totes les fonts hi tenen valor.** Si AROME no
 * cobreix un punt, o la veïna no havia enviat la lectura, aquella hora no
 * entra per a ningú: comparar mitjanes fetes sobre hores diferents és
 * comparar dies diferents.
 *
 * I abans de res, el control de qualitat de sempre (`suspectTemperatures`):
 * un termòmetre que les veïnes desmenteixen no pot fer de veritat —castigaria
 * tothom igual— ni de veïna —castigaria només el nostre mètode—.
 *
 * Sortida: compare/temperatura.json
 */
import { readFileSync } from 'node:fs';
import { build } from '../lib/paths.ts';
import { fetchWithRetry } from '../lib/http.ts';
import { soqlAll } from '../lib/socrata.ts';
import { haversineKm, stationCost } from '../lib/geo.ts';
import {
  DAILY_LIMITS, QuotaGuard, publish, pullSnapshot, recordFreshness, reportFailure, syncState, writeSnapshot,
} from '../lib/store.ts';
import { LAPSE_RATE, callWeight } from '../../src/lib/variables.ts';
import { suspectTemperatures } from '../../src/lib/temperature-check.ts';
import {
  BACKFILL_DAYS, COMPARE_MODELS, COMPARE_SHARD, COMPARE_SOURCES, GUIDED, NEIGHBOUR_MAX_KM, OURS,
  emptyCompare, emptyCompareTally, type CompareScores, type CompareSource, type CompareTally,
} from '../../src/lib/temperature-compare.ts';

const SOURCE = 'temperature-compare';

/** Estacions per petició a Open-Meteo: la URL porta tres llistes de coordenades. */
const CHUNK = 50;

interface Station {
  codi: string; nom: string; lat: number; lon: number;
  altitud: number | null; operativa: boolean;
}
type MeasuredStation = Station & { altitud: number };

interface Reading { codi_estacio: string; data_lectura: string; valor_lectura: string }

interface HistoricalResponse {
  hourly?: Record<string, Array<number | null> | string[]>;
}

/** `2026-09-09` més `n` dies. */
function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** `--days=7`: quants dies enrere es miren. Per defecte, els del farciment. */
function daysArg(): number {
  const arg = process.argv.find((a) => a.startsWith('--days='));
  const n = arg ? Number(arg.slice(7)) : BACKFILL_DAYS;
  if (!Number.isInteger(n) || n < 1 || n > 90) throw new Error(`--days ha de ser un enter entre 1 i 90: ${arg}`);
  return n;
}

/**
 * La temperatura de la XEMA a les hores en punt, per estació i per hora UTC.
 *
 * La XEMA data en temps universal, igual que el que es demana a Open-Meteo
 * (`timezone=GMT`): així una hora és la mateixa hora a les dues bandes sense
 * cap conversió que es pugui equivocar el dia del canvi d'horari.
 */
async function measured(from: string, toExclusive: string): Promise<Map<string, Map<string, number>>> {
  const rows = await soqlAll<Reading>('nzvn-apee', {
    select: 'codi_estacio,data_lectura,valor_lectura',
    where: `codi_variable='32' AND data_lectura >= '${from}T00:00:00'`
      + ` AND data_lectura < '${toExclusive}T00:00:00' AND date_extract_mm(data_lectura) = 0`,
    order: 'data_lectura,codi_estacio',
  });
  // hora (`2026-11-02T05`) → estació → °C
  const out = new Map<string, Map<string, number>>();
  for (const r of rows) {
    const v = Number(r.valor_lectura);
    if (!Number.isFinite(v)) continue;
    const hour = r.data_lectura.slice(0, 13);
    let m = out.get(hour);
    if (!m) out.set(hour, (m = new Map()));
    m.set(r.codi_estacio, v);
  }
  console.log(`XEMA: ${rows.length} lectures en ${out.size} hores`);
  return out;
}

/**
 * El que deia cada model per a cada estació, per hora UTC.
 *
 * Les tres llistes —latitud, longitud i cota— van en paral·lel i en el mateix
 * ordre. `nan` sense cometes surt quan un punt cau fora del domini d'un model
 * (AROME no arriba a tot arreu), i no és JSON vàlid.
 */
async function modelled(
  stations: MeasuredStation[], from: string, to: string, quota: QuotaGuard,
): Promise<Map<string, Map<string, Partial<Record<CompareSource, number>>>>> {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  // estació → hora → model → °C
  const out = new Map<string, Map<string, Partial<Record<CompareSource, number>>>>();
  for (let i = 0; i < stations.length; i += CHUNK) {
    const chunk = stations.slice(i, i + CHUNK);
    const units = callWeight(COMPARE_MODELS.length, days, chunk.length);
    if (!quota.canSpend('open-meteo', units)) {
      throw new Error(`sense quota d'Open-Meteo per a ${Math.round(units)} unitats`);
    }
    const params = new URLSearchParams({
      latitude: chunk.map((s) => s.lat).join(','),
      longitude: chunk.map((s) => s.lon).join(','),
      elevation: chunk.map((s) => s.altitud).join(','),
      hourly: 'temperature_2m',
      models: COMPARE_MODELS.join(','),
      timezone: 'GMT',
      start_date: from,
      end_date: to,
    });
    const url = `https://historical-forecast-api.open-meteo.com/v1/forecast?${params}`;
    const res = await fetchWithRetry(url, { retries: 4, backoffMs: 5_000, timeoutMs: 90_000 });
    quota.spend('open-meteo', units);
    const text = (await res.text()).replace(/:\s*-?nan\b/gi, ':null').replace(/([[,])\s*-?nan\b/gi, '$1null');
    const data = JSON.parse(text) as HistoricalResponse | HistoricalResponse[];
    const list = Array.isArray(data) ? data : [data];

    list.forEach((r, k) => {
      const s = chunk[k];
      const times = r.hourly?.time as string[] | undefined;
      if (!s || !times) return;
      const byHour = new Map<string, Partial<Record<CompareSource, number>>>();
      times.forEach((t, j) => {
        const slot: Partial<Record<CompareSource, number>> = {};
        for (const m of COMPARE_MODELS) {
          const v = (r.hourly?.[`temperature_2m_${m}`] as Array<number | null> | undefined)?.[j];
          if (v != null && Number.isFinite(v)) slot[m] = v;
        }
        byHour.set(t.slice(0, 13), slot);
      });
      out.set(s.codi, byHour);
    });
  }
  return out;
}

function add(t: CompareTally, err: number): void {
  t.n++;
  t.sumError += err;
  t.sumAbs += Math.abs(err);
  if (Math.abs(err) > 3) t.gt3++;
}

async function main() {
  await syncState(SOURCE);
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const stations = (JSON.parse(readFileSync(build('stations.json'), 'utf8')) as Station[])
    .filter((s): s is MeasuredStation => s.operativa && s.altitud != null
      && Number.isFinite(s.lat) && Number.isFinite(s.lon));
  const meta = new Map(stations.map((s) => [s.codi, s]));

  const stored = (await pullSnapshot<CompareScores>(COMPARE_SHARD))?.data;
  /*
   * Amb una font de més o de menys, es torna a començar, i el farciment de
   * trenta dies ho refà en una sola volta. Afegir-la al registre vell la
   * deixaria amb un dia d'hores contra trenta de les altres, i la «mitjana» de
   * cadascuna seria d'uns dies diferents.
   */
  const sameSources = stored?.sources?.join() === COMPARE_SOURCES.join();
  if (stored && !sameSources) console.log('Les fonts han canviat: el registre es torna a començar.');
  const scores: CompareScores = stored?.scored && sameSources ? stored : emptyCompare();

  /*
   * Els dies que falten, i només aquests.
   *
   * El dia d'avui no: encara no s'ha acabat. I es compta en UTC perquè és com
   * data la XEMA; un dia «local» faria que una hora de la nit entrés a dos dies
   * o a cap.
   */
  const todayUtc = new Date().toISOString().slice(0, 10);
  const window = Array.from({ length: daysArg() }, (_, i) => plusDays(todayUtc, -1 - i)).reverse();
  const missing = window.filter((d) => !scores.scored.includes(d));
  if (!missing.length) {
    console.log('Cap dia pendent: no es baixa res.');
  }

  let compared = 0;
  let apiCalls = 0;
  const newlyScored: string[] = [];

  if (missing.length) {
    const from = missing[0];
    const to = missing.at(-1)!;
    console.log(`Dies pendents: ${missing.length} (${from} → ${to})`);

    const truthByHour = await measured(from, plusDays(to, 1));

    /*
     * Els models, només per als dies que la XEMA ja té, i en trams seguits.
     *
     * Un dia que la XEMA no ha publicat —en té, de forats— seguiria pendent i,
     * demanant de la primera data pendent a l'última, cada volta tornaria a
     * pagar el tram sencer fins que sortís de la finestra. La XEMA no costa
     * quota i Open-Meteo sí: primer es mira què hi ha, i després es paga.
     */
    const daysMeasured = new Set([...truthByHour.keys()].map((h) => h.slice(0, 10)));
    const withData = missing.filter((d) => daysMeasured.has(d));
    const runs: string[][] = [];
    for (const d of withData) {
      const last = runs.at(-1);
      if (last && plusDays(last.at(-1)!, 1) === d) last.push(d);
      else runs.push([d]);
    }
    const models = new Map<string, Map<string, Partial<Record<CompareSource, number>>>>();
    for (const run of runs) {
      for (const [codi, byHour] of await modelled(stations, run[0], run.at(-1)!, quota)) {
        const into = models.get(codi) ?? new Map();
        for (const [h, v] of byHour) into.set(h, v);
        models.set(codi, into);
      }
      apiCalls += Math.ceil(stations.length / CHUNK);
    }

    const perDay = new Map<string, number>();
    for (const [hour, readings] of truthByHour) {
      const day = hour.slice(0, 10);
      if (!missing.includes(day)) continue;

      /*
       * Les lectures que les veïnes desmenteixen surten d'aquesta hora: ni fan
       * de veritat ni de veïna. La mateixa funció que el worker d'observació,
       * amb els mateixos llindars.
       */
      const points = [...readings].flatMap(([codi, t]) => {
        const s = meta.get(codi);
        return s ? [{ codi, lat: s.lat, lon: s.lon, altitud: s.altitud, t }] : [];
      });
      const suspect = new Set(suspectTemperatures(points).map((x) => x.codi));
      const good = points.filter((p) => !suspect.has(p.codi));

      for (const p of good) {
        // La veïna, triada com la tria el build per a una fitxa.
        let best: { q: typeof p; d: number; cost: number } | null = null;
        for (const q of good) {
          if (q.codi === p.codi) continue;
          const d = haversineKm(p.lat, p.lon, q.lat, q.lon);
          if (d > NEIGHBOUR_MAX_KM) continue;
          const cost = stationCost(d, p.altitud - q.altitud);
          if (!best || cost < best.cost) best = { q, d, cost };
        }
        if (!best) continue;

        const said = models.get(p.codi)?.get(hour);
        if (!said || COMPARE_MODELS.some((m) => said[m] == null)) continue;
        // El que el model diu a la veïna, per a la xifra guiada.
        const atNeighbour = models.get(best.q.codi)?.get(hour)?.best_match;
        if (atNeighbour == null) continue;

        const estimates: Partial<Record<CompareSource, number>> = {
          ...said,
          [OURS]: best.q.t - (p.altitud - best.q.altitud) * LAPSE_RATE,
          [GUIDED]: best.q.t + (said.best_match! - atNeighbour),
        };

        const st = (scores.stations[p.codi] ??= { bySource: {}, sumNeighbourKm: 0, sumNeighbourDAlt: 0 });
        const byHour = (scores.byHour[hour.slice(11, 13)] ??= {});
        for (const [src, v] of Object.entries(estimates) as Array<[CompareSource, number]>) {
          const err = v - p.t;
          add((st.bySource[src] ??= emptyCompareTally()), err);
          add((byHour[src] ??= emptyCompareTally()), err);
        }
        st.sumNeighbourKm += best.d;
        st.sumNeighbourDAlt += Math.abs(p.altitud - best.q.altitud);
        compared++;
        perDay.set(day, (perDay.get(day) ?? 0) + 1);
      }
    }

    /*
     * Un dia es dona per puntuat en quant hi entra una sola comparació, i no
     * quan és «prou complet»: el que ja s'ha sumat no es pot treure, així que
     * deixar-lo per a demà el faria entrar dues vegades. Un dia que no ha
     * pogut entrar gens —la XEMA encara no l'havia publicat— es torna a provar
     * a la volta següent.
     */
    for (const day of missing) {
      if ((perDay.get(day) ?? 0) > 0) newlyScored.push(day);
    }
    scores.scored = [...new Set([...scores.scored, ...newlyScored])].sort();
    console.log(`${compared} comparacions · ${newlyScored.length} dies nous · ${scores.scored.length} en total`);
  }

  writeSnapshot(COMPARE_SHARD, 'Open-Meteo + Meteocat XEMA', scores, scores.scored.at(-1) ?? null);

  // El resum per a qui mira el registre.
  const total = new Map<string, CompareTally>();
  for (const st of Object.values(scores.stations)) {
    for (const [src, t] of Object.entries(st.bySource)) {
      const acc = total.get(src) ?? emptyCompareTally();
      acc.n += t.n; acc.sumError += t.sumError; acc.sumAbs += t.sumAbs; acc.gt3 += t.gt3;
      total.set(src, acc);
    }
  }
  for (const [src, t] of [...total].sort((a, b) => a[1].sumAbs / a[1].n - b[1].sumAbs / b[1].n)) {
    console.log(
      `  ${src.padEnd(30)} ${(t.sumAbs / t.n).toFixed(2)} °C d'error`
      + ` · biaix ${t.sumError >= 0 ? '+' : ''}${(t.sumError / t.n).toFixed(2)}`
      + ` · >3 °C ${((100 * t.gt3) / t.n).toFixed(1)} %`,
    );
  }
  console.log(`${((Date.now() - started) / 1000).toFixed(1)} s`);

  recordFreshness({
    source: SOURCE,
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: scores.scored.at(-1) ?? null,
    // La dada és d'ahir per definició, com la de l'encert dels models.
    stalenessLimitMin: 60 * 60,
    rows: compared,
    apiCalls,
  });

  console.log(quota.report());
  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(2)} MB`);
  }
}

main().catch((err) => reportFailure({
  source: SOURCE, lastSuccessAt: '', lastDataTs: null,
  stalenessLimitMin: 60 * 60, rows: 0, apiCalls: 0,
}, err));
