// Simulated service-worker checks for shell caching, cache isolation, and hosting paths.
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync, existsSync} from 'node:fs';
import vm from 'node:vm';

test('service worker caches the shell and serves it offline at root and repo subpath', async () => {
  for (const path of ['/', '/nepean-navigator/']) {
    const base = `https://example.test${path}`;
    const handlers = {};
    const entries = new Map();
    let deleted = [];
    const workerSource = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
    const version = workerSource.match(/const VERSION = '([^']+)'/)[1];
    const prefix = `nepean-navigator:${path}:`;
    // Load actual app files into an in-memory cache to exercise the worker offline.
    const cache = {
      // Reject shell entries that do not exist in the repository.
      async addAll(urls) {
        for (const url of urls) {
          const relative = url.slice(base.length);
          assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)));
          entries.set(url, readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
        }
      },
      // Resolve a cached asset without requiring browser CacheStorage.
      async match(url) {return entries.get(url);},
    };
    // Supply worker lifecycle and cache APIs while making network access fail.
    vm.runInNewContext(workerSource, {
      URL,
      self: {
        location: {href: base + 'sw.js'},
        clients: {
          // Allow activation to claim clients without a browser session.
          async claim() {},
        },
        // Capture lifecycle handlers so the test can dispatch events explicitly.
        addEventListener(name, fn) {handlers[name] = fn;},
      },
      caches: {
        // Share the in-memory shell cache across lifecycle and fetch handlers.
        async open() {return cache;},
        // Include stale, current, and unrelated caches to test cleanup boundaries.
        async keys() {return [prefix + 'v0', prefix + version, 'other-app'];},
        // Record cleanup requests for assertions without deleting real browser data.
        async delete(name) {deleted.push(name);},
      },
      // Fail immediately if an offline request unexpectedly needs the network.
      fetch() {throw new Error('Offline');},
    });
    // Finish installation and activation before requesting cached shell assets.
    let pending;
    handlers.install({waitUntil(promise) {pending = promise;}}); await pending;
    handlers.activate({waitUntil(promise) {pending = promise;}}); await pending;
    assert.deepEqual(deleted, [prefix + 'v0']);
    for (const name of ['', '?test=1', 'index.html', 'app.js', 'app.js?version=1', 'index.html?version=1', 'routing.js', 'data.js', 'style.css', 'public/nepean_infographic.png']) {
      let response;
      handlers.fetch({request: {url: base + name, method: 'GET', mode: name === '' || name.startsWith('?') || name === 'index.html' ? 'navigate' : 'cors'}, respondWith(promise) {response = promise;}});
      assert.ok(await response, `offline response for ${base + name}`);
    }
    // Ensure unrelated requests bypass the worker and manifest URLs stay within scope.
    let intercepted = false;
    handlers.fetch({request: {url: 'https://example.test/unrelated/file', method: 'GET', mode: 'cors'}, respondWith() {intercepted = true;}});
    assert.equal(intercepted, false);
    const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url)));
    assert.equal(new URL(manifest.start_url, base + 'manifest.webmanifest').href, base);
    assert.equal(new URL(manifest.scope, base + 'manifest.webmanifest').href, base);
  }
});
