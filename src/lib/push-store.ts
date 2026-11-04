/**
 * On viuen les subscripcions dels avisos al mòbil, i què n'hi ha a dins.
 *
 * ## Un magatzem a part, i privat
 *
 * El de les dades és públic —és el que serveix el web— i qualsevol objecte que
 * s'hi deixés es podria baixar. Una subscripció no és una dada pública: porta
 * l'adreça on el servei de notificacions del navegador lliura els missatges
 * d'un aparell concret, i amb ella i les claus s'hi poden enviar. Així que va a
 * un altre cubell d'R2, sense accés públic, amb unes claus que només tenen
 * l'API (`/api/alertes`, a Vercel) i el worker que envia
 * (`scripts/workers/push-alerts.ts`, a Actions).
 *
 * Sense les variables `PUSH_R2_*` la funció no existeix: la pàgina diu que no
 * està disponible i la fitxa no hi enllaça. És l'estat normal en local.
 *
 * ## Què es desa, i què no
 *
 * Una subscripció per aparell, a `subs/<empremta de l'adreça>.json`: l'adreça,
 * les dues claus que el navegador genera per xifrar, els llocs triats (fins a
 * deu), l'idioma del web des d'on es va activar i dues dates. Ni nom, ni
 * correu, ni IP, ni res que digui qui és la persona: és el mínim perquè el
 * missatge arribi, i en l'idioma de qui el llegeix. Ho diu `/privacitat`, i si
 * aquí s'hi afegeix un camp, allà també.
 *
 * Importa només `s3-sign.ts`, que només importa `node:crypto`, i el tipus de
 * `lang.ts`, que es borra en compilar.
 */
import { createHash } from 'node:crypto';
import { s3Error, s3Fetch, type S3Config } from './s3-sign.ts';
import type { Lang } from './lang.ts';

export const MAX_PLACES = 10;

export interface PushPlace {
  id: string;
  path: string;
  nom: string;
}

export interface PushSubscriptionRecord {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  places: PushPlace[];
  /**
   * L'idioma del domini des d'on es va activar: `es` des d'`es.tempscat.cat`.
   * Les subscripcions anteriors al castellà no el porten, i són en català.
   */
  lang?: Lang;
  createdAt: string;
  updatedAt: string;
}

/**
 * Quin episodi s'ha avisat ja, i fins quan dura.
 *
 * La clau és la del grup de `groupWarnings()` —fenomen, magnitud, nivell i
 * zones—, que no porta data: el mateix episodi segueix sent el mateix encara
 * que cada dia arribi un fitxer nou. `until` s'allarga mentre l'episodi
 * continuï, i l'entrada s'esborra quan fa dotze hores que s'ha acabat: un
 * altre episodi igual una setmana després torna a avisar.
 */
export interface SentEpisodes {
  episodes: Record<string, { sentAt: string; until: string }>;
}

export const SENT_KEY = 'enviats.json';

/**
 * La configuració, o `null` si no hi és. A mitges, llança: creure que es desa
 * una subscripció que no es desa és pitjor que dir que la funció no hi és.
 */
export function pushStoreConfig(): S3Config | null {
  const accountId = process.env.PUSH_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID;
  const bucket = process.env.PUSH_R2_BUCKET;
  const accessKeyId = process.env.PUSH_R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.PUSH_R2_SECRET_ACCESS_KEY;
  if (!bucket && !accessKeyId && !secretAccessKey) return null;

  const missing = [
    !accountId && 'PUSH_R2_ACCOUNT_ID',
    !bucket && 'PUSH_R2_BUCKET',
    !accessKeyId && 'PUSH_R2_ACCESS_KEY_ID',
    !secretAccessKey && 'PUSH_R2_SECRET_ACCESS_KEY',
  ].filter(Boolean);
  if (missing.length) {
    throw new Error(`configuració dels avisos al mòbil incompleta: falta ${missing.join(', ')}`);
  }
  return { accountId: accountId!, bucket: bucket!, accessKeyId: accessKeyId!, secretAccessKey: secretAccessKey! };
}

