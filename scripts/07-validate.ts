/**
 * Fase 0 · paso 7 — Criterios de aceptación.
 *
 * Falla con código 1 si el territorio construido no cumple lo pactado en el
 * roadmap. Está pensado para correr en CI: si esto pasa en verde, la fase 0
 * está terminada de verdad, no "casi".
 */
import { readFileSync } from 'node:fs';
import { build } from './lib/paths.ts';
import type { Location } from './06-build-territory.ts';

interface Comarca { codi: string; nom: string; slug: string; path: string; nMunicipis: number; poblacio: number; altitudMin: number | null; altitudMax: number | null }

const locations: Location[] = JSON.parse(readFileSync(build('locations.json'), 'utf8'));
const comarques: Comarca[] = JSON.parse(readFileSync(build('comarques.json'), 'utf8'));
const paths: Record<string, string> = JSON.parse(readFileSync(build('paths.json'), 'utf8'));

const byId = new Map(locations.map((l) => [l.id, l]));
const publicades = locations.filter((l) => l.published);

let failed = 0;
let warned = 0;

function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  else { failed++; console.log(`  FALLO ${name}${detail ? ` — ${detail}` : ''}`); }
}
function warn(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ok    ${name}${detail ? ` — ${detail}` : ''}`);
  else { warned++; console.log(`  aviso ${name}${detail ? ` — ${detail}` : ''}`); }
}

console.log('\n── Estructura territorial ──────────────────────────────────────');
check('43 comarcas', comarques.length === 43, `${comarques.length}`);
const municipis = locations.filter((l) => l.level === 'municipi');
check('947 municipios', municipis.length === 947, `${municipis.length}`);
check('3.903 entidades singulares',
  locations.filter((l) => l.level === 'entitat_singular').length === 3903,
  `${locations.filter((l) => l.level === 'entitat_singular').length}`);
check('todos los municipios publican', municipis.every((m) => m.published));
check('todos los municipios tienen coordenada', municipis.every((m) => m.lat != null && m.lon != null));
check('todos los municipios tienen altitud', municipis.every((m) => m.altitud != null),
  `${municipis.filter((m) => m.altitud == null).length} sin altitud`);

console.log('\n── Rutas ───────────────────────────────────────────────────────');
const pathSet = new Set(publicades.map((l) => l.path));
check('ninguna ruta duplicada entre publicadas', pathSet.size === publicades.length,
  `${publicades.length - pathSet.size} colisiones`);
check('índice de rutas completo', Object.keys(paths).length === publicades.length + comarques.length,
  `${Object.keys(paths).length} entradas`);
check('todas las rutas empiezan por /', [...pathSet].every((p) => p.startsWith('/')));
check('rutas sin mayúsculas ni caracteres raros',
  [...pathSet].every((p) => /^\/[a-z0-9\-/]+$/.test(p)),
  [...pathSet].filter((p) => !/^\/[a-z0-9\-/]+$/.test(p)).slice(0, 3).join(' '));
check('profundidad máxima 3 segmentos',
  [...pathSet].every((p) => p.split('/').filter(Boolean).length <= 3));

console.log('\n── Jerarquía ───────────────────────────────────────────────────');
const orphans = locations.filter((l) => l.parentId && !l.parentId.startsWith('C') && !byId.has(l.parentId));
check('sin ubicaciones huérfanas', orphans.length === 0, `${orphans.length} huérfanas`);
const comarcaCodis = new Set(comarques.map((c) => c.codi));
check('toda ubicación pertenece a una comarca válida',
  locations.every((l) => comarcaCodis.has(l.comarcaCodi)));

console.log('\n── Geocodificación ─────────────────────────────────────────────');
const entitats = locations.filter((l) => l.level === 'entitat_singular');
const geocodificades = entitats.filter((l) => l.geocodeConfidence >= 60);
const pct = (geocodificades.length / entitats.length) * 100;
check('más del 85 % de entidades singulares geocodificadas', pct > 85, `${pct.toFixed(1)} %`);
check('toda ubicación publicada tiene coordenada',
  publicades.every((l) => l.lat != null && l.lon != null),
  `${publicades.filter((l) => l.lat == null).length} sin coordenada`);
warn('toda ubicación publicada tiene altitud',
  publicades.every((l) => l.altitud != null),
  `${publicades.filter((l) => l.altitud == null).length} sin altitud`);
check('coordenadas dentro de Catalunya',
  publicades.every((l) => l.lat! > 40.4 && l.lat! < 42.9 && l.lon! > 0.1 && l.lon! < 3.4),
  publicades.filter((l) => !(l.lat! > 40.4 && l.lat! < 42.9 && l.lon! > 0.1 && l.lon! < 3.4))
    .slice(0, 3).map((l) => `${l.nom} ${l.lat},${l.lon}`).join(' | '));

console.log('\n── Estación de referencia ──────────────────────────────────────');
const conEstacio = publicades.filter((l) => l.stationRef);
check('toda ubicación publicada tiene estación de referencia',
  conEstacio.length === publicades.length,
  `${publicades.length - conEstacio.length} sin estación`);
const distancies = conEstacio.map((l) => l.stationRef!.distKm);
const mediana = distancies.slice().sort((a, b) => a - b)[Math.floor(distancies.length / 2)];
warn('distancia mediana a la estación por debajo de 15 km', mediana < 15, `${mediana} km`);
console.log(`        máxima ${Math.max(...distancies)} km · media ${(distancies.reduce((a, b) => a + b, 0) / distancies.length).toFixed(1)} km`);

console.log('\n── El caso de prueba del roadmap ───────────────────────────────');
const lilla = locations.find((l) => l.path === '/conca-de-barbera/montblanc/lilla');
check('/conca-de-barbera/montblanc/lilla resuelve', !!lilla);
if (lilla) {
  check('  tiene coordenada', lilla.lat != null && lilla.lon != null,
    `${lilla.lat?.toFixed(4)}, ${lilla.lon?.toFixed(4)}`);
  check('  tiene altitud', lilla.altitud != null, `${lilla.altitud} m`);
  check('  tiene estación de referencia', !!lilla.stationRef,
    lilla.stationRef ? `${lilla.stationRef.nom} a ${lilla.stationRef.distKm} km, ${lilla.stationRef.dAltM} m de desnivel` : '');
  const montblanc = locations.find((l) => l.path === '/conca-de-barbera/montblanc');
  check('  cuelga de Montblanc', lilla.parentId === montblanc?.id || byId.get(lilla.parentId!)?.municipiCodi === montblanc?.municipiCodi);
  if (montblanc?.altitud != null && lilla.altitud != null) {
    const d = lilla.altitud - montblanc.altitud;
    console.log(`        desnivel respecto al núcleo de Montblanc: ${d > 0 ? '+' : ''}${d} m (≈ ${(-d * 0.0065).toFixed(1)} °C)`);
  }
}

const hermanos = locations.filter((l) => l.published && l.municipiCodi === lilla?.municipiCodi && l.level !== 'municipi');
console.log(`\n  Entidades publicadas de Montblanc (${hermanos.length}):`);
for (const h of hermanos) {
  console.log(`    ${h.path.padEnd(50)} ${String(h.altitud ?? '?').padStart(5)} m  ${String(h.poblacio ?? '').padStart(5)} hab`);
}

console.log('\n── Resumen ─────────────────────────────────────────────────────');
console.log(`  Rutas indexables: ${Object.keys(paths).length.toLocaleString('es-ES')}`);
console.log(`  Fallos: ${failed} · Avisos: ${warned}`);

if (failed > 0) {
  console.log('\nLa fase 0 NO cumple los criterios de aceptación.\n');
  process.exit(1);
}
console.log('\nFase 0: criterios de aceptación cumplidos.\n');
