/**
 * Fase 0 · paso 3 — Geocodificación de entidades y núcleos.
 *
 * El Nomenclàtor no trae coordenadas y el dataset de unidades poblacionales
 * tampoco (verificado: solo códigos y nombres). La fuente es el geocodificador
 * oficial del ICGC, que devuelve GeoJSON con el código de municipio incluido,
 * lo que permite desambiguar topónimos repetidos con seguridad.
 *
 * Criterio de calidad: una entidad sin coordenada fiable NO publica página.
 * Preferimos menos páginas correctas que más con inventos.
 *
 * Salida: data/raw/geocode.json (incremental — se puede interrumpir y reanudar)
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fetchJson, throttledMap } from './lib/http.ts';
import { ensureDirs, raw } from './lib/paths.ts';
import {
  toNaturalName, sameName, normalizeKey, stripArticle,
  fuzzyMatch, splitCompound, isStatisticalUnit,
} from './lib/catalan.ts';
import type { NomenclatorRow } from './01-fetch-nomenclator.ts';

const GEOCODER = 'https://eines.icgc.cat/geocodificador/cerca';

/** Por debajo de esto una entidad no publica página. */
const MIN_CONFIDENCE = 60;

/** Tipos del ICGC que aceptamos como localización de un lugar habitado. */
const GOOD_TYPES = new Set(['Cap de municipi', 'Entitat de població', 'Municipi']);
/**
 * Tipos aceptables con confianza rebajada. 'Disseminat' entra aquí porque el
 * ICGC clasifica así entidades que el Nomenclàtor sí reconoce como singulares
 * (el Pinetell, en Montblanc, es el caso de manual): descartarlas nos dejaría
 * sin página lugares que existen.
 */
const WEAK_TYPES = new Set([
  'Edificació', 'Nucli', 'Disseminat', 'Barri', 'Indret',
  'Equipament', 'Edificació Històrica', 'Urbanització',
]);

interface Feature {
  geometry: { type: string; coordinates: [number, number] };
  properties: {
    nom: string;
    municipi: string;
    id_municipi: string;
    comarca: string;
    id_comarca: string;
    etiqueta: string;
    layer: string;
    addendum?: { tipus?: string };
  };
}

export interface GeocodeResult {
  codi13: string;
  lat: number | null;
  lon: number | null;
  /** 0-100. Por debajo de 60 la entidad no publica página. */
  confidence: number;
  tipus?: string;
  matched?: string;
  query?: string;
  note?: string;
}

async function search(text: string): Promise<Feature[]> {
  const url = `${GEOCODER}?text=${encodeURIComponent(text)}&size=50`;
  const data = await fetchJson<{ features?: Feature[] }>(url, { retries: 3, timeoutMs: 25_000 });
  return data.features ?? [];
}

/**
 * Puntúa un candidato. El municipio manda: un topónimo idéntico en otro
 * municipio es un lugar distinto, no una coincidencia mejorable.
 */
function score(f: Feature, wantedName: string, wantedMunicipi: string): number {
  // El municipio manda: el mismo topónimo en otro municipio es otro lugar,
  // no una coincidencia mejorable.
  if (f.properties.id_municipi !== wantedMunicipi) return 0;
  if (f.geometry?.type !== 'Point') return 0;

  const tipus = f.properties.addendum?.tipus ?? '';
  const found = f.properties.nom;
  const nameExact = sameName(found, wantedName);
  const nameFuzzy = fuzzyMatch(found, wantedName);
  const nameLoose =
    normalizeKey(stripArticle(found)).startsWith(normalizeKey(stripArticle(wantedName))) ||
    normalizeKey(stripArticle(wantedName)).startsWith(normalizeKey(stripArticle(found)));

  if (GOOD_TYPES.has(tipus) && nameExact) return 100;
  if (GOOD_TYPES.has(tipus) && nameFuzzy) return 90;
  if (GOOD_TYPES.has(tipus) && nameLoose) return 85;
  if (WEAK_TYPES.has(tipus) && nameExact) return 75;
  if (WEAK_TYPES.has(tipus) && nameFuzzy) return 70;
  if (WEAK_TYPES.has(tipus) && nameLoose) return 65;
  // Un tipo no habitado (una cima, un río) con el nombre exacto sitúa el paraje,
  // que para un topónimo menor suele ser exactamente donde está el caserío.
  if (nameExact) return 60;
  if (GOOD_TYPES.has(tipus)) return 50;
  return 0;
}

