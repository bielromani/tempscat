/**
 * Sube a l'emmagatzematge tot el que ja hi ha a `data/cache/`.
 *
 * Els workers publiquen el que escriuen, així que en règim normal això no cal.
 * Serveix per a les tres vegades que sí:
 *
 *  · **En engegar un magatzem nou.** Els 45 MB ja són al disc; tornar a
 *    executar el worker de predicció per pujar-los costaria 40 minuts i uns
 *    milers d'unitats de quota per demanar exactament les mateixes dades.
 *  · Després de restaurar una còpia.
 *  · Quan es canvia de proveïdor i cal omplir-ne un de buit.
 *
 * No demana res a cap API externa. Només llegeix del disc i puja.
 */
import { readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { CACHE, markForPublish, publish } from './lib/store.ts';

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const files = walk(CACHE)
  // Els temporals d'una escriptura atòmica interrompuda no són dades.
  .filter((f) => !f.endsWith('.tmp'))
  .map((f) => relative(CACHE, f).split(sep).join('/'));

if (!files.length) {
  console.log('No hi ha res a data/cache/. Executa primer els workers.');
  process.exit(0);
}

let bytes = 0;
for (const f of files) {
  bytes += statSync(join(CACHE, f)).size;
  markForPublish(f);
}

console.log(`${files.length} fitxers · ${(bytes / 1048576).toFixed(1)} MB a data/cache/`);
console.log('Pujant…\n');

const started = Date.now();
const pub = await publish();

if (pub.skipped) {
  console.log('Sense BLOB_READ_WRITE_TOKEN: no s\'ha pujat res.');
  console.log('Posa\'l a .env.local i torna-ho a provar.');
  process.exit(1);
}

const min = (Date.now() - started) / 60000;
console.log(`\nPujats ${pub.uploaded}/${files.length} fitxers · ${(pub.bytes / 1048576).toFixed(1)} MB · ${min.toFixed(1)} min`);
if (pub.origin) {
  console.log(`\nPosa aquesta variable a l'aplicació:`);
  console.log(`  BLOB_BASE_URL = ${pub.origin}`);
}
if (pub.uploaded < files.length) {
  console.log(`\navís: ${files.length - pub.uploaded} fitxers no han pujat. Torna a executar-ho: només costa temps.`);
  process.exit(1);
}
