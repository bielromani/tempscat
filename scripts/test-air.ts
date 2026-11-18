/**
 * Que la correcció del NO₂ faci el que diu, i sobretot que no faci el que no.
 *
 *   npm run test:air
 *
 * El càlcul és a `src/lib/air-correction.ts`. Un error aquí no dona cap error:
 * dona un índex plausible i equivocat a cada fitxa.
 */
import {
  aqiWithNo2, correctNo2, no2Correction, no2SubIndex, type No2Donor,
} from '../src/lib/air-correction.ts';

let bad = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); bad++; }
};
const near = (a: number, b: number, tol = 0.6) => Math.abs(a - b) <= tol;

console.log('Subíndex del NO₂, contra les parelles que torna Open-Meteo');
for (const [c, i] of [[7.6, 4], [18.4, 9], [29.6, 15], [41.3, 21], [52.5, 25], [59.2, 28]] as const) {
  check(near(no2SubIndex(c), i), `${c} µg/m³ → ${i} (surt ${no2SubIndex(c).toFixed(1)})`);
}

console.log('\nL\'índex amb el NO₂ corregit');
const subs = { pm2_5: 12, pm10: 8, no2: 30, o3: 14 };
check(aqiWithNo2(30, subs, 15) === 15, 'si el NO₂ manava i baixa, mana el següent');
check(aqiWithNo2(30, subs, 10) === 14, 'i mai per sota de cap altre subíndex');
check(aqiWithNo2(30, subs, 45) === 45, 'si el NO₂ puja, l\'índex puja');
check(aqiWithNo2(55, subs, 10) === 55, 'un índex que marca un altre contaminant (el SO₂) no s\'amaga');
check(aqiWithNo2(null, subs, 10) === null, 'sense índex, no se n\'inventa cap');

console.log('\nLa correcció d\'un punt');
const fabra: No2Donor = { code: 'f', name: 'Observatori Fabra', lat: 41.418, lon: 2.124, logRatio: Math.log(0.21), hours: 700 };
const ciutadella: No2Donor = { code: 'c', name: 'Ciutadella', lat: 41.386, lon: 2.187, logRatio: Math.log(0.59), hours: 700 };
const lluny: No2Donor = { code: 'l', name: 'Lluny', lat: 42.0, lon: 2.9, logRatio: Math.log(3), hours: 700 };
check(no2Correction(41.43, 2.10, []) === null, 'sense estacions, cap correcció: CAMS sol');
check(no2Correction(41.43, 2.10, [lluny]) === null, 'una estació a més de 15 km no compta');
const vall = no2Correction(41.432, 2.096, [fabra, ciutadella])!;
const centre = no2Correction(41.383, 2.177, [fabra, ciutadella])!;
check(vall.nearest.name === 'Observatori Fabra', 'a Vallvidrera hi pesa més l\'Observatori Fabra');
check(Math.exp(vall.logRatio) < Math.exp(centre.logRatio), 'i surt més net que el centre, on pesa la Ciutadella');
check(vall.logRatio > Math.log(0.21) && vall.logRatio < 0, 'encongida cap a zero: mai més enllà de l\'estació');
const una = no2Correction(41.45, 2.124, [fabra])!;
check(Math.abs(una.logRatio) < Math.abs(Math.log(0.21)), 'una sola estació a 3,5 km no es copia sencera');
check(correctNo2(10, 0) === 10, 'correcció zero, el mateix valor');
check(correctNo2(0.5, Math.log(0.1)) >= 0, 'mai una concentració negativa');

if (bad) {
  console.error(`\n${bad} errors`);
  process.exit(1);
}
console.log('\nTot bé.');
