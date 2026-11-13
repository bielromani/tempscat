/**
 * ¿Queda catalán en el castellano?
 *
 * ## Por qué hace falta
 *
 * Porque una cadena sin traducir no da ningún error: sale en catalán y la
 * página se ve entera. La traducción es aditiva —`tr(lang, ca, es)` en cada
 * sitio— y basta con que un componente no reciba el `lang` para que escriba
 * catalán dentro de una página en castellano. Ninguna prueba lo ve, porque las
 * pruebas miran funciones y esto sale de **juntar** un componente con la página
 * que no le pasa el idioma. Así que va contra el HTML servido, como
 * `check:coherence`.
 *
 * ## Qué busca
 *
 * Palabras que en castellano no existen —«amb», «dels», «avui», «pluja»,
 * «estació»—, apóstrofos catalanes («l'», «d'») y «Catalunya», que en
 * castellano es «Cataluña». Las busca en el texto que se lee y también en
 * `alt`, `aria-label`, `title`, `placeholder` y la descripción: un lector de
 * pantalla las lee igual.
 *
 * ## Los nombres propios no cuentan
 *
 * Los topónimos no se traducen, y muchos llevan palabras que aquí cuentan como
 * catalanas: «Sant Joan de les Abadesses», «Camí dels Bons Homes», «Barcelona -
 * el Raval». Antes de buscar, se quitan del texto **todos los nombres que el
 * propio web conoce**: los lugares, las estaciones, las comarcas, los barrios y
 * los itinerarios de `data/build/`, y las playas, embalses, estaciones de esquí
 * y cámaras de `data/cache/`. Lo que queda después, y no está en `ALLOW`, es
 * texto sin traducir.
 *
 *     npm run check:castella
 *     npm run check:castella -- http://es.localhost:3000
 *     npm run check:castella -- https://es.tempscat.cat
 *
 * También vale `CASTELLA_BASE`. Sale con código 1 si encuentra algo.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? process.env.CASTELLA_BASE ?? 'http://es.localhost:3000')
  .replace(/\/$/, '');
const verbose = args.includes('--verbose');

/** Una ficha de cada nivel y todas las páginas de sección. */
const PAGES = [
  '/',
  '/maresme/malgrat-de-mar',
  '/baix-llobregat/el-prat-de-llobregat',
  '/conca-de-barbera/montblanc/lilla',
  '/barcelones/badalona/canyet',
  '/maresme',
  '/alt-urgell',
  '/radar',
  '/mapa',
  '/avisos',
  '/avisos/alertes',
  '/widget',
  // El widget sencer, amb les dades de prova: és l'únic lloc on surten avisos i banderes a la força.
  '/widget/maresme/malgrat-de-mar?format=targeta&mostra=avisos,hores,pluja,vent,humitat,uv,sol,aire,mar,bandera&dies=7&prova=1',
  '/widget/ripolles/queralbs?format=apaisat&mostra=avisos,pluja,vent,muntanya,neu&dies=5&prova=1',
  '/estacions',
  '/ranquings',
  '/mar',
  '/nautica',
  '/neu',
  '/aigua',
  '/aire',
  '/senderisme',
  '/senderisme/rutes',
  '/cameres',
  '/dades',
  '/dades/encert',
  '/estat',
  '/cerca?q=prat',
  '/privacitat',
  '/avis-legal',
  '/no-existeix',
  '/avisos/feed',
  '/avisos/feed/bages',
];

/**
 * Las páginas de detalle que no tienen una dirección fija: la primera que
 * enlaza su lista. Una estación, una cámara, un itinerario.
 */
const DETAIL_FROM: Array<[string, RegExp]> = [
  ['/estacions', /href="(\/estacions\/[A-Z0-9]{2})"/],
  ['/cameres', /href="(\/cameres\/[a-z0-9-]+)"/],
  ['/senderisme/rutes', /href="(\/senderisme\/rutes\/[a-z0-9-]+)"/],
];

/**
 * Palabras catalanas que en castellano no existen. En minúscula: se compara
 * contra el texto ya pasado a minúscula, así que «Avui» también cuenta.
 *
 * Quedan fuera las que también son castellanas o casi —«mar», «sol», «tarda»
 * no, pero «tarde» sí lo es; «comarca», «clima», «hora»— y las que solo se
 * distinguen por el acento, que darían más ruido que información.
 */
