/**
 * Fase 0 · paso 17 — Els barris de Barcelona, amb la seva altitud.
 *
 * Barcelona és una sola fitxa calculada a 30 m, la cota del centre, i
 * Vallvidrera és a més de 300: hi pot fer dos o tres graus menys i una boira
 * que a baix no hi és. El Nomenclàtor no hi ajuda —per a l'INE, Barcelona és
 * una sola entitat de població—, així que els barris surten d'on surten per a
 * l'Ajuntament: el conjunt «Unitats administratives» d'Open Data BCN, amb
 * llicència CC BY 4.0.
 *
 * ## L'altitud és la mediana del barri, no la d'un punt
 *
 * Un barri de la muntanya va de la carretera al cim: el de Vallvidrera, el
 * Tibidabo i les Planes passa de 150 a 512 m. La cota d'un punt qualsevol —el
 * centroide, per exemple— podria caure en una carena o en un torrent. Es
 * mostreja el model d'elevació cada ~250 m dins del contorn, i l'altitud del
 * barri és la **mediana**; el punt que el representa és la mostra amb la cota
 * més propera a la mediana i, entre aquestes, la més propera al centre.
 *
 * El model és el mateix `terrarium` dels itineraris i del relleu, desat a
 * `data/raw/terrarium/`: no gasta ni una unitat de quota d'Open-Meteo.
 *
 * Quins barris acaben tenint fitxa no es decideix aquí: ho decideix
 * `07-build-territory.ts`, amb el criteri escrit allà.
 *
 * Sortida: data/raw/barris-bcn.json
 */
import { writeFileSync } from 'node:fs';
import { fetchJson } from './lib/http.ts';
import { ensureDirs, raw } from './lib/paths.ts';
import { createDem } from './lib/dem.ts';

const SOURCE = 'https://opendata-ajuntament.barcelona.cat/data/dataset/808daafa-d9ce-48c0-925a-fa5afdb1ed41/resource/75197dfe-0306-4c5e-9643-34948af07fb6/download';

/** Separació de la malla de mostres, en graus: uns 250 m. */
const STEP_DEG = 0.0025;

interface RawBarri {
  codi_districte: string;
  nom_districte: string;
  codi_barri: string;
  nom_barri: string;
  geometria_wgs84: string;
}

export interface Barri {
  codi: string;
  nom: string;
  districte: string;
  lat: number;
  lon: number;
  /** Mediana de les mostres de dins del contorn. */
  altitud: number;
  /** La cota més baixa i la més alta de les mostres. */
  altitudMin: number;
  altitudMax: number;
  samples: number;
  /** Els anells exteriors, simplificats a uns 30 m: per saber si un punt hi cau. */
  rings: Array<Array<[number, number]>>;
}

/** Douglas-Peucker, en graus. Prou per a «aquest punt és dins del barri». */
function simplify(ring: Array<[number, number]>, tol: number): Array<[number, number]> {
  if (ring.length < 4) return ring;
  const keep = new Uint8Array(ring.length);
  keep[0] = 1; keep[ring.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, ring.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const [ax, ay] = ring[a];
    const [bx, by] = ring[b];
    const len = Math.hypot(bx - ax, by - ay);
    let worst = -1; let at = -1;
    for (let i = a + 1; i < b; i++) {
      const [x, y] = ring[i];
      // Un anell tancat comença i acaba al mateix punt: llavors, la distància a aquest punt.
      const d = len === 0
        ? Math.hypot(x - ax, y - ay)
        : Math.abs((bx - ax) * (ay - y) - (ax - x) * (by - ay)) / len;
      if (d > worst) { worst = d; at = i; }
    }
    if (worst > tol) { keep[at] = 1; stack.push([a, at], [at, b]); }
  }
  return ring.filter((_, i) => keep[i]).map(([x, y]) => [Math.round(x * 1e5) / 1e5, Math.round(y * 1e5) / 1e5]);
}

