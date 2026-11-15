// journal.js: the day, hour by hour, newest first (step 1.7). ‹ › to another
// day. Each line: time, what, details, who entered it. Tap = change / delete.
// An entry still waiting in the outbox shows ⏳, a refused one ⚠.

import * as store from "../store.js";
import * as rules from "../rules.js";
import { escapeHtml, errorHtml } from "../utils/html.js";
import { dayKey, dayLabel, addDays, hhmm } from "../utils/dates.js";
import { openEditor } from "./editor.js";

let day = dayKey();
let members = [];

export function render(el, { home, params }) {
  members = home.members || [];
  if (params && params[0] && /^\d{4}-\d{2}-\d{2}$/.test(params[0])) day = params[0];
  el.innerHTML = `<div class="day-nav">
      <button type="button" class="btn secondary" data-day="-1" aria-label="Jour précédent">‹</button>
      <strong id="day-label"></strong>
      <button type="button" class="btn secondary" data-day="1" aria-label="Jour suivant">›</button></div>
    <p class="today muted" id="day-totals"></p>
    <div id="day-list"></div>`;
  el.querySelectorAll("[data-day]").forEach((b) => b.addEventListener("click", () => {
    const next = addDays(day, Number(b.dataset.day));
    if (next > dayKey()) return;
    day = next;
    load(el);
  }));
  load(el);
}

async function load(el) {
  refresh(el);
  try {
    await store.ensureDay(day);
  } catch {
    const list = el.querySelector("#day-list");
    if (list && !list.children.length) list.innerHTML = errorHtml("Ce jour n'a pas pu être chargé (pas de réseau ?).");
  }
}

export function refresh(el) {
  const list = el.querySelector("#day-list");
  if (!list) return;
  el.querySelector("#day-label").textContent = dayLabel(day);
  el.querySelector('[data-day="1"]').disabled = day >= dayKey();

  const rows = rules.live(store.events())
    .filter((e) => rules.TYPES[e.type] && dayKey(e.started_at) === day)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));

  const count = (t, f = () => true) => rows.filter((e) => e.type === t && f(e)).length;
  const ml = rows.filter((e) => e.type === "bottle").reduce((s, e) => s + (Number(e.data && e.data.ml) || 0), 0);
  el.querySelector("#day-totals").textContent = `${count("breastfeed")} tétée(s) · ${ml} ml · `
    + `${count("diaper", (e) => e.data && e.data.pee)} mouillée(s) · ${count("diaper", (e) => e.data && e.data.poop)} sale(s)`;

  if (!rows.length) {
    list.innerHTML = '<p class="muted center">Rien de saisi ce jour-là.</p>';
    return;
  }
  const name = (id) => {
    const m = members.find((x) => x.user_id === id);
    return m ? m.display_name : "";
  };
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
  list.innerHTML = html;
  list.querySelectorAll(".entry").forEach((b) => b.addEventListener("click", () => {
    const e = store.events().find((x) => x.id === b.dataset.id);
    if (e) openEditor(e, { members });
  }));
}
