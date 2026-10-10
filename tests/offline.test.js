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
    const prefix = `nepean-navigator:${path}:`;
    const cache = {
      async addAll(urls) {
        for (const url of urls) {
          const relative = url.slice(base.length);
          assert.ok(existsSync(new URL(`../${relative}`, import.meta.url)));
          entries.set(url, readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8'));
        }
      },
      async match(url) {return entries.get(url);},
    };
    vm.runInNewContext(readFileSync(new URL('../sw.js', import.meta.url), 'utf8'), {
      URL,
      self: {location: {href: base + 'sw.js'}, clients: {async claim() {}}, addEventListener(name, fn) {handlers[name] = fn;}},
      caches: {async open() {return cache;}, async keys() {return [prefix + 'v0', prefix + 'v1', 'other-app'];}, async delete(name) {deleted.push(name);}},
      fetch() {throw new Error('Offline');},
    });
    let pending;
    handlers.install({waitUntil(promise) {pending = promise;}}); await pending;
    handlers.activate({waitUntil(promise) {pending = promise;}}); await pending;
    assert.deepEqual(deleted, [prefix + 'v0']);
    for (const name of ['', '?test=1', 'index.html', 'app.js', 'routing.js', 'data.js', 'style.css']) {
      let response;
      handlers.fetch({request: {url: base + name, method: 'GET', mode: name === '' || name.startsWith('?') || name === 'index.html' ? 'navigate' : 'cors'}, respondWith(promise) {response = promise;}});
      assert.ok(await response, `offline response for ${base + name}`);
    }
    let intercepted = false;
    handlers.fetch({request: {url: 'https://example.test/unrelated/file', method: 'GET', mode: 'cors'}, respondWith() {intercepted = true;}});
    assert.equal(intercepted, false);
    const manifest = JSON.parse(readFileSync(new URL('../manifest.webmanifest', import.meta.url)));
    assert.equal(new URL(manifest.start_url, base + 'manifest.webmanifest').href, base);
    assert.equal(new URL(manifest.scope, base + 'manifest.webmanifest').href, base);
  }
});
