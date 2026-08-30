/**
 * Lector mínimo de GML 3.2 (perfil INSPIRE) para los polígonos del ICGC.
 *
 * No es un parser XML general y no pretende serlo: recorre el documento
 * buscando los bloques que nos interesan. Con ficheros de 60 MB, un DOM completo
 * cuesta memoria y tiempo para nada — aquí solo hacen falta cuatro etiquetas.
 *
 * Detalle que cuesta caro si se pasa por alto: el ICGC publica en EPSG:4258
 * (ETRS89 geográfico), donde `posList` va en orden **latitud longitud**.
 * GeoJSON exige lo contrario. Confundirlos deja Catalunya en Somalia.
 */

/** Anillo: lista de posiciones [lon, lat]. */
export type Ring = Array<[number, number]>;
/** Polígono: anillo exterior seguido de sus huecos. */
export type Polygon = Ring[];
/** MultiPolígono. */
export type MultiPolygon = Polygon[];

export interface GmlUnit {
  /** Identificador `gml:id` completo, p. ej. `ID.AU.municipi.080018`. */
  gmlId: string;
  /** Código temático: `080018` para municipios, `01` para comarcas. */
  code: string;
  /** Topónimo oficial del Nomenclàtor de Toponímia Major. */
  name: string;
  geometry: MultiPolygon;
  /** Identificadores de las líneas de frontera. Dos unidades que comparten una son limítrofes. */
  boundaryIds: string[];
}

function textBetween(block: string, open: string, close: string, from = 0): string | null {
  const i = block.indexOf(open, from);
  if (i === -1) return null;
  const j = block.indexOf(close, i + open.length);
  if (j === -1) return null;
  return block.slice(i + open.length, j);
}

/** `"41.94 2.80 41.95 2.81"` → `[[2.80, 41.94], [2.81, 41.95]]` (lat lon → lon lat). */
function parsePosList(raw: string): Ring {
  const nums = raw.trim().split(/\s+/);
  const ring: Ring = [];
  for (let i = 0; i + 1 < nums.length; i += 2) {
    ring.push([Number(nums[i + 1]), Number(nums[i])]);
  }
  return ring;
}

/** Cierra el anillo si el origen no viene repetido, como exige GeoJSON. */
function closeRing(ring: Ring): Ring {
  if (ring.length < 3) return ring;
  const a = ring[0];
  const b = ring[ring.length - 1];
  if (a[0] !== b[0] || a[1] !== b[1]) ring.push([a[0], a[1]]);
  return ring;
}

/**
 * Extrae la geometría de un bloque `<gml:MultiSurface>`.
 * Cada `<gml:Surface>` es un polígono; dentro, `exterior` es el contorno y cada
 * `interior` un hueco (enclaves de otro municipio dentro de este).
 */
function parseMultiSurface(block: string): MultiPolygon {
  const out: MultiPolygon = [];
  let cursor = 0;

  while (true) {
    const sStart = block.indexOf('<gml:Surface', cursor);
    if (sStart === -1) break;
    const sEnd = block.indexOf('</gml:Surface>', sStart);
    if (sEnd === -1) break;
    const surface = block.slice(sStart, sEnd);
    cursor = sEnd + 1;

    const polygon: Polygon = [];

    const ext = textBetween(surface, '<gml:exterior>', '</gml:exterior>');
    if (ext) {
      const pos = textBetween(ext, '>', '</gml:posList>', ext.indexOf('<gml:posList'));
      if (pos) polygon.push(closeRing(parsePosList(pos)));
    }

    let ic = 0;
    while (true) {
      const iStart = surface.indexOf('<gml:interior>', ic);
      if (iStart === -1) break;
      const iEnd = surface.indexOf('</gml:interior>', iStart);
      if (iEnd === -1) break;
      const interior = surface.slice(iStart, iEnd);
      ic = iEnd + 1;
      const pos = textBetween(interior, '>', '</gml:posList>', interior.indexOf('<gml:posList'));
      if (pos) polygon.push(closeRing(parsePosList(pos)));
    }

    if (polygon.length) out.push(polygon);
  }

  return out;
}

/** Todos los `xlink:href="#ID.AU.linia.N"` de un bloque. */
function parseBoundaryRefs(block: string): string[] {
  const ids: string[] = [];
  const re = /<au:boundary\s+xlink:href="#([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) ids.push(m[1]);
  return ids;
}

function parseName(block: string): string {
  return textBetween(block, '<gn:text>', '</gn:text>')?.trim() ?? '';
}

/**
 * Recorre un GML y devuelve una unidad por cada aparición de `featureTag`.
 *
 * @param xml         contenido completo del fichero
 * @param featureTag  p. ej. `au:AdministrativeUnit` o `su-vector:AreaStatisticalUnit`
 * @param codeFrom    de dónde sacar el código: etiqueta directa o identificador temático
 */
