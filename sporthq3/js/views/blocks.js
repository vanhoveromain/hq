// Training blocks (opened from the Me tab): periods of training with one focus.
//   #/blocks        -> Current / Upcoming / Past
//   #/blocks/new    -> a new block
//   #/blocks/<id>   -> a block: stats from the log, its races, goal + recap

import {
  listTrainingBlocks, getTrainingBlock, saveTrainingBlock, deleteTrainingBlock, listActivitiesBetween,
  listWeekReviews,
} from "../storage.js?v=202610252302";
import { SPORTS, RACE_STATUSES, sportIcon } from "../rules.js?v=202610252302";
import { todayISO, formatDayLabel, startOfWeek, formatWeekLabel } from "../utils/dates.js?v=202610252302";
import { escapeHtml, formatDuration, formatHours, numHtml } from "../utils/format.js?v=202610252302";
import { showToast } from "../utils/toast.js?v=202610252302";
import { icon } from "../utils/icons.js?v=202610252302";
import { setTopbarAction, clearTopbarAction, addSummaryEditButton, setPageTitle } from "../utils/topbar.js?v=202610252302";

export function render(container, { params = [] } = {}) {
  if (params[0] === "new") return renderBlock(container, null);
  if (params[0]) return renderBlock(container, params[0]);
  renderList(container);
}

const DAY = 86400000;
const daysBetween = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

// A block that ended less than 2 weeks ago and has no recap yet: remind
// (older blocks: no reminder, you won't go back to them).
const RECAP_REMINDER_DAYS = 14;
function needsRecap(block, today) {
  return block.end_date < today && !block.recap && daysBetween(block.end_date, today) <= RECAP_REMINDER_DAYS;
}

// "week 9 / 20" (weeks counted from the block's first day).
export function blockWeek(block, date) {
  const total = Math.ceil((daysBetween(block.start_date, block.end_date) + 1) / 7);
  const current = Math.min(total, Math.floor(daysBetween(block.start_date, date) / 7) + 1);
  return { current, total };
}


// ---------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------

async function renderList(container) {
  container.innerHTML = `
    <div class="wide-page">
    <a href="#/blocks/new" class="button primary add-button" aria-label="New block"><span class="add-plus" aria-hidden="true">+</span> <span class="add-text">New block</span></a>
    <div id="block-list"><p class="muted">Loading…</p></div>
    </div>
  `;
  const listEl = container.querySelector("#block-list");
  try {
    const blocks = await listTrainingBlocks();
    const today = todayISO();
    const current = blocks.filter((b) => b.start_date <= today && b.end_date >= today);
    const upcoming = blocks.filter((b) => b.start_date > today).reverse(); // soonest first
    const past = blocks.filter((b) => b.end_date < today);
    const section = (title, list) => list.length ? `
      <section class="week">
        <h2 class="week-title"><span>${title}</span><span class="muted">${list.length}</span></h2>
        <div class="card-grid">${list.map((b) => blockCardHtml(b, today)).join("")}</div>
      </section>` : "";

    listEl.innerHTML = blocks.length
      ? section(`${icon("book-open")} Current`, current) + section(`${icon("clock")} Upcoming`, upcoming) + section(`${icon("library")} Past`, past)
      : `<section class="card placeholder"><p>No training blocks yet. Tap <strong>+ New block</strong>.</p></section>`;
  } catch (error) {
    listEl.innerHTML = `<p class="status error"></p>`;
    listEl.querySelector(".status").textContent = "Could not load the blocks: " + error.message;
  }
}

function blockCardHtml(block, today) {
  const isCurrent = block.start_date <= today && block.end_date >= today;
  const week = isCurrent ? blockWeek(block, today) : null;
  const percent = isCurrent
    ? Math.round((daysBetween(block.start_date, today) / Math.max(1, daysBetween(block.start_date, block.end_date))) * 100)
    : 0;
  const daysLeft = isCurrent ? daysBetween(today, block.end_date) : 0;
  const goal = (block.goal || "").split("\n")[0];
  return `
    <a class="card block-card ${isCurrent ? "is-current" : ""}" href="#/blocks/${encodeURIComponent(block.id)}">
      <strong>${escapeHtml(block.name)}</strong>
      <span class="muted small">${formatDayLabel(block.start_date)} → ${formatDayLabel(block.end_date)}</span>
      ${isCurrent ? `
        <span class="small">Week ${numHtml(week.current)}<span class="unit"> / ${week.total}</span> · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left</span>
        <span class="bar" role="img" aria-label="${percent}% done"><span class="bar-fill" style="width: ${percent}%"></span></span>` : ""}
      ${goal ? `<span class="small block-goal">${icon("target")} ${escapeHtml(goal)}</span>` : ""}
      ${block.races.length ? `<span class="small">${icon("flag")} ${block.races.map((r) => escapeHtml(r.name)).join(", ")}</span>` : ""}
      ${needsRecap(block, today) ? `<span class="small block-reminder">${icon("square-pen")} Just ended: write your recap</span>` : ""}
    </a>`;
}


