// Log screen: the list of activities, newest first, grouped by week.
//   #/log          -> the list
//   #/log/stats    -> all the stats (see stats.js)
//   #/log/new      -> empty form (see logForm.js)
//   #/log/<id>     -> form to edit that activity

import { listActivities } from "../storage.js?v=202610231428";
import { SPORTS, sportIcon, sessionTypeLabel, getSport, getSessionType } from "../rules.js?v=202610231428";
import { startOfWeek, formatDayLabel, formatWeekLabel } from "../utils/dates.js?v=202610231428";
import { formatDuration, formatHours, formatKm, formatSpeed, escapeHtml, numHtml, rpeLevel } from "../utils/format.js?v=202610231428";
import { sportBadge } from "../utils/plan.js?v=202610231428";
import * as logForm from "./logForm.js?v=202610231428";
import * as statsView from "./stats.js?v=202610231428";

const PAGE_SIZE = 30;
const SPORT_FILTER_KEY = "sporthq3.logSport"; // the sport picked on this device ("all" or a sport key)

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
    <!-- Phone: button above the sport chips. Laptop: chips left, button right, one line. -->
    <div class="log-toolbar">
      <a href="#/log/new" class="button primary add-button">+ Add activity</a>
      <div class="chip-row log-filters" id="sport-chips" aria-label="Filter by sport"></div>
    </div>
    <div id="activity-list"><p class="muted">Loading…</p></div>
    <button id="load-more" class="button load-more" hidden>Load more</button>
    <p id="list-status" class="status" role="status"></p>
    </div>
  `;
  const listEl = container.querySelector("#activity-list");
  const moreButton = container.querySelector("#load-more");
  const status = container.querySelector("#list-status");

  const chips = container.querySelector("#sport-chips");

  let sport = readSportFilter();
  let activities = []; // everything loaded so far (for the chosen sport)

  function drawChips() {
    chips.innerHTML =
      `<button type="button" class="chip-button" data-sport="all" aria-pressed="${sport === "all"}">All sports</button>` +
      SPORTS.map((s) => `<button type="button" class="chip-button" data-sport="${s.key}" aria-pressed="${s.key === sport}">${sportIcon(s.key)} ${escapeHtml(s.label)}</button>`).join("");
  }

  async function loadPage() {
    moreButton.disabled = true;
    const sportAsked = sport;
    try {
      const page = await listActivities({ limit: PAGE_SIZE, offset: activities.length, sport: sportAsked });
      // Another chip was tapped while this page was loading: drop this stale answer.
      if (sportAsked !== sport) return;
      activities = activities.concat(page);
      listEl.innerHTML = activities.length
        ? groupByWeek(activities).map(weekHtml).join("")
        : emptyHtml(sport);
      // A full page means there may be more; a short page means we reached the end.
      moreButton.hidden = page.length < PAGE_SIZE;
    } catch (error) {
      status.textContent = "Could not load activities: " + error.message;
      status.className = "status error";
    }
    moreButton.disabled = false;
  }

  chips.addEventListener("click", (event) => {
    const chip = event.target.closest("[data-sport]");
    if (!chip || chip.dataset.sport === sport) return;
    sport = chip.dataset.sport;
    saveSportFilter(sport);
    drawChips();
    // Start again from the top for the new sport
    activities = [];
    moreButton.hidden = true;
    status.textContent = "";
    listEl.innerHTML = `<p class="muted">Loading…</p>`;
    loadPage();
  });

  moreButton.addEventListener("click", loadPage);
  drawChips();
  await loadPage();
}

function emptyHtml(sport) {
  if (sport === "all") {
    return `<section class="card placeholder"><p>No activities yet. Tap <strong>+ Add activity</strong> to log your first one.</p></section>`;
  }
  return `<section class="card placeholder"><p>No ${escapeHtml(getSport(sport).label.toLowerCase())} sessions logged yet.</p></section>`;
}

// The remembered sport, if it still exists (a sport could be renamed or removed in rules.js).
function readSportFilter() {
  try {
    const saved = localStorage.getItem(SPORT_FILTER_KEY);
    if (saved && (saved === "all" || getSport(saved))) return saved;
  } catch { /* private window: no memory, that's fine */ }
  return "all";
}
function saveSportFilter(sport) {
  try { localStorage.setItem(SPORT_FILTER_KEY, sport); } catch { /* not important */ }
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
        <span class="muted">${count} session${count === 1 ? "" : "s"}${totalSeconds ? " · " + formatHours(totalSeconds) : ""}</span>
      </h2>
      <ul class="activity-list">
        <!-- Column titles: only shown on a laptop, where each line becomes a table row -->
        <li class="log-head" aria-hidden="true">
          <span></span><span>Date</span><span>Session</span><span>Time</span><span>Distance</span><span>Pace</span><span>RPE</span>
        </li>
        ${week.activities.map(activityHtml).join("")}
      </ul>
    </section>
  `;
}

