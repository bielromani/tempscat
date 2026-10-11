import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { locationById, publishedLocationsOfMunicipi } from './territory';
import type { Location } from './territory';

/**
 * De la ubicació del mòbil a la fitxa que li toca.
 *
 * ## Primer el municipi, i després el nucli
 *
 * Buscant només el punt publicat més proper, qui és a l'Eixample sortia a
 * l'Hospitalet: el punt de Barcelona és el del seu centre, i el d'un municipi
 * veí pot quedar més a prop. Així que primer es mira **dins de quin municipi
 * cau** —amb el contorn simplificat que ja serveix al mapa que es mou— i
 * només després, entre les fitxes d'aquell municipi, la més propera: qui és a
 * les Planes va a les Planes i no a Sant Cugat.
 *
 * Si el punt no cau dins de cap municipi —a la platja, on el contorn
 * simplificat a 200 m retalla la costa, o just a l'altra banda de la ratlla—
 * es busca el més proper de tots, però només a menys de 5 km. Més enllà ja és
 * fora de Catalunya, i dir-ho és millor que portar algú de Perpinyà a Portbou.
 *
 * ## El que no es fa
 *
 * No es desa res. La coordenada arriba ja arrodonida a dos decimals (un
 * quilòmetre, més o menys) i aquí es torna a arrodonir per si algú l'envia
 * sencera. No hi ha fitxes per a una coordenada qualsevol: s'arriba sempre a
 * un lloc que ja existeix.
 */

interface MunicipiShape {
  code: string;
  /** Anells exteriors i forats, en [lon, lat]. */
  polygons: Array<Array<Array<[number, number]>>>;
  box: [number, number, number, number];
}

/** Més enllà d'això, un punt de fora de tots els municipis és fora de Catalunya. */
const OUTSIDE_MAX_KM = 5;

let shapes: MunicipiShape[] | null = null;

function loadShapes(): MunicipiShape[] {
  if (shapes) return shapes;
  const raw = JSON.parse(readFileSync(join(process.cwd(), 'data', 'build', 'geo', 'web', 'municipis.json'), 'utf8')) as {
    features: Array<{
      properties: { code: string };
      geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown };
    }>;
  };
  shapes = raw.features.map((f) => {
    const polygons = (f.geometry.type === 'Polygon'
      ? [f.geometry.coordinates]
      : f.geometry.coordinates) as Array<Array<Array<[number, number]>>>;
    let w = Infinity; let s = Infinity; let e = -Infinity; let n = -Infinity;
    for (const poly of polygons) {
      for (const [x, y] of poly[0]) {
        if (x < w) w = x; if (x > e) e = x;
        if (y < s) s = y; if (y > n) n = y;
      }
    }
    return { code: f.properties.code, polygons, box: [w, s, e, n] };
  });
  return shapes;
}

/** Raig cap a l'est: quantes vores creua. Senar, dins. */
function inRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

function municipiAt(lon: number, lat: number): string | null {
  for (const m of loadShapes()) {
    const [w, s, e, n] = m.box;
    if (lon < w || lon > e || lat < s || lat > n) continue;
    for (const [outer, ...holes] of m.polygons) {
      if (inRing(lon, lat, outer) && !holes.some((h) => inRing(lon, lat, h))) return m.code;
    }
  }
  return null;
}

function distKm(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const rad = Math.PI / 180;
  const dLat = (bLat - aLat) * rad;
  const dLon = (bLon - aLon) * rad;
  const h = Math.sin(dLat / 2) ** 2
    + Math.cos(aLat * rad) * Math.cos(bLat * rad) * Math.sin(dLon / 2) ** 2;
  return 12_742 * Math.asin(Math.sqrt(h));
}

export interface NearbyPlace {
  path: string;
  nom: string;
  distKm: number;
}

/**
 * La fitxa que toca a una coordenada, o `null` si és fora de Catalunya.
 *
 * Les entitats col·lectives no hi entren: són agrupacions de nuclis, no un
 * lloc on es pugui ser.
 */
export function nearestPlace(rawLat: number, rawLon: number): NearbyPlace | null {
  const lat = Math.round(rawLat * 100) / 100;
  const lon = Math.round(rawLon * 100) / 100;

  const nearest = (list: Location[]) => list
    .filter((l) => l.level !== 'entitat_colectiva' && l.lat != null && l.lon != null)
    .map((l) => ({ l, d: distKm(lat, lon, l.lat as number, l.lon as number) }))
    .sort((a, b) => a.d - b.d)[0] ?? null;

  const code = municipiAt(lon, lat);
  const hit = code
    ? nearest(publishedLocationsOfMunicipi(code))
    : (() => {
      const n = nearest(publishedLocationsOfMunicipi(null));
      return n && n.d <= OUTSIDE_MAX_KM ? n : null;
    })();
  if (!hit) return null;

  /*
   * Si el més proper és l'entitat que porta el nom del municipi —el nucli
   * principal, que el Nomenclàtor dona a part—, la fitxa bona és la del
   * municipi, que és la que la gent coneix.
   */
  const parent = hit.l.parentId ? locationById(hit.l.parentId) : undefined;
  const place = parent && parent.level === 'municipi' && parent.nom === hit.l.nom ? parent : hit.l;
  return { path: place.path, nom: place.nom, distKm: Math.round(hit.d * 10) / 10 };
}
