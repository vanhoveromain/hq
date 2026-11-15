// journal.js: what happened (step 1.7, made fuller on Rom's request
// 2026-11-15). Two views:
//   Jour    : summary cards, the 24 h strip (one line per kind, a dot per
//             entry: tap = open it), filters, then the list hour by hour
//             (newest first, who entered it, tap = change / delete).
//   Semaine : 7 days side by side, one small bar chart per measure
//             (feeds, ml, wet / dirty nappies, gap between meals), with the
//             table of the same numbers underneath.
// An entry still waiting in the outbox shows ⏳, a refused one ⚠.

import * as store from "../store.js";
import * as rules from "../rules.js";
import { escapeHtml, errorHtml } from "../utils/html.js";
import { dayKey, dayLabel, addDays, hhmm, dayStart } from "../utils/dates.js";
import { openEditor } from "./editor.js";

let day = dayKey();
let mode = "jour";
let filter = "all";
let members = [];
let selectedWeekDay = null;

export function render(el, { home, params }) {
  members = home.members || [];
  if (params && params[0] && /^\d{4}-\d{2}-\d{2}$/.test(params[0])) day = params[0];
  el.innerHTML = `<div class="segmented mode" role="group" aria-label="Vue">
      <button type="button" data-mode="jour" aria-pressed="${mode === "jour"}">Jour</button>
      <button type="button" data-mode="semaine" aria-pressed="${mode === "semaine"}">Semaine</button></div>
    <div class="day-nav">
      <button type="button" class="btn secondary" data-step="-1" aria-label="Avant">‹</button>
      <strong id="day-label"></strong>
      <button type="button" class="btn secondary" data-step="1" aria-label="Après">›</button></div>
    <div id="journal-body"></div>`;
  el.querySelectorAll("[data-mode]").forEach((b) => b.addEventListener("click", () => {
    mode = b.dataset.mode;
    el.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
    load(el);
  }));
  el.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    const next = addDays(day, Number(b.dataset.step) * (mode === "semaine" ? 7 : 1));
    day = next > dayKey() ? dayKey() : next;
    selectedWeekDay = null;
    load(el);
  }));
  // One listener for the whole body (it is redrawn often).
  el.querySelector("#journal-body").addEventListener("click", (ev) => {
    const target = ev.target.closest("[data-id],[data-filter],[data-pick-day],[data-goto-day]");
    if (!target) return;
    if (target.dataset.id) {
      const e = store.events().find((x) => x.id === target.dataset.id);
      if (e) openEditor(e, { members });
    } else if (target.dataset.filter) {
      filter = target.dataset.filter;
      refresh(el);
    } else if (target.dataset.pickDay) {
      selectedWeekDay = target.dataset.pickDay;
      refresh(el);
    } else if (target.dataset.gotoDay) {
      day = target.dataset.gotoDay;
      mode = "jour";
      el.querySelectorAll("[data-mode]").forEach((x) => x.setAttribute("aria-pressed", String(x.dataset.mode === "jour")));
      load(el);
    }
  });
  load(el);
}

function weekDays() {
  return [6, 5, 4, 3, 2, 1, 0].map((n) => addDays(day, -n));
}

async function load(el) {
  refresh(el);
  try {
    const days = mode === "semaine" ? weekDays() : [day];
    for (const d of days) await store.ensureDay(d);
  } catch {
    const body = el.querySelector("#journal-body");
    if (body) body.insertAdjacentHTML("afterbegin", errorHtml("Une partie n'a pas pu être chargée (pas de réseau ?)."));
  }
}

function eventsOf(key) {
  return rules.live(store.events()).filter((e) => rules.TYPES[e.type] && dayKey(e.started_at) === key);
}

export function refresh(el) {
  const body = el.querySelector("#journal-body");
  if (!body) return;
  el.querySelector('[data-step="1"]').disabled = day >= dayKey();
  if (mode === "semaine") {
    const days = weekDays();
    el.querySelector("#day-label").textContent = `${shortDay(days[0])} → ${shortDay(days[6])}`;
    body.innerHTML = weekHtml(days);
  } else {
    el.querySelector("#day-label").textContent = dayLabel(day);
    body.innerHTML = dayHtml();
  }
}

