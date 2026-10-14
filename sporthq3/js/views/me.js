// "Me" tab: the menu to everything about you and the app.

export function render(container) {
  container.innerHTML = `
    <nav class="card menu" aria-label="Me">
      <a href="#/body">⚖️ Body & goals <span aria-hidden="true">›</span></a>
      <a href="#/shoes">👟 Shoes <span aria-hidden="true">›</span></a>
      <a href="#/blocks">📘 Training blocks <span aria-hidden="true">›</span></a>
    </nav>
    <nav class="card menu" aria-label="App">
      <a href="#/settings">⚙️ Settings <span class="muted small menu-hint">account, password, backup</span> <span aria-hidden="true">›</span></a>
    </nav>
  `;
}
