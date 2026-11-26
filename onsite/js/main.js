// main.js: starts Onsite HQ and decides which screen to show (hash router,
// like QED HQ):
//   #/events               your events (Home)
//   #/event/<id>/ros       an event's run of show
//   #/event/<id>/pack      an event's packing list
//   #/materials            QED's master material list

import { IS_PREVIEW } from "./hqBase.js";
import * as store from "./storage.js";
import * as eventsView from "./views/events.js";
import * as eventView from "./views/event.js";
import * as materialsView from "./views/materials.js";
import * as unlockView from "./views/unlock.js";
import { escapeHtml } from "./utils/html.js";

const routes = {
  events: { title: "Events", view: eventsView },
  event:  { title: "", view: eventView },
  materials: { title: "Material list", view: materialsView },
};
const DEFAULT_ROUTE = "events";

const viewEl = document.getElementById("view");
const titleEl = document.getElementById("page-title");
const syncEl = document.getElementById("sync");

let currentUser = null;
let locked = true;
let current = null;

function currentRoute() {
  const [name, ...params] = location.hash.replace(/^#\/?/, "").split("/");
  return { name: routes[name] ? name : null, params };
}

function render({ keepScroll = false } = {}) {
  if (!currentUser) return;
  if (locked) {
    document.body.classList.add("is-locked");
    titleEl.textContent = "";
    unlockView.render(viewEl, { user: currentUser, onUnlocked: afterUnlock });
    return;
  }
  document.body.classList.remove("is-locked");
  const { name, params } = currentRoute();
  if (!name) {
    history.replaceState(null, "", "#/" + DEFAULT_ROUTE);
    return render();
  }
  const route = routes[name];
  if (current !== route && current && current.view.leave) current.view.leave();
  current = route;
  for (const link of document.querySelectorAll("[data-route]")) {
    const active = link.dataset.route === (name === "event" ? "events" : name);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  }
  titleEl.textContent = route.title;
  document.title = route.title ? `${route.title} · Onsite HQ` : "Onsite HQ";
  if (!keepScroll) window.scrollTo(0, 0);
  viewEl.onclick = null; // a screen's tap handler never outlives it
  route.view.render(viewEl, { user: currentUser, params });
}

// The copy on this device changed (a sync, or a change on another screen):
// redraw where you are, unless you're typing in the screen (the screen then
// redraws itself when it's ready) or a pop-up is open.
let redrawTimer = null;
function redrawSoon() {
  clearTimeout(redrawTimer);
  redrawTimer = setTimeout(() => {
    const typing = document.activeElement && viewEl.contains(document.activeElement)
      && document.activeElement.matches("input, textarea, select, [contenteditable]");
    if (typing || document.querySelector("dialog[open]")) return redrawSoon();
    if (current && current.view.onStoreChange) current.view.onStoreChange();
    else render({ keepScroll: true });
  }, 150);
}

// The sync pill in the top bar. Tap = sync now.
function drawSync() {
  const s = store.syncStatus();
  let text, kind;
  if (!s.online || s.state === "offline") {
    text = s.pending ? `Offline · ${s.pending} change${s.pending > 1 ? "s" : ""} waiting` : "Offline · saved on this iPad";
    kind = "offline";
  } else if (s.state === "syncing") {
    text = "Syncing…"; kind = "syncing";
  } else if (s.state === "error" || s.error) {
    text = "Sync problem"; kind = "error";
  } else if (s.pending) {
    text = `${s.pending} to send`; kind = "syncing";
  } else if (!s.lastSync) {
    text = "Connecting…"; kind = "syncing";
  } else {
    text = "Synced"; kind = "ok";
  }
  syncEl.className = `sync sync-${kind}`;
  syncEl.innerHTML = `<span class="sync-dot"></span><span class="sync-text">${escapeHtml(text)}</span>`;
  syncEl.title = s.error ? s.error : s.lastSync ? `Last sync ${new Date(s.lastSync).toLocaleTimeString("en-GB")}` : "";
}

async function afterUnlock() {
  locked = false;
  start2();
}

let started = false;
function start2() {
  if (started) return render();
  started = true;
  store.openStore(currentUser);
  store.subscribe(() => { drawSync(); redrawSoon(); });
  drawSync();
  syncEl.addEventListener("click", () => {
    const s = store.syncStatus();
    if (s.error) alert(s.error);
    store.sync();
  });
  render();
  window.addEventListener("hashchange", () => render());
}

async function start() {
  if (IS_PREVIEW) document.body.classList.add("is-preview");
  const result = await store.requireLogin();
  currentUser = result.user;
  locked = result.locked;

  store.onAuthChange((user) => {
    if (!user) {
      currentUser = null;
      location.replace(store.loginUrl(location.href));
    }
  });

  document.documentElement.dataset.ready = "true";
  if (locked) return render();
  start2();
}

// Offline: keep the app files on this device (service worker).
// The login file and the database library are loaded before the service
// worker starts, so they are handed to it once it's ready: every file this
// page already loaded gets saved, and the next start works offline.
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js")
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      const urls = performance.getEntriesByType("resource").map((e) => e.name)
        .filter((url) => !url.includes("supabase.co"));
      registration.active?.postMessage({ type: "keep", urls: [location.href.split("#")[0], ...urls] });
    })
    .catch((error) => console.warn("Offline mode unavailable:", error));
}

start().catch((error) => {
  document.documentElement.dataset.ready = "true";
  viewEl.innerHTML = `<p class="error">Onsite HQ could not start: ${escapeHtml(error.message || error)}</p>`;
});
