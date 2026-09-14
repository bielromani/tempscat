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
import { oklchToHex, temperatureColor } from '../src/lib/scales.ts';

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

if (bad.length) {
  console.error('\nEl color que enviem al mapa ja no és el que pinta el navegador:');
  for (const b of bad) console.error(`  ${b}`);
  process.exit(1);
}

console.log(`\n${CHROME.length} colors · desviació màxima ${worst} de 255.`);
