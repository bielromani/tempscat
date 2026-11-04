/**
 * Quin avís va al mòbil de qui, i quan.
 *
 * Una notificació falsa a les tres de la matinada costa la confiança per
 * sempre, així que les regles es van escriure abans que el codi
 * (`docs/13-full-de-ruta.md`, punt 15) i aquí només s'apliquen:
 *
 *  · Només avisos **oficials** de nivell **taronja o vermell**. Mai un groc, mai
 *    un de propi.
 *  · Mai entre les 23 h i les 7 h (hora de Catalunya), **excepte el vermell**.
 *    Un taronja que arriba a les dues de la matinada s'envia a les set, si
 *    encara és vigent; si ja s'ha acabat, no s'envia.
 *  · **Un sol missatge per episodi**, no un per cada fitxer que AEMET torna a
 *    emetre. Si l'episodi puja de taronja a vermell, això sí que és nou i
 *    s'avisa.
 *  · Es pot apagar sense desinstal·lar res: a `/avisos/alertes`.
 *
 * Funció pura: el rellotge entra per paràmetre. La prova és
 * `npm run test:push`.
 */
import type { PushPlace, PushSubscriptionRecord, SentEpisodes } from './push-store.ts';
import { groupWarnings, LEVEL_RANK, type Warning, type WarningGroup } from './warning-stack.ts';
import { phenomenonName, thresholdValue } from './warning-labels.ts';
import { whenLine } from './warning-when.ts';

/** Nivell mínim que s'envia: el taronja. */
const MIN_RANK = LEVEL_RANK.taronja;
/** Hores de silenci, en hora de Catalunya: de les 23 h a les 7 h. */
const QUIET_FROM = 23;
const QUIET_TO = 7;
/** Quant temps es recorda un episodi acabat, perquè un fitxer tardà no el torni a avisar. */
const FORGET_AFTER_MS = 12 * 3_600_000;
/** Un avís que s'acaba d'aquí a menys d'això ja no s'envia: arribaria tard. */
const TOO_LATE_MS = 30 * 60_000;

export interface PushGroup extends WarningGroup {
  /** Els llocs que toca, de tots els fitxers del grup. */
  locationIds: Set<string>;
}

export interface PushMessage {
  title: string;
  body: string;
  /** On porta tocar-la: la fitxa del lloc, que obre amb la franja d'avisos. */
  url: string;
  /** El mateix per a tots: una notificació nova substitueix la vella en comptes d'apilar-se. */
  tag: string;
}

export interface PushPlan {
  /** Un missatge per subscripció com a molt, encara que hi hagi tres avisos alhora. */
  deliveries: Array<{ subscription: PushSubscriptionRecord; message: PushMessage }>;
  /** El registre d'episodis, ja actualitzat: el worker el desa després d'enviar. */
  sent: SentEpisodes;
  /** Episodis que s'haurien d'avisar però són taronges en hores de silenci. */
  held: string[];
  /** Episodis nous d'aquesta volta, avisats o no (pot ser que no toquin ningú). */
  fresh: string[];
}

function madridHour(nowMs: number): number {
  return Number(new Date(nowMs).toLocaleString('en-GB', { timeZone: 'Europe/Madrid', hour: '2-digit', hourCycle: 'h23' }));
}

export function isQuietHour(nowMs: number): boolean {
  const h = madridHour(nowMs);
  return h >= QUIET_FROM || h < QUIET_TO;
}

/** Els grups de taronja amunt que encara valen, amb els llocs que toquen. */
export function pushableGroups(warnings: Warning[], nowMs: number): PushGroup[] {
  const live = warnings.filter(
    (w) => LEVEL_RANK[w.level] >= MIN_RANK && Date.parse(w.expires) > nowMs + TOO_LATE_MS,
  );
  const byId = new Map(live.map((w) => [w.id, w]));
  return groupWarnings(live).map((g) => {
    const locationIds = new Set<string>();
    for (const s of g.spans) for (const id of byId.get(s.id)?.locationIds ?? []) locationIds.add(id);
    return { ...g, locationIds };
  });
}

function message(groups: PushGroup[], place: PushPlace, otherPlaces: number): PushMessage {
  const [g] = groups;
  const level = g.level === 'vermell' ? 'vermell' : 'taronja';
  const threshold = g.spans.map((s) => thresholdValue(s.threshold)).find(Boolean);
  const where = otherPlaces ? `${place.nom} i ${otherPlaces === 1 ? 'un lloc més' : `${otherPlaces} llocs més`}` : place.nom;
  const lines = [
    `${where} · ${whenLine(g)}${threshold ? ` · ${threshold}` : ''}.`,
    groups.length > 1
      ? `I ${groups.length - 1 === 1 ? 'un altre avís' : `${groups.length - 1} avisos més`} de taronja amunt.`
      : null,
    'Avís oficial de l’AEMET.',
  ].filter(Boolean);
  return {
    title: `Avís ${level} · ${phenomenonName(g.phenomenon)}`,
    body: lines.join(' '),
    url: place.path,
    tag: 'tempscat-avisos',
  };
}

/**
 * Què s'envia en aquesta volta.
 *
 * L'ordre importa en un cas: un episodi en silenci **no** entra al registre,
 * perquè la volta de les set el trobi nou. Si hi entrés, ja no s'enviaria mai.
 */
export function planPushes(
  groups: PushGroup[],
  subscriptions: PushSubscriptionRecord[],
  previous: SentEpisodes,
  nowMs: number,
): PushPlan {
  const episodes: SentEpisodes['episodes'] = {};
  for (const [k, v] of Object.entries(previous.episodes)) {
    if (Date.parse(v.until) + FORGET_AFTER_MS > nowMs) episodes[k] = v;
  }

  const quiet = isQuietHour(nowMs);
  const fresh: PushGroup[] = [];
  const held: string[] = [];
  for (const g of groups) {
    const known = episodes[g.key];
    if (known) {
      // El mateix episodi, potser allargat un dia més: es recorda fins que s'acabi.
      if (g.expires > known.until) episodes[g.key] = { ...known, until: g.expires };
      continue;
    }
    if (quiet && g.level !== 'vermell') {
      held.push(g.key);
      continue;
    }
    fresh.push(g);
    episodes[g.key] = { sentAt: new Date(nowMs).toISOString(), until: g.expires };
  }

  const deliveries: PushPlan['deliveries'] = [];
  for (const sub of subscriptions) {
    const hits = fresh
      .map((g) => ({ g, places: sub.places.filter((p) => g.locationIds.has(p.id)) }))
      .filter((h) => h.places.length);
    if (!hits.length) continue;
    // Mana el de nivell més alt; `groupWarnings` ja els torna en aquest ordre.
    const places = hits[0].places;
    deliveries.push({
      subscription: sub,
      message: message(hits.map((h) => h.g), places[0], places.length - 1),
    });
  }

  return { deliveries, sent: { episodes }, held, fresh: fresh.map((g) => g.key) };
}
