// Races tab.
//   #/races        -> Upcoming / Ideas / Past
//   #/races/new    -> a new race
//   #/races/<id>   -> a race: details, checklist, race routine

import {
  listRaces, getRace, saveRace, deleteRace, listTrainingBlocks, listRaceSessions,
  addChecklistItems, updateChecklistItem, deleteChecklistItem, findLastChecklist,
} from "../storage.js?v=202610141529";
import { RACE_STATUSES, STARTER_CHECKLIST, RACE_ROUTINE } from "../rules.js?v=202610141529";
import { todayISO, formatDayLabel, startOfWeek } from "../utils/dates.js?v=202610141529";
import { escapeHtml, formatDuration, parseDuration, formatSpeed } from "../utils/format.js?v=202610141529";
import { addRaceRoutine, moveRaceRoutine, removeRaceRoutine } from "../utils/raceRoutine.js?v=202610141529";
import { showToast } from "../utils/toast.js?v=202610141529";

export function render(container, { params = [] } = {}) {
  if (params[0] === "new") return renderRace(container, null);
  if (params[0]) return renderRace(container, params[0]);
  renderList(container);
}


// ---------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------

// Which group a race goes in:
//   upcoming = a date from today on, and "to register" or "registered"
//   past     = finished, cancelled, or a date before today
//   ideas    = everything else (no date yet, or an idea / potential race)
function groupOf(race, today) {
  if (race.status === "finished" || race.status === "cancelled") return "past";
  if (race.race_date && race.race_date < today) return "past";
  if (race.race_date && (race.status === "to_register" || race.status === "registered")) return "upcoming";
  return "ideas";
}

async function renderList(container) {
  container.innerHTML = `
    <a href="#/races/new" class="button primary add-button">+ Add a race</a>
    <div id="race-list"><p class="muted">Loading…</p></div>
  `;
  const listEl = container.querySelector("#race-list");
  try {
    const races = await listRaces();
    const today = todayISO();
    const upcoming = races.filter((r) => groupOf(r, today) === "upcoming")
      .sort((a, b) => a.race_date.localeCompare(b.race_date));
    const ideas = races.filter((r) => groupOf(r, today) === "ideas")
      .sort((a, b) => (a.race_date || "9999").localeCompare(b.race_date || "9999") || a.name.localeCompare(b.name));
    const past = races.filter((r) => groupOf(r, today) === "past")
      .sort((a, b) => (b.race_date || "").localeCompare(a.race_date || ""));

    listEl.innerHTML = `
      <section class="week">
        <h2 class="week-title"><span>🏁 Upcoming</span><span class="muted">${upcoming.length}</span></h2>
        ${upcoming.length ? upcoming.map((r) => raceCardHtml(r, today)).join("")
          : `<p class="muted">No race booked. Set a race to "To register" or "Registered" (with a date) to see it here.</p>`}
      </section>
      ${ideas.length ? `
        <section class="week">
          <h2 class="week-title"><span>💡 Ideas</span><span class="muted">${ideas.length}</span></h2>
          ${ideas.map((r) => raceCardHtml(r, today)).join("")}
        </section>` : ""}
      ${past.length ? `
        <details class="retired" open>
          <summary>Past races (${past.length})</summary>
          ${past.map((r) => raceCardHtml(r, today)).join("")}
        </details>` : ""}
    `;
  } catch (error) {
    listEl.innerHTML = `<p class="status error"></p>`;
    listEl.querySelector(".status").textContent = "Could not load races: " + error.message;
  }
}

// "in 23 days", "tomorrow", "today!"
function countdown(raceDate, today) {
  const days = Math.round((Date.parse(raceDate) - Date.parse(today)) / 86400000);
  if (days === 0) return "Today!";
  if (days === 1) return "Tomorrow";
  return `in ${days} days`;
}

