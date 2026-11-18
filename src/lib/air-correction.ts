/**
 * El NO₂ de CAMS, corregit amb les estacions de la XVPCA del voltant.
 *
 * ## Per què
 *
 * CAMS treballa a cel·les d'11 km i el NO₂ canvia a pocs centenars de metres
 * d'una via amb trànsit. A la cel·la que va de 2,05° a 2,15° —Collserola, la
 * Ronda de Dalt, l'Hospitalet— CAMS posava **30 µg/m³** a tot arreu, i
 * l'Observatori Fabra, a 415 m dins del parc, en mesurava **7** de mitjana. La
 * fitxa de Vallvidrera sortia pitjor que la del centre, que cau en una cel·la
 * amb mig mar. Mesurat sobre 92 dies d'agost a novembre de 2026.
 *
 * ## Com
 *
 * Cada estació de fons diu quant s'equivoca CAMS al seu punt, com a **raó**
 * —`ln((mesurat+1)/(CAMS+1))`, mitjana dels últims 30 dies— i un lloc rep la
 * mitjana d'aquestes raons de les estacions a menys de 15 km, pesades per la
 * distància i encongides cap a zero quan n'hi ha poques (`EPS`) o són lluny. És la mateixa
 * interpolació de residus que la temperatura d'ara (`now-temperature.ts`).
 *
 * Tres coses que es van provar i que no s'hi van quedar:
 *
 *  · **En µg sumats i no en raó**, l'error baixava la meitat: un biaix que és
 *    «CAMS en posa el doble» no es pot traslladar sumant.
 *  · **El trànsit d'OpenStreetMap** al voltant del punt, comparat amb el de la
 *    cel·la: en conjunt no hi afegia res (10,86 contra 10,86 µg/m³) i duia una
 *    descàrrega de 114 MB amb llicència ODbL.
 *  · **El PM2,5, el PM10 i l'ozó**: amb el mateix mètode la meitat de les
 *    estacions empitjoraven. Només es corregeix el NO₂, que és el que mana
 *    l'índex a les ciutats.
 *
 * Resultat, deixant cada estació de fons fora i estimant-la amb les altres:
 * l'error hora a hora del NO₂ passa de **14,8 a 10,7 µg/m³**. Millora a 23 de
 * 38 estacions, 12 queden igual —la majoria perquè no tenen cap estació a
 * 15 km— i 3 empitjoren: l'Ametlla de Mar i Vandellòs, de 2-3 µg a 4, i
 * Badalona, de 12,8 a 14,2. Les estacions de **trànsit**
 * no són donants: mesuren el carrer, i una fitxa parla del poble.
 *
 * ## Restricció
 *
 * No importa res: el carreguen el worker de l'aire (amb `.ts`) i la pàgina.
 */

/** Una estació que diu quant s'equivoca CAMS al seu punt. */
export interface No2Donor {
  code: string;
  name: string;
  lat: number;
  lon: number;
  /** `ln((mesurat+1)/(CAMS+1))`, mitjana horària de la finestra. */
  logRatio: number;
  /** Hores amb lectura i model dins de la finestra. */
  hours: number;
}

/** Fins on arriba una estació. Provats 10, 15, 25 i 40 km: 15 és el millor. */
export const NO2_RANGE_KM = 15;
/**
 * L'escala del pes, `exp(−(d/L)²)`: a 5 km una estació pesa un 37 %, a 10 km
 * un 2 %. Provats 2, 3, 4, 5, 6 i 8 km, i el con `(1 − d/R)²`: 5 és el millor.
 * Més estret no ajuda —el que una estació té de propi no ho comparteix la del
 * costat—, i més ample aplana la ciutat sencera en un sol número.
 */
export const NO2_SCALE_KM = 5;
/**
 * Quant pesa «no ho sé». Amb una sola estació a 3 km, la correcció se'n queda
 * el 86 %; a 8 km, el 42 %.
 */
export const NO2_EPS = 0.1;
/** Dies de la finestra del biaix. */
export const NO2_WINDOW_DAYS = 30;
/** Fracció mínima d'hores amb dada perquè una estació compti. */
export const NO2_MIN_COVERAGE = 0.6;

export function kmBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dy = (bLat - aLat) * 111.2;
  const dx = (bLon - aLon) * 111.2 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dx, dy);
}

export interface No2Correction {
  /** El que se suma al logaritme: `(CAMS+1)·e^logRatio − 1`. */
  logRatio: number;
  /** L'estació que més pesa, per dir-ho a la pàgina. */
  nearest: { name: string; km: number };
  stations: number;
}

/**
 * La correcció d'un punt, o null si no hi ha cap estació a l'abast. Sense
 * estacions no es corregeix res: CAMS sol és el que hi havia.
 */
export function no2Correction(lat: number, lon: number, donors: No2Donor[]): No2Correction | null {
  let sw = 0;
  let sv = 0;
  let n = 0;
  let best: { name: string; km: number; w: number } | null = null;
  for (const d of donors) {
    const km = kmBetween(lat, lon, d.lat, d.lon);
    if (km > NO2_RANGE_KM) continue;
    const w = Math.exp(-((km / NO2_SCALE_KM) ** 2));
    sw += w;
    sv += w * d.logRatio;
    n++;
    if (!best || w > best.w) best = { name: d.name, km, w };
  }
  if (!best) return null;
  return { logRatio: sv / (sw + NO2_EPS), nearest: { name: best.name, km: best.km }, stations: n };
}

export function correctNo2(cams: number, logRatio: number): number {
  return Math.max(0, (cams + 1) * Math.exp(logRatio) - 1);
}

/**
 * Subíndex europeu del NO₂ a partir de la concentració horària.
 *
 * Lineal per trams entre els llindars de l'EEA, que és com el calcula
 * Open-Meteo: comprovat contra les seves parelles (18,4 µg → 9, 41,3 → 21,
 * 59,2 → 28).
 */
const NO2_BREAKS: Array<[number, number]> = [[0, 0], [40, 20], [90, 40], [120, 60], [230, 80], [340, 100], [1000, 120]];

export function no2SubIndex(no2: number): number {
  for (let i = 1; i < NO2_BREAKS.length; i++) {
    const [c1, i1] = NO2_BREAKS[i];
    if (no2 <= c1) {
      const [c0, i0] = NO2_BREAKS[i - 1];
      return i0 + ((no2 - c0) / (c1 - c0)) * (i1 - i0);
    }
  }
  return NO2_BREAKS[NO2_BREAKS.length - 1][1];
}

/**
 * L'índex amb el NO₂ corregit: el pitjor dels subíndexs, com el de l'EEA.
 *
 * Si l'índex original era més alt que tots els subíndexs que tenim —el SO₂
 * també hi compta i no el desem—, aquell valor es manté com a sostre inferior:
 * corregir el NO₂ no pot amagar un altre contaminant.
 */
export function aqiWithNo2(
  aqi: number | null,
  subs: { pm2_5: number | null; pm10: number | null; no2: number | null; o3: number | null },
  newNo2Sub: number,
): number | null {
  if (aqi == null) return null;
  const others = Math.max(subs.pm2_5 ?? 0, subs.pm10 ?? 0, subs.o3 ?? 0);
  const known = Math.max(others, subs.no2 ?? 0);
  const floor = aqi > known + 0.5 ? aqi : others;
  return Math.round(Math.max(floor, newNo2Sub));
}
