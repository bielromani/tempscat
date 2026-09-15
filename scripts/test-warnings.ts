/**
 * Que la pila d'avisos d'un lloc no perdi mai res.
 *
 *   npm run test:warnings
 *
 * ## Per què això necessita una prova i la resta de targetes no
 *
 * Perquè és **l'únic lloc del web on el codi decideix no ensenyar una dada**, i
 * quan s'equivoqui el resultat serà una targeta més neta. No hi haurà cap
 * error, cap execució en roig i cap manera de notar-ho mirant la pàgina: un
 * avís que hi hauria de ser i no hi és s'assembla exactament a un avís que no
 * existeix.
 *
 * Així que es comprova la propietat que importa —**el que entra, surt**— i
 * cadascuna de les quatre condicions que permeten descartar un avís, d'una en
 * una. Treure'n qualsevol és el que faria que això comencés a amagar coses.
 *
 * I al final es passa sobre la instantània publicada de debò: totes les
 * ubicacions amb avís, una per una.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  LEVEL_RANK, groupWarnings, stackWarnings, thresholdParam,
  type Warning, type WarningLevel,
} from '../src/lib/warning-stack.ts';
import { thresholdValue } from '../src/lib/warning-labels.ts';
import { ROOT } from './lib/paths.ts';

let bad = 0;
const fail = (msg: string) => { console.error(`  ✗ ${msg}`); bad++; };
const ok = (msg: string) => console.log(`  ✓ ${msg}`);

/** Un avís mínim. Només importen els camps que decideixen. */
function w(
  id: string, phenomenon: string, level: WarningLevel,
  onset: string, expires: string, threshold?: string, zones = ['Litoral de Barcelona'],
): Warning {
  return {
    id, event: `Aviso de ${phenomenon}`, phenomenon, level, severity: 'Moderate',
    onset, expires, headline: '', description: '', instruction: '',
    threshold, web: 'https://www.aemet.es/', zones,
    locationIds: ['x'], comarcaCodis: ['13'],
  };
}

// ── El paràmetre del llindar ───────────────────────────────────────────────
console.log('La magnitud del llindar, sense el valor:\n');
for (const [input, want] of [
  ['Precipitación acumulada en una hora · 40 mm', 'precipitación acumulada en una hora'],
  ['Precipitación acumulada en 12 horas · 60 mm', 'precipitación acumulada en 12 horas'],
  ['Temperatura máxima · 34 ºC', 'temperatura máxima'],
  ['Tormentas · ', 'tormentas'],
  [undefined, ''],
] as Array<[string | undefined, string]>) {
  const got = thresholdParam(input);
  if (got !== want) fail(`${input} → «${got}», s'esperava «${want}»`);
  else ok(`${input ?? '(sense llindar)'} → «${got}»`);
}

// ── El llindar, tal com es llegeix ─────────────────────────────────────────
console.log('\nEl llindar tal com surt a la targeta:\n');
for (const [input, want] of [
  // La finestra d'acumulació hi ha de ser: sense ella, els dos avisos de pluja
  // d'Agullana es llegien com el mateix repetit.
  ['Precipitación acumulada en 12 horas · 100 mm', '100 mm en 12 h'],
  ['Precipitación acumulada en una hora · 20 mm', '20 mm en 1 h'],
  // La temperatura no acumula res: el número sol ja ho diu tot.
  ['Temperatura máxima · 34 ºC', '34 °C'],
  // I un llindar sense cap xifra és l'etiqueta repetida, en castellà.
  ['Tormentas · ', null],
  ['Tormentas', null],
  [undefined, null],
] as Array<[string | undefined, string | null]>) {
  const got = thresholdValue(input);
  if (got !== want) fail(`${input} → «${got}», s'esperava «${want}»`);
  else ok(`${input ?? '(sense llindar)'} → ${got === null ? 'res' : `«${got}»`}`);
}

