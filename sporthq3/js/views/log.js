// Log screen: the list of activities, newest first, grouped by week.
//   #/log          -> the list
//   #/log/new      -> empty form (see logForm.js)
//   #/log/<id>     -> form to edit that activity

import { listActivities } from "../storage.js?v=202610141655";
import { sportIcon, sessionTypeLabel, getSport, getSessionType } from "../rules.js?v=202610141655";
import { startOfWeek, formatDayLabel, formatWeekLabel } from "../utils/dates.js?v=202610141655";
import { formatDuration, formatKm, formatSpeed, escapeHtml } from "../utils/format.js?v=202610141655";
import * as logForm from "./logForm.js?v=202610141655";

const PAGE_SIZE = 30;

export function render(container, { params = [] } = {}) {
  // #/log/new/<plannedId> = "Log it now" from the planner: pre-filled + linked
  if (params[0] === "new") return logForm.render(container, { activityId: null, plannedId: params[1] || null });
  if (params[0]) return logForm.render(container, { activityId: params[0] });
  renderList(container);
}

async function renderList(container) {
  container.innerHTML = `
    <a href="#/log/new" class="button primary add-button">+ Add activity</a>
    <div id="activity-list"><p class="muted">Loading…</p></div>
    <button id="load-more" class="button load-more" hidden>Load more</button>
    <p id="list-status" class="status" role="status"></p>
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

  return `
    <li>
      <a class="activity-item" href="#/log/${encodeURIComponent(a.id)}">
        <span class="activity-icon" aria-hidden="true">${sportIcon(a.sport)}</span>
        <span class="activity-main">
          <span class="activity-title">${escapeHtml(sessionTypeLabel(a.sport, a.session_type))}</span>
          ${a.title ? `<span class="activity-subtitle">${escapeHtml(a.title)}</span>` : ""}
          <span class="muted">${formatDayLabel(a.activity_date)}${details ? " · " + details : ""}</span>
          ${matchLine}
        </span>
        ${a.rpe ? `<span class="rpe-chip" title="RPE">${a.rpe}</span>` : ""}
      </a>
    </li>
  `;
}
