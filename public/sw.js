// otto — minimal push service worker.
// Listens for `push` events, parses { title, body, url } JSON, shows a
// notification, and on click focuses or opens the target url.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
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
    icon: '/favicon.ico',
    badge: '/favicon.ico',
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