function raceCardHtml(race, today) {
  const status = RACE_STATUSES[race.status];
  const facts = [
    race.distance_km ? `${Number(race.distance_km)} km` : "",
    race.elevation_m ? `${race.elevation_m} m D+` : "",
    race.location || "",
  ].filter(Boolean).join(" · ");
  const time = race.result_time_s
    ? `Result ${formatDuration(race.result_time_s)}${paceText(race.result_time_s, race.distance_km)}`
    : race.goal_time_s ? `Goal ${formatDuration(race.goal_time_s)}${paceText(race.goal_time_s, race.distance_km)}` : "";
  const upcoming = race.race_date && race.race_date >= today && race.status !== "finished" && race.status !== "cancelled";
  return `
    <a class="card race-card status-${escapeHtml(race.status)}" href="#/races/${encodeURIComponent(race.id)}">
      <span class="race-top">
        <strong>${escapeHtml(race.name)}</strong>
        ${status ? `<span class="chip">${status.label}</span>` : ""}
      </span>
      <span class="muted small">${race.race_date ? formatDayLabel(race.race_date) : "No date yet"}${upcoming ? ` · <strong class="countdown">${countdown(race.race_date, today)}</strong>` : ""}</span>
      ${facts ? `<span class="small">${escapeHtml(facts)}</span>` : ""}
      ${time ? `<span class="small">${escapeHtml(time)}</span>` : ""}
    </a>`;
}

// " (4:36 /km)" or "" when we can't compute it.
function paceText(seconds, km) {
  const pace = formatSpeed("per_km", seconds, Number(km));
  return pace ? ` (${pace})` : "";
}


// ---------------------------------------------------------------------
// One race: details form + checklist + race routine
// ---------------------------------------------------------------------

