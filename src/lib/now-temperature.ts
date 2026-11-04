/**
 * La temperatura d'ara d'una fitxa: el model al lloc, corregit amb l'error que
 * les estacions de la XEMA del voltant diuen que el model està fent.
 *
 * ## Per què no és la lectura de l'estació
 *
 * Fins al novembre de 2026 la fitxa ensenyava la lectura de l'estació triada
 * pel build, corregida pel desnivell amb el gradient estàndard. Mesurat amb
 * `worker:compare` deixant cada estació fora, i comptant que la lectura arriba
 * amb una hora de retard, això feia 1,38 °C d'error mitjà: **pitjor** que
 * qualsevol model bo (AROME 1,13). Tres raons: la lectura té una hora, una sola
 * estació és el seu racó i no el del poble, i el gradient fix va al revés les
 * nits d'inversió.
 *
 * ## El mètode
 *
 * És una interpolació òptima de residus, la mateixa família que fan servir els
 * serveis meteorològics per a la temperatura d'ara:
 *
 *     T(lloc, ara) = M(lloc, ara) + Σ wᵢ·rᵢ / (Σ wᵢ + ε)
 *     rᵢ = lectura de l'estació i − M(estació i, hora de la lectura)
 *     wᵢ = exp(−½·(d/15 km)² − ½·(Δz/150 m)²)
 *
 * El model porta la forma del camp —la vall, la costa, la inversió que ell sí
 * que veu— i les estacions en corregeixen el nivell allà on n'hi ha. Lluny de
 * tota estació, Σw tendeix a zero i queda el model sol. El residu de l'hora de
 * la lectura se suma al model de l'hora d'ara, i així el retard de la XEMA ja
 * no fa mal: la tendència de l'última hora la porta el model.
 *
 * Mesurat el 4 de novembre de 2026 sobre trenta dies (paràmetres ajustats amb
 * els dies senars i avaluats amb els parells): 0,85 °C on el punt té tres
 * models i 0,95 on només en té un, contra 1,13 d'AROME i 1,18 de `best_match`.
 * Amb la deriva horària (a sota) i AROME als punts de 500 m amunt, la
 * comparativa dels 28 dies sencers dona 0,94 per a B i C i 0,88 per a A.
 *
 * ## La condició que ho fa funcionar
 *
 * **El model del lloc i el de les estacions han de ser de la mateixa
 * execució.** Si no, la diferència entre dues execucions es cola sencera dins
 * del residu. Simulat al nivell B: tot de l'última execució, 0,99 °C; tot
 * d'una execució d'un dia abans, 1,01 —l'antiguitat gairebé no hi fa res—; i
 * el lloc d'un dia abans amb les estacions fresques, 1,12. Per això
 * el model de les estacions el demana el worker de predicció en el mateix
 * refresc (`STATION_MODELS_SHARD`), i per a cada nivell es tria el que es va
 * demanar més a prop de quan es va refrescar aquell nivell.
 *
 * El llegeixen el worker d'observació, que fa el càlcul, la comparativa, que
 * el mesura, i la pàgina. No importa res.
 */

/** La xifra de cada punt de predicció, calculada pel worker d'observació. */
export const NOW_SHARD = 'temperatura-ara';
/** El model a les estacions, demanat pel worker de predicció. */
export const STATION_MODELS_SHARD = 'forecast/estacions';
/** La temperatura del model a cada punt, sense les altres variables. */
export const BASE_SHARD = 'forecast/temperatura';

/** Abast horitzontal del pes d'una estació. Ajustat, no triat a ull. */
export const CORRECTION_KM = 15;
/** Abast vertical: una estació 150 m més amunt ja pesa un 60 %. */
export const CORRECTION_M = 150;
/**
 * El pes del model sol. Amb una estació al costat, la correcció és gairebé la
 * seva; amb una estació a 30 km, que pesa 0,13, en queda poc més de la meitat.
 */
export const CORRECTION_SHRINK = 0.1;
/** Més enllà, una estació no compta gens. */
export const CORRECTION_MAX_KM = 60;
/**
 * Els punts dels nivells B i C a partir d'aquesta altitud porten AROME a més de
 * `best_match`. Ho decideix `forecast-refresh.ts`, i ho ha de saber la
 * comparativa per mesurar el que fa una fitxa.
 */
