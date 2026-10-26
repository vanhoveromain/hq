// topbar.js — the two optional bits of the dark bar at the top:
//   - on the right: one action of the screen (planner "⋯", block "Edit")
//   - on the left: "‹ Back" on a screen that lives inside another one
//     (Shoes inside Me, …), shown instead of the logo (step 20).
// main.js clears both before drawing a new screen, so a screen only sets
// what it needs and never has to clean up after itself.

import { escapeHtml } from "./format.js?v=202610260926";
import { icon } from "./icons.js?v=202610260926";

const actionEl = () => document.getElementById("topbar-action");
const backEl = () => document.getElementById("topbar-back");
const brandEl = () => document.querySelector(".topbar .brand");

// The action on the right. Give `iconName` for an icon-only button (then
// `label` is read out), or `text` for a word ("Edit").
// `phoneOnly` (29b): hidden on a laptop, where the screen shows the same
// action next to its content instead (far from the top-left corner).
//   setTopbarAction({ iconName: "more", label: "More", onClick })
export function setTopbarAction({ iconName = "", text = "", label = "", onClick, phoneOnly = false }) {
  const slot = actionEl();
  if (!slot) return;
  slot.innerHTML = `<button type="button" class="topbar-button ${iconName ? "is-icon" : ""} ${phoneOnly ? "phone-only" : ""}"
    ${label ? `aria-label="${escapeHtml(label)}"` : ""}>${iconName ? icon(iconName) : escapeHtml(text)}</button>`;
  slot.querySelector("button").addEventListener("click", onClick);
}

// Laptop only (29b): an "Edit" button in the top-right corner of a summary
// card (.race-sum: the race page and the block page), next to what it edits.
export function addSummaryEditButton(container, label, onClick) {
  const summary = container.querySelector(".race-sum");
  if (!summary) return;
  summary.insertAdjacentHTML("afterbegin",
    `<button type="button" class="button small-button sum-edit laptop-only" aria-label="${escapeHtml(label)}">Edit</button>`);
  summary.querySelector(".sum-edit").addEventListener("click", onClick);
}

// The title in the middle of the top bar, when the screen knows a better one
// than main.js's (30d: the race's or block's own name). Long names end in "…" (CSS).
export function setPageTitle(text) {
  const title = document.getElementById("page-title");
  if (title) title.textContent = text;
}

// Removes the action (e.g. "Edit" while its form is open).
export function clearTopbarAction() {
  if (actionEl()) actionEl().innerHTML = "";
}

// "‹ Me" on the left instead of the logo. `href` = where it goes; or
// `onClick` for something else (the log form's "Cancel").
export function setTopbarBack({ href = "#/dashboard", label, chevron = true, onClick = null }) {
  const link = backEl();
  if (!link) return;
  link.href = href;
  link.innerHTML = `${chevron ? icon("chevron-left") : ""}<span>${escapeHtml(label)}</span>`;
  link.onclick = onClick ? (event) => { event.preventDefault(); onClick(); } : null;
  link.hidden = false;
  brandEl().hidden = true;
}

// The screen you came from (for the log form's "Cancel"): main.js calls
// clearTopbar() before every screen, so that's where it's noted.
let previousHash = "";
let currentHash = "";

// Where "Cancel" / "back" should go: the previous screen, else `fallback`.
export function previousScreen(fallback) {
  return previousHash && previousHash !== currentHash ? previousHash : fallback;
}

export function clearTopbar() {
  if (window.location.hash !== currentHash) {
    previousHash = currentHash;
    currentHash = window.location.hash;
  }
  if (actionEl()) actionEl().innerHTML = "";
  const link = backEl();
  if (link) {
    link.hidden = true;
    link.onclick = null;
  }
  if (brandEl()) brandEl().hidden = false;
}
