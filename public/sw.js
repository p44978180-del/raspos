/* TIM Campus: cache only this build's public app shell.
 * Schedule catalog/shards use a bounded IndexedDB cache in campus-data.ts.
 * API responses, credentials and cross-origin requests never enter CacheStorage.
 */
importScripts("./sw-precache.js");
const BUILD = self.__TIM_PRECACHE__;
const SCOPE = new URL(self.registration.scope);
const PREFIX = "tim-campus-v4-" + encodeURIComponent(SCOPE.pathname) + "-";
const CACHE = PREFIX + BUILD.version;
const ASSETS = new Set(BUILD.assets.map(p => new URL(p, SCOPE).href));
const INDEX = new URL("index.html", SCOPE).href;

self.addEventListener("install", event => {
  event.waitUntil((async () => {
    if (!Array.isArray(BUILD.assets) || BUILD.assets.length > 96) throw new Error("Invalid app manifest");
    const cache = await caches.open(CACHE);
    // Atomic install: failure keeps the previous working service worker active.
    await cache.addAll([...ASSETS].map(url => new Request(url, { credentials: "omit", cache: "reload" })));
    await self.skipWaiting();
  })());
});

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter(name => (name.startsWith(PREFIX) && name !== CACHE) || name === "rgau-schedule-v2.0.0").map(name => caches.delete(name)));
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", event => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== SCOPE.origin || !url.pathname.startsWith(SCOPE.pathname)
    || request.headers.has("Authorization") || url.username || url.password) return;
  const relative = url.pathname.slice(SCOPE.pathname.length);
  // Exact allowlist: no API, public JSON, arbitrary navigations or query-string variants.
  const navigation = request.mode === "navigate" && (relative === "" || relative === "index.html") && !url.search;
  if (!navigation && (!ASSETS.has(url.href) || url.search)) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    // Always use one internally consistent build. Updates install a new shell atomically.
    const cached = await cache.match(navigation ? INDEX : url.href);
    if (cached) return cached;
    // No runtime cache writes: only the finite, build-generated manifest is persisted.
    return fetch(request);
  })());
});