// ---------------------------------------------------------------------
// One block
// ---------------------------------------------------------------------

// Step 20d: a summary first (pill, name, dates, one segment per week, goal,
// stats, races, week notes); the form only behind "Edit" in the top bar.
// A new block opens straight on the form. `edit` = show the form.
async function renderBlock(container, blockId, { edit = false } = {}) {
  container.innerHTML = `<p class="muted">Loading…</p>`;
  let block = null;
  let allBlocks = [];
  try {
    [block, allBlocks] = await Promise.all([blockId ? getTrainingBlock(blockId) : null, listTrainingBlocks()]);
  } catch (error) {
    container.innerHTML = `<p class="status error"></p>`;
    container.querySelector(".status").textContent = "Could not load: " + error.message;
    return;
  }
  if (blockId && !block) {
    container.innerHTML = `<section class="card placeholder"><p>This block doesn't exist (any more).</p>
      <a class="button" href="#/blocks">Back to blocks</a></section>`;
    return;
  }

  const today = todayISO();
  const isEdit = Boolean(block);
  // The block's own name in the top bar (30d), if you're still on a block page.
  if (window.location.hash.startsWith("#/blocks/")) setPageTitle(block ? block.name : "New block");
  if (isEdit && !edit) {
    const startEditing = () => renderBlock(container, block.id, { edit: true });
    // Phone: "Edit" in the top bar. Laptop: in the summary card's corner (29b).
    setTopbarAction({ text: "Edit", label: "Edit this block", onClick: startEditing, phoneOnly: true });
    container.innerHTML = `
      <div class="block-page">
        ${blockSummaryHtml(block, today)}
        <section class="card" id="block-stats"><p class="muted">Counting…</p></section>
        ${blockRacesHtml(block, today)}
        <div id="block-notes"></div>
      </div>`;
    addSummaryEditButton(container, "Edit this block", startEditing);
    const recapButton = container.querySelector("#write-recap");
    if (recapButton) recapButton.addEventListener("click", () => renderBlock(container, block.id, { edit: true }));
    drawStats(container.querySelector("#block-stats"), container.querySelector("#block-notes"), block, today);
    return;
  }
  clearTopbarAction();
  drawBlockForm(container, block, allBlocks, today);
}

// The summary card: Current / Upcoming / Past, name, dates, weeks, goal, recap.
function blockSummaryHtml(block, today) {
  const isCurrent = block.start_date <= today && block.end_date >= today;
  const isPast = block.end_date < today;
  const week = blockWeek(block, isCurrent ? today : block.end_date);
  const total = week.total;
  const segments = Array.from({ length: total }, (_, i) => {
    const n = i + 1;
    const state = isPast || (isCurrent && n < week.current) ? "is-done" : isCurrent && n === week.current ? "is-now" : "";
    return `<span class="${state}"></span>`;
  }).join("");
  let weeksLine = "";
  if (isCurrent) {
    const left = total - week.current;
    weeksLine = `<span>Week ${numHtml(week.current)} of ${total}</span>
      <span class="muted">${left ? `${left} week${left === 1 ? "" : "s"} left` : "last week"}</span>`;
  } else if (isPast) {
    weeksLine = `<span>${numHtml(total)} <span class="unit">weeks</span></span><span class="muted">ended</span>`;
  } else {
    const days = daysBetween(today, block.start_date);
    weeksLine = `<span>${numHtml(total)} <span class="unit">weeks</span></span>
      <span class="muted">starts in ${days} day${days === 1 ? "" : "s"}</span>`;
  }
  const pill = isCurrent ? `<span class="race-pill is-accent">Current</span>`
    : isPast ? `<span class="race-pill">Past</span>` : `<span class="race-pill">Upcoming</span>`;
  return `
    <section class="card race-sum block-sum">
      <p class="race-sum-meta">${pill}<span>${formatDayLabel(block.start_date)} → ${formatDayLabel(block.end_date)}</span></p>
      <h2 class="race-sum-name">${escapeHtml(block.name)}</h2>
      <div class="race-sum-bar"><p>${weeksLine}</p><span class="week-segments" aria-hidden="true">${segments}</span></div>
      ${block.goal ? `<div class="race-sum-box"><span class="race-sum-label-top">Goal</span><p class="pre-line">${escapeHtml(block.goal)}</p></div>` : ""}
      ${block.recap ? `<div class="race-sum-box"><span class="race-sum-label-top">Recap</span><p class="pre-line">${escapeHtml(block.recap)}</p></div>` : ""}
      ${needsRecap(block, today) ? `<p class="plan-banner">${icon("square-pen")} This block just ended: write your recap while it's fresh. What worked, what didn't?</p>
        <button type="button" class="button primary" id="write-recap">Write the recap</button>` : ""}
    </section>`;
}

