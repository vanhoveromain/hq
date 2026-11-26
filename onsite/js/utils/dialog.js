// dialog.js: one pop-up form, reused by every "add / edit" in QED HQ.
//
// A laptop gets a centred box; a phone gets a sheet from the bottom (CSS).
// Esc or "Cancel" closes it without saving. Once something was changed, the
// first close only warns ("Unsaved changes…"), the second one discards
// (UX review #3, 2026-11-13).
//
//   openDialog({
//     title: "New project",
//     body: "<label>…</label>",          // the form fields (HTML)
//     submitLabel: "Create",
//     actions: [{ label: "Delete", kind: "danger", confirm: "Click again to delete", onClick }],
//     onOpen(form) {},                   // wire up the fields
//     async onSubmit(form) {},           // save; throw an Error to show its message
//   });

import { escapeHtml } from "./html.js";

export function openDialog({ title, body, submitLabel = "Save", actions = [], onOpen, onSubmit }) {
  const dialog = document.createElement("dialog");
  dialog.className = "dialog";
  dialog.innerHTML = `
    <form class="dialog-form" novalidate>
      <header class="dialog-head">
        <h2>${escapeHtml(title)}</h2>
        <button type="button" class="icon-btn" data-close aria-label="Close">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </header>
      <div class="dialog-body">${body}</div>
      <p class="status" role="status"></p>
      <footer class="dialog-foot">
        <div class="dialog-extra">
          ${actions.map((a, i) => `<button type="button" class="btn ${a.kind === "danger" ? "danger" : "secondary"}" data-action="${i}">${escapeHtml(a.label)}</button>`).join("")}
        </div>
        <button type="button" class="btn secondary" data-close>Cancel</button>
        <button type="submit" class="btn">${escapeHtml(submitLabel)}</button>
      </footer>
    </form>`;
  document.body.append(dialog);

  const form = dialog.querySelector("form");
  const status = dialog.querySelector(".status");
  const buttons = () => dialog.querySelectorAll("button");

  // Unsaved changes: anything typed or picked in the form since it opened.
  let dirty = false;
  let warned = false;
  form.addEventListener("input", () => { dirty = true; });
  form.addEventListener("change", () => { dirty = true; });
  const cancelButton = dialog.querySelector(".dialog-foot [data-close]");

  function close() {
    dialog.close();
  }
  // Cancel, the cross, Esc and a click outside: warn once if something changed.
  function tryClose() {
    if (dirty && !warned) {
      warned = true;
      status.textContent = "Unsaved changes. Close again to discard them, or save.";
      status.className = "status warning";
      cancelButton.textContent = "Discard";
      return;
    }
    close();
  }
  dialog.addEventListener("close", () => dialog.remove());
  for (const button of dialog.querySelectorAll("[data-close]")) button.addEventListener("click", tryClose);
  // A click on the dimmed background (outside the box) closes too.
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) tryClose();
  });
  // Esc
  dialog.addEventListener("cancel", (event) => {
    event.preventDefault();
    tryClose();
  });

  function showError(error) {
    status.textContent = error.message || String(error);
    status.className = "status error";
  }

  async function run(task) {
    for (const b of buttons()) b.disabled = true;
    status.textContent = "";
    try {
      await task();
      close();
    } catch (error) {
      showError(error);
      for (const b of buttons()) b.disabled = false;
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(() => onSubmit(form));
  });

  // Extra buttons (Archive, Delete…). With `confirm`, the first click only
  // changes the label ("Click again to delete"), the second one acts.
  dialog.querySelectorAll("[data-action]").forEach((button) => {
    const action = actions[Number(button.dataset.action)];
    let armed = !action.confirm;
    button.addEventListener("click", () => {
      if (!armed) {
        armed = true;
        button.textContent = action.confirm;
        return;
      }
      run(() => action.onClick(form));
    });
  });

  if (onOpen) onOpen(form);
  dialog.showModal();
  const first = form.querySelector("input:not([readonly]), select, textarea");
  if (first && window.matchMedia("(min-width: 720px)").matches) first.focus();
  return { close };
}
