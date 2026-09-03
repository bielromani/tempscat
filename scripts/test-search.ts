import { fold, match, matchWithContext } from '../src/lib/search-match.ts';

/**
 * El cercador, i sobretot el que no trobava.
 *
 * Aquesta prova existeix per un defecte que no donava cap error. La comparació
 * es feia amb `includes()`, així que a una consulta a la qual li faltés una
 * paraula del nom li tocava zero resultats:
 *
 *   «cala fosca»        no trobava  Cala la Fosca
 *   «sant cugat valles» no trobava  Sant Cugat del Vallès
 *
 * La pàgina sortia sencera, amb el formulari, el comptador a zero i un text
 * amable. El web funcionava i el lloc semblava no existir.
 */

let fails = 0;

function check(label: string, got: unknown, want: unknown) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log(`${ok ? 'ok   ' : 'FALLA'} ${label}`);
  if (!ok) console.log(`        esperat ${JSON.stringify(want)}, ha donat ${JSON.stringify(got)}`);
}

// ── fold: accents, articles i puntuació ─────────────────────────────────────
console.log('── fold ──');
const folds: [string, string][] = [
  ['Molló', 'mollo'],
  ["l'Ametlla del Vallès", 'ametlla del valles'],
  ["Ametlla del Vallès, l'", 'ametlla del valles'],
  ['el Prat de Llobregat', 'prat de llobregat'],
  ["s'Agaró", 'agaro'],
  ['Cerdanyola del Vallès', 'cerdanyola del valles'],
  ['Vall·llobrega', 'vall llobrega'],
  ['Embassament de Sau (Vilanova de Sau)', 'embassament de sau vilanova de sau'],
  ['GR-11', 'gr 11'],
  // L'article final només es treu quan hi ha la coma que el delata. Sense
  // aquesta condició, qualsevol nom acabat en «la» hi perdria un tros.
  ['Cala la Fosca', 'cala la fosca'],
];
for (const [raw, want] of folds) check(`${raw.padEnd(38)} → ${want}`, fold(raw), want);

// ── match: el defecte, cas per cas ──────────────────────────────────────────
console.log('\n── match: el que no es trobava ──');
const found: [string, string][] = [
  ['cala fosca', 'Cala la Fosca'],
  ['sant cugat valles', 'Sant Cugat del Vallès'],
  ['vall aran', "Vall d'Aran"],
  ['ametlla valles', "l'Ametlla del Vallès"],
  ['volta pedraforca', 'Volta al Pedraforca'],
  ['llosa cavall', 'la Llosa del Cavall'],
];
for (const [q, name] of found) {
  const m = match(fold(q), name);
  if (m <= 0) fails++;
  console.log(`${m > 0 ? 'ok   ' : 'FALLA'} «${q}» → ${name.padEnd(26)} ${m}`);
}

console.log('\n── match: l\'ordre dels graons ──');
check('exacte guanya el prefix',
  match(fold('sau'), 'Sau') > match(fold('sau'), 'Saus, Camallera i Llampaies'), true);
// Una paraula sencera de dins val mes que el principi d'una paraula de dins.
// Contra el **principi del nom** no: qui escriu «sau» i vol Saulons hi té dret,
// i entre poblacions ho desempata el nombre d'habitants, no aquesta funció.
check('paraula sencera guanya el principi de paraula de dins',
  match(fold('sau'), 'Vilanova de Sau') > match(fold('sau'), 'Santa Maria de Saulons'), true);
// Un nom sense res de sobra guanya el que en porta. «Platja de la Cala Fosca
// Gran» no serveix d'exemple: hi du «cala fosca» sencer i seguit, que és un
// senyal més fort que tenir-hi les mateixes paraules escampades.
check('el nom clavat guanya el nom amb paraules de més',
  match(fold('cala fosca'), 'Cala la Fosca')
    > match(fold('cala fosca'), 'Cala de la Fosca Petita'),
  true);
check('el començament del nom guanya el de dins',
  match(fold('valles'), 'Vallès Oriental') > match(fold('valles'), 'Mollet del Vallès'), true);

console.log('\n── match: el que no ha de trobar ──');
const missing: [string, string][] = [
  ['barcelona', 'Girona'],
  ['fosca', 'Cala Morisca'],
  ['pedraforca', 'Pedret i Marzà'],
];
for (const [q, name] of missing) {
  const m = match(fold(q), name);
  if (m !== 0) fails++;
  console.log(`${m === 0 ? 'ok   ' : 'FALLA'} «${q}» ✗ ${name.padEnd(26)} ${m}`);
}

// ── matchWithContext: el lloc ajuda, però val la meitat ─────────────────────
console.log('\n── matchWithContext ──');
check('«fosca palamos» troba la platja pel municipi',
  matchWithContext(fold('fosca palamos'), 'Cala la Fosca', 'Palamós') > 0, true);
check('el context no compta igual que el nom',
  matchWithContext(fold('fosca palamos'), 'Cala la Fosca', 'Palamós')
    < match(fold('cala fosca'), 'Cala la Fosca'),
  true);
check('sense context, no s\'inventa res',
  matchWithContext(fold('fosca palamos'), 'Cala la Fosca'), 0);

console.log(fails === 0 ? '\nOK' : `\n${fails} FALLADES`);
if (fails > 0) process.exitCode = 1;
