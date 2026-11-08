// placeholder.js: an empty screen for a tab whose module is built later.
// Each route passes what it will hold and in which build step it arrives.

import { escapeHtml } from "../utils/html.js";

export function make(what, step) {
  return {
    render(el) {
      el.innerHTML = `
        <section class="section">
          <p class="placeholder">${escapeHtml(what)}<br><span class="muted">Arrives in build step ${escapeHtml(step)}.</span></p>
        </section>`;
    },
  };
}
