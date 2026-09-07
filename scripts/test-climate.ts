import {
  MONTH_MIN_DAYS, PROGRESS_MIN_DAYS, PROGRESS_MIN_YEARS, TREND_MIN_YEARS,
  monthProgressOf, rainYearsOf, rankOf, sameMonthAcrossYears, trendOf, yearsOf,
} from '../src/lib/climate-math.ts';
import type { StationMonth } from '../src/lib/climate-math.ts';

/**
 * L'històric climàtic d'una estació, i sobretot el que ha de descartar.
 *
 * Aquesta prova existeix perquè cap dels errors que aquest fitxer pot cometre
 * dona un error. Tots donen un número plausible:
 *
 *   · un mes amb quatre dies de dada promediat com si fos un mes sencer
 *   · un any al qual li falta el gener, que surt més càlid que un que el té
 *   · una tendència treta de restar el primer any a l'últim
 *   · «aquest setembre va +2,4 °C sobre la mitjana» dit el dia 5, comparant
 *     cinc dies contra trenta
 *
 * Els quatre surten en pantalla amb la seva coma decimal i el seu signe, i
 * ningú no els pot distingir del número bo mirant la pàgina.
 */

let fails = 0;

function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${label}`);
  if (!ok) console.log(`        esperat ${JSON.stringify(want)}, ha donat ${JSON.stringify(got)}`);
}

/** Un mes de la sèrie, amb els valors que no es miren ja plens. */
const m = (ym: string, tMean: number | null, days = 30, precip: number | null = 50): StationMonth =>
  ({ ym, tMean, tMax: tMean == null ? null : tMean + 8, tMin: tMean == null ? null : tMean - 8, precip, gustMax: 12, days });

/** Un any sencer amb la mateixa mitjana a tots els mesos. */
const yearOf = (year: number, tMean: number, days = 30) =>
  Array.from({ length: 12 }, (_, i) => m(`${year}-${String(i + 1).padStart(2, '0')}`, tMean, days));

// ── yearsOf: què és un any sencer ───────────────────────────────────────────
console.log('── yearsOf ──');

check('dotze mesos sencers són un any', yearsOf(yearOf(2000, 14)).length, 1);
check('onze mesos no són un any', yearsOf(yearOf(2000, 14).slice(0, 11)).length, 0);

/*
 * El cas que motiva tot el fitxer: un any al qual li falta el gener.
 *
 * Amb els mesos que hi ha promediats, l'any surt a 15,7 °C i el de dotze
 * mesos a 14,0. Posats al mateix gràfic, l'any incomplet sembla el més càlid
 * de la sèrie i el que passa és que li falta l'hivern.
 */
const shortYear = [
  m('2001-01', 2, 4), // gener amb quatre dies: fora
  ...Array.from({ length: 11 }, (_, i) => m(`2001-${String(i + 2).padStart(2, '0')}`, 15.7)),
];
check(`un mes amb 4 dies (< ${MONTH_MIN_DAYS}) invalida l'any`, yearsOf(shortYear).length, 0);
check('i amb el gener sencer, l\'any hi entra',
  yearsOf([m('2001-01', 2), ...shortYear.slice(1)]).length, 1);

const mixed = yearsOf([...yearOf(1999, 13), ...yearOf(2000, 14), ...yearOf(2001, 15)]);
check('van ordenats de menys a més', mixed.map((y) => y.year), [1999, 2000, 2001]);
check('la mitjana de l\'any és la de les seves mitjanes', mixed[1].tMean, 14);
check('la màxima de l\'any és absoluta, no una mitjana de màximes', mixed[1].tMax, 22);
check('la pluja de l\'any és la suma dels dotze mesos', mixed[1].precip, 600);

const holed = yearOf(2002, 14).map((x, i) => (i === 5 ? { ...x, precip: null } : x));
check('un mes sense pluja deixa l\'any sense total', yearsOf(holed)[0].precip, null);

// ── rainYearsOf: la pluja no demana termòmetre ──────────────────────
console.log('\n── rainYearsOf ──');

/*
 * El cas de veritat: el Pantà de Sau i tres més només mesuren pluja. Sau en
 * porta 368 mesos sencers —trenta anys— i amb la condició de `yearsOf`, que
 * demana mitjana de temperatura, la seva pàgina no ensenyava cap gràfic.
 */
