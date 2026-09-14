/**
 * Que els fitxers que llancen la ingesta siguin vàlids.
 *
 * ## Per què això existeix
 *
 * El 14 de setembre de 2026 van arribar correus de «Run failed» amb un cos
 * d'una sola línia: **`No jobs were run`**. No havia petat cap worker: el
 * fitxer `diari.yml` tenia `if: always()` **dues vegades** al mateix pas —una
 * clau repetida dins d'un mapa, que YAML prohibeix— i GitHub el rebutjava
 * sencer. O sigui que la feina d'un dia sencer —rècords, aire, aigua i
 * l'acumulació de l'encert— no es va fer, i el que va arribar no va ser «tal
 * cosa ha fallat» sinó una queixa de sintaxi.
 *
 * Ho va escriure una substitució automàtica meva damunt dels tretze workers.
 * Podria haver-ho escrit qualsevol edició a mà: el punt no és qui, és que
 * **res no ho mirava**. `ci.yml` comprovava els dos projectes de TypeScript, el
 * lint, les proves i el build — tot menys els fitxers que ho llancen tot.
 *
 * ## Què mira, i per què només això
 *
 * No és un validador d'Actions: és la llista curta del que es trenca sense
 * donar la cara.
 *
 *  · **Claus repetides dins d'un mateix mapa.** El que va passar. Cap editor hi
 *    diu res i molts analitzadors de YAML es queden l'última en silenci —
 *    GitHub, no: no executa res.
 *  · **Tabuladors.** YAML els prohibeix i a la pantalla són espais.
 *  · **Un `npm run` que no existeix.** Un pas que crida un script inexistent
 *    falla en execució, de matinada, i el motiu viu en un registre que caduca.
 *    Aquí es veu abans de pujar-ho.
 *  · **Un workflow sense cap feina.** L'altra manera d'arribar al mateix correu.
 *
 * ## Per què no fa servir cap analitzador de YAML
 *
 * Perquè la fallada que busca és justament la que els analitzadors **no**
 * donen: gairebé tots accepten la clau repetida i es queden l'última. Un que
 * ho fes bé seria una dependència més per a quatre regles que es llegeixen amb
 * la sagnia, i la sagnia és exactament el que aquests fitxers tenen de
 * senzill.
 */
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOWS = '.github/workflows';
const ACTIONS = '.github/actions';

interface Problem { file: string; line: number; text: string }

const problems: Problem[] = [];
function fail(file: string, line: number, text: string) {
  problems.push({ file, line, text });
}

/** Els scripts que `package.json` declara: amb què es compara cada `npm run`. */
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  scripts: Record<string, string>;
};
const declared = new Set(Object.keys(pkg.scripts));

/**
 * Les claus repetides, comptades per bloc.
 *
 * Un «bloc» és un mapa: tot el que comparteix sagnia sota el mateix pare. Cada
 * element d'una llista (`- `) obre un bloc nou, que és el que fa que dos passos
 * seguits puguin portar tots dos un `run:` sense que sigui cap repetició.
 *
 * El text lliure no es mira: quan una clau val `|` o `>`, tot el que ve més
 * endins és un guió d'intèrpret d'ordres i allà `x: 1` no és cap clau.
 */
function checkDuplicates(file: string, lines: string[]) {
  const stack: { indent: number; keys: Map<string, number> }[] = [];
  let blockScalarIndent: number | null = null;

  lines.forEach((raw, i) => {
    const n = i + 1;

    if (raw.includes('\t')) fail(file, n, 'porta un tabulador, i YAML no els accepta');

    const indent = raw.length - raw.trimStart().length;
    const body = raw.trim();

    // Dins d'un text lliure no hi ha claus: només s'acaba quan es torna a sortir.
    if (blockScalarIndent !== null) {
      if (body === '' || indent > blockScalarIndent) return;
      blockScalarIndent = null;
    }

    if (body === '' || body.startsWith('#')) return;

    const item = body.startsWith('- ') || body === '-';
    // La clau d'un element de llista viu dos espais més endins que el guionet.
    const eff = item ? indent + 2 : indent;
    const rest = item ? body.slice(1).trim() : body;

    const m = rest.match(/^([A-Za-z_][\w.-]*)\s*:(?:\s|$)/);

    while (stack.length && stack[stack.length - 1].indent > eff) stack.pop();

    if (item) {
      // Un element nou comença un mapa nou, encara que el de dalt tingui la
      // mateixa sagnia. Sense això, dos passos amb `run:` serien un duplicat.
      while (stack.length && stack[stack.length - 1].indent >= eff) stack.pop();
      stack.push({ indent: eff, keys: new Map() });
    } else if (!stack.length || stack[stack.length - 1].indent < eff) {
      stack.push({ indent: eff, keys: new Map() });
    }

    if (m) {
      const top = stack[stack.length - 1];
      const before = top.keys.get(m[1]);
      if (before !== undefined) {
        fail(file, n, `«${m[1]}» ja hi era a la línia ${before}, dins del mateix bloc`);
      } else {
        top.keys.set(m[1], n);
      }

      const value = rest.slice(m[0].length).trim();
      if (/^[|>][+-]?\d*$/.test(value)) blockScalarIndent = eff;
    }
  });
}

/** Cada `npm run X` ha d'existir a `package.json`. */
function checkScripts(file: string, lines: string[]) {
  lines.forEach((raw, i) => {
    for (const m of raw.matchAll(/npm run ([\w:-]+)/g)) {
      if (!declared.has(m[1])) {
        fail(file, i + 1, `crida «npm run ${m[1]}», que package.json no declara`);
      }
    }
  });
}

/** Que hi hagi alguna feina: l'altra manera d'arribar a «No jobs were run». */
function checkHasJobs(file: string, lines: string[]) {
  const at = lines.findIndex((l) => /^jobs:\s*$/.test(l));
  if (at < 0) {
    fail(file, 1, 'no té cap bloc «jobs:»');
    return;
  }
  const any = lines.slice(at + 1).some((l) => /^ {2}[A-Za-z_][\w-]*:\s*$/.test(l));
  if (!any) fail(file, at + 1, '«jobs:» no porta cap feina a dins');
}

const files: string[] = [];
for (const name of readdirSync(WORKFLOWS)) {
  if (name.endsWith('.yml') || name.endsWith('.yaml')) files.push(join(WORKFLOWS, name));
}
// Les accions compostes es trenquen igual, i la de `setup` la fan servir totes.
if (existsSync(ACTIONS)) {
  for (const dir of readdirSync(ACTIONS)) {
    for (const n of ['action.yml', 'action.yaml']) {
      const p = join(ACTIONS, dir, n);
      if (existsSync(p)) files.push(p);
    }
  }
}

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  checkDuplicates(file, lines);
  checkScripts(file, lines);
  if (file.startsWith(WORKFLOWS)) checkHasJobs(file, lines);
}

console.log(`Fitxers comprovats: ${files.length}`);

if (problems.length) {
  console.error('');
  for (const p of problems) {
    console.error(`${p.file.replace(/\\/g, '/')}:${p.line} · ${p.text}`);
  }
  console.error(`\n${problems.length} ${problems.length === 1 ? 'problema' : 'problemes'}.`);
  process.exit(1);
}

console.log('Cap clau repetida, cap tabulador, cap script inexistent i totes amb feines.');
