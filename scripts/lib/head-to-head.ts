/**
 * El que comparteixen les dues comparacions amb els altres: la diària
 * (`forecast-verify.ts`, màxima i mínima) i l'horària (`hourly-verify.ts`,
 * la temperatura d'ara i la de cada hora de demà).
 *
 * Totes dues han de mirar **les mateixes estacions** i llegir yr.no **igual**:
 * amb dues còpies, el dia que una canviés el criteri, la comparació diària i
 * l'horària parlarien de pobles diferents i ningú no ho veuria.
 */
import { readFileSync } from 'node:fs';
import { build } from './paths.ts';
import { fetchJson, sleep } from './http.ts';
import type { QuotaGuard } from './store.ts';

export interface Station {
  codi: string; nom: string; lat: number; lon: number;
  altitud: number | null; operativa: boolean; municipiIne5?: string;
}
export interface Town {
  id: string; nom: string; level: string; municipiIne5: string; forecastPointId?: string;
  lat: number; lon: number; altitud: number | null; comarcaCodi: string;
}
export interface HeadToHead { station: Station; town: Town; ine: string; ine6: string }

/** Fins on una estació representa el poble. Vegeu `headToHeadPairs()`. */
const H2H_KM = 6;
const H2H_DALT = 100;

export function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(bLat - aLat);
  const dLon = rad(bLon - aLon);
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(rad(aLat)) * Math.cos(rad(bLat)) * Math.sin(dLon / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.sqrt(h));
}

/**
 * Les estacions que representen el seu poble: la del mateix municipi, a menys
 * de 6 km del nucli i a menys de 100 m de la seva cota. Més enllà, el que es
 * mesuraria és la distància entre l'estació i el poble, i castigaria igual
 * totes les prediccions per una cosa que no és cap d'elles. Són unes 140.
 *
 * El codi INE de la XEMA va en sis xifres sense el zero de davant —`80193` és
 * 080193, Barcelona—; el del territori i el de l'AEMET, en cinc.
 */
export function headToHeadPairs(): HeadToHead[] {
  const stations = (JSON.parse(readFileSync(build('stations.json'), 'utf8')) as Station[])
    .filter((s) => s.operativa && s.altitud != null);
  const towns = new Map(
    (JSON.parse(readFileSync(build('locations.json'), 'utf8')) as Town[])
      .filter((l) => l.level === 'municipi' && l.forecastPointId && l.altitud != null)
      .map((l) => [l.municipiIne5, l]),
  );
  return stations.flatMap((s) => {
    const ine6 = s.municipiIne5?.padStart(6, '0');
    const ine = ine6?.slice(0, 5);
    const town = ine ? towns.get(ine) : undefined;
    if (!town || s.altitud == null) return [];
    if (Math.abs(town.altitud! - s.altitud) > H2H_DALT) return [];
    if (distKm(s.lat, s.lon, town.lat, town.lon) > H2H_KM) return [];
    return [{ station: s, town, ine: ine!, ine6: ine6! }];
  });
}

/** La data local de Madrid d'un instant, `AAAA-MM-DD`. */
export function madridDate(ms: number): string {
  return new Date(ms).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 10);
}

/** Màxima i mínima d'un dia, tal com les dona una font. */
export interface Daily { tMax: number | null; tMin: number | null }

/** Un instant de la sèrie de yr.no. */
export interface YrStep {
  ms: number;
  /** La temperatura d'aquell instant. */
  t: number | null;
  /** Màxima i mínima de les sis hores següents, quan hi són. */
  max6: number | null;
  min6: number | null;
}

const YR_BASE = 'https://api.met.no/weatherapi/locationforecast/2.0/complete';
/**
 * MET Norway demana que cada client s'identifiqui amb una adreça de contacte
 * i bloqueja els que no ho fan. Les dades són CC BY 4.0.
 */
const YR_UA = 'tempscat.cat/1.0 https://tempscat.cat';

/**
 * La predicció de yr.no per al nucli d'un municipi i a la seva cota
 * (`altitude=`, que és el que fa la seva aplicació). Horària fins a uns dos
 * dies i mig, i després de sis en sis hores.
 */
export async function yrnoSeries(town: Town, quota: QuotaGuard): Promise<YrStep[]> {
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
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  return body.properties.timeseries.map((s) => ({
    ms: Date.parse(s.time),
    t: num(s.data.instant.details.air_temperature),
    max6: num(s.data.next_6_hours?.details?.air_temperature_max),
    min6: num(s.data.next_6_hours?.details?.air_temperature_min),
  }));
}

/**
 * La màxima i la mínima de cada dia de Catalunya, d'una sèrie de yr.no.
 *
 * Amb sis hores, la temperatura instantània se salta la màxima de la tarda,
 * així que també es fan servir `max6` i `min6` dels trams que cauen dins del
 * dia. Un tram compta si almenys cinc de les seves sis hores hi cauen: els
 * trams van de 00, 06, 12 i 18 UTC, i el del vespre acaba a l'01:00 d'hivern
 * (02:00 d'estiu) de l'endemà; exigint-lo sencer, el tercer dia no sortiria
 * mai. L'hora que sobra és de matinada: per a la màxima no hi fa res i per a
 * la mínima, poc. Un dia sense cobertura sencera —el primer, que comença a
 * mitja tarda— no surt.
 */
export function yrnoDaily(series: YrStep[]): Map<string, Daily> {
  const byDay = new Map<string, { values: number[]; hours: Set<number> }>();
  for (const s of series) {
    const day = madridDate(s.ms);
    const slot = byDay.get(day) ?? { values: [], hours: new Set<number>() };
    byDay.set(day, slot);
    if (s.t != null) {
      slot.values.push(s.t);
      slot.hours.add(s.ms);
    }
    if (s.max6 != null || s.min6 != null) {
      const inside = [1, 2, 3, 4, 5].map((h) => s.ms + h * 3_600_000).filter((h) => madridDate(h) === day);
      if (inside.length >= 4) {
        if (s.max6 != null) slot.values.push(s.max6);
        if (s.min6 != null) slot.values.push(s.min6);
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

/**
 * La temperatura que yr.no dona per a un instant, interpolant entre les dues
 * hores que l'envolten. Només dins del tram horari: entre dos punts separats
 * sis hores, una recta no és el que diu ningú.
 */
export function yrnoAt(series: YrStep[], ms: number): number | null {
  for (let i = 0; i < series.length - 1; i++) {
    const a = series[i];
    const b = series[i + 1];
    if (a.ms <= ms && ms <= b.ms) {
      if (a.t == null || b.t == null || b.ms - a.ms > 3_600_000) return null;
      const f = (ms - a.ms) / (b.ms - a.ms);
      return Math.round((a.t + (b.t - a.t) * f) * 10) / 10;
    }
  }
  return null;
}
