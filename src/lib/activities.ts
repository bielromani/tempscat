import 'server-only';
import { allObservations, allHistory } from './weather';
import { operativeStations } from './territory';
import { allBeaches, seaPoints, type Beach, type SeaPoint } from './sea';
import { msToKmh } from './variables';

/**
 * Condicions per sortir: muntanya i mar.
 *
 * ## La regla que mana sobre les dues pàgines
 *
 * **Cap índex, cap nota de l'u al deu.** És la mateixa norma que a `/bolets` i
 * pel mateix motiu: un número compost amaga què el mou. Si baixa de 7 a 5, el
 * lector no sap si és el vent, la temperatura o un pes que algú va triar a ull,
 * i no ho pot discutir. Els números per separat no amaguen res, i qui puja a la
 * muntanya o surt a navegar els interpreta millor que nosaltres.
 *
 * El que sí que es fa és dir **on són els llindars de veritat** —els de
 * Beaufort, els de Douglas, els de l'OMS— que existeixen fora d'aquest web i
 * els pot comprovar qualsevol.
 *
 * ## I tot mesurat, sempre que es pugui
 *
 * Les dues pàgines s'aguanten sobre observació de la XEMA i no sobre predicció.
 * La ratxa que ha fet fa mitja hora al cim de la Tosa és un fet; la que farà
 * demà és una altra conversa i ja té la seva pàgina.
 */

// ── Muntanya ────────────────────────────────────────────────────────────────

/** A partir d'aquí una estació és de muntanya per a aquesta pàgina. */
export const MOUNTAIN_M = 1200;

/** El cim més alt de Catalunya. Marca fins on té sentit parlar d'isoterma. */
const PICA_DESTATS_M = 3143;

export interface MountainStation {
  codi: string;
  nom: string;
  altitud: number;
  comarcaNom: string | null;
  path?: string;
  temperature: number | null;
  /** Sensació amb el vent, quan el vent és prou fort per canviar-la. */
  windChill: number | null;
  windKmh: number | null;
  gustKmh: number | null;
  windDir: number | null;
  humidity: number | null;
  snowCm: number | null;
  ageMin: number;
}

export interface FreezingLevel {
  /** Altitud de la isoterma de 0 °C. `null` si caldria extrapolar. */
  metres: number | null;
  /** Gradient mesurat, °C per cada 1.000 m. Negatiu. */
  lapse: number;
  /** Qualitat de l'ajust, de 0 a 1. */
  r2: number;
  stations: number;
  lowest: number;
  highest: number;
  /** Per què no hi ha xifra, quan no n'hi ha. */
  beyond: 'amunt' | 'avall' | null;
}

export interface HikingConditions {
  freezing: FreezingLevel | null;
  stations: MountainStation[];
  source: string;
}

/**
 * La isoterma de zero graus, **mesurada**.
 *
 * Surt d'una regressió de la temperatura contra l'altitud sobre les 183
 * estacions que ara mateix donen les dues coses. No és el nivell de congelació
 * d'un model: és on creuen el zero les temperatures que hi ha realment.
 *
 * ## Quan no es publica la xifra, i per què
 *
 * Un dia d'agost la recta creua el zero cap als 5.500 metres. Escriure-ho seria
 * **extrapolar tres quilòmetres per damunt de l'estació més alta**, que és a
 * 2.537: precisió inventada del tipus que aquest projecte no publica. Si el
 * creuament cau fora del rang d'altituds mesurades es diu això mateix, que és
 * per damunt de qualsevol cim o per sota de tot, i prou.
 *
 * ## I no és la cota de neu
 *
 * És l'error clàssic. La neu es fon mentre baixa, així que la cota on arriba
 * blanca queda **dos-cents o tres-cents metres per sota** de la isoterma. Aquí
 * es diu isoterma perquè és el que és.
 */
function freezingLevel(rows: Array<{ altitud: number; temperature: number }>): FreezingLevel | null {
  if (rows.length < 30) return null;

  const n = rows.length;
  const mx = rows.reduce((a, r) => a + r.altitud, 0) / n;
  const my = rows.reduce((a, r) => a + r.temperature, 0) / n;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const r of rows) {
    sxy += (r.altitud - mx) * (r.temperature - my);
    sxx += (r.altitud - mx) ** 2;
    syy += (r.temperature - my) ** 2;
  }
  if (sxx === 0 || syy === 0) return null;

  const slope = sxy / sxx;
  const intercept = my - slope * mx;
  const r2 = (sxy * sxy) / (sxx * syy);
  if (slope >= 0) return null;   // inversió tèrmica: la recta no diu res útil

  const crossing = -intercept / slope;
  const lowest = Math.min(...rows.map((r) => r.altitud));
  const highest = Math.max(...rows.map((r) => r.altitud));

  // Fora del rang mesurat només es diu la direcció, mai una xifra.
  const beyond = crossing > Math.max(highest, PICA_DESTATS_M) ? 'amunt' as const
    : crossing < lowest ? 'avall' as const
      : null;

  return {
    metres: beyond ? null : Math.round(crossing / 50) * 50,
    lapse: Math.round(slope * 1000 * 100) / 100,
    r2: Math.round(r2 * 1000) / 1000,
    stations: n,
    lowest,
    highest,
    beyond,
  };
}

