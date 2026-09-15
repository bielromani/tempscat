/**
 * Que el color que enviem al mapa sigui el mateix que pinta el navegador.
 *
 *   npm run test:colors
 *
 * ## Per què hi ha una conversió, i per què s'ha de vigilar
 *
 * Les escales del lloc són **OKLCH**, perquè és l'espai on una rampa té passos
 * que es veuen iguals. El navegador l'entén. **MapLibre no**: al seu
 * analitzador de colors no hi surt la paraula `oklch` ni una vegada, i el que
 * fa amb un color que no entén no és queixar-se — és no pintar la capa. El
 * mapa surt igual de bé, amb el mapa base a sota i el rètol dient «924
 * municipis observats», i sense ni un color.
 *
 * Per això `oklchToHex()` tradueix el que diu `temperatureColor()` abans
 * d'enviar-ho. I una traducció de colors escrita a mà és exactament la mena de
 * codi que es desvia sense que ningú ho noti: un signe canviat a la matriu
 * OKLab → LMS mou els blaus tres tons i el mapa segueix semblant un mapa.
 *
 * ## Contra què es comprova
 *
 * Contra el **navegador**, no contra la fórmula. Les onze referències d'aquí
 * les va pintar Chrome en un `canvas` de 1×1 píxel amb
 * `ctx.fillStyle = '<oklch>'`, i se'n van llegir els bytes. O sigui que no és
 * la meva aritmètica comparada amb ella mateixa: és contra qui realment
 * decideix de quin color es veu la pantalla.
 *
 * Es va mesurar el 14 de setembre de 2026. Deu de les onze surten idèntiques i
 * una balla **un** valor de 255 en un sol canal, que és l'arrodoniment.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { ROOT } from './lib/paths.ts';

/** Tots els `.ts` i `.tsx` de sota d'un directori. */
function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (/[.]tsx?$/.test(e.name)) yield full;
  }
}
import { CAP_OKLCH, oklchToHex, temperatureColor } from '../src/lib/scales.ts';

/** `graus → el que Chrome pinta`. Mesurat, no calculat. */
const CHROME: Array<[number, string]> = [
  [-10, '#1a87d3'],
  [-5, '#389adb'],
  [0, '#54ade3'],
  [5, '#71bfe8'],
  [10, '#95cfeb'],
  [15, '#d1d9dc'],
  [20, '#e8be92'],
  [25, '#e6a573'],
  [30, '#e28c5b'],
  [35, '#db734a'],
  [40, '#d15a42'],
];

/** Un valor de 255 en un canal: l'arrodoniment de l'últim pas, i prou. */
const TOLERANCE = 1;

const channels = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

let worst = 0;
const bad: string[] = [];

for (const [degrees, expected] of CHROME) {
  const css = temperatureColor(degrees);
  const got = oklchToHex(css);

  if (!/^#[0-9a-f]{6}$/.test(got)) {
    bad.push(`${degrees} °C · ${css} no s'ha sabut convertir: ${got}`);
    continue;
  }

  const a = channels(got);
  const b = channels(expected);
  const diff = Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  worst = Math.max(worst, diff);

  const line = `${String(degrees).padStart(3)} °C  ${css.padEnd(23)} → ${got}`;
  if (diff > TOLERANCE) bad.push(`${line}  (Chrome: ${expected}, difereix en ${diff})`);
  else console.log(`${line}  ${diff === 0 ? '·' : `· ${diff}`}`);
}

// I que una cadena que no sigui OKLCH torni tal qual: hi ha escales que ja
// donen `transparent` o una variable CSS, i convertir-les seria destrossar-les.
for (const raw of ['transparent', 'var(--cap-red)', '#ff0000']) {
  if (oklchToHex(raw) !== raw) bad.push(`«${raw}» hauria de sortir intacte`);
}