// One line in the list. Everything you typed goes through escapeHtml.
// Phone: title, date, then a row of numbers (step 17b: value big in the stat
// font, unit small). Laptop: the "col-…" boxes become table columns instead.
function activityHtml(a) {
  const sport = getSport(a.sport);
  const type = getSessionType(a.sport, a.session_type);
  const stats = a.match_stats;
  const hasMatchCard = Boolean(type && type.matchCard && stats);
  const speed = formatSpeed(sport && sport.speed, a.duration_s, a.distance_km);

  // The numbers of the row, in reading order. A match shows its match card
  // (minutes played, goals, assists) instead of the duration.
  const cells = hasMatchCard
    ? [
      stats.minutes_played != null ? numHtml(stats.minutes_played + "′", "played") : "",
      numHtml(stats.goals, stats.goals === 1 ? "goal" : "goals"),
      numHtml(stats.assists, stats.assists === 1 ? "assist" : "assists"),
    ]
    : [
      a.distance_km != null ? numHtml(formatKm(a.distance_km)) : "",
      a.duration_s ? numHtml(formatDuration(a.duration_s)) : "",
      speed ? numHtml(speed) : "",
      a.elevation_m ? numHtml(a.elevation_m, "m D+") : "",
      a.stairs_climbed ? numHtml(a.stairs_climbed, "stairs") : "",
    ];
  const statRow = cells.filter(Boolean).map((cell) => `<span class="stat">${cell}</span>`).join("");

  const matchLine = hasMatchCard ? `<span class="match-line">vs ${escapeHtml(stats.opponent || "?")}</span>` : "";

  // A match title like "vs RC Mons" says the same as the match line: show it once.
  const opponent = hasMatchCard && stats.opponent ? stats.opponent.toLowerCase() : "";
  // Same for a title equal to the session type ("Team training" twice) (23e).
  const typeLabel = sessionTypeLabel(a.sport, a.session_type);
  const sameAsType = a.title && a.title.trim().toLowerCase() === typeLabel.toLowerCase();
  const showTitle = a.title && !sameAsType && !(opponent && a.title.toLowerCase().includes(opponent));

  // Laptop columns (hidden on a phone, where activity-meta shows instead).
  const distance = [a.distance_km != null ? numHtml(formatKm(a.distance_km)) : "", a.elevation_m ? numHtml(a.elevation_m, "m D+") : "",
    a.stairs_climbed ? numHtml(a.stairs_climbed, "stairs") : ""].filter(Boolean).join(" · ");
  const time = hasMatchCard
    ? (stats.minutes_played != null ? numHtml(stats.minutes_played + "′") : "")
    : (a.duration_s ? numHtml(formatDuration(a.duration_s)) : "");
  return `
    <li>
      <a class="activity-item" href="#/log/${encodeURIComponent(a.id)}">
        ${sportBadge(a.sport, sportIcon)}
        <span class="col col-date">${formatDayLabel(a.activity_date)}</span>
        <span class="activity-main">
          <span class="activity-title">${escapeHtml(typeLabel)}</span>
          ${showTitle ? `<span class="activity-subtitle">${escapeHtml(a.title)}</span>` : ""}
          ${matchLine}
          <span class="muted activity-meta activity-date">${formatDayLabel(a.activity_date)}</span>
          ${statRow ? `<span class="activity-meta stat-row">${statRow}</span>` : ""}
        </span>
        <span class="col">${time}</span>
        <span class="col">${distance}</span>
        <span class="col">${speed ? numHtml(speed) : ""}</span>
        <span class="col-rpe">${a.rpe ? `<span class="rpe-chip rpe-${rpeLevel(a.rpe)}" title="RPE ${a.rpe}">${a.rpe}</span>` : ""}</span>
      </a>
    </li>
  `;
}