export const AROME_FROM_M = 500;

/** Per sota d'aquest pes la xifra és el model, i la pàgina ho diu. */
export const MODEL_ONLY_WEIGHT = 0.1;
/** Una lectura més vella no corregeix res: el residu d'abans d'ahir no és el d'ara. */
export const RESIDUAL_MAX_AGE_MIN = 180;
/** Una estimació més vella la pàgina no la fa servir. */
export const NOW_MAX_AGE_MIN = 90;

/**
 * Els models que es demanen a les estacions: els del nivell A. Els nivells B i C
 * només porten `best_match`, que hi és, i demanar-ne tres costa el mateix que
 * demanar-ne un —Open-Meteo compta per ubicació i el terra és 1—.
 */
export const STATION_MODELS = ['best_match', 'meteofrance_arome_france_hd', 'ecmwf_ifs025'] as const;

export interface StationModelFetch {
  fetchedAt: string;
  /** Instant UTC de la primera hora de les sèries. */
  start: string;
  /** Estació → model → temperatura, a la cota de l'estació. */
  stations: Record<string, Partial<Record<string, Array<number | null>>>>;
}

export interface StationModels {
  /** Les últimes, la més nova primer. */
  fetches: StationModelFetch[];
}

export interface BasePoint {
  /** La cota a què el model dona la temperatura. */
  e: number;
  tier: string;
  /** Els models que s'han fet la mitjana, que són els que tindrà el residu. */
  models: string[];
  /** Dècimes de grau, hora a hora des de `start`. */
  t: Array<number | null>;
}

export interface BaseTemperature {
  /** Instant UTC de la primera hora. */
  start: string;
  /** Quan es va refrescar cada nivell. */
  refreshedAt: Record<string, string>;
  points: Record<string, BasePoint>;
}

export interface NowPoint {
  /** °C a la cota `e`. La pàgina hi aplica el gradient fins a la del lloc. */
  t: number;
  e: number;
  /** Pes total de les estacions. Prop de zero, és el model sol. */
  w: number;
}

export interface NowTemperature {
  /** L'instant per al qual s'ha calculat. */
  at: string;
  points: Record<string, NowPoint>;
}

export interface StationResidual {
  lat: number;
  lon: number;
  altitud: number;
  residual: number;
}

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const r = Math.PI / 180;
  const x = Math.sin(((bLat - aLat) * r) / 2) ** 2
    + Math.cos(aLat * r) * Math.cos(bLat * r) * Math.sin(((bLon - aLon) * r) / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(x));
}

/** La correcció que toca a un lloc, i quant pesen les estacions que la donen. */
export function correctionAt(
  target: { lat: number; lon: number; altitud: number },
  stations: StationResidual[],
): { correction: number; weight: number } {
  let sw = 0;
  let sr = 0;
  for (const s of stations) {
    const d = km(target.lat, target.lon, s.lat, s.lon);
    if (d > CORRECTION_MAX_KM) continue;
    const dz = target.altitud - s.altitud;
    const w = Math.exp(-0.5 * (d / CORRECTION_KM) ** 2 - 0.5 * (dz / CORRECTION_M) ** 2);
    sw += w;
    sr += w * s.residual;
  }
  return { correction: sr / (sw + CORRECTION_SHRINK), weight: sw };
}

/**
 * El valor d'una sèrie horària en un instant, entre les dues hores que el
 * volten. Una lectura de les 10:30 es compara amb el model de les 10:30, no
 * amb el de les 10.
 */
export function valueAt(series: ReadonlyArray<number | null> | undefined, startMs: number, atMs: number): number | null {
  if (!series) return null;
  const x = (atMs - startMs) / 3_600_000;
  const i = Math.floor(x);
  if (i < 0 || i >= series.length) return null;
  const a = series[i];
  if (a == null) return null;
  const f = x - i;
  if (f === 0) return a;
  const b = series[i + 1];
  return b == null ? null : a + (b - a) * f;
}

