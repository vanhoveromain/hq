// Training blocks (opened from the Me tab): periods of training with one focus.
//   #/blocks        -> Current / Upcoming / Past
//   #/blocks/new    -> a new block
//   #/blocks/<id>   -> a block: stats from the log, its races, goal + recap

import {
  listTrainingBlocks, getTrainingBlock, saveTrainingBlock, deleteTrainingBlock, listActivitiesBetween,
} from "../storage.js?v=202610141721";
import { SPORTS, RACE_STATUSES } from "../rules.js?v=202610141721";
import { todayISO, formatDayLabel } from "../utils/dates.js?v=202610141721";
import { escapeHtml, formatDuration } from "../utils/format.js?v=202610141721";
import { showToast } from "../utils/toast.js?v=202610141721";

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
    <a href="#/me" class="back-link">‹ Me</a>
    <a href="#/blocks/new" class="button primary add-button">+ New block</a>
    <div id="block-list"><p class="muted">Loading…</p></div>
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
        ${list.map((b) => blockCardHtml(b, today)).join("")}
      </section>` : "";

    listEl.innerHTML = blocks.length
      ? section("📘 Current", current) + section("🔜 Upcoming", upcoming) + section("📚 Past", past)
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
    <a class="card block-card" href="#/blocks/${encodeURIComponent(block.id)}">
      <strong>${escapeHtml(block.name)}</strong>
      <span class="muted small">${formatDayLabel(block.start_date)} → ${formatDayLabel(block.end_date)}</span>
      ${isCurrent ? `
        <span class="small"><strong>Week ${week.current} / ${week.total}</strong> · ${daysLeft} day${daysLeft === 1 ? "" : "s"} left</span>
        <span class="bar" role="img" aria-label="${percent}% done"><span class="bar-fill" style="width: ${percent}%"></span></span>` : ""}
      ${goal ? `<span class="small block-goal">🎯 ${escapeHtml(goal)}</span>` : ""}
      ${block.races.length ? `<span class="small">🏁 ${block.races.map((r) => escapeHtml(r.name)).join(", ")}</span>` : ""}
      ${needsRecap(block, today) ? `<span class="small block-reminder">✍️ Just ended: write your recap</span>` : ""}
    </a>`;
}


// ---------------------------------------------------------------------
// One block
// ---------------------------------------------------------------------

async function renderBlock(container, blockId) {
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

  const isEdit = Boolean(block);
  const today = todayISO();
  const b = block || { start_date: today };
  const ended = isEdit && block.end_date < today;

  container.innerHTML = `
    <a href="#/blocks" class="back-link">‹ Training blocks</a>
    ${isEdit ? `
      <h2 class="race-title">${escapeHtml(block.name)}</h2>
      <p class="muted race-subtitle">${formatDayLabel(block.start_date)} → ${formatDayLabel(block.end_date)}
        ${block.start_date <= today && !ended ? ` · <strong>week ${blockWeek(block, today).current} / ${blockWeek(block, today).total}</strong>` : ""}</p>
      ${needsRecap(block, today) ? `<p class="plan-banner">✍️ This block just ended: write your recap below while it's fresh. What worked, what didn't?</p>` : ""}
      <section class="card" id="block-stats"><p class="muted">Counting…</p></section>
      ${block.races.length ? `<section class="card"><h2>Races</h2><ul class="routine-list">${block.races
        .sort((x, y) => (x.race_date || "").localeCompare(y.race_date || ""))
        .map((r) => `<li><a href="#/races/${r.id}">${escapeHtml(r.name)}</a>
          <span class="muted small">${r.race_date ? formatDayLabel(r.race_date) : "no date"} · ${RACE_STATUSES[r.status] ? RACE_STATUSES[r.status].label : ""}
          ${r.result_time_s ? ` · ${formatDuration(r.result_time_s)}` : r.goal_time_s ? ` · goal ${formatDuration(r.goal_time_s)}` : ""}</span></li>`).join("")}
        </ul></section>` : ""}` : ""}

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
        <a href="#/blocks" class="button">Cancel</a>
        ${isEdit ? `<button type="button" id="delete" class="button danger">Delete</button>` : ""}
      </div>
    </form>
  `;

  const form = container.querySelector("#block-form");
  const status = form.querySelector("#block-status");
  form.addEventListener("input", () => {
    if (status.classList.contains("error")) showStatus(status, "", "");
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
      showToast("✅ Block saved");
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

  if (isEdit) drawStats(container.querySelector("#block-stats"), block, today);
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}


// ---------- Stats from the log ----------

async function drawStats(el, block, today) {
  if (block.start_date > today) {
    el.innerHTML = `<h2>Stats</h2><p class="muted">The block hasn't started yet.</p>`;
    return;
  }
  // A current block is counted up to today.
  const until = block.end_date < today ? block.end_date : today;
  let activities = [];
  try {
    activities = await listActivitiesBetween(block.start_date, until);
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
    <h2>Stats ${block.end_date >= today ? `<span class="muted small">so far</span>` : ""}</h2>
    ${activities.length ? `
      <div class="stat-grid">
        <div><strong>${activities.length}</strong><span class="muted small">sessions · ${round1(activities.length / weeks)}/week</span></div>
        <div><strong>${round1(runKm)} km</strong><span class="muted small">running · ${round1(runKm / weeks)}/week</span></div>
        <div><strong>${elevation.toLocaleString("en-GB")} m</strong><span class="muted small">D+</span></div>
        <div><strong>${formatDuration(seconds) || "0:00"}</strong><span class="muted small">total time</span></div>
      </div>
      <p class="small">${perSport.map((x) => `${x.sport.icon} ${escapeHtml(x.sport.label)} ${x.count}`).join(" · ")}</p>
      ${activities.some((a) => a.duration_s == null) ? `<p class="hint">Some sessions have no duration (e.g. imported football), so total time is a minimum.</p>` : ""}`
    : `<p class="muted">Nothing logged in this period.</p>`}
  `;
}
