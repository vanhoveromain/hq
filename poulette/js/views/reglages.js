// reglages.js: settings. For now: who you are, the theme (this device) and
// "Se déconnecter" (the only way out for someone who only has Poulette HQ:
// the portal sends them straight back here).
// Later steps add: baby profile, household members, export.

import { escapeHtml } from "../utils/html.js";
import { signOut, loginUrl } from "../storage.js";

const THEME_KEY = "poulette.theme";
const THEMES = [
  { id: "dark", label: "Sombre" },
  { id: "light", label: "Clair" },
  { id: "auto", label: "Auto" },
];

function readTheme() {
  try { return localStorage.getItem(THEME_KEY) || "dark"; } catch { return "dark"; }
}

// Same rule as the little script in index.html's <head>.
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "auto") delete root.dataset.theme;
  else root.dataset.theme = theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* this visit only */ }
}

export function render(el, { user, home }) {
  const theme = readTheme();
  const who = home ? `${escapeHtml(home.member.display_name)} · ${escapeHtml(home.household.name)}` : "Aucun foyer pour l'instant";
  el.innerHTML = `
    <section class="section">
      <h2 class="section-title">Compte</h2>
      <div class="card">
        <div class="row"><span>${who}</span></div>
        <div class="row"><span class="muted">${escapeHtml(user.email || "")}</span></div>
      </div>
    </section>
    <section class="section">
      <h2 class="section-title">Affichage (cet appareil)</h2>
      <div class="segmented" role="group" aria-label="Thème">
        ${THEMES.map((t) => `<button type="button" data-theme-choice="${t.id}" aria-pressed="${t.id === theme}">${t.label}</button>`).join("")}
      </div>
    </section>
    <section class="section">
      <button type="button" class="btn danger block" id="logout">Se déconnecter</button>
      <p class="muted" style="font-size:14px;margin:8px 0 0">Te déconnecte de tous les HQ sur cet appareil.</p>
    </section>`;

  el.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeChoice);
      el.querySelectorAll("[data-theme-choice]").forEach((b) => b.setAttribute("aria-pressed", String(b === button)));
    });
  });

  const logout = el.querySelector("#logout");
  logout.addEventListener("click", async () => {
    logout.disabled = true;
    try { await signOut(); } catch { /* local session cleared anyway */ }
    window.location.replace(loginUrl(window.location.origin + "/"));
  });
}
