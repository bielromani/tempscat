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

/**
 * Quines tessel·les cobreixen una finestra del mapa, i a quin zoom.
 *
 * ## Per què viu aquí i no a cada costat
 *
 * Perquè ho han de calcular **igual** el worker que baixa les imatges i la
 * pàgina que les col·loca. Amb dues còpies, el dia que una canviï el worker
 * baixarà unes i la pàgina en demanarà unes altres: la pàgina sortirà amb
 * forats i res no donarà error. És el mateix parany que ja va costar el fitxer
 * del «Camí de Sant Jaume» — una clau derivada es calcula un cop.
 *
 * ## Com es tria el zoom
 *
 * El més fi que hi càpiga amb `maxTiles` o menys. El límit no és estètic: cada
 * tessel·la és una petició i uns cinquanta kB, i un itinerari de quatre-cents
 * quilòmetres al zoom fi en voldria centenars per a un dibuix de set-cents
 * píxels. Si cap no hi cap, es queda el més ample, que sempre en són poques.
 */
export interface TileBox {
  z: number;
  x: number;
  y: number;
  /** On cau al `viewBox` del mapa. Recte, perquè les dues projeccions són la mateixa. */
  px: number; py: number; pw: number; ph: number;
}

export function tileWindow(
  view: { x: number; y: number; w: number; h: number },
  p: MapProjection,
  zooms: number[],
  maxTiles: number,
): TileBox[] {
  const ordered = [...zooms].sort((a, b) => b - a);

  for (const z of ordered) {
    const [ax, ay] = mapToTile(view.x, view.y, p, z);
    const [bx, by] = mapToTile(view.x + view.w, view.y + view.h, p, z);
    const x0 = Math.floor(ax); const x1 = Math.floor(bx);
    const y0 = Math.floor(ay); const y1 = Math.floor(by);
    const count = (x1 - x0 + 1) * (y1 - y0 + 1);

    if (count <= maxTiles || z === ordered[ordered.length - 1]) {
      const out: TileBox[] = [];
      for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
          const [tx, ty] = tileToMap(x, y, p, z);
          const [ux, uy] = tileToMap(x + 1, y + 1, p, z);
          out.push({ z, x, y, px: tx, py: ty, pw: ux - tx, ph: uy - ty });
        }
      }
      return out;
    }
  }
  return [];
}

/**
 * La finestra que encabeix uns punts, amb marge.
 *
 * Va amb `tileWindow()` i pel mateix motiu: el worker i la pàgina han de mirar
 * **exactament** la mateixa finestra. Un marge diferent en un i altre no dona
 * cap error; dona un mapa amb una franja sense tessel·les al caire.
 *
 * El marge és proporcional amb un mínim. Sense el mínim, una pujada de dos
 * quilòmetres en línia recta sortiria amb una caixa de dues unitats d'alt i el
 * mapa seria una ratlla.
 */
export function fitBox(
  pts: Array<[number, number]>,
  share = 0.12,
  min = 6,
): { x: number; y: number; w: number; h: number } {
  const xs = pts.map((p) => p[0]);
  const ys = pts.map((p) => p[1]);
  const w0 = Math.max(...xs) - Math.min(...xs);
  const h0 = Math.max(...ys) - Math.min(...ys);
  const pad = Math.max(w0, h0) * share + min;
  return {
    x: Math.min(...xs) - pad,
    y: Math.min(...ys) - pad,
    w: w0 + pad * 2,
    h: h0 + pad * 2,
  };
}
