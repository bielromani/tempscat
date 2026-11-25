/**
 * Que la correcció de la màxima i la mínima faci el que diu, i res més.
 *
 *   npm run test:bias
 *
 * El càlcul és a `src/lib/daily-bias.ts`.
 */
import { biasCorrectionAt, correctSeries, type DailyBias } from '../src/lib/daily-bias.ts';

let bad = 0;
const check = (cond: boolean, msg: string) => {
  if (cond) console.log(`  ✓ ${msg}`);
  else { console.error(`  ✗ ${msg}`); bad++; }
};

const bias: DailyBias = {
  from: '2026-10-25', to: '2026-11-23',
  stations: [
    { codi: 'A', nom: 'Prop', lat: 41.40, lon: 2.15, alt: 50, tMax: -1.2, tMin: 1.4, n: 30 },
    { codi: 'B', nom: 'Muntanya', lat: 41.42, lon: 2.12, alt: 900, tMax: 0.5, tMin: -0.5, n: 30 },
    { codi: 'C', nom: 'Lluny', lat: 42.30, lon: 2.90, alt: 50, tMax: 5, tMin: 5, n: 30 },
    { codi: 'D', nom: 'Sense màxima', lat: 41.39, lon: 2.16, alt: 40, tMax: null, tMin: 1.0, n: 4 },
  ],
};

console.log('La correcció d\'un lloc');
const c = biasCorrectionAt(41.39, 2.17, 30, bias)!;
check(c.tMax > 0 && c.tMin < 0, 'una màxima baixa i una mínima alta es corregeixen cap amunt i cap avall');
check(c.tMax < 1.2 && c.tMin > -1.4, 'encongida: mai més que l\'error de l\'estació');
check(c.nearest.nom === 'Prop' || c.nearest.nom === 'Sense màxima', 'pesa més la del costat');
const alt = biasCorrectionAt(41.42, 2.12, 900, bias)!;
check(alt.tMax < 0 && alt.tMin > 0, 'a 900 m mana l\'estació de 900 m, no la de la costa');
check(biasCorrectionAt(40.6, 0.6, 10, bias) === null, 'sense cap estació a 40 km, cap correcció');
check(biasCorrectionAt(41.39, 2.17, 30, { ...bias, stations: [] }) === null, 'sense estacions, res');

console.log('\nLes hores i els dies');
const hourly = [6, 5, 8, 12, 15, 11].map((t, i) => ({ time: `2026-11-24T${String(i * 4).padStart(2, '0')}:00`, temperature: t, apparent: t - 1 }));
const daily = [{ date: '2026-11-24', tMax: 15, tMin: 5 }];
const corr = { tMax: 1, tMin: -1.5, nearest: { nom: 'x', km: 1 }, stations: 1 };
const out = correctSeries(hourly, daily, corr);
check(out.daily[0].tMax === 16 && out.daily[0].tMin === 3.5, 'la màxima i la mínima del dia es mouen el que diu la correcció');
const temps = out.hourly.map((h) => h.temperature!);
check(Math.max(...temps) === 16 && Math.min(...temps) === 3.5, 'l\'hora més calenta acaba a la màxima i la més freda a la mínima');
check(out.hourly[2].temperature! > 8 - 1.5 && out.hourly[2].temperature! < 8 + 1, 'les del mig, entremig');
check(out.hourly[4].apparent === out.hourly[4].temperature! - 1, 'la sensació es mou amb la temperatura');
check(correctSeries([{ time: '2026-11-24T00:00', temperature: null }], daily, corr).hourly[0].temperature === null, 'una hora sense dada es queda sense dada');

if (bad) {
  console.error(`\n${bad} errors`);
  process.exit(1);
}
console.log('\nTot bé.');
