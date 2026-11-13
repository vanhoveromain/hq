// keys.js: keyboard shortcuts on a laptop (UX review #7, Romain 2026-11-13).
//
//   N            put the cursor in "Add a task" (screens with quick add)
//   G then H/P/L/S   go to Home / Priorities / pLanner / Sales
//   ?            the list of shortcuts
// The selected task (a row in a task list, or a card on the Planner):
//   ↓ ↑ or J K   select the next / previous one (click an empty part of a
//                row or card selects it too; hovering doesn't)
//   Enter        open it (double-click does the same)
//   X            done / back to open
//   T            push to tomorrow
//   1 … 5        priority Critical … Nice to do
//   ← →          Planner: move the card to the previous / next column
//   Esc          clear the selection
//
// The screens do the actual work: this file sends a "qed:task-key" event to
// the selected row / card ({ action, value }) and taskList.js / planner.js
// handle it, with their usual Undo.

import { PRIORITIES } from "../rules.js";
import { openDialog } from "./dialog.js";

const ITEMS = ".task-list [data-task], [data-card]";
const GO = { h: "#/home", p: "#/priorities", l: "#/planner", s: "#/sales" };

let viewEl = null;
let selectedId = null;
let lastIndex = 0;

const idOf = (el) => el.dataset.task || el.dataset.card;

// What can be selected right now, top to bottom (visible ones only: folded
// "Done" lists don't count).
function items() {
  return [...viewEl.querySelectorAll(ITEMS)].filter((el) => el.getClientRects().length);
}

function selectedEl() {
  return selectedId ? items().find((el) => idOf(el) === selectedId) || null : null;
}

function select(el) {
  viewEl.querySelectorAll(".is-selected").forEach((e) => e.classList.remove("is-selected"));
  if (!el) {
    selectedId = null;
    return;
  }
  el.classList.add("is-selected");
  selectedId = idOf(el);
  lastIndex = items().indexOf(el);
  el.scrollIntoView({ block: "nearest" });
}

export function clearSelection() {
  select(null);
}

// The screens redraw themselves often (re-sort, after a save): keep the same
// task selected, or, if it left the list (done, pushed…), the one now in its place.
function reapply() {
  if (!selectedId) return;
  const el = selectedEl();
  if (el) {
    if (!el.classList.contains("is-selected")) el.classList.add("is-selected");
    return;
  }
  const list = items();
  if (!list.length) return; // still loading: try again on the next redraw
  select(list[Math.min(lastIndex, list.length - 1)]);
}

function send(action, value) {
  const el = selectedEl();
  if (!el) return false;
  el.dispatchEvent(new CustomEvent("qed:task-key", { bubbles: true, detail: { action, value } }));
  return true;
}

function move(step) {
  const list = items();
  if (!list.length) return;
  const current = selectedEl();
  const i = current ? list.indexOf(current) + step : step > 0 ? 0 : list.length - 1;
  select(list[Math.max(0, Math.min(list.length - 1, i))]);
}

// Typing somewhere (a text box, a menu): keys are left alone. Tick boxes and
// buttons don't count as typing.
function isTyping(target) {
  if (!target || !target.closest) return false;
  if (target.closest("textarea, select, [contenteditable]")) return true;
  const input = target.closest("input");
  return Boolean(input && !["checkbox", "radio", "button", "submit"].includes(input.type));
}

function showHelp() {
  const row = (keys, what) => `<tr><td>${keys.map((k) => `<kbd>${k}</kbd>`).join(" ")}</td><td>${what}</td></tr>`;
  openDialog({
    title: "Keyboard shortcuts",
    submitLabel: "Got it",
    body: `
      <table class="keys-table">
        ${row(["N"], "Add a task (on the screen you're on)")}
        ${row(["G", "H"], "Go to Home")}
        ${row(["G", "P"], "Go to Priorities")}
        ${row(["G", "L"], "Go to the Planner")}
        ${row(["G", "S"], "Go to Sales")}
        ${row(["⌘K", "/"], "Search")}
        ${row(["↓", "↑"], "Select the next / previous task (or J / K)")}
        ${row(["Enter"], "Open the selected task (or double-click it)")}
        ${row(["X"], "Done / back to open")}
        ${row(["T"], "Push to tomorrow")}
        ${row(["1", "…", "5"], "Priority: Critical, High, Medium, Low, Nice to do")}
        ${row(["←", "→"], "Planner: move the card to the previous / next column")}
        ${row(["Esc"], "Clear the selection")}
        ${row(["?"], "This list")}
      </table>`,
    onSubmit: async () => {},
  });
}

// main.js calls this once. `allowed()` = not locked, not in Focus mode.
export function wireShortcuts(view, allowed) {
  viewEl = view;
  new MutationObserver(reapply).observe(viewEl, { childList: true, subtree: true });
  window.addEventListener("hashchange", () => { selectedId = null; lastIndex = 0; });

  // A click on an empty part of a row / card selects it (not on its title,
  // chips, tick box or buttons).
  viewEl.addEventListener("click", (event) => {
    const item = event.target.closest(ITEMS);
    if (!item || event.target.closest("button, a, input, select, label, textarea")) return;
    select(item);
  });

  let goPending = 0; // time "G" was pressed

  document.addEventListener("keydown", (event) => {
    if (!allowed() || event.metaKey || event.ctrlKey || event.altKey) return;
    if (document.querySelector("dialog[open]") || isTyping(event.target)) return;
    const key = event.key.length === 1 ? event.key.toLowerCase() : event.key;
    const onButton = event.target.closest?.("button, a");

    if (goPending && Date.now() - goPending < 1200 && GO[key]) {
      event.preventDefault();
      goPending = 0;
      window.location.hash = GO[key];
      return;
    }
    goPending = 0;

    let handled = true;
    if (key === "g") goPending = Date.now();
    else if (key === "?") showHelp();
    else if (key === "n") {
      const box = viewEl.querySelector(".quick-add .quick-title");
      if (box) { box.focus(); box.scrollIntoView({ block: "center" }); } else handled = false;
    } else if (key === "ArrowDown" || key === "j") {
      if (items().length) move(1); else handled = false;
    } else if (key === "ArrowUp" || key === "k") {
      if (items().length) move(-1); else handled = false;
    } else if (key === "Escape") {
      handled = Boolean(selectedId);
      clearSelection();
    } else if (key === "Enter" && !onButton) handled = send("open");
    else if (key === "x") handled = send("done");
    else if (key === "t") handled = send("push");
    else if (/^[1-5]$/.test(key)) handled = send("priority", PRIORITIES[Number(key) - 1].value);
    else if (key === "ArrowLeft" || key === "ArrowRight") {
      handled = Boolean(selectedEl()?.dataset.card) && send("move", key === "ArrowLeft" ? -1 : 1);
    } else handled = false;

    if (handled) event.preventDefault();
  });
}
