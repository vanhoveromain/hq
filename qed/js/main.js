// main.js: starts QED HQ and decides which screen to show.
//
// One page. The part of the address after "#" says which screen you're on
// (#/priorities, #/sales…). Changing it doesn't reload the page: we just draw
// another screen inside <main>. This is a "hash router", like Sport HQ.

import { HQ_BASE, IS_PREVIEW } from "./hqBase.js";
import { requireLogin, loginUrl, onAuthChange, runRollover } from "./storage.js";
import * as homeView from "./views/home.js";
import * as projectView from "./views/project.js";
import * as prioritiesView from "./views/priorities.js";
import * as focusView from "./views/focus.js";
import * as plannerView from "./views/planner.js";
import * as unlockView from "./views/unlock.js";
import { make as placeholder } from "./views/placeholder.js";

// The shared HQ switcher in the top bar (served by ownhq.app; localhost:
// serve.py's /_hq/). Loaded on the side: if it fails, "QED HQ" stays a link.
import(HQ_BASE + "switcher.js").catch(() => {});

// The four tabs. Their order here = their order in the bars.
const routes = {
  home:       { title: "Home", view: homeView },
  // A project's page: draws its own heading; the Home tab stays lit.
  project:    { title: "", view: projectView, tab: "home" },
  // Focus mode: one task full screen (no tabs, no footer), from To do today.
  focus:      { title: "", view: focusView, tab: "priorities" },
  priorities: { title: (p) => (p[0] === "tomorrow" ? "Priorities for tomorrow" : "Priorities of the day"), view: prioritiesView },
  planner:    { title: "Task planner", view: plannerView },
  sales:      { title: "Sales",
                view: placeholder("Your sales leads and reach-out dates.", "8") },
};
const DEFAULT_ROUTE = "home";

const viewEl = document.getElementById("view");
const titleEl = document.getElementById("page-title");
const navLinks = document.querySelectorAll("[data-route]");

let currentUser = null;
let current = null; // the screen on show
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
  const title = typeof routes[name].title === "function" ? routes[name].title(params) : routes[name].title;
  titleEl.textContent = title;
  document.title = name === DEFAULT_ROUTE ? "QED HQ" : `${title} · QED HQ`;
  for (const link of navLinks) {
    const active = link.dataset.route === (routes[name].tab || name);
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page");
    else link.removeAttribute("aria-current");
  }
  window.scrollTo(0, 0);
  // Leaving a screen: let it clean up (Focus mode stops its timer).
  if (current && current.view.leave) current.view.leave();
  current = routes[name];
  document.body.classList.toggle("is-focus", name === "focus");
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

  // Test address: say so in the top bar, so it's never mistaken for live.
  if (IS_PREVIEW) document.body.classList.add("is-preview");

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