/**
 * Sensació tèrmica pel vent, fórmula de l'índex nord-americà i canadenc.
 *
 * Només val amb fred i amb vent: per damunt de 10 °C o per sota de 5 km/h la
 * fórmula deixa de descriure res i es retorna `null` en comptes d'un número
 * que sembla bo.
 */
function windChill(tempC: number, kmh: number): number | null {
  if (tempC > 10 || kmh < 5) return null;
  const v = kmh ** 0.16;
  return Math.round((13.12 + 0.6215 * tempC - 11.37 * v + 0.3965 * tempC * v) * 10) / 10;
}

export async function hikingConditions(): Promise<HikingConditions | null> {
  const snap = await allObservations();
  if (!snap) return null;

  const stations = new Map(operativeStations().map((s) => [s.codi, s]));
  const history = new Map((await allHistory()).map((h) => [h.station, h]));

  const forFit: Array<{ altitud: number; temperature: number }> = [];
  const mountain: MountainStation[] = [];

  for (const o of snap.data) {
    const s = stations.get(o.station);
    if (!s || s.altitud == null) continue;
    const t = o.values.temperature?.value ?? null;
    if (t != null) forFit.push({ altitud: s.altitud, temperature: t });

    if (s.altitud < MOUNTAIN_M) continue;

    const windMs = o.values.wind_speed?.value ?? null;
    const gustMs = o.values.wind_gust?.value ?? null;
    const kmh = windMs != null ? Math.round(msToKmh(windMs)) : null;

    mountain.push({
      codi: s.codi,
      nom: s.nom,
      altitud: s.altitud,
      comarcaNom: s.comarcaNom ?? null,
      path: s.nearestLocation?.path,
      temperature: t,
      windChill: t != null && kmh != null ? windChill(t, kmh) : null,
      windKmh: kmh,
      gustKmh: gustMs != null ? Math.round(msToKmh(gustMs)) : null,
      windDir: o.values.wind_direction?.value ?? null,
      humidity: o.values.humidity?.value ?? null,
      snowCm: history.get(s.codi)?.snow?.depthCm ?? null,
      ageMin: o.ageMin,
    });
  }

  return {
    freezing: freezingLevel(forFit),
    stations: mountain.sort((a, b) => b.altitud - a.altitud),
    source: snap.source,
  };
}

// ── Mar ─────────────────────────────────────────────────────────────────────

export interface SeaStretch {
  near: string;
  lat: number;
  sst: number | null;
  waveHeight: number | null;
  wavePeriod: number | null;
  waveDirection: number | null;
  swellHeight: number | null;
  /** Onada màxima de les pròximes 24 h, i a quina hora. */
  peak: { time: string; height: number } | null;
  /** Vent mesurat a l'estació costanera més propera. */
  wind: {
    station: string;
    distKm: number;
    kmh: number | null;
    gustKmh: number | null;
    direction: number | null;
    ageMin: number;
  } | null;
}

