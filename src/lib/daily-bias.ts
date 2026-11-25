/**
 * La màxima i la mínima previstes, corregides amb l'error que el model està
 * fent a les estacions del voltant.
 *
 * ## Per què
 *
 * Els models aplanen el dia: a les estacions de la XEMA, del setembre al
 * novembre de 2026, la màxima prevista sortia **1,1 °C massa baixa** i la mínima
 * **1,3 °C massa alta**, a tots els horitzons i a tots els models (`best_match`,
 * ECMWF, AROME). La fitxa ho heretava, i per això, comparada poble a poble amb
 * l'AEMET —que corregeix la seva sortida— perdia per 0,2 graus a la màxima i a
 * la mínima, i amb yr.no empatava o perdia.
 *
 * ## Com
 *
 * Igual que la temperatura d'ara (`now-temperature.ts`), però amb el dia
 * sencer: cada estació diu quant s'ha equivocat el model a la seva màxima i a
 * la seva mínima **els últims 30 dies**, amb la predicció d'un dia abans, i un
 * lloc rep la mitjana d'aquests errors de les estacions a menys de 40 km,
 * pesades per la distància i pel desnivell i encongides cap a zero quan n'hi
 * ha poques o són lluny. L'error se li resta a la màxima i a la mínima de
 * **tots** els dies de la predicció, i les hores es mouen d'acord perquè la
 * taula horària no contradigui la llista de dies.
 *
 * L'error és el de `best_match` a l'estació, i no el de la fitxa: el de
 * `best_match` es desa des del setembre a 166 estacions, i té el mateix biaix
 * que la fitxa (−1,08 i +1,30 °C contra −1,18 i +1,38).
 *
 * ## Quant encerta
 *
 * Mesurat del 13 de setembre al 23 de novembre de 2026 **deixant cada estació
 * fora** i corregint-la amb les altres, i amb les dades amb el retard que
 * tindran de debò (la sèrie diària de la XEMA va dos dies tard). A les
 * estacions que representen el seu poble, la fitxa contra l'AEMET:
 *
 *                       fitxa   corregida   AEMET
 *     màxima a 1 dia    1,40      0,93      1,14
 *     màxima a 3 dies   1,47      1,06      1,24
 *     mínima a 1 dia    1,71      1,33      1,50
 *     mínima a 3 dies   1,81      1,41      1,54
 *
 * Contra yr.no, igual: 0,93 contra 1,39 a la màxima de demà.
 *
 * Provat i descartat: corregir a part el nivell mitjà i l'amplitud del dia (en
 * raó), que donava 1,21 i 1,61 en lloc d'1,19 i 1,54; finestres de 7 i 14 dies,
 * pitjors a la mínima; escales de 8 i 15 km, pitjors.
 *
 * ## Restricció
 *
 * No importa res: el carreguen el worker de verificació (amb `.ts`) i la pàgina.
 */

/** On viu: el publica el worker de verificació un cop al dia. */
export const DAILY_BIAS_SHARD = 'verify/biaix';

/** Dies de la finestra. */
export const BIAS_WINDOW_DAYS = 30;
/** Dies amb dada que ha de tenir una estació perquè compti. */
export const BIAS_MIN_DAYS = 5;
/** Fins on arriba una estació. */
export const BIAS_RANGE_KM = 40;
/** L'escala del pes per distància, `exp(−(d/L)²)`. */
export const BIAS_SCALE_KM = 25;
/** L'escala del pes per desnivell, `exp(−(h/H)²)`. */
export const BIAS_SCALE_M = 300;
/** Quant pesa «no ho sé». */
export const BIAS_EPS = 0.1;

export interface BiasStation {
  codi: string;
  nom: string;
  lat: number;
  lon: number;
  alt: number;
  /** Mitjana de (previst − mesurat) a la finestra, en °C. Null sense prou dies. */
  tMax: number | null;
  tMin: number | null;
  /** Dies amb dada. */
  n: number;
}

export interface DailyBias {
  /** El primer i l'últim dia de la finestra. */
  from: string;
  to: string;
  stations: BiasStation[];
}

