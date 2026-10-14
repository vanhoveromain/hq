// main.js — starts the app and decides which screen to show.
//
// The app is a single page. The part of the address after "#" says which
// screen you're on, e.g. index.html#/planner. Changing it doesn't reload the
// page; we just draw a different view inside <main>. This is a "hash router".

import { getCurrentUser, getLoginErrorFromUrl, onAuthChange } from "./storage.js?v=202610141733";
import * as loginView from "./views/login.js?v=202610141733";
import * as dashboardView from "./views/dashboard.js?v=202610141733";
import * as plannerView from "./views/planner.js?v=202610141733";
import * as logView from "./views/log.js?v=202610141733";
import * as racesView from "./views/races.js?v=202610141733";
import * as meView from "./views/me.js?v=202610141733";
import * as shoesView from "./views/shoes.js?v=202610141733";
import * as blocksView from "./views/blocks.js?v=202610141733";
import * as bodyView from "./views/body.js?v=202610141733";
import * as catalogueView from "./views/catalogue.js?v=202610141733";
import * as weekTemplatesView from "./views/weekTemplates.js?v=202610141733";
import * as workoutView from "./views/workout.js?v=202610141733";

// The list of screens: address name -> title + module that draws it.
// `tab` = which bottom tab lights up, for screens that live "inside" another tab.
const routes = {
  dashboard: { title: "Home", view: dashboardView },
  planner:   { title: "Weekly plan", view: plannerView },
  log:       { title: "Activity log", view: logView },
  races:     { title: "Races", view: racesView },
  me:        { title: "Me", view: meView },
  shoes:     { title: "Shoes", view: shoesView, tab: "me" },
  blocks:    { title: "Training blocks", view: blocksView, tab: "me" },
  body:      { title: "Body & goals", view: bodyView, tab: "me" },
  catalogue: { title: "Session catalogue", view: catalogueView, tab: "planner" },
  weektemplates: { title: "Week templates", view: weekTemplatesView, tab: "planner" },
  workout:   { title: "Workout", view: workoutView, tab: "planner" },
};
const DEFAULT_ROUTE = "dashboard";

const viewEl = document.getElementById("view");
const titleEl = document.getElementById("page-title");
const tabbarEl = document.getElementById("tabbar");

let currentUser = null;
let loginMessage = ""; // e.g. "This link has expired", shown on the login screen


// Splits the address after "#" into the screen name and extra parts:
//   "#/log"         -> { name: "log", params: [] }
//   "#/log/new"     -> { name: "log", params: ["new"] }
//   "#/log/abc-123" -> { name: "log", params: ["abc-123"] }  (edit that activity)
// Unknown screen -> name is null.
function currentRoute() {
  const [name, ...params] = window.location.hash.replace(/^#\/?/, "").split("/");
  return { name: routes[name] ? name : null, params };
}

// Turns "Email link is invalid or has expired" into a message with a next step.
function loginErrorMessage() {
  const reason = getLoginErrorFromUrl();
  return reason ? reason + ". Please ask for a new link." : "";
}

// Draws the right screen for the current state (logged in? which tab?).
function render() {
  if (!currentUser) {
    tabbarEl.hidden = true;
    titleEl.textContent = "Log in";
    loginView.render(viewEl, { message: loginMessage });
    return;
  }

  const { name, params } = currentRoute();
  if (!name) {
    // Unknown or empty address: go to the default screen. replaceState
    // swaps the address without adding a "back" step in the browser.
    history.replaceState(null, "", "#/" + DEFAULT_ROUTE);
    return render();
  }

  tabbarEl.hidden = false;
  titleEl.textContent = routes[name].title;
  for (const link of tabbarEl.querySelectorAll("a")) {
    link.classList.toggle("active", link.dataset.route === (routes[name].tab || name));
  }
  window.scrollTo(0, 0); // a new screen starts at the top
  routes[name].view.render(viewEl, { user: currentUser, params });
}

async function start() {
  loginMessage = loginErrorMessage();

  try {
    currentUser = await getCurrentUser();
  } catch (error) {
    loginMessage = "Could not check your login: " + error.message;
  }

  onAuthChange((user) => {
    const wasLoggedIn = Boolean(currentUser);
    currentUser = user;
    if (user) loginMessage = "";
    // Only redraw when logging in or out, not on silent token refreshes.
    if (wasLoggedIn !== Boolean(user)) render();
  });

  window.addEventListener("hashchange", render);
  render();
}

start();
