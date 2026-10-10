/**
 * Prova · quina temperatura es descarta i, sobretot, quina no.
 *
 * El perill d'aquesta prova no és deixar passar un termòmetre espatllat: és
 * esborrar el fred de veritat, que és el que `/ranquings` ha d'ensenyar. Per
 * això hi ha més casos que no s'han de tocar que casos que sí.
 *
 *   npm run test:qc
 */
import { suspectTemperatures, type TempPoint } from '../src/lib/temperature-check.ts';

let failed = 0;
function expect(name: string, points: TempPoint[], codes: string[]) {
  const got = suspectTemperatures(points).map((s) => s.codi).sort();
  const ok = JSON.stringify(got) === JSON.stringify([...codes].sort());
  if (!ok) failed++;
  console.log(`${ok ? '✓' : '✗'} ${name}${ok ? '' : ` — esperava [${codes}] i surt [${got}]`}`);
}

// El Segrià del 6 d'octubre de 2026 a les 17:30 UTC, amb l'Alguaire espatllat.
const segria: TempPoint[] = [
  { codi: 'X3', lat: 41.74, lon: 0.58, altitud: 371, t: 1.3 },   // Alguaire
  { codi: 'YJ', lat: 41.61, lon: 0.60, altitud: 192, t: 21.8 },  // Lleida
  { codi: 'VD', lat: 41.68, lon: 0.53, altitud: 286, t: 21.2 },  // Raimat
  { codi: 'W1', lat: 41.79, lon: 0.70, altitud: 250, t: 20.6 },  // Albesa
  { codi: 'XI', lat: 41.56, lon: 0.53, altitud: 223, t: 22.0 },  // Alcarràs
];
expect("Alguaire a 1,3 °C entre veïnes a 21", segria, ['X3']);
expect('el mateix, amb la lectura bona', segria.map((p) => p.codi === 'X3' ? { ...p, t: 19.1 } : p), []);

// Una nit d'inversió a la Cerdanya: el fons de la vall, a −8 °C, i els cims
// a +2. Corregint pel gradient semblaria un error; per cota, no té veïnes.
const cerdanya: TempPoint[] = [
  { codi: 'Z3', lat: 42.39, lon: 1.86, altitud: 1097, t: -8.0 },  // Das
  { codi: 'ZD', lat: 42.32, lon: 1.88, altitud: 2478, t: 2.0 },   // la Tosa
  { codi: 'ZC', lat: 42.38, lon: 1.98, altitud: 2230, t: 1.4 },   // Malniu
  { codi: 'Z9', lat: 42.36, lon: 1.82, altitud: 2380, t: 1.8 },   // Cadí
  { codi: 'ZE', lat: 42.30, lon: 1.62, altitud: 2288, t: 2.2 },   // Port del Comte
];
expect('inversió: la vall freda entre cims temperats', cerdanya, []);

// Una clotada de fred: vuit graus per sota de les veïnes de la mateixa cota.
const clot: TempPoint[] = [
  { codi: 'A', lat: 41.90, lon: 2.20, altitud: 500, t: -3.0 },
  { codi: 'B', lat: 41.95, lon: 2.25, altitud: 560, t: 5.0 },
  { codi: 'C', lat: 41.85, lon: 2.30, altitud: 450, t: 5.4 },
  { codi: 'D', lat: 42.00, lon: 2.15, altitud: 620, t: 4.6 },
];
expect('una clotada de fred de vuit graus es queda', clot, []);

// Amb dues veïnes no n'hi ha prou per desmentir ningú.
expect('sense prou veïnes no es diu res', segria.slice(0, 3), []);

// Les veïnes de més de 40 km no compten.
expect('les veïnes llunyanes no compten', [
  { codi: 'A', lat: 41.0, lon: 1.0, altitud: 100, t: 0 },
  { codi: 'B', lat: 41.5, lon: 1.0, altitud: 100, t: 20 },
  { codi: 'C', lat: 41.5, lon: 1.1, altitud: 100, t: 20 },
  { codi: 'D', lat: 41.5, lon: 1.2, altitud: 100, t: 20 },
], []);

// Dues espatllades alhora no tomben la bona: per això és la mediana.
expect('dues espatllades alhora', [
  ...segria.slice(1),
  { codi: 'X3', lat: 41.74, lon: 0.58, altitud: 371, t: 1.3 },
  { codi: 'X4', lat: 41.70, lon: 0.62, altitud: 300, t: 0.5 },
], ['X3', 'X4']);

if (failed) {
  console.log(`\n${failed} casos fallen`);
  process.exitCode = 1;
}
