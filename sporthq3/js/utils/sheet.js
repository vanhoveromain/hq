// sheet.js — a pop-up panel that slides up from the bottom (a "bottom sheet"),
// used for menus like "what do you want to do with this session?".
//
// It uses the browser's built-in <dialog> element: showModal() puts it on
// top of the page, dims the background and blocks clicks behind it.
//
// Usage:
//   const choice = await openSheet({
//     title: "Leg workout",
//     html: `<button data-value="done">Done</button> …`,
//   });
//   // choice = the data-value of the button you tapped, or null if closed.
// Any element with a data-value closes the sheet and returns that value.
// For forms inside a sheet, pass onReady(dialog, close) and call close(value).

import { escapeHtml } from "./format.js?v=202610142134";

export function openSheet({ title, html, onReady }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "sheet";
    dialog.innerHTML = `
      <div class="sheet-header">
        <h2>${escapeHtml(title)}</h2>
        <button type="button" class="sheet-close" data-value="" aria-label="Close">✕</button>
      </div>
      <div class="sheet-body">${html}</div>
    `;
    document.body.appendChild(dialog);

    let result = null;
    const close = (value) => {
      result = value === "" ? null : value;
      dialog.close();
    };

    // Tapping anything with data-value closes with that value.
    dialog.addEventListener("click", (event) => {
      const target = event.target.closest("[data-value]");
      if (target) {
        event.preventDefault();
        close(target.dataset.value);
        return;
      }
      // A tap on the dimmed background (outside the panel) also closes it.
      if (event.target === dialog) close(null);
    });

    dialog.addEventListener("close", () => {
      dialog.remove();
      resolve(result);
    });

    dialog.showModal();
    if (onReady) onReady(dialog, close);
  });
}
