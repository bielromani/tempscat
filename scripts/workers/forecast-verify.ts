/**
 * Worker · quant encerta cada model, mesurat contra la XEMA.
 *
 * ## Per què corre avui si el resultat no serveix fins d'aquí a dos mesos
 *
 * Perquè la millora de qualitat més gran que li queda al projecte —deixar de
 * fer pesar igual tots els models al consens i ponderar-los pel que encerten—
 * **no es pot fer el dia que es decideixi**. Fa falta un historial de
 * comparacions, i un historial no es pot construir cap enrere: la predicció
 * d'ahir ja no existeix enlloc, perquè el fitxer es reescriu a cada refresc.
 * Cada dia que això no corre és un dia que aquella millora s'endarrereix.
 *
 * Mentrestant la pàgina segueix dient que els models pesen igual, que és el
 * que passa.
 *
 * ## Les dues meitats
 *
 * **Puntuar** el dia que s'acaba de tancar: es llegeix el que es va desar per a
 * ell i es compara amb el que han mesurat les estacions.
 *
 * **Capturar** els dies que vindran: per a cada estació es busca el punt de
 * predicció més proper i es desa què en diu cada model, un dia, dos i tres
 * abans. Sense aquesta meitat no hi hauria res a puntuar demà.
 *
 * ## Les dues coses que fan que el número vulgui dir alguna cosa
 *
 * **La cota.** Un model no prediu per a l'estació: prediu per a una casella de
 * malla que creu que és a una altura determinada, i que sovint no és la de
 * l'estació. Comparar-les sense corregir mesuraria la diferència d'altura i no
 * l'encert del model — i castigaria més els models de malla ampla, que és
 * exactament el biaix que això ha d'evitar. Es baixa la predicció de la cota
 * del model a la de l'estació amb el gradient estàndard, el mateix que fa
 * servir la pàgina.
 *
 * **El conveni horari.** El diari es calcula amb `mergeHourly` i
 * `aggregateDaily`, les mateixes funcions que fa servir el web, i no sumant
 * les hores a mà. A Open-Meteo la pluja de l'hora `T` és la del tram anterior,
 * i una suma feta aquí amb un altre criteri compararia el dia del model amb el
 * dia de l'estació desplaçats una hora.
 *
 * ## I contra qui (5 de novembre de 2026)
 *
 * Fins aquí es puntuaven els models, que és el que serveix per ponderar-los.
 * El que el lector vol saber és una altra cosa: **si el que li diu aquest web
 * encerta més que el que li diuen els altres**. Això només es pot mesurar amb
 * qui publica la seva predicció per a un lloc concret, i de manera que es pugui
 * desar el mateix dia: l'AEMET, amb la predicció diària de cada municipi a la
 * seva API oberta. Google, Apple o eltiempo.es no en publiquen cap que es pugui
 * consultar així, i el Meteocat demana una clau que no tenim.
 *
 * Així que, al costat dels models, es desen dues entrades més, i **sempre
 * juntes, per a les mateixes estacions i els mateixos dies**:
 *
 *  · `aemet`: la màxima i la mínima que l'AEMET dona per al municipi.
 *  · `tempscat`: el que diu la fitxa d'aquell mateix municipi —el consens de
 *    models del seu punt, corregit a la cota del poble—, calculat igual que
 *    `forecastFor()`.
 *
 * La veritat és l'estació de la XEMA del mateix municipi, i només si és a
 * menys de 6 km del nucli i a menys de 100 m de la seva cota: més enllà, el
 * que es mesuraria és la distància entre l'estació i el poble, i castigaria
 * igual les dues prediccions per una cosa que no és cap de les dues. Són unes
 * 140 estacions. L'AEMET no dona mil·límetres —només probabilitat—, així que
 * aquesta comparació és de temperatura.
 *
 * Una entrada sense l'altra no es desa: amb dies o estacions diferents, els
 * dos números no es podrien posar de costat.
 *
 * Sortida: verify/pendent/<dia>.json i verify/encert.json
 */
