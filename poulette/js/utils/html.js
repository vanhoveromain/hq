// html.js: small helpers for building screens safely.

// Anything a person typed (or that comes from the database) goes through this
// before it is put inside HTML, so "<b>" shows as text instead of becoming HTML.
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// A loading error with a "Réessayer" button: main.js redraws the screen you're
// on when it's clicked. `message` is plain text.
export function errorHtml(message) {
  return `<div class="error-box" role="alert"><p class="error">${escapeHtml(message)}</p>`
    + `<button type="button" class="btn secondary" data-retry>Réessayer</button></div>`;
}

// "Bientôt" box for screens that come in a later step.
export function comingHtml(title, text) {
  return `<div class="placeholder"><strong>${escapeHtml(title)}</strong><span class="muted">${escapeHtml(text)}</span></div>`;
}
