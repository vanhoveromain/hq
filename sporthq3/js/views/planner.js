// Plan tab. The week view itself is built in step 7c; for now it links to
// the session catalogue (7a) and, later, the week templates (7b).

export function render(container) {
  container.innerHTML = `
    <nav class="card menu" aria-label="Planning">
      <a href="#/catalogue">📚 Session catalogue <span aria-hidden="true">›</span></a>
    </nav>
    <section class="card placeholder">
      <p>Your weekly plan will appear here (step 7c).</p>
    </section>
  `;
}
