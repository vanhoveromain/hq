// Log screen: the list of activities, newest first, grouped by week.
//   #/log          -> the list
//   #/log/stats    -> all the stats (see stats.js)
//   #/log/new      -> empty form (see logForm.js)
//   #/log/<id>     -> form to edit that activity

import { listActivities } from "../storage.js?v=202610142256";
import { sportIcon, sessionTypeLabel, getSport, getSessionType } from "../rules.js?v=202610142256";
import { startOfWeek, formatDayLabel, formatWeekLabel } from "../utils/dates.js?v=202610142256";
import { formatDuration, formatKm, formatSpeed, escapeHtml } from "../utils/format.js?v=202610142256";
import * as logForm from "./logForm.js?v=202610142256";
import * as statsView from "./stats.js?v=202610142256";

const PAGE_SIZE = 30;

export function render(container, { params = [] } = {}) {
  // #/log/new/<plannedId> = "Log it now" from the planner: pre-filled + linked
  if (params[0] === "stats") return statsView.render(container);
  if (params[0] === "new") return logForm.render(container, { activityId: null, plannedId: params[1] || null });
  if (params[0]) return logForm.render(container, { activityId: params[0] });
  renderList(container);
}

async function renderList(container) {
  container.innerHTML = `
    <div class="log-page">
    <div class="view-switch log-switch" role="tablist" aria-label="Log view">
      <a href="#/log" role="tab" aria-selected="true">List</a>
      <a href="#/log/stats" role="tab" aria-selected="false">Stats</a>
    </div>
    <a href="#/log/new" class="button primary add-button">+ Add activity</a>
    <!-- Column titles: only shown on a laptop, where each line becomes a table row -->
    <div class="log-head" aria-hidden="true">
      <span></span><span>Date</span><span>Session</span><span>Time</span><span>Distance</span><span>Pace</span><span>RPE</span>
    </div>
    <div id="activity-list"><p class="muted">Loading…</p></div>
    <button id="load-more" class="button load-more" hidden>Load more</button>
    <p id="list-status" class="status" role="status"></p>
    </div>
  `;
  const listEl = container.querySelector("#activity-list");
  const moreButton = container.querySelector("#load-more");
  const status = container.querySelector("#list-status");

  let activities = []; // everything loaded so far

  async function loadPage() {
    moreButton.disabled = true;
    try {
      const page = await listActivities({ limit: PAGE_SIZE, offset: activities.length });
      activities = activities.concat(page);
      listEl.innerHTML = activities.length
        ? groupByWeek(activities).map(weekHtml).join("")
        : `<section class="card placeholder"><p>No activities yet. Tap <strong>+ Add activity</strong> to log your first one.</p></section>`;
      // A full page means there may be more; a short page means we reached the end.
      moreButton.hidden = page.length < PAGE_SIZE;
    } catch (error) {
      status.textContent = "Could not load activities: " + error.message;
      status.className = "status error";
    }
    moreButton.disabled = false;
  }

  moreButton.addEventListener("click", loadPage);
  await loadPage();
}

// [activities] -> [{ monday, activities: [...] }, ...], keeping the order.
function groupByWeek(activities) {
  const weeks = [];
  for (const activity of activities) {
    const monday = startOfWeek(activity.activity_date);
    let week = weeks[weeks.length - 1];
    if (!week || week.monday !== monday) {
      week = { monday, activities: [] };
      weeks.push(week);
    }
    week.activities.push(activity);
  }
  return weeks;
}

function weekHtml(week) {
  const totalSeconds = week.activities.reduce((sum, a) => sum + (a.duration_s || 0), 0);
  const count = week.activities.length;
  return `
    <section class="week">
      <h2 class="week-title">
        <span>${formatWeekLabel(week.monday)}</span>
        <span class="muted">${count} session${count === 1 ? "" : "s"} · ${formatDuration(totalSeconds)}</span>
      </h2>
      <ul class="activity-list">
        ${week.activities.map(activityHtml).join("")}
      </ul>
    </section>
  `;
}

// One line in the list. Everything you typed goes through escapeHtml.
function activityHtml(a) {
  const sport = getSport(a.sport);
  const type = getSessionType(a.sport, a.session_type);
  const stats = a.match_stats;
  const hasMatchCard = Boolean(type && type.matchCard && stats);

  const details = [
    hasMatchCard ? "" : formatDuration(a.duration_s), // a match shows minutes played instead
    a.distance_km != null ? formatKm(a.distance_km) : "",
    a.elevation_m ? `${a.elevation_m} m D+` : "",
    a.stairs_climbed ? `${a.stairs_climbed} stairs` : "",
    formatSpeed(sport && sport.speed, a.duration_s, a.distance_km),
  ].filter(Boolean).join(" · ");

  const matchLine = hasMatchCard
    ? `<span class="match-line">vs ${escapeHtml(stats.opponent || "?")} · ${stats.goals} G · ${stats.assists} A${stats.minutes_played != null ? ` · ${stats.minutes_played}'` : ""}</span>`
    : "";

  // On a laptop the "col-…" boxes become table columns and the combined
  // line (activity-meta) is hidden; on a phone it's the other way round.
  const distance = [a.distance_km != null ? formatKm(a.distance_km) : "", a.elevation_m ? `${a.elevation_m} m D+` : "",
    a.stairs_climbed ? `${a.stairs_climbed} stairs` : ""].filter(Boolean).join(" · ");
  return `
    <li>
      <a class="activity-item" href="#/log/${encodeURIComponent(a.id)}">
        <span class="activity-icon" aria-hidden="true">${sportIcon(a.sport)}</span>
        <span class="col col-date">${formatDayLabel(a.activity_date)}</span>
        <span class="activity-main">
          <span class="activity-title">${escapeHtml(sessionTypeLabel(a.sport, a.session_type))}</span>
          ${a.title ? `<span class="activity-subtitle">${escapeHtml(a.title)}</span>` : ""}
          <span class="muted activity-meta">${formatDayLabel(a.activity_date)}${details ? " · " + details : ""}</span>
          ${matchLine}
        </span>
        <span class="col">${hasMatchCard ? (stats.minutes_played != null ? `${stats.minutes_played}'` : "") : formatDuration(a.duration_s)}</span>
        <span class="col">${escapeHtml(distance)}</span>
        <span class="col">${formatSpeed(sport && sport.speed, a.duration_s, a.distance_km)}</span>
        <span class="col-rpe">${a.rpe ? `<span class="rpe-chip" title="RPE">${a.rpe}</span>` : ""}</span>
      </a>
    </li>
  `;
}
