// sheet.js: a panel that slides up from the bottom (a <dialog>), within reach
// of the thumb. Closes with the ✕, Esc, or a tap outside it.
//
//   const close = openSheet({ title, body: "<html>", onOpen(el, close) {} });

import { escapeHtml } from "./html.js";

let current = null;

export function openSheet({ title, body, onOpen, onClose, className = "" }) {
  if (current) current.close();
  const dialog = document.createElement("dialog");
  dialog.className = `sheet ${className}`;
  dialog.innerHTML = `<div class="sheet-head"><h2>${escapeHtml(title)}</h2>`
    + `<button type="button" class="sheet-close" aria-label="Fermer">✕</button></div>`
    + `<div class="sheet-body">${body}</div>`;
  document.body.append(dialog);

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    dialog.close();
    dialog.remove();
    if (current && current.dialog === dialog) current = null;
    if (onClose) onClose();
  };
  dialog.querySelector(".sheet-close").addEventListener("click", close);
  dialog.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
  // A tap on the dark backdrop (outside the panel) closes it.
  dialog.addEventListener("click", (e) => { if (e.target === dialog) close(); });

  dialog.showModal();
  current = { dialog, close };
  if (onOpen) onOpen(dialog.querySelector(".sheet-body"), close);
  return close;
}

export function closeSheet() {
  if (current) current.close();
}

export function sheetOpen() {
  return Boolean(current);
}
