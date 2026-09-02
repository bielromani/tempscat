import { snapshot } from './cache-store';
import type { Camera, CamerasData } from './camera-types';
import type { Location } from './territory';

/**
 * Las cámaras, con el reloj puesto.
 *
 * ## Una imagen caducada es peor que ninguna
 *
 * Es lo mismo que pasa con las banderas de playa, y por el mismo motivo: nadie
 * apaga una cámara. Cuando deja de mandar, el último fotograma se queda ahí y
 * el servidor lo sirve con un 200 tan tranquilo. Boí Taüll tenía una que el 2
 * de septiembre de 2026 servía la nieve del 10 de abril.
 *
 * Así que la antigüedad se calcula aquí —el reloj es un dato y entra por esta
 * capa, nunca dentro de un componente— y una imagen vieja no se enseña.
 *
 * ## Los dos umbrales
 *
 * El worker pasa cada hora, así que una imagen normal tiene menos de sesenta
 * minutos. Con **90** se acepta la vuelta que se ha retrasado; hasta **6 h** se
 * sigue enseñando pero con la hora delante, porque una foto de la montaña de
 * hace cuatro horas todavía dice si hay niebla o si el cielo está limpio; más
 * allá se retira.
 *
 * De noche las imágenes salen oscuras y eso no es un fallo: es la información
 * que hay. Lo que no se hace es guardarse la última de la tarde y presentarla
 * como si fuera de ahora.
 */

/** Por debajo de esto la imagen es la de ahora, sin matices. */
export const CAMERA_FRESH_MIN = 90;

/** Y por encima de esto no se enseña. */
export const CAMERA_SHOW_HOURS = 6;

export interface CameraNow extends Camera {
  /** Minutos desde la fotografía. */
  ageMin: number;
  /** Menos de 90 minutos: la imagen es de ahora. */
  current: boolean;
  /**
   * La hora de la foto en hora local, ya sin la `Z`.
   *
   * `capturedAt` es UTC, porque es lo que dan las cabeceras, y los
   * formateadores de `format.ts` leen la cadena tal cual: pasarles el UTC
   * escribiría las dos de la tarde a las doce. La conversión va aquí y no en la
   * página por la misma razón que el reloj: es un dato, y los datos entran por
   * esta capa.
   */
  capturedLocal: string;
}

export interface CamerasView {
  /** Las que se pueden enseñar, de la más reciente a la más vieja. */
  list: CameraNow[];
  /** Las que hay pero llevan más de seis horas paradas. */
  stale: CameraNow[];
  /** Total del catálogo utilizable, enseñables o no. */
  total: number;
  source: string;
  license: string;
  attribution: string;
  nearKm: number;
}

function withAge(c: Camera): CameraNow {
  const ageMin = Math.max(0, Math.round((Date.now() - Date.parse(c.capturedAt)) / 60_000));
  const capturedLocal = new Date(c.capturedAt)
    .toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' })
    .replace(' ', 'T')
    .slice(0, 16);
  return { ...c, ageMin, current: ageMin <= CAMERA_FRESH_MIN, capturedLocal };
}

async function read(): Promise<{ data: CamerasData; source: string } | null> {
  const snap = await snapshot<CamerasData>('cameres');
  if (!snap?.data?.cameras?.length) return null;
  return { data: snap.data, source: snap.source };
}

/** Todas, para el índice. Null mientras el worker no haya corrido nunca. */
export async function allCameras(): Promise<CamerasView | null> {
  const got = await read();
  if (!got) return null;

  const aged = got.data.cameras.map(withAge);
  const limit = CAMERA_SHOW_HOURS * 60;

  return {
    list: aged.filter((c) => c.ageMin <= limit).sort((a, b) => a.ageMin - b.ageMin),
    stale: aged.filter((c) => c.ageMin > limit),
    total: aged.length,
    source: got.source,
    license: got.data.license,
    attribution: got.data.attribution,
    nearKm: got.data.nearKm,
  };
}

