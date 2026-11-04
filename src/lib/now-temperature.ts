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
