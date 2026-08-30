import { toNaturalName, slugify, sameName, normalizeKey } from './lib/catalan.ts';

const cases: [string, string, string][] = [
  ['Montblanc', 'Montblanc', 'montblanc'],
  ['Guàrdia dels Prats, la', 'la Guàrdia dels Prats', 'la-guardia-dels-prats'],
  ["Ametlla del Vallès, l'", "l'Ametlla del Vallès", 'l-ametlla-del-valles'],
  ['Pinetell, el', 'el Pinetell', 'el-pinetell'],
  ['Cogul, el', 'el Cogul', 'el-cogul'],
  ['Sant Llorenç Savall', 'Sant Llorenç Savall', 'sant-llorenc-savall'],
  ["Cabrera d'Anoia", "Cabrera d'Anoia", 'cabrera-d-anoia'],
  ['Vall de Boí, la', 'la Vall de Boí', 'la-vall-de-boi'],
  ['Palau-solità i Plegamans', 'Palau-solità i Plegamans', 'palau-solita-i-plegamans'],
  ['Torre de Cabdella, la', 'la Torre de Cabdella', 'la-torre-de-cabdella'],
  ['Espluga Calba, l\'', "l'Espluga Calba", 'l-espluga-calba'],
  ['Vilanova i la Geltrú', 'Vilanova i la Geltrú', 'vilanova-i-la-geltru'],
];

let fails = 0;
for (const [indexed, expectedName, expectedSlug] of cases) {
  const natural = toNaturalName(indexed);
  const slug = slugify(natural);
  const ok = natural === expectedName && slug === expectedSlug;
  if (!ok) fails++;
  console.log(`${ok ? 'ok  ' : 'FALLO'} ${indexed.padEnd(28)} → ${natural.padEnd(26)} → ${slug}`);
  if (!ok) console.log(`      esperado: ${expectedName} / ${expectedSlug}`);
}

// Ela geminada y comparaciones
console.log('\nl·l →', slugify('Cerdanyola del Vallès'), '|', slugify("Vall·llobrega"));
console.log('sameName("la Guàrdia dels Prats","Guardia dels Prats") =', sameName('la Guàrdia dels Prats', 'Guardia dels Prats'));
console.log('sameName("Montblanc","Montblanc") =', sameName('Montblanc', 'Montblanc'));
console.log('sameName("Lilla","el Pinetell") =', sameName('Lilla', 'el Pinetell'));
console.log('normalizeKey("l\'Ametlla del Vallès") =', JSON.stringify(normalizeKey("l'Ametlla del Vallès")));
console.log(fails === 0 ? '\nTODOS LOS CASOS OK' : `\n${fails} FALLOS`);

// ── Emparejamiento tolerante ────────────────────────────────────────────────
import { fuzzyMatch, splitCompound, isStatisticalUnit, levenshtein } from './lib/catalan.ts';

console.log('\n── fuzzyMatch ──');
const fuzzy: [string, string, boolean][] = [
  ['les Vil.les', 'les Vil·les', true],
  ['el Cònsul', 'el Cònsol', true],
  ['Garrofers', 'Garrofers', true],
  ['Collsacreu', 'Collserola', false],
  ['Lilla', 'Lillet', false],
  ['la Guàrdia dels Prats', 'Guardia dels Prats', true],
  ['Prenafeta', 'Prenafeta Vella', false],
];
let ff = 0;
for (const [a, b, want] of fuzzy) {
  const got = fuzzyMatch(a, b);
  if (got !== want) ff++;
  console.log(`${got === want ? 'ok  ' : 'FALLO'} ${a.padEnd(24)} ~ ${b.padEnd(22)} → ${got}`);
}

console.log('\n── splitCompound ──');
for (const n of ['Porquerisses i Albarells', 'Can Valls i Torre del Negrell', 'Vilanova i la Geltrú', 'Lilla']) {
  console.log(`  ${n.padEnd(32)} → ${JSON.stringify(splitCompound(n))}`);
}

console.log('\n── isStatisticalUnit ──');
const stat: [string, boolean][] = [
  ["Entitat Est d'Abrera", true],
  ['Barri Nord', true],
  ['Barri Orient', true],
  ['Sector 3', true],
  ['Disseminat de Lilla', true],
  ['Lilla', false],
  ['la Guàrdia dels Prats', false],
  ['Barri de Sant Pere', false],
];
for (const [n, want] of stat) {
  const got = isStatisticalUnit(n);
  if (got !== want) ff++;
  console.log(`${got === want ? 'ok  ' : 'FALLO'} ${n.padEnd(26)} → ${got}`);
}

console.log(`\nlevenshtein("consul","consol") = ${levenshtein('consul', 'consol')}`);
console.log(ff === 0 ? '\nEMPAREJAMIENTO OK' : `\n${ff} FALLOS DE EMPAREJAMIENTO`);
