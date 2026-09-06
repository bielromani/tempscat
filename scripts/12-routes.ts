/**
 * Els itineraris de senderisme senyalitzats de Catalunya, d'OpenStreetMap.
 *
 * ## Per què d'OSM i no d'un altre lloc
 *
 * Perquè és l'únic que hi ha amb llicència que es pugui fer servir. Wikiloc té
 * API només per a socis i el contingut és de cada usuari, sense llicència
 * oberta. La FEEC és qui senyalitza la xarxa de debò —els GR i els PR-C— però no
 * publica les dades. I a OSM la xarxa hi és, mapada i amb el `ref` oficial:
 * mesurat el 3 de setembre de 2026, **1.663 relacions de ruta a peu** a
 * Catalunya.
 *
 * ## De 1.663 se'n publiquen 683
 *
 * Es filtra per `network`: es queden `nwn` —els de gran recorregut, els GR— i
 * `rwn` —els de petit recorregut, els PR-C—, que són els que porten marques de
 * pintura i codi oficial. Els de xarxa local són itineraris municipals de pocs
 * quilòmetres amb noms com «Itineraris de salut»: ningú no els busca pel nom, i
 * publicar-los faria repartir el pressupost de rastreig entre moltes més
 * adreces a canvi de res.
 *
 * Dels 722 que queden amb nom, en cauen 39 més pels dos filtres de sota: 324 de
 * gran recorregut i 359 de petit.
 *
 * ## La llicència **no és la nostra**
 *
 * OSM és **ODbL 1.0**, no CC-BY. Una pàgina que ensenya les dades és una «obra
 * derivada» i només demana atribució; però una base de dades derivada —el nostre
 * JSON públic, si hi posàvem això— hauria de ser ODbL i xocaria amb el CC-BY que
 * promet `/dades`. Per això els itineraris **es queden fora de l'API**.
 *
 * ## La distància es calcula, no es copia
 *
 * L'etiqueta `distance` la tecleja qui mapa i es nota: hi ha cinc rutes seguides
 * amb exactament «15.0 km». Es calcula de la geometria amb l'haversine i
 * l'etiqueta serveix per comparar: si es separen més d'un 25 %, es diu al
 * registre. La de la geometria és la que es publica.
 *
 * ## I la cota, del model d'elevació
 *
 * Al zoom 11 el píxel són 57 metres. Es mostreja cada 150 m de recorregut i
 * d'aquí surten la cota mínima i la màxima — que és el que després es creua amb
 * la cota de neu i amb la isoterma zero.
 *
 * **El desnivell acumulat no es calcula**: un model de 57 m es menja les
 * pujades i baixades curtes i el número sortiria curt sense que es vegi. Quan
 * l'etiqueta `ascent` hi és —200 dels 683— es publica com el que és, d'OSM.
 *
 * ## Els que només toquen Catalunya no compten
 *
 * El filtre d'àrea d'Overpass agafa qualsevol relació que **passi** pel
 * territori, i per tant entren etapes de la Haute Randonnée Pyrénéenne i la
 * volta a Andorra. Amb els punts de mostreig ja se sap quina part de
 * l'itinerari cau a dins: es demana **la meitat com a mínim**. Un itinerari que
 * només frega la frontera no és d'aquí i no ha de sortir com si ho fos.
 *
 * I un mínim de dos quilòmetres: per sota d'això no és un itinerari
 * senyalitzat, és un tram.
 *
 * ## Descàrrega en lots, perquè sencera no arriba
 *
 * Demanar la geometria de totes de cop són 53 MB i Overpass no els serveix
 * dins de cap temps raonable: mesurat, 280 segons i tallat a mitges. Va en lots
 * de vint-i-cinc relacions per identificador, cadascun desat a `data/raw/`, i
 * per tant es pot reprendre.
 *
 * ## La geometria va a part, un fitxer per itinerari
 *
 * `routes.json` és l'índex —nom, codi, quilòmetres, cotes, comarques— i el
 * llegeixen totes les pàgines. El traçat i el perfil només els llegeix la
 * fitxa d'aquell itinerari, i per això van a `data/build/routes/<slug>.json`:
 * és la regla de `shards.ts` aplicada aquí. Junts, el fitxer de l'índex
 * passaria de 330 kB a uns quants megues i cada pàgina se'ls baixaria tots per
 * ensenyar-ne un.
 *
 * Sortida: data/build/routes.json + data/build/routes/<slug>.json.
 * **Es versionen** tots dos, com la resta de `data/build/`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { fetchWithRetry, sleep } from './lib/http.ts';
import { build, raw } from './lib/paths.ts';
import { slugify } from './lib/catalan.ts';
import { pointInRing, ringBbox } from './lib/geo.ts';
import { createDem, distanceM, DEM_ZOOM } from './lib/dem.ts';

const OVERPASS = 'https://overpass-api.de/api/interpreter';

/** Les xarxes que es publiquen: nacional (GR) i regional (PR-C). */
const NETWORKS = new Set(['nwn', 'rwn']);

