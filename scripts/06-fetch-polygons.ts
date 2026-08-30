/**
 * Fase 0 · paso 6 — Polígonos de municipios y comarcas.
 *
 * Fuente: GML 3.2 perfil INSPIRE del ICGC. Pesa 88 MB entre los dos ficheros y
 * se cachea; solo se descarga una vez.
 *
 * Aporta tres cosas que hasta ahora faltaban:
 *
 *  1. **Colindancia real.** Cada unidad declara sus líneas de frontera
 *     (`au:boundary`), y dos municipios que comparten una son limítrofes. Es el
 *     equivalente exacto de `ST_Touches` sin necesidad de PostGIS, y es mucho
 *     más fiable que deducirlo comparando vértices.
 *  2. **Superficie y centroide reales**, en vez del centroide de una nube de
 *     puntos.
 *  3. **Geometría simplificada** para el mapa web.
 *
 * Salidas:
 *   data/raw/polygons.json          precisión completa, para cálculo
 *   data/build/geo/municipis.geojson  simplificado, para el mapa
 *   data/build/geo/comarques.geojson  simplificado, para el mapa
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fetchWithRetry } from './lib/http.ts';
import { BUILD, ensureDirs, raw } from './lib/paths.ts';
import {
  parseUnits, areaKm2, centroidOf, bboxOf, simplify, round, countPoints,
  type MultiPolygon,
} from './lib/gml.ts';

const SOURCES = {
  municipis: {
    url: 'https://datacloud.ide.cat/geodades/inspire-unitats-administratives/inspire-unitats-administratives-etrs89-geo.gml',
    file: 'inspire-unitats-administratives-etrs89-geo.gml',
    tag: 'au:AdministrativeUnit',
    code: { tag: 'au:nationalCode' } as const,
  },
  comarques: {
    url: 'https://datacloud.ide.cat/geodades/inspire-unitats-estadistiques/inspire-unitats-estadistiques-comarques-etrs89-geo.gml',
    file: 'inspire-unitats-estadistiques-comarques-etrs89-geo.gml',
    tag: 'su-vector:AreaStatisticalUnit',
    code: { thematic: true } as const,
  },
};

/** ~0,0004° ≈ 35 m. Invisible a escala comarcal y divide el peso por veinte. */
const TOLERANCE_MUNICIPI = 0.0004;
/** Las comarcas se ven de más lejos: se puede simplificar más. */
const TOLERANCE_COMARCA = 0.0008;

export interface PolygonRecord {
  code: string;
  name: string;
  areaKm2: number;
  centroid: { lat: number; lon: number };
  bbox: [number, number, number, number];
  boundaryIds: string[];
  geometry: MultiPolygon;
}

