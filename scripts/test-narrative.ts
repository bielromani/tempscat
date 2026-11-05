/**
 * Comprobación del motor de frases con perfiles sintéticos.
 *
 * Existe porque los casos que importan **no se pueden ver en la web cuando
 * toca**. El día que se escribió esto no llovía en toda Catalunya, así que la
 * rama que describe una tormenta concentrada no se ejecutaba en ninguna de las
 * 4.293 páginas: la única forma de saber si la frase sale bien es fabricar el
 * perfil.
 *
 * Y es justo la rama que más importa. «Plou de 4 a 7» es la frase que el usuario
 * señaló como inútil: a las cuatro pueden ser cuatro gotas y a las seis una
 * tromba, y el tramo entero se lee igual en los dos casos.
 */
import {
  dayNotes, dayParts, narrativeFor, rainIntensity, rainWarnedAt, rainWarnedOn, rainWindows, unratedRainLabel,
  warnedIconLabel, type RainWarning,
} from '../src/lib/narrative.ts';
import type { HourlyPoint } from '../src/lib/forecast-types.ts';
import { describeLocation, describeMunicipi, metaDescription } from '../src/lib/describe.ts';
import type { Comarca, Location } from '../src/lib/territory.ts';

const DAY = '2026-11-14';
const NEXT = '2026-11-15';
const NOW = `${DAY}T12`;

/** Una hora de serie, con los valores que no se declaran puestos a algo plausible. */
function h(index: number, over: Partial<HourlyPoint> = {}): HourlyPoint {
  const hh = index % 24;
  const iso = `${index < 24 ? DAY : NEXT}T${String(hh).padStart(2, '0')}:00`;
  return {
    time: iso,
    temperature: 14,
    apparent: 14,
    precipitation: 0,
    precipProbability: 5,
    weatherCode: 3,
    cloudCover: 60,
    humidity: 70,
    dewPoint: 9,
    pressure: 1015,
    windSpeed: 3,
    windDirection: 180,
    windGust: 6,
    uvIndex: 1,
    visibility: 20000,
    freezingLevel: 2200,
    snowfall: 0,
    cape: 0,
    isDay: hh >= 8 && hh < 18,
    spread: 0.5,
    ...over,
  };
}

/**
 * Serie de **48 h** a partir de una tabla de {índice: cambios}.
 *
 * Dos días, no uno, y no es un detalle: la ventana de la helada va de las 20 h a
 * las 9 h del día siguiente, así que con 24 horas el trozo que importa quedaba
 * fuera y la comprobación pasaba sin comprobar nada. Los índices de 24 en
 * adelante son del día siguiente.
 */
function series(changes: Record<number, Partial<HourlyPoint>>): HourlyPoint[] {
  return Array.from({ length: 48 }, (_, i) => h(i, changes[i] ?? {}));
}

const rain = (mm: number, prob: number, code = 61): Partial<HourlyPoint> =>
  ({ precipitation: mm, precipProbability: prob, weatherCode: code });

// ── La escala de intensidad ────────────────────────────────────────────────
console.log('── Intensitat, escala AEMET en mm/h ──');
for (const mm of [0.2, 1.9, 2.1, 8, 15, 22, 31, 55, 61, 120]) {
  console.log(`  ${String(mm).padStart(5)} mm/h → ${rainIntensity(mm)}`);
}

