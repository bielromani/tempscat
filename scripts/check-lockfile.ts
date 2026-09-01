/**
 * Comprova que el package-lock.json estigui complet **per a totes les
 * plataformes**, no només per a la d'aquí.
 *
 * ## Per què cal, i com es va descobrir
 *
 * `npm install` executat a Windows resol l'arbre per a Windows i **poda les
 * branques de les altres plataformes**. Algunes dependències opcionals —les
 * variants wasm32 de `sharp` i de `@tailwindcss/oxide`— es queden al fitxer
 * però sense les seves pròpies dependències, que aquí no calen.
 *
 * A Linux, npm calcula un arbre diferent, les troba a faltar i **`npm ci` es
 * nega a instal·lar res**:
 *
 *     npm error `npm ci` can only install packages when your package.json
 *               and package-lock.json are in sync.
 *     npm error Missing: @emnapi/runtime@1.11.3 from lock file
 *     npm error Missing: @emnapi/core@1.11.3 from lock file
 *
 * El símptoma no s'assembla gens a la causa: el que es veu és un worker que
 * mor amb `Cannot find package '@vercel/blob'`, perquè el pas d'instal·lació ja
 * havia fallat abans i no hi havia cap dependència.
 *
 * Es va perdre una tarda per això. Aquesta comprovació ho hauria dit en un
 * segon, i ara corre a cada canvi.
 *
 * ## Com se n'surt
 *
 * Esborrant `node_modules` i `package-lock.json` i tornant a fer `npm install`.
 * Un `npm install --package-lock-only` **no** n'hi ha prou: el vaig provar i
 * deixava les tres entrades igual de perdudes.
 */
import { readFileSync } from 'node:fs';
import { ROOT } from './lib/paths.ts';
import { join } from 'node:path';

interface Entry {
  dependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
}

const lock = JSON.parse(readFileSync(join(ROOT, 'package-lock.json'), 'utf8')) as {
  packages: Record<string, Entry>;
};
const pkgs = lock.packages;

/**
 * La resolució de Node: des de la carpeta del paquet, pujant per cada
 * `node_modules/` fins a l'arrel.
 */
function resolves(fromPath: string, name: string): boolean {
  const parts = fromPath ? fromPath.split('/node_modules/') : [''];
  for (let depth = parts.length; depth >= 1; depth--) {
    const base = parts.slice(0, depth).join('/node_modules/');
    if (pkgs[`${base ? `${base}/` : ''}node_modules/${name}`]) return true;
  }
  return !!pkgs[`node_modules/${name}`];
}

const missing: string[] = [];
for (const [path, entry] of Object.entries(pkgs)) {
  for (const kind of ['dependencies', 'optionalDependencies'] as const) {
    for (const dep of Object.keys(entry[kind] ?? {})) {
      if (!resolves(path, dep)) missing.push(`${path || '(arrel)'} → ${dep}`);
    }
  }
}

if (missing.length) {
  console.error(`El package-lock.json té ${missing.length} dependències sense entrada:\n`);
  for (const m of missing) console.error(`  ${m}`);
  console.error('\nA Linux, `npm ci` es negarà a instal·lar. Es refà així:');
  console.error('  rm -rf node_modules package-lock.json && npm install\n');
  process.exit(1);
}

console.log(`package-lock.json complet: ${Object.keys(pkgs).length} entrades, cap dependència penjant.`);
