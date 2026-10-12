// The add / edit form for one activity.
// It shows only the boxes that make sense for the chosen sport, using the
// `fields`, `speed` and `matchCard` settings from rules.js.

import { getActivity, saveActivity, deleteActivity } from "../storage.js";
import { SPORTS, RPE_LABELS, getSport, getSessionType } from "../rules.js";
import { todayISO } from "../utils/dates.js";
import { parseDuration, formatDuration, formatSpeed, escapeHtml } from "../utils/format.js";

const LAST_SPORT_KEY = "sporthq3.lastSport"; // pre-select the sport you used last

export async function render(container, { activityId }) {
  let activity = null;
  if (activityId) {
    container.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      activity = await getActivity(activityId);
    } catch (error) {
      container.innerHTML = `<p class="status error"></p>`;
      container.querySelector(".status").textContent = "Could not load: " + error.message;
      return;
    }
    if (!activity) {
      container.innerHTML = `<section class="card"><p>This activity doesn't exist (any more).</p>
        <a class="button" href="#/log">Back to the log</a></section>`;
      return;
    }
  }
  drawForm(container, activity);
}

function drawForm(container, activity) {
  const isEdit = Boolean(activity);
  const a = activity || {
    activity_date: todayISO(),
    sport: readLastSport() || SPORTS[0].key,
  };
  const stats = (activity && activity.match_stats) || {};

  container.innerHTML = `
    <form id="activity-form" class="card form" novalidate>
      <h2>${isEdit ? "Edit activity" : "New activity"}</h2>

      <label for="f-date">Date</label>
      <input id="f-date" name="activity_date" type="date" required value="${escapeHtml(a.activity_date)}">

      <label for="f-sport">Sport</label>
      <select id="f-sport" name="sport">
        ${SPORTS.map((s) => `<option value="${s.key}">${s.icon} ${escapeHtml(s.label)}</option>`).join("")}
      </select>

      <label for="f-type">Session type</label>
      <select id="f-type" name="session_type"></select>

      <!-- Hidden for a match: there, "Minutes played" in the match card is the duration. -->
      <div id="duration-box">
        <label for="f-duration">Duration</label>
        <input id="f-duration" name="duration" type="text" inputmode="decimal" autocomplete="off"
               placeholder="45:00 or 1:02:30" required value="${escapeHtml(formatDuration(a.duration_s))}">
        <p class="hint">Minutes:seconds or hours:minutes:seconds. "45" = 45 minutes.</p>
      </div>

      <div data-field="distance">
        <label for="f-distance">Distance (km)</label>
        <input id="f-distance" name="distance_km" type="number" inputmode="decimal" min="0" step="0.01"
               value="${a.distance_km ?? ""}">
      </div>

      <div data-field="elevation">
        <label for="f-elevation">Climbing, D+ (m)</label>
        <input id="f-elevation" name="elevation_m" type="number" inputmode="numeric" min="0" step="1"
               value="${a.elevation_m ?? ""}">
      </div>

      <div data-field="stairs">
        <label for="f-stairs">Stairs climbed</label>
        <input id="f-stairs" name="stairs_climbed" type="number" inputmode="numeric" min="0" step="1"
               value="${a.stairs_climbed ?? ""}">
      </div>

      <p id="f-speed" class="speed" aria-live="polite"></p>

      <fieldset id="match-card" class="match-card">
        <legend>⚽ Match card</legend>
        <label for="f-opponent">Opponent</label>
        <input id="f-opponent" name="opponent" type="text" autocomplete="off" value="${escapeHtml(stats.opponent || "")}">
        <div class="row-3">
          <div>
            <label for="f-minutes">Minutes played</label>
            <input id="f-minutes" name="minutes_played" type="number" inputmode="numeric" min="0" max="200"
                   value="${stats.minutes_played ?? ""}">
          </div>
          <div>
            <label for="f-goals">Goals</label>
            <input id="f-goals" name="goals" type="number" inputmode="numeric" min="0" value="${stats.goals ?? 0}">
          </div>
          <div>
            <label for="f-assists">Assists</label>
            <input id="f-assists" name="assists" type="number" inputmode="numeric" min="0" value="${stats.assists ?? 0}">
          </div>
        </div>
      </fieldset>

      <fieldset class="rpe">
        <legend>How hard did it feel? (RPE)</legend>
        <div class="rpe-grid">
          ${Object.keys(RPE_LABELS).map((n) => `
            <label class="rpe-option">
              <input type="radio" name="rpe" value="${n}" ${String(a.rpe) === n ? "checked" : ""}>
              <span>${n}</span>
            </label>`).join("")}
        </div>
        <p id="rpe-label" class="hint"></p>
      </fieldset>

      <label for="f-notes">Notes</label>
      <textarea id="f-notes" name="notes" rows="3">${escapeHtml(a.notes || "")}</textarea>

      <p id="form-status" class="status" role="status"></p>

      <div class="form-actions">
        <button type="submit" class="button primary">${isEdit ? "Save changes" : "Save activity"}</button>
        <a href="#/log" class="button">Cancel</a>
        ${isEdit ? `<button type="button" id="delete" class="button danger">Delete</button>` : ""}
      </div>
    </form>
  `;

  const form = container.querySelector("#activity-form");
  const sportSelect = form.querySelector("#f-sport");
  const typeSelect = form.querySelector("#f-type");
  const status = form.querySelector("#form-status");

  sportSelect.value = getSport(a.sport) ? a.sport : SPORTS[0].key;
  fillSessionTypes(form, a.session_type);
  updateVisibleFields(form);
  updateSpeed(form);
  updateRpeLabel(form);

  // When the sport changes: new list of session types, new boxes.
  sportSelect.addEventListener("change", () => {
    fillSessionTypes(form, null);
    updateVisibleFields(form);
    updateSpeed(form);
  });
  typeSelect.addEventListener("change", () => updateVisibleFields(form));

  // Recalculate the pace while you type.
  for (const name of ["duration", "distance_km"]) {
    form.elements[name].addEventListener("input", () => updateSpeed(form));
  }
  form.addEventListener("change", (event) => {
    if (event.target.name === "rpe") updateRpeLabel(form);
  });
  // As soon as you start fixing something, hide the old error message.
  form.addEventListener("input", () => {
    if (status.classList.contains("error")) showStatus(status, "", "");
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = readForm(form);
    if (result.error) {
      showStatus(status, result.error, "error");
      return;
    }

    const saveButton = form.querySelector('button[type="submit"]');
    saveButton.disabled = true;
    showStatus(status, "Saving…", "");
    try {
      if (isEdit) result.activity.id = activity.id;
      await saveActivity(result.activity, result.matchStats);
      saveLastSport(result.activity.sport);
      window.location.hash = "#/log"; // back to the list
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
      saveButton.disabled = false;
    }
  });

  const deleteButton = form.querySelector("#delete");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      // confirm() shows the browser's built-in "OK / Cancel" box.
      if (!window.confirm("Delete this activity? This can't be undone.")) return;
      try {
        await deleteActivity(activity.id);
        window.location.hash = "#/log";
      } catch (error) {
        showStatus(status, "Could not delete: " + error.message, "error");
      }
    });
  }
}

