import { locationByPath } from '@/lib/territory';
import { langFromHost, type Lang } from '@/lib/lang';
import {
  MAX_PLACES, deleteKey, getJson, pushStoreConfig, putJson, subscriptionKey,
  validKeys, validPushEndpoint, type PushSubscriptionRecord,
} from '@/lib/push-store';

/**
 * Els avisos al mòbil d'un aparell: quins llocs, afegir-ne, treure'n o apagar-ho.
 *
 *     POST /api/alertes  {"action": "status", "subscription": {...}}
 *     POST /api/alertes  {"action": "add",    "subscription": {...}, "path": "/maresme/malgrat-de-mar"}
 *     POST /api/alertes  {"action": "remove", "subscription": {...}, "path": "/maresme/malgrat-de-mar"}
 *     POST /api/alertes  {"action": "off",    "subscription": {...}}
 *
 * `subscription` és el que torna `PushSubscription.toJSON()` al navegador. No
 * hi ha comptes ni sessions: qui té l'adreça de la subscripció és l'aparell
 * mateix, i és l'única cosa que deixa llegir-la o canviar-la. Per això és POST
 * i no una adreça amb paràmetres: no queda en cap registre.
 *
 * Les regles de què s'envia i quan són a `src/lib/push-alerts.ts`; on es desa i
 * per què en privat, a `src/lib/push-store.ts`.
 */

export const dynamic = 'force-dynamic';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Robots-Tag': 'noindex',
};

const answer = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: HEADERS });

type Action = 'status' | 'add' | 'remove' | 'off';

export async function POST(req: Request) {
  const store = pushStoreConfig();
  if (!store) return answer({ error: 'unavailable' }, 503);

  // Una subscripció i un camí ocupen menys d'un quilobyte: res més gran té sentit.
  const text = await req.text();
  if (text.length > 4096) return answer({ error: 'bad-request' }, 400);

  let action: unknown;
  let subscription: { endpoint?: unknown; keys?: unknown } | undefined;
  let path: unknown;
  try {
    ({ action, subscription, path } = JSON.parse(text));
  } catch {
    return answer({ error: 'bad-request' }, 400);
  }
  if (!['status', 'add', 'remove', 'off'].includes(action as string)
    || !subscription || !validPushEndpoint(subscription.endpoint)) {
    return answer({ error: 'bad-request' }, 400);
  }

  try {
    // L'idioma surt del domini: una subscripció feta des d'es.tempscat.cat rep els avisos en castellà.
    const lang = langFromHost(req.headers.get('host'));
    return await apply(store, action as Action, subscription.endpoint, subscription.keys, path, lang);
  } catch (err) {
    // El magatzem no respon: es diu, i el navegador ensenya «torneu-ho a provar».
    console.error('alertes:', (err as Error).message);
    return answer({ error: 'store' }, 503);
  }
}

async function apply(
  store: NonNullable<ReturnType<typeof pushStoreConfig>>,
  action: Action, endpoint: string, keys: unknown, path: unknown, lang: Lang,
): Promise<Response> {
  const key = subscriptionKey(endpoint);
  const stored = await getJson<PushSubscriptionRecord>(store, key);
  const placesOf = (r: PushSubscriptionRecord | null) => r?.places ?? [];

  switch (action) {
    case 'status':
      return answer({ places: placesOf(stored) });

    case 'off':
      await deleteKey(store, key);
      return answer({ places: [] });

    case 'remove': {
      if (!stored) return answer({ places: [] });
      const places = stored.places.filter((p) => p.path !== path);
      if (!places.length) {
        await deleteKey(store, key);
        return answer({ places: [] });
      }
      await putJson(store, key, { ...stored, places, updatedAt: new Date().toISOString() });
      return answer({ places });
    }

    case 'add': {
      if (!validKeys(keys)) return answer({ error: 'bad-request' }, 400);
      const loc = typeof path === 'string' ? locationByPath(path) : undefined;
      if (!loc || !loc.published) return answer({ error: 'unknown-place' }, 400);

      const places = placesOf(stored).filter((p) => p.id !== loc.id);
      if (places.length >= MAX_PLACES) return answer({ error: 'too-many', places }, 400);
      places.push({ id: loc.id, path: loc.path, nom: loc.nom });

      const now = new Date().toISOString();
      const record: PushSubscriptionRecord = {
        endpoint,
        // Les claus poden canviar si el navegador renova la subscripció: es desen les d'ara.
        keys,
        places,
        // El de l'última vegada que s'hi ha afegit un lloc. Cada domini té el seu
        // service worker, i per tant les seves subscripcions: a la pràctica no canvia.
        lang,
        createdAt: stored?.createdAt ?? now,
        updatedAt: now,
      };
      await putJson(store, key, record);
      return answer({ places });
    }
  }
}
