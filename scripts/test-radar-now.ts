/**
 * Que el radar corregeixi el cel d'ara quan el contradiu, i res més.
 *
 *   npm run test:radar
 *
 * El criteri és a `src/lib/radar-now.ts`.
 */
import { dbzToMmH, pixelDbz, radarVerdict } from '../src/lib/radar-now.ts';

let bad = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); bad++; }
};

console.log('Els píxels de RainViewer (Universal Blue)');
check(pixelDbz(0x78, 0x73, 0x64, 0x39) === 0, 'el vel beix de −3 dBZ no és pluja');
check(pixelDbz(0xde, 0xd0, 0x97, 0xbe) === 0, 'tampoc el de 14 dBZ, el més opac del vel');
check(pixelDbz(0x88, 0xdd, 0xee, 0xff) === 15, 'el primer blau opac és 15 dBZ');
check(pixelDbz(0x00, 0x91, 0xca, 0xff) === 22, 'un blau del mig, 22 dBZ');
check(pixelDbz(0xff, 0xaa, 0x00, 0xff) === 40, 'el taronja, 40 dBZ');
check(Math.abs(dbzToMmH(15) - 0.32) < 0.02, '15 dBZ són uns 0,3 mm/h');

console.log('\nEl cel d\'ara');
const rain = { weatherCode: 61, cloudCover: 95, temperature: 18, precipitation: 0.4 };
const dry = { weatherCode: 3, cloudCover: 95, temperature: 18, precipitation: 0 };
const v1 = radarVerdict(rain, undefined);
check(v1?.by === 'radar-dry' && v1.weatherCode === 3 && v1.precipitation === 0, 'el model diu pluja i el radar no en veu: cel cobert, 0 mm');
check(radarVerdict(rain, [16, 0]) === null, 'si a 4 km hi ha pluja, el model es queda com és');
check(radarVerdict({ ...rain, cloudCover: 50 }, undefined)?.weatherCode === 2, 'la nuvolositat del model decideix quin cel sec');
check(radarVerdict({ ...rain, weatherCode: 95 }, undefined)?.by === 'radar-dry', 'una tempesta sense eco tampoc és a sobre');
check(radarVerdict(dry, undefined) === null, 'sec i sec: res a dir');
check(radarVerdict(dry, [25, 18]) === null, 'un eco feble no fa dir que plou');
check(radarVerdict(dry, [25, 0]) === null, 'ni un de fort a 3 km');
const v2 = radarVerdict(dry, [30, 24]);
check(v2?.by === 'radar-wet' && v2.weatherCode === 61 && v2.precipitation > 0, 'el model diu sec i a sobre hi ha 24 dBZ: pluja feble');
check(radarVerdict(dry, [45, 42])?.weatherCode === 65, '42 dBZ: pluja forta');
check(radarVerdict({ ...dry, temperature: 0 }, [25, 22])?.weatherCode === 71, 'a 0 °C, neu');
check(radarVerdict({ ...rain, weatherCode: null }, undefined) === null, 'sense codi, no s\'inventa cap cel');

if (bad) {
  console.error(`\n${bad} errors`);
  process.exit(1);
}
console.log('\nTot bé.');
