/* Service worker: lets the app open offline and load quickly.
   App files are cached on install. Everything else (artwork images, country
   details, fonts) is cached the first time it is fetched. */

const VERSION = "daily-hub-v7";

const APP_FILES = [
  "./",
  "index.html",
  "style.css",
  "app.js",
  "manifest.json",
  "icons/icon-192.png",
  "data/art.json",
  "data/contemporary.json",
  "data/debate.json",
  "data/places.json",
  "data/ideas.json",
  "data/watch.json",
  "data/move.json",
  "data/money.json",
  "data/work.json",
  "data/mind.json",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(APP_FILES)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const sameOrigin = new URL(req.url).origin === self.location.origin;

  if (sameOrigin) {
    // Network first, and skip the browser's own cache (GitHub Pages asks for
    // 10 minutes), so updates show on the next open; fall back offline.
    event.respondWith(
      fetch(req.url, { cache: "no-cache" })
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((cache) => cache.put(req, copy));
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || caches.match("index.html")))
    );
    return;
  }

  // Images, fonts and country data: use the cache if we have it, update in the background.
  event.respondWith(
    caches.open(VERSION).then((cache) =>
      cache.match(req).then((hit) => {
        const network = fetch(req)
          .then((res) => {
            if (res.ok || res.type === "opaque") cache.put(req, res.clone());
            return res;
          })
          .catch(() => hit);
        return hit || network;
      })
    )
  );
});