// ── Los cuatro perfiles ────────────────────────────────────────────────────
const CASOS: Array<{ nom: string; hours: HourlyPoint[] }> = [
  {
    nom: 'Quatre gotes: probabilitat alta, acumulat insignificant',
    hours: series({ 15: rain(0.1, 65), 16: rain(0.1, 70), 17: rain(0.1, 60) }),
  },
  {
    nom: 'Concentrada: comença fluix i a les 18 h cau una tromba',
    hours: series({
      16: rain(0.4, 60), 17: rain(1.2, 80), 18: rain(21, 95, 95), 19: rain(2, 70),
    }),
  },
  {
    nom: 'Contínua i plana: sis hores de pluja feble',
    hours: series({
      14: rain(1.1, 80), 15: rain(1.2, 85), 16: rain(1.0, 85),
      17: rain(1.3, 80), 18: rain(1.1, 75), 19: rain(1.2, 70),
    }),
  },
  {
    nom: 'Intermitent: dos trams separats, el segon amb tempesta',
    hours: series({
      13: rain(2, 70), 14: rain(1, 60),
      19: rain(4, 85), 20: rain(18, 95, 99), 21: rain(3, 80),
    }),
  },
  {
    nom: 'Un ruixat curt i prou',
    hours: series({ 16: rain(6, 90, 81) }),
  },
  {
    nom: 'Plugim llarg: cap hora arriba a mig mil·límetre (no és pluja contínua)',
    hours: series({ 15: rain(0.2, 55), 16: rain(0.2, 60), 17: rain(0.2, 55) }),
  },
  {
    nom: 'Plugim de vuit hores: cap hora arriba a mig mil·límetre, però en total sí que mulla',
    hours: series({
      15: rain(0.3, 45), 16: rain(0.4, 45), 17: rain(0.3, 40), 18: rain(0.4, 40),
      19: rain(0.3, 40), 20: rain(0.4, 35), 21: rain(0.3, 35), 22: rain(0.3, 30),
    }),
  },
];

for (const cas of CASOS) {
  console.log(`\n── ${cas.nom} ──`);
  const w = rainWindows(cas.hours, NOW);
  for (const win of w) {
    console.log(`  tram ${win.from.slice(11, 16)}–${win.to.slice(11, 16)} · ${win.hours} h`
      + ` · ${win.mm} mm · punta ${win.peak.mm} mm a ${win.peak.time.slice(11, 16)}`
      + ` · ${win.intensity}${win.concentrated ? ' · concentrada' : ''}${win.thunder ? ' · tempesta' : ''}`);
  }
  const n = narrativeFor(
    {
      hourly: cas.hours,
      daily: [{
        date: DAY, tMax: 17, tMin: 9, weatherCode: 61,
        precipitation: w.reduce((s, x) => s + x.mm, 0), precipProbability: 90, precipHours: w.length,
        snowfall: 0, windMax: 4, gustMax: 9, windDirection: 200, uvMax: 2,
        snowLevel: null, sunrise: null, sunset: null, spread: null,
      }],
      models: ['best_match'], nModels: 1, altitudeCorrectionM: null,
      issuedAt: '', source: 'test', skillWeighted: false,
    },
    null,
    NOW,
    DAY,
  );
  console.log(`  → ${n?.today} ${n?.change ?? ''}`);
}

// ── Advertencias: solo con umbral citable ──────────────────────────────────
console.log('\n── Advertències del dia ──');
const AVISOS: Array<{ nom: string; hours: HourlyPoint[] }> = [
  {
    nom: 'Nit de glaçada (la mínima cau demà a la matinada)',
    hours: series({
      21: { temperature: 3, apparent: 3 }, 22: { temperature: 1, apparent: 1 },
      23: { temperature: 0, apparent: 0 },
      // Índices de 24 en adelante: día siguiente.
      30: { temperature: -3, apparent: -3 }, 31: { temperature: -4, apparent: -4 },
      32: { temperature: -2, apparent: -2 },
    }),
  },
  {
    nom: 'UV alt al migdia',
    hours: series({
      11: { uvIndex: 6 }, 12: { uvIndex: 8 }, 13: { uvIndex: 9 }, 14: { uvIndex: 7 },
    }),
  },
  {
    nom: 'Vent dur',
    hours: series({ 16: { windSpeed: 14, windGust: 26 }, 17: { windSpeed: 15, windGust: 28 } }),
  },
  {
    nom: 'Xafogor: la humitat fa pujar la sensació',
    hours: series({ 15: { temperature: 32, apparent: 39, humidity: 75 } }),
  },
  {
    nom: 'Un dia sense res a destacar (ha de sortir buit)',
    hours: series({}),
  },
];

