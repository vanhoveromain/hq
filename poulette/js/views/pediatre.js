// pediatre.js: questions for the paediatrician (step 1.10). One field to add;
// during the appointment, tick them; an answer can be noted (optional).
// The report (Phase 2) will list the open ones.

import * as store from "../store.js";
import { escapeHtml } from "../utils/html.js";
import { openSheet } from "../utils/sheet.js";
import { shortDate } from "../utils/dates.js";

export function render(el) {
  el.innerHTML = `<form class="add-line" id="q-add" novalidate>
      <input name="text" maxlength="1000" placeholder="Nouvelle question…" aria-label="Nouvelle question" autocomplete="off">
      <button type="submit" class="btn">Ajouter</button></form>
    <section class="section"><h2 class="section-title">À poser</h2><div id="q-open"></div></section>
    <details class="section" id="q-done-box"><summary class="section-title">Déjà posées</summary><div id="q-done"></div></details>
    <div class="placeholder"><strong>Rapport pour la pédiatre</strong><span class="muted">Résumé de la période, mode consultation, PDF : Phase 2.</span></div>`;
  const form = el.querySelector("#q-add");
  form.addEventListener("submit", async (ev) => {
    ev.preventDefault();
    const text = form.text.value.trim();
    if (!text) return;
    form.text.value = "";
    await store.addQuestion(text);
  });
  refresh(el);
}

export function refresh(el) {
  const open = el.querySelector("#q-open");
  const done = el.querySelector("#q-done");
  if (!open || !done) return;
  const all = store.questions().sort((a, b) => b.created_at.localeCompare(a.created_at));
  const row = (q) => `<div class="question ${q.done_at ? "done" : ""}">
      <label class="q-check"><input type="checkbox" data-tick="${q.id}" ${q.done_at ? "checked" : ""} aria-label="Posée"></label>
      <button type="button" class="q-text" data-open="${q.id}"><span>${escapeHtml(q.text)}${q._pending ? " ⏳" : ""}</span>
        ${q.answer ? `<span class="entry-sub">→ ${escapeHtml(q.answer)}</span>` : ""}
        <span class="entry-sub">${q.done_at ? `posée le ${shortDate(q.done_at)}` : `ajoutée le ${shortDate(q.created_at)}`}</span></button></div>`;
  const openQs = all.filter((q) => !q.done_at);
  const doneQs = all.filter((q) => q.done_at);
  open.innerHTML = openQs.length ? openQs.map(row).join("") : '<p class="muted">Aucune question en attente.</p>';
  done.innerHTML = doneQs.length ? doneQs.map(row).join("") : '<p class="muted">Rien encore.</p>';
  el.querySelectorAll("[data-tick]").forEach((c) => c.addEventListener("change", () => {
    store.updateQuestion(c.dataset.tick, { done_at: c.checked ? new Date().toISOString() : null });
  }));
  el.querySelectorAll("[data-open]").forEach((b) => b.addEventListener("click", () => {
    const q = store.questions().find((x) => x.id === b.dataset.open);
    if (q) questionEditor(q);
  }));
}

function questionEditor(q) {
  openSheet({
    title: "❓ Question",
    body: `<form class="form" novalidate>
      <label class="field">Question<textarea name="text" rows="3" maxlength="1000">${escapeHtml(q.text)}</textarea></label>
      <label class="field">Réponse (facultatif)<textarea name="answer" rows="3" maxlength="4000">${escapeHtml(q.answer || "")}</textarea></label>
      <label class="check"><input type="checkbox" name="done" ${q.done_at ? "checked" : ""}> Posée</label>
      <div class="actions"><button type="button" class="btn danger" data-delete>Supprimer</button><button type="submit" class="btn">Enregistrer</button></div>
    </form>`,
    onOpen(el, close) {
      const form = el.querySelector("form");
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const text = form.text.value.trim();
        if (!text) return;
        await store.updateQuestion(q.id, { text, answer: form.answer.value.trim() || null,
          done_at: form.done.checked ? (q.done_at || new Date().toISOString()) : null });
        close();
      });
      const del = form.querySelector("[data-delete]");
      del.addEventListener("click", async () => {
        if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Confirmer la suppression"; return; }
        await store.deleteQuestion(q.id);
        close();
      });
    },
  });
}
