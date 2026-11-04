/**
 * La comparativa de temperatura: com encerta la temperatura «d'ara» que
 * ensenya aquest web, al costat de la dels models que fan servir les
 * aplicacions del temps.
 *
 * ## Què es mesura, exactament
 *
 * Una fitxa de poble no té termòmetre propi: ensenya la lectura de l'estació
 * de la XEMA que el build li ha triat —distància i desnivell, `stationCost`—
 * corregida per la cota. La pregunta és si això s'acosta més a la temperatura
 * que fa al poble que el que diu un model per a aquell mateix punt.
 *
 * Al poble no hi ha res que digui quina temperatura hi fa. A una estació sí,
 * així que es fa al revés: **es fa veure que l'estació no hi és**. Per a cada
 * estació i cada hora, la nostra xifra surt de les altres estacions —la
 * mateixa tria i la mateixa correcció que fa una fitxa— i la del model, de la
 * seva predicció per a aquelles coordenades i aquella cota. Totes dues es
 * comparen amb el que l'estació ha mesurat de debò.
 *
 * És una prova **en contra nostra**: traient l'estació, la veïna més propera
 * queda més lluny del que queda de la majoria de pobles —a la web, un poble
 * té la seva estació més a prop que una estació la seva veïna—, i en canvi el
 * model no perd res.
 *
 * Google, Apple o qualsevol aplicació concreta no es poden mesurar: no
 * publiquen què deien ahir. El que sí es pot mesurar són els models que hi ha
 * darrere de la majoria, i `best_match` és el que tria Open-Meteo per a cada
 * punt, que és el més semblant a una aplicació genèrica.
 *
 * El llegeixen el worker que l'escriu i la pàgina que l'ensenya, i per això
 * no importa res.
 */

export const COMPARE_SHARD = 'compare/temperatura';

/** El nostre mètode. */
export const OURS = 'tempscat';

/** Els models, en l'ordre en què es pinten. */
export const COMPARE_MODELS = [
  'best_match', 'ecmwf_ifs025', 'gfs_seamless', 'icon_eu', 'meteofrance_arome_france_hd',
] as const;

/**
 * Una tercera manera, en prova: la lectura de la veïna més **la diferència que
 * el model veu entre els dos punts**, en comptes del gradient fix.
 *
 * El gradient de 6,5 °C/km és el de l'atmosfera estàndard i en una nit
 * d'inversió va al revés: el fons de la vall és més fred que el vessant. El
 * model, en canvi, sí que sap que aquella nit hi ha inversió. Si això encerta
 * més que les altres dues, és el que hauria de fer la fitxa.
 */
export const GUIDED = 'guiat';

export const COMPARE_SOURCES = [OURS, GUIDED, ...COMPARE_MODELS] as const;
export type CompareSource = typeof COMPARE_SOURCES[number];

/** Com es diu cada font a la pàgina. */
export const SOURCE_LABEL: Record<CompareSource, string> = {
  tempscat: 'Aquest web',
  guiat: 'Estació + diferència del model (en prova)',
  best_match: 'Open-Meteo (el que tria per a cada punt)',
  ecmwf_ifs025: 'ECMWF IFS',
  gfs_seamless: 'GFS (NOAA)',
  icon_eu: 'ICON-EU (DWD)',
  meteofrance_arome_france_hd: 'AROME (Météo-France)',
};

/**
 * Sumatoris, no mitjanes: una mitjana desada no es pot seguir acumulant sense
 * tornar-la a ponderar, i el dia que algú ho fes malament el número seguiria
 * semblant una mitjana.
 */
export interface CompareTally {
  n: number;
  sumError: number;
  sumAbs: number;
  /** Quantes vegades l'error ha passat de 3 °C: les que es noten. */
  gt3: number;
}

export interface CompareStation {
  /** Per font. Només hi entren les hores on **totes** les fonts tenien valor. */
  bySource: Partial<Record<CompareSource, CompareTally>>;
  /** Per fer la mitjana de quant lluny queda la veïna que fem servir. */
  sumNeighbourKm: number;
  sumNeighbourDAlt: number;
}

export interface CompareScores {
  /**
   * Les fonts amb què s'ha sumat. Si la llista canvia, el registre es torna a
   * començar: una font nova amb menys hores que les altres no es pot comparar.
   */
  sources: string[];
  /** Les dates (UTC) ja puntuades. Un dia no entra mai dues vegades. */
  scored: string[];
  stations: Record<string, CompareStation>;
  /** Per hora UTC del dia, `00`…`23`. */
  byHour: Record<string, Partial<Record<CompareSource, CompareTally>>>;
}

export function emptyCompare(): CompareScores {
  return { sources: [...COMPARE_SOURCES], scored: [], stations: {}, byHour: {} };
}

export function emptyCompareTally(): CompareTally {
  return { n: 0, sumError: 0, sumAbs: 0, gt3: 0 };
}

/** Suma uns quants sumatoris en un. */
export function sumTallies(ts: Array<CompareTally | undefined>): CompareTally {
  const out = emptyCompareTally();
  for (const t of ts) {
    if (!t) continue;
    out.n += t.n;
    out.sumError += t.sumError;
    out.sumAbs += t.sumAbs;
    out.gt3 += t.gt3;
  }
  return out;
}

export const compareMae = (t: CompareTally | undefined): number | null =>
  t && t.n ? t.sumAbs / t.n : null;

export const compareBias = (t: CompareTally | undefined): number | null =>
  t && t.n ? t.sumError / t.n : null;

export const compareGt3 = (t: CompareTally | undefined): number | null =>
  t && t.n ? t.gt3 / t.n : null;

/**
 * Fins on es busca la veïna. El mateix sostre que posa el build a l'estació
 * d'una fitxa: més enllà, cap poble en té.
 */
export const NEIGHBOUR_MAX_KM = 60;

/** Dies cap enrere que es recuperen si falten. */
export const BACKFILL_DAYS = 30;