/** `POLYGON ((lon lat, ...), (...))` o `MULTIPOLYGON (((...)))` → anells exteriors. */
function outerRings(wkt: string): Array<Array<[number, number]>> {
  const body = wkt.replace(/^\s*(MULTI)?POLYGON\s*/i, '');
  // Cada polígon comença amb «((»: el primer anell de cadascun és l'exterior.
  return body.split(/\(\s*\(/).slice(1).map((chunk) => {
    const ring = chunk.replace(/^[\s(]+/, '').split(')')[0];
    return ring.split(',').map((pair) => {
      const [lon, lat] = pair.trim().split(/\s+/).map(Number);
      return [lon, lat] as [number, number];
    });
  });
}

function inRing(lon: number, lat: number, ring: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

async function main() {
  ensureDirs();
  const rows = await fetchJson<RawBarri[]>(SOURCE, { timeoutMs: 180_000, retries: 3 });
  if (rows.length !== 73) throw new Error(`Barcelona té 73 barris i n'han arribat ${rows.length}`);

  const dem = createDem();
  const out: Barri[] = [];

  for (const r of rows) {
    const rings = outerRings(r.geometria_wgs84);
    if (!rings.length || rings.some((g) => g.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)))) {
      throw new Error(`No s'entén la geometria de ${r.nom_barri}`);
    }
    const all = rings.flat();
    const w = Math.min(...all.map(([x]) => x));
    const e = Math.max(...all.map(([x]) => x));
    const s = Math.min(...all.map(([, y]) => y));
    const n = Math.max(...all.map(([, y]) => y));
    const cx = all.reduce((a, [x]) => a + x, 0) / all.length;
    const cy = all.reduce((a, [, y]) => a + y, 0) / all.length;

    const pts: Array<{ lat: number; lon: number; h: number }> = [];
    for (let lat = s + STEP_DEG / 2; lat < n; lat += STEP_DEG) {
      for (let lon = w + STEP_DEG / 2; lon < e; lon += STEP_DEG) {
        if (!rings.some((g) => inRing(lon, lat, g))) continue;
        const h = await dem.elevationAt(lat, lon);
        if (h != null) pts.push({ lat, lon, h });
      }
    }
    // Un barri petit pot no tenir cap nus de la malla a dins: llavors, el centre.
    if (!pts.length) {
      const h = await dem.elevationAt(cy, cx);
      if (h == null) throw new Error(`Sense cota per a ${r.nom_barri}`);
      pts.push({ lat: cy, lon: cx, h });
    }

    const hs = pts.map((p) => p.h).sort((a, b) => a - b);
    const median = hs[Math.floor(hs.length / 2)];
    const rep = pts
      .map((p) => ({ p, dh: Math.abs(p.h - median), dc: Math.hypot(p.lat - cy, p.lon - cx) }))
      .sort((a, b) => a.dh - b.dh || a.dc - b.dc)[0].p;

    out.push({
      codi: r.codi_barri,
      nom: r.nom_barri.trim(),
      districte: r.nom_districte.trim(),
      lat: Math.round(rep.lat * 1e5) / 1e5,
      lon: Math.round(rep.lon * 1e5) / 1e5,
      altitud: Math.round(median),
      altitudMin: Math.round(hs[0]),
      altitudMax: Math.round(hs[hs.length - 1]),
      samples: pts.length,
      rings: rings.map((g) => simplify(g, 0.0003)),
    });
  }

  out.sort((a, b) => b.altitud - a.altitud);
  writeFileSync(raw('barris-bcn.json'), JSON.stringify({
    source: 'Ajuntament de Barcelona · Open Data BCN, «Unitats administratives» (CC BY 4.0)',
    fetchedAt: new Date().toISOString(),
    barris: out,
  }, null, 1), 'utf8');

  console.log(`Barris: ${out.length} · tessel·les ${JSON.stringify(dem.stats())}`);
  for (const b of out) {
    console.log(`  ${String(b.altitud).padStart(4)} m  (${b.altitudMin}–${b.altitudMax})  ${b.nom} · ${b.districte}`);
  }
  console.log('→ data/raw/barris-bcn.json');
}

main().catch((err) => { console.error(err); process.exit(1); });
