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
