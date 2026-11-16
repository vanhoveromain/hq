// rapport.js: the report for the paediatrician (Phase 2).
//   Période    : 24 h · 7 jours · Depuis le RDV (last appointment entered in
//                Pédiatre, Rom's choice B) · Dates (from / to)
//   Contenu    : feeding (feeds / 24 h, average duration, left / right, bottle
//                ml / day, meals / 24 h, gap between meals), nappies (wet /
//                dirty per day, poop colours seen), spit-ups, temperatures,
//                medication, last measurements + weight curve since birth,
//                open questions, one line per day.
//   Consultation: clean full-screen view, big text, light, no buttons
//                (body.is-consult), to show the phone to the paediatrician.
//   PDF        : the phone's print window (window.print) -> "Save as PDF" /
//                share. Print styles in app.css (@media print).
// It records and sums up; it never says what is normal (out of scope).

import * as store from "../store.js";
import * as rules from "../rules.js";
import { escapeHtml, errorHtml } from "../utils/html.js";
import { dayKey, addDays, dayStart, shortDate, hhmm } from "../utils/dates.js";
import { weightChart, gapFromBirth } from "./suivi.js";

let period = "7j";
let fromKey = addDays(dayKey(), -6);
let toKey = dayKey();
let home = null;
let loading = null;