/** Relacions per lot de geometria. Amb vint-i-cinc cada resposta són uns 3 MB. */
const BATCH = 25;

/** Cada quants metres de recorregut es mira la cota. */
const SAMPLE_M = 150;

/** Per sota d'aquests metres no és un itinerari, és un tram. */
const MIN_LENGTH_M = 2_000;

/** Quina part de l'itinerari ha de caure dins de Catalunya per publicar-lo. */
const MIN_INSIDE = 0.5;

interface OsmTags { [k: string]: string }
interface OsmRelation { type: 'relation'; id: number; tags?: OsmTags }
interface OsmMember { type: string; ref: number; role: string; geometry?: Array<{ lat: number; lon: number }> }
interface OsmRelationGeom extends OsmRelation { members?: OsmMember[] }

export interface Route {
  /** L'identificador de la relació d'OSM. És la clau estable. */
  osmId: number;
  slug: string;
  name: string;
  /** El codi senyalitzat: «GR 1», «PR-C 123». Nul quan la relació no en porta. */
  ref: string | null;
  /** `nwn` els GR, `rwn` els PR-C. */
  network: string;
  /** Quilòmetres calculats de la geometria. */
  km: number;
  /** El que deia l'etiqueta, quan es separa prou per valer la pena dir-ho. */
  kmTagged: number | null;
  minM: number | null;
  maxM: number | null;
  /** Desnivell acumulat, **només si OSM el porta**. Mai calculat. */
  ascentM: number | null;
  /** Circular segons OSM. Null quan no ho diu. */
  roundtrip: boolean | null;
  from: string | null;
  to: string | null;
  website: string | null;
  operator: string | null;
  /** Per on passa: codis de comarca, en l'ordre en què es travessen. */
  comarques: string[];
  /** Quina part dels punts de mostreig cau dins de Catalunya, de 0 a 1. */
  insideShare: number;
  /** On comença, per poder-hi posar la predicció. */
  start: { lat: number; lon: number };
  /** El municipi publicat més proper a l'inici. */
  nearest: { id: string; nom: string; path: string; distKm: number } | null;
}

interface BuildLocation {
  id: string; level: string; nom: string; path: string;
  lat: number | null; lon: number | null; published: boolean;
}

async function overpass(query: string, cacheFile: string): Promise<{ elements: OsmRelationGeom[] }> {
  const dest = raw(cacheFile);
  if (existsSync(dest)) {
    return JSON.parse(readFileSync(dest, 'utf8')) as { elements: OsmRelationGeom[] };
  }

  const res = await fetchWithRetry(OVERPASS, {
    retries: 3,
    timeoutMs: 280_000,
    method: 'POST',
    body: new URLSearchParams({ data: query }).toString(),
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
  });
  const text = await res.text();

  let parsed: { elements: OsmRelationGeom[] };
  try {
    parsed = JSON.parse(text) as { elements: OsmRelationGeom[] };
  } catch {
    throw new Error(
      `Overpass no ha tornat JSON complet per a ${cacheFile} (${text.length} bytes). `
      + 'Si sempre passa amb el mateix lot, fes-lo més petit.',
    );
  }

  mkdirSync(dirname(dest), { recursive: true });
  writeFileSync(dest, JSON.stringify(parsed), 'utf8');
  return parsed;
}

