/** Comprobación de la astronomía contra valores conocidos. */
import { sunTimes, moonPhase, sunPosition, moonEmoji, nextMoonEvents } from '../src/lib/astronomy.ts';

const BCN = { lat: 41.3874, lon: 2.1686, nom: 'Barcelona' };
const fmt = (d: Date | null) =>
  d ? d.toLocaleTimeString('ca-ES', { timeZone: 'Europe/Madrid', hour: '2-digit', minute: '2-digit' }) : '—';

console.log('── Sol a Barcelona ──');
for (const [label, iso] of [
  ['Solstici d\'estiu', '2026-06-21'],
  ['Solstici d\'hivern', '2026-12-21'],
  ['Equinocci de tardor', '2026-09-22'],
  ['Avui', new Date().toISOString().slice(0, 10)],
] as const) {
  const t = sunTimes(new Date(`${iso}T12:00:00Z`), BCN.lat, BCN.lon);
  const h = t.daylightMinutes != null ? `${Math.floor(t.daylightMinutes / 60)} h ${t.daylightMinutes % 60} min` : '—';
  const delta = t.daylightDeltaMinutes != null ? `${t.daylightDeltaMinutes > 0 ? '+' : ''}${t.daylightDeltaMinutes} min` : '';
  console.log(`  ${label.padEnd(22)} ${iso}  sortida ${fmt(t.sunrise)}  posta ${fmt(t.sunset)}  migdia ${fmt(t.solarNoon)}  dia ${h} ${delta}`);
}

console.log('\n── Crepuscles avui ──');
const t = sunTimes(new Date(), BCN.lat, BCN.lon);
console.log(`  alba civil ${fmt(t.dawn)} · sortida ${fmt(t.sunrise)} · posta ${fmt(t.sunset)} · crepuscle civil ${fmt(t.dusk)}`);

console.log('\n── Posició solar ara ──');
const p = sunPosition(new Date(), BCN.lat, BCN.lon);
console.log(`  altura ${p.altitude.toFixed(1)}° · azimut ${p.azimuth.toFixed(0)}° · ${p.altitude > 0 ? 'de dia' : 'de nit'}`);

console.log('\n── Lluna: properes fases ──');
for (let i = 0; i < 30; i += 5) {
  const d = new Date(Date.now() + i * 86400000);
  const m = moonPhase(d);
  console.log(`  ${d.toISOString().slice(0, 10)}  ${moonEmoji(m.phase)} ${m.name.padEnd(18)} il·luminació ${(m.illumination * 100).toFixed(0)} %  edat ${m.age.toFixed(1)} d`);
}

console.log('\n── Contrast: dia més llarg vs més curt ──');
const jun = sunTimes(new Date('2026-06-21T12:00:00Z'), BCN.lat, BCN.lon).daylightMinutes!;
const dec = sunTimes(new Date('2026-12-21T12:00:00Z'), BCN.lat, BCN.lon).daylightMinutes!;
console.log(`  ${Math.floor(jun / 60)} h ${jun % 60} min  vs  ${Math.floor(dec / 60)} h ${dec % 60} min  →  diferència ${Math.floor((jun - dec) / 60)} h ${(jun - dec) % 60} min`);


console.log('\n── Properes fases ──');
const ev = nextMoonEvents(new Date());
console.log(`  propera lluna nova:  ${ev.newMoon.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
console.log(`  propera lluna plena: ${ev.fullMoon.toISOString().slice(0, 16).replace('T', ' ')} UTC`);
