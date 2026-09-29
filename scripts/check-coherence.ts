/**
 * ¿Se contradice una ficha consigo misma?
 *
 * ## Por qué hace falta
 *
 * Porque cada bloque de una ficha, por separado, está bien, y las pruebas
 * comprueban bloques por separado. El 29 de septiembre de 2026, con avisos naranja
 * en medio país, la web publicaba esto sin que nada fallara:
 *
 *  · Lilla: «Pluja 24 h: 16,6 mm» arriba y «Últim ruixat: fa més de 45 dies»
 *    abajo, de la misma estación. El bloque de lluvia contaba desde el final de
 *    la serie diaria, que va dos días tarde.
 *  · Malgrat: aviso naranja de 150 mm en doce horas y, debajo, «Pluja feble» en
 *    el titular y «sempre feble» en la frase.
 *  · Lilla otra vez: «Un sol model de predicció» en el gráfico y «Els models
 *    pesen igual en aquest consens» al pie.
 *
 * Son fallos de **composición**: salen de juntar dos datos correctos. Solo se
 * ven en el HTML servido, así que esto va contra el HTML servido, como
 * `check:jsonld`.
 *
 * ## Qué comprueba
 *
 * Invariantes que tienen que cumplirse **cualquier día**, no una foto de hoy:
 *
 *  1. Con 10 mm o más en 24 h, el último día de más de 5 mm es hoy o ayer. Diez
 *     milímetros en 24 horas son al menos cinco en uno de los dos días naturales.
 *  2. Una ficha de un solo modelo no habla de «consens».
 *  3. Si un aviso de lluvia o tormenta cubre esta hora —y hace más de tres que
 *     empezó, para no culpar a una página generada antes de que lo emitieran—,
 *     ni el cielo del titular ni la frase ponen «feble» o «moderada». La tabla
 *     horaria no: enseña 48 horas y las de fuera del aviso pueden decirlo.
 *  4. Las contracciones que ya se publicaron mal: «del ESE», «de el», «a els»,
 *     «Dins de Conca».
 *  5. Ninguna clasificación dice «el 30è … dels 30».
 *  6. Ninguna presión por debajo de 960 hPa sin decir que es de estación.
 *
 * Por defecto va contra producción, con las fichas de los casos de arriba y una
 * muestra al azar del sitemap:
 *
 *     npm run check:coherence
 *     npm run check:coherence -- http://localhost:3000
 *     npm run check:coherence -- https://tempscat.cat --sample=40
 */

const FIXED = [
  '/maresme/malgrat-de-mar',
  '/conca-de-barbera/montblanc',
  '/conca-de-barbera/montblanc/lilla',
  '/pallars-sobira/soriguera',
];

const args = process.argv.slice(2);
const base = (args.find((a) => !a.startsWith('--')) ?? 'https://tempscat.cat').replace(/\/$/, '');
const sample = Number(args.find((a) => a.startsWith('--sample='))?.split('=')[1] ?? 12);

const MESOS: Record<string, number> = {
  gener: 1, febrer: 2, març: 3, abril: 4, maig: 5, juny: 6,
  juliol: 7, agost: 8, setembre: 9, octubre: 10, novembre: 11, desembre: 12,
};

/**
 * Del HTML al texto que lee alguien, sin scripts ni estilos.
 *
 * Sin los `<title>` tampoco: son los rótulos que aparecen al pasar el ratón por
 * los iconos de cada hora —«10:00 · Pluja feble»—, la etiqueta del modelo para
 * esa hora y no una frase de la página. Que también callen el adjetivo con aviso
 * está pendiente; mientras tanto, esto mira lo que se lee sin tocar nada.
 */
function textOf(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/g, ' ')
    .replace(/<style[\s\S]*?<\/style>/g, ' ')
    .replace(/<title[\s\S]*?<\/title>/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&#x27;|&apos;|&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&nbsp;|&#xa0;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/’/g, "'")
    .replace(/\s+/g, ' ');
}

/** La hora y el día de ahora en Madrid, que es la hora que escriben las fichas. */
function madridNow(): { day: number; month: number; hour: number } {
  const s = new Date().toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' });
  return { month: Number(s.slice(5, 7)), day: Number(s.slice(8, 10)), hour: Number(s.slice(11, 13)) };
}

async function samplePaths(n: number): Promise<string[]> {
  if (n <= 0) return [];
  const all: string[] = [];
  // En `next dev` el sitemap sale vacío; las rutas son las mismas que en
  // producción, así que se toman de allí.
  for (const from of [base, 'https://tempscat.cat']) {
    for (const name of ['municipis', 'nuclis']) {
      const res = await fetch(`${from}/sitemap/${name}.xml`, { headers: { 'user-agent': 'tempscat-check' } });
      if (!res.ok) continue;
      for (const m of (await res.text()).matchAll(/<loc>([^<]+)<\/loc>/g)) all.push(new URL(m[1]).pathname);
    }
    if (all.length) break;
  }
  const picked = new Set<string>();
  while (picked.size < Math.min(n, all.length)) picked.add(all[Math.floor(Math.random() * all.length)]);
  return [...picked];
}

