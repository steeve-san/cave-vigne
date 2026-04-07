// Cave & Vigne — Service Worker
const CACHE_NAME = 'cave-vigne-v1';
const STATIC_ASSETS = ['/', '/index.html'];

self.addEventListener('install', evt => {
  evt.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', evt => {
  evt.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

// Network-first strategy for API, cache-first for static assets
self.addEventListener('fetch', evt => {
  const url = new URL(evt.request.url);

  // Skip non-GET and cross-origin
  if (evt.request.method !== 'GET' || !url.origin.includes(self.location.origin)) return;

  // API: always network
  if (url.pathname.startsWith('/api/')) return;

  // Static assets: cache-first
  evt.respondWith(
    caches.match(evt.request).then(cached => {
      if (cached) return cached;
      return fetch(evt.request).then(resp => {
        if (resp.ok) {
          const clone = resp.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(evt.request, clone));
        }
        return resp;
      }).catch(() => caches.match('/'));
    })
  );
});
