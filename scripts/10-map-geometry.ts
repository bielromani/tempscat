/**
 * Geometria del mapa de Catalunya, llesta per pintar.
 *
 * Projecta, simplifica i arrodoneix els polígons de les comarques una sola
 * vegada, aquí, i deixa un fitxer que l'aplicació només ha de pintar. Es
 * versiona amb la resta de `data/build/`.
 *
 * ## Per què no es fa en temps de renderitzat
 *
 * Les 43 comarques del fitxer de l'ICGC són **14.347 punts**: unes 154 kB de
 * `path` en cru, en una pàgina que en pesa 21. Simplificar-ho a cada
 * renderitzat seria fer la mateixa feina milers de vegades per obtenir sempre
 * el mateix resultat.
 *
 * Tres coses el fan petit, i les tres calen:
 *
 *  · **Douglas-Peucker amb tolerància d'un píxel** del mapa final. Mesurat: de
 *    14.347 punts a uns 3.600, amb un error que no es veu perquè és més petit
 *    que el píxel on es dibuixa.
 *  · **Coordenades enteres.** El `viewBox` fa 1.000 unitats d'ample i el mapa
 *    es dibuixa a la meitat o menys, així que un enter ja és mig píxel real.
 *  · **Ordres relatives** (`l` en comptes de `L`). Els salts entre punts veïns
 *    són d'una o dues xifres; les absolutes en gasten quatre o cinc.
 *
 * ## El punt de l'etiqueta
 *
 * El centroide d'una comarca còncava cau fora de la comarca. Aquí es comprova,
 * i quan cau fora es busca el punt interior més allunyat de la vora. Sense
 * això, alguna comarca escriuria la seva temperatura dins del mar.
 *
 * Sortida: data/build/geo/comarques-map.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { build } from './lib/paths.ts';

type Pt = [number, number];

/** Amplada del sistema de coordenades intern. No és la mida a la pantalla. */
const WIDTH = 1000;
/** Tolerància de simplificació, en unitats del `viewBox`. */
const EPS = 1.3;

interface Feature {
  properties: { code: string; name: string };
  geometry: { type: string; coordinates: number[][][] | number[][][][] };
}

// ── Projecció ───────────────────────────────────────────────────────────────

/** Mercator esfèrica. La y creix cap avall, com al SVG. */
function merc(lon: number, lat: number): Pt {
  return [
    (lon * Math.PI) / 180,
    -Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)),
  ];
}

// ── Simplificació ───────────────────────────────────────────────────────────

function perpDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  if (dx === 0 && dy === 0) return Math.hypot(p[0] - a[0], p[1] - a[1]);
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

/** Douglas-Peucker iteratiu: el recursiu peta amb anells de milers de punts. */
function simplify(pts: Pt[], eps: number): Pt[] {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = 1;
  keep[pts.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, pts.length - 1]];

  while (stack.length) {
    const span = stack.pop();
    if (!span) break;
    const [lo, hi] = span;
    let maxD = 0;
    let idx = -1;
    for (let i = lo + 1; i < hi; i++) {
      const d = perpDist(pts[i], pts[lo], pts[hi]);
      if (d > maxD) { maxD = d; idx = i; }
    }
    if (idx >= 0 && maxD > eps) {
      keep[idx] = 1;
      stack.push([lo, idx], [idx, hi]);
    }
  }
  return pts.filter((_, i) => keep[i] === 1);
}

// ── Punt interior per a l'etiqueta ──────────────────────────────────────────