function problems(text: string): string[] {
  const out: string[] = [];
  const now = madridNow();

  // 1 ── La lluvia de hoy y el último día de lluvia.
  // Des del redisseny «Cel» és la rajola «Pluja · 24 h», amb dos punts darrere
  // de l'últim dia: les dues formes, perquè una regla que deixa de casar no
  // falla, calla.
  const rain24 = /Pluja(?: ·)? 24 h:? ([\d.,]+) mm/.exec(text);
  const last = /(?:Últim ruixat|Últim dia de més de 5 mm):? (avui|fa \d+ dies?|fa 1 dia|fa més de \d+ dies|no consta)/i.exec(text);
  if (rain24 && last) {
    const mm = Number(rain24[1].replace('.', '').replace(',', '.'));
    if (mm >= 10 && !/^(avui|fa 1 dia)$/i.test(last[1])) {
      out.push(`«Pluja 24 h: ${rain24[1]} mm» i l'últim dia de més de 5 mm «${last[1]}»`);
    }
  }

  // 2 ── Un solo modelo no es un consenso.
  if (text.includes('Un sol model de predicció') && /aquest consens/.test(text)) {
    out.push('«Un sol model de predicció» i, a la mateixa pàgina, «aquest consens»');
  }

  // 3 ── Un aviso de lluvia en vigor y un adjetivo que lo contradice.
  const warnRe = /(Pluja|Tempesta)\b[\s\S]{0,160}?(\d{1,2}) (?:de |d')([a-zç]+), de (\d\d):\d\d a (\d\d):\d\d/g;
  const inForce = [...text.matchAll(warnRe)].filter((m) => {
    const [, , d, mes, h0, h1] = m;
    return MESOS[mes] === now.month && Number(d) === now.day
      && Number(h0) <= now.hour - 3 && Number(h1) >= now.hour;
  });
  if (inForce.length) {
    // Solo lo que habla de ahora: el cielo del titular y la frase. La tabla
    // horaria enseña 48 horas y las que caen fuera del aviso pueden decir
    // «Pluja feble» con razón.
    const hero = /°\s+([^·]{3,40}?)\s+· [Mm]àx\./.exec(text)?.[1] ?? '';
    const headline = /Avui, [\s\S]*?(?=(?:Avui|Demà) a(?:l| la) |Les pròximes hores|Pròximes 24 hores)/.exec(text)?.[0] ?? '';
    const weak = /(Pluja feble|Pluja moderada|Ruixats febles|Ruixats moderats|Plugim feble|sempre (?:feble|moderada)|no arriba a mullar el terra)/
      .exec(`${hero} · ${headline}`);
    if (weak) out.push(`avís de ${inForce[0][1].toLowerCase()} en vigor i «${weak[1]}»`);
  }

  // 4 ── Contracciones.
  for (const re of [
    /\b(?:vent|km\/h|Ve|vénen) del (?:E|ENE|ESE|O|ONO|OSO)\b/,
    /\b(?:de|a) (?:el|els) [A-ZÀ-Ú]/,
    /\bDins de (?!l'|la |les |el |els )[A-ZÀ-Ú]/,
    // La 1 és l'única hora en singular: «a la 1 h».
    /\bles 1 h\b/,
  ]) {
    const m = re.exec(text);
    if (m) out.push(`contracció: «${m[0]}»`);
  }

  // 5 ── «El 30è de 30» es el último, y se dice así.
  const rank = /és el (\d+)(?:r|n|t|è) punt més [a-zàèéíòóú]+ dels (\d+)/.exec(text);
  if (rank && rank[1] === rank[2]) out.push(`«${rank[0]}»`);

  // 6 ── Una presión de estación que se lee como una borrasca.
  // La rajola escriu el separador de milers: «1.019 hPa».
  const p = /Pressió (\d{1,2}\.?\d{3}|\d{3}) hPa/.exec(text);
  if (p && Number(p[1].replace('.', '')) < 960) out.push(`«Pressió ${p[1]} hPa» sense dir que és a l'estació`);

  return out;
}

console.log(`Coherència de les fitxes a ${base}\n`);

const pages = [...FIXED, ...(await samplePaths(sample))];
let bad = 0;

for (const page of pages) {
  const res = await fetch(base + page, { headers: { 'user-agent': 'tempscat-check' } });
  if (!res.ok) {
    console.error(`✗ ${page} · HTTP ${res.status}`);
    bad++;
    continue;
  }
  const found = problems(textOf(await res.text()));
  if (found.length) {
    bad += found.length;
    for (const f of found) console.error(`✗ ${page} · ${f}`);
  } else {
    console.log(`✓ ${page}`);
  }
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'contradicció' : 'contradiccions'} en ${pages.length} fitxes.`);
  process.exit(1);
}
console.log(`\nCap contradicció en ${pages.length} fitxes.`);