export function render(el, ctx) {
  home = ctx.home;
  const baby = home.babies[0];
  if (!baby) {
    el.innerHTML = `<div class="placeholder"><strong>Pas encore de bébé</strong><span class="muted">Ajoute-le dans <a href="#/reglages">Réglages</a>.</span></div>`;
    return;
  }
  el.innerHTML = `<div class="report-tools no-print">
      <a class="back" href="#/pediatre">‹ Pédiatre</a>
      <div class="segmented" role="group" aria-label="Période">${rules.REPORT_PERIODS.map((p) =>
        `<button type="button" data-period="${p.id}" aria-pressed="${p.id === period}">${escapeHtml(p.label)}</button>`).join("")}</div>
      <div class="field-pair dates" ${period === "dates" ? "" : "hidden"}>
        <label class="field">Du<input type="date" name="from" value="${fromKey}" max="${dayKey()}"></label>
        <label class="field">Au<input type="date" name="to" value="${toKey}" max="${dayKey()}"></label></div>
      <div class="field-pair"><button type="button" class="btn" data-consult>👩‍⚕️ Mode consultation</button>
        <button type="button" class="btn secondary" data-print>PDF / Imprimer</button></div>
    </div>
    <button type="button" class="btn secondary consult-exit" data-exit>✕ Fermer le mode consultation</button>
    <article class="report" id="report"></article>`;

  el.querySelectorAll("[data-period]").forEach((b) => b.addEventListener("click", () => {
    period = b.dataset.period;
    el.querySelectorAll("[data-period]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    el.querySelector(".dates").hidden = period !== "dates";
    load(el);
  }));
  el.querySelectorAll(".dates input").forEach((input) => input.addEventListener("change", () => {
    const from = el.querySelector('[name="from"]').value;
    const to = el.querySelector('[name="to"]').value;
    if (from && to) {
      fromKey = from <= to ? from : to;
      toKey = from <= to ? to : from;
      load(el);
    }
  }));
  el.querySelector("[data-consult]").addEventListener("click", () => {
    document.body.classList.add("is-consult");
    lightOn();
    window.scrollTo(0, 0);
  });
  el.querySelector("[data-exit]").addEventListener("click", exitConsult);
  el.querySelector("[data-print]").addEventListener("click", () => window.print());
  window.addEventListener("beforeprint", lightOn);
  window.addEventListener("afterprint", lightOffUnlessConsult);
  load(el);
}

// Consultation and paper are always light (a doctor's office, white paper);
// the theme chosen for the night comes back afterwards.
let savedTheme;
function lightOn() {
  const root = document.documentElement;
  if (savedTheme === undefined) savedTheme = root.dataset.theme ?? null;
  root.dataset.theme = "light";
}
function lightOff() {
  const root = document.documentElement;
  if (savedTheme === undefined) return;
  if (savedTheme === null) delete root.dataset.theme; else root.dataset.theme = savedTheme;
  savedTheme = undefined;
}
function lightOffUnlessConsult() {
  if (!document.body.classList.contains("is-consult")) lightOff();
}
function exitConsult() {
  document.body.classList.remove("is-consult");
  lightOff();
}

export function leave() {
  exitConsult();
  window.removeEventListener("beforeprint", lightOn);
  window.removeEventListener("afterprint", lightOffUnlessConsult);
}

// The period as [fromMs, toMs) + its words.
function range() {
  const now = Date.now();
  if (period === "24h") return { from: now - 864e5, to: now, words: "dernières 24 heures" };
  if (period === "7j") return { from: dayStart(addDays(dayKey(), -6)).getTime(), to: now, words: "7 derniers jours" };
  if (period === "rdv") {
    const last = store.appointments().sort((a, b) => b.held_on.localeCompare(a.held_on))[0];
    if (!last) return { none: true };
    return { from: dayStart(last.held_on).getTime(), to: now, words: `depuis le RDV du ${shortDate(dayStart(last.held_on))}` };
  }
  const to = Math.min(now, dayStart(addDays(toKey, 1)).getTime());
  return { from: dayStart(fromKey).getTime(), to, words: `du ${shortDate(dayStart(fromKey))} au ${shortDate(dayStart(toKey))}` };
}

async function load(el) {
  refresh(el);
  const r = range();
  if (r.none) return;
  const job = store.ensureRange(dayKey(new Date(r.from)), dayKey(new Date(r.to - 1)));
  loading = job;
  try {
    await job;
  } catch {
    const box = el.querySelector("#report");
    if (box) box.insertAdjacentHTML("afterbegin", errorHtml("Une partie de la période n'a pas pu être chargée (pas de réseau ?)."));
  }
  if (loading === job) loading = null;
}

export function refresh(el) {
  const box = el.querySelector("#report");
  if (!box || !home) return;
  const baby = home.babies[0];
  const r = range();
  if (r.none) {
    box.innerHTML = `<div class="placeholder"><strong>Aucun RDV enregistré</strong><span class="muted">Ajoute-le dans l'onglet Pédiatre (« RDV pédiatre aujourd'hui »), ou choisis une autre période.</span></div>`;
    return;
  }
  const s = rules.reportSummary(rules.live(store.events()), r.from, r.to);
  const n = (v, d = 0) => rules.fmtNumber(v, d);
  const per = s.days >= 1.5; // "par jour" only means something over more than a day
  const row = (label, value, sub = "") => `<div class="r-row"><span class="r-label">${label}</span><span class="r-value">${value}${sub ? `<span class="r-sub">${sub}</span>` : ""}</span></div>`;

  const measures = store.measurements().sort((a, b) => b.measured_at.localeCompare(a.measured_at)).slice(0, 5);
  const openQs = store.questions().filter((q) => !q.done_at).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const lastAppt = store.appointments().sort((a, b) => b.held_on.localeCompare(a.held_on))[0];

  // One line per day (up to 31 days).
  let dayRows = "";
  const firstDay = dayKey(new Date(r.from));
  const lastDay = dayKey(new Date(r.to - 1));
  const dayCount = Math.round((dayStart(lastDay) - dayStart(firstDay)) / 864e5) + 1;
  if (dayCount > 1 && dayCount <= 31) {
    const live = rules.live(store.events());
    for (let d = lastDay; d >= firstDay; d = addDays(d, -1)) {
      const ds = rules.daySummary(live.filter((e) => rules.TYPES[e.type] && dayKey(e.started_at) === d));
      dayRows += `<tr><th>${dayStart(d).toLocaleDateString("fr-BE", { weekday: "short", day: "numeric", month: "numeric" })}</th>
        <td>${ds.feeds}</td><td>${ds.bottleMl}</td><td>${ds.wet}</td><td>${ds.dirty}</td></tr>`;
    }
  }

  box.innerHTML = `
    <header class="r-head">
      <h1>${escapeHtml(baby.name)}</h1>
      <p>${baby.birth_date ? `Né(e) le ${shortDate(dayStart(baby.birth_date))} · ${rules.babyAge(baby.birth_date)}` : ""}
        ${baby.birth_weight_g ? ` · ${n(baby.birth_weight_g)} g à la naissance` : ""}</p>
      <p class="r-period">Période : <strong>${escapeHtml(r.words)}</strong> · ${s.count} saisie(s)${lastAppt ? ` · dernier RDV : ${shortDate(dayStart(lastAppt.held_on))}` : ""}</p>
    </header>

    <section class="r-section"><h2>Alimentation</h2>
      ${row("Tétées", `${s.feeds}${per ? ` · ${n(s.feedsPerDay, 1)} / 24 h` : ""}`,
        [s.feedAvgMinutes != null ? `durée moyenne ${Math.round(s.feedAvgMinutes)} min (quand notée)` : null,
          s.sidesPct ? `gauche ${s.sides.L || 0} (${Math.round(s.sidesPct.L)} %) · droite ${s.sides.R || 0} (${Math.round(s.sidesPct.R)} %)` : null].filter(Boolean).join(" · "))}
      ${row("Biberons", `${n(s.bottleMl)} ml${per ? ` · ${n(s.bottleMlPerDay)} ml / jour` : ""}`, s.bottles ? `${s.bottles} biberon(s)` : "")}
      ${row("Repas (tétées + biberons)", `${per ? `${n(s.mealsPerDay, 1)} / 24 h` : `${s.feeds + s.bottles}`}`,
        s.gapAvgMs != null ? `intervalle moyen ${rules.fmtDuration(s.gapAvgMs)} · le plus long ${rules.fmtDuration(s.gapMaxMs)}` : "")}
      ${s.pumps ? row("Tirage", `${n(s.pumpMl)} ml`, `${s.pumps} tirage(s)`) : ""}
    </section>

    <section class="r-section"><h2>Couches</h2>
      ${row("Mouillées", `${s.wet}${per ? ` · ${n(s.wetPerDay, 1)} / jour` : ""}`)}
      ${row("Sales", `${s.dirty}${per ? ` · ${n(s.dirtyPerDay, 1)} / jour` : ""}`)}
      ${s.poopColors.length ? row("Couleurs notées", s.poopColors.map((c) => `<span class="r-color"><span class="dot" style="background:${c.hex}"></span>${escapeHtml(c.label)} ×${c.n}</span>`).join(" ")) : ""}
    </section>

    <section class="r-section"><h2>Santé</h2>
      ${row("Régurgitations", s.spitUps ? `${s.spitUps}` : "aucune", s.spitBySize.map((x) => `${escapeHtml(x.label)} ×${x.n}`).join(" · "))}
      ${row("Températures", s.temperatures.length ? s.temperatures.map((t) => `${n(t.celsius, 1)} °C <span class="r-sub-inline">(${shortDate(t.at)} ${hhmm(t.at)})</span>`).join(" · ") : "aucune prise")}
      ${row("Médicaments", s.meds.length ? s.meds.map((m) => `${escapeHtml(m.label)} ×${m.n}`).join(" · ") : "aucun",
        s.meds.length ? s.meds.map((m) => `${escapeHtml(m.label.split(" · ")[0])} : dernier le ${shortDate(m.last)} ${hhmm(m.last)}`).join(" · ") : "")}
    </section>

    <section class="r-section"><h2>Croissance</h2>
      <div id="r-chart"></div>
      ${measures.length ? `<table class="r-table"><thead><tr><th>Date</th><th>Poids</th><th>Taille</th><th>PC</th><th>Source</th></tr></thead><tbody>
        ${measures.map((m) => `<tr><td>${shortDate(m.measured_at)}</td><td>${m.weight_g ? `${n(m.weight_g)} g` : "—"}</td>
          <td>${m.length_cm ? `${n(m.length_cm, 1)} cm` : "—"}</td><td>${m.head_cm ? `${n(m.head_cm, 1)} cm` : "—"}</td><td>${escapeHtml(m.source || "")}</td></tr>`).join("")}
        </tbody></table>${measures[0].weight_g && baby.birth_weight_g ? `<p class="r-sub">Dernier poids : ${escapeHtml(gapFromBirth(measures[0].weight_g, baby))}.</p>` : ""}`
        : '<p class="r-sub">Aucune mesure enregistrée.</p>'}
    </section>

    <section class="r-section"><h2>Questions</h2>
      ${openQs.length ? `<ol class="r-questions">${openQs.map((q) => `<li>${escapeHtml(q.text)}</li>`).join("")}</ol>` : '<p class="r-sub">Aucune question en attente.</p>'}
    </section>

    ${dayRows ? `<section class="r-section"><h2>Jour par jour</h2>
      <table class="r-table days"><thead><tr><th></th><th>Tétées</th><th>Biberon (ml)</th><th>Mouillées</th><th>Sales</th></tr></thead><tbody>${dayRows}</tbody></table></section>` : ""}

    <p class="r-foot">Poulette HQ · généré le ${shortDate(new Date())} à ${hhmm(new Date().toISOString())} · données saisies par les parents, sans interprétation.</p>`;

  weightChart(box.querySelector("#r-chart"), baby, store.measurements());
}
