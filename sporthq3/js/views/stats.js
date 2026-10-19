// Stats (Log tab -> "Stats"): every stat on one page, for a period and a sport.
//   #/log/stats
//
// The period and sport you pick are remembered on this device.

import { listActivitiesForStats, listPlannedForStats, listWeighIns } from "../storage.js?v=202610192038";
import { SPORTS, getSport, sportIcon, sessionTypeLabel, STATS_RULES } from "../rules.js?v=202610192038";
import { todayISO, addDays, formatDayLabel, formatWeekLabel } from "../utils/dates.js?v=202610192038";
import { escapeHtml, formatDuration, formatSpeed } from "../utils/format.js?v=202610192038";
import {
  PERIODS, periodRange, bucketUnit, bucketKey, bucketKeys, overview, runningStats, footballStats,
  countByType, adherence, currentStreak, busiestWeek,
} from "../utils/stats.js?v=202610192038";
import { drawBarChart } from "../utils/barChart.js?v=202610192038";

const FILTER_KEY = "sporthq3.statsFilter";

export function render(container) {
  let filter = readFilter();

  container.innerHTML = `
    <div class="stats-page">
      <div class="view-switch log-switch" role="tablist" aria-label="Log view">
        <a href="#/log" role="tab" aria-selected="false">List</a>
        <a href="#/log/stats" role="tab" aria-selected="true">Stats</a>
      </div>
      <div class="stats-filters">
        <div class="chip-row" id="period-chips"></div>
        <div class="chip-row" id="sport-chips"></div>
      </div>
      <p class="muted small" id="stats-range"></p>
      <div id="stats-cards" class="stats-grid"><p class="muted">Counting…</p></div>
    </div>
  `;

  function drawChips() {
    container.querySelector("#period-chips").innerHTML = PERIODS.map((p) =>
      `<button type="button" class="chip-button" data-period="${p.key}" aria-pressed="${p.key === filter.period}">${p.label}</button>`).join("");
    container.querySelector("#sport-chips").innerHTML =
      `<button type="button" class="chip-button" data-sport="all" aria-pressed="${filter.sport === "all"}">All sports</button>` +
      SPORTS.map((s) => `<button type="button" class="chip-button" data-sport="${s.key}" aria-pressed="${s.key === filter.sport}">${s.icon} ${escapeHtml(s.label)}</button>`).join("");
  }

  container.querySelector(".stats-filters").addEventListener("click", (event) => {
    const period = event.target.closest("[data-period]");
    const sport = event.target.closest("[data-sport]");
    if (!period && !sport) return;
    if (period) filter.period = period.dataset.period;
    if (sport) filter.sport = sport.dataset.sport;
    saveFilter(filter);
    drawChips();
    load();
  });

  async function load() {
    const today = todayISO();
    const { from, to } = periodRange(filter.period, today);
    const cards = container.querySelector("#stats-cards");
    cards.innerHTML = `<p class="muted">Counting…</p>`;
    const thisYear = `${today.slice(0, 4)}-01-01`;
    const lastYearSameDay = addDays(today, -365);
    const lastYear = `${Number(today.slice(0, 4)) - 1}-01-01`;
    try {
      // The period, plus this year and last year (for "year to date"),
      // plus enough history for the streak.
      const historyFrom = [from, lastYear, addDays(today, -400)].sort()[0];
      const [all, planned, weighIns] = await Promise.all([
        listActivitiesForStats(historyFrom, today > to ? today : to),
        listPlannedForStats(from, to),
        listWeighIns(),
      ]);
      const bySport = (list) => (filter.sport === "all" ? list : list.filter((a) => a.sport === filter.sport));
      const activities = bySport(all.filter((a) => a.activity_date >= from && a.activity_date <= to));
      const plannedHere = filter.sport === "all" ? planned : planned.filter((p) => p.sport === filter.sport);

      // The real start of "All time" is your first activity.
      const realFrom = filter.period === "all" && all.length ? all.map((a) => a.activity_date).sort()[0] : from;
      const lastDay = to > today ? today : to;
      const weeks = Math.max(1, (Date.parse(lastDay) - Date.parse(realFrom)) / 86400000 / 7 + 1 / 7);
      container.querySelector("#stats-range").textContent =
        `${formatDayLabel(realFrom)} → ${formatDayLabel(to)}${filter.sport === "all" ? "" : ` · ${getSport(filter.sport).label} only`}`;

      const sport = filter.sport;
      const html = [
        overviewCard(activities, sport, weeks),
        yearToDateCard(bySport(all), today, thisYear, lastYear, lastYearSameDay, sport),
        volumeCard(),
        sport === "all" || sport === "running" ? runningCard(activities.filter((a) => a.sport === "running"), weeks) : "",
        sport === "all" || sport === "football" ? footballCard(activities) : "",
        sport !== "all" ? typesCard(activities, sport) : "",
        sport === "all" ? typesCard(activities.filter((a) => a.sport === "muscle"), "muscle") : "",
        consistencyCard(plannedHere, bySport(all), activities, today),
        sport === "all" ? weightCard(weighIns, from, lastDay) : "",
      ].filter(Boolean).join("");
      cards.innerHTML = html;
      drawVolume(cards.querySelector("#volume-chart"), activities, realFrom, to, sport);
    } catch (error) {
      cards.innerHTML = `<p class="status error"></p>`;
      cards.querySelector(".status").textContent = "Could not load the stats: " + error.message;
    }
  }

  drawChips();
  load();
}

