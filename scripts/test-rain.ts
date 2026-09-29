/**
 * La pluja dels dos últims dies, que la sèrie diària encara no té.
 *
 * El cas que ho va fer necessari: el 29 de setembre de 2026, a Lilla, «Pluja
 * 24 h: 16,6 mm» a dalt de la fitxa i «Últim ruixat: fa més de 45 dies» a baix,
 * de la mateixa estació. Ver `src/lib/recent-rain.ts`.
 *
 * I, de pas, les dues peces de text que la mateixa passada va arreglar i que
 * no importen res: la contracció del rumb i la pressió al nivell del mar.
 */
import { addDays, dryStreakOf, withMeasuredRain, type RainDay } from '../src/lib/recent-rain.ts';
import { fromDirection } from '../src/lib/format.ts';
import { seaLevelPressure } from '../src/lib/variables.ts';

let bad = 0;
function check(what: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) bad++;
  console.log(`${ok ? '✓' : '✗'} ${what}${ok ? '' : ` · surt ${JSON.stringify(got)}, calia ${JSON.stringify(want)}`}`);
}

/** Una sèrie de `n` dies secs que s'acaba el dia `last`. */
function dry(n: number, last: string): RainDay[] {
  return Array.from({ length: n }, (_, i) => ({ day: addDays(last, i - n + 1), precip: 0 }));
}

// ── Aritmètica de dies ─────────────────────────────────────────────────────
check('addDays travessa el final de mes', addDays('2026-09-30', 1), '2026-10-01');
check('addDays enrere, a l\'any anterior', addDays('2026-01-01', -1), '2025-12-31');
check('addDays el dia del canvi d\'hora', addDays('2026-10-25', 1), '2026-10-26');

// ── El cas de Lilla ────────────────────────────────────────────────────────
{
  // La sèrie arriba fins al 27 i avui és el 29; ahir no va ploure i avui sí.
  const series = dry(40, '2026-09-27');
  const out = withMeasuredRain(series, { day: '2026-09-29', today: 16.6, yesterday: 0 });
  check('s\'allarga fins avui', out.at(-1), { day: '2026-09-29', precip: 16.6 });
  check('ahir entra amb el que es va mesurar', out.at(-2), { day: '2026-09-28', precip: 0 });
  check('la sèrie original no es toca', series.length, 40);
  check('amb pluja avui, la ratxa seca és zero', dryStreakOf(out), 0);
}

// ── Un dia que cap de les dues fonts cobreix es queda nul ──────────────────
{
  const out = withMeasuredRain(dry(20, '2026-09-25'), { day: '2026-09-29', today: 0, yesterday: 0 });
  check('els dies del forat entren nuls', out.slice(-4).map((d) => d.precip), [null, null, 0, 0]);
  check('i un nul talla la ratxa seca', dryStreakOf(out), 2);
}

// ── La sèrie diària mana on ja té valor ────────────────────────────────────
{
  const series: RainDay[] = [...dry(10, '2026-09-27'), { day: '2026-09-28', precip: 3.1 }];
  const out = withMeasuredRain(series, { day: '2026-09-29', today: 1.0, yesterday: 2.9 });
  check('el valor de la sèrie no el trepitja l\'agregat', out.find((d) => d.day === '2026-09-28')?.precip, 3.1);
  check('i on la sèrie té un nul, l\'omple', withMeasuredRain(
    [...dry(10, '2026-09-27'), { day: '2026-09-28', precip: null }],
    { day: '2026-09-29', today: 0, yesterday: 4.2 },
  ).find((d) => d.day === '2026-09-28')?.precip, 4.2);
}

// ── Passada la mitjanit, «avui» és el dia de l'agregat ─────────────────────
{
  // Instantània de les 23:50 del 29 servida a les 00:10 del 30: el seu «today»
  // és el 29. Amb el dia del rellotge, els 12 mm caurien al 30.
  const out = withMeasuredRain(dry(20, '2026-09-27'), { day: '2026-09-29', today: 12, yesterday: 0 });
  check('no s\'inventa el dia 30', out.at(-1)?.day, '2026-09-29');
}

// ── Passada la mitjanit, abans de la primera lectura del dia ───────────────
{
  // A les 00:30 la XEMA encara no ha publicat res d'avui: `today` és nul.
  const out = withMeasuredRain(dry(20, '2026-09-27'), { day: '2026-09-29', today: null, yesterday: 0 });
  check('un avui buit no entra com a forat', out.at(-1), { day: '2026-09-28', precip: 0 });
  check('i la ratxa seca no es talla', dryStreakOf(out), 21);
}

// ── Sense lectura d'avui, tot queda igual ──────────────────────────────────
check('sense mesura, la mateixa sèrie', withMeasuredRain(dry(3, '2026-09-27'), null).length, 3);

// ── Rumb ───────────────────────────────────────────────────────────────────
check('del NNO', fromDirection('NNO'), 'del NNO');
check('del SSE (sud-sud-est)', fromDirection('SSE'), 'del SSE');
check("de l'ESE (est-sud-est)", fromDirection('ESE'), "de l'ESE");
check("de l'O (oest)", fromDirection('O'), "de l'O");

// ── Pressió ────────────────────────────────────────────────────────────────
// A Lilla, 967 hPa a l'Espluga de Francolí (~490 m) amb 23,7 °C.
check('967 hPa a 490 m són uns 1.023 al nivell del mar', Math.round(seaLevelPressure(967, 490, 23.7)), 1023);
check('a nivell del mar no es toca', Math.round(seaLevelPressure(1019, 0, 22)), 1019);

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'fallada' : 'fallades'}.`);
  process.exit(1);
}
console.log('\nOK');
