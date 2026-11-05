/**
 * Worker · els avisos oficials taronja i vermell, al mòbil de qui ho ha demanat.
 *
 * Corre a `avisos.yml` just després del worker d'avisos, en un pas a part: si
 * aquest falla, la franja d'avisos de les fitxes ha de seguir sortint. Què
 * s'envia i quan ho decideix `src/lib/push-alerts.ts`, que té les regles i la
 * prova; aquí només hi ha llegir, enviar i desar.
 *
 * Sense configurar no fa res i surt bé: és l'estat normal fins que existeixin
 * el magatzem privat (`PUSH_R2_*`) i les claus VAPID. A mitges, llança.
 *
 * ## L'ordre de les escriptures
 *
 * El registre d'episodis enviats es desa **després** d'enviar. Si el procés
 * mor a mig camí, la volta següent tornarà a enviar el que potser ja havia
 * sortit: un missatge repetit és molest, un que no arriba mai és pitjor.
 */
import webpush from 'web-push';
import { pullSnapshot, readSnapshot } from '../lib/store.ts';
import {
  SENT_KEY, deleteKey, getJson, listKeys, pushStoreConfig, putJson,
  type PushSubscriptionRecord, type SentEpisodes,
} from '../../src/lib/push-store.ts';
import { planPushes, pushableGroups } from '../../src/lib/push-alerts.ts';
import type { Warning } from '../../src/lib/warning-stack.ts';
import { OWNER } from '../../src/lib/owner.ts';

/** Quant temps pot esperar el servei de notificacions un aparell apagat. */
const MAX_TTL_S = 12 * 3600;

function vapid(): { publicKey: string; privateKey: string } | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey && !privateKey) return null;
  if (!publicKey || !privateKey) {
    throw new Error(`claus VAPID incompletes: falta ${!publicKey ? 'VAPID_PUBLIC_KEY' : 'VAPID_PRIVATE_KEY'}`);
  }
  return { publicKey, privateKey };
}

async function main() {
  const store = pushStoreConfig();
  const keys = vapid();
  if (!store || !keys) {
    if (store || keys) {
      throw new Error('els avisos al mòbil tenen el magatzem o les claus, però no tots dos');
    }
    console.log('Avisos al mòbil sense configurar (PUSH_R2_* i VAPID_*): no s’envia res.');
    return;
  }
  webpush.setVapidDetails(`mailto:${OWNER.email}`, keys.publicKey, keys.privateKey);

  // Primer el disc: el worker d'avisos l'acaba d'escriure en aquest mateix job.
  const snap = readSnapshot<Warning[]>('warnings') ?? await pullSnapshot<Warning[]>('warnings');
  if (!snap) throw new Error('no hi ha instantània d’avisos per llegir');

  const now = Date.now();
  const groups = pushableGroups(snap.data, now);
  const previous = await getJson<SentEpisodes>(store, SENT_KEY) ?? { episodes: {} };
  console.log(`Grups de taronja amunt vigents: ${groups.length} · episodis recordats: ${Object.keys(previous.episodes).length}`);

  // Sense res de nou no cal ni llistar les subscripcions.
  const dry = planPushes(groups, [], previous, now);
  if (dry.held.length) console.log(`  En silenci fins a les 7 h: ${dry.held.join(' · ')}`);
  if (!dry.fresh.length) {
    if (JSON.stringify(dry.sent) !== JSON.stringify(previous)) await putJson(store, SENT_KEY, dry.sent);
    console.log('Cap episodi nou per avisar.');
    return;
  }

  const subKeys = await listKeys(store, 'subs/');
  const subs: Array<{ key: string; record: PushSubscriptionRecord }> = [];
  for (const key of subKeys) {
    const record = await getJson<PushSubscriptionRecord>(store, key);
    if (record) subs.push({ key, record });
  }
  console.log(`Episodis nous: ${dry.fresh.length} · subscripcions: ${subs.length}`);

  const plan = planPushes(groups, subs.map((s) => s.record), previous, now);
  const keyOf = new Map(subs.map((s) => [s.record.endpoint, s.key]));
  let sent = 0;
  let gone = 0;
  let failed = 0;

  for (const { subscription, message, urgent } of plan.deliveries) {
    const expires = Math.min(
      ...groups.filter((g) => plan.fresh.includes(g.key)).map((g) => Date.parse(g.expires)),
    );
    const ttl = Math.max(60, Math.min(MAX_TTL_S, Math.round((expires - now) / 1000)));
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: subscription.keys },
        JSON.stringify(message),
        // Del pla i no del títol: el títol pot ser «Avís vermell» o «Aviso rojo».
        { TTL: ttl, urgency: urgent ? 'high' : 'normal' },
      );
      sent++;
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode;
      // 404 i 410: l'aparell s'ha donat de baixa pel seu compte. Es treu, i ja no hi som.
      if (status === 404 || status === 410) {
        const key = keyOf.get(subscription.endpoint);
        if (key) await deleteKey(store, key);
        gone++;
      } else {
        failed++;
        console.warn(`  ! enviament fallit (${status ?? 'sense estat'}): ${(err as Error).message.slice(0, 200)}`);
      }
    }
  }

  console.log(`Enviats: ${sent} · donats de baixa: ${gone} · fallits: ${failed}`);
  /*
   * Que fallin tots vol dir que el problema és nostre —les claus, la xarxa— i
   * no d'un aparell. Llança abans de desar el registre: així la volta següent
   * ho torna a provar en comptes de donar l'episodi per avisat.
   */
  if (plan.deliveries.length && !sent && failed) {
    throw new Error(`no ha sortit cap dels ${plan.deliveries.length} missatges`);
  }
  await putJson(store, SENT_KEY, plan.sent);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
