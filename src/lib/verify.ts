/**
 * L'encert de cada model: on viu i quina forma té.
 *
 * ## Per què això existeix abans de servir per a res
 *
 * Perquè la millora de qualitat més gran que li queda al projecte —deixar de
 * fer pesar igual tots els models i ponderar-los pel que encerten— **no es pot
 * fer el dia que es decideixi**: necessita dos mesos de comparacions ja
 * acumulades. Cada dia que no s'acumula res és un dia que aquella millora
 * s'endarrereix, així que el registre s'engega molt abans que la pàgina el
 * pugui fer servir.
 *
 * I la predicció **s'ha de desar abans de comparar-la**. El fitxer de predicció
 * es reescriu a cada refresc: demà ja no hi haurà manera de saber què deia
 * ahir. Per això hi ha dues meitats, i la primera no serveix de res tota sola:
 *
 *  · **la captura**, que desa el que cada model diu d'un dia que encara no ha
 *    passat, i
 *  · **la puntuació**, que quan aquell dia s'acaba el compara amb el que han
 *    mesurat les estacions.
 *
 * ## Contra què es compara
 *
 * Contra la XEMA, que és l'única veritat mesurada que tenim: la màxima, la
 * mínima i la pluja del dia a cada estació. No contra la nostra pròpia
 * predicció d'un altre dia, que seria un mirall.
 *
 * ## No importa res, com la resta de fitxers compartits
 *
 * El llegeixen el worker que l'escriu i la pàgina que l'ensenyarà, i les dues
 * bandes han d'entendre igual què és un dia d'antelació i què és un error. Amb
 * dues còpies, el dia que una canviï de criteri hi hauria dues respostes per a
 * la mateixa pregunta.
 */

export const VERIFY_DIR = 'verify';

/** El que s'ha desat d'un dia que encara no havia passat. */
export function pendingShard(targetDate: string): string {
  return `${VERIFY_DIR}/pendent/${targetDate}`;
}

/** El registre acumulat, que és el que sobreviu. */
export function scoresShard(): string {
  return `${VERIFY_DIR}/encert`;
}

/**
 * Dies d'antelació que es guarden.
 *
 * Tres, i no set: l'objectiu és ponderar el consens de les properes hores, i
 * el pes d'un model a set dies vista no el decidirà cap número que puguem
 * acumular en dos mesos. Cada dia de més multiplica el que s'escriu.
 */
export const LEADS = [1, 2, 3] as const;

/** Les tres coses que es comproven. Mesurables totes tres a la XEMA. */
export const VERIFY_VARS = ['tMax', 'tMin', 'precip'] as const;
export type VerifyVar = typeof VERIFY_VARS[number];

/** El que un model deia d'un dia, en un punt. */
export interface Predicted {
  tMax: number | null;
  tMin: number | null;
  precip: number | null;
}

export interface Pending {
  /** El dia sobre el qual es prediu, `AAAA-MM-DD`. */
  target: string;
  /** Per dies d'antelació: `1` és «desat ahir per a avui». */
  byLead: Record<string, {
    /** Quan es va desar. */
    issued: string;
    /** Per estació i model. */
    stations: Record<string, Record<string, Predicted>>;
  }>;
}

/**
 * Els sumatoris, no les mitjanes.
 *
 * Es desen `n`, la suma dels errors i la suma dels valors absoluts, i d'aquí
 * surten el biaix i l'error mitjà. Desant ja la mitjana no es podria seguir
 * acumulant sense tornar-la a ponderar, i el dia que algú ho fes malament el
 * número seguiria semblant una mitjana.
 */
export interface Tally {
  n: number;
  /** Suma de (previst − mesurat). El signe diu si el model va alt o baix. */
  sumError: number;
  /** Suma dels valors absoluts. Dividida per `n`, l'error mitjà absolut. */
  sumAbs: number;
}

export interface Scores {
  /** El primer dia puntuat i l'últim, per saber sobre quant es parla. */
  from: string;
  to: string;
  /** Quants dies distints hi han entrat. */
  days: number;
  /** `model → variable → antelació → sumatori`. */
  models: Record<string, Partial<Record<VerifyVar, Record<string, Tally>>>>;
}

/** L'error mitjà absolut, o null si encara no hi ha res. */
export function mae(t: Tally | undefined): number | null {
  return t && t.n > 0 ? t.sumAbs / t.n : null;
}

/** El biaix: positiu vol dir que el model diu més del que es mesura. */
export function bias(t: Tally | undefined): number | null {
  return t && t.n > 0 ? t.sumError / t.n : null;
}

/**
 * Dies puntuats a partir dels quals la comparació es pot ensenyar.
 *
 * Amb una setmana, el que es mesura és el temps que ha fet aquella setmana i
 * no l'encert d'un model: un episodi convectiu castiga els models que hi
 * afinen igual que els que no. Seixanta dies és el que hi ha escrit al full de
 * ruta i el que separa una xifra d'una anècdota.
 */
export const MIN_DAYS = 60;
