// toast.js: short messages at the bottom of the screen, with an optional
// button (usually "Undo").
//
// Messages stack (newest at the bottom, 3 at most): ticking two tasks in a row
// keeps an Undo for each (UX review #2, 2026-11-13). Each one disappears after
// its own few seconds; the oldest goes first when a fourth arrives.

import { escapeHtml } from "./html.js";

const MAX_SHOWN = 3;
let stack = null;

function stackEl() {
  if (!stack || !stack.isConnected) {
    stack = document.createElement("div");
    stack.className = "toasts";
    document.body.append(stack);
  }
  return stack;
}

export function showToast(message, { actionLabel, onAction, duration = 6000 } = {}) {
  const holder = stackEl();
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.setAttribute("role", "status");
  toast.innerHTML = `<span>${escapeHtml(message)}</span>${
    actionLabel ? `<button type="button">${escapeHtml(actionLabel)}</button>` : ""}`;
  holder.append(toast);
  while (holder.children.length > MAX_SHOWN) holder.firstElementChild.remove();

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