// Fills the "Session type" list for the chosen sport.
function fillSessionTypes(form, selectedKey) {
  const sport = getSport(form.elements.sport.value);
  const typeSelect = form.elements.session_type;
  typeSelect.innerHTML = sport.sessionTypes
    .map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`)
    .join("");
  if (selectedKey && sport.sessionTypes.some((t) => t.key === selectedKey)) {
    typeSelect.value = selectedKey;
  }
}

// Shows/hides the distance, D+, stairs boxes and the match card.
// For a match, the match card's "Minutes played" replaces the Duration box.
function updateVisibleFields(form) {
  const sport = getSport(form.elements.sport.value);
  for (const box of form.querySelectorAll("[data-field]")) {
    box.hidden = !sport.fields.includes(box.dataset.field);
  }
  const type = getSessionType(sport.key, form.elements.session_type.value);
  const isMatch = Boolean(type && type.matchCard);
  form.querySelector("#match-card").hidden = !isMatch;
  form.querySelector("#duration-box").hidden = isMatch;
}

function updateSpeed(form) {
  const sport = getSport(form.elements.sport.value);
  const seconds = parseDuration(form.elements.duration.value);
  const km = Number(form.elements.distance_km.value);
  const text = sport.fields.includes("distance") ? formatSpeed(sport.speed, seconds, km) : "";
  form.querySelector("#f-speed").textContent = text ? "⏱ " + text : "";
}

function updateRpeLabel(form) {
  const chosen = form.querySelector('input[name="rpe"]:checked');
  form.querySelector("#rpe-label").textContent = chosen ? RPE_LABELS[chosen.value] : "Optional";
}

// Reads the form into { activity, matchStats } or { error: "message" }.
// Hidden boxes are saved as empty (null), so switching from Running to
// Football doesn't keep an old distance.
function readForm(form) {
  const f = form.elements;
  const sport = getSport(f.sport.value);
  const type = getSessionType(sport.key, f.session_type.value);
  const shows = (field) => sport.fields.includes(field);

  if (!f.activity_date.value) return { error: "Please pick a date." };

  const number = (input) => (input.value === "" ? null : Number(input.value));

  // A match takes its duration from "Minutes played" (one box instead of two).
  // 0 minutes (stayed on the bench) is allowed: the duration is then empty.
  let duration;
  if (type.matchCard) {
    const minutes = number(f.minutes_played);
    if (minutes === null || !Number.isInteger(minutes) || minutes < 0 || minutes > 200) {
      return { error: "Please fill in minutes played (a whole number, 0 to 200)." };
    }
    duration = minutes > 0 ? minutes * 60 : null;
  } else {
    duration = parseDuration(f.duration.value);
    if (!duration) return { error: 'Duration not understood. Try "45:00" or "1:02:30".' };
  }

  const distance = shows("distance") ? number(f.distance_km) : null;
  const elevation = shows("elevation") ? number(f.elevation_m) : null;
  const stairs = shows("stairs") ? number(f.stairs_climbed) : null;
  if ([distance, elevation, stairs].some((n) => n !== null && (Number.isNaN(n) || n < 0))) {
    return { error: "Distance, D+ and stairs must be positive numbers." };
  }

  const chosenRpe = form.querySelector('input[name="rpe"]:checked');

  const activity = {
    activity_date: f.activity_date.value,
    sport: sport.key,
    session_type: type.key,
    duration_s: duration,
    distance_km: distance,
    elevation_m: elevation === null ? null : Math.round(elevation),
    stairs_climbed: stairs === null ? null : Math.round(stairs),
    rpe: chosenRpe ? Number(chosenRpe.value) : null,
    notes: f.notes.value.trim() || null,
  };

  let matchStats = null;
  if (type.matchCard) {
    const minutes = number(f.minutes_played); // already checked above
    const goals = number(f.goals) ?? 0;
    const assists = number(f.assists) ?? 0;
    if ([goals, assists].some((n) => !Number.isInteger(n) || n < 0)) {
      return { error: "Goals and assists must be whole numbers." };
    }
    matchStats = {
      opponent: f.opponent.value.trim() || null,
      minutes_played: minutes,
      goals,
      assists,
    };
  }
  return { activity, matchStats };
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}

function readLastSport() {
  try { return localStorage.getItem(LAST_SPORT_KEY); } catch { return null; }
}
function saveLastSport(key) {
  try { localStorage.setItem(LAST_SPORT_KEY, key); } catch { /* not important */ }
}
