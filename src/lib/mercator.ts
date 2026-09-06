/**
 * Web Mercator, lo mínimo para colocar teselas y dibujar encima.
 *
 * Es la proyección de todas las teselas del mundo —OSM, Google, RainViewer— y
 * la única que garantiza que el radar y las fronteras del ICGC caigan en el
 * mismo sitio. Proyectar los polígonos con una regla de tres sobre latitud y
 * longitud parece funcionar en Catalunya y no funciona: entre Amposta y la Vall
 * d’Aran el error de una interpolación lineal en latitud llega a varios
 * kilómetros, y se ve como una costa que no encaja con la lluvia.
 *
 * Este fichero no importa nada: lo usan el worker del radar y la página.
 */

/** Coordenada de tesela (fraccionaria) de un punto, a un nivel de zoom. */
export function lonToTileX(lon: number, z: number): number {
  return ((lon + 180) / 360) * 2 ** z;
}

export function latToTileY(lat: number, z: number): number {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** z;
}

export function tileXToLon(x: number, z: number): number {
  return (x / 2 ** z) * 360 - 180;
}

export function tileYToLat(y: number, z: number): number {
  const n = Math.PI - (2 * Math.PI * y) / 2 ** z;
  return (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)));
}

/** Rejilla de teselas que cubre un rectángulo geográfico. */
export interface TileGrid {
  z: number;
  /** Píxeles por tesela: RainViewer sirve 256 y 512. */
  size: number;
  x0: number; x1: number;
  y0: number; y1: number;
  /** Dimensiones del mosaico resultante, en píxeles. */
  width: number; height: number;
  /** Recuadro geográfico real del mosaico, que es mayor que el pedido. */
  north: number; south: number; west: number; east: number;
}

export function tileGrid(
  bbox: { north: number; south: number; west: number; east: number },
  z: number,
  size: number,
): TileGrid {
  const x0 = Math.floor(lonToTileX(bbox.west, z));
  const x1 = Math.floor(lonToTileX(bbox.east, z));
  const y0 = Math.floor(latToTileY(bbox.north, z));
  const y1 = Math.floor(latToTileY(bbox.south, z));
  return {
    z, size, x0, x1, y0, y1,
    width: (x1 - x0 + 1) * size,
    height: (y1 - y0 + 1) * size,
    west: tileXToLon(x0, z),
    east: tileXToLon(x1 + 1, z),
    north: tileYToLat(y0, z),
    south: tileYToLat(y1 + 1, z),
  };
}

/** Proyecta un punto a píxeles dentro del mosaico. */
export function project(grid: TileGrid, lon: number, lat: number): [number, number] {
  return [
    (lonToTileX(lon, grid.z) - grid.x0) * grid.size,
    (latToTileY(lat, grid.z) - grid.y0) * grid.size,
  ];
}

/** Recuadro que cubre Catalunya con un margen para que no quede pegada al borde. */
export const CATALUNYA_BBOX = { north: 42.92, south: 40.50, west: 0.14, east: 3.35 };

/*
 * ── El mapa de comarques ───────────────────────────────────────────────────
 *
 * `scripts/10-map-geometry.ts` projecta les 43 comarques i les deixa en unitats
 * del `viewBox`. Aquestes dues funcions són com s'hi arriba, i viuen aquí
 * perquè les necessiten **els dos costats**: el build per als polígons, i la
 * pàgina per posar-hi punts a sobre.
 *
 * Perquè fins ara no hi eren: el build es guardava l'escala i el desplaçament
 * en variables locals i el fitxer resultant només portava els camins. Amb això,
 * dibuixar una platja o una estació d'esquí sobre el mapa era impossible sense
 * repetir la projecció a ull —i una regla de tres sobre latitud i longitud, que
 * és el que surt de fer-ho a ull, es desvia quilòmetres entre Amposta i la Val
 * d'Aran. És l'error que ja explica la capçalera d'aquest fitxer.
 */

/** Mercator esfèrica en radiants. La y creix cap avall, com al SVG. */
export function mercPoint(lon: number, lat: number): [number, number] {
  return [
    (lon * Math.PI) / 180,
    -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}

/** L'escala i el desplaçament que el build va fer servir. Va dins del JSON. */
export interface MapProjection {
  minX: number;
  minY: number;
  scale: number;
}

/** D'un punt en graus a les unitats del `viewBox` del mapa. */
export function projectToMap(
  lon: number, lat: number, p: MapProjection,
): [number, number] {
  const [x, y] = mercPoint(lon, lat);
  return [(x - p.minX) * p.scale, (y - p.minY) * p.scale];
}

/**
 * D'unitats del `viewBox` del mapa a coordenades de tessel·la, i al revés.
 *
 * Les dues projeccions són la mateixa —Web Mercator— així que el pas és una
 * regla de tres, i per això una tessel·la cau al mapa com un rectangle recte i
 * no com un quadrilàter tort. És el que permet posar el relleu sota un mapa
 * nostre amb un `<image>` per tessel·la i que quadri al píxel.
 *
 * La `y` de `mercPoint()` és `-ln(tan(π/4 + φ/2))`, que és la Gudermanniana
 * inversa canviada de signe; la `y` normalitzada de les tessel·les és
 * `(1 + y/π) / 2`. La `x` és la longitud en radiants, i la seva normalitzada,
 * `(x/π + 1) / 2`.
 */
export function mapToTile(
  x: number, y: number, p: MapProjection, z: number,
): [number, number] {
  const mx = x / p.scale + p.minX;
  const my = y / p.scale + p.minY;
  const n = 2 ** z;
  return [((mx / Math.PI + 1) / 2) * n, ((1 + my / Math.PI) / 2) * n];
}

export function tileToMap(
  tx: number, ty: number, p: MapProjection, z: number,
): [number, number] {
  const n = 2 ** z;
  const mx = ((tx / n) * 2 - 1) * Math.PI;
  const my = ((ty / n) * 2 - 1) * Math.PI;
  return [(mx - p.minX) * p.scale, (my - p.minY) * p.scale];
}