export interface NauticalConditions {
  stretches: SeaStretch[];
  beaches: Beach[];
  source: string;
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const p = Math.PI / 180;
  const s = Math.sin(((bLat - aLat) * p) / 2) ** 2
    + Math.cos(aLat * p) * Math.cos(bLat * p) * Math.sin(((bLon - aLon) * p) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Més enllà, el vent d'una estació ja no descriu el que passa al mar. */
const WIND_MAX_KM = 25;

/**
 * El mar per trams, de nord a sud.
 *
 * L'onatge i la temperatura de l'aigua són d'un model; **el vent és mesurat**,
 * de l'estació de la XEMA més propera a cada tram. Es diu quina és i a quina
 * distància, perquè un vent mesurat a vuit quilòmetres terra endins no és el
 * vent que hi ha a l'aigua i qui navega ho sap.
 */
export async function nauticalConditions(): Promise<NauticalConditions | null> {
  const sea = await seaPoints();
  const beachData = await allBeaches();
  const obs = await allObservations();
  if (!sea) return null;

  const coastal = operativeStations().filter((s) => Number.isFinite(s.lat));
  const byStation = new Map((obs?.data ?? []).map((o) => [o.station, o]));

  const stretches: SeaStretch[] = sea.points
    .slice()
    .sort((a, b) => b.lat - a.lat)
    .map((p: SeaPoint) => {
      const i = sea.index;

      // Onada màxima de les pròximes 24 hores.
      let peak: SeaStretch['peak'] = null;
      for (let k = i; k < Math.min(i + 24, p.times.length); k++) {
        const h = p.waveHeight[k];
        if (h == null) continue;
        if (!peak || h > peak.height) peak = { time: p.times[k], height: h };
      }

      let best: { codi: string; nom: string; km: number } | null = null;
      for (const s of coastal) {
        const km = distKm(p.lat, p.lon, s.lat, s.lon);
        if (km <= WIND_MAX_KM && (!best || km < best.km)) best = { codi: s.codi, nom: s.nom, km };
      }
      const o = best ? byStation.get(best.codi) : undefined;
      const windMs = o?.values.wind_speed?.value ?? null;
      const gustMs = o?.values.wind_gust?.value ?? null;

      return {
        near: p.near,
        lat: p.lat,
        sst: p.sst[i] ?? null,
        waveHeight: p.waveHeight[i] ?? null,
        wavePeriod: p.wavePeriod[i] ?? null,
        waveDirection: p.waveDirection[i] ?? null,
        swellHeight: p.swellHeight[i] ?? null,
        peak,
        wind: best && o
          ? {
            station: best.nom,
            distKm: Math.round(best.km),
            kmh: windMs != null ? Math.round(msToKmh(windMs)) : null,
            gustKmh: gustMs != null ? Math.round(msToKmh(gustMs)) : null,
            direction: o.values.wind_direction?.value ?? null,
            ageMin: o.ageMin,
          }
          : null,
      };
    });

  return {
    stretches,
    beaches: beachData?.list ?? [],
    source: beachData?.source ?? '',
  };
}

// ── Llindars que existeixen fora d'aquest web ───────────────────────────────

/**
 * Força del vent en l'escala de Beaufort, amb el que vol dir a terra.
 *
 * Els talls són els de l'escala, en km/h. No és decoració: **la força 6 és on
 * caminar per una carena deixa de ser còmode i la 8 on deixa de ser sensat**, i
 * això ho diu una escala de 1805 i no nosaltres.
 */
export function beaufort(kmh: number): { force: number; name: string; note: string } {
  const table: Array<[number, number, string, string]> = [
    [1, 1, 'calma', 'el fum puja recte'],
    [3, 2, 'ventolina', 'les fulles amb prou feines es mouen'],
    [11, 3, 'vent fluix', 'la bandera s’aixeca'],
    [19, 4, 'vent moderat', 's’aixequen fulles i pols'],
    [28, 5, 'vent fresquet', 'els arbustos es gronxen'],
    [38, 6, 'vent fresc', 'costa caminar de cara; a la carena, incòmode'],
    [49, 7, 'vent fort', 'els arbres es mouen sencers'],
    [61, 8, 'vent dur', 'costa mantenir-se dret; a la carena, no'],
    [74, 9, 'vent molt dur', 'desperfectes a les teulades'],
    [88, 10, 'temporal', 'arbres arrencats'],
    [102, 11, 'temporal fort', 'destrosses generalitzades'],
    [117, 12, 'huracà', ''],
  ];
  for (const [max, force, name, note] of table) {
    if (kmh < max) return { force, name, note };
  }
  return { force: 12, name: 'huracà', note: '' };
}

/**
 * Què vol dir el període d'una onada.
 *
 * És el número que la gent es salta i el que més diu: **la mateixa alçada
 * d'onada és una cosa amb període curt i una altra amb període llarg**. Sis
 * segons són onades de vent, curtes i desordenades, incòmodes per a tot. Nou
 * són mar de fons vinguda de lluny, llarga i regular — la que busca qui surt a
 * fer surf i la que menys molesta a qui navega.
 *
 * Les etiquetes són curtes a propòsit: van dins d'una cel·la que es repeteix
 * vint vegades, i l'explicació llarga va un cop al peu de la pàgina.
 */
export function periodMeaning(seconds: number): string {
  if (seconds < 7) return 'mar de vent';
  if (seconds < 9) return 'entre vent i fons';
  if (seconds < 12) return 'mar de fons';
  return 'fons de lluny';
}
