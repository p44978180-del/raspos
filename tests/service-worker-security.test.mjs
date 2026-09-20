import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

function worker() {
  const events = new Map(), writes = [], deleted = [], fetched = [];
  const scope = 'https://example.com/raspos/';
  const cache = { addAll: async entries => writes.push(...entries.map(e => e.url)), match: async key => new Response(String(key)) };
  const self = { registration: { scope }, __TIM_PRECACHE__: { version: 'a1', assets: ['index.html', 'assets/app-a1.js', 'assets/app-a1.css'] }, addEventListener: (type, fn) => events.set(type, fn), skipWaiting: async () => {}, clients: { claim: async () => {} } };
  vm.runInNewContext(fs.readFileSync(new URL('../public/sw.js', import.meta.url), 'utf8'), { self, URL, Request, importScripts: () => {}, caches: { open: async () => cache, keys: async () => ['tim-campus-v4-%2Fraspos%2F-old', 'tim-campus-v4-%2Fother%2F-old', 'other-app', 'rgau-schedule-v2.0.0'], delete: async key => deleted.push(key) }, fetch: async req => { fetched.push(req.url); return new Response('network'); } });
  return { events, writes, deleted, fetched };
}

test('precache is finite, omits credentials and contains only the build shell', async () => {
  const w = worker(); let done;
  w.events.get('install')({ waitUntil: p => { done = p; } }); await done;
  assert.deepEqual(w.writes, ['https://example.com/raspos/index.html', 'https://example.com/raspos/assets/app-a1.js', 'https://example.com/raspos/assets/app-a1.css']);
});

test('API, data, cross-origin, POST, Authorization and query variants bypass the worker', () => {
  const w = worker();
  for (const [path, options] of [
    ['/raspos/api/private', {}], ['/api/private', {}], ['/raspos/data/official-schedule.json', {}], ['/raspos/data/groups/1-aaaa.json', {}],
    ['https://foreign.example/assets/app-a1.js', {}], ['/raspos/assets/app-a1.js?token=private', {}], ['/raspos/notes', {}],
    ['/raspos/assets/app-a1.js', { method: 'POST' }], ['/raspos/assets/app-a1.js', { headers: { Authorization: 'Bearer private' } }],
  ]) {
    let handled = false;
    w.events.get('fetch')({ request: new Request(new URL(path, 'https://example.com'), options), respondWith: () => { handled = true; } });
    assert.equal(handled, false, path);
  }
});

test('hashed asset reads the scoped build cache', async () => {
  const w = worker(); let response;
  w.events.get('fetch')({ request: new Request('https://example.com/raspos/assets/app-a1.js'), respondWith: p => { response = p; } });
  assert.equal(await (await response).text(), 'https://example.com/raspos/assets/app-a1.js');
  assert.equal(w.fetched.length, 0);
});

test('activation deletes only this app scope and its known legacy cache', async () => {
  const w = worker(); let done;
  w.events.get('activate')({ waitUntil: p => { done = p; } }); await done;
  assert.deepEqual(w.deleted.sort(), ['rgau-schedule-v2.0.0', 'tim-campus-v4-%2Fraspos%2F-old']);
});