async function renderRace(container, raceId) {
  container.innerHTML = `<p class="muted">Loading…</p>`;
  let race = null;
  let blocks = [];
  try {
    [race, blocks] = await Promise.all([raceId ? getRace(raceId) : null, listTrainingBlocks()]);
  } catch (error) {
    container.innerHTML = `<p class="status error"></p>`;
    container.querySelector(".status").textContent = "Could not load: " + error.message;
    return;
  }
  if (raceId && !race) {
    container.innerHTML = `<section class="card placeholder"><p>This race doesn't exist (any more).</p>
      <a class="button" href="#/races">Back to races</a></section>`;
    return;
  }

  const isEdit = Boolean(race);
  const r = race || { status: "registered" };
  container.innerHTML = `
    <a href="#/races" class="back-link">‹ Races</a>
    ${isEdit ? `
      <h2 class="race-title">${escapeHtml(race.name)}</h2>
      <p class="muted race-subtitle">${race.race_date ? escapeHtml(formatDayLabel(race.race_date)) : "No date yet"}
        ${race.race_date && race.race_date >= todayISO() && race.status !== "finished" && race.status !== "cancelled"
          ? ` · <strong class="countdown">${countdown(race.race_date, todayISO())}</strong>` : ""}</p>
      <section class="card" id="routine"><p class="muted">Loading…</p></section>
      <section class="card" id="checklist"></section>` : ""}
    <form id="race-form" class="card form" novalidate>
      <h2>${isEdit ? "Race details" : "New race"}</h2>

      <label for="r-name">Name</label>
      <input id="r-name" name="name" type="text" required autocomplete="off" placeholder="e.g. 20 km de Bruxelles"
             value="${escapeHtml(r.name || "")}">

      <label for="r-date">Date <span class="muted">(empty = just an idea)</span></label>
      <input id="r-date" name="race_date" type="date" value="${escapeHtml(r.race_date || "")}">

      <label for="r-status">Status</label>
      <select id="r-status" name="status">
        ${Object.entries(RACE_STATUSES).map(([key, s]) =>
          `<option value="${key}" ${r.status === key ? "selected" : ""}>${s.label}</option>`).join("")}
      </select>

      <label for="r-location">Location</label>
      <input id="r-location" name="location" type="text" autocomplete="off" value="${escapeHtml(r.location || "")}">

      <div class="field-row">
        <div>
          <label for="r-distance">Distance (km)</label>
          <input id="r-distance" name="distance_km" type="text" inputmode="decimal" autocomplete="off"
                 value="${r.distance_km != null ? Number(r.distance_km) : ""}">
        </div>
        <div>
          <label for="r-elevation">D+ (m)</label>
          <input id="r-elevation" name="elevation_m" type="text" inputmode="numeric" autocomplete="off"
                 value="${r.elevation_m ?? ""}">
        </div>
      </div>

      <div class="field-row">
        <div>
          <label for="r-goal">Goal time</label>
          <input id="r-goal" name="goal" type="text" inputmode="decimal" autocomplete="off" placeholder="1:45:00"
                 value="${escapeHtml(formatDuration(r.goal_time_s))}">
          <p class="hint" id="goal-pace"></p>
        </div>
        <div>
          <label for="r-result">Result time</label>
          <input id="r-result" name="result" type="text" inputmode="decimal" autocomplete="off" placeholder="1:43:12"
                 value="${escapeHtml(formatDuration(r.result_time_s))}">
          <p class="hint" id="result-pace"></p>
        </div>
      </div>

      <label for="r-block">Training block</label>
      <select id="r-block" name="training_block_id">
        <option value="">— none —</option>
        ${blocks.map((b) => `<option value="${b.id}" ${r.training_block_id === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")}
      </select>

      <label for="r-notes">Notes</label>
      <textarea id="r-notes" name="notes" rows="3">${escapeHtml(r.notes || "")}</textarea>

      <p id="race-status" class="status" role="status"></p>
      <div class="form-actions">
        <button type="submit" class="button primary">${isEdit ? "Save changes" : "Save race"}</button>
        <a href="#/races" class="button">Cancel</a>
        ${isEdit ? `<button type="button" id="delete" class="button danger">Delete</button>` : ""}
      </div>
    </form>
  `;

  const form = container.querySelector("#race-form");
  const status = form.querySelector("#race-status");

  // Live pace under the goal / result boxes.
  function updatePaces() {
    const km = parseNumber(form.elements.distance_km.value);
    for (const [name, id] of [["goal", "#goal-pace"], ["result", "#result-pace"]]) {
      const seconds = parseDuration(form.elements[name].value);
      form.querySelector(id).textContent = seconds && km ? formatSpeed("per_km", seconds, km) : "";
    }
  }
  form.addEventListener("input", () => {
    updatePaces();
    if (status.classList.contains("error")) showStatus(status, "", "");
  });
  updatePaces();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = readRaceForm(form);
    if (result.error) return showStatus(status, result.error, "error");
    const values = result.race;
    if (isEdit) values.id = race.id;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus(status, "Saving…", "");
    try {
      const saved = await saveRace(values);
      // New race: stay on its page, so the checklist and routine are right there.
      if (!isEdit) {
        window.location.hash = `#/races/${saved.id}`;
        return;
      }
      // The date changed: the routine sessions follow (or go, if no date any more).
      let message = "✅ Race saved";
      if (race.race_date && values.race_date !== race.race_date) {
        if (values.race_date) {
          const moved = await moveRaceRoutine(race.id, race.race_date, values.race_date);
          if (moved) message += ` · race routine moved too (${moved} session${moved === 1 ? "" : "s"})`;
        } else {
          const removed = await removeRaceRoutine(race.id);
          if (removed) message += " · no date any more, so the race routine left the planner";
        }
      }
      showToast(message);
      renderRace(container, race.id);
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
      button.disabled = false;
    }
  });

  const deleteButton = form.querySelector("#delete");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Delete this race? Its checklist and its race-routine sessions in the planner go too.")) return;
      try {
        await deleteRace(race.id);
        window.location.hash = "#/races";
      } catch (error) {
        showStatus(status, "Could not delete: " + error.message, "error");
      }
    });
  }

  if (isEdit) {
    drawRoutine(container.querySelector("#routine"), race, () => renderRace(container, race.id));
    drawChecklist(container.querySelector("#checklist"), race);
  }
}

function parseNumber(text) {
  const value = Number(String(text).trim().replace(",", "."));
  return String(text).trim() !== "" && Number.isFinite(value) ? value : null;
}