function shortDay(key) {
  return dayStart(key).toLocaleDateString("fr-BE", { day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------
// Day
// ---------------------------------------------------------------------

function dayHtml() {
  const rows = eventsOf(day).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const s = rules.daySummary(rows);
  return `${summaryHtml(s)}${stripHtml(rows)}
    <div class="chips filters" role="group" aria-label="Filtrer">${rules.JOURNAL_FILTERS.map((f) => {
      const n = f.id === "all" ? rows.length : rows.filter((e) => rules.matchesFilter(e, f.id)).length;
      return `<button type="button" class="chip ${filter === f.id ? "on" : ""}" data-filter="${f.id}" aria-pressed="${filter === f.id}">${escapeHtml(f.label)} <span class="muted">${n}</span></button>`;
    }).join("")}</div>
    ${listHtml(rows.filter((e) => rules.matchesFilter(e, filter)))}`;
}

function summaryHtml(s) {
  const card = (title, value, sub = "") => `<div class="sum-card"><span class="sum-title">${title}</span>
    <span class="sum-value">${value}</span>${sub ? `<span class="sum-sub">${sub}</span>` : ""}</div>`;
  const cards = [
    card("🤱 Tétées", s.feeds, s.feeds ? `G ${s.sides.L || 0} · D ${s.sides.R || 0}${s.feedAvgMinutes != null ? ` · ~${Math.round(s.feedAvgMinutes)} min` : ""}` : ""),
    card("🍼 Biberon", `${s.bottleMl} ml`, s.bottles ? `${s.bottles} biberon(s)` : ""),
    card("⏱ Entre 2 repas", s.gapAvgMs != null ? rules.fmtDuration(s.gapAvgMs) : "—", s.gapMaxMs != null ? `max ${rules.fmtDuration(s.gapMaxMs)}` : `${s.meals} repas`),
    card("🧷 Couches", `${s.wet} 💧 · ${s.dirty} 💩`, "mouillées · sales"),
  ];
  if (s.pumps) cards.push(card("🥛 Tirage", `${s.pumpMl} ml`, `${s.pumps} tirage(s)`));
  if (s.spitUps) cards.push(card("💧 Régurgitations", s.spitUps));
  if (s.tempMax != null) cards.push(card("🌡️ Température max", `${rules.fmtNumber(s.tempMax, 1)} °C`));
  if (s.meds.length) cards.push(card("💊 Médicaments", s.meds.reduce((a, m) => a + m.n, 0), escapeHtml(s.meds.map((m) => `${m.label}${m.n > 1 ? ` ×${m.n}` : ""}`).join(", "))));
  return `<section class="sum-grid">${cards.join("")}</section>`;
}

// 24 h strip: one line per kind of entry, a dot at its time. Single accent
// colour (the line's label says what it is: identity is never colour alone).
function stripHtml(rows) {
  const lanes = rules.STRIP_LANES.filter((l) => l.id !== "other" || rows.some((e) => rules.laneOf(e) === "other"));
  const start = dayStart(day).getTime();
  const pct = (iso) => Math.min(100, Math.max(0, ((Date.parse(iso) - start) / 864e5) * 100));
  const nowLine = day === dayKey() ? `<span class="strip-now" style="left:${pct(new Date().toISOString())}%"></span>` : "";
  return `<section class="strip" aria-label="Frise de la journée">
    <div class="strip-hours"><span></span><span class="strip-scale">${[0, 6, 12, 18, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${h} h</span>`).join("")}</span></div>
    ${lanes.map((l) => `<div class="strip-lane"><span class="strip-label">${l.emoji} ${escapeHtml(l.label)}</span>
      <span class="strip-track">${[6, 12, 18].map((h) => `<span class="strip-tick" style="left:${(h / 24) * 100}%"></span>`).join("")}${nowLine}
        ${rows.filter((e) => rules.laneOf(e) === l.id).map((e) => `<button type="button" class="strip-dot" data-id="${e.id}" style="left:${pct(e.started_at)}%"
          aria-label="${escapeHtml(`${hhmm(e.started_at)} ${rules.label(e.type)} ${rules.summary(e)}`)}" title="${escapeHtml(`${hhmm(e.started_at)} · ${rules.summary(e)}`)}"></button>`).join("")}
      </span></div>`).join("")}
  </section>`;
}

function listHtml(rows) {
  if (!rows.length) return `<p class="muted center">${filter === "all" ? "Rien de saisi ce jour-là." : "Rien de ce type ce jour-là."}</p>`;
  const name = (id) => (members.find((x) => x.user_id === id) || {}).display_name || "";
  let html = "";
  let hour = null;
  for (const e of rows) {
    const h = new Date(e.started_at).getHours();
    if (h !== hour) {
      hour = h;
      html += `<h3 class="hour">${String(h).padStart(2, "0")} h</h3>`;
    }
    const mark = e._pending === "failed" ? '<span class="mark failed" title="Refusée">⚠</span>'
      : e._pending ? '<span class="mark" title="En attente d\'envoi">⏳</span>' : "";
    const running = rules.TYPES[e.type].timer && !e.ended_at;
    html += `<button type="button" class="entry" data-id="${e.id}">
      <span class="entry-time">${hhmm(e.started_at)}</span>
      <span class="entry-main"><span class="entry-title">${rules.emoji(e.type)} ${escapeHtml(rules.label(e.type))}${running ? ' <span class="tag">en cours</span>' : ""} ${mark}</span>
        <span class="entry-sub">${escapeHtml(rules.summary(e))}${e.note ? ` · « ${escapeHtml(e.note)} »` : ""}</span></span>
      <span class="entry-who">${escapeHtml(name(e.created_by))}</span></button>`;
  }
  return html;
}

// ---------------------------------------------------------------------
// Week
// ---------------------------------------------------------------------

function weekHtml(days) {
  const sums = days.map((d) => rules.daySummary(eventsOf(d)));
  const pick = selectedWeekDay && days.includes(selectedWeekDay) ? selectedWeekDay : null;
  const charts = rules.WEEK_METRICS.map((m) => {
    const values = sums.map((s) => m.get(s));
    const known = values.filter((v) => v != null);
    const avg = known.length ? known.reduce((a, b) => a + b, 0) / known.length : null;
    const max = Math.max(1, ...known);
    const fmt = (v) => (v == null ? "—" : m.id === "gap" ? rules.fmtDuration(v * 60000) : `${rules.fmtNumber(v)}${m.unit ? ` ${m.unit}` : ""}`);
    const head = pick ? `${shortDay(pick)} : <strong>${fmt(values[days.indexOf(pick)])}</strong>` : `moyenne <strong>${fmt(avg == null ? null : Math.round(avg))}</strong> / jour`;
    return `<section class="week-chart"><div class="week-head"><span class="week-title">${escapeHtml(m.label)}</span><span class="muted">${head}</span></div>
      <div class="bars">${values.map((v, i) => `<button type="button" class="bar-col ${days[i] === pick ? "on" : ""}" data-pick-day="${days[i]}"
          aria-label="${escapeHtml(`${dayLabel(days[i])} : ${fmt(v)}`)}"><span class="bar-area"><span class="bar" style="height:${v ? Math.max(4, (v / max) * 100) : 0}%"></span></span>
          <span class="bar-day">${dayStart(days[i]).toLocaleDateString("fr-BE", { weekday: "narrow" })}</span></button>`).join("")}</div></section>`;
  }).join("");
  const table = `<table class="week-table"><thead><tr><th></th>${days.map((d) => `<th><button type="button" class="link" data-goto-day="${d}">${dayStart(d).toLocaleDateString("fr-BE", { weekday: "short", day: "numeric" })}</button></th>`).join("")}</tr></thead>
    <tbody>${rules.WEEK_METRICS.map((m) => `<tr><th>${escapeHtml(m.label)}</th>${sums.map((s) => {
      const v = m.get(s);
      return `<td>${v == null ? "—" : m.id === "gap" ? rules.fmtDuration(v * 60000) : rules.fmtNumber(v)}</td>`;
    }).join("")}</tr>`).join("")}</tbody></table>`;
  return `<p class="hint">Touche une barre pour lire la valeur du jour ; un jour du tableau pour l'ouvrir.</p>${charts}
    <h2 class="section-title">Tableau</h2><div class="table-scroll">${table}</div>`;
}