const rainOnly = Array.from({ length: 30 }, (_, i) =>
  Array.from({ length: 12 }, (_, k) =>
    m(`${1996 + i}-${String(k + 1).padStart(2, '0')}`, null, 30, 60))).flat();
check('trenta anys de pluviòmetre sense termòmetre són trenta anys',
  rainYearsOf(rainOnly).length, 30);
check('i sumen els dotze mesos', rainYearsOf(rainOnly)[0].precip, 720);
check('però no són cap any de temperatura', yearsOf(rainOnly).length, 0);

const rainHole = yearOf(2001, 14).map((x, i) => (i === 9 ? { ...x, precip: null } : x));
check('un any al qual li falta l\'octubre de pluja no hi entra',
  rainYearsOf(rainHole).length, 0);
check('i el mes curt tampoc no compta',
  rainYearsOf(yearOf(2002, 14, 10)).length, 0);

// ── sameMonthAcrossYears ────────────────────────────────────────────────────
console.log('\n── sameMonthAcrossYears ──');

const septembers = [
  m('2020-09', 20), m('2021-09', 21), m('2022-09', 22, 10), m('2023-09', 23),
  m('2020-08', 25), // un altre mes, no hi ha de sortir
];
check('només el mes demanat', sameMonthAcrossYears(septembers, 9).map((x) => x.year), [2020, 2021, 2023]);
check('i el setembre de 10 dies queda fora', sameMonthAcrossYears(septembers, 9).length, 3);

/*
 * No demana temperatura, a posta: si la demanava, una estació que només mesura
 * pluja no podia dir quin va ser el seu setembre més plujós. Qui dibuixi una
 * mitjana ha de filtrar `tMean` ell mateix.
 */
const rainSepts = [m('2020-09', null, 30, 90), m('2021-09', null, 30, 40)];
check('un mes sencer sense temperatura hi és igual',
  sameMonthAcrossYears(rainSepts, 9).map((x) => x.precip), [90, 40]);

// ── trendOf ─────────────────────────────────────────────────────────────────
console.log('\n── trendOf ──');

/*
 * El pas és de 0,1 °C per any i no de 0,05 a posta: la mitjana de cada any es
 * publica amb un decimal, i amb passos de 0,05 el que mesuraria la prova és
 * l'arrodoniment —surt +0,48— en comptes del pendent.
 */
const straight = Array.from({ length: 20 }, (_, i) => yearOf(1990 + i, 14 + i * 0.1)).flat();
const t = trendOf(yearsOf(straight));
check('+0,1 °C per any són +1 per dècada', t?.perDecade, 1);
check('i diu sobre quants anys ho ha mesurat', t?.years, 20);
check('amb els seus extrems', [t?.from, t?.to], [1990, 2009]);

const short = Array.from({ length: TREND_MIN_YEARS - 1 }, (_, i) => yearOf(2000 + i, 14 + i * 0.1)).flat();
check(`per sota de ${TREND_MIN_YEARS} anys no hi ha recta`, trendOf(yearsOf(short)), null);

/*
 * I la raó de no restar el primer any a l'últim.
 *
 * Vint anys plans amb l'últim a +3 °C. La recta veu un pendent petit, que és
 * el que hi ha; «l'últim menys el primer» donaria +1,58 °C per dècada i
 * l'estació sortiria com la que s'escalfa més de Catalunya per un sol any.
 */
const spike = Array.from({ length: 20 }, (_, i) => yearOf(1990 + i, i === 19 ? 17 : 14)).flat();
const naive = (17 - 14) / 19 * 10;
const ls = trendOf(yearsOf(spike))!.perDecade;
check('un any excepcional no decideix la tendència', ls < naive / 2, true);
console.log(`        mínims quadrats ${ls} · l'últim menys el primer ${naive.toFixed(2)}`);

// ── rankOf ──────────────────────────────────────────────────────────────────
console.log('\n── rankOf ──');
check('el més alt és el primer', rankOf(30, [10, 20, 30]), { rank: 1, total: 3 });
check('el més baix és l\'últim', rankOf(10, [10, 20, 30]), { rank: 3, total: 3 });
check('empat: comparteix el lloc de dalt', rankOf(20, [10, 20, 20, 30]), { rank: 2, total: 4 });

// ── monthProgressOf: el mes en curs contra el seu propi tros ────────────────
console.log('\n── monthProgressOf ──');