// ── L'agrupació ────────────────────────────────────────────────────────────
console.log('\nUna onada de calor de tres dies és una targeta:\n');
{
  const tres = [
    w('a1', 'AT', 'groc', '2026-09-08T13:00:00+02:00', '2026-09-08T20:59:59+02:00', 'Temperatura máxima · 34 ºC'),
    w('a2', 'AT', 'groc', '2026-09-09T13:00:00+02:00', '2026-09-09T20:59:59+02:00', 'Temperatura máxima · 35 ºC'),
    w('a3', 'AT', 'groc', '2026-09-10T13:00:00+02:00', '2026-09-10T20:59:59+02:00', 'Temperatura máxima · 34 ºC'),
  ];
  const g = groupWarnings(tres);
  if (g.length !== 1) fail(`tres dies iguals havien de ser 1 grup i són ${g.length}`);
  else if (g[0].spans.length !== 3) fail(`el grup havia de guardar els 3 dies i en guarda ${g[0].spans.length}`);
  else ok(`3 avisos → 1 grup amb 3 trams, i els llindars de cada dia intactes`);
}

console.log('\nDues magnituds de pluja al mateix nivell NO són el mateix avís:\n');
{
  /*
   * Aquest és el cas que la clau vella no separava.
   *
   * Amb `fenomen|nivell|zona` els dos grocs queien al mateix grup i la llista
   * de dies els ensenyava com si fossin dos dies de la mateixa cosa: dos
   * números correctes dient una cosa falsa, sense cap error.
   */
  const dos = [
    w('b1', 'PR', 'groc', '2026-09-09T04:00:00+02:00', '2026-09-09T17:59:59+02:00', 'Precipitación acumulada en una hora · 20 mm'),
    w('b2', 'PR', 'groc', '2026-09-09T04:00:00+02:00', '2026-09-09T17:59:59+02:00', 'Precipitación acumulada en 12 horas · 60 mm'),
  ];
  const g = groupWarnings(dos);
  if (g.length !== 2) fail(`20 mm en una hora i 60 en dotze havien de ser 2 grups i són ${g.length}`);
  else ok('20 mm en una hora i 60 mm en dotze van a targetes diferents');
}

// ── La pila ────────────────────────────────────────────────────────────────
console.log('\nBarcelona, 9 de setembre de 2026 — quatre avisos alhora:\n');
{
  const bcn = groupWarnings([
    w('c1', 'AT', 'groc', '2026-09-08T13:00:00+02:00', '2026-09-08T20:59:59+02:00', 'Temperatura máxima · 34 ºC'),
    w('c2', 'PR', 'taronja', '2026-09-09T04:00:00+02:00', '2026-09-09T17:59:59+02:00', 'Precipitación acumulada en una hora · 40 mm'),
    w('c3', 'PR', 'groc', '2026-09-09T04:00:00+02:00', '2026-09-09T17:59:59+02:00', 'Precipitación acumulada en 12 horas · 60 mm'),
    w('c4', 'TO', 'groc', '2026-09-09T04:00:00+02:00', '2026-09-09T17:59:59+02:00', 'Tormentas · '),
  ]);
  const s = stackWarnings(bcn)!;
  if (s.lead.level !== 'taronja' || s.lead.phenomenon !== 'PR') {
    fail(`havia de manar el taronja de pluja i mana ${s.lead.level} ${s.lead.phenomenon}`);
  } else ok('mana el taronja de pluja');
  if (s.rest.length !== 3) fail(`havien d'acompanyar 3 avisos i n'acompanyen ${s.rest.length}`);
  else ok('els altres tres queden a una línia cadascun');
  if (s.dropped.length !== 0) {
    fail(`no n'havia de caure cap i n'han caigut ${s.dropped.length}: ${s.dropped.map((d) => d.phenomenon).join(', ')}`);
  } else ok('cap no desapareix — el groc de 60 mm en 12 h diu una cosa que el taronja no diu');
}

