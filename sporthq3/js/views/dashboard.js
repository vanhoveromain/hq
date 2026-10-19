// Home tab: your training at a glance. Each card loads on its own (if one
// fails, the others still show) and opens the full screen when tapped.

import {
  listPlannedSessions, listActivitiesBetween, listRaces, getRace, findBlockOn,
  listWeighIns, getSettings, listMatchesBetween, listShoes, getShoeDistances,
} from "../storage.js?v=202610192038";
import { checkTrainingRules, sportIcon, SHOE_RULES, shoeStatus } from "../rules.js?v=202610192038";
import { todayISO, addDays, startOfWeek, formatDayLabel } from "../utils/dates.js?v=202610192038";
import { escapeHtml, formatDuration } from "../utils/format.js?v=202610192038";
import { overview } from "../utils/stats.js?v=202610192038";
import { sessionName, calendarItems, daySummary, sportBadge } from "../utils/plan.js?v=202610192038";
import { loadWorkout } from "../utils/workout.js?v=202610192038";
import { weightTrend } from "../utils/body.js?v=202610192038";
import { currentSeason } from "../utils/season.js?v=202610192038";
import { blockWeek } from "./blocks.js?v=202610192038";

export function render(container) {
  container.innerHTML = `
    <div class="dashboard">
      <!-- Laptop: "now" on the left (wide), the overview on the right (narrow).
           Phone: one column, left part first. -->
      <div class="dash-main">
        <section class="card dash-card" id="dash-today"><p class="muted">Loading…</p></section>
        <section class="card dash-card" id="dash-week"><p class="muted">Loading…</p></section>
        <section class="card dash-card" id="dash-load"><p class="muted">Loading…</p></section>
        <section class="card dash-card dash-warnings" id="dash-warnings" hidden></section>
      </div>
      <div class="dash-side">
        <section class="card dash-card" id="dash-race" hidden></section>
        <section class="card dash-card" id="dash-block" hidden></section>
        <section class="card dash-card" id="dash-weight" hidden></section>
        <section class="card dash-card" id="dash-football"></section>
        <section class="card dash-card" id="dash-shoes" hidden></section>
      </div>
    </div>
  `;
  const $ = (id) => container.querySelector(id);
  const today = todayISO();

  // A tap anywhere on a card = a tap on its title (opens that screen).
  // Links and buttons inside the card (Start, Log, …) keep their own job.
  container.querySelector(".dashboard").addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    const titleLink = event.target.closest(".dash-card")?.querySelector("h2 a");
    if (titleLink) window.location.hash = titleLink.getAttribute("href");
  });
  // Each card is its own little task; a failing one shows its error only.
  const card = (el, task) => task().catch((error) => {
    el.hidden = false;
    el.innerHTML = `<p class="status error"></p>`;
    el.querySelector(".status").textContent = "Could not load: " + error.message;
  });
  card($("#dash-today"), () => drawWeek($("#dash-today"), $("#dash-week"), $("#dash-warnings"), today));
  card($("#dash-load"), () => drawLoad($("#dash-load"), today));
  card($("#dash-race"), () => drawRace($("#dash-race"), today));
  card($("#dash-block"), () => drawBlock($("#dash-block"), today));
  card($("#dash-weight"), () => drawWeight($("#dash-weight")));
  card($("#dash-football"), () => drawFootball($("#dash-football"), today));
  card($("#dash-shoes"), () => drawShoes($("#dash-shoes")));
}


// ---------- Today + this week + warnings (one load for all three) ----------

