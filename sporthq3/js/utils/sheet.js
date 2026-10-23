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
// Optional (step 20b): `badge` = HTML shown before the title (a sport badge),
// `subtitle` = a grey line under the title ("Wed 21 Oct · Upper body").

import { escapeHtml } from "./format.js?v=202610232058";
import { icon } from "./icons.js?v=202610232058";

export function openSheet({ title, html, onReady, badge = "", subtitle = "" }) {
  return new Promise((resolve) => {
    const dialog = document.createElement("dialog");
    dialog.className = "sheet";
    dialog.innerHTML = `
      <div class="sheet-header ${badge ? "has-badge" : ""}">
        ${badge}
        <div class="sheet-heading">
          <h2>${escapeHtml(title)}</h2>
          ${subtitle ? `<p class="muted small">${escapeHtml(subtitle)}</p>` : ""}
        </div>
        <button type="button" class="sheet-close" data-value="" aria-label="Close">${icon("x")}</button>
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

// One quiet row of a list inside a sheet (step 20): icon, label and a ›.
// `danger` = a red row without the › (e.g. "Remove from plan").
export function sheetRowHtml(value, iconName, label, { danger = false, hint = "" } = {}) {
  return `<button type="button" class="sheet-row ${danger ? "is-danger" : ""}" data-value="${escapeHtml(value)}">
    ${icon(iconName)}<span class="sheet-row-label">${escapeHtml(label)}</span>
    ${hint ? `<span class="muted small">${escapeHtml(hint)}</span>` : ""}
    ${danger ? "" : icon("chevron-right", { className: "sheet-row-chevron" })}</button>`;
}