/*
 * I que els colors CAP escrits a `scales.ts` siguin els del CSS.
 *
 * N'hi ha d'haver dues còpies: la pàgina els demana amb `var(--cap-*)` perquè
 * el tema fosc els pugui canviar, i el mapa els vol escrits perquè MapLibre no
 * llegeix el DOM. El que no pot passar és que se separin — un taronja oficial
 * d'un to al mapa i d'un altre a la targeta no fallaria enlloc.
 */
const css = readFileSync(join(ROOT, 'src', 'app', 'globals.css'), 'utf8');
for (const [level, value] of Object.entries(CAP_OKLCH)) {
  const name = { verd: 'green', groc: 'yellow', taronja: 'orange', vermell: 'red' }[level]!;
  const m = css.match(new RegExp(`--cap-${name}:\s*([^;]+);`));
  if (!m) bad.push(`globals.css no defineix --cap-${name}`);
  else if (m[1].trim() !== value) {
    bad.push(`--cap-${name}: el CSS diu «${m[1].trim()}» i scales.ts «${value}»`);
  } else console.log(`  --cap-${name} · ${value} · igual als dos costats`);
}

/*
 * I que cap component demani una variable CSS que no existeix.
 *
 * `var(--bg)` no estava definida enlloc i es feia servir en sis llocs. Una
 * variable que no existeix **no dona cap error**: la declaració queda
 * invàlida i el navegador se la menja en silenci. El resultat era que el botó
 * de la capa triada del mapa interactiu tenia el text i el fons exactament del
 * mateix color -mesurat amb `getComputedStyle`: `lab(11.8 -1.7 -7.0)` als
 * dos-, o sigui una píndola negra amb la paraula «Pluja» a dins i invisible.
 * A l'inspector no hi ha res a veure: la propietat, senzillament, no hi és.
 *
 * Es mira contra les definides a `:root`, que és on viuen totes. Les que porten
 * un valor de reserva -`var(--x, blau)`- no compten: aquelles sí que tenen què
 * fer quan no hi són.
 */
const defined = new Set([...css.matchAll(/^\s*(--[\w-]+)\s*:/gm)].map((m) => m[1]));

const sources = [...walk(join(ROOT, 'src'))].map((file) => ({
  file,
  /*
   * Sense els comentaris.
   *
   * Aquest fitxer mateix i `map.ts` expliquen per què MapLibre no entén
   * `var(--cap-orange)`, i una comprovació que llegeixi les explicacions
   * troba variables que ningú no demana. Es tallen els blocs `/* *\/` i prou:
   * les de línia porten `//` i a dins hi ha adreces.
   */
  text: readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' '),
}));

/*
 * I les que es defineixen des del TSX.
 *
 * `--rcycle` no és a `globals.css`: la posa la pròpia figura del radar amb un
 * `style={{ '--rcycle': … }}`, perquè el seu valor és el nombre de marcs, que
 * el sap el servidor. Comptar-la com a inexistent seria un fals avís cada
 * vegada.
 */
for (const { text } of sources) {
  for (const m of text.matchAll(/['"\[](--[\w-]+)['"\]]?\s*(?:as string\])?\s*:/g)) defined.add(m[1]);
}

const used = new Map<string, string[]>();
for (const { file, text } of sources) {
  for (const m of text.matchAll(/var\((--[\w-]+)\s*\)/g)) {
    if (defined.has(m[1])) continue;
    const rel = relative(ROOT, file).split(sep).join('/');
    if (!used.has(m[1])) used.set(m[1], []);
    if (!used.get(m[1])!.includes(rel)) used.get(m[1])!.push(rel);
  }
}
for (const [name, files] of used) {
  bad.push(`${name} no es defineix enlloc i es demana a ${files.join(', ')}`);
}
if (!used.size) console.log(`  ${defined.size} variables CSS definides, i totes les que es demanen hi són`);

if (bad.length) {
  console.error('\nEl color que enviem al mapa ja no és el que pinta el navegador:');
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}

console.log(`\n${CHROME.length} colors · desviació màxima ${worst} de 255.`);
