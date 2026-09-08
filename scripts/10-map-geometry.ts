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
import { mercPoint } from '../src/lib/mercator.ts';

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
//
// La fórmula viu a `src/lib/mercator.ts` i no aquí: l'escala i el
// desplaçament que en surten es publiquen al JSON, i la pàgina els necessita
// per posar platges i estacions d'esquí sobre aquests mateixos polígons. Amb
// dues còpies de la projecció, un dia es desviarien.

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
 * Amplada lliure dins del polígon a l'alçada d'un punt.
 *
 * És la llargada del tram horitzontal que cau dins de la comarca passant pel
 * punt de l'etiqueta. Serveix per decidir si el nom hi cap: al Barcelonès no
 * hi cabria ni escrit petit, i al Segrià hi cap de sobres.
 *
 * **Es mesura en una franja, no en una línia.** La primera versió mirava només
 * l'alçada del punt, i el nom es dibuixa una mica més avall, on la comarca pot
 * ser més estreta: el «Vallès Oriental» acabava escrit dins del Maresme. Es
 * pren la mesura més justa de tota la franja que ocuparà el text.
 *
 * Es calcula aquí perquè és geometria i no canvia mai. A la pàgina només cal
 * comparar-la amb el que ocuparia el text.
 */
function chordAt(ring: Pt[], x: number, y: number): number {
  const xs: number[] = [];
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y)) xs.push(xi + ((xj - xi) * (y - yi)) / (yj - yi));
  }
  xs.sort((a, b) => a - b);
  // El tram que conté el punt: entre creuaments consecutius, de dos en dos.
  for (let k = 0; k + 1 < xs.length; k += 2) {
    if (x >= xs[k] && x <= xs[k + 1]) return xs[k + 1] - xs[k];
  }
  return 0;
}

/** La franja que ocupen les dues línies d'etiqueta, en unitats del viewBox. */
const LABEL_BAND = 22;

function widthAt(ring: Pt[], pt: Pt): number {
  let min = Infinity;
  for (let dy = -LABEL_BAND; dy <= LABEL_BAND; dy += 4) {
    min = Math.min(min, chordAt(ring, pt[0], pt[1] + dy));
  }
  return Math.round(Math.max(0, min));
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
      ([lon, lat]) => mercPoint(lon, lat),
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

  const outer = biggest.length >= 3 ? biggest : rings[0];
  const label = labelPoint(outer);

  return {
    code: f.code,
    name: f.name,
    d: toPath(rings),
    label,
    // Quant text hi cap al costat de la xifra, en unitats del viewBox.
    room: widthAt(outer, label),
    // Els decideix la passada de col·locació de més avall.
    showName: false,
    /**
     * On va el nom, si es dibuixa.
     *
     * No sempre és sota la xifra: quan allà xoca amb un veí, es prova al
     * voltant. Es publica el punt trobat en comptes de recalcular-lo a la
     * pàgina, que és el que faria que un dia el rectangle que es va reservar
     * i el text que es dibuixa fossin a llocs diferents.
     */
    nameAt: null as [number, number] | null,
    /** El nom ja partit en línies. Una de sola quan hi cap sencer. */
    nameLines: null as string[] | null,
    /**
     * Si el rètol va fora del territori i cal lligar-l'hi amb una línia.
     *
     * Només per a les que no hi caben de cap manera: la franja costanera de
     * l'àrea metropolitana, que té zero unitats d'amplada lliure.
     */
    leader: false,
  };
});

