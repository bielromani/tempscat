'use client';

import { useEffect, useState } from 'react';
import { tr, type Lang } from '@/lib/lang';
import { placeName } from '@/lib/format';

/**
 * Activar, revisar i apagar els avisos al mòbil d'aquest aparell.
 *
 * Només viu a `/avisos/alertes` i no el carrega cap altra pàgina: les fitxes hi
 * enllacen amb un `<a>` normal. Sense JavaScript no pot fer res —una
 * subscripció la crea el navegador—, i per això el servidor pinta un text que
 * diu què cal, i aquest component el substitueix.
 *
 * L'aparell no té compte ni nom: el que l'identifica davant de `/api/alertes`
 * és la seva pròpia subscripció, que només té ell.
 */

interface Place { path: string; nom: string }

type State =
  | { kind: 'checking' }
  | { kind: 'unsupported' }
  | { kind: 'ios' }
  | { kind: 'denied' }
  | { kind: 'ready'; places: Place[]; subscribed: boolean }
  | { kind: 'error'; message: string };

function urlBase64ToBytes(base64: string): Uint8Array<ArrayBuffer> {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(new ArrayBuffer(raw.length));
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

async function call(action: string, subscription: PushSubscription, path?: string, lang: Lang = 'ca'): Promise<Place[]> {
  const res = await fetch('/api/alertes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ action, subscription: subscription.toJSON(), path }),
  });
  const body = await res.json().catch(() => ({})) as { places?: Place[]; error?: string };
  if (!res.ok) {
    throw new Error(body.error === 'too-many'
      ? tr(lang, 'Ja teniu deu llocs triats en aquest aparell. Traieu-ne algun per afegir-ne un altre.',
        'Ya tiene diez lugares elegidos en este dispositivo. Quite alguno para añadir otro.')
      : tr(lang, 'No s’ha pogut desar. Torneu-ho a provar d’aquí a una estona.',
        'No se ha podido guardar. Vuelva a intentarlo dentro de un rato.'));
  }
  return body.places ?? [];
}

async function currentSubscription(): Promise<PushSubscription | null> {
  const reg = await navigator.serviceWorker.getRegistration('/');
  return reg ? reg.pushManager.getSubscription() : null;
}