console.log('\nQuan sí que en sobra un, i quan no:\n');
{
  const alt = w('d1', 'PR', 'taronja', '2026-09-09T04:00:00+02:00', '2026-09-09T18:00:00+02:00', 'Precipitación acumulada en una hora · 40 mm');

  /** El de sota, amb una condició canviada cada vegada. */
  const casos: Array<[string, Warning, boolean]> = [
    ['mateix fenomen, mateixa magnitud, hores a dins, nivell més baix',
      w('d2', 'PR', 'groc', '2026-09-09T06:00:00+02:00', '2026-09-09T12:00:00+02:00', 'Precipitación acumulada en una hora · 20 mm'), true],
    ['…però una altra magnitud',
      w('d3', 'PR', 'groc', '2026-09-09T06:00:00+02:00', '2026-09-09T12:00:00+02:00', 'Precipitación acumulada en 12 horas · 60 mm'), false],
    ['…però un altre fenomen',
      w('d4', 'TO', 'groc', '2026-09-09T06:00:00+02:00', '2026-09-09T12:00:00+02:00', 'Precipitación acumulada en una hora · 20 mm'), false],
    ['…però acaba més tard que el de dalt',
      w('d5', 'PR', 'groc', '2026-09-09T06:00:00+02:00', '2026-09-09T23:00:00+02:00', 'Precipitación acumulada en una hora · 20 mm'), false],
    ['…però comença abans que el de dalt',
      w('d6', 'PR', 'groc', '2026-09-09T01:00:00+02:00', '2026-09-09T12:00:00+02:00', 'Precipitación acumulada en una hora · 20 mm'), false],
    ['…però és del mateix nivell',
      w('d7', 'PR', 'taronja', '2026-09-09T06:00:00+02:00', '2026-09-09T12:00:00+02:00', 'Precipitación acumulada en una hora · 30 mm'), false],
  ];

  for (const [label, sota, hauriaDeCaure] of casos) {
    const s = stackWarnings(groupWarnings([alt, sota]))!;
    const cau = s.dropped.length === 1;
    if (cau !== hauriaDeCaure) {
      fail(`${label}: ${cau ? 'ha caigut' : 'no ha caigut'} i ${hauriaDeCaure ? 'havia de caure' : 'no havia de caure'}`);
    } else {
      ok(`${label} → ${cau ? 'en sobra un' : 'es queden els dos'}`);
    }
    if (s.lead.level !== 'taronja') fail(`${label}: hauria de manar el taronja`);
  }
}

// ── La propietat que ho aguanta tot ────────────────────────────────────────
console.log('\nSobre la instantània publicada, ubicació per ubicació:\n');
{
  const snap = JSON.parse(readFileSync(join(ROOT, 'data', 'cache', 'warnings.json'), 'utf8')) as { data: Warning[] };
  const perLloc = new Map<string, Warning[]>();
  for (const a of snap.data) {
    for (const id of a.locationIds) {
      if (!perLloc.has(id)) perLloc.set(id, []);
      perLloc.get(id)!.push(a);
    }
  }

  let perduts = 0;
  let capDeCua = 0;
  let caiguts = 0;
  let maxAlhora = 0;

  for (const [id, avisos] of perLloc) {
    const grups = groupWarnings(avisos);
    const s = stackWarnings(grups);
    if (!s) { fail(`${id} té ${avisos.length} avisos i la pila surt buida`); continue; }

    maxAlhora = Math.max(maxAlhora, grups.length);
    caiguts += s.dropped.length;

    // Res no es perd pel camí.
    const sortida = new Set([s.lead, ...s.rest, ...s.dropped].map((g) => g.key));
    if (sortida.size !== grups.length) { perduts++; continue; }

    // I el que mana és el més greu de tots.
    const pitjor = Math.max(...grups.map((g) => LEVEL_RANK[g.level]));
    if (LEVEL_RANK[s.lead.level] !== pitjor) capDeCua++;
  }

  console.log(`  ${perLloc.size} ubicacions amb avís · fins a ${maxAlhora} alhora`);
  if (perduts) fail(`${perduts} ubicacions perden algun avís pel camí`);
  else ok('cap ubicació perd cap avís: el que entra, surt');
  if (capDeCua) fail(`${capDeCua} ubicacions ensenyen com a principal un avís que no és el més greu`);
  else ok('a totes mana el més greu');
  ok(`avisos descartats per no dir res de nou: ${caiguts}`);
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'comprovació ha fallat' : 'comprovacions han fallat'}.`);
  process.exit(1);
}
console.log('\nCap avís no es perd pel camí.');