// The block's races as rows (tap = the race).
function blockRacesHtml(block, today) {
  if (!block.races.length) return "";
  const rows = [...block.races]
    .sort((x, y) => (x.race_date || "").localeCompare(y.race_date || ""))
    .map((r) => {
      const days = r.race_date && r.race_date >= today ? daysBetween(today, r.race_date) : null;
      const detail = [r.race_date ? formatDayLabel(r.race_date) : "no date",
        RACE_STATUSES[r.status] ? RACE_STATUSES[r.status].label : "",
        r.result_time_s ? formatDuration(r.result_time_s) : r.goal_time_s ? `goal ${formatDuration(r.goal_time_s)}` : ""].filter(Boolean).join(" · ");
      return `<a class="race-run" href="#/races/${r.id}">
        <span class="list-badge">${icon("flag")}</span>
        <span class="race-run-text"><strong>${escapeHtml(r.name)}</strong><span class="muted small">${escapeHtml(detail)}</span></span>
        ${days !== null ? `<span class="list-days">${numHtml(days, "d")}</span>` : icon("chevron-right", { className: "is-muted" })}
      </a>`;
    }).join("");
  return `<h3 class="section-label">${block.races.length === 1 ? "Race" : "Races"}</h3><section class="card race-runs">${rows}</section>`;
}

function drawBlockForm(container, block, allBlocks, today) {
  const isEdit = Boolean(block);
  const b = block || { start_date: today };
  container.innerHTML = `
    <form id="block-form" class="card form" novalidate>
      <h2>${isEdit ? "Block details" : "New block"}</h2>

      <label for="b-name">Name</label>
      <input id="b-name" name="name" type="text" required autocomplete="off" placeholder="e.g. Half marathon prep"
             value="${escapeHtml(b.name || "")}">

      <div class="field-row">
        <div>
          <label for="b-start">Start</label>
          <input id="b-start" name="start_date" type="date" required value="${escapeHtml(b.start_date || "")}">
        </div>
        <div>
          <label for="b-end">End</label>
          <input id="b-end" name="end_date" type="date" required value="${escapeHtml(b.end_date || "")}">
        </div>
      </div>

      <label for="b-goal">Goal / focus</label>
      <textarea id="b-goal" name="goal" rows="4">${escapeHtml(b.goal || "")}</textarea>

      <label for="b-recap">Recap <span class="muted">(at the end of the block)</span></label>
      <textarea id="b-recap" name="recap" rows="4">${escapeHtml(b.recap || "")}</textarea>

      <p id="block-status" class="status" role="status"></p>
      <div class="form-actions">
        <button type="submit" class="button primary">${isEdit ? "Save changes" : "Save block"}</button>
        <button type="button" class="button" id="cancel">Cancel</button>
        ${isEdit ? `<button type="button" id="delete" class="button danger">Delete</button>` : ""}
      </div>
    </form>
  `;

  const form = container.querySelector("#block-form");
  const status = form.querySelector("#block-status");
  form.addEventListener("input", () => {
    if (status.classList.contains("error")) showStatus(status, "", "");
  });
  form.querySelector("#cancel").addEventListener("click", () => {
    if (isEdit) renderBlock(container, block.id);
    else window.location.hash = "#/blocks";
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const values = {
      name: form.elements.name.value.trim(),
      start_date: form.elements.start_date.value,
      end_date: form.elements.end_date.value,
      goal: form.elements.goal.value.trim() || null,
      recap: form.elements.recap.value.trim() || null,
    };
    if (!values.name) return showStatus(status, "Please give the block a name.", "error");
    if (!values.start_date || !values.end_date) return showStatus(status, "A block needs a start and an end date.", "error");
    if (values.end_date < values.start_date) return showStatus(status, "The end is before the start.", "error");

    // Overlapping another block: warn, but let you save.
    const overlap = allBlocks.find((other) => (!isEdit || other.id !== block.id)
      && other.start_date <= values.end_date && other.end_date >= values.start_date);
    if (overlap && !window.confirm(`These dates overlap with "${overlap.name}" (${formatDayLabel(overlap.start_date)} → ${formatDayLabel(overlap.end_date)}). Save anyway?`)) return;

    if (isEdit) values.id = block.id;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus(status, "Saving…", "");
    try {
      const saved = await saveTrainingBlock(values);
      showToast("Block saved");
      if (isEdit) renderBlock(container, block.id);
      else window.location.hash = `#/blocks/${saved.id}`;
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
      button.disabled = false;
    }
  });

  const deleteButton = form.querySelector("#delete");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Delete this block? Its races stay, they just won't be linked to a block any more.")) return;
      try {
        await deleteTrainingBlock(block.id);
        window.location.hash = "#/blocks";
      } catch (error) {
        showStatus(status, "Could not delete: " + error.message, "error");
      }
    });
  }
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}


