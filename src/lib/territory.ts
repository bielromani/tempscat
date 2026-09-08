import 'server-only';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { project, type TileGrid } from './mercator';

/**
 * Acceso al territorio construido por el pipeline de `scripts/`.
 *
 * De momento lee los artefactos JSON de `data/build/`. Cuando exista la base de
 * datos (fase 1) esta capa cambia por dentro y las páginas no se enteran: la
 * frontera está aquí a propósito.
 */

const BUILD = join(process.cwd(), 'data', 'build');

export type Level = 'comarca' | 'municipi' | 'entitat_colectiva' | 'entitat_singular' | 'nucli' | 'disseminat';
export type Tier = 'A' | 'B' | 'C' | 'D';

export interface StationRef {
  codi: string;
  nom: string;
  distKm: number;
  dAltM: number | null;
}

export interface Location {
  id: string;
  level: Level;
  parentId: string | null;
  comarcaCodi: string;
  municipiCodi?: string;
  municipiIne5?: string;
  nom: string;
  nomIndexat: string;
  slug: string;
  path: string;
  lat: number | null;
  lon: number | null;
  altitud: number | null;
  geocodeSource: 'cap-municipi' | 'icgc' | 'heretat' | null;
  geocodeConfidence: number;
  poblacio: number | null;
  /** Superficie del término municipal, km². Solo a nivel municipio. */
  areaKm2?: number | null;
  stationRef?: StationRef;
  /** Punto de predicción compartido con otras ubicaciones de la misma celda. */
  forecastPointId?: string;
  /** Desnivel respecto a ese punto, que el motor de fusión corrige. */
  forecastDAltM?: number;
  tier: Tier;
  published: boolean;
  canonicalOf?: string;
  reason?: string;
}

export interface Comarca {
  codi: string;
  nom: string;
  slug: string;
  path: string;
  lat: number;
  lon: number;
  /** Superficie real, del polígono oficial del ICGC. */
  areaKm2: number | null;
  nMunicipis: number;
  poblacio: number;
  densitat: number | null;
  altitudMin: number | null;
  altitudMax: number | null;
}

export type NeighbourRelation =
  /** Comparten frontera. Calculado sobre la topología oficial del ICGC. */
  | 'adjacent'
  /** Del mismo municipio. */
  | 'sibling'
  /** Solo cercano. Se usa donde no hay colindancia — Llívia es enclave en Francia. */
  | 'nearest';

export interface Neighbour {
  locationId: string;
  neighbourId: string;
  relation: NeighbourRelation;
  distKm: number;
  rank: number;
}

/** FeatureCollection simplificada para el mapa. No es la geometría de cálculo. */
export interface GeoFeatureCollection {
  type: 'FeatureCollection';
  features: Array<{
    type: 'Feature';
    id: string;
    properties: { code: string; name: string; areaKm2: number };
    geometry: { type: 'MultiPolygon'; coordinates: number[][][][] };
  }>;
}

export interface Station {
  codi: string;
  nom: string;
  slug: string;
  lat: number;
  lon: number;
  altitud: number | null;
  emplacament?: string;
  municipiNom?: string;
  comarcaCodi?: string;
  comarcaNom?: string;
  operativa: boolean;
  estat?: string;
  /** Fechas de servicio, tal como las da el catálogo de la XEMA. */
  dataInici?: string;
  dataFi?: string;
  nearestLocation: { id: string; nom: string; path: string; distKm: number } | null;
}

function load<T>(file: string): T {
  return JSON.parse(readFileSync(join(BUILD, file), 'utf8')) as T;
}

// Los artefactos son estáticos: se leen una vez por proceso y se indexan.
let cache: {
  locations: Location[];
  comarques: Comarca[];
  stations: Station[];
  neighboursByLocation: Map<string, Neighbour[]>;
  byId: Map<string, Location>;
  byPath: Map<string, Location>;
  comarcaBySlug: Map<string, Comarca>;
  comarcaByCodi: Map<string, Comarca>;
  childrenOf: Map<string, Location[]>;
  municipisOf: Map<string, Location[]>;
} | null = null;

