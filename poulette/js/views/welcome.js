// welcome.js: first start, when this account belongs to no household yet.
// Creates the household + makes you its first member + adds the baby.
// The other parent does NOT create a second one: they are added from
// Réglages → Foyer by whoever created it.

import { escapeHtml } from "../utils/html.js";
import { createHousehold, friendlyError } from "../storage.js";

export function render(el, { user, onDone }) {
  el.innerHTML = `
    <h1 class="page-title">Bienvenue 🐣</h1>
    <p class="muted">Ce compte (${escapeHtml(user.email || "")}) ne fait encore partie d'aucun foyer.</p>
    <div class="note">Si ton ou ta partenaire a déjà créé le foyer, ne crée rien : demande-lui de t'ajouter
      (Réglages → Foyer), puis rouvre l'app.</div>
    <form class="form" id="setup" novalidate>
      <h2 class="section-title">Le foyer</h2>
      <label class="field">Nom du foyer<input name="name" required maxlength="100" placeholder="ex. Maison"></label>
      <label class="field">Ton prénom (affiché dans le journal)<input name="displayName" required maxlength="40" autocomplete="given-name" placeholder="ex. Rom"></label>
      <h2 class="section-title">Le bébé</h2>
      <label class="field">Prénom<input name="babyName" required maxlength="60" value="Poulette"><span class="hint">Modifiable à tout moment.</span></label>
      <label class="field">Date de naissance<input name="birthDate" type="date"><span class="hint">Facultatif : à remplir le jour J.</span></label>
      <p class="status" id="setup-status" role="status"></p>
      <button type="submit" class="btn block">Créer le foyer</button>
    </form>`;

  const form = el.querySelector("#setup");
  const status = el.querySelector("#setup-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(form));
    for (const key of ["name", "displayName", "babyName"]) values[key] = values[key].trim();
    if (!values.name || !values.displayName || !values.babyName) {
      status.className = "status error";
      status.textContent = "Remplis le nom du foyer, ton prénom et le prénom du bébé.";
      return;
    }
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    status.className = "status";
    status.textContent = "Création…";
    try {
      await createHousehold({
        name: values.name,
        displayName: values.displayName,
        baby: { name: values.babyName, birth_date: values.birthDate },
      });
      await onDone();
    } catch (error) {
      status.className = "status error";
      status.textContent = friendlyError(error);
      button.disabled = false;
    }
  });
}
