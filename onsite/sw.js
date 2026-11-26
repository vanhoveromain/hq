// sw.js: keeps Onsite HQ's files on this device, so the app opens without a
// connection (venue Wi-Fi). Data is NOT handled here: storage.js keeps its own
// copy of the events and syncs it.
//
//   App files (this site, the hq login file, fonts): network first, so you
//   always get the latest version when online; the saved copy when offline
//   or when the network takes more than 4 s.
//   Libraries from cdn.jsdelivr.net (exact versions, never change): saved
//   copy first.
//   The database (supabase.co): never touched here.
//
// Change VERSION when the list of files below changes.

const VERSION = "onsite-v2";
const SHELL = [
  "./",
  "index.html",
  "manifest.webmanifest",
  "css/app.css",
  "assets/hq-tokens.css",
  "assets/fonts/Geist-Variable.woff2",
  "assets/onsite-hq.svg",
  "assets/onsite-hq-icon-32.png",
  "assets/onsite-hq-icon-180.png",
  "js/main.js",
  "js/hqBase.js",
  "js/storage.js",
  "js/rules.js",
  "js/seed.js",
  "js/utils/html.js",
  "js/utils/dates.js",
  "js/utils/dialog.js",
  "js/utils/toast.js",
  "js/views/events.js",
  "js/views/event.js",
  "js/views/eventForm.js",
  "js/views/packing.js",
  "js/views/materials.js",
  "js/views/unlock.js",
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((cache) => cache.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key !== VERSION) await caches.delete(key);
    await self.clients.claim();
  })());
});

// The page sends the files it loaded before this worker was running (login
// file, database library): save the ones we keep, if not saved yet.
self.addEventListener("message", (event) => {
  if (!event.data || event.data.type !== "keep") return;
  event.waitUntil((async () => {
    const cache = await caches.open(VERSION);
    for (const href of event.data.urls || []) {
      try {
        const url = new URL(href);
        if (!keepable(url) || await cache.match(href, { ignoreSearch: true })) continue;
        const response = await fetch(href, { mode: url.origin === self.location.origin ? "same-origin" : "cors" });
        if (response.ok) await cache.put(href, response);
      } catch { /* not important: saved on the next visit */ }
    }
  })());
});

function keepable(url) {
  if (url.hostname.endsWith("supabase.co")) return false;
  return url.origin === self.location.origin || url.hostname === "cdn.jsdelivr.net"
    || /(^|\.)ownhq\.app$/.test(url.hostname);
}

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.hostname.endsWith("supabase.co")) return;

  if (url.hostname === "cdn.jsdelivr.net") {
    event.respondWith(cacheFirst(request));
    return;
  }
  const ours = url.origin === self.location.origin
    || /(^|\.)ownhq\.app$/.test(url.hostname)
    || url.hostname === "localhost";
  if (ours) event.respondWith(networkFirst(request));
});

async function cacheFirst(request) {
  const cache = await caches.open(VERSION);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) cache.put(request, response.clone());
  return response;
}

async function networkFirst(request) {
  const cache = await caches.open(VERSION);
  try {
    const response = await Promise.race([
      fetch(request),
      new Promise((_, reject) => setTimeout(() => reject(new Error("slow")), 4000)),
    ]);
    // Login pages and redirects are not kept: only real files.
    if (response.ok && response.type !== "opaqueredirect") cache.put(request, response.clone());
    return response;
  } catch (error) {
    const hit = await cache.match(request, { ignoreSearch: true })
      || (request.mode === "navigate" ? await cache.match("index.html") : null);
    if (hit) return hit;
    throw error;
  }
}

