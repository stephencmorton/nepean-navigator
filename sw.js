// Offline app-shell caching scoped to this installation's directory and version.
// Bump VERSION whenever a deployed app-shell file changes.
const VERSION = 'v0.2.37';
// Scope asset URLs and cache ownership to support both root and subpath hosting.
const BASE = new URL('./', self.location.href);
const PREFIX = `nepean-navigator:${BASE.pathname}:`;
const CACHE = PREFIX + VERSION;
const HOME = new URL('index.html', BASE).href;
// Resolve the complete shell against the installation directory rather than the domain root.
const ASSETS = ['index.html', 'app.js', 'route-map.js', 'routing.js', 'data.js', 'style.css', 'manifest.webmanifest', 'icons/helmet-32.png', 'icons/helmet-192.png', 'icons/helmet-512.png', 'public/nepean_infographic.png'].map(path => new URL(path, BASE).href);
// Download the entire shell before allowing this worker to finish installation.
self.addEventListener('install', event => {
  // Populate the versioned cache atomically through the browser's bulk cache operation.
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
  // Wait for existing tabs to close before activating a new shell version.
});
// Retire only this installation's old caches and take control of its open clients.
self.addEventListener('activate', event => {
  // Complete cache cleanup before activation finishes.
  event.waitUntil((async () => {
    for (const name of await caches.keys()) {
      if (name.startsWith(PREFIX) && name !== CACHE) await caches.delete(name);
    }
    await self.clients.claim();
  })());
});
// Serve known shell assets and home navigation while leaving unrelated requests untouched.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== BASE.origin || !url.pathname.startsWith(BASE.pathname)) return;
  const isHome = event.request.mode === 'navigate' && (url.pathname === BASE.pathname || url.pathname === `${BASE.pathname}index.html`);
  const asset = isHome ? HOME : url.origin + url.pathname;
  if (!ASSETS.includes(asset)) return;
  // Prefer the installed shell, falling back to the network if an entry is missing.
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    return (await cache.match(asset)) || fetch(event.request);
  })());
});
