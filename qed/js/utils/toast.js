// toast.js: a short message at the bottom of the screen, with an optional
// button (usually "Undo"). One at a time: a new message replaces the old one.

import { escapeHtml } from "./html.js";

let current = null;

export function showToast(message, { actionLabel, onAction, duration = 6000 } = {}) {
  if (current) current.remove();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${
    actionLabel ? `<button type="button">${escapeHtml(actionLabel)}</button>` : ""}`;
  document.body.append(toast);
  current = toast;

  const timer = setTimeout(() => toast.remove(), duration);
  if (actionLabel) {
    toast.querySelector("button").addEventListener("click", async () => {
      clearTimeout(timer);
      toast.remove();
      try {
        await onAction();
      } catch (error) {
        showToast("Could not undo: " + error.message);
      }
    });
  }
}
