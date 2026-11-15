// placeholders.js: the screens that come in Phase 1 / 2. Each shows what it
// will hold, so the navigation can be tested now (step 0.5b).

import { comingHtml, escapeHtml } from "../utils/html.js";

export const home = {
  render(el, { home }) {
    const baby = home.babies[0];
    el.innerHTML = `<p class="muted">${baby ? escapeHtml(baby.name) : "Pas encore de bébé enregistré"}</p>`
      + comingHtml("État actuel et actions rapides", "Dernière tétée, prochain sein, dernier change, chronos, gros boutons de saisie. Phase 1.");
  },
};

export const journal = {
  render(el) {
    el.innerHTML = comingHtml("Journal du jour", "Tout ce qui a été saisi, heure par heure, et qui l'a saisi. Phase 1.");
  },
};

export const suivi = {
  render(el) {
    el.innerHTML = comingHtml("Mesures", "Poids, taille, périmètre crânien, graphique du poids. Phase 1.");
  },
};

export const pediatre = {
  render(el) {
    el.innerHTML = comingHtml("Questions pour la pédiatre", "À cocher pendant le rendez-vous. Phase 1.")
      + '<div style="height:12px"></div>'
      + comingHtml("Rapport", "Résumé pour la pédiatre, mode consultation, PDF. Phase 2.");
  },
};
