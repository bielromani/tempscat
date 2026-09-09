/**
 * Qué tramo del reloj describe cada valor de la serie horaria.
 *
 * ## Por qué hay una prueba solo para esto
 *
 * Porque es un error que no se ve. Open-Meteo pone en la hora `T` la lluvia
 * que cayó **entre `T-1` y `T`** —su tabla lo llama «Preceding hour»— y la
 * temperatura de esa misma fila sí es la de `T`, que es «Instant». Dos
 * convenios en una fila. Tratándolos igual, todos los números siguen siendo
 * plausibles y están corridos una hora: las frases dicen «de les 15 a les 18 h»
 * para una ventana que el modelo sitúa de 14 a 17.
 *
 * El desplazamiento vive en un solo sitio, `mergeHourly`, y a partir de ahí la
 * hora `T` significa `T → T+1` para todo el proyecto. Esta prueba es lo que
 * impide que alguien lo «simplifique» sin saber lo que quita.
 *
 * ## Y por qué el convenio no se comprueba solo contra la documentación
 *
 * Porque la documentación de las fuentes ya nos ha mentido más de una vez, y
 * porque el total diario **no** sirve de árbitro: Open-Meteo agrupa su día por
 * etiqueta igual que nosotros, así que su `precipitation_sum` cuadra con las
 * dos alineaciones y no distingue ninguna.
 *
 * Lo que sí distingue es la física. La irradiancia es cero de noche, y su
 * primera hora con valor son las 08:00 cuando el orto es a las 07:25: si la
 * hora `T` cubriera `T → T+1`, las 07:00 tendrían media hora de sol dentro y
 * no serían cero. Eso es `npm run test:hours -- --api`, que pide cuatro puntos
 * a Open-Meteo; sin la bandera, la prueba es local y no toca la red.
 */
import { mergeHourly, aggregateDaily } from '../src/lib/forecast-merge.ts';
import { VARIABLES, type VariableSlug } from '../src/lib/variables.ts';

let failed = 0;

function check(name: string, cond: boolean, detail = '') {
  if (cond) {
    console.log(`ok    ${name}`);
  } else {
    console.error(`FALLA ${name}${detail ? ` · ${detail}` : ''}`);
    failed++;
  }
}

// ── Qué variables llevan el desplazamiento ────────────────────────────────
//
// La lista es cerrada y sale de la tabla de Open-Meteo. Se fija aquí para que
// añadir una variable nueva obligue a mirar de qué tipo es en vez de heredar
// el que le toque por vecindad.
const PRECEDING: VariableSlug[] = [
  'precipitation', 'precipitation_probability', 'wind_gust', 'solar_radiation', 'snowfall',
];
const INSTANT: VariableSlug[] = [
  'temperature', 'apparent_temperature', 'humidity', 'dew_point', 'pressure',
  'wind_speed', 'wind_direction', 'cloud_cover', 'visibility', 'weather_code',
  'freezing_level', 'snow_depth', 'cape', 'uv_index',
];

console.log('── Quines variables van desplaçades ──\n');
for (const s of PRECEDING) {
  check(`${s} · del tram anterior`, VARIABLES[s].precedingHour === true);
}
for (const s of INSTANT) {
  check(`${s} · instantània`, VARIABLES[s].precedingHour == null);
}

// ── El desplazamiento, sobre una serie hecha a mano ───────────────────────
//
// Cinco horas, y la lluvia en una sola de ellas. Si el convenio se respeta, la
// fila que la enseña es la ANTERIOR a la etiqueta en la que Open-Meteo la puso.
console.log('\n── El desplaçament ──\n');

const times = [
  '2026-09-09T10:00', '2026-09-09T11:00', '2026-09-09T12:00',
  '2026-09-09T13:00', '2026-09-09T14:00',
];

