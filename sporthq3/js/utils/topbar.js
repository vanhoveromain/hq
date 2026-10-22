// topbar.js — the two optional bits of the dark bar at the top:
//   - on the right: one action of the screen (planner "⋯", block "Edit")
//   - on the left: "‹ Back" on a screen that lives inside another one
//     (Shoes inside Me, …), shown instead of the logo (step 20).
// main.js clears both before drawing a new screen, so a screen only sets
// what it needs and never has to clean up after itself.

import { escapeHtml } from "./format.js?v=202610212125";
import { icon } from "./icons.js?v=202610212125";

const actionEl = () => document.getElementById("topbar-action");
const backEl = () => document.getElementById("topbar-back");
const brandEl = () => document.querySelector(".topbar .brand");

// The action on the right. Give `iconName` for an icon-only button (then
// `label` is read out), or `text` for a word ("Edit").
//   setTopbarAction({ iconName: "more", label: "More", onClick })
export function setTopbarAction({ iconName = "", text = "", label = "", onClick }) {
  const slot = actionEl();
  if (!slot) return;
  slot.innerHTML = `<button type="button" class="topbar-button ${iconName ? "is-icon" : ""}"
    ${label ? `aria-label="${escapeHtml(label)}"` : ""}>${iconName ? icon(iconName) : escapeHtml(text)}</button>`;
  slot.querySelector("button").addEventListener("click", onClick);
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

export function clearTopbar() {
  if (actionEl()) actionEl().innerHTML = "";
  const link = backEl();
  if (link) {
    link.hidden = true;
    link.onclick = null;
  }
  if (brandEl()) brandEl().hidden = false;
}
