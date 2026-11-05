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
 * seva API oberta, i yr.no (MET Norway), una de les aplicacions més fetes
 * servir d'Europa, amb la seva (CC BY 4.0). El Meteocat hi és preparat i
 * apagat fins que hi hagi clau. Google, Apple o eltiempo.es no en publiquen
 * cap que es pugui consultar així.
 *
 * Així que, al costat dels models, es desen més entrades
 * (`RIVALS` a `src/lib/verify.ts`):
 *
 *  · `aemet`, `yrno`, `meteocat`: la màxima i la mínima que cadascú dona per
 *    al municipi.
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
 * Cada rival es compara amb la fitxa només on hi són tots dos
 * (`Scores.duels`): amb dies o estacions diferents, els dos números no es
 * podrien posar de costat.
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
  LEADS, OURS, RIVALS, VERIFY_VARS, emptyScores, pendingShard, scoresShard,
  type Pending, type Predicted, type Rival, type Scores, type Tally,
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

/*
 * L'AEMET deixa fer **unes catorze peticions per minut** per clau, i la del
 * contingut també compta: set municipis per minut, no més (mesurat el 5 de
 * novembre de 2026). Anant més de pressa no s'avança res —cada 429 vol dir un
 * minut sencer d'espera— i, com que la clau és la mateixa dels avisos, el
 * worker d'avisos es trobaria el minut gastat. Una cada cinc segons en són
 * dotze: en queden dues per als avisos, i els 138 municipis són uns 23 minuts.
 */