async function drawWeek(todayEl, weekEl, warningsEl, today) {
  const monday = startOfWeek(today);
  const sunday = addDays(monday, 6);
  // One extra day on each side, for the rules (Sunday -> next Monday).
  const [allSessions, allActivities] = await Promise.all([
    listPlannedSessions(addDays(monday, -1), addDays(sunday, 1)),
    listActivitiesBetween(addDays(monday, -1), addDays(sunday, 1)),
  ]);
  const inWeek = (date) => date >= monday && date <= sunday;
  const sessions = allSessions.filter((s) => inWeek(s.session_date));
  const activities = allActivities.filter((a) => inWeek(a.activity_date));

  // Today
  const todays = sessions.filter((s) => s.session_date === today);
  const workout = loadWorkout();
  todayEl.innerHTML = `
    <h2><a href="#/planner">Today</a> <span class="muted small">${escapeHtml(formatDayLabel(today))}</span></h2>
    ${workout ? `<a class="plan-banner workout-banner" href="#/workout/${escapeHtml(workout.plannedId)}">
      🏋️ Workout in progress: <strong>${escapeHtml(workout.name)}</strong> · Resume ›</a>` : ""}
    ${todays.length ? `<ul class="dash-list">${todays.map((s) => `
      <li>
        <span>${sportIcon(s.sport)} ${escapeHtml(sessionName(s))}
          ${s.status === "done" ? "✅" : s.status === "cancelled" ? "❌" : ""}</span>
        ${s.status === "planned" ? `<span class="dash-actions">
          <a class="button small-button" href="#/workout/${s.id}">▶️ Start</a>
          <a class="button small-button" href="#/log/new/${s.id}">✍️ Log</a></span>` : ""}
      </li>`).join("")}</ul>`
      : `<p class="muted">Nothing planned: rest day 😴 <a href="#/planner">Plan something</a></p>`}
  `;

  // This week: done / planned, the 7-day strip, running km
  const counted = sessions.filter((s) => s.status !== "cancelled");
  const done = counted.filter((s) => s.status === "done").length;
  const runKm = activities.filter((a) => a.sport === "running").reduce((sum, a) => sum + Number(a.distance_km || 0), 0);
  // The 7 days: the sport icons planned (or logged) that day, nothing else;
  // a done day gets a light green background.
  const strip = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => {
    const { icons, done } = daySummary(day, sessions, activities, (sport) => sportBadge(sport, sportIcon, "small"));
    const name = new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "narrow" });
    const label = icons.length ? (done ? "done" : "planned") : "rest";
    return `<span class="strip-day ${day === today ? "is-today" : ""} ${done ? "is-done" : ""}" title="${label}">
      <span class="muted small">${name}</span>
      <span class="strip-icons" aria-label="${label}">${icons.length ? icons.join("") : "–"}</span></span>`;
  }).join("");
  weekEl.innerHTML = `
    <h2><a href="#/planner">This week</a></h2>
    <p class="dash-big">${counted.length ? `${done} <span class="muted">of ${counted.length} done</span>` : `<span class="muted">Nothing planned yet</span>`}</p>
    <div class="week-strip">${strip}</div>
    <p class="muted small">🏃 ${runKm.toLocaleString("en-GB", { maximumFractionDigits: 1 })} km run this week</p>
  `;

  // Warnings of this week
  const warnings = checkTrainingRules(calendarItems(allSessions, allActivities)).filter((w) => w.days.some(inWeek));
  if (warnings.length) {
    warningsEl.hidden = false;
    warningsEl.innerHTML = `
      <h2><a href="#/planner">⚠️ ${warnings.length} warning${warnings.length === 1 ? "" : "s"}</a></h2>
      <ul class="dash-list">${warnings.map((w) => `<li class="small">${escapeHtml(w.message)}</li>`).join("")}</ul>`;
  }
}


// ---------- Training load: hours per week ----------

const LOAD_WEEKS = 8;     // weeks in the little chart (this week included)
const AVERAGE_WEEKS = 4;  // "average" = the 4 full weeks before this one