for (const cas of AVISOS) {
  const notes = dayNotes(cas.hours, NOW, DAY);
  console.log(`\n  ${cas.nom}`);
  if (!notes.length) console.log('    (cap advertència)');
  for (const n of notes) console.log(`    · ${n}`);
}

// ── Franjas ────────────────────────────────────────────────────────────────
console.log('\n── Franges del dia, des de les 12 h ──');
for (const p of dayParts(series({ 16: rain(3, 80), 17: rain(9, 90, 95) }), NOW, DAY)) {
  console.log(`  ${p.label.padEnd(22)} ${p.first.slice(11, 16)}–${p.last.slice(11, 16)}`
    + `  ${p.tMin}–${p.tMax} °C  ${p.precip} mm  ${p.precipProb} %`);
}

// ── Amb un avís oficial a sobre ────────────────────────────────────────────
/*
 * El 29 de setembre de 2026 la fitxa de Malgrat deia «Pluja feble» i «sempre
 * feble» sota un avís taronja de 150 mm en dotze hores. Aquí ja no és una
 * sortida per mirar: si torna a passar, falla.
 */
console.log('\n── Amb avís oficial ──');
let bad = 0;
function expect(what: string, ok: boolean, text: string | null | undefined) {
  if (!ok) bad++;
  console.log(`  ${ok ? '✓' : '✗'} ${what}\n      → ${text ?? '(res)'}`);
}

const weakRain = series({
  14: rain(1.1, 80), 15: rain(1.2, 85), 16: rain(1.0, 85),
  17: rain(1.3, 80), 18: rain(1.1, 75), 19: rain(1.2, 70),
});
const fc = (hours: HourlyPoint[], code = 61) => ({
  hourly: hours,
  daily: [{
    date: DAY, tMax: 17, tMin: 9, weatherCode: code,
    precipitation: 7, precipProbability: 90, precipHours: 6,
    snowfall: 0, windMax: 4, gustMax: 9, windDirection: 200, uvMax: 2,
    snowLevel: null, sunrise: null, sunset: null, spread: null,
  }],
  models: ['best_match'], nModels: 1, altitudeCorrectionM: null,
  issuedAt: '', source: 'test', skillWeighted: false,
});
const taronja: RainWarning = { level: 'taronja', phenomenon: 'PR', from: `${DAY}T07`, to: `${DAY}T17` };

{
  const n = narrativeFor(fc(weakRain), null, NOW, DAY, [taronja]);
  const text = `${n?.today} ${n?.change}`;
  expect('sense «feble» sota un avís taronja', !/feble|moderada/.test(text), text);
  expect('diu que hi ha avís', /avís taronja per pluja/.test(n?.change ?? ''), n?.change);
  expect('i els mil·límetres del model hi són', /6,9 mm/.test(n?.change ?? ''), n?.change);
  expect('el titular del cel sap que hi ha avís ara', n?.rainWarnedNow === true, String(n?.rainWarnedNow));
  expect('«Pluja», no «Pluja feble»', unratedRainLabel(61) === 'Pluja' && unratedRainLabel(80) === 'Ruixats', `${unratedRainLabel(61)} · ${unratedRainLabel(80)}`);
  expect('la tempesta no es toca', unratedRainLabel(95) === null, String(unratedRainLabel(95)));
}