/** La mitjana dels que hi són, o res si no n'hi ha cap. */
export function meanOf(values: ReadonlyArray<number | null | undefined>): number | null {
  const xs = values.filter((v): v is number => v != null && Number.isFinite(v));
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/**
 * De les peticions del model a les estacions, la que es va fer més a prop de
 * quan es va refrescar un nivell: la que més probablement és de la mateixa
 * execució que la predicció d'aquell nivell.
 */
export function fetchFor(fetches: StationModelFetch[], refreshedAt: string | undefined): StationModelFetch | null {
  if (!fetches.length) return null;
  if (!refreshedAt) return fetches[0];
  const t = Date.parse(refreshedAt);
  return fetches.reduce((best, f) =>
    Math.abs(Date.parse(f.fetchedAt) - t) < Math.abs(Date.parse(best.fetchedAt) - t) ? f : best);
}

/* ── La deriva horària del residu ──────────────────────────────────────────
 *
 * El residu de la lectura (fa una hora) no és el d'ara: l'error d'un model a
 * les 9 del matí no és el de les 8, perquè cada model escalfa i refreda a un
 * ritme que no és ben bé el del terreny, i cada estació té el seu. Així que
 * per a cada estació, cada joc de models i cada hora del dia es guarda quant
 * canvia el residu d'una hora a la següent, i se suma al residu abans
 * d'interpolar-lo. Mesurat: de 0,946 a 0,926 °C partint de `best_match`, i de
 * 0,854 a 0,831 amb AROME.
 *
 * És una mitjana que oblida: cada dada nova pesa més que les velles
 * (`DRIFT_DECAY`), i amb poques dades tira cap a zero (`DRIFT_PRIOR`) —una
 * estació nova no corregeix res fins que n'ha vist uns quants dies—.
 */

export const DRIFT_SHARD = 'temperatura-deriva';
/** Per actualització d'una mateixa hora del dia, que n'hi ha dues al dia: memòria de deu dies. */
export const DRIFT_DECAY = 0.95;
/** Quantes observacions «fictícies» de canvi zero hi ha al començament. */
export const DRIFT_PRIOR = 2;
/** El retard més gran a què s'aplica: més enllà, la deriva d'una hora no diu res. */
const DRIFT_MAX_HOURS = 2;

export interface StationDrift {
  /** Els residus de les últimes hores, per instant ISO de la lectura. */
  recent: Record<string, number>;
  /** Per hora UTC del dia: suma ponderada dels canvis i el seu pes. */
  sum: number[];
  n: number[];
}

export interface DriftState {
  /** Joc de models (`best_match,meteofrance_arome_france_hd`) → estació → deriva. */
  sets: Record<string, Record<string, StationDrift>>;
}

export function emptyStationDrift(): StationDrift {
  return { recent: {}, sum: Array(24).fill(0), n: Array(24).fill(0) };
}

/**
 * Apunta el residu d'una lectura. Si n'hi ha un d'una hora abans i aquesta
 * lectura no s'havia vist, el canvi entra a la mitjana de la seva hora.
 * Torna si l'ha fet servir.
 */
export function recordResidual(d: StationDrift, ts: string, residual: number): boolean {
  const t = Date.parse(ts);
  if (!Number.isFinite(t)) return false;
  // La clau sempre en el mateix format: la XEMA escriu `…:00Z` i `toISOString`, `…:00.000Z`.
  const key = new Date(t).toISOString();
  if (d.recent[key] != null) return false;
  d.recent[key] = residual;
  for (const k of Object.keys(d.recent)) {
    if (t - Date.parse(k) > 3 * 3_600_000) delete d.recent[k];
  }
  const before = d.recent[new Date(t - 3_600_000).toISOString()];
  if (before == null) return false;
  const hod = new Date(t).getUTCHours();
  d.sum[hod] = d.sum[hod] * DRIFT_DECAY + (residual - before);
  d.n[hod] = d.n[hod] * DRIFT_DECAY + 1;
  return true;
}

/**
 * El residu d'una lectura portat a un altre instant: el de la lectura més el
 * que sol canviar en aquella hora del dia, en proporció a les hores que han
 * passat.
 */
export function driftedResidual(d: StationDrift | undefined, residual: number, readingMs: number, atMs: number): number {
  if (!d) return residual;
  const hours = Math.min(DRIFT_MAX_HOURS, Math.max(0, (atMs - readingMs) / 3_600_000));
  const hod = new Date(atMs).getUTCHours();
  return residual + (d.sum[hod] / (d.n[hod] + DRIFT_PRIOR)) * hours;
}