async function drawLoad(el, today) {
  const monday = startOfWeek(today);
  const firstMonday = addDays(monday, -7 * (LOAD_WEEKS - 1));
  const activities = await listActivitiesBetween(firstMonday, addDays(monday, 6));

  // The weeks, oldest first: [{ monday, activities }]
  const weeks = Array.from({ length: LOAD_WEEKS }, (_, i) => {
    const start = addDays(firstMonday, 7 * i);
    const end = addDays(start, 6);
    return { monday: start, activities: activities.filter((a) => a.activity_date >= start && a.activity_date <= end) };
  });
  const thisWeek = overview(weeks[weeks.length - 1].activities);
  const secondsOf = (week) => overview(week.activities).seconds;
  const previous = weeks.slice(-1 - AVERAGE_WEEKS, -1);
  const average = previous.reduce((total, week) => total + secondsOf(week), 0) / previous.length;
  const runKm = weeks[weeks.length - 1].activities.filter((a) => a.sport === "running")
    .reduce((total, a) => total + Number(a.distance_km || 0), 0);
  const noTime = weeks[weeks.length - 1].activities.filter((a) => a.duration_s == null).length;

  el.innerHTML = `
    <h2><a href="#/log/stats">⏱️ Training load</a></h2>
    <p class="dash-big">${formatHours(thisWeek.seconds)} <span class="muted">this week · avg ${formatHours(average)}</span></p>
    <div class="stat-grid">
      <div><strong>${thisWeek.sessions}</strong><span class="muted small">sessions</span></div>
      <div><strong>${runKm.toLocaleString("en-GB", { maximumFractionDigits: 1 })}</strong><span class="muted small">km run</span></div>
      <div><strong>${Math.round(thisWeek.elevation)}</strong><span class="muted small">m D+</span></div>
      <div><strong>${thisWeek.avgRpe ? thisWeek.avgRpe.toFixed(1) : "–"}</strong><span class="muted small">avg RPE</span></div>
    </div>
    ${loadChartHtml(weeks.map((week) => ({ monday: week.monday, seconds: secondsOf(week) })), monday)}
    ${noTime ? `<p class="hint">${noTime} session${noTime === 1 ? "" : "s"} this week without a duration (not in the hours).</p>` : ""}
  `;
}

// 16200 -> "4h30", 2700 -> "45 min", 0 -> "0h"
function formatHours(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes === 0) return "0h";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

// Hours per week as simple columns (plain HTML boxes, no chart library).
// The tallest week fills the box; this week is in the accent colour.
function loadChartHtml(weeks, thisMonday) {
  const highest = Math.max(...weeks.map((w) => w.seconds), 1);
  return `<div class="load-chart" role="img" aria-label="Hours per week, last ${weeks.length} weeks">
    ${weeks.map((w) => {
      const percent = Math.round((w.seconds / highest) * 100);
      const label = new Date(w.monday + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      return `<div class="load-week ${w.monday === thisMonday ? "is-current" : ""}" title="Week of ${label}: ${formatHours(w.seconds)}">
        <span class="load-value">${w.seconds ? formatHours(w.seconds) : ""}</span>
        <span class="load-track"><span class="load-column" style="height: ${percent}%"></span></span>
      </div>`;
    }).join("")}
  </div>
  <p class="muted small load-caption">Last ${weeks.length} weeks</p>`;
}


// ---------- Next race ----------