async function download(url: string, dest: string): Promise<void> {
  if (existsSync(dest) && statSync(dest).size > 1_000_000) return;
  process.stdout.write(`  descargando ${dest.split(/[\\/]/).pop()} … `);
  const res = await fetchWithRetry(url, { timeoutMs: 300_000, retries: 2 });
  const buf = Buffer.from(await res.arrayBuffer());
  writeFileSync(dest, buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}

function toFeatureCollection(records: PolygonRecord[], tolerance: number) {
  return {
    type: 'FeatureCollection' as const,
    features: records.map((r) => ({
      type: 'Feature' as const,
      id: r.code,
      properties: {
        code: r.code,
        name: r.name,
        areaKm2: Math.round(r.areaKm2 * 100) / 100,
      },
      geometry: {
        type: 'MultiPolygon' as const,
        coordinates: round(simplify(r.geometry, tolerance)),
      },
    })),
  };
}

async function main() {
  ensureDirs();
  const gmlDir = raw('gml');
  mkdirSync(gmlDir, { recursive: true });
  const geoDir = join(BUILD, 'geo');
  mkdirSync(geoDir, { recursive: true });

  const out: Record<string, PolygonRecord[]> = {};

  for (const [key, src] of Object.entries(SOURCES)) {
    console.log(`\n── ${key} ──`);
    const path = join(gmlDir, src.file);
    await download(src.url, path);

    const xml = readFileSync(path, 'utf8');
    const units = parseUnits(xml, src.tag, src.code);
    console.log(`  unidades con geometría: ${units.length}`);

    const records: PolygonRecord[] = units.map((u) => ({
      code: u.code,
      name: u.name,
      areaKm2: areaKm2(u.geometry),
      centroid: centroidOf(u.geometry),
      bbox: bboxOf(u.geometry),
      boundaryIds: u.boundaryIds,
      geometry: u.geometry,
    }));

    const pts = records.reduce((s, r) => s + countPoints(r.geometry), 0);
    const totalArea = records.reduce((s, r) => s + r.areaKm2, 0);
    console.log(`  vértices: ${pts.toLocaleString('es-ES')}`);
    console.log(`  superficie total: ${Math.round(totalArea).toLocaleString('es-ES')} km²`);

    const tol = key === 'municipis' ? TOLERANCE_MUNICIPI : TOLERANCE_COMARCA;
    const fc = toFeatureCollection(records, tol);
    const simplified = fc.features.reduce((s, f) => s + f.geometry.coordinates.reduce(
      (a, p) => a + p.reduce((b, r) => b + r.length, 0), 0), 0);
    const geojson = JSON.stringify(fc);
    writeFileSync(join(geoDir, `${key}.geojson`), geojson, 'utf8');
    console.log(`  simplificado: ${simplified.toLocaleString('es-ES')} vértices (${(100 - (simplified / pts) * 100).toFixed(1)} % menos)`);
    console.log(`  → data/build/geo/${key}.geojson · ${(geojson.length / 1e6).toFixed(2)} MB`);

    out[key] = records;
  }

  // ── Colindancia real ──────────────────────────────────────────────────────
  // Dos municipios que comparten una línea de frontera se tocan. Es lo mismo
  // que haría `ST_Touches`, pero leído directamente de la topología que publica
  // el ICGC, así que no hay tolerancias ni falsos positivos por vértices sueltos.
  const byBoundary = new Map<string, string[]>();
  for (const m of out.municipis) {
    for (const b of m.boundaryIds) {
      const arr = byBoundary.get(b) ?? [];
      arr.push(m.code);
      byBoundary.set(b, arr);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  for (const codes of byBoundary.values()) {
    if (codes.length < 2) continue;   // línea de costa o frontera exterior
    for (const a of codes) for (const b of codes) {
      if (a === b) continue;
      if (!adjacency.has(a)) adjacency.set(a, new Set());
      adjacency.get(a)!.add(b);
    }
  }

  const counts = [...adjacency.values()].map((s) => s.size);
  const sinVecinos = out.municipis.filter((m) => !adjacency.has(m.code));
  console.log(`\n── colindancia ──`);
  console.log(`  líneas de frontera: ${byBoundary.size.toLocaleString('es-ES')}`);
  console.log(`  compartidas por dos municipios: ${[...byBoundary.values()].filter((c) => c.length >= 2).length.toLocaleString('es-ES')}`);
  console.log(`  municipios con vecinos: ${adjacency.size} / ${out.municipis.length}`);
  console.log(`  vecinos por municipio: media ${(counts.reduce((a, b) => a + b, 0) / counts.length).toFixed(1)} · máx ${Math.max(...counts)}`);
  if (sinVecinos.length) {
    console.log(`  sin vecinos: ${sinVecinos.map((m) => `${m.name} (${m.code})`).join(', ')}`);
  }

  writeFileSync(
    raw('polygons.json'),
    JSON.stringify({
      fetchedAt: new Date().toISOString(),
      municipis: out.municipis.map((r) => ({ ...r, geometry: undefined })),
      comarques: out.comarques.map((r) => ({ ...r, geometry: undefined })),
      adjacency: Object.fromEntries([...adjacency].map(([k, v]) => [k, [...v]])),
    }),
    'utf8',
  );
  console.log(`\n→ data/raw/polygons.json (métricas y colindancia)`);
  console.log(`→ data/build/geo/ (geometría simplificada para el mapa)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
