// main.js: starts QED HQ and decides which screen to show.
//
// One page. The part of the address after "#" says which screen you're on
// (#/priorities, #/sales…). Changing it doesn't reload the page: we just draw
// another screen inside <main>. This is a "hash router", like Sport HQ.

import { requireLogin, loginUrl, onAuthChange, runRollover } from "./storage.js";
import * as homeView from "./views/home.js";
import * as unlockView from "./views/unlock.js";
import { make as placeholder } from "./views/placeholder.js";

// The shared HQ switcher in the top bar (served by ownhq.app; localhost:
// serve.py's /_hq/). Loaded on the side: if it fails, "QED HQ" stays a link.
const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(window.location.hostname);
import(ON_OWNHQ ? "https://ownhq.app/switcher.js" : "/_hq/switcher.js").catch(() => {});

// The four tabs. Their order here = their order in the bars.
const routes = {
  home:       { title: "Home", view: homeView },
  priorities: { title: "Priorities of the day",
                view: placeholder("Today's tasks, the 1-3-5 counter and the bulk buttons.", "5") },
  planner:    { title: "Task planner",
                view: placeholder("This week's boards, with drag and drop.", "7") },
  sales:      { title: "Sales",
                view: placeholder("Your sales leads and reach-out dates.", "8") },
};
const DEFAULT_ROUTE = "home";

const viewEl = document.getElementById("view");
const titleEl = document.getElementById("page-title");
const navLinks = document.querySelectorAll("[data-route]");

let currentUser = null;
let locked = true;

function currentRoute() {
  const [name, ...params] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { name: routes[name] ? name : null, params };
}

function render() {
  if (!currentUser) return; // on the way to the hq login page

  if (locked) {
    document.body.classList.add("is-locked");
    titleEl.textContent = ""; // the Unlock screen has its own heading
    unlockView.render(viewEl, { user: currentUser, onUnlocked: afterUnlock });
    return;
  }
  document.body.classList.remove("is-locked");

  const { name, params } = currentRoute();
  if (!name) {
    history.replaceState(null, "", "#/" + DEFAULT_ROUTE);
    return render();
  }
  titleEl.textContent = routes[name].title;
  document.title = name === DEFAULT_ROUTE ? "QED HQ" : `${routes[name].title} · QED HQ`;
  for (const link of navLinks) {
    const active = link.dataset.route === name;
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
  routes[name].view.render(viewEl, { user: currentUser, params });
}

// Safety net for the nightly rollover, every time the app opens (or unlocks).
// Silent: if it fails, the hourly database run still does the job.
async function rollover() {
  try {
    await runRollover();
  } catch (error) {
    console.warn("Rollover on open failed:", error.message);
  }
}

async function afterUnlock() {
  locked = false;
  await rollover();
  render();
}

async function start() {
  // Not logged in to hq: requireLogin sends you to the hq login page, which
  // brings you back to this exact screen afterwards.
  const result = await requireLogin();
  currentUser = result.user;
  locked = result.locked;

  onAuthChange((user) => {
    if (!user) {
      // Logged out (here or on another hq site): to the hq login page.
      currentUser = null;
      window.location.replace(loginUrl(window.location.href));
      return;
    }
    currentUser = user;
  });

  if (!locked) await rollover();
  document.documentElement.dataset.ready = "true";
  render();
  window.addEventListener("hashchange", render);
}

start().catch((error) => {
  document.documentElement.dataset.ready = "true";
  viewEl.innerHTML = `<p class="error">QED HQ could not start: ${String(error.message || error)
    .replaceAll("<", "&lt;")}</p>`;
});
