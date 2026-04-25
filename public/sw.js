// otto — service worker.
// 1) Listens for `push` events, parses { title, body, url } JSON, shows a
//    notification, and on click focuses or opens the target url.
// 2) Caches a small set of static assets on install. On fetch, network-first
//    with cache fallback (so offline reloads still get something).

const CACHE_NAME = 'otto-cache-v1';
const PRECACHE = [
  '/css/main.css',
  '/js/app.js',
  '/js/push.js',
  '/manifest.json',
  '/img/icon-192.png',
  '/img/icon-512.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE).catch(() => {}))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Only handle same-origin GETs.
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    fetch(req)
      .then((resp) => {
        // Best-effort cache write for the whitelisted assets.
        if (PRECACHE.some((p) => url.pathname === p)) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then((c) => c.put(req, clone)).catch(() => {});
        }
        return resp;
      })
      .catch(() => caches.match(req))
  );
});

self.addEventListener('push', (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (err) {
    data = { title: 'otto', body: event.data ? event.data.text() : '' };
  }

  const title = data.title || 'otto';
  const options = {
    body: data.body || '',
    icon: '/img/icon-192.png',
    badge: '/img/icon-192.png',
    data: { url: data.url || '/' },
  };

  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || '/';

  event.waitUntil(
    self.clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientsArr) => {
        for (const c of clientsArr) {
          if ('focus' in c) {
            try {
              c.navigate(url);
            } catch (e) {
              /* navigate not supported in some browsers */
            }
            return c.focus();
          }
        }
        if (self.clients.openWindow) {
          return self.clients.openWindow(url);
        }
        return null;
      })
  );
});
