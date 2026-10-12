/**
 * Fase 0 · paso 17 — Els barris de les ciutats, amb la seva altitud.
 *
 * Barcelona és una sola fitxa calculada a 30 m, la cota del centre, i
 * Vallvidrera és a més de 300: hi pot fer dos o tres graus menys i una boira
 * que a baix no hi és. El Nomenclàtor no hi ajuda —per a l'INE, Barcelona és
 * una sola entitat de població, i Terrassa, Badalona o Girona també—, així que
 * els barris surten d'una altra banda:
 *
 *  · **Barcelona**, de l'Ajuntament: el conjunt «Unitats administratives»
 *    d'Open Data BCN, CC BY 4.0, que és la mateixa llicència que el web.
 *  · **La resta de ciutats de més de 40.000 habitants**, d'OpenStreetMap: les
 *    relacions `boundary=administrative` d'`admin_level` 10 (o 9 si no n'hi
 *    ha). Són **ODbL**, com els itineraris: es poden ensenyar dient-ho, però
 *    no poden entrar a l'API de dades, que és CC BY. Ho fa complir
 *    `/api/lloc`, que no serveix els llocs amb `geocodeSource: 'osm'`.
 *
 * ## L'altitud és la mediana del barri, no la d'un punt
 *
 * Un barri de la muntanya va de la carretera al cim: el de Vallvidrera, el
 * Tibidabo i les Planes passa de 180 a 508 m. La cota d'un punt qualsevol —el
 * centroide, per exemple— podria caure en una carena o en un torrent. Es
 * mostreja el model d'elevació cada ~250 m dins del contorn, i l'altitud del
 * barri és la **mediana**; el punt que el representa és la mostra amb la cota
 * més propera a la mediana i, entre aquestes, la més propera al centre.
 *
 * El model és el mateix `terrarium` dels itineraris i del relleu, desat a
 * `data/raw/terrarium/`: no gasta ni una unitat de quota d'Open-Meteo.
 *
 * Quins barris acaben tenint fitxa no es decideix aquí: ho decideix
 * `07-build-territory.ts`, amb el criteri escrit allà. Per saber de quina
 * ciutat és cada barri d'OSM i quanta gent hi viu, es llegeix l'últim
 * `data/build/` —la geometria dels municipis i les poblacions—, que existeix
 * sempre que s'ha construït el territori un cop.
 *
 * Sortida: data/raw/barris.json
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fetchJson, fetchWithRetry } from './lib/http.ts';
import { build, ensureDirs, raw } from './lib/paths.ts';
import { createDem } from './lib/dem.ts';

const BCN_SOURCE = 'https://opendata-ajuntament.barcelona.cat/data/dataset/808daafa-d9ce-48c0-925a-fa5afdb1ed41/resource/75197dfe-0306-4c5e-9643-34948af07fb6/download';
const BCN_CODE = '080193';
const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Les ciutats que es miren a OSM, a partir d'aquesta població. */
const MIN_CITY_POP = 40_000;

/** Separació de la malla de mostres, en graus: uns 250 m. */
const STEP_DEG = 0.0025;

/**
 * Noms d'OSM que no són barris on viu ningú: un polígon industrial no té un
 * temps que interessi a cap veí.
 */