function db() {
  if (cache) return cache;

  const locations = load<Location[]>('locations.json');
  const comarques = load<Comarca[]>('comarques.json');
  const stations = load<Station[]>('stations.json');
  const neighbours = load<Neighbour[]>('neighbours.json');

  const byId = new Map(locations.map((l) => [l.id, l]));
  const byPath = new Map(locations.filter((l) => l.published).map((l) => [l.path, l]));
  const childrenOf = new Map<string, Location[]>();
  const municipisOf = new Map<string, Location[]>();

  for (const l of locations) {
    if (!l.published) continue;
    if (l.parentId) {
      const arr = childrenOf.get(l.parentId) ?? [];
      arr.push(l);
      childrenOf.set(l.parentId, arr);
    }
    if (l.level === 'municipi') {
      const arr = municipisOf.get(l.comarcaCodi) ?? [];
      arr.push(l);
      municipisOf.set(l.comarcaCodi, arr);
    }
  }

  const byPop = (a: Location, b: Location) => (b.poblacio ?? 0) - (a.poblacio ?? 0);
  for (const arr of childrenOf.values()) arr.sort(byPop);
  for (const arr of municipisOf.values()) arr.sort((a, b) => a.nom.localeCompare(b.nom, 'ca'));

  const neighboursByLocation = new Map<string, Neighbour[]>();
  for (const n of neighbours) {
    const arr = neighboursByLocation.get(n.locationId) ?? [];
    arr.push(n);
    neighboursByLocation.set(n.locationId, arr);
  }
  for (const arr of neighboursByLocation.values()) arr.sort((a, b) => a.rank - b.rank);

  cache = {
    locations, comarques, stations, neighboursByLocation, byId, byPath,
    comarcaBySlug: new Map(comarques.map((c) => [c.slug, c])),
    comarcaByCodi: new Map(comarques.map((c) => [c.codi, c])),
    childrenOf, municipisOf,
  };
  return cache;
}

// ── Consultas ───────────────────────────────────────────────────────────────

/** Resuelve una URL a su ubicación. La consulta más frecuente del sitio. */
export function locationByPath(path: string): Location | undefined {
  return db().byPath.get(path);
}

export function locationById(id: string): Location | undefined {
  return db().byId.get(id);
}

export function allComarques(): Comarca[] {
  return db().comarques.slice().sort((a, b) => a.nom.localeCompare(b.nom, 'ca'));
}

export function comarcaBySlug(slug: string): Comarca | undefined {
  return db().comarcaBySlug.get(slug);
}

export function comarcaOf(loc: Location): Comarca | undefined {
  return db().comarcaByCodi.get(loc.comarcaCodi);
}

/** Municipios de una comarca, en orden alfabético catalán. */
export function municipisOfComarca(comarcaCodi: string): Location[] {
  return db().municipisOf.get(comarcaCodi) ?? [];
}

/** Entidades y núcleos que cuelgan de una ubicación, de mayor a menor población. */
export function childrenOf(id: string): Location[] {
  return db().childrenOf.get(id) ?? [];
}

/** Todas las entidades publicadas de un municipio, sea cual sea su nivel. */
export function entitatsOfMunicipi(municipiCodi: string): Location[] {
  return db().locations
    .filter((l) => l.published && l.municipiCodi === municipiCodi && l.level !== 'municipi')
    .sort((a, b) => (b.poblacio ?? 0) - (a.poblacio ?? 0));
}

/** Migas de pan, de Catalunya hacia abajo. */
export function breadcrumbs(loc: Location): Array<{ nom: string; path: string }> {
  const out: Array<{ nom: string; path: string }> = [{ nom: 'Catalunya', path: '/' }];
  const comarca = comarcaOf(loc);
  if (comarca) out.push({ nom: comarca.nom, path: comarca.path });
  if (loc.level !== 'municipi' && loc.municipiCodi) {
    const mun = db().locations.find((l) => l.level === 'municipi' && l.municipiCodi === loc.municipiCodi);
    if (mun) out.push({ nom: mun.nom, path: mun.path });
  }
  out.push({ nom: loc.nom, path: loc.path });
  return out;
}

