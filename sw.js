// TSP Work service worker: keeps the app itself on the device so it opens
// without a connection. Online it always fetches fresh files (network first)
// and refreshes the saved copy; offline it serves the saved copy.
// Practice audio, lyrics and data are saved by app.js (Cache Storage /
// localStorage), not here. Supabase, Cloudflare and Ableton requests are
// never touched.
const SHELL = 'tsp-app-shell-v1';

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(caches.open(SHELL).then((cache) => cache.addAll(['./', './index.html']).catch(() => {})));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  if (!sameOrigin && url.hostname !== 'esm.sh') return;

  if (url.hostname === 'esm.sh') {
    // Pinned library versions never change: saved copy first.
    event.respondWith(caches.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
      return res;
    })));
    return;
  }

  event.respondWith(fetch(req).then((res) => {
    if (res.ok && !url.pathname.endsWith('sw.js')) { const copy = res.clone(); caches.open(SHELL).then((c) => c.put(req, copy)); }
    return res;
  }).catch(async () => {
    const hit = await caches.match(req);
    if (hit) return hit;
    if (req.mode === 'navigate') return (await caches.match('./index.html', { ignoreSearch: true })) || (await caches.match('./')) || Response.error();
    // Same file with a different ?v= (e.g. app.js?v=…): the newest saved one.
    return (await caches.match(req, { ignoreSearch: true })) || Response.error();
  }));
});
