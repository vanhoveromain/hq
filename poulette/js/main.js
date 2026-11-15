// main.js: starts Poulette HQ and decides which screen to show.
//
// One page. The part of the address after "#" says which screen you're on
// (#/journal, #/reglages…). Changing it doesn't reload the page: we just draw
// another screen inside <main>. A "hash router", like Sport HQ and QED HQ.

import { HQ_BASE, IS_PREVIEW } from "./hqBase.js";
import { requireLogin, loginUrl, onAuthChange, getMyHousehold } from "./storage.js";
import { errorHtml } from "./utils/html.js";
import * as reglages from "./views/reglages.js";
import * as welcome from "./views/welcome.js";
import * as homeView from "./views/home.js";
import * as journal from "./views/journal.js";
import * as suivi from "./views/suivi.js";
import * as pediatre from "./views/pediatre.js";
import * as store from "./store.js";
import { setMembers, closePanel } from "./views/actions.js";
import { openSheet } from "./utils/sheet.js";
import { escapeHtml } from "./utils/html.js";

// The shared HQ switcher in the top bar (served by ownhq.app; localhost:
// serve.py's /_hq/). Loaded on the side: if it fails, "Poulette HQ" stays a link.
import(HQ_BASE + "switcher.js").catch(() => {});

// The five tabs, in the order of the bottom bar.
const routes = {
  accueil:  { title: "", view: homeView },
  journal:  { title: "Journal", view: journal },
  suivi:    { title: "Suivi", view: suivi },
  pediatre: { title: "Pédiatre", view: pediatre },
  reglages: { title: "Réglages", view: reglages, noHouseholdOk: true },
};
const DEFAULT_ROUTE = "accueil";

const viewEl = document.getElementById("view");
const titleEl = document.getElementById("page-title");
const navLinks = document.querySelectorAll("[data-route]");

let user = null;
let home = null;        // { household, member, babies } or null (no household yet)
let homeError = null;   // loading the household failed (network...)

function currentRoute() {
  const [name, ...params] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { name: routes[name] ? name : null, params };
}