export interface BiasCorrection {
  /** El que se **suma** a la màxima i a la mínima previstes. */
  tMax: number;
  tMin: number;
  /** L'estació que més hi pesa, per dir-ho a la pàgina. */
  nearest: { nom: string; km: number };
  stations: number;
}

function km(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dy = (bLat - aLat) * 111.2;
  const dx = (bLon - aLon) * 111.2 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

/**
 * La correcció d'un lloc, o null si no hi ha cap estació a l'abast: llavors la
 * predicció es queda com la dona el model.
 */
export function biasCorrectionAt(
  lat: number, lon: number, altitud: number | null, bias: DailyBias,
): BiasCorrection | null {
  let wMax = 0, sMax = 0, wMin = 0, sMin = 0, n = 0;
  let best: { nom: string; km: number; w: number } | null = null;
  for (const s of bias.stations) {
    const d = km(lat, lon, s.lat, s.lon);
    if (d > BIAS_RANGE_KM) continue;
    const dh = altitud != null ? Math.abs(altitud - s.alt) : 0;
    const w = Math.exp(-((d / BIAS_SCALE_KM) ** 2)) * Math.exp(-((dh / BIAS_SCALE_M) ** 2));
    let used = false;
    if (s.tMax != null) { wMax += w; sMax += w * s.tMax; used = true; }
    if (s.tMin != null) { wMin += w; sMin += w * s.tMin; used = true; }
    if (!used) continue;
    n++;
    if (!best || w > best.w) best = { nom: s.nom, km: d, w };
  }
  if (!best) return null;
  // L'error és previst − mesurat: la correcció és el contrari.
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    tMax: round(-(sMax / (wMax + BIAS_EPS))),
    tMin: round(-(sMin / (wMin + BIAS_EPS))),
    nearest: { nom: best.nom, km: Math.round(best.km * 10) / 10 },
    stations: n,
  };
}

/**
 * Les hores d'un dia, mogudes perquè el seu mínim i el seu màxim acabin on
 * diuen la mínima i la màxima corregides.
 *
 * Cada hora es mou entre la correcció de la mínima i la de la màxima segons on
 * cau dins del dia: l'hora més freda, la de la mínima; la més calenta, la de la
 * màxima; les del mig, la proporció. Movent-les totes igual, la taula horària
 * diria una màxima i la llista de dies una altra.
 */
export function hourShift(t: number, dayMin: number, dayMax: number, c: BiasCorrection): number {
  if (!(dayMax > dayMin)) return (c.tMax + c.tMin) / 2;
  const f = Math.min(1, Math.max(0, (t - dayMin) / (dayMax - dayMin)));
  return c.tMin + (c.tMax - c.tMin) * f;
}

/**
 * La sèrie horària i la diària d'un lloc, corregides. Les hores i els dies van
 * pel dia local que porta la clau (`AAAA-MM-DD…`), que és com els agrupa
 * `aggregateDaily`.
 */
export function correctSeries<
  H extends { time: string; temperature: number | null; apparent?: number | null },
  D extends { date: string; tMax: number | null; tMin: number | null },
>(hourly: H[], daily: D[], c: BiasCorrection): { hourly: H[]; daily: D[] } {
  const span = new Map<string, { lo: number; hi: number }>();
  for (const h of hourly) {
    if (h.temperature == null) continue;
    const day = h.time.slice(0, 10);
    const s = span.get(day);
    if (!s) span.set(day, { lo: h.temperature, hi: h.temperature });
    else { s.lo = Math.min(s.lo, h.temperature); s.hi = Math.max(s.hi, h.temperature); }
  }
  const round = (v: number) => Math.round(v * 10) / 10;
  return {
    hourly: hourly.map((h) => {
      const s = span.get(h.time.slice(0, 10));
      if (h.temperature == null || !s) return h;
      const d = hourShift(h.temperature, s.lo, s.hi, c);
      return {
        ...h,
        temperature: round(h.temperature + d),
        ...(h.apparent != null ? { apparent: round(h.apparent + d) } : {}),
      };
    }),
    daily: daily.map((d) => ({
      ...d,
      tMax: d.tMax != null ? round(d.tMax + c.tMax) : null,
      tMin: d.tMin != null ? round(d.tMin + c.tMin) : null,
    })),
  };
}
