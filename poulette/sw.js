// sw.js: the service worker. It lets Poulette HQ OPEN WITHOUT NETWORK (step
// 0.5c, offline level 2): every file the app needs to start is kept in a
// cache on the phone.
//
// Rules:
// - The app's own files, the hq login + switcher (ownhq.app / hq-preview)
//   -> network first (so updates arrive at once), the cached copy if the
//      network fails or takes more than 3 s (bad bedroom wifi at night).
// - supabase-js from jsDelivr: its address holds an exact version, it never
//   changes -> cache first.
// - The DATABASE (supabase.co) is never cached here: data goes through the
//   app (storage.js), which decides what to keep.
//
// Changing a file of the app: nothing to do (network first). Changing THIS
// file's rules: bump VERSION, the old cache is then thrown away.

const VERSION = "v1";
const CACHE = "poulette-" + VERSION;
const TIMEOUT_MS = 3000;

// The app's own files, cached at install so the very first offline open works.
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "assets/hq-tokens.css",
  "assets/fonts/Geist-Variable.woff2",
  "icons/poulette-hq-icon-32.png",
  "icons/poulette-hq-icon-180.png",
  "icons/poulette-hq-icon-192.png",
  "js/main.js",
  "js/hqBase.js",
  "js/storage.js",
  "js/utils/html.js",
  "js/views/placeholders.js",
  "js/views/reglages.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("poulette-") && n !== CACHE).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

// The page's first visit happens BEFORE this worker is in charge, so the files
// it loaded from other sites (login, switcher, supabase-js) didn't pass here.
// main.js sends their addresses once the worker is ready: cache them now, so
// the very next opening already works offline.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type !== "cache-these" || !Array.isArray(data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (const address of data.urls) {
      try {
        const url = new URL(address);
        if (url.hostname !== "cdn.jsdelivr.net" && !isHqFile(url) && url.origin !== self.location.origin) continue;
        if (await cache.match(address)) continue;
        const response = await fetch(new Request(address, { mode: "cors" }));
        if (response.ok) await cache.put(address, response);
      } catch { /* try again on the next opening */ }
    }
  })());
});

function isHqFile(url) {
  // ownhq.app/auth.js, hq-preview.ownhq.app/switcher.js... (and /_hq/ locally)
  return (/(^|\.)ownhq\.app$/.test(url.hostname) && url.origin !== self.location.origin)
    || url.pathname.startsWith("/_hq/");
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);

  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(cacheFirst(request));
    return;
  }
  if (request.mode === "navigate" && url.origin === self.location.origin) {
    // Any page of the app = index.html (the screens live after "#").
    event.respondWith(networkFirst(request, "index.html"));
    return;
  }
  if (url.origin === self.location.origin || isHqFile(url)) {
    event.respondWith(networkFirst(request));
  }
  // Everything else (the database, other sites): the browser as usual.
});

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.ok) (await caches.open(CACHE)).put(request, response.clone());
  return response;
}

async function networkFirst(request, fallbackPath) {
  const cache = await caches.open(CACHE);
  try {
    const response = await withTimeout(fetch(request), TIMEOUT_MS);
    if (response.ok) cache.put(fallbackPath || request, response.clone());
    return response;
  } catch {
    const cached = await cache.match(fallbackPath || request, { ignoreSearch: true });
    if (cached) return cached;
    return new Response("Hors ligne", { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }
}

function withTimeout(promise, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}
