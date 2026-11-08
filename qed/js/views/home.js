// home.js: the QED HQ Home screen.
//
// Step 2: the Tools links come from the database (proof that the QED login
// and the database lock work), plus the Onboarding link. The project gallery
// arrives in step 3, and the Tools panel becomes editable then.

import { listLinks } from "../storage.js";
import { escapeHtml, safeUrl, icon } from "../utils/html.js";

export async function render(el) {
  el.innerHTML = `
    <section class="section">
      <h2 class="section-title">Projects</h2>
      <p class="placeholder">The project gallery arrives in step 3.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Tools</h2>
      <div id="tools"><p class="muted">Loading…</p></div>
    </section>

    <section class="section">
      <h2 class="section-title">Team</h2>
      <a class="btn" href="onboarding/">${icon("calendar")} Open the onboarding plan</a>
    </section>
  `;

  const toolsEl = el.querySelector("#tools");
  try {
    const links = await listLinks();
    toolsEl.innerHTML = links.length ? toolsHtml(links) : `<p class="muted">No links yet.</p>`;
  } catch (error) {
    toolsEl.innerHTML = `<p class="error">Could not load the links: ${escapeHtml(error.message)}</p>`;
  }
}

function toolsHtml(links) {
  const tiles = links.map((link) => {
    const url = safeUrl(link.url);
    if (!url) return "";
    const host = new URL(url).host.replace(/^www\./, "");
    return `
      <li><a class="tile" href="${escapeHtml(url)}" target="_blank" rel="noopener">
        <span class="tile-icon">${icon("link")}</span>
        <span class="tile-name">${escapeHtml(link.label)}</span>
        <span class="tile-host">${icon("external")}${escapeHtml(host)}</span>
      </a></li>`;
  });
  return `<ul class="tiles">${tiles.join("")}</ul>`;
}