export function PushAlerts(
  { vapidKey, place, lang = 'ca' }: { vapidKey: string; place: Place | null; lang?: Lang },
) {
  const t = (ca: string, es: string) => tr(lang, ca, es);
  const [state, setState] = useState<State>({ kind: 'checking' });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
      /*
       * A l'iPhone i l'iPad les notificacions web només funcionen amb el web
       * afegit a la pantalla d'inici (iOS 16.4 o posterior). Des de Safari,
       * `PushManager` ni hi és, i dir «aquest navegador no ho permet» faria
       * pensar que no hi ha manera.
       */
      const ios = /iPhone|iPad|iPod/.test(navigator.userAgent)
        || (navigator.userAgent.includes('Mac') && navigator.maxTouchPoints > 1);
      const standalone = window.matchMedia('(display-mode: standalone)').matches;
      let next: State;
      if (!supported) next = ios && !standalone ? { kind: 'ios' } : { kind: 'unsupported' };
      else if (Notification.permission === 'denied') next = { kind: 'denied' };
      else {
        const sub = await currentSubscription().catch(() => null);
        const places = sub ? await call('status', sub, undefined, lang).catch(() => []) : [];
        next = { kind: 'ready', places, subscribed: !!sub };
      }
      if (!cancelled) setState(next);
    })();
    return () => { cancelled = true; };
  }, [lang]);

  async function run(fn: () => Promise<State>) {
    setBusy(true);
    try {
      setState(await fn());
    } catch (err) {
      setState({ kind: 'error', message: (err as Error).message });
    } finally {
      setBusy(false);
    }
  }

  const add = () => run(async () => {
    if (!place) throw new Error(t('Falta el lloc.', 'Falta el lugar.'));
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return { kind: 'denied' };
    const reg = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription()
      ?? await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToBytes(vapidKey) });
    return { kind: 'ready', places: await call('add', sub, place.path, lang), subscribed: true };
  });

  const remove = (path: string) => run(async () => {
    const sub = await currentSubscription();
    if (!sub) return { kind: 'ready', places: [], subscribed: false };
    const places = await call('remove', sub, path, lang);
    if (!places.length) await sub.unsubscribe();
    return { kind: 'ready', places, subscribed: places.length > 0 };
  });

  const off = () => run(async () => {
    const sub = await currentSubscription();
    if (sub) {
      await call('off', sub, undefined, lang);
      await sub.unsubscribe();
    }
    return { kind: 'ready', places: [], subscribed: false };
  });

  switch (state.kind) {
    case 'checking':
      return <p className="text-[var(--muted)]">{t('Comprovant aquest aparell…', 'Comprobando este dispositivo…')}</p>;
    case 'unsupported':
      return <p>{t('Aquest navegador no permet rebre notificacions d’un web. Proveu-ho amb Chrome, Firefox, Edge o Safari actualitzats.', 'Este navegador no permite recibir notificaciones de una web. Pruebe con Chrome, Firefox, Edge o Safari actualizados.')}</p>;
    case 'ios':
      return (
        <p>
          {t('A l’iPhone i l’iPad, primer cal afegir el web a la pantalla d’inici: toqueu el botó de compartir de Safari i després «Afegeix a la pantalla d’inici». Obriu TempsCat des d’aquella icona, torneu a aquesta pàgina i ja ho podreu activar (cal iOS 16.4 o posterior).',
            'En el iPhone y el iPad, primero hay que añadir la web a la pantalla de inicio: toque el botón de compartir de Safari y después «Añadir a pantalla de inicio». Abra TempsCat desde ese icono, vuelva a esta página y ya podrá activarlo (hace falta iOS 16.4 o posterior).')}
        </p>
      );
    case 'denied':
      return (
        <p>
          {t('Les notificacions d’aquest web estan bloquejades al navegador. Per activar-les, canvieu el permís de notificacions de tempscat.cat a la configuració del lloc web del navegador i torneu a carregar aquesta pàgina.',
            'Las notificaciones de esta web están bloqueadas en el navegador. Para activarlas, cambie el permiso de notificaciones de es.tempscat.cat en la configuración del sitio web del navegador y vuelva a cargar esta página.')}
        </p>
      );
    case 'error':
      return (
        <div className="space-y-3">
          <p>{state.message}</p>
          <button type="button" className="btn" onClick={() => location.reload()}>{t('Torna-ho a provar', 'Volver a intentarlo')}</button>
        </div>
      );
  }
  const already = place && state.places.some((p) => p.path === place.path);
  return (
    <div className="space-y-4">
      {place && !already && (
        <button type="button" className="btn btn-primary" disabled={busy} onClick={add}>
          {t(`Avisa’m per ${place.nom}`, `Recibir avisos para ${placeName(place.nom, lang)}`)}
        </button>
      )}
      {place && already && <p>{t(`Ja rebeu els avisos per ${place.nom} en aquest aparell.`, `Ya recibe los avisos para ${placeName(place.nom, lang)} en este dispositivo.`)}</p>}

      {state.places.length > 0 ? (
        <div>
          <h2 className="card-title">{t('Llocs d’aquest aparell', 'Lugares de este dispositivo')}</h2>
          <ul className="mt-2 divide-y divide-[var(--line)]">
            {state.places.map((p) => (
              <li key={p.path} className="flex items-center justify-between gap-3 py-2">
                <a href={p.path}>{placeName(p.nom, lang)}</a>
                <button type="button" className="btn btn-quiet" disabled={busy} onClick={() => remove(p.path)}>
                  {t('Treu', 'Quitar')}
                </button>
              </li>
            ))}
          </ul>
          <button type="button" className="btn btn-quiet mt-3" disabled={busy} onClick={off}>
            {t('Apaga tots els avisos en aquest aparell', 'Desactivar todos los avisos en este dispositivo')}
          </button>
        </div>
      ) : (
        !place && <p>{t('Aquest aparell no rep cap avís. Obriu la fitxa del vostre poble i toqueu «Avisos al mòbil».', 'Este dispositivo no recibe ningún aviso. Abra la ficha de su pueblo y toque «Avisos en el móvil».')}</p>
      )}
    </div>
  );
}
