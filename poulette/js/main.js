// main.js: starts Poulette HQ and decides which screen to show.
//
// One page. The part of the address after "#" says which screen you're on
// (#/journal, #/reglages…). Changing it doesn't reload the page: we just draw
// another screen inside <main>. A "hash router", like Sport HQ and QED HQ.

import { HQ_BASE, IS_PREVIEW } from "./hqBase.js";
import { requireLogin, loginUrl, onAuthChange, getMyHousehold } from "./storage.js";
import { errorHtml } from "./utils/html.js";
import * as screens from "./views/placeholders.js";
import * as reglages from "./views/reglages.js";
import * as welcome from "./views/welcome.js";

// The shared HQ switcher in the top bar (served by ownhq.app; localhost:
// serve.py's /_hq/). Loaded on the side: if it fails, "Poulette HQ" stays a link.
import(HQ_BASE + "switcher.js").catch(() => {});

// The five tabs, in the order of the bottom bar.
const routes = {
  accueil:  { title: "", view: screens.home },
  journal:  { title: "Journal", view: screens.journal },
  suivi:    { title: "Suivi", view: screens.suivi },
  pediatre: { title: "Pédiatre", view: screens.pediatre },
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
  route.view.render(viewEl, { user, home, params, reload });
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
}

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
  window.addEventListener("hashchange", render);

  // "Réessayer" on a loading error: load the household again, then redraw.
  viewEl.addEventListener("click", async (event) => {
    if (!event.target.closest("[data-retry]")) return;
    viewEl.innerHTML = '<p class="muted">Chargement…</p>';
    await loadHome();
    render();
  });
}

start();