const NOT_A_BARRI = /^(pol[ií]gon|parc (comercial|d'activitats|empresarial|logístic)|zona (franca|industrial))/i;

type Ring = Array<[number, number]>;

interface Area {
  source: 'bcn' | 'osm';
  municipiCodi: string;
  codi: string;
  nom: string;
  districte: string | null;
  /** Anells exteriors, en [lon, lat]. */
  rings: Ring[];
}

export interface Barri {
  source: 'bcn' | 'osm';
  /** El municipi, amb sis xifres com a `Location.municipiCodi`. */
  municipiCodi: string;
  codi: string;
  nom: string;
  districte: string | null;
  lat: number;
  lon: number;
  /** Mediana de les mostres de dins del contorn. */
  altitud: number;
  /** La cota més baixa i la més alta de les mostres. */
  altitudMin: number;
  altitudMax: number;
  samples: number;
  /** Els anells exteriors, simplificats a uns 30 m: per saber si un punt hi cau. */
  rings: Ring[];
}

/** Douglas-Peucker, en graus. Prou per a «aquest punt és dins del barri». */
function simplify(ring: Ring, tol: number): Ring {
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

function inRing(lon: number, lat: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

// ── Barcelona ────────────────────────────────────────────────────────────────

/** `POLYGON ((lon lat, ...), (...))` o `MULTIPOLYGON (((...)))` → anells exteriors. */
function outerRings(wkt: string): Ring[] {
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

async function barcelona(): Promise<Area[]> {
  const rows = await fetchJson<Array<{
    codi_barri: string; nom_barri: string; nom_districte: string; geometria_wgs84: string;
  }>>(BCN_SOURCE, { timeoutMs: 180_000, retries: 3 });
  if (rows.length !== 73) throw new Error(`Barcelona té 73 barris i n'han arribat ${rows.length}`);
  return rows.map((r) => {
    const rings = outerRings(r.geometria_wgs84);
    if (!rings.length || rings.some((g) => g.some(([x, y]) => !Number.isFinite(x) || !Number.isFinite(y)))) {
      throw new Error(`No s'entén la geometria de ${r.nom_barri}`);
    }
    return {
      source: 'bcn' as const, municipiCodi: BCN_CODE, codi: r.codi_barri,
      nom: r.nom_barri.trim(), districte: r.nom_districte.trim(), rings,
    };
  });
}

// ── OpenStreetMap ────────────────────────────────────────────────────────────

interface OsmRel {
  id: number;
  tags: Record<string, string>;
  members: Array<{ type: string; role: string; geometry?: Array<{ lat: number; lon: number }> }>;
}

/**
 * Una relació d'OSM és un sac de vies: l'anell s'ha de cosir pels extrems.
 * Es tornen només els anells que es tanquen; un contorn trencat no serveix per
 * saber si un punt hi cau, i val més deixar el barri fora que mal posat.
 */
function stitch(rel: OsmRel): Ring[] {
  const ways = rel.members
    .filter((m) => m.type === 'way' && m.role !== 'inner' && m.geometry?.length)
    .map((m) => m.geometry!.map((p) => [p.lon, p.lat] as [number, number]));
  const same = (a: [number, number], b: [number, number]) => a[0] === b[0] && a[1] === b[1];
  const rings: Ring[] = [];
  const left = [...ways];
  while (left.length) {
    let ring = left.shift()!;
    let grew = true;
    while (!same(ring[0], ring[ring.length - 1]) && grew) {
      grew = false;
      for (let i = 0; i < left.length; i++) {
        const w = left[i];
        const end = ring[ring.length - 1];
        if (same(w[0], end)) ring = [...ring, ...w.slice(1)];
        else if (same(w[w.length - 1], end)) ring = [...ring, ...[...w].reverse().slice(1)];
        else continue;
        left.splice(i, 1);
        grew = true;
        break;
      }
    }
    if (ring.length >= 4 && same(ring[0], ring[ring.length - 1])) rings.push(ring);
  }
  return rings;
}

async function openStreetMap(): Promise<Area[]> {
  const query = '[out:json][timeout:280];area["ISO3166-2"="ES-CT"]->.ct;'
    + '(rel["boundary"="administrative"]["admin_level"~"^(9|10)$"](area.ct););out geom;';
  const res = await fetchWithRetry(OVERPASS, {
    retries: 3,
    timeoutMs: 300_000,
    method: 'POST',
    body: new URLSearchParams({ data: query }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  const { elements } = JSON.parse(await res.text()) as { elements: OsmRel[] };

  // De quin municipi és cada relació, i quines ciutats passen del llindar.
  const geo = JSON.parse(readFileSync(build('geo', 'web', 'municipis.json'), 'utf8')) as {
    features: Array<{ properties: { code: string }; geometry: { type: string; coordinates: unknown } }>;
  };
  const munis = geo.features.map((f) => ({
    code: f.properties.code,
    polys: (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates) as Ring[][],
  }));
  const locations = JSON.parse(readFileSync(build('locations.json'), 'utf8')) as Array<{
    level: string; municipiCodi?: string; poblacio: number | null;
  }>;
  const big = new Set(locations
    .filter((l) => l.level === 'municipi' && (l.poblacio ?? 0) >= MIN_CITY_POP && l.municipiCodi !== BCN_CODE)
    .map((l) => l.municipiCodi!));

  const byCity = new Map<string, Array<{ rel: OsmRel; rings: Ring[] }>>();
  for (const rel of elements) {
    const name = rel.tags.name?.trim();
    if (!name || NOT_A_BARRI.test(name)) continue;
    const rings = stitch(rel);
    if (!rings.length) continue;
    // El municipi on cau el primer punt de l'anell més llarg, desplaçat cap a dins.
    const ring = rings.sort((a, b) => b.length - a.length)[0];
    const cx = ring.reduce((s, [x]) => s + x, 0) / ring.length;
    const cy = ring.reduce((s, [, y]) => s + y, 0) / ring.length;
    const muni = munis.find((m) => m.polys.some((p) => inRing(cx, cy, p[0])));
    if (!muni || !big.has(muni.code)) continue;
    const list = byCity.get(muni.code) ?? [];
    list.push({ rel, rings });
    byCity.set(muni.code, list);
  }

  /*
   * Un sol nivell per ciutat: el 10 si n'hi ha prou, i si no el 9. Barrejant-
   * los, un districte i els seus barris sortirien alhora i una mateixa casa
   * tindria dues fitxes.
   */
  const out: Area[] = [];
  for (const [code, list] of byCity) {
    const l10 = list.filter((x) => x.rel.tags.admin_level === '10');
    const l9 = list.filter((x) => x.rel.tags.admin_level === '9');
    const pick = l10.length >= 3 ? l10 : l9.length >= 3 ? l9 : [];
    for (const { rel, rings } of pick) {
      out.push({
        source: 'osm', municipiCodi: code, codi: `r${rel.id}`,
        nom: rel.tags.name.trim(), districte: null, rings,
      });
    }
  }
  return out;
}

// ── Altitud ──────────────────────────────────────────────────────────────────

async function main() {
  ensureDirs();
  const areas = [...await barcelona(), ...await openStreetMap()];
  const dem = createDem();
  const out: Barri[] = [];

  for (const a of areas) {
    const all = a.rings.flat();
    const w = Math.min(...all.map(([x]) => x));
    const e = Math.max(...all.map(([x]) => x));
    const s = Math.min(...all.map(([, y]) => y));
    const n = Math.max(...all.map(([, y]) => y));
    const cx = all.reduce((acc, [x]) => acc + x, 0) / all.length;
    const cy = all.reduce((acc, [, y]) => acc + y, 0) / all.length;

    const pts: Array<{ lat: number; lon: number; h: number }> = [];
    for (let lat = s + STEP_DEG / 2; lat < n; lat += STEP_DEG) {
      for (let lon = w + STEP_DEG / 2; lon < e; lon += STEP_DEG) {
        if (!a.rings.some((g) => inRing(lon, lat, g))) continue;
        const h = await dem.elevationAt(lat, lon);
        if (h != null) pts.push({ lat, lon, h });
      }
    }
    // Un barri petit pot no tenir cap nus de la malla a dins: llavors, el centre.
    if (!pts.length) {
      const h = await dem.elevationAt(cy, cx);
      if (h == null) { console.warn(`  sense cota: ${a.nom}`); continue; }
      pts.push({ lat: cy, lon: cx, h });
    }

    const hs = pts.map((p) => p.h).sort((x, y) => x - y);
    const median = hs[Math.floor(hs.length / 2)];
    const rep = pts
      .map((p) => ({ p, dh: Math.abs(p.h - median), dc: Math.hypot(p.lat - cy, p.lon - cx) }))
      .sort((x, y) => x.dh - y.dh || x.dc - y.dc)[0].p;

    out.push({
      source: a.source,
      municipiCodi: a.municipiCodi,
      codi: a.codi,
      nom: a.nom,
      districte: a.districte,
      lat: Math.round(rep.lat * 1e5) / 1e5,
      lon: Math.round(rep.lon * 1e5) / 1e5,
      altitud: Math.round(median),
      altitudMin: Math.round(hs[0]),
      altitudMax: Math.round(hs[hs.length - 1]),
      samples: pts.length,
      rings: a.rings.map((g) => simplify(g, 0.0003)),
    });
  }

  out.sort((x, y) => x.municipiCodi.localeCompare(y.municipiCodi) || y.altitud - x.altitud);
  writeFileSync(raw('barris.json'), JSON.stringify({
    sources: {
      bcn: 'Ajuntament de Barcelona · Open Data BCN, «Unitats administratives» (CC BY 4.0)',
      osm: '© OpenStreetMap i els seus col·laboradors (ODbL)',
    },
    fetchedAt: new Date().toISOString(),
    barris: out,
  }), 'utf8');

  const cities = new Map<string, Barri[]>();
  for (const b of out) cities.set(b.municipiCodi, [...(cities.get(b.municipiCodi) ?? []), b]);
  console.log(`Barris: ${out.length} en ${cities.size} ciutats · tessel·les ${JSON.stringify(dem.stats())}`);
  for (const [code, list] of cities) {
    console.log(`  ${code} · ${list.length} barris · ${list[0].altitud}–${list[list.length - 1].altitud} m · el més alt, ${list[0].nom}`);
  }
  console.log('→ data/raw/barris.json');
}

main().catch((err) => { console.error(err); process.exit(1); });