// ---------- Stats from the log ----------

async function drawStats(el, notesEl, block, today) {
  if (block.start_date > today) {
    el.innerHTML = `<h3 class="section-label">Stats</h3><p class="muted">The block hasn't started yet.</p>`;
    return;
  }
  // A current block is counted up to today.
  const until = block.end_date < today ? block.end_date : today;
  let activities = [];
  let reviews = [];
  try {
    [activities, reviews] = await Promise.all([
      listActivitiesBetween(block.start_date, until),
      // Your weekly review notes help write the recap (none before the 16g migration).
      listWeekReviews(startOfWeek(block.start_date), startOfWeek(block.end_date)).catch(() => []),
    ]);
  } catch (error) {
    el.innerHTML = `<p class="status error"></p>`;
    el.querySelector(".status").textContent = "Could not count: " + error.message;
    return;
  }

  const weeks = Math.max(1, (daysBetween(block.start_date, until) + 1) / 7);
  const runs = activities.filter((a) => a.sport === "running");
  const runKm = runs.reduce((sum, a) => sum + Number(a.distance_km || 0), 0);
  const elevation = activities.reduce((sum, a) => sum + Number(a.elevation_m || 0), 0);
  const seconds = activities.reduce((sum, a) => sum + Number(a.duration_s || 0), 0);
  const perSport = SPORTS
    .map((sport) => ({ sport, count: activities.filter((a) => a.sport === sport.key).length }))
    .filter((x) => x.count);
  const round1 = (n) => n.toLocaleString("en-GB", { maximumFractionDigits: 1 });

  el.innerHTML = `
    <h3 class="section-label">${block.end_date >= today ? "So far" : "Stats"}</h3>
    ${activities.length ? `
      <div class="stat-grid">
        <div><strong>${numHtml(activities.length)}</strong><span class="muted small">sessions · ${round1(activities.length / weeks)} a week</span></div>
        <div><strong>${numHtml(round1(runKm), "km")}</strong><span class="muted small">running · ${round1(runKm / weeks)} a week</span></div>
        <div><strong>${numHtml(elevation.toLocaleString("en-GB"), "m")}</strong><span class="muted small">D+</span></div>
        <div><strong>${numHtml(formatHours(seconds))}</strong><span class="muted small">total time</span></div>
      </div>
      ${sportMixHtml(perSport, activities.length)}
      ${activities.some((a) => a.duration_s == null) ? `<p class="hint">Some sessions have no duration (e.g. imported football), so total time is a minimum.</p>` : ""}`
    : `<p class="muted">Nothing logged in this period.</p>`}
  `;
  notesEl.innerHTML = reviewsHtml(reviews);
}

// Sessions per sport as ONE bar in the sport colours + a small legend (20d),
// instead of a long sentence.
function sportMixHtml(perSport, total) {
  if (!perSport.length) return "";
  return `
    <div class="mix-bar" role="img" aria-label="${escapeHtml(perSport.map((x) => `${x.sport.label} ${x.count}`).join(", "))}">
      ${perSport.map((x) => `<span class="sport-${x.sport.key}" style="width: ${(x.count / total) * 100}%"></span>`).join("")}
    </div>
    <ul class="mix-legend">${perSport.map((x) => `
      <li class="sport-${x.sport.key}"><span class="mix-dot"></span>${escapeHtml(x.sport.label)} ${numHtml(x.count)}</li>`).join("")}</ul>`;
}

// The weekly review notes of the block (helps to write the recap), as rows.
function reviewsHtml(reviews) {
  const withNotes = reviews.filter((r) => r.review_notes);
  if (!withNotes.length) return "";
  return `
    <h3 class="section-label">Your week notes</h3>
    <section class="card race-runs">${withNotes.map((r) => `
      <a class="race-run block-note" href="#/review/${r.week_start}">
        <span class="race-run-text"><span class="small note-week">${escapeHtml(formatWeekLabel(r.week_start))}</span>
          <span class="pre-line">${escapeHtml(r.review_notes)}</span></span>
        ${icon("chevron-right", { className: "is-muted" })}
      </a>`).join("")}</section>`;
}