/**
 * L'adreça d'un itinerari: el codi i el nom, sense repetir-se.
 *
 * A OSM el `ref` de vegades **és** el nom —«Carros de Foc Plus» als dos camps—
 * i enganxar-los donava `carros-de-foc-plus-carros-de-foc-plus`. Si el codi ja
 * és dins del nom, el nom sol.
 */
function slugOf(ref: string | null, name: string): string {
  const fold = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '');
  if (!ref || fold(name).includes(fold(ref))) return slugify(name);
  return slugify(`${ref} ${name}`);
}

/** Els trossos de línia d'una relació, cada un amb els seus punts. */
function linesOf(rel: OsmRelationGeom): Array<Array<{ lat: number; lon: number }>> {
  return (rel.members ?? [])
    .filter((m) => m.type === 'way' && m.geometry && m.geometry.length > 1)
    .map((m) => m.geometry as Array<{ lat: number; lon: number }>);
}

/**
 * Els metres d'un itinerari, sumant tram a tram.
 *
 * Se sumen les longituds de cada via i no es prova de posar-les en ordre: per a
 * la longitud total dona el mateix, i endreçar les vies d'una relació que a
 * OSM pot venir partida, repetida o amb branques és una feina que aquí no
 * caldria per a res.
 */
function lengthM(lines: Array<Array<{ lat: number; lon: number }>>): number {
  let total = 0;
  for (const line of lines) {
    for (let i = 1; i < line.length; i++) {
      total += distanceM(line[i - 1].lat, line[i - 1].lon, line[i].lat, line[i].lon);
    }
  }
  return total;
}

/**
 * Tolerància amb què es simplifica el traçat que es publica.
 *
 * Vint metres: a l'escala a la qual es dibuixa un itinerari sencer —vint-i-sis
 * quilòmetres en uns sis-cents píxels, o sigui uns quaranta metres per píxel—
 * no es veu, i estalvia la meitat llarga dels nodes d'OSM.
 */
const TRACE_TOL_M = 20;

/**
 * Quina part de la longitud ha d'entrar a la cadena per publicar-ne el perfil.
 *
 * Un perfil és l'altura contra la distància recorreguda. Si les vies no cusen
 * —relacions amb branques, amb forats o amb trams repetits— la distància no
 * vol dir res i el dibuix seria una serra inventada. Per sota d'això no n'hi
 * ha, i la fitxa ho diu.
 */
const PROFILE_MIN_COVERED = 0.95;

/** Un punt cada `SAMPLE_M` metres, per no demanar una cota per node. */
function samples(lines: Array<Array<{ lat: number; lon: number }>>): Array<{ lat: number; lon: number }> {
  const out: Array<{ lat: number; lon: number }> = [];
  let since = SAMPLE_M;

  for (const line of lines) {
    for (let i = 0; i < line.length; i++) {
      if (i > 0) {
        since += distanceM(line[i - 1].lat, line[i - 1].lon, line[i].lat, line[i].lon);
      }
      if (since >= SAMPLE_M) {
        out.push(line[i]);
        since = 0;
      }
    }
  }
  return out;
}

