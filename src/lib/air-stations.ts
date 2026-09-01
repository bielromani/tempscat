import 'server-only';
import { snapshot } from './cache-store';
import type { Location } from './territory';

/**
 * Calidad del aire **medida**: la Xarxa de Vigilància i Previsió de la
 * Contaminació Atmosfèrica.
 *
 * Va aparte del modelo a propósito, porque contestan preguntas distintas:
 *
 *  · **CAMS**, el modelo, cubre toda Catalunya y llega hasta dentro de tres días.
 *    Es lo que responde «com està l'aire ara».
 *  · **La XVPCA** son aparatos reales, pero solo donde los hay y —medido, no
 *    supuesto— con **veinte horas de retraso**: el dataset se escribe una vez al
 *    día de madrugada. Es lo que responde «quant n'hi va haver ahir».
 *
 * Mezclarlas sería lo cómodo y sería falso. Aquí van juntas en la página y
 * separadas en el texto.
 */

export interface AirMeasurement {
  slug: string;
  nom: string;
  unit: string;
  dailyMean: number | null;
  dailyMax: number | null;
  hours: number;
}

export interface AirStation {
  code: string;
  name: string;
  municipality: string;
  comarca: string;
  lat: number;
  lon: number;
  elevation: number | null;
  type: string;
  area: string;
  day: string;
  measurements: AirMeasurement[];
}

interface Data { stations: AirStation[]; day: string | null; lagHours: number | null }
export async function airStations(): Promise<{ list: AirStation[]; day: string | null; source: string } | null> {
  const snap = await snapshot<Data>('air-stations');
  return snap ? { list: snap.data.stations, day: snap.data.day, source: snap.source } : null;
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/**
 * Distancia máxima a la que una estación de aire dice algo del sitio.
 *
 * Veinte kilómetros, menos que los veinticinco del agua, y por una razón: la
 * contaminación es mucho más local que un caudal. Una estación de tráfico de
 * Barcelona no describe Collserola aunque estén a ocho kilómetros — por eso
 * también se publica el **tipo** de estación, que cambia lo que mide más que la
 * distancia.
 */
const MAX_KM = 20;

export interface NearestAirStation extends AirStation {
  distKm: number;
}

export async function nearestAirStation(loc: Location): Promise<NearestAirStation | null> {
  const snap = await snapshot<Data>('air-stations');
  if (!snap || loc.lat == null || loc.lon == null) return null;

  let best: NearestAirStation | null = null;
  for (const s of snap.data.stations) {
    if (!Number.isFinite(s.lat) || !Number.isFinite(s.lon)) continue;
    const d = distKm(loc.lat, loc.lon, s.lat, s.lon);
    if (d <= MAX_KM && (!best || d < best.distKm)) {
      best = { ...s, distKm: Math.round(d * 10) / 10 };
    }
  }
  return best;
}

/** Traducción de los tipos de estación, que vienen en inglés del catálogo. */
export const STATION_TYPE: Record<string, string> = {
  traffic: 'trànsit',
  background: 'fons',
  industrial: 'industrial',
};

export const STATION_AREA: Record<string, string> = {
  urban: 'urbana',
  suburban: 'suburbana',
  rural: 'rural',
};

export function stationKind(s: { type: string; area: string }): string {
  const t = STATION_TYPE[s.type] ?? s.type;
  const a = STATION_AREA[s.area] ?? s.area;
  return [a, t].filter(Boolean).join(', ');
}