{
  /*
   * Les icones hora a hora i dels catorze dies: el text de la taula ja deia
   * «Pluja», però el `alt` de la icona seguia dient «Pluja feble».
   */
  const at = (h: string) => warnedIconLabel(61, rainWarnedAt([taronja], `${DAY}T${h}`));
  expect('icona d’una hora amb avís: «Pluja»', at('12') === 'Pluja', String(at('12')));
  expect('icona d’una hora sense avís: la de sempre', at('20') === null, String(at('20')));
  expect('icona del dia amb avís: «Pluja»', warnedIconLabel(61, rainWarnedOn([taronja], DAY)) === 'Pluja', DAY);
  const next = new Date(Date.parse(`${DAY}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  expect('icona de l’endemà, sense avís', warnedIconLabel(61, rainWarnedOn([taronja], next)) === null, next);
}

{
  // L'avís s'acaba a les 11 h i la pluja és de 14 a 19 h: no es toquen.
  const early: RainWarning = { ...taronja, from: `${DAY}T06`, to: `${DAY}T11` };
  const n = narrativeFor(fc(weakRain), null, NOW, DAY, [early]);
  expect('un avís que no toca el tram no canvia la frase', /sempre feble/.test(n?.change ?? ''), n?.change);
  expect('ni el titular del cel', n?.rainWarnedNow === false, String(n?.rainWarnedNow));
}

{
  // El model ja veu pluja forta: no hi ha contradicció, i l'avís s'hi afegeix.
  const strong = series({ 16: rain(4, 80), 17: rain(24, 95), 18: rain(6, 80) });
  const n = narrativeFor(fc(strong), null, NOW, DAY, [taronja]);
  expect('amb pluja forta, la frase de sempre i l\'avís', /forta/.test(n?.change ?? '') && /avís taronja/.test(n?.change ?? ''), n?.change);
}

{
  // Avís a la zona, i el model no hi veu res en aquest punt.
  const n = narrativeFor(fc(series({}), 3), null, NOW, DAY, [taronja]);
  expect('avís sense pluja al model: es diu igual', /avís taronja per pluja a la zona/.test(n?.change ?? ''), n?.change);
}

{
  /*
   * Avís vigent ara i el model veu pluja, però només a unes altres hores:
   * l'Albagés, 29 de setembre de 2026. Es diu l'avís, i la pluja del model sense
   * adjectiu, ni «feble» ni «no arriba a mullar el terra».
   */
  const later = series({ 21: rain(0.1, 15), 22: rain(0.1, 15) });
  const n = narrativeFor(fc(later, 3), null, NOW, DAY, [taronja]);
  const c = n?.change ?? '';
  expect('pluja fora de l\'avís: primer l\'avís', /^Hi ha avís taronja per pluja a la zona/.test(c), c);
  expect('i la pluja del model, sense adjectiu', /el model en preveu 0,2 mm/.test(c) && !/feble|mullar/.test(c), c);
}

{
  // La 1 és l'única hora en singular: el Prat deia «fins demà a les 1 h».
  const n = narrativeFor(fc(series({ 22: rain(1.2, 80), 23: rain(1.1, 80), 24: rain(1.0, 80) })), null, NOW, DAY, []);
  const c = n?.change ?? '';
  expect('«a la 1 h», no «a les 1 h»', /a la 1 h/.test(c) && !/les 1 h/.test(c), c);
}

// ── En castellà ────────────────────────────────────────────────────────────
/*
 * La plantilla castellana és una altra plantilla, no una traducció, i per això
 * es prova a part: les mateixes regles d'honestedat que el català —cap adjectiu
 * sota un avís, «no llega a mojar el suelo» només per sota d'1 mm— i cap paraula
 * catalana que se n'hagi escapat. Els topònims de les proves no porten apòstrof
 * perquè la comprovació de « d'» i « l'» no s'hi confongui.
 */
console.log('\n── En castellà ──');
const CATALAN = [
  ' amb ', ' dels ', ' les ', ' els ', 'avui', 'demà', 'plou', 'pluja', 'ruixat', 'plugim',
  ' fins ', ' cap a ', 'mitjanit', " d'", " l'", 'l’',
];
function noCatalan(what: string, text: string | null | undefined) {
  const t = ` ${(text ?? '').toLowerCase()} `;
  const hit = CATALAN.find((w) => t.includes(w));
  expect(`${what}: cap rastre de català`, !hit, hit ? `«${hit.trim()}» dins de: ${text}` : text);
}

for (const cas of CASOS) {
  const n = narrativeFor(fc(cas.hours), null, NOW, DAY, [], 'es');
  console.log(`  ${cas.nom}\n      → ${n?.today} ${n?.change ?? ''}`);
  noCatalan(cas.nom, `${n?.today} ${n?.change ?? ''} ${n?.tomorrow ?? ''}`);
}
for (const cas of AVISOS) {
  for (const note of dayNotes(cas.hours, NOW, DAY, 'es')) noCatalan(cas.nom, note);
}
{
  const notes = dayNotes(AVISOS[0].hours, NOW, DAY, 'es');
  expect('la glaçada, en castellà', /^Habrá helada: la mínima bajará a −4 °C mañana hacia las 7 h\.$/.test(notes[0] ?? ''), notes[0]);
  const uv = dayNotes(AVISOS[1].hours, NOW, DAY, 'es');
  expect('l\'UV, en castellà', /^El índice UV llega a 9 de las 12 a las 15 h, nivel muy alto/.test(uv[0] ?? ''), uv[0]);
}

{
  const parts = dayParts(series({}), NOW, DAY, 5, 'es');
  expect('franges: «Hoy por la tarde», «Mañana de madrugada»',
    parts[0]?.label === 'Hoy por la tarde' && parts.some((p) => p.label === 'Mañana de madrugada')
      && parts[0]?.nom === 'Tarde',
    parts.map((p) => `${p.label} (${p.nom})`).join(' · '));
}

{
  const n = narrativeFor(fc(weakRain), null, NOW, DAY, [taronja], 'es');
  const text = `${n?.today} ${n?.change}`;
  expect('es: sense «débil» sota un avís taronja', !/débil|moderada/.test(text), text);
  expect('es: diu que hi ha avís', /aviso naranja por lluvias/.test(n?.change ?? ''), n?.change);
  expect('es: i els mil·límetres del model', /aquí el modelo prevé 6,9 mm/.test(n?.change ?? ''), n?.change);
  expect('es: «Hoy, lluvia», no «lluvia débil»', /^Hoy, lluvia, máxima de 17 °C y mínima de 9 °C\.$/.test(n?.today ?? ''), n?.today);
  expect('es: «Lluvia» i «Chubascos»', unratedRainLabel(61, 'es') === 'Lluvia' && unratedRainLabel(80, 'es') === 'Chubascos',
    `${unratedRainLabel(61, 'es')} · ${unratedRainLabel(80, 'es')}`);
  expect('es: icona amb avís', warnedIconLabel(61, rainWarnedAt([taronja], `${DAY}T12`), 'es') === 'Lluvia', 'Lluvia');
}

{
  const early: RainWarning = { ...taronja, from: `${DAY}T06`, to: `${DAY}T11` };
  const n = narrativeFor(fc(weakRain), null, NOW, DAY, [early], 'es');
  expect('es: sense avís al tram, la frase de sempre',
    n?.change === 'Lluvia continua de las 14 a las 20 h: 6,9 mm en 6 h, siempre débil.', n?.change);
}

{
  const strong = series({ 16: rain(4, 80), 17: rain(24, 95), 18: rain(6, 80) });
  const n = narrativeFor(fc(strong), null, NOW, DAY, [taronja], 'es');
  expect('es: amb pluja forta, «fuerte» i l\'avís', /lluvia fuerte/.test(n?.change ?? '') && /Hay aviso naranja por lluvias en la zona\.$/.test(n?.change ?? ''), n?.change);
}

{
  const n = narrativeFor(fc(series({}), 3), null, NOW, DAY, [taronja], 'es');
  expect('es: avís sense pluja al model',
    n?.change === 'Hay aviso naranja por lluvias en la zona de las 7 a las 18 h, aunque aquí el modelo no prevé lluvia.', n?.change);
  expect('es: el cel del titular sense pluja', /^Hoy, cielo cubierto, /.test(n?.today ?? ''), n?.today);
}

{
  const later = series({ 21: rain(0.1, 15), 22: rain(0.1, 15) });
  const c = narrativeFor(fc(later, 3), null, NOW, DAY, [taronja], 'es')?.change ?? '';
  expect('es: pluja fora de l\'avís, primer l\'avís', /^Hay aviso naranja por lluvias en la zona/.test(c), c);
  expect('es: i la pluja del model, sense adjectiu', /el modelo prevé 0,2 mm/.test(c) && !/débil|mojar/.test(c), c);
  noCatalan('pluja fora de l\'avís', c);
}

{
  const c = narrativeFor(fc(series({ 22: rain(1.2, 80), 23: rain(1.1, 80), 24: rain(1.0, 80) })), null, NOW, DAY, [], 'es')?.change ?? '';
  expect('es: «a la 1 h», no «a las 1 h»', /hasta mañana a la 1 h/.test(c) && !/las 1 h/.test(c), c);
}

{
  // Plugim: per sota d'1 mm no mulla; vuit hores i 2,7 mm, sí.
  const short = narrativeFor(fc(CASOS[5].hours), null, NOW, DAY, [], 'es')?.change ?? '';
  expect('es: plugim curt, «no llega a mojar el suelo»', /^Llovizna de las 15 a las 18 h, .*no llega a mojar el suelo\.$/.test(short), short);
  const long = narrativeFor(fc(CASOS[6].hours), null, NOW, DAY, [], 'es')?.change ?? '';
  expect('es: plugim de 2,7 mm, sí que mulla', !/no llega a mojar/.test(long) && /2,7 mm en total, suficiente para mojar el suelo/.test(long), long);
  const conc = narrativeFor(fc(CASOS[1].hours), null, NOW, DAY, [], 'es')?.change ?? '';
  expect('es: concentrada', /^La lluvia empieza hacia las 16 h y para hacia las 20 h, pero lo más intenso llega hacia las 18 h: 21,0 mm en una hora, lluvia fuerte, con tormenta\. En total, 24,6 mm\.$/.test(conc), conc);
  const inter = narrativeFor(fc(CASOS[3].hours), null, NOW, DAY, [], 'es')?.change ?? '';
  expect('es: intermitent', /^Chubascos intermitentes, de las 13 a las 15 h y de las 19 a las 22 h\. El más fuerte, hacia las 20 h/.test(inter), inter);
}

{
  // Demà, ahir i el desacord entre models, que només surten amb més dades.
  const two = {
    ...fc(series({}), 3),
    daily: [
      { ...fc(series({})).daily[0], weatherCode: 3, spread: 0.8 },
      { ...fc(series({})).daily[0], date: NEXT, tMax: 13, weatherCode: 61, precipitation: 4.2, spread: 2.6 },
    ],
    nModels: 3,
  };
  const current = { todayMax: null, todayMin: 8.4, yesterdayMax: 18.2 } as unknown as Parameters<typeof narrativeFor>[1];
  const n = narrativeFor(two, current, NOW, DAY, [], 'es');
  expect('es: demà', n?.tomorrow === 'Mañana, lluvia débil, con una máxima 4 grados más baja y 4,2 mm de lluvia.', n?.tomorrow);
  expect('es: ahir', n?.vsYesterday === 'Una máxima 1 grado más baja que la de ayer, que llegó a 18,2 °C. Esta madrugada, la mínima ha sido de 8,4 °C.', n?.vsYesterday);
  expect('es: models', n?.uncertainty === 'Los 3 modelos coinciden hasta mañana; a partir de ahí la diferencia sube a 2,6 °C y la predicción debe leerse como una tendencia.', n?.uncertainty);
  expect('es: sense mínima repetida', n?.today === 'Hoy, cielo cubierto y máxima de 17 °C.', n?.today);
  noCatalan('demà, ahir i models', `${n?.tomorrow} ${n?.vsYesterday} ${n?.uncertainty}`);
}

{
  // Passada la mitjanit, la sèrie pot començar ahir: avui i demà es busquen per la data.
  const base = fc(series({})).daily[0];
  const prev = new Date(Date.parse(`${DAY}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
  const shifted = {
    ...fc(series({}), 3),
    daily: [
      { ...base, date: prev, tMax: 25, weatherCode: 61, precipitation: 9.9 },
      { ...base, weatherCode: 3 },
      { ...base, date: NEXT, tMax: 13, weatherCode: 61, precipitation: 4.2 },
    ],
  };
  const n = narrativeFor(shifted, null, NOW, DAY);
  expect('ahir al davant: avui és avui', n?.today?.includes('17 °C') === true, n?.today);
  expect('ahir al davant: demà és demà', n?.tomorrow?.includes('4,2 mm') === true, n?.tomorrow);
  const stale = { ...shifted, daily: shifted.daily.slice(0, 1) };
  expect('sense avui, sense frase', narrativeFor(stale, null, NOW, DAY) === null, 'hi ha frase');
}

// ── Les frases de la fitxa (describe.ts) ───────────────────────────────────
{
  const base = {
    parentId: null, comarcaCodi: '07', nomIndexat: '', slug: '', path: '', lat: 41.7, lon: 1.8,
    geocodeSource: 'icgc', geocodeConfidence: 1, poblacio: 100, tier: 'B', published: true,
  } as const;
  const mun = { ...base, id: 'm', level: 'municipi', nom: 'el Pont de Vilomara', altitud: 220, areaKm2: 23.4 } as Location;
  const nucli = {
    ...base, id: 'n', level: 'nucli', nom: 'Rocafort', altitud: 548, parentId: 'm',
    stationRef: { codi: 'X', nom: 'Artés', distKm: 9.4, dAltM: 261, nearest: { nom: 'el Pont de Vilomara', distKm: 3.1, dAltM: 300 }, ridgeM: 700 },
  } as Location;
  const other = { ...base, id: 'o', level: 'nucli', nom: 'Vilomara', altitud: 300 } as Location;
  const comarca = { codi: '07', nom: 'Bages', altitudMin: 150, altitudMax: 1200 } as Comarca;

  const ca = describeLocation(nucli, comarca, mun, [other, mun]);
  expect('describe: el català no canvia', ca.startsWith('Rocafort és a 548 m, 328 m per sobre del nucli del Pont de Vilomara.'), ca);
  const es = describeLocation(nucli, comarca, mun, [other, mun], 'es');
  expect('describe: el desnivell, en castellà', es.startsWith('Rocafort está a 548 m, 328 m por encima del núcleo de El Pont de Vilomara.'), es);
  expect('describe: la comarca contrau', /Dentro del Bages, que va de los 150 a los 1\.200 m, queda en la franja media de la comarca\./.test(es), es);
  expect('describe: l\'estació, amb «más abajo»', /la de El Pont de Vilomara, a 3,1 km, que está 300 m más abajo/.test(es) && /está 261 m más abajo/.test(es), es);
  noCatalan('describe', es);
  const m = describeMunicipi(mun, comarca, [nucli, other], 'es');
  expect('describeMunicipi', m.startsWith('El núcleo de El Pont de Vilomara está a 220 m de altitud, en un término municipal de 23,4 km².'), m);
  noCatalan('describeMunicipi', m);
  const meta = metaDescription(mun, comarca, 'es');
  expect('metaDescription', meta === 'El tiempo en El Pont de Vilomara, Bages (220 m): predicción hora a hora, 14 días y observación real de la estación más cercana.', meta);
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'fallada' : 'fallades'}.`);
  process.exit(1);
}

console.log('\nOK');
