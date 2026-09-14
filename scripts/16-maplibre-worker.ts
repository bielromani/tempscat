/**
 * Deixa el worker de MapLibre a `public/`, copiat del paquet instal·lat.
 *
 *   npm run data:maplibre-worker   (i sol, abans de `build` i de `dev`)
 *
 * ## Per què cal, i per què no es veu venir
 *
 * MapLibre no fa la feina pesada al fil principal: el que analitza el GeoJSON i
 * construeix les geometries és un **worker**, i el carrega així —
 *
 *     const workerName = moduleUrl.endsWith('-dev.mjs')
 *       ? 'maplibre-gl-worker-dev.mjs' : 'maplibre-gl-worker.mjs';
 *     new URL(workerName, import.meta.url)
 *
 * — o sigui que el **nom del fitxer el compon amb una cadena, en temps
 * d'execució**. I qualsevol empaquetador modern reanomena els fitxers amb
 * l'empremta del contingut: Turbopack deixa el worker a
 * `/_next/static/media/maplibre-gl-worker.1n8lzpjb93uvs.mjs`, i aquella cadena
 * segueix demanant `maplibre-gl-worker.mjs` a seques. **Cap dels dos s'equivoca
 * i el resultat no funciona.**
 *
 * ## El símptoma no s'assembla gens a la causa
 *
 * El 404 el contesta Next amb la seva pàgina d'error, o sigui **HTML amb un
 * 200-que-sembla-200**, i a la consola surt «Failed to load module script: the
 * server responded with a non-JavaScript MIME type of "text/html"», que no
 * anomena ni MapLibre ni cap mapa.
 *
 * I el mapa **es dibuixa igualment**: les tessel·les del mapa base són ràsters
 * i les baixa el fil principal, així que es veu Catalunya sencera amb els seus
 * noms. El que no arriba mai és el GeoJSON de les comarques, perquè aquell sí
 * que passa pel worker. Com que `style.loaded()` demana que **totes** les fonts
 * estiguin carregades, l'esdeveniment `load` no es dispara mai, i la pàgina es
 * queda ensenyant el missatge d'espera per damunt d'un mapa perfectament
 * dibuixat. Ni un error, ni una execució en roig.
 *
 * ## Per què una còpia i no un `import`
 *
 * Perquè el que fa falta és una **adreça estable** que puguem passar a
 * `setWorkerUrl()`, i una adreça estable és exactament el que un empaquetador
 * amb empremtes no dona. `public/` la dona.
 *
 * ## I per què es copien uns quants fitxers i no un
 *
 * Perquè `maplibre-gl-worker.mjs` no és autònom: comença amb un
 * `from "./maplibre-gl-shared.mjs"`. Copiant-ne només un, aquell import queda
 * penjant, Next contesta el 404 amb HTML i **es torna a caure exactament pel
 * mateix lloc que abans**, amb el mateix missatge que no anomena cap mapa.
 * Va passar: primera versió d'aquest guió, mig mapa que es dibuixava i el
 * missatge d'espera per damunt.
 *
 * Així que no hi ha cap llista escrita a mà: es llegeix el fitxer, se'n treuen
 * els `./*.mjs` que importa, i es repeteix amb cadascun fins que no en queda
 * cap. Si el paquet es reparteix d'una altra manera demà, això el segueix; i si
 * un import apunta enlloc, **llança**, que és el que no feia ningú.
 */
import { copyFileSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './lib/paths.ts';

/** On els deixem. Ha de coincidir amb `MAPLIBRE_WORKER` de `src/lib/webmap.ts`. */
const DEST_DIR = join(ROOT, 'public', 'maplibre');
/** El que es demana a `setWorkerUrl()`; la resta hi penja. */
const ENTRY = 'maplibre-gl-worker.mjs';

const pkgDir = join(ROOT, 'node_modules', 'maplibre-gl');
const distDir = join(pkgDir, 'dist');

let version = '?';
try {
  version = (JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')) as {
    version: string;
  }).version;
} catch {
  throw new Error(
    'No hi ha `maplibre-gl` instal·lat. El mapa de /mapa/interactiu no pot funcionar sense.',
  );
}

mkdirSync(DEST_DIR, { recursive: true });

/** Els `from "./x.mjs"` i `import "./x.mjs"` d'un fitxer. */
function localImports(code: string): string[] {
  const out = new Set<string>();
  for (const m of code.matchAll(/(?:from|import)\s*["']\.\/([\w.-]+\.mjs)["']/g)) {
    out.add(m[1]);
  }
  return [...out];
}

const done = new Set<string>();
const queue = [ENTRY];
let bytes = 0;

while (queue.length) {
  const name = queue.shift()!;
  if (done.has(name)) continue;
  done.add(name);

  const src = join(distDir, name);
  let code: string;
  try {
    code = readFileSync(src, 'utf8');
  } catch {
    throw new Error(
      `maplibre-gl ${version}: falta dist/${name}, que ${ENTRY} necessita.\n`
      + 'El paquet ha canviat de forma. Mira com reparteix el worker abans de seguir: '
      + 'si es copia a mitges, el mapa es dibuixa i es queda esperant per sempre, '
      + 'sense donar cap error.',
    );
  }

  copyFileSync(src, join(DEST_DIR, name));
  bytes += statSync(src).size;
  queue.push(...localImports(code));
}

console.log(
  `Worker de MapLibre ${version} → public/maplibre/ · `
  + `${done.size} fitxers (${[...done].join(', ')}) · ${(bytes / 1024).toFixed(0)} kB`,
);