/**
 * Una cámara por su slug, para su propia página.
 *
 * Devuelve la cámara aunque la imagen esté caducada: la página existe, y decir
 * «esta cámara lleva cinco meses sin mandar» es información. Lo que no hace es
 * enseñar el fotograma viejo — eso lo decide la página con `current` y `ageMin`.
 */
export async function cameraBySlug(slug: string): Promise<(CameraNow & {
  source: string;
  license: string;
  attribution: string;
  /** Las otras de la misma estación, para poder saltar de una a otra. */
  siblings: CameraNow[];
}) | null> {
  const got = await read();
  if (!got) return null;

  const found = got.data.cameras.find((c) => c.slug === slug);
  if (!found) return null;

  return {
    ...withAge(found),
    source: got.source,
    license: got.data.license,
    attribution: got.data.attribution,
    siblings: got.data.cameras
      .filter((c) => c.resort === found.resort && c.id !== found.id)
      .map(withAge)
      .sort((a, b) => a.name.localeCompare(b.name, 'ca')),
  };
}

/** Los slugs que existen, para `generateStaticParams`. */
export async function cameraSlugs(): Promise<string[]> {
  const got = await read();
  return got ? got.data.cameras.map((c) => c.slug) : [];
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const R = 6371;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLon = ((bLon - aLon) * Math.PI) / 180;
  const s = Math.sin(dLat / 2) ** 2
    + Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** Cuántas se enseñan como mucho en una ficha de municipio. */
const MAX_PER_LOCATION = 3;

/**
 * Las cámaras cerca de una ubicación.
 *
 * Solo las que tienen coordenada creída y una imagen vigente: en una ficha, una
 * cámara caducada no se explica —no hay sitio para explicarla— así que no sale.
 * Se cuentan por distancia real y no por municipio, porque una estación de
 * esquí está en un término y se mira desde tres valles.
 *
 * Con veinticuatro cámaras en el Pirineo, esto añade bytes a una docena de
 * fichas de montaña y a ninguna más — que es la regla de `shards.ts` aplicada a
 * las imágenes: **una página baja lo que enseña**.
 */
export async function camerasNear(loc: Location): Promise<Array<CameraNow & { distKm: number }>> {
  if (loc.lat == null || loc.lon == null) return [];
  const got = await read();
  if (!got) return [];

  const limit = CAMERA_SHOW_HOURS * 60;
  return got.data.cameras
    .filter((c) => c.lat != null && c.lon != null)
    .map((c) => ({
      ...withAge(c),
      distKm: Math.round(distKm(loc.lat as number, loc.lon as number, c.lat as number, c.lon as number) * 10) / 10,
    }))
    .filter((c) => c.distKm <= got.data.nearKm && c.ageMin <= limit)
    .sort((a, b) => a.distKm - b.distKm)
    .slice(0, MAX_PER_LOCATION);
}

/**
 * La URL de una imagen ya bajada.
 *
 * Lleva la hora de captura en la consulta a propósito. El fichero del almacén
 * se sobrescribe cada vuelta —siempre `<id>.jpg`, nunca una marca de tiempo en
 * el nombre— porque veinticuatro imágenes nuevas cada hora con nombre propio
 * son 3,6 GB al mes de objetos que nadie vuelve a mirar, y el almacén tiene
 * diez de cupo. La consulta da lo que el nombre no puede dar: cuando la
 * fotografía cambia, la URL cambia, y el CDN y el navegador se enteran sin
 * tener que preguntar cada vez.
 */
export function cameraImage(c: Camera, size: 'view' | 'thumb'): string {
  const file = size === 'thumb' ? `${c.id}-t.jpg` : `${c.id}.jpg`;
  return `/cameres/i/${file}?v=${Math.floor(Date.parse(c.capturedAt) / 1000)}`;
}