/**
 * Vecinos de una ubicación.
 *
 * La relación importa y no se debe mezclar: `adjacent` significa que comparten
 * frontera de verdad, y solo eso puede describirse como "limítrofe" en el texto
 * de una página. `nearest` es un respaldo por proximidad — decir "limítrofe" de
 * un municipio que solo está cerca es afirmar algo falso.
 */
export function neighboursOf(id: string, relation?: NeighbourRelation): Array<{ location: Location; distKm: number }> {
  const { byId, neighboursByLocation } = db();
  return (neighboursByLocation.get(id) ?? [])
    .filter((n) => !relation || n.relation === relation)
    .map((n) => ({ location: byId.get(n.neighbourId), distKm: n.distKm }))
    .filter((n): n is { location: Location; distKm: number } => !!n.location && n.location.published);
}

/** Municipios que comparten frontera con este. Vacío solo para Llívia. */
export function adjacentMunicipis(id: string) {
  return neighboursOf(id, 'adjacent');
}

/** Geometría simplificada de las comarcas, para el mapa. */
export function comarquesGeoJson(): GeoFeatureCollection {
  return load<GeoFeatureCollection>('geo/comarques.geojson');
}

/** Geometría simplificada de los municipios, para el mapa. 1,6 MB. */
export function municipisGeoJson(): GeoFeatureCollection {
  return load<GeoFeatureCollection>('geo/municipis.geojson');
}

export interface Relief {
  /** Ruta de la imatge a `public/`. */
  src: string;
  /** On va, en píxels del mosaic del radar. */
  x: number;
  y: number;
  w: number;
  h: number;
  mosaic: { z: number; tile: number; width: number; height: number };
  source: string;
  attribution: string;
}

/**
 * On va la imatge del relleu dins del mosaic, i qui l'ha de citar.
 *
 * La imatge és a `public/` — no canvia mai i es versiona amb el codi. Aquí
 * només hi ha on posar-la, perquè està retallada a la terra i no comença a
 * l'origen del mosaic. Ho escriu `scripts/11-relief.ts`.
 */
export function relief(): Relief {
  return load<Relief>('geo/relleu.json');
}

/**
 * Les fronteres de les comarques, projectades al mosaic del radar.
 *
 * Viu aquí i no a la pàgina del radar perquè la fitxa de cada poble també les
 * dibuixa, al mapa del que ve. Amb dues còpies, el dia que una decimés d'una
 * altra manera, les fronteres del mapa petit i les del gran no encaixarien.
 *
 * Es memoritza per procés amb la seva capsa: la pàgina del radar és dinàmica
 * —el marc va a l'URL— així que sense memòria cada visita reprojecta i delma
 * quinze mil coordenades per dibuixar exactament les mateixes fronteres.
 *
 * ## Per què cada traç porta la seva capsa
 *
 * Perquè no tothom les vol totes. Les 43 comarques són **320 kB de
 * coordenades** al marcatge, i el mapa d'una fitxa n'ensenya cent quilòmetres:
 * abocar-les senceres allà —i quatre vegades, una per quadre— afegia 247 kB en
 * gzip a una pàgina que en pesa 72. Amb la capsa, `comarcaPathsNear()` es queda
 * les que toquen la finestra i prou. És la regla de sempre: una pàgina es
 * baixa bytes en proporció al que ensenya.
 */
