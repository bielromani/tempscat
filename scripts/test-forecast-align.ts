/**
 * Que la prediccion no se sirva corrida de un dia.
 *
 * Este fichero existe por un fallo concreto: el array de horas era uno solo
 * para todos los puntos y se quedaba congelado, mientras los puntos que se
 * refrescaban traian valores de otro dia. La pagina no daba ningun error -los
 * numeros eran plausibles- y simplemente eran de otro dia.
 *
 * De ahi que aqui se afirme y no se imprima: un fallo que no se ve solo lo
 * caza una asercion.
 */
import { alignAll } from './lib/forecast-align.ts';

let failed = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : 'MAL '} ${what}`);
  if (!ok) console.log(`       esperat ${JSON.stringify(want)}\n       obtingut ${JSON.stringify(got)}`);
}

/** Serie horaria local a partir de una fecha, como la que devuelve Open-Meteo. */
function hours(day: string, n: number): string[] {
  const out: string[] = [];
  const base = new Date(`${day}T00:00:00Z`).getTime();
  for (let i = 0; i < n; i++) out.push(new Date(base + i * 3_600_000).toISOString().slice(0, 16));
  return out;
}

const point = (vals: Array<number | null>) => ({ best_match: { values: { temperature: vals } } });

console.log('\n── Un refresc del dia 2 amb punts conservats del dia 1 ──');
{
  const dia1 = hours('2026-09-01', 48);
  const dia2 = hours('2026-09-02', 48);

  const result = {
    times: dia1,
    // El valor 100 del punt vell es del dia 1 a les 00:00; el 200 del nou, del dia 2.
    points: {
      vell: point(Array.from({ length: 48 }, (_, i) => 100 + i)),
      nou: point(Array.from({ length: 48 }, (_, i) => 200 + i)),
    },
  };

  alignAll(result, new Map([['vell', dia1], ['nou', dia2]]));

  check('mana l hora zero mes recent', result.times[0], '2026-09-02T00:00');
  check('el punt refrescat no es toca', result.points.nou.best_match.values.temperature[0], 200);
  check('al conservat se li talla el dia ja passat', result.points.vell.best_match.values.temperature[0], 124);
  check('i li queden nomes les hores de futur', result.points.vell.best_match.values.temperature.length, 24);
}

console.log('\n── Un punt tan vell que tota la seva serie ja ha passat ──');
{
  const felVuit = hours('2026-08-28', 48);
  const avui = hours('2026-09-02', 48);
  const result = {
    times: felVuit,
    points: { caducat: point(Array.from({ length: 48 }, () => 1)), nou: point(Array.from({ length: 48 }, () => 2)) },
  };
  alignAll(result, new Map([['caducat', felVuit], ['nou', avui]]));
  check('es descarta en lloc d ensenyar-se corregut', Object.keys(result.points), ['nou']);
}

console.log('\n── Dues series amb la mateixa hora zero: no s hi toca ──');
{
  const avui = hours('2026-09-02', 24);
  const result = { times: avui, points: { a: point([1, 2, 3]), b: point([4, 5, 6]) } };
  alignAll(result, new Map([['a', avui], ['b', avui]]));
  check('cap desplacament', result.points.a.best_match.values.temperature, [1, 2, 3]);
  check('ni al segon', result.points.b.best_match.values.temperature, [4, 5, 6]);
}

console.log('\n── Estrenar horitzo: de 168 a 336 hores ──');
{
  const curt = hours('2026-09-02', 168);
  const llarg = hours('2026-09-02', 336);
  const result = {
    times: curt,
    points: { vell: point(Array.from({ length: 168 }, () => 1)), nou: point(Array.from({ length: 336 }, () => 2)) },
  };
  alignAll(result, new Map([['vell', curt], ['nou', llarg]]));
  check('la segona setmana es visible', result.times.length, 336);
  check('i el punt curt es conserva sencer', result.points.vell.best_match.values.temperature.length, 168);
}

console.log('\n── El diumenge del canvi horari ──');
{
  // Un diumenge d octubre te 25 hores locals. La llista es literal a proposit:
  // el que es comprova es justament que el tall no es calcula amb dates.
  const dissabte = ['24T00', '24T01', '25T00', '25T01', '25T02a', '25T02b'];
  const diumenge = ['25T00', '25T01', '25T02a', '25T02b'];
  const result = { times: dissabte, points: { vell: point([1, 2, 3, 4, 5, 6]), nou: point([7, 8, 9, 10]) } };
  alignAll(result, new Map([['vell', dissabte], ['nou', diumenge]]));
  check('el tall es busca dins la serie', result.points.vell.best_match.values.temperature, [3, 4, 5, 6]);
}

console.log(failed ? `\n${failed} comprovacions fallides\n` : '\nTot correcte.\n');
if (failed) process.exit(1);
