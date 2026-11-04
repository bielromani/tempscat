/**
 * Que els avisos al mòbil compleixin les quatre regles, i sobretot les que diuen
 * que no.
 *
 *   npm run test:push
 *
 * Un missatge que no hauria d'haver sortit és el pitjor error d'aquesta funció
 * —el groc a les tres de la matinada, el mateix avís cada quart d'hora— i no en
 * dona cap: dona un telèfon que vibra. Així que la majoria de casos d'aquí són
 * dels que **no** han d'enviar res.
 */
import { planPushes, pushableGroups, isQuietHour } from '../src/lib/push-alerts.ts';
import type { PushSubscriptionRecord, SentEpisodes } from '../src/lib/push-store.ts';
import type { Warning, WarningLevel } from '../src/lib/warning-stack.ts';

let bad = 0;
const fail = (msg: string) => { console.error(`  ✗ ${msg}`); bad++; };
const check = (cond: boolean, msg: string) => (cond ? console.log(`  ✓ ${msg}`) : fail(msg));

function w(
  id: string, level: WarningLevel, onset: string, expires: string,
  locationIds = ['malgrat'], phenomenon = 'PR',
): Warning {
  return {
    id, event: 'Aviso', phenomenon, level, severity: 'Severe', onset, expires,
    headline: '', description: '', instruction: '',
    threshold: 'Precipitación acumulada en 12 horas · 100 mm',
    web: 'https://www.aemet.es/', zones: ['Litoral de Barcelona'], locationIds, comarcaCodis: ['21'],
  };
}

const sub = (places: string[]): PushSubscriptionRecord => ({
  endpoint: `https://fcm.googleapis.com/fcm/send/${places.join('-')}`,
  keys: { p256dh: 'x', auth: 'y' },
  places: places.map((id) => ({ id, path: `/maresme/${id}`, nom: id === 'malgrat' ? 'Malgrat de Mar' : id })),
  createdAt: '', updatedAt: '',
});

const empty: SentEpisodes = { episodes: {} };
// 2 de novembre de 2026, hora d'hivern: UTC+1.
const at = (local: string) => Date.parse(`2026-11-02T${local}:00+01:00`);
const plan = (warnings: Warning[], subs: PushSubscriptionRecord[], sent: SentEpisodes, now: number) =>
  planPushes(pushableGroups(warnings, now), subs, sent, now);

console.log('Les hores de silenci, en hora de Catalunya:\n');
check(isQuietHour(at('23:00')), 'a les 23:00 és silenci');
check(isQuietHour(at('06:59')), 'a les 06:59 encara ho és');
check(!isQuietHour(at('07:00')), 'a les 07:00 ja no');
check(!isQuietHour(Date.parse('2026-07-15T05:30:00Z')), 'a l’estiu, les 05:30 UTC són les 07:30: ja no');

const orange = w('a', 'taronja', '2026-11-02T13:00:00+01:00', '2026-11-02T23:59:59+01:00');
const yellow = w('b', 'groc', '2026-11-02T13:00:00+01:00', '2026-11-02T23:59:59+01:00');
const red = w('c', 'vermell', '2026-11-02T13:00:00+01:00', '2026-11-02T23:59:59+01:00');

console.log('\nQuè s’envia:\n');
{
  const p = plan([orange], [sub(['malgrat'])], empty, at('10:00'));
  check(p.deliveries.length === 1, 'un taronja al matí: un missatge');
  const m = p.deliveries[0]?.message;
  check(m?.title === 'Avís taronja · Pluja', `el títol diu nivell i fenomen («${m?.title}»)`);
  check(!!m?.body.includes('Malgrat de Mar') && !!m?.body.includes('100 mm en 12 h'), `el cos diu on i quant («${m?.body}»)`);
  check(m?.url === '/maresme/malgrat', 'porta a la fitxa');
}
check(plan([yellow], [sub(['malgrat'])], empty, at('10:00')).deliveries.length === 0, 'un groc: res');
check(plan([orange], [sub(['tordera'])], empty, at('10:00')).deliveries.length === 0, 'un taronja que no toca els llocs triats: res');

console.log('\nLes hores de silenci:\n');
{
  const night = plan([orange], [sub(['malgrat'])], empty, at('02:00'));
  check(night.deliveries.length === 0, 'un taronja a les 02:00: res');
  check(!night.sent.episodes[pushableGroups([orange], at('02:00'))[0].key], 'i no queda apuntat com a enviat');
  const morning = plan([orange], [sub(['malgrat'])], night.sent, at('07:00'));
  check(morning.deliveries.length === 1, 'a les 07:00 surt');
  check(plan([red], [sub(['malgrat'])], empty, at('02:00')).deliveries.length === 1, 'un vermell a les 02:00: surt');
}

console.log('\nUn sol missatge per episodi:\n');
{
  const first = plan([orange], [sub(['malgrat'])], empty, at('10:00'));
  const again = plan([orange], [sub(['malgrat'])], first.sent, at('10:15'));
  check(again.deliveries.length === 0, 'la volta següent, amb el mateix avís: res');
  // L'endemà AEMET emet un fitxer nou per al dia següent, i el d'avui ja ha passat.
  const nextDay = w('a2', 'taronja', '2026-11-03T13:00:00+01:00', '2026-11-03T23:59:59+01:00');
  const later = plan([nextDay], [sub(['malgrat'])], again.sent, at('10:00') + 86_400_000);
  check(later.deliveries.length === 0, 'el mateix episodi l’endemà, amb un altre fitxer: res');
  const up = plan([orange, red], [sub(['malgrat'])], first.sent, at('11:00'));
  check(up.deliveries.length === 1 && up.deliveries[0].message.title.startsWith('Avís vermell'), 'si puja a vermell: avís nou');
  const forgotten = planPushes(
    pushableGroups([{ ...orange, onset: '2026-11-09T13:00:00+01:00', expires: '2026-11-09T23:59:59+01:00' }], at('10:00') + 7 * 86_400_000),
    [sub(['malgrat'])], first.sent, at('10:00') + 7 * 86_400_000,
  );
  check(forgotten.deliveries.length === 1, 'un episodi igual una setmana després: torna a avisar');
}

console.log('\nTres avisos alhora, un sol missatge:\n');
{
  const wind = w('d', 'taronja', '2026-11-02T13:00:00+01:00', '2026-11-02T20:00:00+01:00', ['malgrat'], 'VI');
  const p = plan([orange, red, wind], [sub(['malgrat', 'tordera'])], empty, at('10:00'));
  check(p.deliveries.length === 1, 'un missatge per aparell');
  check(p.deliveries[0]?.message.title === 'Avís vermell · Pluja', 'mana el vermell');
  check(!!p.deliveries[0]?.message.body.includes('2 avisos més'), `i diu que n'hi ha més («${p.deliveries[0]?.message.body}»)`);
}

console.log('\nUn avís que s’acaba:\n');
{
  const ending = w('e', 'vermell', '2026-11-02T08:00:00+01:00', '2026-11-02T10:20:00+01:00');
  check(plan([ending], [sub(['malgrat'])], empty, at('10:00')).deliveries.length === 0, 'si s’acaba d’aquí a vint minuts: res');
}

if (bad) {
  console.error(`\n${bad} errors`);
  process.exit(1);
}
console.log('\nOK');