export interface ComarcaPath {
  d: string;
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

let pathsMemo: { key: string; paths: ComarcaPath[] } | null = null;

function comarcaShapes(grid: TileGrid): ComarcaPath[] {
  const key = `${grid.z}:${grid.x0}:${grid.y0}:${grid.size}`;
  if (pathsMemo?.key === key) return pathsMemo.paths;

  const geo = comarquesGeoJson();
  const out: ComarcaPath[] = [];

  for (const f of geo.features) {
    for (const polygon of f.geometry.coordinates) {
      for (const ring of polygon) {
        let d = '';
        let lastX = -1e9;
        let lastY = -1e9;
        let kept = 0;
        let x0 = Infinity; let y0 = Infinity;
        let x1 = -Infinity; let y1 = -Infinity;
        for (let i = 0; i < ring.length; i++) {
          const [lon, lat] = ring[i];
          const [x, y] = project(grid, lon, lat);
          const last = i === ring.length - 1;
          if (!last && kept > 0 && Math.hypot(x - lastX, y - lastY) < 1.5) continue;
          d += `${kept === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`;
          lastX = x; lastY = y; kept++;
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
        if (kept > 3) out.push({ d: `${d}Z`, x0, y0, x1, y1 });
      }
    }
  }
  pathsMemo = { key, paths: out };
  return out;
}

/** Totes les fronteres. Les vol el mapa de país, que les ensenya totes. */
export function comarcaPathsOn(grid: TileGrid): string[] {
  return comarcaShapes(grid).map((p) => p.d);
}

/**
 * Només les que toquen una finestra.
 *
 * Per als mapes petits d'una fitxa. Es compara la capsa i no el traç: un traç
 * que passa pel costat sense entrar-hi es dibuixa igualment i el `viewBox` el
 * retalla, que costa menys que retallar-lo de veritat i es veu igual.
 */
export function comarcaPathsNear(
  grid: TileGrid, box: { x: number; y: number; w: number; h: number },
): string[] {
  return comarcaShapes(grid)
    .filter((p) => p.x0 < box.x + box.w && p.x1 > box.x && p.y0 < box.y + box.h && p.y1 > box.y)
    .map((p) => p.d);
}

export function stationByCodi(codi: string): Station | undefined {
  return db().stations.find((s) => s.codi === codi);
}

export function operativeStations(): Station[] {
  return db().stations.filter((s) => s.operativa);
}

/**
 * Rutas a prerenderizar en el build. Solo el núcleo duro: comarcas y
 * municipios grandes. El resto se genera bajo demanda en la primera visita y
 * queda cacheado — la diferencia es un build de 2 minutos en vez de 40.
 */
export function highPriorityPaths(): string[] {
  const { comarques, locations } = db();
  return [
    ...comarques.map((c) => c.path),
    ...locations.filter((l) => l.published && l.tier === 'A').map((l) => l.path),
  ];
}

/** Todas las rutas publicadas, para los sitemaps. */
export function allPublishedPaths(): Array<{ path: string; tier: Tier; level: Level }> {
  const { comarques, locations } = db();
  return [
    ...comarques.map((c) => ({ path: c.path, tier: 'A' as Tier, level: 'comarca' as Level })),
    ...locations.filter((l) => l.published).map((l) => ({ path: l.path, tier: l.tier, level: l.level })),
  ];
}

/** Estadísticas de la construcción, para el panel interno y la página de fuentes. */
export function buildSummary(): Record<string, unknown> {
  return load<Record<string, unknown>>('summary.json');
}

/**
 * Les poblacions publicades que cauen dins d'un rectangle.
 *
 * Serveix per posar noms a un mapa de detall. Van ordenades per població, que
 * és l'ordre en què s'han de col·locar quan no hi caben totes: en un mapa,
 * «Vic» ha de sortir abans que un veïnat de quaranta habitants.
 *
 * Hi entren municipis **i** nuclis. Amb només municipis, un itinerari per la
 * plana quedava amb tres noms i prou; els nuclis són el que fa que un traçat
 * s'entengui, perquè són per on passa.
 */
export function locationsInBox(
  box: { north: number; south: number; west: number; east: number },
  limit = 60,
): Location[] {
  return db().locations
    .filter((l) => l.published
      && l.lat != null && l.lon != null
      && l.lat >= box.south && l.lat <= box.north
      && l.lon >= box.west && l.lon <= box.east)
    .sort((a, b) => (b.poblacio ?? 0) - (a.poblacio ?? 0))
    .slice(0, limit);
}