async function drawRace(el, today) {
  const races = await listRaces();
  const next = races
    .filter((r) => r.race_date && r.race_date >= today && (r.status === "registered" || r.status === "to_register"))
    .sort((a, b) => a.race_date.localeCompare(b.race_date))[0];
  if (!next) return;
  const race = await getRace(next.id);
  const days = Math.round((Date.parse(race.race_date) - Date.parse(today)) / 86400000);
  const ready = race.checklist.filter((i) => i.done).length;
  el.hidden = false;
  el.innerHTML = `
    <h2><a href="#/races/${race.id}">🏁 ${escapeHtml(race.name)}</a></h2>
    <p class="dash-big">${days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days} <span class="muted">days to go</span>`}</p>
    <p class="muted small">${escapeHtml(formatDayLabel(race.race_date))}
      ${race.distance_km ? ` · ${Number(race.distance_km)} km` : ""}
      ${race.goal_time_s ? ` · goal ${formatDuration(race.goal_time_s)}` : ""}
      ${race.status === "to_register" ? " · <strong>not registered yet</strong>" : ""}</p>
    ${race.checklist.length ? `<p class="small">Checklist: ${ready} / ${race.checklist.length} ready</p>` : ""}
  `;
}


// ---------- Current training block ----------

async function drawBlock(el, today) {
  const block = await findBlockOn(today);
  if (!block) return;
  const week = blockWeek(block, today);
  const total = Math.max(1, Date.parse(block.end_date) - Date.parse(block.start_date));
  const percent = Math.round(((Date.parse(today) - Date.parse(block.start_date)) / total) * 100);
  el.hidden = false;
  el.innerHTML = `
    <h2><a href="#/blocks/${block.id}">📘 ${escapeHtml(block.name)}</a></h2>
    <p class="dash-big">Week ${week.current} <span class="muted">of ${week.total}</span></p>
    <span class="bar" role="img" aria-label="${percent}% of the block"><span class="bar-fill" style="width: ${percent}%"></span></span>
  `;
}


// ---------- Weight ----------

async function drawWeight(el) {
  const [weighIns, settings] = await Promise.all([listWeighIns(), getSettings()]);
  if (!weighIns.length) return;
  const latest = weighIns[weighIns.length - 1];
  const start = settings.start_weight_kg != null ? Number(settings.start_weight_kg) : Number(weighIns[0].weight_kg);
  const target = settings.target_weight_kg != null ? Number(settings.target_weight_kg) : null;
  const kg = (n) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  let goalText = "";
  if (target) {
    const goal = start - target;
    const done = start - Number(latest.weight_kg);
    const percent = goal ? Math.max(0, Math.min(100, Math.round((done / goal) * 100))) : 0;
    goalText = `${percent}% of your goal (${kg(target)} kg)`;
  }
  el.hidden = false;
  el.innerHTML = `
    <h2><a href="#/body">⚖️ Weight</a></h2>
    <p class="dash-big">${kg(latest.weight_kg)} kg</p>
    <p class="muted small">${escapeHtml(formatDayLabel(latest.weigh_date))}${goalText ? ` · ${goalText}` : ""}</p>
    ${sparklineHtml(weightTrend(weighIns).slice(-12))}
  `;
}

// A tiny trend line without axes: just the shape of the last weeks.
function sparklineHtml(points) {
  if (points.length < 2) return "";
  const width = 200;
  const height = 40;
  const values = points.map((p) => p.kg);
  const low = Math.min(...values);
  const high = Math.max(...values);
  const x = (i) => 2 + (i / (points.length - 1)) * (width - 4);
  const y = (v) => 4 + (1 - (v - low) / Math.max(0.1, high - low)) * (height - 8);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  return `<svg class="sparkline" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img"
    aria-label="Weight trend, last ${points.length} weigh-ins"><path d="${path}"></path></svg>`;
}


// ---------- Football season ----------

async function drawFootball(el, today) {
  const season = currentSeason(today);
  const matches = await listMatchesBetween(season.from, season.to);
  const cards = matches.map((m) => m.match_stats).filter(Boolean);
  const sum = (key) => cards.reduce((total, c) => total + Number(c[key] || 0), 0);
  el.innerHTML = `
    <h2><a href="#/log">⚽ Season ${season.label}</a> ${season.finished ? `<span class="muted small">finished</span>` : ""}</h2>
    <div class="stat-grid">
      <div><strong>${matches.length}</strong><span class="muted small">matches</span></div>
      <div><strong>${sum("minutes_played")}</strong><span class="muted small">minutes</span></div>
      <div><strong>${sum("goals")}</strong><span class="muted small">goals</span></div>
      <div><strong>${sum("assists")}</strong><span class="muted small">assists</span></div>
    </div>
    ${matches.length > cards.length ? `<p class="hint">${matches.length - cards.length} match${matches.length - cards.length === 1 ? "" : "es"} without a match card (minutes, goals and assists only count from match cards).</p>` : ""}
  `;
}


// ---------- Shoes ----------

async function drawShoes(el) {
  const [shoes, distances] = await Promise.all([listShoes(), getShoeDistances()]);
  const inUse = shoes.filter((s) => !s.retired);
  if (!inUse.length) return;
  el.hidden = false;
  el.innerHTML = `
    <h2><a href="#/shoes">👟 Shoes</a></h2>
    <ul class="dash-list">${inUse.map((shoe) => {
      const km = (distances[shoe.id] || { km: 0 }).km;
      const status = shoeStatus(km);
      const percent = Math.min(100, Math.round((km / SHOE_RULES.replaceKm) * 100));
      return `<li class="dash-shoe status-${status}">
        <span>${escapeHtml(shoe.name)} <span class="muted small">${km.toFixed(0)} km</span>
          ${status === "replace" ? " · <strong>replace</strong>" : status === "warn" ? " · getting worn" : ""}</span>
        <span class="bar"><span class="bar-fill" style="width: ${percent}%"></span></span>
      </li>`;
    }).join("")}</ul>
  `;
}
