/**
 * Que el vent vagi cap on va.
 *
 *   npm run test:wind
 *   npm run test:wind -- --api    (i a més ho comprova contra la predicció publicada)
 *
 * ## Per què això necessita una prova
 *
 * Perquè un signe canviat a `windComponents()` no dona cap error: dona un mapa
 * de partícules que es mou **exactament al revés**, i segueix semblant un mapa
 * de vent. Ningú no mira un camp de vent i diu «això va al contrari»: es mira
 * i s'entén que bufa cap allà.
 *
 * I la meitat de la gent que escriu aquesta fórmula la posa al revés, perquè
 * hi ha dues convencions que es diuen igual: la meteorològica diu **d'on ve**
 * el vent i la de qualsevol altra branca diu cap on va. Els 180° de diferència
 * no es veuen enlloc fins que algú ho compara amb el món.
 *
 * ## Contra què es comprova
 *
 * Primer contra **casos que tenen una sola resposta**: un vent de tramuntana
 * (de 0°) ha d'anar cap al sud, i prou. Són vuit rumbs.
 *
 * I després, amb `--api`, contra la **marinada**: a mitja tarda, a la costa, el
 * vent bufa del mar cap a terra. És el mateix criteri que va servir per
 * escollir el signe, i és el que fa que això no sigui la fórmula comprovada
 * contra ella mateixa. Mesurat el 14 de setembre de 2026 a Malgrat, Cambrils i
 * Sant Feliu: la component cap al nord surt positiva els tres dies i als tres
 * llocs.
 */
import { readFileSync } from 'node:fs';
import { windComponents, windDecode, windEncode, WIND_MAX } from '../src/lib/wind.ts';
import { FORECAST_INDEX, forecastShard } from '../src/lib/shards.ts';
import { build } from './lib/paths.ts';

let bad = 0;
const fail = (msg: string) => { console.error(`  ✗ ${msg}`); bad++; };

// ── Els vuit rumbs ─────────────────────────────────────────────────────────
console.log('Els vuit rumbs, amb 10 m/s (36 km/h):\n');

/** `d'on ve` → cap on ha d'anar, amb el signe de cada component. */
const ROSA: Array<[number, string, number, number]> = [
  // graus, nom, signe de u (est), signe de v (nord)
  [0, 'del nord    → cap al sud', 0, -1],
  [45, 'del nord-est→ cap al sud-oest', -1, -1],
  [90, 'de llevant  → cap a ponent', -1, 0],
  [135, 'del sud-est → cap al nord-oest', -1, 1],
  [180, 'del sud     → cap al nord', 0, 1],
  [225, 'del sud-oest→ cap al nord-est', 1, 1],
  [270, 'de ponent   → cap a llevant', 1, 0],
  [315, 'del nord-oest→cap al sud-est', 1, -1],
];

for (const [deg, label, su, sv] of ROSA) {
  const { u, v } = windComponents(36, deg);
  const sign = (x: number) => (Math.abs(x) < 1e-9 ? 0 : Math.sign(x));
  const ok = sign(u) === su && sign(v) === sv;
  const speed = Math.hypot(u, v);
  if (!ok) fail(`${deg}° ${label}: u=${u.toFixed(2)} v=${v.toFixed(2)}`);
  else console.log(`  ${String(deg).padStart(3)}°  ${label.padEnd(30)} u=${u.toFixed(1).padStart(5)} v=${v.toFixed(1).padStart(5)}`);
  // I que la conversió no s'inventi ni perdi energia.
  if (Math.abs(speed - 10) > 1e-6) fail(`${deg}°: el mòdul hauria de ser 10 m/s i és ${speed.toFixed(3)}`);
}

// ── L'escala d'un byte ─────────────────────────────────────────────────────
console.log('\nL\'escala d\'un byte:\n');
for (const ms of [-WIND_MAX, -12.5, 0, 7.3, WIND_MAX]) {
  const back = windDecode(windEncode(ms));
  const err = Math.abs(back - ms);
  if (err > (2 * WIND_MAX) / 255 / 2 + 1e-9) {
    fail(`${ms} m/s → byte → ${back.toFixed(3)}: s'ha perdut ${err.toFixed(3)}`);
  } else {
    console.log(`  ${String(ms).padStart(6)} m/s → ${String(windEncode(ms)).padStart(3)} → ${back.toFixed(2).padStart(6)}  (±${err.toFixed(3)})`);
  }
}
// I que fora de rang es retalli en comptes de donar la volta.
if (windEncode(500) !== 255 || windEncode(-500) !== 0) {
  fail('una velocitat impossible hauria de retallar-se, no donar la volta');
}

// ── La marinada ────────────────────────────────────────────────────────────
if (process.argv.includes('--api')) {
  const base = process.env.DATA_BASE_URL?.replace(/[/]$/, '');
  if (!base) {
    console.log('\nSense DATA_BASE_URL: la comprovació de la marinada es salta.');
  } else {
    console.log('\nLa marinada, a les 16 h de la costa (v ha de sortir cap al nord):\n');
    const locations = JSON.parse(readFileSync(build('locations.json'), 'utf8')) as Array<{
      nom: string; level: string; comarcaCodi: string; forecastPointId: string;
    }>;
    const get = async (n: string) => (await fetch(`${base}/${n}.json`)).json();
    const index = await get(FORECAST_INDEX) as { data: { times: string[] } };
    const times = index.data.times;
    const shards = new Map<string, unknown>();

    for (const nom of ['Malgrat de Mar', 'Cambrils', 'Sant Feliu de Guíxols']) {
      const loc = locations.find((l) => l.nom === nom && l.level === 'municipi');
      if (!loc) { fail(`${nom} no és al territori`); continue; }
      if (!shards.has(loc.comarcaCodi)) {
        shards.set(loc.comarcaCodi, await get(forecastShard(loc.comarcaCodi)));
      }
      const shard = shards.get(loc.comarcaCodi) as {
        data: { points: Record<string, { best_match?: { values?: Record<string, Array<number | null>> } }> };
      };
      const values = shard.data.points[loc.forecastPointId]?.best_match?.values;
      if (!values?.wind_direction) { fail(`${nom} no porta direcció de vent`); continue; }

      let checked = 0;
      for (let i = 0; i < times.length && checked < 3; i++) {
        if (times[i].slice(11, 13) !== '16') continue;
        const deg = values.wind_direction[i];
        const kmh = values.wind_speed?.[i];
        if (deg == null || kmh == null) continue;
        checked++;
        const { v } = windComponents(kmh, deg);
        const line = `  ${nom.padEnd(22)} ${times[i].slice(5, 10)}  ${String(deg).padStart(3)}° `
          + `${String(kmh).padStart(5)} km/h  →  v=${v.toFixed(2).padStart(6)}`;
        /*
         * Amb calma absoluta la direcció no vol dir res, i llavors això no
         * comprova res: es diu i es passa. Per sota d'1 km/h no hi ha marinada
         * que valgui.
         */
        if (kmh < 1) console.log(`${line}   (calma: no compta)`);
        else if (v <= 0) fail(`${line}   ← bufa mar endins a mitja tarda`);
        else console.log(line);
      }
      if (!checked) fail(`${nom}: la sèrie no arriba a cap 16 h`);
    }
  }
} else {
  console.log('\n(Amb `-- --api` es comprova també contra la predicció publicada.)');
}

if (bad) {
  console.error(`\n${bad} ${bad === 1 ? 'comprovació ha fallat' : 'comprovacions han fallat'}.`);
  process.exit(1);
}
console.log('\nEl vent va cap on ha d\'anar.');