const hourly = mergeHourly(
  {
    best_match: {
      modelElevation: 100,
      values: {
        //                    10:00 11:00 12:00 13:00 14:00
        temperature: /*    */ [20, 21, 22, 23, 24],
        //  Open-Meteo diu: entre les 12 i les 13 han caigut 5 mm.
        precipitation: /*  */ [0, 0, 0, 5, 0],
        precipitation_probability: [0, 0, 0, 90, 0],
        wind_gust: /*      */ [10, 10, 10, 60, 10],
      },
    },
  },
  times,
  { tempCorrection: 0, lat: 41.4, lon: 2.2 },
);

check('l\'última hora es descarta', hourly.length === times.length - 1,
  `n'han sortit ${hourly.length} de ${times.length}`);

const at = (h: string) => hourly.find((p) => p.time === `2026-09-09T${h}:00`);

check('la pluja surt a les 12, no a les 13', at('12')?.precipitation === 5,
  `12:00 → ${at('12')?.precipitation} mm · 13:00 → ${at('13')?.precipitation} mm`);
check('a les 13 ja no hi ha pluja', at('13')?.precipitation === 0);
check('la probabilitat va amb la seva pluja', at('12')?.precipProbability === 90);
check('la ratxa també es desplaça', at('12')?.windGust === 60);
check('la temperatura NO es desplaça', at('12')?.temperature === 22,
  `12:00 → ${at('12')?.temperature} °C, i ha de ser 22`);

// ── Y que el día sigue sumando lo que tiene dentro ────────────────────────
console.log('\n── El resum diari ──\n');
const daily = aggregateDaily(hourly, { lat: 41.4, lon: 2.2 });
check('el dia suma els mil·límetres de les seves hores',
  daily[0]?.precipitation === 5, `${daily[0]?.precipitation} mm`);
check('i compta una hora de pluja', daily[0]?.precipHours === 1);

// ── La comprobación contra la física, solo si se pide ─────────────────────
if (process.argv.includes('--api')) {
  console.log('\n── Contra el sol, demanant-ho a Open-Meteo ──\n');
  const POINTS = [
    { name: 'Barcelona', lat: 41.39, lon: 2.17 },
    { name: 'Lleida', lat: 41.62, lon: 0.62 },
    { name: 'Vielha', lat: 42.70, lon: 0.80 },
    { name: 'Tortosa', lat: 40.81, lon: 0.52 },
  ];

  for (const p of POINTS) {
    const url = 'https://api.open-meteo.com/v1/forecast'
      + `?latitude=${p.lat}&longitude=${p.lon}`
      + '&hourly=shortwave_radiation&daily=sunrise&timezone=Europe%2FMadrid&forecast_days=2';
    const d = JSON.parse((await (await fetch(url)).text()).replaceAll(':nan', ':null')) as {
      hourly: { time: string[]; shortwave_radiation: Array<number | null> };
      daily: { time: string[]; sunrise: string[] };
    };

    const day = d.daily.time[0];
    const sunriseH = Number(d.daily.sunrise[0].slice(11, 13));
    const lit = d.hourly.time
      .map((t, i) => ({ t, v: d.hourly.shortwave_radiation[i] }))
      .filter((h) => h.t.slice(0, 10) === day && (h.v ?? 0) > 0);
    const firstH = lit.length ? Number(lit[0].t.slice(11, 13)) : -1;

    /*
     * La primera etiqueta amb sol ha de caure DESPRÉS de l'hora en punt de
     * l'orto. Amb l'orto a les 07:25, l'etiqueta bona és la de les 08:00: és
     * la que cobreix de 07 a 08. Si sortís la de les 07:00, voldria dir que
     * la sèrie ha canviat de conveni i que tot el projecte va una hora tard.
     */
    check(
      `${p.name} · el sol comença després de l'orto`,
      firstH > sunriseH,
      `orto ${d.daily.sunrise[0].slice(11, 16)}, primera etiqueta amb sol ${String(firstH).padStart(2, '0')}:00`,
    );
  }
}

console.log();
if (failed) {
  console.error(`${failed} ${failed === 1 ? 'comprovació falla' : 'comprovacions fallen'}.`);
  process.exit(1);
}
console.log('Tot correcte');
