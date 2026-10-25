// shortcuts.js — keyboard shortcuts for the laptop (step 29d).
//
//   N        new activity
//   ← / →    previous / next week (or month) in the planner
//   T        today: this week / month in the planner, else Home
//   /        the Log's search box
//   ?        the list of shortcuts
//
// They never fire while you type in a box, while a pop-up is open, with
// Cmd / Ctrl / Alt held (the browser's own shortcuts keep working), or on
// screens without the tab bar (login, workout mode).

import { openSheet } from "./sheet.js?v=202610252239";

export const SHORTCUTS = [
  { keys: ["N"], what: "New activity" },
  { keys: ["←", "→"], what: "Previous / next week (or month) in the planner" },
  { keys: ["T"], what: "Today: this week in the planner, else Home" },
  { keys: ["/"], what: "Search the log" },
  { keys: ["?"], what: "This list" },
];

// Shows the list in a pop-up (also opened from Settings).
export function showShortcuts() {
  openSheet({
    title: "Keyboard shortcuts",
    html: `<dl class="shortcut-list">
      ${SHORTCUTS.map((s) => `<div><dt>${s.keys.map((k) => `<kbd>${k}</kbd>`).join(" ")}</dt><dd>${s.what}</dd></div>`).join("")}
    </dl>
    <p class="muted small">Not while you're typing in a box.</p>`,
  });
}

// Starts listening (main.js calls it once).
export function startShortcuts() {
  document.addEventListener("keydown", (event) => {
    if (!shortcutsAllowed(event)) return;
    const done = runShortcut(event.key);
    if (done) event.preventDefault();
  });
}

function shortcutsAllowed(event) {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return false;
  const target = event.target;
  if (target.closest("input, textarea, select, [contenteditable='true']")) return false;
  if (document.querySelector("dialog[open]")) return false;
  const tabbar = document.getElementById("tabbar");
  return Boolean(tabbar) && !tabbar.hidden; // logged in, not in workout mode
}

// Does what the key asks. Returns true when the key was a shortcut.
function runShortcut(key) {
  const route = window.location.hash.replace(/^#\/?/, "").split("/");
  const inPlanner = route[0] === "planner";
  const inMonth = inPlanner && route[1] === "month";

  if (key === "n" || key === "N") return go("#/log/new");
  if (key === "t" || key === "T") {
    if (!inPlanner) return go("#/dashboard");
    return go(inMonth ? `#/planner/month/${monthOfToday()}` : "#/planner");
  }
  if ((key === "ArrowLeft" || key === "ArrowRight") && inPlanner) {
    // The planner's own ‹ › buttons know where to go.
    const buttons = document.querySelectorAll(".week-head > .nav-button");
    const button = key === "ArrowLeft" ? buttons[0] : buttons[1];
    if (!button) return false;
    button.click();
    return true;
  }
  if (key === "/") {
    if (route[0] !== "log" || route[1]) go("#/log");
    focusLogSearch();
    return true;
  }
  if (key === "?") {
    showShortcuts();
    return true;
  }
  return false;
}

function go(hash) {
  window.location.hash = hash;
  return true;
}

// "2026-10" for today (the local date, like the rest of the app).
function monthOfToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

// The search box appears once the Log screen is drawn: try for up to a second.
function focusLogSearch(triesLeft = 10) {
  const box = document.getElementById("log-search");
  if (box) return box.focus();
  if (triesLeft > 0) setTimeout(() => focusLogSearch(triesLeft - 1), 100);
}
