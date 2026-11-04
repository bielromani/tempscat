/*
 * El service worker de tempscat. Fa dues coses i cap més:
 *
 *  · ensenyar un avís oficial quan arriba (`push`)
 *  · obrir la fitxa del lloc quan es toca (`notificationclick`)
 *
 * No té `fetch`: no desa res i no s'interposa entre el navegador i el web, que
 * segueix sortint sempre de la xarxa amb les dades d'ara. Només s'instal·la si
 * algú activa els avisos a /avisos/alertes; qui no ho fa, no el té.
 */

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    // Un missatge que no s'entén no s'inventa: es diu que hi ha un avís i prou.
  }
  const title = data.title || 'Avís meteorològic oficial';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    tag: data.tag || 'tempscat-avisos',
    renotify: true,
    icon: '/apple-icon.png',
    lang: 'ca',
    data: { url: data.url || '/avisos' },
  }));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/avisos', self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of open) {
      if (client.url === url && 'focus' in client) return client.focus();
    }
    return self.clients.openWindow(url);
  })());
});