/**
 * Les vies d'una relació, posades en fila.
 *
 * A OSM una relació d'itinerari és **un sac de vies sense ordre**: poden venir
 * girades, repetides, partides o amb branques. Per a la longitud total dona
 * igual —`lengthM()` només suma— però per a un perfil d'alçades no: un perfil
 * és l'altura contra la distància **recorreguda**, i sense ordre aquesta
 * distància no vol dir res.
 *
 * Es cusen pels extrems: es tria una via, es busca la que hi comença o hi
 * acaba, i s'hi enganxa girant-la si cal. El que queda fora de la cadena més
 * llarga no s'hi força.
 *
 * Torna la cadena i **quina part de la longitud total hi ha entrat**. Qui ho
 * cridi decideix: per sota d'un llindar, aquell itinerari no té perfil, i
 * val més no tenir-ne que tenir-ne un que salta d'un tros a l'altre.
 */
function stitch(lines: Array<Array<{ lat: number; lon: number }>>): {
  chain: Array<{ lat: number; lon: number }>;
  covered: number;
} {
  const total = lengthM(lines);
  if (!lines.length || total === 0) return { chain: [], covered: 0 };

  // Els extrems s'igualen amb una tolerància: OSM no repeteix el mateix node
  // entre dues vies sempre, i quatre decimals són uns onze metres.
  const key = (p: { lat: number; lon: number }) => `${p.lat.toFixed(4)},${p.lon.toFixed(4)}`;

  const pending = lines.map((l) => l.slice());
  const used = new Set<number>();

  let best: Array<{ lat: number; lon: number }> = [];

  for (let seed = 0; seed < pending.length; seed++) {
    if (used.has(seed)) continue;

    const taken = new Set<number>([seed]);
    let chain = pending[seed].slice();

    let grew = true;
    while (grew) {
      grew = false;
      for (let i = 0; i < pending.length; i++) {
        if (taken.has(i)) continue;
        const w = pending[i];
        const head = key(chain[0]);
        const tail = key(chain[chain.length - 1]);
        const a = key(w[0]);
        const b = key(w[w.length - 1]);

        if (tail === a) chain = chain.concat(w.slice(1));
        else if (tail === b) chain = chain.concat(w.slice(0, -1).reverse());
        else if (head === b) chain = w.slice(0, -1).concat(chain);
        else if (head === a) chain = w.slice(1).reverse().concat(chain);
        else continue;

        taken.add(i);
        grew = true;
      }
    }

    if (lengthM([chain]) > lengthM([best])) {
      best = chain;
      for (const i of taken) used.add(i);
    }
  }

  return { chain: best, covered: total > 0 ? lengthM([best]) / total : 0 };
}

/** Douglas-Peucker sobre metres, per no publicar cada node d'OSM. */
function simplify(
  line: Array<{ lat: number; lon: number }>, tolM: number,
): Array<{ lat: number; lon: number }> {
  if (line.length < 3) return line;

  /*
   * Es passa a un pla local en metres i s'hi fa la distància punt-recta.
   *
   * Barrejar graus i metres en la mateixa expressió és el camí curt a una
   * tolerància que no vol dir res: un grau de longitud a Catalunya són uns 82
   * km i un de latitud, 111. Amb l'origen a la primera parella i el cosinus de
   * la seva latitud, la deformació dins d'un itinerari és irrellevant.
   */
  const lat0 = (line[0].lat * Math.PI) / 180;
  const kx = 111_320 * Math.cos(lat0);
  const ky = 110_540;
  const X = (p: { lon: number }) => (p.lon - line[0].lon) * kx;
  const Y = (p: { lat: number }) => (p.lat - line[0].lat) * ky;

  const perp = (
    p: { lat: number; lon: number },
    a: { lat: number; lon: number },
    b: { lat: number; lon: number },
  ) => {
    const [px, py] = [X(p), Y(p)];
    const [ax, ay] = [X(a), Y(a)];
    const [bx, by] = [X(b), Y(b)];
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy);
    if (len === 0) return Math.hypot(px - ax, py - ay);
    return Math.abs(dy * px - dx * py + bx * ay - by * ax) / len;
  };

  const keep = new Array<boolean>(line.length).fill(false);
  keep[0] = true;
  keep[line.length - 1] = true;

  const stack: Array<[number, number]> = [[0, line.length - 1]];
  while (stack.length) {
    const [i0, i1] = stack.pop() as [number, number];
    let far = -1;
    let maxD = tolM;
    for (let i = i0 + 1; i < i1; i++) {
      const d = perp(line[i], line[i0], line[i1]);
      if (d > maxD) { maxD = d; far = i; }
    }
    if (far > 0) {
      keep[far] = true;
      stack.push([i0, far], [far, i1]);
    }
  }
  return line.filter((_, i) => keep[i]);
}

