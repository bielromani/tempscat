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
