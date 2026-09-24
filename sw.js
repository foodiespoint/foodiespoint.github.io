// ==========================================================================
// FOODIES POINT SERVICE WORKER (BETA ENVIRONMENT - v17)
// ==========================================================================
const CACHE_NAME = 'fp-beta-cache-v17';

const ASSETS_TO_CACHE = [
  '/',
  '/index.html?v=17',
  '/app.js?v=17',
  '/manifest.json?v=17',
  '/icon.png'
];

self.addEventListener('install', (event) => {
  console.log('[Beta SW v17] Installing new service worker...');
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    })
  );
});

self.addEventListener('activate', (event) => {
  console.log('[Beta SW v17] Activating & wiping old caches...');
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('push', (event) => {
  console.log('[Beta SW v17] Native Push Event Received:', event);

  let data = { title: "Foodies Point Beta 🍛", body: "Today's live menu is updated!" };
  if (event.data) {
    try {
      data = event.data.json();
    } catch (e) {
      data.body = event.data.text();
    }
  }

  const iconUrl = self.registration.scope + 'icon.png';

  const options = {
    body: data.body,
    icon: iconUrl,
    badge: iconUrl,
    vibrate: [300, 100, 300, 100, 300], 
    requireInteraction: true, 
    data: { url: self.registration.scope }
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || self.registration.scope)
  );
});

self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  if (event.request.mode === 'navigate' || requestUrl.pathname.endsWith('.js') || requestUrl.pathname.endsWith('.html')) {
    event.respondWith(
      fetch(event.request)
        .then((networkResponse) => {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseClone);
          });
          return networkResponse;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    event.respondWith(
      caches.match(event.request).then((cachedResponse) => {
        return cachedResponse || fetch(event.request);
      })
    );
  }
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
