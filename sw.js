// Bump VERSION whenever a deployed app-shell file changes.
const VERSION = 'v0.2.83';
const BASE = new URL('./', self.location.href);
const PREFIX = `nepean-navigator:${BASE.pathname}:`;
const CACHE = PREFIX + VERSION;
const HOME = new URL('index.html', BASE).href;
const ASSETS = [
  'index.html', 'app.js', 'install.js', 'routing.js', 'floor-map.js', 'route-map.js', 'data.js', 'style.css',
  'manifest.webmanifest', 'icons/helmet-32.png', 'icons/helmet-192.png', 'icons/helmet-512.png',
  'public/nepean_infographic.png', 'public/share-qr.svg',
  'public/floor-0.svg', 'public/floor-1.svg', 'public/floor-2.svg', 'public/floor-3.svg',
].map(path => new URL(path, BASE).href);
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // Wait for existing tabs to close before activating a new shell version.
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const isHome = event.request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === `${BASE.pathname}index.html`);
  const asset = isHome ? HOME : url.origin + url.pathname;
  if (!ASSETS.includes(asset)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(asset)) || fetch(event.request);
  })());
});