function readFilter() {
  try {
    const saved = JSON.parse(localStorage.getItem(FILTER_KEY));
    if (saved && saved.period && saved.sport) return saved;
  } catch { /* not important */ }
  return { period: "year", sport: "all" };
}
function saveFilter(filter) {
  try { localStorage.setItem(FILTER_KEY, JSON.stringify(filter)); } catch { /* not important */ }
}

const km = (n) => `${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 })} km`;
const one = (n) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });
const stat = (value, label) => `<div><strong>${value}</strong><span class="muted small">${label}</span></div>`;

// Does this sport have distances (so km make sense)?
function hasDistance(sport) {
  const s = getSport(sport);
  return Boolean(s && s.fields && s.fields.includes("distance"));
}


// ---------- Cards ----------

function overviewCard(activities, sport, weeks) {
  const o = overview(activities);
  const showKm = sport === "all" ? false : hasDistance(sport);
  const perSport = Object.entries(o.perSport).sort((a, b) => b[1] - a[1]);
  return `
    <section class="card stats-card">
      <h2>Overview</h2>
      <div class="stat-grid">
        ${stat(o.sessions, `sessions · ${one(o.sessions / weeks)}/week`)}
        ${stat(formatDuration(o.seconds) || "0:00", o.missingTime ? "time (at least)" : "time")}
        ${showKm ? stat(km(o.km), "distance") : stat(one(o.elevation) + " m", "D+")}
        ${stat(o.avgRpe ? one(o.avgRpe) : "–", "average RPE")}
      </div>
      ${sport === "all" && perSport.length ? `<ul class="sport-bars">${perSport.map(([key, count]) => `
        <li><span>${sportIcon(key)} ${escapeHtml(getSport(key) ? getSport(key).label : key)}</span>
          <span class="bar"><span class="bar-fill accent-fill" style="width: ${Math.round((count / perSport[0][1]) * 100)}%"></span></span>
          <span class="small">${count}</span></li>`).join("")}</ul>` : ""}
    </section>`;
}

function volumeCard() {
  return `
    <section class="card stats-card stats-wide">
      <h2 id="volume-title">Volume</h2>
      <div id="volume-chart"></div>
    </section>`;
}

// Bars per week / month / year: km for sports with a distance (and running
// when "all sports" is picked), sessions otherwise.
function drawVolume(el, activities, from, to, sport) {
  const unit = bucketUnit(from, to);
  const metricSport = sport === "all" ? "running" : sport;
  const useKm = hasDistance(metricSport);
  const source = useKm ? activities.filter((a) => a.sport === metricSport) : activities;
  const totals = {};
  for (const a of source) {
    const key = bucketKey(a.activity_date, unit);
    totals[key] = (totals[key] || 0) + (useKm ? Number(a.distance_km || 0) : 1);
  }
  const keys = bucketKeys(from, to, unit);
  const label = (key) => (unit === "week" ? formatDayLabel(key).replace(/^\w+, /, "")
    : unit === "month" ? new Date(key + "-01T12:00:00").toLocaleDateString("en-GB", { month: "short" }) : key);
  const tip = (key) => (unit === "week" ? formatWeekLabel(key)
    : unit === "month" ? new Date(key + "-01T12:00:00").toLocaleDateString("en-GB", { month: "long", year: "numeric" }) : key);
  const what = useKm ? `${getSport(metricSport).label} km` : "sessions";
  el.closest(".card").querySelector("#volume-title").textContent =
    `${what[0].toUpperCase() + what.slice(1)} per ${unit}`;
  drawBarChart(el, {
    bars: keys.map((key) => ({ label: label(key), value: totals[key] || 0, tip: tip(key) })),
    unit: useKm ? "km" : "sessions",
    // Sport HQ2's monthly running minimum (80 km), on the monthly running chart.
    reference: useKm && metricSport === "running" && unit === "month"
      ? { value: STATS_RULES.monthlyRunTargetKm, label: `Min ${STATS_RULES.monthlyRunTargetKm} km` } : null,
  });
}

function runningCard(runs, weeks) {
  const r = runningStats(runs, weeks);
  if (!r.runs) return `<section class="card stats-card"><h2>🏃 Running</h2><p class="muted">No runs in this period.</p></section>`;
  return `
    <section class="card stats-card">
      <h2>🏃 Running</h2>
      <div class="stat-grid">
        ${stat(km(r.km), `${r.runs} runs`)}
        ${stat(km(r.kmPerWeek), "per week")}
        ${stat(r.avgPaceS ? formatDuration(Math.round(r.avgPaceS)) + " /km" : "–", "average pace")}
        ${stat(r.longest ? km(r.longest.distance_km) : "–", "longest run")}
      </div>
      <ul class="dash-list small">
        ${r.longest ? `<li><span>Longest: <a href="#/log/${r.longest.id}">${escapeHtml(formatDayLabel(r.longest.activity_date))}</a></span>
          <span>${km(r.longest.distance_km)}${r.longest.duration_s ? ` · ${formatDuration(r.longest.duration_s)}` : ""}</span></li>` : ""}
        ${r.highest ? `<li><span>Most D+: <a href="#/log/${r.highest.id}">${escapeHtml(formatDayLabel(r.highest.activity_date))}</a></span>
          <span>${r.highest.elevation_m} m · ${km(r.highest.distance_km)}</span></li>` : ""}
      </ul>
      <p class="small"><a href="#/body">🏅 Personal bests →</a></p>
    </section>`;
}