/*
 * ── Quins noms es dibuixen, i on ────────────────────────────────────────────
 *
 * El criteri no és «que càpiga dins de la comarca». Als atles els rètols
 * sobresurten contínuament i ningú s'hi fixa; el que no es perdona és que **dos
 * rètols es trepitgin**. Amb la regla de cabre-hi dins només en sortien 15 de
 * 43, i un mapa amb quinze noms i vint-i-vuit sense sembla que hi hagi un error.
 *
 * ## Provar més d'un lloc, que és el que faltava
 *
 * Amb un sol candidat —just sota la xifra— en quedaven 17 sense nom, i entre
 * elles el Barcelonès, el Maresme, el Baix Llobregat i els dos Vallès: la part
 * del país on viu més gent era la que no es podia identificar. La meitat no
 * fallaven per falta de lloc sinó per xocar amb un rètol ja posat —el Vallès
 * Oriental té 83 unitats d'amplada lliure i no en cabia el nom—, i n'hi ha
 * prou de provar unes quantes posicions al voltant abans de rendir-se.
 *
 * Es col·loquen de gran a petita: les grosses tenen més dret al seu lloc
 * natural, i les petites es busquen la vida al voltant.
 */
const NAME_SIZE = 15;
const CHAR = NAME_SIZE * 0.55;
/** Fins on es tolera que el nom sobresurti de la comarca, en tant per u. */
const OVERHANG = 0.55;

interface Box { x0: number; y0: number; x1: number; y1: number }
const overlaps = (a: Box, b: Box) =>
  a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;

const placed: Box[] = [];
// Les xifres sempre es dibuixen: reserven el seu lloc abans que cap nom.
for (const f of features) {
  placed.push({
    x0: f.label[0] - 26, x1: f.label[0] + 26,
    y0: f.label[1] - 22, y1: f.label[1] + 4,
  });
}

/**
 * On es prova de posar el nom, en ordre de preferència.
 *
 * Sota la xifra primer, que és on es llegeix millor. Després amunt, i després
 * escapant-se cap als costats: una comarca estreta i llarga com el Maresme no
 * té lloc a sota però en té a banda i banda.
 *
 * El desplaçament vertical és de 26 unitats i no de 16 perquè ha de salvar la
 * capsa de la xifra del veí, que fa 26 d'alt.
 */
const SPOTS: Array<[number, number]> = [
  [0, 13], [0, -20], [0, 34], [0, -40],
  [34, 13], [-34, 13], [46, -6], [-46, -6],
];

/**
 * Un nom llarg, partit per l'espai més proper al mig.
 *
 * «Conca de Barberà» fa 132 unitats en una línia i la comarca en té 79 de
 * lliures: en una sola línia no hi cabia de cap manera, i el mapa es quedava
 * sense set noms per aquest motiu i no per falta de lloc —les comarques hi
 * tenen espai, però amunt i avall, no de costat—. És el que fa qualsevol
 * atles.
 *
 * No es parteix el que ja hi cap: dues línies on n'hi hauria prou amb una
 * criden l'atenció sobre el rètol en comptes de sobre el mapa.
 */
function wrap(name: string, allowed: number): string[] {
  if (name.length * CHAR <= allowed) return [name];
  const spaces = [...name.matchAll(/ /g)].map((m) => m.index);
  if (!spaces.length) return [name];
  const mid = name.length / 2;
  const cut = spaces.reduce((a, b) => (Math.abs(b - mid) < Math.abs(a - mid) ? b : a));
  return [name.slice(0, cut), name.slice(cut + 1)];
}

/** Alçada d'una línia de nom, per apilar-les i per reservar la capsa. */
const LINE = 16;

let named = 0;
for (const f of [...features].sort((a, b) => b.room - a.room)) {
  const allowed = f.room * (1 + OVERHANG);
  const lines = wrap(f.name, allowed);
  const w = Math.max(...lines.map((l) => l.length * CHAR));
  if (w > allowed) continue;   // sobresortiria massa fins i tot partit

  const h = lines.length * LINE;
  for (const [dx, dy] of SPOTS) {
    const cx = f.label[0] + dx;
    const cy = f.label[1] + dy;
    const box: Box = {
      x0: cx - w / 2 - 3, x1: cx + w / 2 + 3,
      y0: cy - 8, y1: cy - 8 + h,
    };
    if (placed.some((b) => overlaps(box, b))) continue;
    placed.push(box);
    f.showName = true;
    f.nameAt = [cx, cy];
    f.nameLines = lines;
    named++;
    break;
  }
}