const CATALAN = new Set([
  // Función
  'amb', 'dels', 'les', 'els', 'als', 'pels', 'aquest', 'aquesta', 'aquests', 'aquestes', 'això',
  'també', 'però', 'més', 'només', 'què', 'quan', 'quin', 'quina', 'quins', 'quines', 'fins', 'sense',
  'segons', 'cap', 'molt', 'molts', 'poc', 'gaire', 'encara', 'ja', 'hi', 'ho', 'són', 'és',
  'seva', 'seu', 'seus', 'vostre', 'vostra', 'podeu', 'consulteu', 'vegeu', 'feu', 'teniu', 'mentre',
  'perquè', 'doncs', 'sota', 'dins', 'fora', 'damunt', 'darrere', 'abans', 'després', 'ara',
  // El temps
  'avui', 'demà', 'ahir', 'matí', 'vespre', 'nit', 'migdia', 'mitjanit', 'matinada', 'setmana', 'dia', 'dies',
  'hores', 'plou', 'ploure', 'plogut', 'pluja', 'pluges', 'ruixat', 'ruixats', 'plugim', 'xàfec', 'tempesta',
  'tempestes', 'neu', 'nevada', 'boira', 'vent', 'vents', 'ratxa', 'ratxes', 'núvols', 'nuvolositat', 'cel',
  'serè', 'ennuvolat', 'humitat', 'pressió', 'sensació', 'gelada', 'glaçada', 'fred', 'lluna',
  'sortida', 'estiu', 'hivern', 'tardor',
  // El web
  'estació', 'estacions', 'previsió', 'predicció', 'observació', 'mesurat', 'mesurada', 'dades',
  'dada', 'municipis', 'comarques', 'nucli', 'nuclis', 'barri', 'barris', 'fitxa', 'itinerari', 'itineraris',
  'platja', 'platges', 'onatge', 'onada', 'embassament', 'embassaments', 'aigua', 'qualitat', 'avís',
  'navegació', 'cercar', 'tancar', 'obrir', 'veure', 'tornar', 'següent', 'lloc', 'llocs', 'poble', 'pobles',
  'temps', 'sempre', 'mai', 'gairebé', 'força', 'feble', 'febles', 'forta', 'fortes', 'moderat', 'vegada',
  'vegades',
  // Mesos i dies: «octubre» i «abril» també són castellans.
  'gener', 'febrer', 'març', 'maig', 'juny', 'juliol', 'agost', 'setembre', 'novembre', 'desembre',
  'dilluns', 'dimarts', 'dimecres', 'dijous', 'divendres', 'dissabte', 'diumenge',
  'mòbil', 'càmera', 'càmeres', 'rànquing', 'rànquings', 'rècord', 'rècords', 'graus',
  'habitants', 'pròxim', 'pròxims', 'pròximes', 'últim', 'darrer', 'darrera',
  'catalunya',
]);

/**
 * Lo que sí puede salir, con su porqué. Se quita del texto antes de buscar.
 *
 * Los nombres de organismos y fuentes no se traducen (docs/14).
 */