async function geocodeOne(name: string, municipiCodi: string, municipiNom: string): Promise<Omit<GeocodeResult, 'codi13'>> {
  // Nombres estadísticos ("Entitat Est d'Abrera", "Barri Nord"): no existen
  // sobre el terreno, no los conoce ningún geocodificador, y no deben publicar
  // página. Se marcan como tales en vez de contarlos como fallo.
  if (isStatisticalUnit(name)) {
    return { lat: null, lon: null, confidence: 0, note: 'unidad estadística, no es un topónimo' };
  }

  // Se prueban las partes de los nombres compuestos con "i", que el ICGC solo
  // conoce por separado.
  const variants = splitCompound(name);
  const attempts: string[] = [];
  for (const v of variants) attempts.push(v);
  for (const v of variants) attempts.push(`${v}, ${municipiNom}`);

  let best: { f: Feature; s: number; q: string; searched: string } | null = null;
  for (const q of attempts) {
    let features: Feature[];
    try {
      features = await search(q);
    } catch (err) {
      return { lat: null, lon: null, confidence: 0, note: `error: ${String(err).slice(0, 120)}` };
    }
    // El nombre contra el que se puntúa es la variante buscada, no el compuesto
    // entero: si buscamos "Albarells", el acierto es "Albarells".
    const target = q.includes(', ') ? q.slice(0, q.lastIndexOf(', ')) : q;
    for (const f of features) {
      const s = Math.max(score(f, target, municipiCodi), score(f, name, municipiCodi));
      if (s > (best?.s ?? 0)) best = { f, s, q, searched: target };
    }
    if (best && best.s >= 90) break; // suficientemente bueno, no gastar más peticiones
  }

  if (!best || best.s === 0) return { lat: null, lon: null, confidence: 0, note: 'sin coincidencia' };

  const [lon, lat] = best.f.geometry.coordinates;
  return {
    lat,
    lon,
    confidence: best.s,
    tipus: best.f.properties.addendum?.tipus,
    matched: best.f.properties.nom,
    query: best.q,
  };
}

function levelOf(r: NomenclatorRow) {
  if (r.entitat_colectiva === '00' && r.entitat_singular === '00') return 'municipi';
  if (r.entitat_singular === '00') return 'entitat_colectiva';
  if (r.nucli_poblacio === '00') return 'entitat_singular';
  if (r.nucli_poblacio === '99') return 'disseminat';
  return 'nucli';
}