/*
 * ── Les que no hi caben de cap manera: rètol a fora i una línia ─────────────
 *
 * Cinc comarques tenen **zero** unitats d'amplada lliure al seu punt interior
 * —el Barcelonès, el Baix Llobregat, el Maresme, el Garraf i el Tarragonès—:
 * són la franja costanera de l'àrea metropolitana, estretes i llargues, i cap
 * text no hi cap a dins per petit que sigui. És justament on viu més gent, i
 * eren les que quedaven sense poder-se identificar.
 *
 * Els atles ho resolen des de sempre: el nom va a fora, en un lloc lliure, i
 * una línia fina el lliga amb el seu territori. El lloc lliure el busca aquest
 * bucle sortint del punt interior cap enfora, i com que el mar no té cap altre
 * rètol, els de la costa hi van a parar sols.
 */
const AWAY: Array<[number, number]> = [
  [1, 0.35], [1, -0.2], [0.85, 0.75], [1, 0.9],
  [0.3, 1], [-1, 0.35], [-1, -0.2], [0, -1],
];
const STEPS = [46, 74, 104, 138, 176];

let led = 0;
for (const f of [...features].sort((a, b) => b.room - a.room)) {
  if (f.showName) continue;
  const lines = [f.name];
  const w = f.name.length * CHAR;

  const spot = STEPS.flatMap((d) => AWAY.map(([ux, uy]) => (
    [f.label[0] + ux * d, f.label[1] + uy * d] as [number, number]
  ))).find(([cx, cy]) => {
    // Dins del llenç, i amb el rètol sencer a dins.
    if (cx - w / 2 < 4 || cx + w / 2 > WIDTH - 4 || cy < 12 || cy > HEIGHT - 6) return false;
    /*
     * Onze i no vuit d'alçada. Un rètol reservat a ±8 passava per sota d'una
     * xifra veïna: mesurat a la pàgina, «Baix Llobregat» es menjava cinc
     * píxels del 29° del costat. La capsa ha de ser la que ocupa el text de
     * debo, no la que es voldria.
     */
    const box: Box = { x0: cx - w / 2 - 4, x1: cx + w / 2 + 4, y0: cy - 11, y1: cy + 11 };
    return !placed.some((b) => overlaps(box, b));
  });

  if (!spot) continue;
  placed.push({ x0: spot[0] - w / 2 - 4, x1: spot[0] + w / 2 + 4, y0: spot[1] - 11, y1: spot[1] + 11 });
  f.showName = true;
  f.nameAt = spot;
  f.nameLines = lines;
  f.leader = true;
  led++;
  named++;
}

/*
 * La projecció va al fitxer.
 *
 * Sense això, el JSON només serveix per pintar les 43 comarques i res més s'hi
 * pot col·locar a sobre: no hi ha manera de saber on cau un punt en graus.
 */
const out = {
  width: WIDTH,
  height: HEIGHT,
  projection: { minX, minY, scale },
  features,
};
writeFileSync(build('geo', 'comarques-map.json'), JSON.stringify(out), 'utf8');

console.log(`Mapa de comarques: ${features.length} comarques`);
console.log(`  punts: ${before.toLocaleString('ca-ES')} → ${after.toLocaleString('ca-ES')}`
  + ` (${(100 - (after / before) * 100).toFixed(0)} % menys)`);
if (dropped) console.log(`  ${dropped} illots massa petits per dibuixar-los a aquesta escala`);
console.log(`  noms dibuixats: ${named} de ${features.length}` + (led ? ` (${led} amb línia guia, fora del seu territori)` : ''));
console.log(`  viewBox: ${WIDTH} × ${HEIGHT}`);
console.log(`  escala: ${scale.toFixed(1)} unitats per radiant`);
console.log(`  → data/build/geo/comarques-map.json`
  + ` · ${(JSON.stringify(out).length / 1024).toFixed(0)} KB`);