// Reads and checks the race form. Returns { race } or { error }.
function readRaceForm(form) {
  const name = form.elements.name.value.trim();
  if (!name) return { error: "Please give the race a name." };

  const distanceText = form.elements.distance_km.value.trim();
  const distance = parseNumber(distanceText);
  if (distanceText && !(distance > 0 && distance < 1000)) return { error: "Distance not understood (e.g. 21.1)." };

  const elevationText = form.elements.elevation_m.value.trim();
  const elevation = parseNumber(elevationText);
  if (elevationText && !(Number.isInteger(elevation) && elevation >= 0)) return { error: "D+ must be a whole number of metres." };

  const times = {};
  for (const [field, label] of [["goal", "Goal time"], ["result", "Result time"]]) {
    const text = form.elements[field].value.trim();
    times[field] = text ? parseDuration(text) : null;
    if (text && !times[field]) return { error: `${label} not understood. Use 45:00 or 1:45:00.` };
  }

  const status = form.elements.status.value;
  const date = form.elements.race_date.value || null;
  if (!date && (status === "to_register" || status === "registered")) {
    return { error: "A race you register for needs a date." };
  }

  return {
    race: {
      name, race_date: date, status,
      location: form.elements.location.value.trim() || null,
      distance_km: distance, elevation_m: elevation,
      goal_time_s: times.goal, result_time_s: times.result,
      training_block_id: form.elements.training_block_id.value || null,
      notes: form.elements.notes.value.trim() || null,
    },
  };
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}


// ---------- Race routine card ----------

async function drawRoutine(el, race, refresh) {
  let sessions = [];
  try {
    sessions = await listRaceSessions(race.id);
  } catch (error) {
    el.innerHTML = `<p class="status error"></p>`;
    el.querySelector(".status").textContent = "Could not load the routine: " + error.message;
    return;
  }
  const raceSession = sessions.find((s) => s.session_type === "race");
  const logged = raceSession && raceSession.activity;
  const canPlan = race.race_date && race.status !== "finished" && race.status !== "cancelled";
  const missing = RACE_ROUTINE.length - sessions.length;

  el.innerHTML = `
    <h2>Race routine</h2>
    <p class="muted small">Race day + an activation jog 2 days before, and full rest the day before
      (you get a warning if something is planned then). A planned match always wins over the jog.</p>
    ${sessions.length ? `<ul class="routine-list">${sessions.map((s) => `
      <li><a href="#/planner/${startOfWeek(s.session_date)}">${escapeHtml(formatDayLabel(s.session_date))}</a> ·
        ${escapeHtml(s.title || "")} ${s.status === "done" ? "✅" : s.status === "cancelled" ? "❌" : ""}</li>`).join("")}</ul>` : ""}
    ${logged && race.result_time_s !== logged.duration_s && logged.duration_s ? `
      <p>Logged race time: <strong>${formatDuration(logged.duration_s)}</strong></p>
      <button type="button" class="button primary" id="use-result">Use my logged time as result</button>` : ""}
    ${canPlan && missing > 0 ? `<button type="button" class="button primary" id="add-routine">📅 ${sessions.length
      ? "Add the missing routine sessions" : "Add race routine to my planner"}</button>` : ""}
    ${!race.race_date ? `<p class="muted">Give the race a date to plan its routine.</p>` : ""}
    ${sessions.some((s) => s.status !== "done") ? `<button type="button" class="button" id="remove-routine">Remove the routine from the planner</button>` : ""}
  `;

  const add = el.querySelector("#add-routine");
  if (add) add.addEventListener("click", async () => {
    add.disabled = true;
    try {
      const { added, notes } = await addRaceRoutine(race);
      // One message only (a second toast would hide the first).
      const parts = [];
      if (added) parts.push(`📅 Added ${added} session${added === 1 ? "" : "s"} to your planner.`);
      notes.forEach((note) => parts.push("⚠️ " + note));
      if (parts.length) showToast(parts.join(" "), { seconds: notes.length ? 10 : 6 });
      refresh();
    } catch (error) {
      showToast("Could not add the routine: " + error.message);
      add.disabled = false;
    }
  });

  const remove = el.querySelector("#remove-routine");
  if (remove) remove.addEventListener("click", async () => {
    if (!window.confirm("Remove this race's routine sessions from the planner? (Done ones stay.)")) return;
    try {
      await removeRaceRoutine(race.id);
      refresh();
    } catch (error) {
      showToast("Could not remove: " + error.message);
    }
  });

  const useResult = el.querySelector("#use-result");
  if (useResult) useResult.addEventListener("click", async () => {
    try {
      await saveRace({ ...race, result_time_s: logged.duration_s, status: "finished" });
      showToast("🏁 Result saved, race marked finished");
      refresh();
    } catch (error) {
      showToast("Could not save: " + error.message);
    }
  });
}