export function parseUnits(
  xml: string,
  featureTag: string,
  codeFrom: { tag: string } | { thematic: true },
): GmlUnit[] {
  const open = `<${featureTag} `;
  const close = `</${featureTag}>`;
  const units: GmlUnit[] = [];
  let cursor = 0;

  while (true) {
    const start = xml.indexOf(open, cursor);
    if (start === -1) break;
    const end = xml.indexOf(close, start);
    if (end === -1) break;
    const block = xml.slice(start, end);
    cursor = end + close.length;

    const gmlId = /gml:id="([^"]+)"/.exec(block)?.[1] ?? '';

    let code = '';
    if ('tag' in codeFrom) {
      code = textBetween(block, `<${codeFrom.tag}>`, `</${codeFrom.tag}>`)?.trim() ?? '';
    } else {
      code = textBetween(block, '<base2:identifier>', '</base2:identifier>')?.trim() ?? '';
    }

    const geometry = parseMultiSurface(block);
    if (!geometry.length) continue;

    units.push({
      gmlId,
      code,
      name: parseName(block),
      geometry,
      boundaryIds: parseBoundaryRefs(block),
    });
  }

  return units;
}

// ── Geometría ───────────────────────────────────────────────────────────────

const R = 6371.0088;
const rad = (d: number) => (d * Math.PI) / 180;

/**
 * Área de un anillo sobre la esfera, en km². Fórmula del exceso esférico
 * (L'Huilier simplificada), suficiente a esta escala y sin necesidad de
 * reproyectar a un sistema métrico.
 */
function ringAreaKm2(ring: Ring): number {
  if (ring.length < 4) return 0;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    total += rad(lon2 - lon1) * (2 + Math.sin(rad(lat1)) + Math.sin(rad(lat2)));
  }
  return Math.abs((total * R * R) / 2);
}

/** Área de un multipolígono restando los huecos. */
export function areaKm2(mp: MultiPolygon): number {
  let a = 0;
  for (const poly of mp) {
    poly.forEach((ring, i) => { a += i === 0 ? ringAreaKm2(ring) : -ringAreaKm2(ring); });
  }
  return a;
}

/** Centroide ponderado por área: para una comarca con exclaves da el punto útil. */
export function centroidOf(mp: MultiPolygon): { lat: number; lon: number } {
  let sx = 0, sy = 0, sa = 0;
  for (const poly of mp) {
    const ring = poly[0];
    const a = ringAreaKm2(ring);
    let cx = 0, cy = 0;
    for (const [lon, lat] of ring) { cx += lon; cy += lat; }
    cx /= ring.length; cy /= ring.length;
    sx += cx * a; sy += cy * a; sa += a;
  }
  return sa > 0 ? { lon: sx / sa, lat: sy / sa } : { lon: 0, lat: 0 };
}

export function bboxOf(mp: MultiPolygon): [number, number, number, number] {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const poly of mp) for (const ring of poly) for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }
  return [minX, minY, maxX, maxY];
}

/** Distancia perpendicular punto-segmento en grados, suficiente para simplificar. */
function perpDist(p: [number, number], a: [number, number], b: [number, number]): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas–Peucker iterativo (recursivo desborda la pila con anillos de 50.000 puntos). */
function simplifyRing(ring: Ring, tolerance: number): Ring {
  if (ring.length <= 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1;
  keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];

  while (stack.length) {
    const [first, last] = stack.pop()!;
    let maxDist = 0;
    let index = -1;
    for (let i = first + 1; i < last; i++) {
      const d = perpDist(ring[i], ring[first], ring[last]);
      if (d > maxDist) { maxDist = d; index = i; }
    }
    if (maxDist > tolerance && index !== -1) {
      keep[index] = 1;
      stack.push([first, index], [index, last]);
    }
  }

  const out: Ring = [];
  for (let i = 0; i < ring.length; i++) if (keep[i]) out.push(ring[i]);
  // Un anillo simplificado por debajo de 4 puntos ya no es un polígono válido:
  // mejor devolver el original que emitir geometría rota.
  return out.length >= 4 ? closeRing(out) : ring;
}

/**
 * Simplifica para render web. Descarta además los polígonos minúsculos, que a
 * escala de mapa son un píxel y solo engordan el fichero.
 */
export function simplify(mp: MultiPolygon, tolerance: number, minAreaKm2 = 0.05): MultiPolygon {
  const out: MultiPolygon = [];
  for (const poly of mp) {
    if (ringAreaKm2(poly[0]) < minAreaKm2) continue;
    const rings = poly
      .map((r, i) => (i === 0 || ringAreaKm2(r) >= minAreaKm2 ? simplifyRing(r, tolerance) : null))
      .filter((r): r is Ring => r !== null && r.length >= 4);
    if (rings.length) out.push(rings);
  }
  return out.length ? out : mp;
}

export function countPoints(mp: MultiPolygon): number {
  let n = 0;
  for (const poly of mp) for (const ring of poly) n += ring.length;
  return n;
}

/** Redondea coordenadas: 5 decimales ≈ 1 m, de sobra para un mapa web. */
export function round(mp: MultiPolygon, decimals = 5): MultiPolygon {
  const f = 10 ** decimals;
  return mp.map((poly) => poly.map((ring) =>
    ring.map(([x, y]) => [Math.round(x * f) / f, Math.round(y * f) / f] as [number, number])));
}
