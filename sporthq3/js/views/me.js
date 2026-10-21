// "Me" tab: the menu to everything about you and the app.

import { icon } from "../utils/icons.js?v=202610211800";

export function render(container) {
  container.innerHTML = `
    <nav class="card menu" aria-label="Me">
      <a href="#/body">${icon("scale")} Body & goals <span aria-hidden="true">›</span></a>
      <a href="#/shoes">${icon("footprints")} Shoes <span aria-hidden="true">›</span></a>
      <a href="#/blocks">${icon("book-open")} Training blocks <span aria-hidden="true">›</span></a>
    </nav>
    <nav class="card menu" aria-label="App">
      <a href="#/settings">${icon("settings")} Settings <span class="muted small menu-hint">account, password, backup</span> <span aria-hidden="true">›</span></a>
    </nav>
  `;
}