// ---------- Checklist card ----------

function drawChecklist(el, race) {
  let items = race.checklist.slice();

  function draw() {
    const done = items.filter((i) => i.done).length;
    el.innerHTML = `
      <h2>Checklist ${items.length ? `<span class="muted small">${done} / ${items.length} ready</span>` : ""}</h2>
      ${items.length ? `<ul class="checklist">${items.map((item) => `
        <li class="${item.done ? "is-done" : ""}">
          <label class="checkbox"><input type="checkbox" data-toggle="${item.id}" ${item.done ? "checked" : ""}>
            ${escapeHtml(item.label)}</label>
          <button type="button" class="button small-button danger" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.label)}">✕</button>
        </li>`).join("")}</ul>` : `
        <p class="muted">No checklist yet.</p>
        <div class="sheet-actions">
          <button type="button" class="button" id="copy-last">⧉ Copy from my last race</button>
          <button type="button" class="button" id="use-starter">Use the starter list</button>
        </div>`}
      <form id="add-item" class="add-item">
        <input type="text" name="label" placeholder="Add an item" autocomplete="off" aria-label="New checklist item">
        <button type="submit" class="button">Add</button>
      </form>
      ${done ? `<button type="button" class="button small-button" id="untick-all">Untick all</button>` : ""}
    `;
  }

  async function addLabels(labels) {
    const start = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const added = await addChecklistItems(race.id, labels, start);
    items = items.concat(added).sort((a, b) => a.position - b.position);
    draw();
  }

  el.addEventListener("change", async (event) => {
    const box = event.target.closest("[data-toggle]");
    if (!box) return;
    const item = items.find((i) => i.id === box.dataset.toggle);
    item.done = box.checked;
    draw();
    try {
      await updateChecklistItem(item.id, { done: item.done });
    } catch (error) {
      showToast("Could not save the tick: " + error.message);
    }
  });

  el.addEventListener("click", async (event) => {
    try {
      const remove = event.target.closest("[data-remove]");
      if (remove) {
        await deleteChecklistItem(remove.dataset.remove);
        items = items.filter((i) => i.id !== remove.dataset.remove);
        draw();
      }
      if (event.target.closest("#use-starter")) await addLabels(STARTER_CHECKLIST);
      if (event.target.closest("#copy-last")) {
        const last = await findLastChecklist(race.id);
        if (!last) return showToast("No other race has a checklist yet. Try the starter list.");
        await addLabels(last.labels);
        showToast(`Copied from ${last.raceName}`);
      }
      if (event.target.closest("#untick-all")) {
        const ticked = items.filter((i) => i.done);
        ticked.forEach((i) => { i.done = false; });
        draw();
        await Promise.all(ticked.map((i) => updateChecklistItem(i.id, { done: false })));
      }
    } catch (error) {
      showToast("Something went wrong: " + error.message);
    }
  });

  el.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.target.elements.label;
    const label = input.value.trim();
    if (!label) return;
    try {
      await addLabels([label]);
      el.querySelector('#add-item input[name="label"]').focus();
    } catch (error) {
      showToast("Could not add: " + error.message);
    }
  });

  draw();
}
