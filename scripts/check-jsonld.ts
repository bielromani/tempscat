/**
 * ¿Sigue siendo válido el marcado estructurado de cada tipo de página?
 *
 * ## Por qué esto no es una prueba unitaria
 *
 * Porque lo que puede romperse no es el constructor —ese cabe en veinte líneas
 * y se lee de un vistazo— sino **que una página deje de llevarlo**. Un bloque
 * de `JSON-LD` no se ve, no da error y no rompe ninguna prueba: el día que
 * alguien reordene un `<article>` y el bloque se quede fuera, la página seguirá
 * saliendo igual de bien. Por eso se comprueba contra el HTML servido y por
 * tipo de página, no contra la función.
 *
 * Es la misma clase de fallo que ya costó tener las 4.293 canónicas apuntando a
 * un dominio ajeno: invisible en la pantalla y grave en el índice.
 *
 * ## Y qué comprueba además de que exista
 *
 * Que cada `item` de una miga de pan sea **una dirección absoluta**. Estuvo
 * publicándose con rutas relativas en las 4.293 fichas: el navegador las
 * resuelve, pero ninguna herramienta las valida, así que el rastro se publicaba
 * roto sin que nada avisara.
 *
 * Por defecto va contra producción, que es donde importa:
 *
 *     npm run check:jsonld
 *     npm run check:jsonld -- http://localhost:3000
 */

/** Un ejemplar de cada tipo de página, no una lista larga. */
const PAGES = [
  '/',
  '/dades',
  '/bages',
  '/maresme/malgrat-de-mar',
  '/estacions/C7',
  '/senderisme/rutes/eix/gr-92',
];

/** Lo que cada una tiene que llevar, como mínimo. */
const EXPECTED: Record<string, string[]> = {
  '/': ['WebSite'],
  '/dades': ['WebSite', 'Dataset', 'BreadcrumbList'],
  '/bages': ['WebSite', 'BreadcrumbList'],
  '/maresme/malgrat-de-mar': ['WebSite', 'Place', 'BreadcrumbList'],
  '/estacions/C7': ['WebSite', 'BreadcrumbList'],
  '/senderisme/rutes/eix/gr-92': ['WebSite', 'BreadcrumbList'],
};

const base = (process.argv[2] ?? 'https://tempscat.cat').replace(/\/$/, '');
const BLOCK = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/g;

let bad = 0;

console.log(`Dades estructurades a ${base}\n`);

for (const page of PAGES) {
  const res = await fetch(base + page, { headers: { 'user-agent': 'tempscat-check' } });
  if (!res.ok) {
    console.error(`✗ ${page} · HTTP ${res.status}`);
    bad++;
    continue;
  }
  const html = await res.text();

  const types: string[] = [];
  for (const m of html.matchAll(BLOCK)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(m[1]);
    } catch (err) {
      console.error(`✗ ${page} · un bloc no es pot llegir com a JSON: ${String(err).slice(0, 80)}`);
      bad++;
      continue;
    }
    const doc = parsed as { '@graph'?: unknown[] };
    for (const raw of doc['@graph'] ?? [parsed]) {
      const node = raw as { '@type'?: string; itemListElement?: Array<{ item?: string }> };
      if (node['@type']) types.push(node['@type']);
      if (node['@type'] === 'BreadcrumbList') {
        for (const it of node.itemListElement ?? []) {
          if (!it.item?.startsWith('http')) {
            console.error(`✗ ${page} · molla amb ruta relativa: ${it.item}`);
            bad++;
          }
        }
      }
    }
  }

  const missing = (EXPECTED[page] ?? []).filter((t) => !types.includes(t));
  if (missing.length) {
    console.error(`✗ ${page} · hi falta ${missing.join(', ')} · hi ha ${types.join(', ') || 'res'}`);
    bad++;
  } else {
    console.log(`✓ ${page.padEnd(38)} ${types.join(', ')}`);
  }
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'problema' : 'problemes'}.`);
  process.exit(1);
}
console.log('\nTot correcte');