const ALLOW: Array<[RegExp, string]> = [
  [/Servei Meteorològic de Catalunya/g, 'nombre propio del Meteocat'],
  [/Agència Catalana de l['’]Aigua/g, 'nombre propio de la ACA'],
  [/Protecció Civil/g, 'nombre propio'],
  [/Ferrocarrils de la Generalitat de Catalunya/g, 'nombre propio de FGC'],
  [/Generalitat de Catalunya/g, 'nombre propio'],
  [/Institut Cartogràfic i Geològic de Catalunya/g, 'nombre propio del ICGC'],
  [/Ajuntament de Barcelona/g, 'nombre propio'],
  [/Xarxa d['’]Estacions Meteorològiques Automàtiques/g, 'el nombre de la XEMA, que se cita como tal'],
  [/Xarxa de Vigilància i Previsió de la Contaminació Atmosfèrica/g, 'el nombre de la XVPCA'],
  [/\bCatalà\b/g, 'el selector de idioma: el catalán se nombra en catalán'],
  [/tempscat(\.cat)?/gi, 'la marca'],
  [/\btemps cat\b/gi, 'la marca, tal como sale del logotipo (Temps<b>Cat</b>): dos palabras en dos colores'],
  [/Pla territorial[^.]*?(?=[.,)])/g, 'el nombre del Pla territorial general de Catalunya'],
  [/\bMeteoalerta\b/g, 'nombre propio del plan de AEMET'],
  [/Terres de l'Ebre/g, 'nombre propio de un ámbito territorial, como «Penedès» o «Ponent»'],
  [/\bCAP\b/g, 'el formato de los avisos, Common Alerting Protocol'],
  [/«Webcams dels equipaments turístics»/g, 'el título del conjunto de datos de FGC, citado'],
  [/\{nucli\}/g, 'un parámetro de una dirección de la API, que es la misma en las dos lenguas'],
  [/\/\s*api\s*\/\s*lloc\b/g, 'la dirección de la API, que es la misma en las dos lenguas'],
  [/\bse les\b/g, '«les» también es un pronombre castellano'],
];

/**
 * Las claves de los ficheros de datos donde vive un nombre propio.
 *
 * `basin` es la cuenca de un aforo: «Rieres del Cap de Begur-Blanes».
 */
const NAME_KEYS = new Set([
  'nom', 'name', 'nomIndexat', 'municipi', 'municipiNom', 'comarcaNom', 'ciutat', 'emplacament',
  'title', 'resort', 'station', 'stationName', 'municipality', 'beach', 'river', 'reservoir', 'label',
  'basin',
]);

/** El territorio, que se versiona y está siempre en el disco. */
const BUILD = [
  'data/build/locations.json', 'data/build/stations.json', 'data/build/comarques.json',
  'data/build/barris.json', 'data/build/routes.json',
];

/**
 * Los datos vivos con nombres dentro. Con `DATA_BASE_URL` —el `.env.local` que
 * usa el servidor de desarrollo— se leen del almacén, que es de donde los lee
 * la página: el disco puede tener una instantánea de hace semanas, con otras
 * estaciones de aire y otras cámaras.
 */
const LIVE = ['sea', 'water', 'muntanya', 'cameres', 'air-stations'];

async function collectNames(): Promise<string[]> {
  const root = process.cwd();
  const docs: unknown[] = [];
  for (const f of BUILD) {
    const p = join(root, f);
    if (existsSync(p)) docs.push(JSON.parse(readFileSync(p, 'utf8')));
  }
  const remote = process.env.DATA_BASE_URL?.replace(/\/$/, '');
  for (const name of LIVE) {
    const p = join(root, 'data/cache', `${name}.json`);
    if (remote) {
      const res = await fetch(`${remote}/${name}.json`).catch(() => null);
      if (res?.ok) { docs.push(await res.json()); continue; }
    }
    if (existsSync(p)) docs.push(JSON.parse(readFileSync(p, 'utf8')));
  }
  const out = new Set<string>();
  const walk = (v: unknown, key: string | null, depth: number) => {
    if (depth > 8 || v == null) return;
    if (typeof v === 'string') {
      if (key && NAME_KEYS.has(key) && v.length >= 3 && v.length <= 160) out.add(v);
      return;
    }
    if (Array.isArray(v)) { for (const x of v) walk(x, key, depth + 1); return; }
    if (typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
        // Los contornos no tienen nombres y son la mayor parte del peso.
        if (k === 'rings' || k === 'geometry' || k === 'coords') continue;
        walk(x, k, depth + 1);
      }
    }
  };
  for (const d of docs) walk(d, null, 0);
  /*
   * Y los trozos, porque la página no siempre enseña el nombre entero: el aforo
   * «Aforament - Guixers (Aigua de Valls)» sale como «Guixers (Aigua de Valls)»,
   * y un itinerario con «<=>» sale con «↔».
   */
  for (const n of [...out]) {
    for (const part of n.split(/\s+-\s+|[()«»"<>=↔:.,;/]+/)) {
      const p = part.trim();
      if (p.length >= 4) out.add(p);
    }
  }
  return [...out];
}

/** Del HTML al texto: lo que se lee y lo que se oye. */
function textOf(html: string): string {
  const attrs = [...html.matchAll(/\s(?:alt|aria-label|title|placeholder)="([^"]*)"/g)].map((m) => m[1]);
  const description = [...html.matchAll(/<meta name="description" content="([^"]*)"/g)].map((m) => m[1]);
  const body = html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    // El texto oficial de AEMET va con `lang="es"`, y el del idioma que no es
    // el de la página —el enlace «Català»— con el suyo.
    .replace(/<[^>]+lang="ca"[^>]*>[\s\S]*?<\/[a-z]+>/g, ' ')
    .replace(/<!\[CDATA\[|\]\]>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  return [body, ...attrs, ...description].join(' \n ')
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#xa0;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ');
}

const WORD = /[\p{L}'·]+/gu;

function capFirst(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

/** Los nombres que tapan algo: los que llevan una palabra de la lista, un apóstrofo o una ele geminada. */
function namesThatMatter(all: string[]): string[] {
  const keep = all.filter((n) => /['’·]/.test(n)
    || (n.toLowerCase().match(WORD) ?? []).some((w) => CATALAN.has(w)));
  const variants = new Set<string>();
  for (const n of keep) {
    const plain = n.replace(/’/g, "'");
    variants.add(plain);
    variants.add(capFirst(plain));
  }
  // El más largo primero: «Sant Joan de les Abadesses» antes que «les Abadesses».
  return [...variants].sort((a, b) => b.length - a.length);
}

function hitsOf(text: string, names: string[]): string[] {
  let t = text;
  for (const [re] of ALLOW) t = t.replace(re, ' ');
  for (const n of names) if (t.includes(n)) t = t.split(n).join(' ');
  const out: string[] = [];
  for (const m of t.matchAll(WORD)) {
    const w = m[0].toLowerCase().replace(/^'+|'+$/g, '');
    const apostrophe = /^(l|d|s|n|m)'\p{L}/u.test(w);
    // La ele geminada, «l·l», no existe en castellano.
    const geminada = /\p{L}·\p{L}/u.test(w);
    if (!CATALAN.has(w) && !apostrophe && !geminada) continue;
    const i = m.index ?? 0;
    out.push(`«${m[0]}» … ${t.slice(Math.max(0, i - 45), i + m[0].length + 45).trim()}`);
  }
  return out;
}

/**
 * `es.localhost` el navegador y curl lo resuelven solos, pero el `fetch` de
 * Node pregunta al DNS del sistema y en Windows no existe. Para un
 * `*.localhost` se va a 127.0.0.1 con el `Host` puesto a mano, que es lo que
 * lee `next.config.ts` para elegir el idioma.
 */
function get(path: string): Promise<{ status: number; html: string }> {
  const url = new URL(base + path);
  if (!url.hostname.endsWith('.localhost')) {
    return fetch(url, { headers: { 'user-agent': 'tempscat-check' }, redirect: 'follow' })
      .then(async (res) => ({ status: res.status, html: await res.text() }));
  }
  return new Promise((resolve, reject) => {
    const req = httpRequest({
      host: '127.0.0.1',
      port: url.port || 80,
      path: url.pathname + url.search,
      headers: { host: url.host, 'user-agent': 'tempscat-check' },
    }, (res) => {
      // Las redirecciones se siguen dentro del mismo dominio.
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, url);
        resolve(get(next.pathname + next.search));
        return;
      }
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, html: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end();
  });
}

const names = namesThatMatter(await collectNames());
const pages = [...PAGES];
for (const [list, re] of DETAIL_FROM) {
  const { html } = await get(list);
  const m = re.exec(html);
  if (m && !pages.includes(m[1])) pages.push(m[1]);
}

let total = 0;
for (const page of [...new Set(pages)]) {
  const { status, html } = await get(page);
  // La 404 es una página como las otras: la de una dirección inexistente.
  if (status >= 400 && page !== '/no-existeix') {
    console.error(`✗ ${page} · HTTP ${status}`);
    total++;
    continue;
  }
  const found = hitsOf(textOf(html), names);
  total += found.length;
  if (!found.length) { console.log(`✓ ${page}`); continue; }
  console.log(`✗ ${page} · ${found.length}`);
  for (const f of verbose ? found : found.slice(0, 25)) console.log(`    ${f}`);
  if (!verbose && found.length > 25) console.log(`    … y ${found.length - 25} más (--verbose)`);
}

console.log(total ? `\n${total} restos de catalán en ${base}` : `\nSin catalán en ${base}`);
process.exit(total ? 1 : 0);