function footballCard(activities) {
  const f = footballStats(activities);
  if (!f.matches && !f.trainings) return `<section class="card stats-card"><h2>⚽ Football</h2><p class="muted">No football in this period.</p></section>`;
  return `
    <section class="card stats-card">
      <h2>⚽ Football</h2>
      <div class="stat-grid">
        ${stat(f.matches, "matches")}
        ${stat(f.minutes, "minutes")}
        ${stat(f.goals, `goals${f.withCard ? ` · ${one(f.goals / f.withCard)}/match` : ""}`)}
        ${stat(f.assists, "assists")}
      </div>
      <p class="muted small">${f.trainings} team training${f.trainings === 1 ? "" : "s"}${f.matches > f.withCard
        ? ` · ${f.matches - f.withCard} match${f.matches - f.withCard === 1 ? "" : "es"} without a match card (not counted in minutes / goals / assists)` : ""}</p>
    </section>`;
}

function typesCard(activities, sport) {
  const types = countByType(activities, (a) => (a.session_type ? sessionTypeLabel(a.sport, a.session_type) : "No type"));
  if (!types.length) return "";
  const s = getSport(sport);
  return `
    <section class="card stats-card">
      <h2>${s ? s.icon + " " + escapeHtml(s.label) : ""} by type</h2>
      <ul class="sport-bars">${types.map(([label, count]) => `
        <li><span>${escapeHtml(label)}</span>
          <span class="bar"><span class="bar-fill accent-fill" style="width: ${Math.round((count / types[0][1]) * 100)}%"></span></span>
          <span class="small">${count}</span></li>`).join("")}</ul>
    </section>`;
}

function consistencyCard(planned, history, activities, today) {
  const plan = adherence(planned, today);
  const streak = currentStreak(history, today, STATS_RULES.streakMinSessions);
  const busiest = busiestWeek(activities);
  return `
    <section class="card stats-card">
      <h2>Consistency</h2>
      <div class="stat-grid">
        ${stat(plan.percent == null ? "–" : plan.percent + "%", plan.due ? `of planned done (${plan.done}/${plan.due})` : "nothing planned")}
        ${stat(streak, `week${streak === 1 ? "" : "s"} in a row with ${STATS_RULES.streakMinSessions}+ sessions`)}
        ${stat(busiest ? busiest.count : "–", busiest ? `busiest week (${escapeHtml(formatDayLabel(busiest.monday).replace(/^\w+, /, ""))})` : "busiest week")}
      </div>
    </section>`;
}

function yearToDateCard(history, today, thisYear, lastYear, lastYearSameDay, sport) {
  const now = history.filter((a) => a.activity_date >= thisYear && a.activity_date <= today);
  const before = history.filter((a) => a.activity_date >= lastYear && a.activity_date <= lastYearSameDay);
  const kmSport = sport === "all" ? "running" : sport;
  const showKm = hasDistance(kmSport);
  const kmOf = (list) => list.filter((a) => a.sport === kmSport).reduce((t, a) => t + Number(a.distance_km || 0), 0);
  const diff = (a, b) => (b ? `${a >= b ? "+" : "−"}${Math.abs(Math.round(((a - b) / b) * 100))}%` : "");
  return `
    <section class="card stats-card">
      <h2>Year to date <span class="muted small">vs same day last year</span></h2>
      <div class="stat-grid">
        ${stat(now.length, `sessions (${before.length} last year) ${diff(now.length, before.length)}`)}
        ${showKm ? stat(km(kmOf(now)), `${getSport(kmSport).label.toLowerCase()} (${km(kmOf(before))} last year) ${diff(kmOf(now), kmOf(before))}`) : ""}
      </div>
    </section>`;
}

function weightCard(weighIns, from, to) {
  const inPeriod = weighIns.filter((w) => w.weigh_date >= from && w.weigh_date <= to);
  if (inPeriod.length < 2) return "";
  const first = Number(inPeriod[0].weight_kg);
  const last = Number(inPeriod[inPeriod.length - 1].weight_kg);
  const change = last - first;
  return `
    <section class="card stats-card">
      <h2><a href="#/body">⚖️ Weight</a></h2>
      <div class="stat-grid">
        ${stat(`${one(last)} kg`, "latest")}
        ${stat(`${change > 0 ? "+" : change < 0 ? "−" : ""}${one(Math.abs(change))} kg`, "over the period")}
      </div>
    </section>`;
}