import { readFileSync } from 'node:fs';
import { build } from '../lib/paths.ts';
import { fetchJson, fetchWithRetry, sleep } from '../lib/http.ts';
import {
  DAILY_LIMITS, QuotaGuard, publish, pullSnapshot, recordFreshness, reportFailure, syncState, writeSnapshot,
} from '../lib/store.ts';
import { aggregateDaily, mergeHourly, type PointForecast } from '../../src/lib/forecast-merge.ts';
import { LAPSE_RATE } from '../../src/lib/variables.ts';
import { FORECAST_INDEX, forecastShard, type ForecastIndex } from '../../src/lib/shards.ts';
import {
  LEADS, VERIFY_VARS, emptyScores, pendingShard, scoresShard,
  type Pending, type Predicted, type Scores, type Tally,
} from '../../src/lib/verify.ts';

/**
 * A quina distància deixa de tenir sentit comparar.
 *
 * Els punts de predicció són a 3,2 km de mitjana, així que cap estació de la
 * XEMA n'hauria de tenir el més proper gaire més lluny. Si una en queda fora
 * és que passa alguna cosa, i val més no puntuar-la que puntuar una altra
 * vall.
 */
const MAX_KM = 8;

/**
 * I a quin desnivell.
 *
 * El gradient estàndard corregeix bé unes desenes de metres i cada cop pitjor
 * a partir d'aquí: en una nit d'inversió tèrmica el signe s'inverteix. Amb
 * mig quilòmetre de diferència, el que es mesuraria és la correcció i no el
 * model. És el mateix llindar de 300 m que ja fa servir el rànquing de pobles,
 * arrodonit avall perquè aquí no hi ha cap titular a salvar.
 */
const MAX_DALT = 300;

/** Fins on una estació representa el poble, per a la comparació amb l'AEMET. Vegeu la capçalera. */
const H2H_KM = 6;
const H2H_DALT = 100;

const AEMET_BASE = 'https://opendata.aemet.es/opendata/api';