const AEMET_GAP_MS = 5_000;
/** Passat aquest temps es desa el que hi hagi: cada estació va amb les dues prediccions o no hi va. */
const AEMET_BUDGET_MS = 30 * 60_000;

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
    const ine6 = s.municipiIne5?.padStart(6, '0');
    const ine = ine6?.slice(0, 5);
    const town = ine ? towns.get(ine) : undefined;
    if (!town || s.altitud == null) return [];
    if (Math.abs(town.altitud! - s.altitud) > H2H_DALT) return [];
    if (distKm(s.lat, s.lon, town.lat, town.lon) > H2H_KM) return [];
    return [{ station: s, town, ine: ine!, ine6: ine6! }];
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

        /*
         * La fitxa contra cada rival, en el mateix pas i només on hi ha
         * tots dos: vegeu `Scores.duels`.
         */
        const ours = byModel[OURS];
        if (!ours) continue;
        for (const rival of Object.keys(RIVALS) as Rival[]) {
          const theirs = byModel[rival];
          if (!theirs) continue;
          for (const v of VERIFY_VARS) {
            const got = real[v];
            if (got == null || ours[v] == null || theirs[v] == null) continue;
            const d = (((scores.duels ??= {})[rival] ??= {})[v] ??= {});
            const pair = (d[lead] ??= { ours: emptyTally(), theirs: emptyTally() });
            for (const [t, said] of [[pair.ours, ours[v]!], [pair.theirs, theirs[v]!]] as const) {
              const err = said - got;
              t.n++;
              t.sumError += err;
              t.sumAbs += Math.abs(err);
            }
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

  // ── 2b. El que diu aquest web i el que diuen els altres, del mateix poble ──
  const h2h = await captureHeadToHead(headToHead, foundTown, times, today, quota);
  for (const lead of LEADS) {
    for (const [codi, bySource] of Object.entries(h2h[String(lead)] ?? {})) {
      Object.assign((captured[String(lead)][codi] ??= {}), bySource);
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
    writeSnapshot(pendingShard(target), 'Open-Meteo + AEMET + MET Norway + Meteocat XEMA', next, target);
    written++;
  }

  writeSnapshot(scoresShard(), 'Open-Meteo + Meteocat XEMA', scores, scores.scored.at(-1) ?? null);

  const lines: string[] = [];
  for (const [rival, vars] of Object.entries(scores.duels ?? {})) {
    const t = vars.tMax?.['1'];
    if (t && t.ours.n) {
      lines.push(
        `  fitxa contra ${rival.padEnd(15)} tMax a 1 dia: ${(t.ours.sumAbs / t.ours.n).toFixed(2)}`
        + ` contra ${(t.theirs.sumAbs / t.theirs.n).toFixed(2)} °C · ${t.ours.n} comparacions`,
      );
    }
  }
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
 * El que diu la fitxa d'un poble i el que en diuen els altres, per a cada
 * antelació: l'AEMET, yr.no i, quan hi hagi clau, el Meteocat.
 *
 * La fitxa es calcula com `forecastFor()`: tots els models del punt del poble,
 * amb la correcció de la cota del poble contra la que suposa el primer model,
 * i el diari amb `aggregateDaily`. No es copia el codi de la pàgina perquè
 * aquell llegeix del magatzem amb `server-only`, però les dues funcions que
 * fan la feina són les mateixes.
 *
 * Cada rival es demana pel seu compte i pot fallar pel seu compte: si l'AEMET
 * es queda sense temps, yr.no no se'n ressent. Una estació només es desa si hi
 * ha la fitxa i **almenys un** rival; l'emparellament fi —la mateixa estació i
 * el mateix dia a les dues bandes— el fa la puntuació (`Scores.duels`).
 */
async function captureHeadToHead(
  pairs: Array<{ station: Station; town: Town; ine: string; ine6: string }>,
  points: Map<string, ShardPoint>,
  times: string[],
  today: string,
  quota: QuotaGuard,
): Promise<Record<string, Record<string, Record<string, Predicted>>>> {
  const out: Record<string, Record<string, Record<string, Predicted>>> = {};

  /*
   * Es comença per un municipi diferent cada dia: si algun dia s'acaba el temps,
   * els que es queden fora no són sempre els mateixos.
   */
  const ines = [...new Set(pairs.map((p) => p.ine))].sort();
  const shift = Math.floor(Date.parse(`${today}T00:00:00Z`) / 86_400_000) % Math.max(1, ines.length);
  const order = [...ines.slice(shift), ...ines.slice(0, shift)];
  const byIne = new Map(pairs.map((p) => [p.ine, p]));

  // yr.no primer: és ràpid, i així no depèn de quant trigui l'AEMET.
  const rivals: Partial<Record<Rival, Map<string, Map<string, Daily>>>> = {};
  rivals.yrno = await eachTown('yr.no', order, (ine) => yrnoDaily(byIne.get(ine)!.town, quota));

  const meteocatKey = process.env.METEOCAT_API_KEY;
  if (meteocatKey) {
    rivals.meteocat = await eachTown(
      'Meteocat', order, (ine) => meteocatDaily(byIne.get(ine)!.ine6, meteocatKey, quota),
    );
  } else {
    console.log('Sense METEOCAT_API_KEY: no es desa la comparació amb el Meteocat.');
  }

  const aemetKey = process.env.AEMET_API_KEY;
  if (aemetKey) {
    rivals.aemet = await eachTown("l'AEMET", order, (ine) => aemetDaily(ine, aemetKey, quota), AEMET_BUDGET_MS);
  } else {
    console.log("Sense AEMET_API_KEY: no es desa la comparació amb l'AEMET.");
  }

  for (const { station, town, ine } of pairs) {
    const byModel = points.get(town.forecastPointId!);
    if (!byModel) continue;
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
      if (!ours) continue;
      const entry: Record<string, Predicted> = {};
      for (const [rival, days] of Object.entries(rivals)) {
        const theirs = days?.get(ine)?.get(target);
        if (!theirs || theirs.tMax == null || theirs.tMin == null) continue;
        entry[rival] = { tMax: theirs.tMax, tMin: theirs.tMin, precip: null };
      }
      if (!Object.keys(entry).length) continue;
      entry[OURS] = {
        tMax: ours.tMax != null ? Math.round(ours.tMax * 10) / 10 : null,
        tMin: ours.tMin != null ? Math.round(ours.tMin * 10) / 10 : null,
        precip: null,
      };
      (out[String(lead)] ??= {})[station.codi] = entry;
    }
  }
  return out;
}

/** Màxima i mínima d'un dia, tal com les dona una font. */
interface Daily { tMax: number | null; tMin: number | null }

/** Demana un rival per a cada municipi, amb un temps màxim i comptant les fallades. */
async function eachTown(
  label: string,
  order: string[],
  fetchOne: (ine: string) => Promise<Map<string, Daily>>,
  budgetMs = 20 * 60_000,
): Promise<Map<string, Map<string, Daily>>> {
  const byIne = new Map<string, Map<string, Daily>>();
  const started = Date.now();
  let failed = 0;
  let skipped = 0;
  for (const [i, ine] of order.entries()) {
    if (Date.now() - started > budgetMs) {
      skipped = order.length - i;
      break;
    }
    try {
      byIne.set(ine, await fetchOne(ine));
    } catch (err) {
      failed++;
      console.log(`  ${label} ${ine}: ${(err as Error).message}`);
    }
    if ((i + 1) % 25 === 0) {
      console.log(`  ${label}: ${i + 1} de ${order.length} · ${Math.round((Date.now() - started) / 1000)} s`);
    }
  }
  console.log(
    `Prediccions municipals de ${label}: ${byIne.size} · fallades: ${failed}` +
    (skipped ? ` · ${skipped} sense temps` : '') +
    ` · ${Math.round((Date.now() - started) / 1000)} s`,
  );
  return byIne;
}

/**
 * La data local de Madrid d'un instant, `AAAA-MM-DD`. Els instants de yr.no van
 * en UTC i s'han de partir per dia de Catalunya, com els de la XEMA.
 */
function madridDate(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 10);
}

const YR_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
/**
 * MET Norway demana que cada client s'identifiqui amb una adreça de contacte
 * i bloqueja els que no ho fan. Les dades són CC BY 4.0.
 */
const YR_UA = 'tempscat.cat/1.0 https://tempscat.cat';

/**
 * La màxima i la mínima que yr.no dona per a cada dia, al nucli del municipi i
 * a la seva cota (`altitude=`, que és el que fa la seva aplicació).
 *
 * La sèrie és horària fins a uns dos dies i mig i després va de sis en sis
 * hores. Amb sis hores, la temperatura instantània se salta la màxima de la
 * tarda, així que també es fan servir `air_temperature_max` i `_min` dels
 * trams de sis hores que cauen sencers dins del dia. Un dia sense cobertura
 * sencera —el primer, que comença a mitja tarda— no es desa.
 */
async function yrnoDaily(town: Town, quota: QuotaGuard): Promise<Map<string, Daily>> {
  await sleep(250);
  const url = `${YR_BASE}?lat=${town.lat.toFixed(4)}&lon=${town.lon.toFixed(4)}`
    + (town.altitud != null ? `&altitude=${Math.round(town.altitud)}` : '');
  const body = await fetchJson<{
    properties: {
      timeseries: Array<{
        time: string;
        data: {
          instant: { details: { air_temperature?: number } };
          next_6_hours?: { details?: { air_temperature_max?: number; air_temperature_min?: number } };
        };
      }>;
    };
  }>(url, { headers: { 'User-Agent': YR_UA }, timeoutMs: 30_000 });
  quota.spend('yrno', 1);

  const byDay = new Map<string, { values: number[]; hours: Set<number> }>();
  for (const t of body.properties.timeseries) {
    const ms = Date.parse(t.time);
    const day = madridDate(ms);
    const slot = byDay.get(day) ?? { values: [], hours: new Set<number>() };
    byDay.set(day, slot);
    const temp = t.data.instant.details.air_temperature;
    if (typeof temp === 'number') {
      slot.values.push(temp);
      slot.hours.add(ms);
    }
    /*
     * Un tram de sis hores compta si almenys cinc cauen dins del dia: els trams
     * de yr.no van de 00, 06, 12 i 18 UTC, i el del vespre acaba a l'01:00
     * d'hivern (02:00 d'estiu) de l'endemà. Exigint-lo sencer, el tercer dia
     * no sortiria mai. L'hora que sobra és de matinada, que és on el dia ja
     * s'acaba: per a la màxima no hi fa res i per a la mínima, poc.
     */
    const six = t.data.next_6_hours?.details;
    if (six) {
      const inside = [1, 2, 3, 4, 5].map((h) => ms + h * 3_600_000).filter((h) => madridDate(h) === day);
      if (inside.length >= 4) {
        if (typeof six.air_temperature_max === 'number') slot.values.push(six.air_temperature_max);
        if (typeof six.air_temperature_min === 'number') slot.values.push(six.air_temperature_min);
        for (const h of inside) slot.hours.add(h);
      }
    }
  }

  const out = new Map<string, Daily>();
  for (const [day, { values, hours }] of byDay) {
    // Un dia té 23, 24 o 25 hores; amb menys de 23 cobertes no és el dia sencer.
    if (hours.size < 23 || !values.length) continue;
    out.set(day, {
      tMax: Math.round(Math.max(...values) * 10) / 10,
      tMin: Math.round(Math.min(...values) * 10) / 10,
    });
  }
  return out;
}

const METEOCAT_BASE = 'https://api.meteo.cat/pronostic/v1/municipal';

/**
 * La predicció municipal del Meteocat: màxima i mínima per data.
 *
 * **Preparat però apagat**: només corre si hi ha `METEOCAT_API_KEY`. El pla
 * gratuït de la seva API prohibeix difondre a tercers el que retorna (vegeu
 * `docs/09-legal-y-costes.md`), així que no se n'ensenya mai cap xifra: només
 * entra a la comparació, i abans de publicar-ne el resultat s'ha de tenir per
 * escrit del Meteocat que es pot.
 *
 * El codi és l'INE de sis xifres, amb el dígit de control, que és el que porta
 * la XEMA. El format de la resposta no s'ha pogut provar sense clau: si no és
 * el que s'espera, llança, i ho diu el registre de cada municipi.
 */
async function meteocatDaily(ine6: string, key: string, quota: QuotaGuard): Promise<Map<string, Daily>> {
  await sleep(250);
  const body = await fetchJson<{
    dies?: Array<{ data: string; variables?: { tmax?: { valor?: number }; tmin?: { valor?: number } } }>;
  }>(`${METEOCAT_BASE}/${ine6}`, { headers: { 'X-Api-Key': key }, timeoutMs: 30_000 });
  quota.spend('meteocat', 1);
  if (!Array.isArray(body.dies)) throw new Error('resposta sense `dies`: ha canviat el format?');
  const out = new Map<string, Daily>();
  for (const d of body.dies) {
    out.set(d.data.slice(0, 10), {
      tMax: typeof d.variables?.tmax?.valor === 'number' ? d.variables.tmax.valor : null,
      tMin: typeof d.variables?.tmin?.valor === 'number' ? d.variables.tmin.valor : null,
    });
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
): Promise<Map<string, Daily>> {
  interface Meta { estado: number; datos?: string; descripcion: string }
  let meta: Meta | null = null;
  for (let attempt = 1; attempt <= 4; attempt++) {
    await aemetPace();
    meta = await fetchJson<Meta>(`${AEMET_BASE}/prediccion/especifica/municipio/diaria/${ine}`, {
      headers: { api_key: key }, timeoutMs: 30_000,
    });
    quota.spend('aemet', 1);
    if (meta.datos) break;
    if (attempt < 4) await sleep(attempt * 4_000);
  }
  if (!meta?.datos) throw new Error(`sense dades: ${meta?.estado} ${meta?.descripcion}`);

  await aemetPace();
  const res = await fetchWithRetry(meta.datos, { timeoutMs: 30_000 });
  quota.spend('aemet', 1);
  const body = JSON.parse(await res.text()) as Array<{
    prediccion?: { dia?: Array<{ fecha: string; temperatura?: { maxima?: number | null; minima?: number | null } }> };
  }>;
  const out = new Map<string, Daily>();
  for (const d of body[0]?.prediccion?.dia ?? []) {
    out.set(d.fecha.slice(0, 10), {
      tMax: typeof d.temperatura?.maxima === 'number' ? d.temperatura.maxima : null,
      tMin: typeof d.temperatura?.minima === 'number' ? d.temperatura.minima : null,
    });
  }
  return out;
}

/**
 * Una petició a l'AEMET cada `AEMET_GAP_MS`, comptant-les totes dues: la de la
 * URL temporal i la del contingut. Vegeu `AEMET_GAP_MS`.
 */
let aemetLast = 0;
async function aemetPace(): Promise<void> {
  const wait = aemetLast + AEMET_GAP_MS - Date.now();
  if (wait > 0) await sleep(wait);
  aemetLast = Date.now();
}

main().catch((err) => reportFailure({
  source: 'forecast-verify', lastSuccessAt: '', lastDataTs: null,
    stalenessLimitMin: 60 * 60, rows: 0, apiCalls: 0,
}, err));