async function main() {
  ensureDirs();
  const { rows } = JSON.parse(readFileSync(raw('nomenclator.json'), 'utf8')) as { rows: NomenclatorRow[] };

  // Nombre natural de la entidad singular padre de cada núcleo, para saber si
  // el núcleo aporta un topónimo distinto o solo repite el de su entidad.
  const singularName = new Map<string, string>();
  for (const r of rows) {
    if (levelOf(r) === 'entitat_singular') {
      singularName.set(r.codi_ine + r.entitat_colectiva + r.entitat_singular, toNaturalName(r.nom_normalitzat));
    }
  }

  // Qué geocodificamos: entidades colectivas, entidades singulares, y solo los
  // núcleos cuyo nombre difiere del de su entidad singular (el resto son la
  // misma cosa contada dos veces y heredan el punto del padre).
  const targets = rows.filter((r) => {
    const lvl = levelOf(r);
    if (lvl === 'entitat_colectiva' || lvl === 'entitat_singular') return true;
    if (lvl !== 'nucli') return false;
    const parent = singularName.get(r.codi_ine + r.entitat_colectiva + r.entitat_singular);
    return !parent || !sameName(parent, toNaturalName(r.nom_normalitzat));
  });

  console.log(`Entidades a geocodificar: ${targets.length.toLocaleString('es-ES')}`);

  const cacheFile = raw('geocode.json');
  const cache = new Map<string, GeocodeResult>();
  if (existsSync(cacheFile)) {
    for (const r of JSON.parse(readFileSync(cacheFile, 'utf8')) as GeocodeResult[]) cache.set(r.codi13, r);
    console.log(`Cacheadas de una ejecución anterior: ${cache.size.toLocaleString('es-ES')}`);
  }

  // Se reintenta lo que quedó por debajo del umbral: las mejoras de la lógica
  // de emparejamiento solo sirven si se vuelve a pasar por los fallos. Lo que
  // ya está resuelto no se vuelve a pedir.
  const isStatistical = (r: NomenclatorRow) => cache.get(r.codi_13)?.note?.startsWith('unidad estadística');
  const pending = targets.filter((t) => {
    const c = cache.get(t.codi_13);
    if (!c) return true;
    if (c.confidence >= MIN_CONFIDENCE) return false;
    return !isStatistical(t);
  });
  const retries = pending.filter((t) => cache.has(t.codi_13)).length;
  console.log(`Pendientes: ${pending.length.toLocaleString('es-ES')}${retries ? ` (${retries.toLocaleString('es-ES')} reintentos)` : ''}\n`);

  const save = () => writeFileSync(cacheFile, JSON.stringify([...cache.values()]), 'utf8');
  const started = Date.now();

  await throttledMap(
    pending,
    async (r) => {
      const name = toNaturalName(r.nom_normalitzat);
      const res = await geocodeOne(name, r.codi_ine, r.nom_municipi);
      cache.set(r.codi_13, { codi13: r.codi_13, ...res });
    },
    {
      concurrency: 3,
      minIntervalMs: 180,
      onProgress: (done, total) => {
        if (done % 25 === 0 || done === total) {
          const elapsed = (Date.now() - started) / 1000;
          const rate = done / elapsed;
          const eta = Math.round((total - done) / Math.max(rate, 0.01));
          process.stdout.write(
            `\r  ${done}/${total} · ${rate.toFixed(1)}/s · quedan ~${Math.floor(eta / 60)}m${String(eta % 60).padStart(2, '0')}s   `,
          );
        }
        if (done % 250 === 0) save();
      },
    },
  );
  save();
  process.stdout.write('\n\n');

  const all = targets.map((t) => cache.get(t.codi_13)!).filter(Boolean);
  const buckets = { exacto: 0, bueno: 0, debil: 0, malo: 0, estadistica: 0, nulo: 0 };
  for (const r of all) {
    if (r.confidence >= 100) buckets.exacto++;
    else if (r.confidence >= 85) buckets.bueno++;
    else if (r.confidence >= MIN_CONFIDENCE) buckets.debil++;
    else if (r.confidence > 0) buckets.malo++;
    else if (r.note?.startsWith('unidad estadística')) buckets.estadistica++;
    else buckets.nulo++;
  }
  const usable = buckets.exacto + buckets.bueno + buckets.debil;
  // Las unidades estadísticas no son un fallo de geocodificación: son nombres
  // que no designan ningún lugar. Se excluyen del denominador.
  const geocodable = all.length - buckets.estadistica;

  console.log('Confianza de la geocodificación:');
  console.log(`  100 · nombre y municipio exactos      ${String(buckets.exacto).padStart(5)}`);
  console.log(`  85+ · municipio exacto, nombre ~      ${String(buckets.bueno).padStart(5)}`);
  console.log(`  60+ · aceptable con reservas          ${String(buckets.debil).padStart(5)}`);
  console.log(`  <60 · descartada por baja confianza   ${String(buckets.malo).padStart(5)}`);
  console.log(`   ·  · unidad estadística, sin lugar   ${String(buckets.estadistica).padStart(5)}`);
  console.log(`    0 · sin coincidencia                ${String(buckets.nulo).padStart(5)}`);
  console.log(`\nUtilizables: ${usable} / ${geocodable} geocodificables = ${((usable / geocodable) * 100).toFixed(1)} %`);
  console.log(`             ${usable} / ${all.length} del total = ${((usable / all.length) * 100).toFixed(1)} %`);
  console.log(`\n→ ${cacheFile}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