/** La clau de l'objecte: l'empremta de l'adreça, que no surt mai en un nom de fitxer. */
export function subscriptionKey(endpoint: string): string {
  return `subs/${createHash('sha256').update(endpoint).digest('hex').slice(0, 32)}.json`;
}

export async function getJson<T>(cfg: S3Config, key: string): Promise<T | null> {
  const res = await s3Fetch(cfg, { method: 'GET', key });
  if (res.status === 404) return null;
  if (!res.ok) throw await s3Error(res);
  return (await res.json()) as T;
}

export async function putJson(cfg: S3Config, key: string, value: unknown): Promise<void> {
  const res = await s3Fetch(cfg, {
    method: 'PUT',
    key,
    body: new TextEncoder().encode(JSON.stringify(value)),
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' },
  });
  if (!res.ok) throw await s3Error(res);
}

export async function deleteKey(cfg: S3Config, key: string): Promise<void> {
  const res = await s3Fetch(cfg, { method: 'DELETE', key });
  // Esborrar el que ja no hi és no és cap error: és el resultat que es volia.
  if (!res.ok && res.status !== 404) throw await s3Error(res);
}

/**
 * Totes les claus sota un prefix, pàgina a pàgina.
 *
 * R2 en torna mil com a màxim per resposta i diu si n'hi ha més amb
 * `IsTruncated`; quedar-se amb la primera pàgina deixaria sense avís, en
 * silenci, tothom qui es va subscriure després del mil·lèsim.
 */
export async function listKeys(cfg: S3Config, prefix: string): Promise<string[]> {
  const keys: string[] = [];
  let token: string | null = null;
  do {
    const query: Record<string, string> = { 'list-type': '2', prefix };
    if (token) query['continuation-token'] = token;
    const res = await s3Fetch(cfg, { method: 'GET', key: '', query });
    if (!res.ok) throw await s3Error(res);
    const xml = await res.text();
    for (const m of xml.matchAll(/<Key>([^<]+)<\/Key>/g)) keys.push(unescapeXml(m[1]));
    token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
      ? unescapeXml(/<NextContinuationToken>([^<]+)<\/NextContinuationToken>/.exec(xml)?.[1] ?? '')
      : null;
    if (token === '') throw new Error('R2 diu que la llista continua però no dona per on');
  } while (token);
  return keys;
}

function unescapeXml(s: string): string {
  return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'").replace(/&amp;/g, '&');
}

/**
 * Els serveis de notificacions dels navegadors que existeixen.
 *
 * L'API accepta adreces d'aquests i de cap més: sense aquesta llista, qualsevol
 * podria fer que el worker fes peticions a l'adreça que volgués cada cop que hi
 * ha un avís.
 */
const PUSH_HOSTS = [
  /^fcm\.googleapis\.com$/,
  /^updates\.push\.services\.mozilla\.com$/,
  /^web\.push\.apple\.com$/,
  /\.notify\.windows\.com$/,
  /^push\.services\.mozilla\.com$/,
];

export function validPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== 'string' || endpoint.length > 1000) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  return url.protocol === 'https:' && PUSH_HOSTS.some((re) => re.test(url.hostname));
}

/** Les claus del navegador: base64url, 65 bytes la pública i 16 la d'autenticació. */
export function validKeys(keys: unknown): keys is { p256dh: string; auth: string } {
  if (!keys || typeof keys !== 'object') return false;
  const { p256dh, auth } = keys as Record<string, unknown>;
  const b64url = /^[A-Za-z0-9_-]+={0,2}$/;
  return typeof p256dh === 'string' && typeof auth === 'string'
    && b64url.test(p256dh) && b64url.test(auth)
    && p256dh.length >= 86 && p256dh.length <= 90
    && auth.length >= 21 && auth.length <= 24;
}
