// Weekly review (#/review/<monday>, step 16g): a look back at one week —
// plan vs done, the numbers, weight — and a short note "How did it go?".
// The note is stored on planned_weeks (one row per week, see storage.js).
// Home offers it on Sunday (this week) and on Monday / Tuesday (last week).

import {
  listPlannedSessions, listActivitiesBetween, listMatchesBetween, listWeighIns,
  getWeekReview, saveWeekReview,
} from "../storage.js?v=202610201000";
import { sportIcon } from "../rules.js?v=202610201000";
import { todayISO, startOfWeek, addDays, formatDayLabel, formatWeekLabel } from "../utils/dates.js?v=202610201000";
import { escapeHtml, formatHours } from "../utils/format.js?v=202610201000";
import { overview } from "../utils/stats.js?v=202610201000";
import { sessionName } from "../utils/plan.js?v=202610201000";
import { showToast } from "../utils/toast.js?v=202610201000";

export async function render(container, { params = [] } = {}) {
  const thisMonday = startOfWeek(todayISO());
  const asked = /^\d{4}-\d{2}-\d{2}$/.test(params[0] || "") ? startOfWeek(params[0]) : thisMonday;
  const monday = asked > thisMonday ? thisMonday : asked; // no review of a week still to come
  const sunday = addDays(monday, 6);

  container.innerHTML = `
    <div class="week-nav">
      <a class="button small-button" href="#/review/${addDays(monday, -7)}" aria-label="Previous week">‹</a>
      <div class="week-nav-title">
        <strong>${formatWeekLabel(monday)}</strong>
        <span class="muted small">${formatDayLabel(monday)} – ${formatDayLabel(sunday)}</span>
      </div>
      ${monday < thisMonday ? `<a class="button small-button" href="#/review/${addDays(monday, 7)}" aria-label="Next week">›</a>` : `<span></span>`}
    </div>
    <a class="today-link" href="#/planner/${monday}">📅 Open this week in the plan</a>
    <div id="review-body"><p class="muted">Loading…</p></div>
  `;
  const body = container.querySelector("#review-body");

  let sessions, activities, matches, weighIns, review;
  try {
    [sessions, activities, matches, weighIns, review] = await Promise.all([
      listPlannedSessions(monday, sunday),
      listActivitiesBetween(monday, sunday),
      listMatchesBetween(monday, sunday),
      listWeighIns(),
      getWeekReview(monday),
    ]);
  } catch (error) {
    body.innerHTML = `<p class="status error"></p>`;
    body.querySelector(".status").textContent = "Could not load the week: " + error.message;
    return;
  }

  body.innerHTML = `
    ${planCardHtml(sessions, todayISO())}
    ${numbersCardHtml(activities, matches)}
    ${weightCardHtml(weighIns, monday, sunday)}
    <form class="card" id="review-form">
      <h2>How did it go?</h2>
      <label for="review-notes" class="muted small">Energy, pain, what worked, what to change next week…</label>
      <textarea id="review-notes" class="review-notes" maxlength="4000">${escapeHtml(review?.review_notes || "")}</textarea>
      <div class="form-actions">
        <button type="submit" class="button primary">Save my review</button>
      </div>
      <p id="review-status" class="status ${review?.reviewed_at ? "ok" : ""}">${review?.reviewed_at
        ? `Reviewed on ${escapeHtml(formatDayLabel(review.reviewed_at.slice(0, 10)))}` : ""}</p>
    </form>
  `;

  const form = body.querySelector("#review-form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const button = form.querySelector("button[type=submit]");
    button.disabled = true;
    try {
      await saveWeekReview(monday, form.querySelector("#review-notes").value.trim());
      showToast("📝 Review saved");
      const status = form.querySelector("#review-status");
      status.className = "status ok";
      status.textContent = `Reviewed on ${formatDayLabel(todayISO())}`;
    } catch (error) {
      const status = form.querySelector("#review-status");
      status.className = "status error";
      status.textContent = "Could not save: " + error.message;
    }
    button.disabled = false;
  });
}

// Plan vs done: the count, then what was skipped or left open.
function planCardHtml(sessions, today) {
  if (!sessions.length) return `<section class="card"><h2>Plan</h2><p class="muted">Nothing was planned this week.</p></section>`;
  const counted = sessions.filter((s) => s.status !== "cancelled");
  const done = counted.filter((s) => s.status === "done");
  const skipped = sessions.filter((s) => s.status === "cancelled");
  const open = counted.filter((s) => s.status === "planned" && s.session_date < today);
  const line = (s) => `<li>${sportIcon(s.sport)} ${escapeHtml(sessionName(s))} <span class="muted small">${escapeHtml(formatDayLabel(s.session_date))}</span></li>`;
  return `
    <section class="card">
      <h2>Plan</h2>
      <p class="dash-big">${done.length} <span class="muted">of ${counted.length} done</span></p>
      ${skipped.length ? `<p class="muted small">Skipped</p><ul class="review-list">${skipped.map(line).join("")}</ul>` : ""}
      ${open.length ? `<p class="muted small">Never ticked (done? <a href="#/planner/${startOfWeek(open[0].session_date)}">tick them in the plan</a>)</p>
        <ul class="review-list">${open.map(line).join("")}</ul>` : ""}
    </section>`;
}

// What was logged: time, sessions, km run, D+, RPE, football.
function numbersCardHtml(activities, matches) {
  const o = overview(activities);
  const runKm = activities.filter((a) => a.sport === "running").reduce((sum, a) => sum + Number(a.distance_km || 0), 0);
  const cards = matches.map((m) => (Array.isArray(m.match_stats) ? m.match_stats[0] : m.match_stats)).filter(Boolean);
  const goals = cards.reduce((sum, c) => sum + (c.goals || 0), 0);
  const assists = cards.reduce((sum, c) => sum + (c.assists || 0), 0);
  return `
    <section class="card">
      <h2>Logged</h2>
      <div class="stat-grid">
        <div><strong>${formatHours(o.seconds)}</strong><span class="muted small">${o.missingTime ? "time (at least)" : "time"}</span></div>
        <div><strong>${o.sessions}</strong><span class="muted small">sessions</span></div>
        <div><strong>${runKm.toLocaleString("en-GB", { maximumFractionDigits: 1 })}</strong><span class="muted small">km run</span></div>
        <div><strong>${Math.round(o.elevation)}</strong><span class="muted small">m D+</span></div>
        <div><strong>${o.avgRpe ? o.avgRpe.toFixed(1) : "–"}</strong><span class="muted small">avg RPE</span></div>
        ${matches.length ? `<div><strong>${matches.length} ⚽</strong><span class="muted small">${goals} G · ${assists} A</span></div>` : ""}
      </div>
    </section>`;
}

// Weight: the last weigh-in of the week vs the last one before it.
function weightCardHtml(weighIns, monday, sunday) {
  const inWeek = weighIns.filter((w) => w.weigh_date >= monday && w.weigh_date <= sunday);
  if (!inWeek.length) return "";
  const last = inWeek[inWeek.length - 1];
  const before = weighIns.filter((w) => w.weigh_date < monday).pop();
  const change = before ? Number(last.weight_kg) - Number(before.weight_kg) : null;
  const sign = change > 0 ? "+" : change < 0 ? "−" : "±";
  return `
    <section class="card">
      <h2>Weight</h2>
      <p class="dash-big">${Number(last.weight_kg)} kg
        ${change !== null ? `<span class="muted">${sign}${Math.abs(change).toFixed(1)} kg vs the week before</span>` : ""}</p>
    </section>`;
}