interface Station {
  codi: string; nom: string; lat: number; lon: number;
  altitud: number | null; operativa: boolean; municipiIne5?: string;
}
interface Point { id: string; lat: number; lon: number; altitud: number; tier: string }
interface Town {
  id: string; nom: string; level: string; municipiIne5: string; forecastPointId?: string;
  lat: number; lon: number; altitud: number | null; comarcaCodi: string;
}
interface ShardPoint { [model: string]: PointForecast }
interface ForecastShardData { times?: string[]; points: Record<string, ShardPoint> }
interface Observation {
  station: string;
  yesterday?: { tMax: number | null; tMin: number | null; precip: number | null };
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/** `2026-09-09` més `n` dies. */
function plusDays(iso: string, n: number): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const emptyTally = (): Tally => ({ n: 0, sumError: 0, sumAbs: 0 });

async function main() {
  await syncState('forecast-verify');
  const quota = new QuotaGuard(DAILY_LIMITS);
  const started = Date.now();

  const today = new Date()
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .slice(0, 10);
  const yesterday = plusDays(today, -1);

  const stations = (JSON.parse(readFileSync(build('stations.json'), 'utf8')) as Station[])
    .filter((s) => s.operativa && s.altitud != null);
  const points = JSON.parse(readFileSync(build('forecast-points.json'), 'utf8')) as Point[];

  /*
   * Cada estació amb el seu punt de predicció, i **es prefereix el de nivell A
   * encara que no sigui el més proper**.
   *
   * Aquesta tria és la que fa que això serveixi per a res. Només els punts de
   * nivell A porten més d'un model —els altres només el `best_match`, que és el
   * que Open-Meteo tria i no un model independent— així que aparellant per
   * proximitat pura, de 189 estacions només 38 en podien comparar models. Amb
   * el nivell A com a preferència en són **138**, i la mediana de la distància
   * és de 2,7 km: menys que la separació de la malla, i molt menys que la
   * casella del model més ample que s'hi compara.
   *
   * Quan no n'hi ha cap a l'abast es fa servir el més proper del que hi hagi:
   * puntuar `best_match` tot sol també diu alguna cosa, i és el que la pàgina
   * serveix quan no hi ha consens.
   *
   * No es desa: són 189 × 3.190 distàncies, mig segon, i desada s'hauria de
   * recalcular el dia que un punt canviés de nivell sense que ningú ho veiés.
   */
  const paired = stations.flatMap((s) => {
    let best: Point | null = null;
    let bestKm = Infinity;
    let bestA: Point | null = null;
    let bestAKm = Infinity;
    for (const p of points) {
      const km = distKm(s.lat, s.lon, p.lat, p.lon);
      if (km < bestKm) { bestKm = km; best = p; }
      if (p.tier === 'A' && km < bestAKm) { bestAKm = km; bestA = p; }
    }
    const useA = bestA != null && bestAKm <= MAX_KM;
    const point = useA ? bestA! : best;
    const km = useA ? bestAKm : bestKm;
    if (!point || km > MAX_KM) return [];
    return [{ station: s, point, km, multi: useA }];
  });

  /*
   * Les estacions que representen el seu poble, per a la comparació amb
   * l'AEMET. El codi INE de la XEMA va en sis xifres sense el zero de davant
   * —`80193` és 080193, Barcelona—; el del territori i el de l'AEMET, en cinc.
   */
  const towns = new Map(
    (JSON.parse(readFileSync(build('locations.json'), 'utf8')) as Town[])
      .filter((l) => l.level === 'municipi' && l.forecastPointId && l.altitud != null)
      .map((l) => [l.municipiIne5, l]),
  );
  const headToHead = stations.flatMap((s) => {
    const ine = s.municipiIne5?.padStart(6, '0').slice(0, 5);
    const town = ine ? towns.get(ine) : undefined;
    if (!town || s.altitud == null) return [];
    if (Math.abs(town.altitud! - s.altitud) > H2H_DALT) return [];
    if (distKm(s.lat, s.lon, town.lat, town.lon) > H2H_KM) return [];
    return [{ station: s, town, ine: ine! }];
  });
  console.log(`Estacions que representen el seu poble, per a l'AEMET: ${headToHead.length}`);

  const multi = paired.filter((p) => p.multi).length;
  console.log(
    `Estacions aparellades: ${paired.length} de ${stations.length}`
    + ` · ${multi} amb un punt que porta més d'un model`,
  );

  // ── 1. Puntuar el dia que s'ha tancat ───────────────────────────────────
  const obs = await pullSnapshot<Observation[]>('xema-current');
  const truth = new Map<string, { tMax: number | null; tMin: number | null; precip: number | null }>();
  for (const o of obs?.data ?? []) {
    if (o.yesterday) truth.set(o.station, o.yesterday);
  }

  const stored = (await pullSnapshot<Scores>(scoresShard()))?.data;
  const scores: Scores = stored?.scored ? stored : emptyScores();

  const pending = (await pullSnapshot<Pending>(pendingShard(yesterday)))?.data ?? null;
  let scored = 0;

  /*
   * Un dia no es pot puntuar dues vegades.
   *
   * Els sumatoris s'acumulen, així que si el worker corre dos cops el mateix
   * dia —un `workflow_dispatch` a mà damunt de l'horari, que és el més fàcil
   * del món— el dia d'ahir entraria dues vegades i `n` sortiria inflat. No
   * donaria cap error: donaria un error mitjà calculat sobre el doble de
   * comparacions de les que hi ha hagut, i amb els dies pesats desigualment
   * entre ells.
   */
  const alreadyScored = scores.scored.includes(yesterday);

  if (alreadyScored) {
    console.log(`${yesterday} ja estava puntuat: no es torna a comptar.`);
  } else if (!pending) {
    console.log(`Sense res desat per a ${yesterday}: encara no s'havia capturat aquell dia.`);
  } else if (!truth.size) {
    console.log(`Sense mesures d'ahir a l'observació: ${yesterday} es puntuarà quan n'hi hagi.`);
  } else {
    for (const [lead, entry] of Object.entries(pending.byLead)) {
      for (const [codi, byModel] of Object.entries(entry.stations)) {
        const real = truth.get(codi);
        if (!real) continue;
        for (const [model, pred] of Object.entries(byModel)) {
          const m = scores.models[model] ??= {};
          for (const v of VERIFY_VARS) {
            const got = real[v];
            const said = pred[v];
            if (got == null || said == null) continue;
            const byLead = (m[v] ??= {});
            const t = (byLead[lead] ??= emptyTally());
            const err = said - got;
            t.n++;
            t.sumError += err;
            t.sumAbs += Math.abs(err);
            scored++;
          }
        }
      }
    }
    if (scored) {
      scores.scored.push(yesterday);
      scores.scored.sort();
    }
    console.log(`Puntuat ${yesterday}: ${scored} comparacions · ${scores.scored.length} dies acumulats`);
  }

  // ── 2. Capturar els dies que vindran ────────────────────────────────────
  const index = await pullSnapshot<ForecastIndex>(FORECAST_INDEX);
  if (!index) throw new Error('no hi ha índex de predicció: no es pot capturar res');
  const times = index.data.times;

  /*
   * Els trossos, un cop cadascun, i només el punt que interessa de cada un.
   *
   * La predicció va partida per comarca i no hi ha manera de demanar-ne un sol
   * punt, així que es recorren tots — però només se'n reté el de cada estació.
   * Un punt de frontera surt a dos trossos a posta: el primer que el porti ja
   * serveix.
   */
  const byId = new Map(paired.map((p) => [p.point.id, p]));
  const townPoints = new Set(headToHead.map((h) => h.town.forecastPointId!));
  const found = new Map<string, ShardPoint>();
  const foundTown = new Map<string, ShardPoint>();
  for (const c of index.data.comarques) {
    const shard = await pullSnapshot<ForecastShardData>(forecastShard(c.codi));
    if (!shard) continue;
    for (const [id, models] of Object.entries(shard.data.points)) {
      if (byId.has(id) && !found.has(id)) found.set(id, models);
      if (townPoints.has(id) && !foundTown.has(id)) foundTown.set(id, models);
    }
  }
  console.log(`Punts amb predicció: ${found.size} de ${byId.size}`);

  /*
   * El diari de cada model, per separat.
   *
   * Es passa un sol model a `mergeHourly` perquè el que es vol puntuar és
   * **ell**, no el consens; i es passa per `mergeHourly` i no es sumen les
   * hores aquí perquè el desplaçament del conveni horari d'Open-Meteo hi és a
   * dins. Sumant-les a mà, el dia del model i el de l'estació anirien
   * desplaçats una hora i el número sortiria mogut per a tots igual — que és
   * pitjor, perquè semblaria bo.
   */
  const captured: Record<string, Record<string, Record<string, Predicted>>> = {};
  for (const lead of LEADS) captured[String(lead)] = {};

  let series = 0;
  for (const [id, models] of found) {
    const pair = byId.get(id)!;
    for (const [model, pf] of Object.entries(models)) {
      const hourly = mergeHourly({ [model]: pf }, times, {
        tempCorrection: 0, lat: pair.station.lat, lon: pair.station.lon,
      });
      const daily = aggregateDaily(hourly, { lat: null, lon: null });
      series++;

      /*
       * De la cota del model a la de l'estació.
       *
       * `modelElevation` és el que el model creu que fa el terreny en aquella
       * casella, i és el que fa comparables dos models de malla diferent: sense
       * baixar-hi la temperatura, l'ECMWF —malla ampla, que arrodoneix les
       * valls— sortiria pitjor per una raó que no és la seva predicció.
       */
      const dAlt = (pair.station.altitud ?? 0) - pf.modelElevation;
      if (Math.abs(dAlt) > MAX_DALT) continue;
      const drop = dAlt * LAPSE_RATE;

      for (const lead of LEADS) {
        const target = plusDays(today, lead);
        const d = daily.find((x) => x.date === target);
        if (!d) continue;
        const slot = (captured[String(lead)][pair.station.codi] ??= {});
        slot[model] = {
          tMax: d.tMax != null ? Math.round((d.tMax - drop) * 10) / 10 : null,
          tMin: d.tMin != null ? Math.round((d.tMin - drop) * 10) / 10 : null,
          precip: d.precipitation ?? null,
        };
      }
    }
  }

  // ── 2b. El que diu aquest web i el que diu l'AEMET, del mateix poble ──────
  const h2h = await captureHeadToHead(headToHead, foundTown, times, today, quota);
  for (const lead of LEADS) {
    for (const [codi, pair] of Object.entries(h2h[String(lead)] ?? {})) {
      const slot = (captured[String(lead)][codi] ??= {});
      slot.tempscat = pair.tempscat;
      slot.aemet = pair.aemet;
    }
  }

  let written = 0;
  for (const lead of LEADS) {
    const target = plusDays(today, lead);
    const stationsForLead = captured[String(lead)];
    if (!Object.keys(stationsForLead).length) continue;

    /*
     * Es fusiona amb el que ja hi hagi per a aquell dia.
     *
     * Un mateix dia rep tres entrades en tres execucions distintes —tres dies
     * abans, dos i un—, i cada una porta la seva antelació. Escrivint-lo de
     * nou, l'última esborraria les altres dues i només quedaria l'antelació
     * d'un dia, que és justament la que menys diu.
     */
    const prev = (await pullSnapshot<Pending>(pendingShard(target)))?.data;
    const next: Pending = prev?.target === target
      ? prev
      : { target, byLead: {} };
    next.byLead[String(lead)] = {
      issued: today,
      stations: stationsForLead,
    };
    writeSnapshot(pendingShard(target), 'Open-Meteo + Meteocat XEMA', next, target);
    written++;
  }

  writeSnapshot(scoresShard(), 'Open-Meteo + Meteocat XEMA', scores, scores.scored.at(-1) ?? null);

  const lines: string[] = [];
  for (const [model, vars] of Object.entries(scores.models)) {
    const t = vars.tMax?.['1'];
    if (t && t.n) {
      lines.push(
        `  ${model.padEnd(28)} tMax a 1 dia: ${(t.sumAbs / t.n).toFixed(2)} °C d'error`
        + ` · biaix ${(t.sumError / t.n >= 0 ? '+' : '')}${(t.sumError / t.n).toFixed(2)}`
        + ` · ${t.n} comparacions`,
      );
    }
  }
  if (lines.length) {
    console.log('\nAcumulat fins ara:');
    for (const l of lines.sort()) console.log(l);
  }

  console.log(
    `\n${series} sèries de model · ${written} dies desats per a més endavant`
    + ` · ${((Date.now() - started) / 1000).toFixed(1)} s`,
  );

  recordFreshness({
    source: 'forecast-verify',
    lastSuccessAt: new Date().toISOString(),
    lastDataTs: scores.scored.at(-1) ?? null,
    /*
     * Seixanta hores, i no vint-i-quatre.
     *
     * La dada d'aquesta font **és d'ahir per definició**: es puntua el dia que
     * s'ha tancat, i la seva marca són les 00:00 d'aquell dia. En acabar de
     * córrer ja té trenta hores, i just abans de la volta següent en té
     * cinquanta-quatre. Amb un límit de vint-i-quatre sortiria en roig sempre,
     * també amb el worker acabat de passar — la mateixa trampa dels rècords de
     * la XEMA i dels avisos de l'AEMET: el límit ha de ser el cicle real, no
     * la freqüència amb què voldríem la dada.
     */
    stalenessLimitMin: 60 * 60,
    rows: scores.scored.length,
    apiCalls: 0,
  });

  console.log(quota.report());
  const pub = await publish();
  if (!pub.skipped) {
    console.log(`Publicat: ${pub.uploaded} fitxers · ${(pub.bytes / 1048576).toFixed(2)} MB`);
  }
}

/**
 * El que diu la fitxa d'un poble i el que diu l'AEMET del mateix poble, per a
 * cada antelació. Només surt una estació si hi ha **les dues**.
 *
 * La fitxa es calcula com `forecastFor()`: tots els models del punt del poble,
 * amb la correcció de la cota del poble contra la que suposa el primer model,
 * i el diari amb `aggregateDaily`. No es copia el codi de la pàgina perquè
 * aquell llegeix del magatzem amb `server-only`, però les dues funcions que
 * fan la feina són les mateixes.
 *
 * Si l'AEMET no respon o no hi ha clau, no es desa cap entrada `aemet` ni
 * `tempscat`: els models es segueixen puntuant igual.
 */
async function captureHeadToHead(
  pairs: Array<{ station: Station; town: Town; ine: string }>,
  points: Map<string, ShardPoint>,
  times: string[],
  today: string,
  quota: QuotaGuard,
): Promise<Record<string, Record<string, { tempscat: Predicted; aemet: Predicted }>>> {
  const out: Record<string, Record<string, { tempscat: Predicted; aemet: Predicted }>> = {};
  const key = process.env.AEMET_API_KEY;
  if (!key) {
    console.log("Sense AEMET_API_KEY: no es desa la comparació amb l'AEMET.");
    return out;
  }

  const aemetByIne = new Map<string, Map<string, { tMax: number | null; tMin: number | null }>>();
  let failed = 0;
  for (const ine of new Set(pairs.map((p) => p.ine))) {
    try {
      aemetByIne.set(ine, await aemetDaily(ine, key, quota));
    } catch (err) {
      failed++;
      console.log(`  AEMET ${ine}: ${(err as Error).message}`);
    }
    await sleep(400);
  }
  console.log(`Prediccions municipals de l'AEMET: ${aemetByIne.size} · fallades: ${failed}`);

  for (const { station, town, ine } of pairs) {
    const byModel = points.get(town.forecastPointId!);
    const aemet = aemetByIne.get(ine);
    if (!byModel || !aemet) continue;
    const models = Object.keys(byModel);
    if (!models.length) continue;

    const modelElev = byModel[models[0]].modelElevation;
    const dAlt = town.altitud != null && modelElev != null ? town.altitud - modelElev : 0;
    const hourly = mergeHourly(byModel, times, {
      tempCorrection: -dAlt * LAPSE_RATE, lat: town.lat, lon: town.lon,
    });
    const daily = aggregateDaily(hourly, { lat: town.lat, lon: town.lon });

    for (const lead of LEADS) {
      const target = plusDays(today, lead);
      const ours = daily.find((x) => x.date === target);
      const theirs = aemet.get(target);
      if (!ours || !theirs || theirs.tMax == null || theirs.tMin == null) continue;
      (out[String(lead)] ??= {})[station.codi] = {
        tempscat: {
          tMax: ours.tMax != null ? Math.round(ours.tMax * 10) / 10 : null,
          tMin: ours.tMin != null ? Math.round(ours.tMin * 10) / 10 : null,
          precip: null,
        },
        aemet: { tMax: theirs.tMax, tMin: theirs.tMin, precip: null },
      };
    }
  }
  return out;
}

/**
 * La predicció diària de l'AEMET per a un municipi: màxima i mínima per data.
 *
 * Dos salts, com els avisos: una URL temporal i després el contingut, amb
 * l'estat **dins del cos** i no a l'HTTP (vegeu `aemet-warnings.ts`).
 */
async function aemetDaily(
  ine: string, key: string, quota: QuotaGuard,
): Promise<Map<string, { tMax: number | null; tMin: number | null }>> {
  interface Meta { estado: number; datos?: string; descripcion: string }
  let meta: Meta | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    meta = await fetchJson<Meta>(`${AEMET_BASE}/prediccion/especifica/municipio/diaria/${ine}`, {
      headers: { api_key: key }, timeoutMs: 30_000,
    });
    quota.spend('aemet', 1);
    if (meta.datos) break;
    if (attempt < 4) await sleep(attempt * 4_000);
  }
  if (!meta?.datos) throw new Error(`sense dades: ${meta?.estado} ${meta?.descripcion}`);

  const res = await fetchWithRetry(meta.datos, { timeoutMs: 30_000 });
  quota.spend('aemet', 1);
  const body = JSON.parse(await res.text()) as Array<{
    prediccion?: { dia?: Array<{ fecha: string; temperatura?: { maxima?: number | null; minima?: number | null } }> };
  }>;
  const out = new Map<string, { tMax: number | null; tMin: number | null }>();
  for (const d of body[0]?.prediccion?.dia ?? []) {
    out.set(d.fecha.slice(0, 10), {
      tMax: typeof d.temperatura?.maxima === 'number' ? d.temperatura.maxima : null,
      tMin: typeof d.temperatura?.minima === 'number' ? d.temperatura.minima : null,
    });
  }
  return out;
}

main().catch((err) => reportFailure({
  source: 'forecast-verify', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 60, rows: 0, apiCalls: 0,
}, err));

