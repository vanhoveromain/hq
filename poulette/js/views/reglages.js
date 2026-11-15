// reglages.js: settings.
//   Foyer   : members (Rom, Léa) + add a member by email (needs an own-hq account)
//   Bébé    : name, birth date, birth weight / length (fill in on the day)
//   Compte  : who you are; theme (this device); Se déconnecter (the only way out
//             for someone who only has Poulette HQ: the portal sends them back here)

import { escapeHtml, errorHtml } from "../utils/html.js";
import { exportAll } from "./export.js";
import {
  signOut, loginUrl, listMembers, addMember, createBaby, updateBaby, friendlyError,
} from "../storage.js";

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

export function render(el, { user, home, reload }) {
  const theme = readTheme();
  const baby = home && home.babies[0];
  el.innerHTML = `
    ${home ? `
    <section class="section">
      <h2 class="section-title">Foyer · ${escapeHtml(home.household.name)}</h2>
      <div class="card" id="members"><p class="muted">Chargement…</p></div>
      <details class="add-member">
        <summary class="btn secondary block">Ajouter un membre</summary>
        <form class="form" id="add-member" novalidate>
          <p class="muted hint">Son compte HQ doit déjà exister (Supabase → Authentication → Users), avec l'accès
            poulette.</p>
          <label class="field">Email de son compte<input name="email" type="email" required inputmode="email" autocomplete="off"></label>
          <label class="field">Prénom affiché<input name="displayName" required maxlength="40" placeholder="ex. Léa"></label>
          <p class="status" id="member-status" role="status"></p>
          <button type="submit" class="btn block">Ajouter au foyer</button>
        </form>
      </details>
    </section>
    <section class="section">
      <h2 class="section-title">Bébé</h2>
      <form class="form card" id="baby" novalidate>
        <label class="field">Prénom<input name="name" required maxlength="60" value="${escapeHtml(baby ? baby.name : "Poulette")}"></label>
        <label class="field">Date de naissance<input name="birth_date" type="date" value="${escapeHtml(baby && baby.birth_date || "")}"></label>
        <div class="field-pair">
          <label class="field">Poids de naissance (g)<input name="birth_weight_g" type="number" inputmode="numeric" min="300" max="8000" step="1" value="${escapeHtml(baby && baby.birth_weight_g || "")}" placeholder="ex. 3400"></label>
          <label class="field">Taille (cm)<input name="birth_length_cm" type="number" inputmode="decimal" min="20" max="70" step="0.1" value="${escapeHtml(baby && baby.birth_length_cm || "")}" placeholder="ex. 50,5"></label>
        </div>
        <p class="status" id="baby-status" role="status"></p>
        <button type="submit" class="btn block">${baby ? "Enregistrer" : "Ajouter le bébé"}</button>
      </form>
    </section>` : ""}
    ${home && baby ? `<section class="section">
      <h2 class="section-title">Sauvegarde</h2>
      <div class="field-pair"><button type="button" class="btn secondary" data-export="csv">Exporter (CSV)</button>
        <button type="button" class="btn secondary" data-export="json">Exporter (JSON)</button></div>
      <p class="hint" id="export-status">Tout télécharger, à ranger dans Dropbox de temps en temps (CSV = Excel, JSON = copie complète).</p>
    </section>` : ""}
    <section class="section">
      <h2 class="section-title">Compte</h2>
      <div class="card">
        <div class="row"><span>${home ? escapeHtml(home.member.display_name) : "Aucun foyer pour l'instant"}</span></div>
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
      <p class="muted hint">Te déconnecte de tous les HQ sur cet appareil.</p>
    </section>`;

  if (home) {
    drawMembers(el.querySelector("#members"), home.household.id, user.id);
    wireAddMember(el, home.household.id, user.id);
    wireBaby(el, home, baby, reload);
  }

  el.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", async () => {
    const status = el.querySelector("#export-status");
    button.disabled = true;
    status.textContent = "Préparation…";
    try {
      await exportAll(home, button.dataset.export);
      status.textContent = "Téléchargé. Pense à le ranger dans Dropbox.";
    } catch (error) {
      status.textContent = friendlyError(error);
    }
    button.disabled = false;
  }));

  el.querySelectorAll("[data-theme-choice]").forEach((button) => {
    button.addEventListener("click", () => {
      applyTheme(button.dataset.themeChoice);
      el.querySelectorAll("[data-export]").forEach((button) => button.addEventListener("click", async () => {
    const status = el.querySelector("#export-status");
    button.disabled = true;
    status.textContent = "Préparation…";
    try {
      await exportAll(home, button.dataset.export);
      status.textContent = "Téléchargé. Pense à le ranger dans Dropbox.";
    } catch (error) {
      status.textContent = friendlyError(error);
    }
    button.disabled = false;
  }));

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

async function drawMembers(box, householdId, myId) {
  try {
    const members = await listMembers(householdId);
    box.innerHTML = members.map((m) => `<div class="row"><span>${escapeHtml(m.display_name)}</span>`
      + `<span class="muted">${m.user_id === myId ? "toi" : ""}</span></div>`).join("");
  } catch (error) {
    box.innerHTML = errorHtml(friendlyError(error));
  }
}

function wireAddMember(el, householdId, myId) {
  const form = el.querySelector("#add-member");
  const status = el.querySelector("#member-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = form.email.value.trim();
    const displayName = form.displayName.value.trim();
    if (!email || !form.email.checkValidity() || !displayName) {
      say(status, "error", "Indique un email valide et un prénom.");
      return;
    }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    say(status, "", "Ajout…");
    try {
      await addMember(householdId, email, displayName);
      form.reset();
      say(status, "ok", `${displayName} fait partie du foyer.`);
      drawMembers(el.querySelector("#members"), householdId, myId);
    } catch (error) {
      say(status, "error", friendlyError(error));
    }
    button.disabled = false;
  });
}

function wireBaby(el, home, baby, reload) {
  const form = el.querySelector("#baby");
  const status = el.querySelector("#baby-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!form.checkValidity() || !form.name.value.trim()) {
      say(status, "error", "Vérifie le prénom et les chiffres (poids 300 à 8000 g, taille 20 à 70 cm).");
      return;
    }
    const fields = {
      name: form.name.value.trim(),
      birth_date: form.birth_date.value,
      birth_weight_g: form.birth_weight_g.value === "" ? "" : Math.round(Number(form.birth_weight_g.value)),
      birth_length_cm: form.birth_length_cm.value === "" ? "" : Number(form.birth_length_cm.value),
    };
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    say(status, "", "Enregistrement…");
    try {
      if (baby) await updateBaby(baby.id, fields);
      else await createBaby(home.household.id, fields);
      if (baby) {
        await reload({ draw: false }); // keep this form and its "Enregistré"
        say(status, "ok", "Enregistré.");
        button.disabled = false;
      } else {
        await reload(); // a new baby: redraw (the button becomes "Enregistrer")
      }
    } catch (error) {
      say(status, "error", friendlyError(error));
      button.disabled = false;
    }
  });
}

function say(status, kind, text) {
  status.className = "status" + (kind ? " " + kind : "");
  status.textContent = text;
}
