import { snapshot } from './cache-store';
import type { MountainData, MountainStation, Resort } from './mountain-types';
import type { Location } from './territory';

/**
 * Les estacions de muntanya, amb el rellotge posat.
 *
 * ## Dos rellotges diferents, i no es poden barrejar
 *
 * El **comunicat** de l'estació el tecleja una persona: canvia unes quantes
 * vegades al dia en temporada i es queda aturat mesos quan l'estació tanca. El
 * d'Espot portava cinc mesos dient el mateix.
 *
 * Les **estacions meteorològiques** no s'aturen mai: mesuren cada quart d'hora
 * tot l'any, també amb l'estació tancada.
 *
 * Per això el gruix de neu i el percentatge de pistes obertes es retiren de
 * seguida i la temperatura de 2.537 m no: no és el mateix tipus de dada ni
 * caduca al mateix ritme. El catàleg de pistes i remuntadors no caduca gens.
 */

/** Per sota d'això el comunicat és el d'ara. */
export const REPORT_CURRENT_HOURS = 12;

/** I per damunt d'això no se n'ensenya el contingut variable. */
export const REPORT_SHOW_HOURS = 48;

/** Els llindars de les estacions meteorològiques, que mesuren cada quart d'hora. */
export const STATION_CURRENT_MIN = 90;
export const STATION_SHOW_HOURS = 6;

export interface ResortNow extends Resort {
  /** Hores des del comunicat. */
  ageHours: number;
  /** Menys de dotze hores: el comunicat és el d'ara. */
  current: boolean;
  /**
   * Si es pot ensenyar el contingut variable: neu, percentatges, cel.
   *
   * L'obert o tancat i el catàleg de pistes s'ensenyen sempre — el primer amb
   * la data del comunicat al costat, el segon perquè no caduca.
   */
  reportUsable: boolean;
}

export interface StationNow extends MountainStation {
  ageMin: number;
  current: boolean;
  /** L'hora de la mesura en hora local, ja sense la `Z`. */
  measuredLocal: string;
}

function localOf(iso: string): string {
  return new Date(iso)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 16);
}

function withResortAge(r: Resort): ResortNow {
  const ageHours = Math.max(0, (Date.now() - Date.parse(r.reportAt)) / 3600_000);
  return {
    ...r,
    ageHours: Math.round(ageHours),
    current: ageHours <= REPORT_CURRENT_HOURS,
    reportUsable: ageHours <= REPORT_SHOW_HOURS,
  };
}

function withStationAge(s: MountainStation): StationNow {
  const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(s.measuredAt)) / 60_000));
  return { ...s, ageMin, current: ageMin <= STATION_CURRENT_MIN, measuredLocal: localOf(s.measuredAt) };
}

async function read(): Promise<{ data: MountainData; source: string } | null> {
  const snap = await snapshot<MountainData>('muntanya');
  if (!snap?.data?.resorts?.length) return null;
  return { data: snap.data, source: snap.source };
}

export interface MountainView {
  resorts: ResortNow[];
  /** Les estacions meteorològiques amb mesura vigent, de més alta a més baixa. */
  stations: StationNow[];
  /** Les que fa hores que no mesuren. */
  staleStations: StationNow[];
  attribution: string;
  license: string;
  source: string;
}

/** Tot, per a la pàgina de neu. */
export async function mountainView(): Promise<MountainView | null> {
  const got = await read();
  if (!got) return null;

  const stations = got.data.stations.map(withStationAge);
  const limit = STATION_SHOW_HOURS * 60;

  return {
    // Obertes primer, i entre iguals el comunicat més fresc.
    resorts: got.data.resorts.map(withResortAge).sort(
      (a, b) => Number(b.open) - Number(a.open) || a.ageHours - b.ageHours,
    ),
    stations: stations
      .filter((s) => s.ageMin <= limit)
      .sort((a, b) => (b.altitudM ?? 0) - (a.altitudM ?? 0)),
    staleStations: stations.filter((s) => s.ageMin > limit),
    attribution: got.data.attribution,
    license: got.data.license,
    source: got.source,
  };
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Fins on una fitxa reclama una estació d'esquí com a propera. */
const NEAR_KM = 30;

export interface ResortNearby {
  resort: ResortNow & { distKm: number };
  /** Les estacions meteorològiques d'aquella estació d'esquí, amb mesura vigent. */
  stations: StationNow[];
}

/**
 * L'estació d'esquí més propera a una ubicació, si n'hi ha cap a la vora.
 *
 * Trenta quilòmetres i no vint-i-cinc com les càmeres: una càmera contesta «com
 * està això que veig», i això té sentit a prop; una estació d'esquí contesta
 * «puc anar-hi a esquiar», i això té sentit des de tota la comarca.
 *
 * Buit a la immensa majoria de les 4.293 fitxes, que és el que fa que el bloc
 * no costi bytes on no diu res.
 */
export async function resortNear(loc: Location): Promise<ResortNearby | null> {
  if (loc.lat == null || loc.lon == null) return null;
  const got = await read();
  if (!got) return null;

  let best: { r: Resort; d: number } | null = null;
  for (const r of got.data.resorts) {
    const d = distKm(loc.lat, loc.lon, r.lat, r.lon);
    if (!best || d < best.d) best = { r, d };
  }
  if (!best || best.d > NEAR_KM) return null;

  const limit = STATION_SHOW_HOURS * 60;
  return {
    resort: { ...withResortAge(best.r), distKm: Math.round(best.d * 10) / 10 },
    stations: got.data.stations
      .filter((s) => s.bunitId === best!.r.bunitId)
      .map(withStationAge)
      .filter((s) => s.ageMin <= limit)
      .sort((a, b) => (b.altitudM ?? 0) - (a.altitudM ?? 0)),
  };
}

/**
 * Quina part del desnivell esquiable queda per damunt de la cota de neu.
 *
 * És l'única cosa d'aquest fitxer que no ve de FGC: la cota surt del nostre
 * consens de models i el rang de cotes del catàleg tècnic de pistes. Juntes
 * contesten la pregunta que ni l'una ni l'altra contesta sola — «nevarà a les
 * pistes o hi plourà?».
 *
 * Es diu en part del desnivell i no en centímetres: la cota de neu diu **on la
 * precipitació arriba en forma de neu**, no quanta se n'acumula. Amb la cota a
 * la base, tot el desnivell és de neu; amb la cota al cim, res.
 */
export function slopesAboveSnowLine(
  snowLevelM: number | null,
  slopes: { minM: number | null; maxM: number | null } | null,
): number | null {
  if (snowLevelM == null || slopes?.minM == null || slopes.maxM == null) return null;
  const { minM, maxM } = slopes;
  if (maxM <= minM) return null;

  const share = (maxM - snowLevelM) / (maxM - minM);
  return Math.round(Math.min(1, Math.max(0, share)) * 100);
}
