// Both placeholders are replaced at build time (see stampServiceWorker in
// vite.config.js). Served unstamped (dev), the cache name is a stable dev one
// and nothing extra is precached.
const CACHE_NAME = 'splurge-__BUILD_VERSION__';
const BUILD_ASSETS = "__PRECACHE_ASSETS__";
const PRECACHE = ['./', './index.html', './manifest.json'].concat(
  Array.isArray(BUILD_ASSETS) ? BUILD_ASSETS : []
);

self.addEventListener('install', (e) => {
  // No skipWaiting(): a new worker waits until old tabs close, so assets are
  // never swapped under a live page.
  e.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE)));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key.startsWith('splurge-') && key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  
  // Network-first for HTML pages so we always get the latest version
  const accept = e.request.headers.get('accept') || '';
  if (e.request.mode === 'navigate' || accept.includes('text/html')) {
    e.respondWith(
      fetch(e.request)
        .then((response) => {
          const responseClone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
          return response;
        })
        .catch(() => caches.match('./index.html'))
    );
    return;
  }
  
  // Stale-while-revalidate for other assets (CSS, JS, images)
  e.respondWith(
    caches.match(e.request).then((cachedResponse) => {
      const fetchPromise = fetch(e.request).then((networkResponse) => {
        if (networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, responseClone));
        }
        return networkResponse;
      }).catch(() => null);
      
      return cachedResponse || fetchPromise;
    })
  );
});