function render() {
  if (!user) return; // on the way to the hq login page
  const { name, params } = currentRoute();
  if (!name) {
    history.replaceState(null, "", "#/" + DEFAULT_ROUTE);
    return render();
  }
  const route = routes[name];
  titleEl.textContent = route.title;
  document.title = route.title ? `${route.title} · Poulette HQ` : "Poulette HQ";
  for (const link of navLinks) {
    const active = link.dataset.route === name;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  if (!keepScroll) window.scrollTo(0, 0);
  keepScroll = false;
  document.body.classList.toggle("no-household", !home && !homeError);

  if (homeError && !route.noHouseholdOk) {
    viewEl.innerHTML = errorHtml("Impossible de charger le foyer. Vérifie la connexion.");
    return;
  }
  if (!home && !route.noHouseholdOk) {
    titleEl.textContent = "";
    welcome.render(viewEl, { user, onDone: () => reload() });
    return;
  }
  if (current && current !== route.view && current.leave) current.leave();
  current = route.view;
  route.view.render(viewEl, { user, home, params, reload });
}
let current = null;

// The data changed (an entry, the other phone, the outbox): the screen on
// show redraws its live part (screens with a form keep what you typed).
function onStoreChange() {
  drawOutboxBadge();
  if (current && current.refresh) current.refresh(viewEl);
}

// Load the household again (after creating it, or changing the baby) and
// redraw the screen you're on, unless { draw: false }.
let keepScroll = false;
async function reload({ draw = true } = {}) {
  await loadHome();
  if (draw) {
    keepScroll = true;
    render();
  }
}

async function loadHome() {
  try {
    home = await getMyHousehold(user.id);
    homeError = null;
  } catch (error) {
    console.warn("Household not loaded:", error.message);
    homeError = error;
  }
  showOffline();
  if (home && home.babies[0]) {
    setMembers(home.members);
    store.start({ userId: user.id, babyId: home.babies[0].id, householdId: home.household.id });
  }
}

// Top bar: "⏳ 2 en attente" (not sent yet) / "⚠ 1 refusée" (tap: details).
function drawOutboxBadge() {
  const badge = document.getElementById("outbox-badge");
  const { pending, failed } = store.outboxState();
  badge.hidden = !pending && !failed.length;
  badge.classList.toggle("failed", failed.length > 0);
  badge.textContent = failed.length ? `⚠ ${failed.length} refusée${failed.length > 1 ? "s" : ""}` : `⏳ ${pending} en attente`;
}
document.getElementById("outbox-badge").addEventListener("click", () => {
  const { pending, failed } = store.outboxState();
  openSheet({
    title: "Saisies pas encore enregistrées",
    body: `${pending ? `<p>${pending} saisie(s) attendent le réseau. Elles sont gardées sur ce téléphone et partiront toutes seules.</p>` : ""}
      ${failed.map((i) => { const d = store.describeItem(i); return `<div class="card failed-item"><strong>${escapeHtml(d.how)} · ${escapeHtml(d.what)}</strong>
        <span class="hint">${escapeHtml(i.error || "")}</span>
        <div class="actions"><button type="button" class="btn danger small" data-drop="${i.seq}">Abandonner</button>
        <button type="button" class="btn small" data-retry-item="${i.seq}">Réessayer</button></div></div>`; }).join("")}
      ${pending ? '<button type="button" class="btn block" data-send>Envoyer maintenant</button>' : ""}`,
    onOpen(el, close) {
      el.querySelectorAll("[data-drop]").forEach((b) => b.addEventListener("click", async () => { await store.dropItem(Number(b.dataset.drop)); close(); }));
      el.querySelectorAll("[data-retry-item]").forEach((b) => b.addEventListener("click", async () => { await store.retryItem(Number(b.dataset.retryItem)); close(); }));
      el.querySelector("[data-send]")?.addEventListener("click", () => { store.flush(); close(); });
    },
  });
});
store.onChange(onStoreChange);

// "Hors ligne" in the top bar: no network, or data shown from this device.
function showOffline() {
  const offline = !navigator.onLine || Boolean(home && home.fromCache);
  document.getElementById("offline-badge").hidden = !offline;
}

// Back online after showing cached data: load the fresh household again.
window.addEventListener("online", async () => {
  if (!user) return;
  if (home && !home.fromCache && !homeError) return showOffline();
  await loadHome();
  render();
});
window.addEventListener("offline", showOffline);

// The service worker (sw.js) keeps the app's files on the phone, so it opens
// without network. Only on https (or localhost while testing).
if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js").catch((error) => console.warn("Service worker:", error.message));
  // Hand it the scripts this page loaded from other sites (see sw.js).
  navigator.serviceWorker.ready.then((registration) => {
    const urls = performance.getEntriesByType("resource")
      .map((entry) => entry.name)
      .filter((name) => /\.(m?js)(\?|$)|\/\+esm$|cdn\.jsdelivr\.net/.test(name));
    if (registration.active) registration.active.postMessage({ type: "cache-these", urls });
  }).catch(() => {});
}

async function start() {
  // Not logged in: requireLogin sends you to the hq login page, which brings
  // you back to this exact screen afterwards.
  user = await requireLogin();

  onAuthChange((next) => {
    if (!next) {
      // Logged out (here or on another hq site): to the hq login page.
      user = null;
      window.location.replace(loginUrl(window.location.href));
      return;
    }
    user = next;
  });

  // Test address: say so in the top bar, so it's never mistaken for live.
  if (IS_PREVIEW) document.body.classList.add("is-preview");

  await loadHome();
  document.documentElement.dataset.ready = "true";
  render();
  window.addEventListener("hashchange", () => { closePanel(); render(); });
  // Back to the app after a while (phone in the pocket): fresh data.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && home && !home.fromCache) store.refresh();
  });

  // "Réessayer" on a loading error: load the household again, then redraw.
  viewEl.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-retry]")) return;
    viewEl.innerHTML = '<p class="muted">Chargement…</p>';
    await loadHome();
    render();
  });
}

start();
