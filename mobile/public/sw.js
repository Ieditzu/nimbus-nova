// Only the offline screen and branding are cached. API/private data always use the network.
const CACHE = 'nova-pwa-shell-v1';
const SHELL = ['/offline.html', '/icons/nova-192.png', '/icons/nova-512.png'];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('nova-pwa-shell-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || event.request.mode !== 'navigate') return;
  event.respondWith(fetch(event.request).catch(() => caches.match('/offline.html')));
});
self.addEventListener('push', event => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch {}
  const title = payload.title || 'Nova';
  const options = {
    body: payload.body || 'Ai o noutate în contul tău Nova.',
    icon: '/icons/nova-192.png',
    badge: '/icons/nova-192.png',
    data: payload.data || {},
  };
  event.waitUntil(self.registration.showNotification(title, options));
});
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const data = event.notification.data || {};
  const target = data.conversation_id
    ? `/messages/${encodeURIComponent(data.conversation_id)}`
    : data.task_id && data.screen === 'job_applications'
      ? `/jobs/${encodeURIComponent(data.task_id)}`
      : data.task_id
        ? `/task/${encodeURIComponent(data.task_id)}`
        : '/';
  event.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async windows => {
    const current = windows.find(client => new URL(client.url).origin === self.location.origin);
    if (current) {
      await current.navigate(target);
      return current.focus();
    }
    return clients.openWindow(target);
  }));
});
