/**
 * Fase 0 · paso 6 — Construcción del territorio unificado.
 *
 * Junta nomenclátor, coordenadas, altitudes y estaciones en un único árbol
 * navegable, resuelve slugs y rutas, decide qué se publica y asigna a cada
 * ubicación su estación XEMA de referencia.
 *
 * Salidas en data/build/:
 *   comarques.json   43 comarcas con centroide y agregados
 *   locations.json   el árbol completo (municipios, entidades, núcleos)
 *   paths.json       índice ruta → id, para resolver URLs con un solo lookup
 *   stations.json    estaciones con su ubicación más cercana
 *   summary.json     estadísticas de la construcción
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { build, ensureDirs, raw } from './lib/paths.ts';
import { slugify, toNaturalName, sameName } from './lib/catalan.ts';
import { haversineKm, stationCost, centroid, nearest } from './lib/geo.ts';
import type { NomenclatorRow } from './01-fetch-nomenclator.ts';
import type { MunicipiPoint } from './02-fetch-geo.ts';
import type { GeocodeResult } from './03-geocode-entitats.ts';
import type { Station } from './04-fetch-stations.ts';

export type Level = 'comarca' | 'municipi' | 'entitat_colectiva' | 'entitat_singular' | 'nucli' | 'disseminat';
export type Tier = 'A' | 'B' | 'C' | 'D';

export interface Location {
  id: string;              // codi_13, o 'C##' para comarcas
  level: Level;
  parentId: string | null;
  comarcaCodi: string;
  municipiCodi?: string;   // 6 dígitos
  municipiIne5?: string;   // 5 dígitos, el que usa AEMET

  nom: string;             // 'la Guàrdia dels Prats'
  nomIndexat: string;      // 'Guàrdia dels Prats, la'
  slug: string;
  path: string;            // '/conca-de-barbera/montblanc/la-guardia-dels-prats'

  lat: number | null;
  lon: number | null;
  altitud: number | null;
  geocodeSource: 'cap-municipi' | 'icgc' | 'heretat' | null;
  geocodeConfidence: number;

  poblacio: number | null;
  /** Superficie del término municipal, km². Solo a nivel municipio. */
  areaKm2?: number | null;

  stationRef?: { codi: string; nom: string; distKm: number; dAltM: number | null };

  /** Punto de predicción compartido. Ver la deduplicación en el build. */
  forecastPointId?: string;
  /** Desnivel respecto a ese punto. Lo corrige después el motor de fusión. */
  forecastDAltM?: number;

  tier: Tier;
  published: boolean;
  /** Si no se publica, a qué ruta apunta el canonical. */
  canonicalOf?: string;
  reason?: string;
}

// ─────────────────────────────────────────────────────────────────────────────

function levelOf(r: NomenclatorRow): Level {
  if (r.entitat_colectiva === '00' && r.entitat_singular === '00') return 'municipi';
  if (r.entitat_singular === '00') return 'entitat_colectiva';
  if (r.nucli_poblacio === '00') return 'entitat_singular';
  if (r.nucli_poblacio === '99') return 'disseminat';
  return 'nucli';
}

const num = (s?: string) => (s == null || s === '' ? null : Number(s));

/** Asegura slugs únicos dentro de un mismo padre añadiendo un sufijo estable. */
function uniqueSlug(base: string, taken: Set<string>, fallbackId: string): string {
  if (!taken.has(base)) { taken.add(base); return base; }
  const suffixed = `${base}-${fallbackId.slice(-4)}`;
  if (!taken.has(suffixed)) { taken.add(suffixed); return suffixed; }
  let i = 2;
  while (taken.has(`${base}-${i}`)) i++;
  taken.add(`${base}-${i}`);
  return `${base}-${i}`;
}

// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs();

  const { rows, edition } = JSON.parse(readFileSync(raw('nomenclator.json'), 'utf8')) as { rows: NomenclatorRow[]; edition: string };
  const { municipis: munGeo, comarques: comGeo } = JSON.parse(readFileSync(raw('municipis-geo.json'), 'utf8')) as {
    municipis: MunicipiPoint[];
    comarques: Array<{ codi: string; nom: string; municipis: number }>;
  };
  const geocodes = new Map(
    (JSON.parse(readFileSync(raw('geocode.json'), 'utf8')) as GeocodeResult[]).map((g) => [g.codi13, g]),
  );
  const elevations: Record<string, number> = JSON.parse(readFileSync(raw('elevation.json'), 'utf8'));
  const { stations } = JSON.parse(readFileSync(raw('stations.json'), 'utf8')) as { stations: Station[] };

  // Los polígonos son opcionales: si aún no se han descargado, el territorio se
  // construye igual con centroides aproximados y vecindad por proximidad. Lo que
  // no se hace nunca es fingir que hay colindancia real cuando no la hay.
  type PolyRec = { code: string; name: string; areaKm2: number; centroid: { lat: number; lon: number } };
  let polygons: { municipis: PolyRec[]; comarques: PolyRec[]; adjacency: Record<string, string[]> } | null = null;
  if (existsSync(raw('polygons.json'))) {
    polygons = JSON.parse(readFileSync(raw('polygons.json'), 'utf8'));
  } else {
    console.warn('  aviso: sin data/raw/polygons.json — ejecuta `npm run data:polygons`');
    console.warn('  se usarán centroides aproximados y vecindad por proximidad\n');
  }
  const polyMun = new Map((polygons?.municipis ?? []).map((p) => [p.code, p]));
  const polyCom = new Map((polygons?.comarques ?? []).map((p) => [p.code.padStart(2, '0'), p]));

  const munByCodi = new Map(munGeo.map((m) => [m.codi, m]));

  // ── Comarcas ───────────────────────────────────────────────────────────────
  // La comarca la manda el dataset de caps de municipi, que está al día: el
  // Nomenclàtor es de 2021 y no conoce el Lluçanès, creado en 2023.
  const comarcaSlugs = new Set<string>();
  const comarques = comGeo.map((c) => {
    const members = munGeo.filter((m) => m.comarcaCodi === c.codi);
    const poly = polyCom.get(c.codi);
    // Con polígono, el centroide es el real ponderado por área; sin él, el de la
    // nube de cabeceras municipales, que en comarcas alargadas se desvía bastante.
    const cen = poly?.centroid ?? centroid(members);
    return {
      codi: c.codi,
      nom: c.nom,
      slug: uniqueSlug(slugify(c.nom), comarcaSlugs, c.codi),
      path: '',
      lat: cen.lat,
      lon: cen.lon,
      areaKm2: poly ? Math.round(poly.areaKm2 * 10) / 10 : null,
      nMunicipis: members.length,
      poblacio: 0,
      densitat: null as number | null,
      altitudMin: null as number | null,
      altitudMax: null as number | null,
    };
  });
  for (const c of comarques) c.path = `/${c.slug}`;
  const comarcaByCodi = new Map(comarques.map((c) => [c.codi, c]));

  // ── Ubicaciones ────────────────────────────────────────────────────────────
  const locations: Location[] = [];
  const byId = new Map<string, Location>();

  const municipiRows = rows.filter((r) => levelOf(r) === 'municipi');
  const slugsByParent = new Map<string, Set<string>>();
  const takenIn = (parent: string) => {
    let s = slugsByParent.get(parent);
    if (!s) { s = new Set(); slugsByParent.set(parent, s); }
    return s;
  };

  // Municipios
  for (const r of municipiRows) {
    const geo = munByCodi.get(r.codi_ine);
    if (!geo) { console.warn(`  sin geo: ${r.nom_municipi} (${r.codi_ine})`); continue; }
    const com = comarcaByCodi.get(geo.comarcaCodi);
    if (!com) { console.warn(`  sin comarca: ${r.nom_municipi}`); continue; }

    const nom = toNaturalName(r.nom_normalitzat);
    const slug = uniqueSlug(slugify(nom), takenIn(`C${com.codi}`), r.codi_ine);
    const loc: Location = {
      id: r.codi_13,
      level: 'municipi',
      parentId: `C${com.codi}`,
      comarcaCodi: com.codi,
      municipiCodi: r.codi_ine,
      municipiIne5: geo.codiIne5,
      nom,
      nomIndexat: r.nom_normalitzat,
      slug,
      path: `${com.path}/${slug}`,
      lat: geo.lat,
      lon: geo.lon,
      altitud: elevations[`M${r.codi_ine}`] ?? null,
      geocodeSource: 'cap-municipi',
      geocodeConfidence: 100,
      poblacio: num(r.poblaci),
      areaKm2: polyMun.get(r.codi_ine) ? Math.round(polyMun.get(r.codi_ine)!.areaKm2 * 100) / 100 : null,
      tier: 'B',
      published: true,
    };
    locations.push(loc);
    byId.set(loc.id, loc);
    com.poblacio += loc.poblacio ?? 0;
  }

  const municipiByCodi = new Map(locations.filter((l) => l.level === 'municipi').map((l) => [l.municipiCodi!, l]));

  // Entidades y núcleos
  const singularByKey = new Map<string, Location>();

  for (const pass of ['entitat_colectiva', 'entitat_singular', 'nucli', 'disseminat'] as Level[]) {
    for (const r of rows) {
      if (levelOf(r) !== pass) continue;
      const mun = municipiByCodi.get(r.codi_ine);
      if (!mun) continue;

      const nom = toNaturalName(r.nom_normalitzat);
      const g = geocodes.get(r.codi_13);
      const singularKey = r.codi_ine + r.entitat_colectiva + r.entitat_singular;

      // Punto: propio si se geocodificó con confianza; si no, heredado del padre.
      let lat: number | null = null, lon: number | null = null;
      let source: Location['geocodeSource'] = null;
      let confidence = 0;
      if (g && g.lat != null && g.lon != null && g.confidence >= 60) {
        lat = g.lat; lon = g.lon; source = 'icgc'; confidence = g.confidence;
      } else if (pass === 'nucli' || pass === 'disseminat') {
        const parent = singularByKey.get(singularKey);
        if (parent?.lat != null) { lat = parent.lat; lon = parent.lon; source = 'heretat'; confidence = 40; }
      }

      // ¿Publica página?
      //
      // El orden importa: primero las razones estructurales (este lugar ya
      // tiene página con otro nombre) y solo después la calidad del dato. Al
      // revés, un núcleo que se llama igual que su entidad se reportaría como
      // "sin coordenada fiable", que es falso y esconde el estado real de la
      // geocodificación.
      let published = false;
      let reason: string | undefined;
      let canonicalOf: string | undefined;
      const parentSingular = singularByKey.get(singularKey);

      if (pass === 'disseminat') {
        reason = 'diseminado: se agrega a su entidad padre';
        canonicalOf = parentSingular?.path ?? mun.path;
      } else if (pass === 'nucli' && parentSingular && sameName(nom, parentSingular.nom)) {
        reason = 'mismo topónimo que su entidad singular';
        canonicalOf = parentSingular.path;
      } else if (sameName(nom, mun.nom)) {
        // El núcleo cabecera no duplica al municipio: canonical al municipio.
        reason = 'núcleo cabecera del municipio';
        canonicalOf = mun.path;
      } else if (g?.note?.startsWith('unidad estadística')) {
        reason = 'unidad estadística, no es un topónimo';
        canonicalOf = mun.path;
      } else if (confidence < 60) {
        reason = 'sin coordenada fiable';
        canonicalOf = mun.path;
      } else {
        published = true;
      }

      const parentLoc = pass === 'nucli' || pass === 'disseminat'
        ? singularByKey.get(singularKey) ?? mun
        : mun;

      const slug = published
        ? uniqueSlug(slugify(nom), takenIn(mun.path), r.codi_13)
        : slugify(nom);

      const loc: Location = {
        id: r.codi_13,
        level: pass,
        parentId: parentLoc.id,
        comarcaCodi: mun.comarcaCodi,
        municipiCodi: r.codi_ine,
        municipiIne5: mun.municipiIne5,
        nom,
        nomIndexat: r.nom_normalitzat,
        slug,
        path: published ? `${mun.path}/${slug}` : (canonicalOf ?? mun.path),
        lat,
        lon,
        altitud: lat != null ? elevations[r.codi_13] ?? null : null,
        geocodeSource: source,
        geocodeConfidence: confidence,
        poblacio: num(r.poblaci),
        tier: 'C',
        published,
        canonicalOf: published ? undefined : canonicalOf,
        reason,
      };

      locations.push(loc);
      byId.set(loc.id, loc);
      if (pass === 'entitat_singular') singularByKey.set(singularKey, loc);
    }
  }

  // ── Estación de referencia ─────────────────────────────────────────────────
  const operatives = stations.filter((s) => s.operativa && Number.isFinite(s.lat) && Number.isFinite(s.lon));
  let withStation = 0;
  for (const loc of locations) {
    if (!loc.published || loc.lat == null || loc.lon == null) continue;
    let best: { s: Station; d: number; cost: number } | null = null;
    for (const s of operatives) {
      const d = haversineKm(loc.lat, loc.lon, s.lat, s.lon);
      if (d > 60) continue;
      const dAlt = loc.altitud != null && s.altitud != null ? loc.altitud - s.altitud : 0;
      const cost = stationCost(d, dAlt);
      if (!best || cost < best.cost) best = { s, d, cost };
    }
    if (best) {
      loc.stationRef = {
        codi: best.s.codi,
        nom: best.s.nom,
        distKm: Math.round(best.d * 10) / 10,
        dAltM: loc.altitud != null && best.s.altitud != null ? loc.altitud - best.s.altitud : null,
      };
      withStation++;
    }
  }

  // ── Niveles de indexación ──────────────────────────────────────────────────
  for (const loc of locations) {
    if (!loc.published) { loc.tier = 'D'; continue; }
    if (loc.level === 'municipi') {
      loc.tier = (loc.poblacio ?? 0) >= 2000 ? 'A' : 'B';
    } else {
      loc.tier = (loc.poblacio ?? 0) >= 50 ? 'B' : 'C';
    }
  }

  // Densidad, ahora que ya está sumada la población
  for (const c of comarques) {
    if (c.areaKm2 && c.poblacio) c.densitat = Math.round((c.poblacio / c.areaKm2) * 10) / 10;
  }

  // Altitudes extremas por comarca
  for (const c of comarques) {
    const alts = locations
      .filter((l) => l.comarcaCodi === c.codi && l.altitud != null)
      .map((l) => l.altitud!);
    if (alts.length) { c.altitudMin = Math.min(...alts); c.altitudMax = Math.max(...alts); }
  }

  // ── Vecindades, para el enlazado interno ───────────────────────────────────
  // Con los polígonos del ICGC la colindancia es **real**: dos municipios que
  // comparten una línea de frontera se tocan. Es el equivalente de `ST_Touches`
  // leído de la topología oficial, sin tolerancias ni falsos positivos.
  //
  // La distinción importa porque acaba en el texto de la página: llamar
  // "limítrofe" a lo que solo está cerca es una afirmación falsa, y son
  // exactamente esas las que hunden la credibilidad de un sitio generado.
  const neighbours: Array<{ locationId: string; neighbourId: string; relation: string; distKm: number; rank: number }> = [];

  const municipisPub = locations.filter((l) => l.level === 'municipi' && l.lat != null) as Array<Location & { lat: number; lon: number }>;
  const munByCode = new Map(municipisPub.map((m) => [m.municipiCodi!, m]));
  let nAdjacent = 0;
  let nFallback = 0;

  for (const m of municipisPub) {
    const adjacentCodes = polygons?.adjacency[m.municipiCodi!] ?? [];
    const adjacent = adjacentCodes
      .map((code) => munByCode.get(code))
      .filter((o): o is typeof m => !!o)
      .map((o) => ({ item: o, distKm: haversineKm(m.lat, m.lon, o.lat, o.lon) }))
      .sort((a, b) => a.distKm - b.distKm);

    adjacent.forEach((n, i) => neighbours.push({
      locationId: m.id, neighbourId: n.item.id, relation: 'adjacent',
      distKm: Math.round(n.distKm * 10) / 10, rank: i + 1,
    }));
    nAdjacent += adjacent.length;

    // Llívia no linda con ningún municipio catalán: es un enclave dentro de
    // Francia. Para esos casos (y si faltaran polígonos) se completa con
    // proximidad, etiquetada como tal para no mentir.
    if (adjacent.length < 3) {
      const already = new Set(adjacent.map((a) => a.item.id));
      nearest({ lat: m.lat, lon: m.lon }, municipisPub.filter((o) => o.id !== m.id && !already.has(o.id)), { k: 5, maxKm: 60 })
        .forEach((n, i) => {
          neighbours.push({
            locationId: m.id, neighbourId: n.item.id, relation: 'nearest',
            distKm: Math.round(n.distKm * 10) / 10, rank: i + 1,
          });
          nFallback++;
        });
    }
  }

  // Hermanos: entidades publicadas del mismo municipio, de mayor a menor población.
  const byMunicipi = new Map<string, Location[]>();
  for (const l of locations) {
    if (!l.published || l.level === 'municipi' || !l.municipiCodi) continue;
    const arr = byMunicipi.get(l.municipiCodi) ?? [];
    arr.push(l);
    byMunicipi.set(l.municipiCodi, arr);
  }
  for (const arr of byMunicipi.values()) {
    const sorted = arr.slice().sort((a, b) => (b.poblacio ?? 0) - (a.poblacio ?? 0));
    for (const l of sorted) {
      sorted.filter((o) => o.id !== l.id).slice(0, 8).forEach((o, i) => neighbours.push({
        locationId: l.id, neighbourId: o.id, relation: 'sibling',
        distKm: l.lat != null && o.lat != null ? Math.round(haversineKm(l.lat, l.lon!, o.lat, o.lon!) * 10) / 10 : 0,
        rank: i + 1,
      }));
    }
  }

  // ── Puntos de predicción ───────────────────────────────────────────────────
  // Pedir predicción para las 4.250 ubicaciones publicadas sería tirar cuota:
  // dos núcleos separados por 1 km y 50 m de desnivel caen en la misma celda de
  // AROME, así que la respuesta sería idéntica.
  //
  // Se agrupan por celda de ~0,02° (≈ 1,7 km) y banda de altitud de 100 m. Cada
  // ubicación guarda el desnivel respecto a su punto representativo, que es lo
  // que después corrige el motor de fusión: un núcleo a 700 m no puede mostrar
  // la temperatura de uno a 350 m aunque compartan celda.
  const GRID_DEG = 0.02;
  const ALT_BAND_M = 100;

  const pointGroups = new Map<string, Location[]>();
  for (const loc of locations) {
    if (!loc.published || loc.lat == null || loc.lon == null) continue;
    const key = [
      Math.round(loc.lat / GRID_DEG),
      Math.round(loc.lon / GRID_DEG),
      Math.floor((loc.altitud ?? 0) / ALT_BAND_M),
    ].join(':');
    const arr = pointGroups.get(key) ?? [];
    arr.push(loc);
    pointGroups.set(key, arr);
  }

  const forecastPoints: Array<{
    id: string; lat: number; lon: number; altitud: number | null;
    nLocations: number; tier: Tier;
    /**
     * Comarcas que consultan este punto. Casi siempre una.
     *
     * La celda de 0,02° no sabe de fronteras, así que un puñado de puntos caen
     * a caballo de dos comarcas y los usan las dos. Se anota aquí porque es
     * aquí donde se sabe: la predicción se guarda partida por comarca, y sin
     * esta lista el worker tendría que volver a abrir las 11.019 ubicaciones
     * para averiguar dónde va cada punto.
     */
    comarques: string[];
  }> = [];

  let pid = 0;
  for (const [, group] of pointGroups) {
    // Representante: la ubicación más poblada del grupo. Es la que más visitas
    // recibirá, así que es la que conviene que tenga el dato sin corregir.
    const rep = group.slice().sort((a, b) => (b.poblacio ?? 0) - (a.poblacio ?? 0))[0];
    const id = `P${String(++pid).padStart(4, '0')}`;
    // El nivel del punto es el más alto de sus ubicaciones: determina con qué
    // frecuencia se refresca.
    const tier = group.map((l) => l.tier).sort()[0];
    forecastPoints.push({
      id, lat: rep.lat!, lon: rep.lon!, altitud: rep.altitud,
      nLocations: group.length, tier,
      comarques: [...new Set(group.map((l) => l.comarcaCodi))].filter((c): c is string => !!c).sort(),
    });
    for (const loc of group) {
      loc.forecastPointId = id;
      loc.forecastDAltM = loc.altitud != null && rep.altitud != null ? loc.altitud - rep.altitud : 0;
    }
  }

  // ── Estaciones con su ubicación más cercana ────────────────────────────────
  const published = locations.filter((l) => l.published && l.lat != null);
  const stationsOut = stations.map((s) => {
    const near = Number.isFinite(s.lat)
      ? nearest({ lat: s.lat, lon: s.lon }, published as Array<Location & { lat: number; lon: number }>, { k: 1 })[0]
      : undefined;
    return {
      ...s,
      slug: slugify(s.nom),
      nearestLocation: near ? { id: near.item.id, nom: near.item.nom, path: near.item.path, distKm: Math.round(near.distKm * 10) / 10 } : null,
    };
  });

  // ── Salidas ────────────────────────────────────────────────────────────────
  const paths: Record<string, string> = {};
  for (const c of comarques) paths[c.path] = `C${c.codi}`;
  for (const l of locations) if (l.published) paths[l.path] = l.id;

  const publishedCount = locations.filter((l) => l.published).length;
  const tierCount = (t: Tier) => locations.filter((l) => l.tier === t).length;
  const levelCount = (lv: Level) => locations.filter((l) => l.level === lv).length;
  const publishedBy = (lv: Level) => locations.filter((l) => l.level === lv && l.published).length;

  const summary = {
    builtAt: new Date().toISOString(),
    nomenclatorEdition: edition,
    comarques: comarques.length,
    locations: locations.length,
    published: locations.filter((l) => l.published).length,
    indexablePages: Object.keys(paths).length,
    byLevel: Object.fromEntries(
      (['municipi', 'entitat_colectiva', 'entitat_singular', 'nucli', 'disseminat'] as Level[])
        .map((lv) => [lv, { total: levelCount(lv), published: publishedBy(lv) }]),
    ),
    byTier: { A: tierCount('A'), B: tierCount('B'), C: tierCount('C'), D: tierCount('D') },
    withStationRef: withStation,
    stations: { total: stations.length, operatives: operatives.length },
    neighbours: { total: neighbours.length, adjacent: nAdjacent, nearest: nFallback },
    forecastPoints: forecastPoints.length,
    polygons: polygons ? { municipis: polyMun.size, comarques: polyCom.size } : null,
  };

  writeFileSync(build('comarques.json'), JSON.stringify(comarques, null, 1), 'utf8');
  writeFileSync(build('locations.json'), JSON.stringify(locations), 'utf8');
  writeFileSync(build('paths.json'), JSON.stringify(paths), 'utf8');
  writeFileSync(build('stations.json'), JSON.stringify(stationsOut), 'utf8');
  writeFileSync(build('neighbours.json'), JSON.stringify(neighbours), 'utf8');
  writeFileSync(build('forecast-points.json'), JSON.stringify(forecastPoints), 'utf8');
  writeFileSync(build('summary.json'), JSON.stringify(summary, null, 2), 'utf8');

  // ── Informe ────────────────────────────────────────────────────────────────
  console.log(`Comarcas          ${comarques.length}`);
  console.log(`Ubicaciones       ${locations.length.toLocaleString('es-ES')}`);
  console.log(`Publicables       ${summary.published.toLocaleString('es-ES')}`);
  console.log(`Rutas indexables  ${summary.indexablePages.toLocaleString('es-ES')}\n`);

  console.log('Por nivel                total  publica');
  for (const [lv, v] of Object.entries(summary.byLevel)) {
    console.log(`  ${lv.padEnd(20)} ${String(v.total).padStart(6)}   ${String(v.published).padStart(6)}`);
  }

  console.log('\nPor nivel de indexación');
  for (const [t, n] of Object.entries(summary.byTier)) {
    console.log(`  ${t}  ${String(n).padStart(6)}`);
  }

  console.log(`\nCon estación de referencia: ${withStation.toLocaleString('es-ES')} / ${summary.published.toLocaleString('es-ES')}`);

  const noPublica = new Map<string, number>();
  for (const l of locations) if (!l.published && l.reason) noPublica.set(l.reason, (noPublica.get(l.reason) ?? 0) + 1);
  console.log('\nMotivos de no publicar');
  for (const [k, v] of [...noPublica].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(v).padStart(6)}  ${k}`);
  }

  console.log(`\nVecindades: ${neighbours.length.toLocaleString('es-ES')}`);
  console.log(`  colindancia real (equivale a ST_Touches)  ${nAdjacent.toLocaleString('es-ES')}`);
  console.log(`  proximidad, solo de respaldo              ${nFallback.toLocaleString('es-ES')}`);
  console.log(`  hermanos del mismo municipio             ${(neighbours.length - nAdjacent - nFallback).toLocaleString('es-ES')}`);

  if (polygons) {
    const conArea = locations.filter((l) => l.level === 'municipi' && l.areaKm2).length;
    const total = comarques.reduce((s, c) => s + (c.areaKm2 ?? 0), 0);
    console.log(`\nSuperficie: ${conArea}/947 municipios · ${Math.round(total).toLocaleString('es-ES')} km² en total`);
    const dens = comarques.filter((c) => c.densitat != null).sort((a, b) => b.densitat! - a.densitat!);
    console.log(`Densidad: ${dens[0].nom} ${dens[0].densitat!.toLocaleString('es-ES')} hab/km² · ${dens[dens.length - 1].nom} ${dens[dens.length - 1].densitat} hab/km²`);
  }

  const perPoint = forecastPoints.map((p) => p.nLocations);
  console.log(`\nPuntos de predicción: ${forecastPoints.length.toLocaleString('es-ES')} para ${publishedCount.toLocaleString('es-ES')} ubicaciones`);
  console.log(`  factor de ahorro: ${(publishedCount / forecastPoints.length).toFixed(1)}× · hasta ${Math.max(...perPoint)} ubicaciones comparten punto`);
  console.log(`  peticiones por modelo y refresco: ${Math.ceil(forecastPoints.length / 200)} (lotes de 200)`);
  const byTier = forecastPoints.reduce((a, p) => { a[p.tier] = (a[p.tier] ?? 0) + 1; return a; }, {} as Record<string, number>);
  console.log(`  por nivel: ${Object.entries(byTier).sort().map(([t, n]) => `${t}=${n}`).join(' · ')}`);

  console.log(`\n→ data/build/ (7 ficheros + geo/)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