function inside(pt: Pt, ring: Pt[]): boolean {
  let hit = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > pt[1]) !== (yj > pt[1])
      && pt[0] < ((xj - xi) * (pt[1] - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

/** Distància a la vora; negativa si el punt cau fora. */
function depth(pt: Pt, ring: Pt[]): number {
  let min = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    min = Math.min(min, perpDist(pt, ring[j], ring[i]));
  }
  return inside(pt, ring) ? min : -min;
}

/**
 * Un punt ben endins del polígon.
 *
 * Primer el centroide, que val per a la majoria. Si cau fora —passa amb
 * qualsevol comarca en forma de C o amb la costa retallada— es rastreja la
 * caixa amb una graella i es queda el punt més allunyat de la vora.
 */
function labelPoint(ring: Pt[]): Pt {
  const cx = ring.reduce((a, p) => a + p[0], 0) / ring.length;
  const cy = ring.reduce((a, p) => a + p[1], 0) / ring.length;
  if (inside([cx, cy], ring)) return [Math.round(cx), Math.round(cy)];

  const xs = ring.map((p) => p[0]);
  const ys = ring.map((p) => p[1]);
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const y0 = Math.min(...ys);
  const y1 = Math.max(...ys);

  let best: Pt = [cx, cy];
  let bestD = -Infinity;
  const STEPS = 28;
  for (let i = 1; i < STEPS; i++) {
    for (let j = 1; j < STEPS; j++) {
      const p: Pt = [x0 + ((x1 - x0) * i) / STEPS, y0 + ((y1 - y0) * j) / STEPS];
      const d = depth(p, ring);
      if (d > bestD) { bestD = d; best = p; }
    }
  }
  return [Math.round(best[0]), Math.round(best[1])];
}

// ── Camí SVG ────────────────────────────────────────────────────────────────

/** `M` absoluta i la resta relatives: entre veïns els salts són d'una xifra. */
function toPath(rings: Pt[][]): string {
  const out: string[] = [];
  for (const ring of rings) {
    if (ring.length < 3) continue;
    let px = ring[0][0];
    let py = ring[0][1];
    out.push(`M${px} ${py}`);
    for (let i = 1; i < ring.length; i++) {
      const [x, y] = ring[i];
      const dx = x - px;
      const dy = y - py;
      if (dx === 0 && dy === 0) continue;
      out.push(dx === 0 ? `v${dy}` : dy === 0 ? `h${dx}` : `l${dx} ${dy}`);
      px = x;
      py = y;
    }
    out.push('Z');
  }
  return out.join('');
}

// ── Construcció ─────────────────────────────────────────────────────────────

const geo = JSON.parse(readFileSync(build('geo', 'comarques.geojson'), 'utf8')) as {
  features: Feature[];
};

// Es projecta tot primer: l'escala surt de la caixa comuna de les 43.
const projected = geo.features.map((f) => {
  const polys = f.geometry.type === 'Polygon'
    ? [f.geometry.coordinates as number[][][]]
    : f.geometry.coordinates as number[][][][];
  return {
    code: f.properties.code,
    name: f.properties.name,
    polys: polys.map((poly) => poly.map((ring) => ring.map(
      ([lon, lat]) => merc(lon, lat),
    ))),
  };
});

const all = projected.flatMap((f) => f.polys.flat().flat());
const minX = Math.min(...all.map((p) => p[0]));
const maxX = Math.max(...all.map((p) => p[0]));
const minY = Math.min(...all.map((p) => p[1]));
const maxY = Math.max(...all.map((p) => p[1]));

const scale = WIDTH / (maxX - minX);
const HEIGHT = Math.round((maxY - minY) * scale);
const toView = (p: Pt): Pt => [(p[0] - minX) * scale, (p[1] - minY) * scale];

let before = 0;
let after = 0;
let dropped = 0;

const features = projected.map((f) => {
  const rings: Pt[][] = [];
  let biggest: Pt[] = [];

  for (const poly of f.polys) {
    for (let r = 0; r < poly.length; r++) {
      const ring = poly[r];
      before += ring.length;
      const simple = simplify(ring.map(toView), EPS)
        .map((p): Pt => [Math.round(p[0]), Math.round(p[1])]);
      // Illots que a aquesta escala no arriben a un triangle.
      if (simple.length < 3) { dropped++; continue; }
      after += simple.length;
      rings.push(simple);
      // L'etiqueta va a l'anell exterior més gran, no a un forat.
      if (r === 0 && simple.length > biggest.length) biggest = simple;
    }
  }

  return {
    code: f.code,
    name: f.name,
    d: toPath(rings),
    label: labelPoint(biggest.length >= 3 ? biggest : rings[0]),
  };
});

const out = { width: WIDTH, height: HEIGHT, features };
writeFileSync(build('geo', 'comarques-map.json'), JSON.stringify(out), 'utf8');

console.log(`Mapa de comarques: ${features.length} comarques`);
console.log(`  punts: ${before.toLocaleString('ca-ES')} → ${after.toLocaleString('ca-ES')}`
  + ` (${(100 - (after / before) * 100).toFixed(0)} % menys)`);
if (dropped) console.log(`  ${dropped} illots massa petits per dibuixar-los a aquesta escala`);
console.log(`  viewBox: ${WIDTH} × ${HEIGHT}`);
console.log(`  → data/build/geo/comarques-map.json`
  + ` · ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
