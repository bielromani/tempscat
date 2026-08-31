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
import { dayNotes, dayParts, narrativeFor, rainIntensity, rainWindows } from '../src/lib/narrative.ts';
import type { HourlyPoint } from '../src/lib/forecast-types.ts';

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
        snowLevel: null, sunrise: null, sunset: null,
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

console.log('\nOK');