async function main() {
  // ── 1. Les etiquetes de totes les rutes a peu ────────────────────────────
  const tagsQuery = `[out:json][timeout:200];
area["ISO3166-2"="ES-CT"]["admin_level"="4"]->.a;
relation(area.a)["route"~"^(hiking|foot)$"];
out tags;`;
  const all = await overpass(tagsQuery, 'osm-routes/tags.json');

  const wanted = all.elements.filter(
    (r) => r.tags?.name && r.tags.network && NETWORKS.has(r.tags.network),
  );
  console.log(`Rutes a peu a Catalunya: ${all.elements.length}`);
  console.log(`Senyalitzades amb nom (nwn + rwn): ${wanted.length}\n`);

  // ── 2. La geometria, en lots ─────────────────────────────────────────────
  const ids = wanted.map((r) => r.id);
  const geoms = new Map<number, OsmRelationGeom>();

  for (let i = 0; i < ids.length; i += BATCH) {
    const chunk = ids.slice(i, i + BATCH);
    const file = `osm-routes/geom-${chunk[0]}.json`;
    const cached = existsSync(raw(file));

    const query = `[out:json][timeout:200];\nrel(id:${chunk.join(',')});\nout geom;`;
    const batch = await overpass(query, file);
    for (const el of batch.elements) if (el.type === 'relation') geoms.set(el.id, el);

    process.stdout.write(
      `\r  geometria: ${Math.min(i + BATCH, ids.length)}/${ids.length}`
      + `${cached ? ' (del disc)' : ''}          `,
    );
    // Overpass és gratuït i compartit. Si el lot ha vingut del disc no hi ha
    // res a esperar; si l'hem demanat, se li dona aire.
    if (!cached) await sleep(2_000);
  }
  process.stdout.write('\n\n');

  // ── 3. Territori, per situar cada itinerari ──────────────────────────────
  const municipis = (JSON.parse(readFileSync(build('locations.json'), 'utf8')) as BuildLocation[])
    .filter((l) => l.published && l.level === 'municipi' && l.lat != null && l.lon != null);

  interface ComarcaFeature {
    properties: { code: string; name: string };
    geometry: { type: string; coordinates: number[][][] | number[][][][] };
  }
  const comarques = (JSON.parse(
    readFileSync(build('geo', 'comarques.geojson'), 'utf8'),
  ) as { features: ComarcaFeature[] }).features.map((f) => {
    // MultiPolygon i Polygon: es queden tots els anells exteriors amb el seu bbox.
    const polys = f.geometry.type === 'MultiPolygon'
      ? (f.geometry.coordinates as number[][][][]).map((p) => p[0])
      : [(f.geometry.coordinates as number[][][])[0]];
    return {
      code: f.properties.code,
      rings: polys.map((ring) => {
        const r = ring as Array<[number, number]>;
        return { ring: r, bbox: ringBbox(r) };
      }),
    };
  });

  const comarcaOf = (lat: number, lon: number): string | null => {
    for (const c of comarques) {
      for (const { ring, bbox } of c.rings) {
        if (lon < bbox[0] || lon > bbox[2] || lat < bbox[1] || lat > bbox[3]) continue;
        if (pointInRing(lon, lat, ring)) return c.code;
      }
    }
    return null;
  };

  const nearestOf = (lat: number, lon: number) => {
    let best: { l: BuildLocation; d: number } | null = null;
    for (const l of municipis) {
      const d = distanceM(lat, lon, l.lat as number, l.lon as number) / 1000;
      if (!best || d < best.d) best = { l, d };
    }
    if (!best || best.d > 25) return null;
    return { id: best.l.id, nom: best.l.nom, path: best.l.path, distKm: Math.round(best.d * 10) / 10 };
  };

  // ── 4. Cada itinerari ───────────────────────────────────────────────────
  const dem = createDem(DEM_ZOOM);
  const routes: Route[] = [];
  const dropped: string[] = [];
  const disagree: string[] = [];
  /*
   * La geometria va per `osmId`, **no pel slug**.
   *
   * El slug encara no és el definitiu quan es fa aquest bucle: dues relacions
   * amb el mateix nom en produeixen un d'igual, i el desempat —afegir-hi
   * l'identificador d'OSM— es fa al final, sobre `routes`. Calculant-lo aquí
   * una segona vegada sortia el de sempre, i el fitxer del segon «Camí de Sant
   * Jaume» —232,9 km— va sobreescriure el del primer, de 3,6. La fitxa curta
   * ensenyava el traçat del llarg i l'altra es quedava sense fitxer, tot amb
   * l'execució en verd.
   *
   * La regla que se'n treu: una clau derivada es calcula **un cop**; qui la
   * necessiti, la busca, no la torna a derivar.
   */
  const geometry: Array<{
    osmId: number;
    trace: Array<Array<[number, number]>>;
    profile: Array<[number, number]> | null;
    profileCovered: number;
  }> = [];
  let done = 0;

  for (const rel of wanted) {
    const geom = geoms.get(rel.id);
    const lines = geom ? linesOf(geom) : [];
    const tags = rel.tags as OsmTags;

    if (!lines.length) {
      dropped.push(`${tags.name}: la relació no porta geometria`);
      continue;
    }

    const metres = lengthM(lines);
    if (metres < MIN_LENGTH_M) {
      dropped.push(`${tags.name}: ${(metres / 1000).toFixed(1)} km, massa curt`);
      continue;
    }

    const pts = samples(lines);
    const heights: number[] = [];
    for (const p of pts) {
      const h = await dem.elevationAt(p.lat, p.lon);
      if (h != null) heights.push(h);
    }

    // Les comarques, mostrejades i sense repetir. De passada surt quina part
    // de l'itinerari cau dins del territori.
    const crossed: string[] = [];
    let inside = 0;
    for (const p of pts) {
      const c = comarcaOf(p.lat, p.lon);
      if (!c) continue;
      inside++;
      if (!crossed.includes(c)) crossed.push(c);
    }
    const insideShare = pts.length ? inside / pts.length : 0;

    if (insideShare < MIN_INSIDE) {
      dropped.push(
        `${tags.name}: només un ${Math.round(insideShare * 100)} % cau a Catalunya`,
      );
      continue;
    }

    /*
     * El traçat i el perfil, que van al fitxer d'aquest itinerari.
     *
     * El traçat es dibuixa via a via i per tant no li cal cap ordre: cada una
     * és un `M` del seu camí. El perfil sí que en necessita, i per això es
     * cusen els extrems; el que no cus prou, no en té.
     */
    const trace = lines.map((l) => simplify(l, TRACE_TOL_M));
    const { chain, covered } = stitch(lines);

    /*
     * La distància s'acumula sobre **tota** la cadena, no d'una mostra a
     * l'altra.
     *
     * Sumant de mostra a mostra, cada revolt entre dues es queda pel camí: a
     * l'Anella Verda de Vic, un itinerari de 26,2 km sortia amb un perfil que
     * s'acabava als 23,5. Un eix que no arriba on diu el titular fa dubtar dels
     * dos números.
     */
    let profile: Array<[number, number]> | null = null;
    if (covered >= PROFILE_MIN_COVERED && chain.length > 1) {
      const walked: Array<[number, number]> = [];
      let run = 0;
      let since = SAMPLE_M;
      for (let i = 0; i < chain.length; i++) {
        if (i > 0) {
          const step = distanceM(chain[i - 1].lat, chain[i - 1].lon, chain[i].lat, chain[i].lon);
          run += step;
          since += step;
        }
        // L'últim punt hi entra sempre: és on s'acaba l'itinerari.
        if (since >= SAMPLE_M || i === chain.length - 1) {
          const h = await dem.elevationAt(chain[i].lat, chain[i].lon);
          if (h != null) walked.push([Math.round(run), Math.max(0, Math.round(h))]);
          since = 0;
        }
      }
      if (walked.length > 3) profile = walked;
    }

    /*
     * La cadena és un subconjunt de les vies, així que mai no pot ser més
     * llarga que totes juntes. Si algun dia ho és, el cosit s'ha menjat la
     * cua i el perfil seria una invenció: val més aturar-se.
     */
    if (covered > 1.02) {
      throw new Error(
        `${tags.name}: la cadena cosida fa un ${Math.round(covered * 100)} % de la longitud total`,
      );
    }

    geometry.push({
      osmId: rel.id,
      trace: trace.map((l) => l.map((q) => [
        Math.round(q.lat * 1e5) / 1e5, Math.round(q.lon * 1e5) / 1e5,
      ] as [number, number])),
      profile,
      profileCovered: Math.round(covered * 100) / 100,
    });

    const km = Math.round((metres / 1000) * 10) / 10;
    const tagged = tags.distance ? Number(tags.distance.replace(',', '.')) : null;
    const taggedOk = tagged != null && Number.isFinite(tagged) && tagged > 0;
    if (taggedOk && Math.abs(tagged - km) > km * 0.25) {
      disagree.push(`${tags.name}: geometria ${km} km, etiqueta ${tagged} km`);
    }

    /*
     * L'inici, i que sigui de dins.
     *
     * Una relació pot començar a l'altra banda de la frontera —la del Canigó ho
     * fa— i llavors la predicció i el municipi més proper sortirien de fora.
     * Es tria el primer punt de mostreig que cau a Catalunya.
     */
    const start = pts.find((p) => comarcaOf(p.lat, p.lon) != null) ?? lines[0][0];
    routes.push({
      osmId: rel.id,
      slug: slugOf(tags.ref ?? null, tags.name),
      name: tags.name,
      ref: tags.ref ?? null,
      network: tags.network,
      km,
      kmTagged: taggedOk ? tagged : null,
      /*
       * La cota mínima no baixa de zero.
       *
       * Un camí senyalitzat de Catalunya no va per sota del nivell del mar, i
       * el model en dona valors com −4 m als trams de vora la platja: és el
       * soroll d'interpolar entre el terreny i la batimetria. Publicar
       * «−4–966 m» fa dubtar de tota la fila.
       */
      minM: heights.length ? Math.max(0, Math.round(Math.min(...heights))) : null,
      maxM: heights.length ? Math.round(Math.max(...heights)) : null,
      ascentM: tags.ascent && Number.isFinite(Number(tags.ascent)) ? Math.round(Number(tags.ascent)) : null,
      roundtrip: tags.roundtrip === 'yes' ? true : tags.roundtrip === 'no' ? false : null,
      from: tags.from ?? null,
      to: tags.to ?? null,
      website: tags.website ?? null,
      operator: tags.operator ?? null,
      comarques: crossed,
      insideShare: Math.round(insideShare * 100) / 100,
      start: { lat: start.lat, lon: start.lon },
      nearest: nearestOf(start.lat, start.lon),
    });

    done++;
    if (done % 20 === 0) {
      const s = dem.stats();
      process.stdout.write(
        `\r  itineraris: ${done}/${wanted.length} · tessel·les ${s.downloaded} baixades,`
        + ` ${s.fromDisk} del disc     `,
      );
    }
  }
  process.stdout.write('\n');

  // Slugs repetits: dues rutes amb el mateix nom compartirien adreça.
  const seen = new Map<string, number>();
  for (const r of routes) {
    const prev = seen.get(r.slug);
    if (prev != null) r.slug = `${r.slug}-${r.osmId}`;
    else seen.set(r.slug, r.osmId);
  }

  /*
   * Primer els que porten codi senyalitzat, que són els que la gent busca pel
   * codi, i amb els números com a números: «GR 2» va abans de «GR 11», que amb
   * una comparació de text quedaria al revés.
   */
  routes.sort((a, b) => {
    if (!!a.ref !== !!b.ref) return a.ref ? -1 : 1;
    const byRef = (a.ref ?? '').localeCompare(b.ref ?? '', 'ca', { numeric: true });
    return byRef || a.name.localeCompare(b.name, 'ca');
  });

  // ── 5. Informe i sortida ────────────────────────────────────────────────
  if (dropped.length) {
    console.log(`\nFora (${dropped.length}):`);
    for (const d of dropped.slice(0, 12)) console.log(`  ${d}`);
    if (dropped.length > 12) console.log(`  …i ${dropped.length - 12} més`);
  }
  if (disagree.length) {
    console.log(`\nLa geometria i l'etiqueta no diuen el mateix (${disagree.length}):`);
    for (const d of disagree.slice(0, 8)) console.log(`  ${d}`);
    if (disagree.length > 8) console.log(`  …i ${disagree.length - 8} més`);
  }

  const withHeight = routes.filter((r) => r.minM != null).length;
  const s = dem.stats();
  console.log(
    `\n${routes.length} itineraris · ${withHeight} amb cota`
    + ` · ${routes.filter((r) => r.ascentM != null).length} amb desnivell d'OSM`,
  );
  console.log(
    `Model d'elevació: ${s.requested} punts · ${s.downloaded} tessel·les baixades,`
    + ` ${s.fromDisk} del disc, ${s.failed} fallades`,
  );

  const byNet = new Map<string, number>();
  for (const r of routes) byNet.set(r.network, (byNet.get(r.network) ?? 0) + 1);
  console.log(`Per xarxa: ${[...byNet].map(([n, c]) => `${n}=${c}`).join(' · ')}`);

  const dest = build('routes.json');
  writeFileSync(dest, JSON.stringify({
    builtAt: new Date().toISOString(),
    source: 'OpenStreetMap',
    license: 'ODbL 1.0',
    demZoom: DEM_ZOOM,
    sampleM: SAMPLE_M,
    routes,
  }, null, 1), 'utf8');
  console.log(`\n→ data/build/routes.json (${(readFileSync(dest).length / 1024).toFixed(0)} kB)`);

  // Un fitxer per itinerari: només el llegeix la seva fitxa. El nom surt de
  // `routes`, que és on el slug ja està desempatat.
  mkdirSync(build('routes'), { recursive: true });
  const slugOfId = new Map(routes.map((r) => [r.osmId, r.slug]));
  let bytes = 0;
  let withProfile = 0;
  const written = new Set<string>();
  for (const g of geometry) {
    const slug = slugOfId.get(g.osmId);
    if (!slug) throw new Error(`geometria sense itinerari a l'índex: osm ${g.osmId}`);
    if (written.has(slug)) throw new Error(`dues geometries per al mateix slug: ${slug}`);
    written.add(slug);
    const body = JSON.stringify({ slug, ...g });
    writeFileSync(build('routes', `${slug}.json`), body, 'utf8');
    bytes += body.length;
    if (g.profile) withProfile++;
  }
  // Cap itinerari sense el seu fitxer: la fitxa el llegeix sense preguntar.
  const orphan = routes.filter((r) => !written.has(r.slug));
  if (orphan.length) {
    throw new Error(`${orphan.length} itineraris sense geometria: ${orphan.slice(0, 3).map((r) => r.slug).join(', ')}`);
  }
  console.log(`→ data/build/routes/ · ${geometry.length} fitxers, ${(bytes / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  amb perfil d'alçades: ${withProfile} de ${geometry.length}`
    + ` (la resta, vies que no cusen prou)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