/** Els dies `01..n` de cada setembre de `years`, amb la temperatura de l'any. */
function septs(years: Array<[number, number]>, n: number) {
  return years.flatMap(([year, tMean]) =>
    Array.from({ length: n }, (_, i) => ({ day: `${year}-09-${String(i + 1).padStart(2, '0')}`, tMean })));
}

const twelve: Array<[number, number]> = Array.from({ length: 12 }, (_, i) => [2014 + i, 18 + i * 0.1]);
const p = monthProgressOf(septs(twelve, 5), '2025-09-07');

check('dotze anys amb cinc dies donen una comparació', p != null, true);
check('la finestra són els cinc dies que hi ha', p?.days, 5);
check('l\'últim dia és el 5, no el 7 en què es demana', p?.lastDay, '2025-09-05');
check('el més càlid és l\'últim any', p?.rank, 1);
check('sobre els dotze', p?.total, 12);
check('i la mitjana de la finestra és la dels dotze', p?.normal, 18.6);
check('amb el més fred ben posat', p?.coldest, { year: 2014, tMean: 18 });

/*
 * El cas que fa que això existeixi: un any dolent enmig de la sèrie.
 *
 * 2025 va a 18 °C, que és exactament el que hi feia el 2014. Si la comparació
 * es fes contra la mitjana del mes sencer, no hi hauria manera de dir-ho.
 */
const cool = monthProgressOf(
  septs([...twelve.slice(0, 11), [2025, 18]], 5), '2025-09-07',
);
check('el mateix valor que el primer any comparteix el seu lloc', cool?.rank, 11);
check('i la frase pot dir de quants', cool?.total, 12);

// Cobertures que no arriben
check(`amb ${PROGRESS_MIN_DAYS - 1} dies del mes no es diu res`,
  monthProgressOf(septs(twelve, PROGRESS_MIN_DAYS - 1), '2025-09-07'), null);
check(`amb ${PROGRESS_MIN_YEARS - 1} anys tampoc`,
  monthProgressOf(septs(twelve.slice(0, PROGRESS_MIN_YEARS - 1), 5), '2025-09-07'), null);

/*
 * Un any passat al qual li falten dies de la finestra queda fora.
 *
 * Sense això, un 2018 que només tingués l'1 de setembre hi entraria amb la
 * mitjana d'un dia, i un dia qualsevol de setembre pot ser el més càlid o el
 * més fred de la sèrie sense que aquell setembre ho fos. Aquí 2018 té dos dels
 * cinc: hauria de sortir de la comparació sencera i, per tant, quedar-se en
 * dotze anys menys un.
 */
const gappy = [
  ...septs(twelve, 5).filter((d) => !(d.day.startsWith('2018-') && Number(d.day.slice(8, 10)) > 2)),
  { day: '2026-09-01', tMean: 30 }, // un any futur amb un sol dia: també fora
];
const g = monthProgressOf(gappy, '2025-09-07');
check('un any amb 2 dies de 5 no compta', g?.total, 11);

/*
 * I la finestra són els dies que **aquest any** té, no de l'1 al N.
 *
 * Si aquest any hi falta el dia 3, el dia 3 dels altres anys tampoc no compta:
 * altrament es comparen quatre dies contra cinc, i el dia que sobra tira la
 * mitjana cap on li sembli.
 */
const noThird = septs(twelve, 6).filter((d) => !(d.day.startsWith('2025-') && d.day.endsWith('-03')));
const n3 = monthProgressOf(noThird, '2025-09-07');
check('sense el dia 3 d\'aquest any, la finestra són els altres 5', n3?.days, 5);
check('i els altres anys hi entren igual', n3?.total, 12);

/*
 * I amb menys dies que el mínim no es diu res, encara que el forat sigui al
 * mig: quatre dies mesurats són quatre dies, tant si falta el 3 com si el mes
 * acaba de començar.
 */
check('quatre dies amb un forat al mig tampoc no arriben',
  monthProgressOf(
    septs(twelve, 5).filter((d) => !(d.day.startsWith('2025-') && d.day.endsWith('-03'))),
    '2025-09-07',
  ), null);

// Els dies posteriors a la data demanada no hi entren mai.
const future = monthProgressOf(septs(twelve, 20), '2025-09-07');
check('la finestra s\'atura al dia demanat', future?.days, 7);
check('i l\'últim dia és aquell', future?.lastDay, '2025-09-07');

console.log(fails ? `\n${fails} comprovacions han fallat` : '\nTot correcte');
process.exit(fails ? 1 : 0);
