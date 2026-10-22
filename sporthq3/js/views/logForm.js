// The add / edit form for one activity.
// It shows only the boxes that make sense for the chosen sport, using the
// `fields`, `speed` and `matchCard` settings from rules.js.

import {
  getActivity, saveActivity, deleteActivity, listShoes, getPlannedSession, findOpenPlannedSessions,
  getSessionTemplate, saveSessionTemplate, listRecentShoeIds, findSessionsLinkedTo, listPlannedSessions,
  updatePlannedSession,
} from "../storage.js?v=202610212125";
import { SPORTS, RPE_LABELS, getSport, getSessionType, shoeSurfaceFor, sportIcon } from "../rules.js?v=202610212125";
import { todayISO, startOfWeek, formatDayLabel } from "../utils/dates.js?v=202610212125";
import { sessionName, sessionDetails, completeSession, reopenSession, addToCatalogue } from "../utils/plan.js?v=202610212125";
import { openSheet } from "../utils/sheet.js?v=202610212125";
import { showToast } from "../utils/toast.js?v=202610212125";
import { loadWorkout, clearWorkout, workoutSnapshot, recipeChanges, recipeFromWorkout, ticksDone, ticksTotal } from "../utils/workout.js?v=202610212125";
import { parseDuration, parseDecimal, formatDuration, formatSpeed, escapeHtml } from "../utils/format.js?v=202610212125";
import { icon } from "../utils/icons.js?v=202610212125";
import { suggestedShoe } from "../utils/quickLog.js?v=202610212125";

const LAST_SPORT_KEY = "sporthq3.lastSport"; // pre-select the sport you used last

export async function render(container, { activityId, plannedId = null }) {
  let activity = null;
  let shoes = [];
  let planned = null; // the planned session this activity is logged for (from the planner)
  let recentShoeIds = []; // shoes of your last runs, to pre-select one for a new run
  container.innerHTML = `<p class="muted">Loading…</p>`;
  try {
    // Load the activity (when editing) and the shoe list at the same time.
    [activity, shoes, planned, recentShoeIds] = await Promise.all([
      activityId ? getActivity(activityId) : null,
      listShoes(),
      plannedId ? getPlannedSession(plannedId) : null,
      activityId ? [] : listRecentShoeIds(),
    ]);
  } catch (error) {
    container.innerHTML = `<p class="status error"></p>`;
    container.querySelector(".status").textContent = "Could not load: " + error.message;
    return;
  }
  if (activityId && !activity) {
    container.innerHTML = `<section class="card"><p>This activity doesn't exist (any more).</p>
      <a class="button" href="#/log">Back to the log</a></section>`;
    return;
  }
  drawForm(container, activity, shoes, planned, recentShoeIds);
}

// The shoe list for the picker: pairs in use, plus the pair already linked
// to this activity even if it's retired now (so editing an old run keeps it).
function shoeOptionsHtml(shoes, selectedId) {
  const choices = shoes.filter((shoe) => !shoe.retired || shoe.id === selectedId);
  return `<option value="">— No shoe —</option>` + choices
    .map((shoe) => `<option value="${shoe.id}" ${shoe.id === selectedId ? "selected" : ""}>${escapeHtml(shoe.name)}${shoe.retired ? " (retired)" : ""}</option>`)
    .join("");
}

function drawForm(container, activity, shoes, planned, recentShoeIds) {
  const isEdit = Boolean(activity);
  // A new activity from the planner starts with the planned day, sport, type and name.
  const fromPlan = !isEdit && planned ? {
    activity_date: planned.session_date,
    sport: planned.sport || readLastSport() || SPORTS[0].key,
    session_type: planned.session_type ?? null,
    title: planned.title || (sessionDetails(planned) && sessionDetails(planned).name) || null,
  } : null;
  // Coming from workout mode ("Finish"): the timer gives the duration.
  const savedWorkout = loadWorkout();
  const workout = fromPlan && savedWorkout && savedWorkout.plannedId === planned.id && savedWorkout.finishedAt
    ? savedWorkout : null;
  if (workout) fromPlan.duration_s = workout.durationS;
  const a = activity || fromPlan || {
    activity_date: todayISO(),
    sport: readLastSport() || SPORTS[0].key,
  };
  const stats = (activity && activity.match_stats) || {};

  container.innerHTML = `
    <form id="activity-form" class="card form" novalidate>
      <h2>${isEdit ? "Edit activity" : "New activity"}</h2>
      ${fromPlan ? `<p class="plan-banner">${icon("calendar")} For your planned <strong>${escapeHtml(sessionName(planned))}</strong> · ${escapeHtml(formatDayLabel(planned.session_date))}</p>` : ""}
      ${workout ? `<p class="plan-banner">${icon("dumbbell")} Workout finished${ticksTotal(workout) ? ` · ${ticksDone(workout)} / ${ticksTotal(workout)} sets ticked` : ""}.
        Check the duration, add how it felt, then save.
        <a href="#/workout/${escapeHtml(planned.id)}">‹ Back to the workout</a></p>` : ""}

      <label for="f-date">Date</label>
      <input id="f-date" name="activity_date" type="date" required value="${escapeHtml(a.activity_date)}">

      <label for="f-sport">Sport</label>
      <select id="f-sport" name="sport">
        ${SPORTS.map((s) => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join("")}
      </select>

      <label for="f-type">Session type</label>
      <select id="f-type" name="session_type"></select>

      <label for="f-title">Title <span class="muted">(optional)</span></label>
      <input id="f-title" name="title" type="text" autocomplete="off" maxlength="200"
             placeholder="e.g. Trail avec Lélé" value="${escapeHtml(a.title || "")}">

      <!-- Hidden for a match: there, "Minutes played" in the match card is the duration. -->
      <div id="duration-box">
        <label for="f-duration">Duration</label>
        <input id="f-duration" name="duration" type="text" inputmode="decimal" autocomplete="off"
               placeholder="45:00 or 1:02:30" required value="${escapeHtml(formatDuration(a.duration_s))}">
        <p class="hint">Minutes:seconds or hours:minutes:seconds. You can type ":", "," or "."
          between the numbers (45.30 = 45 min 30 s, 1,02,30 = 1 h 2 min 30 s). "45" alone = 45 minutes.</p>
      </div>

      <div data-field="distance">
        <label for="f-distance">Distance (km)</label>
        <input id="f-distance" name="distance_km" type="text" inputmode="decimal" autocomplete="off"
               value="${a.distance_km ?? ""}">
      </div>

      <div data-field="elevation">
        <label for="f-elevation">Climbing, D+ (m)</label>
        <input id="f-elevation" name="elevation_m" type="number" inputmode="numeric" min="0" step="1"
               value="${a.elevation_m ?? ""}">
      </div>

      <div data-field="shoe">
        <label for="f-shoe">Shoes</label>
        <select id="f-shoe" name="shoe_id">${shoeOptionsHtml(shoes, isEdit ? a.shoe_id : null)}</select>
      </div>

      <div data-field="stairs">
        <label for="f-stairs">Stairs climbed</label>
        <input id="f-stairs" name="stairs_climbed" type="number" inputmode="numeric" min="0" step="1"
               value="${a.stairs_climbed ?? ""}">
      </div>

      <p id="f-speed" class="speed" aria-live="polite"></p>

      <fieldset id="match-card" class="match-card">
        <legend>${sportIcon("football")} Match card</legend>
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
  form.dataset.editing = isEdit || fromPlan ? "yes" : "no";
  fillSessionTypes(form, isEdit || fromPlan ? (a.session_type ?? null) : undefined);
  updateVisibleFields(form);
  updateSpeed(form);
  updateRpeLabel(form);

  // A new run: pre-select the pair for its surface (trail session -> trail pair).
  // It follows the session type until you pick a shoe yourself.
  const shoeSelect = form.querySelector("#f-shoe");
  let shoePickedByHand = false;
  const suggestShoe = () => {
    if (isEdit || shoePickedByHand) return;
    shoeSelect.value = suggestedShoe(shoes, recentShoeIds, shoeSurfaceFor(typeSelect.value)) || "";
  };
  suggestShoe();
  shoeSelect.addEventListener("change", () => { shoePickedByHand = true; });

  // When the sport changes: new list of session types, new boxes.
  sportSelect.addEventListener("change", () => {
    form.dataset.editing = "no"; // a new sport starts on its first type
    fillSessionTypes(form, undefined);
    updateVisibleFields(form);
    updateSpeed(form);
    suggestShoe();
  });
  typeSelect.addEventListener("change", () => {
    updateVisibleFields(form);
    suggestShoe();
  });

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
    // Every activity needs a duration (since switch day 2026-10-21 all of
    // them have one, imported ones included), so the training load is complete.
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
      const saved = await saveActivity(result.activity, result.matchStats);
      saveLastSport(result.activity.sport);

      if (fromPlan) {
        // Logged from the planner: tick that exact session, then go back to the plan.
        // After a workout, the "photo" is what was really done (ticks, weights).
        await completeSession(planned, saved.id,
          workout ? workoutSnapshot(workout, sessionDetails(planned)) : undefined);
        let recipeNote = "";
        if (workout) {
          clearWorkout();
          recipeNote = await offerRecipeUpdate({ ...planned, status: "done" }, workout);
        }
        // One message only (a second toast would hide the first).
        showToast(`${sessionName(planned)} marked done${recipeNote ? " · " + recipeNote : ""}`);
        window.location.hash = `#/planner/${startOfWeek(saved.activity_date)}`;
        return;
      }
      if (!isEdit) await linkToPlan(saved);
      if (isEdit && saved.activity_date !== activity.activity_date) await moveLinkedSessions(saved);
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
        // Look up its planned session BEFORE deleting (afterwards the link is gone).
        const linked = await findSessionsLinkedTo(activity.id);
        await deleteActivity(activity.id);
        // Nothing was logged any more, so the planned session isn't done any more.
        await Promise.all(linked.map((session) => reopenSession(session)));
        if (linked.length) showToast(`Deleted · ${sessionName(linked[0])} is open again in your plan`);
        window.location.hash = "#/log";
      } catch (error) {
        showStatus(status, "Could not delete: " + error.message, "error");
      }
    });
  }
}

// Fills the "Session type" list for the chosen sport, plus a last choice
// without a type ("Just a run"): it counts as "other" for the rules.
function fillSessionTypes(form, selectedKey) {
  const sport = getSport(form.elements.sport.value);
  const typeSelect = form.elements.session_type;
  typeSelect.innerHTML = sport.sessionTypes
    .map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`)
    .join("") + `<option value="">${escapeHtml(noTypeLabel(sport))}</option>`;
  if (selectedKey === null && form.dataset.editing === "yes") {
    typeSelect.value = ""; // an existing activity saved without a type
  } else if (selectedKey && sport.sessionTypes.some((t) => t.key === selectedKey)) {
    typeSelect.value = selectedKey;
  }
}

// "Just a run (no type)", "Just a swim (no type)"…
export function noTypeLabel(sport) {
  return `Just ${sport.label.toLowerCase()} (no type)`;
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
  const km = parseDecimal(form.elements.distance_km.value);
  const text = sport.fields.includes("distance") ? formatSpeed(sport.speed, seconds, km) : "";
  form.querySelector("#f-speed").innerHTML = text ? `${icon("timer")} ${escapeHtml(text)}` : "";
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
  if (type && type.matchCard) {
    const minutes = number(f.minutes_played);
    if (minutes === null || !Number.isInteger(minutes) || minutes < 0 || minutes > 200) {
      return { error: "Please fill in minutes played (a whole number, 0 to 200)." };
    }
    duration = minutes > 0 ? minutes * 60 : null;
  } else {
    if (f.duration.value.trim() === "") {
      return { error: 'Please fill in the duration, e.g. "45:00" or "1:02:30".' };
    }
    duration = parseDuration(f.duration.value);
    if (!duration) {
      return { error: 'Duration not understood. Try "45:00" or "1:02:30".' };
    }
  }

  // Typed as text so "11,2" (iPhone comma keypad) works like "11.2".
  const distance = shows("distance") ? parseDecimal(f.distance_km.value) : null;
  const elevation = shows("elevation") ? number(f.elevation_m) : null;
  const stairs = shows("stairs") ? number(f.stairs_climbed) : null;
  if ([distance, elevation, stairs].some((n) => n !== null && (Number.isNaN(n) || n < 0))) {
    return { error: "Distance, D+ and stairs must be positive numbers." };
  }

  const chosenRpe = form.querySelector('input[name="rpe"]:checked');

  const activity = {
    activity_date: f.activity_date.value,
    sport: sport.key,
    session_type: type ? type.key : null,
    duration_s: duration,
    distance_km: distance,
    elevation_m: elevation === null ? null : Math.round(elevation),
    stairs_climbed: stairs === null ? null : Math.round(stairs),
    rpe: chosenRpe ? Number(chosenRpe.value) : null,
    title: f.title.value.trim() || null,
    notes: f.notes.value.trim() || null,
    shoe_id: shows("shoe") ? (f.shoe_id.value || null) : null,
  };

  let matchStats = null;
  if (type && type.matchCard) {
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

// An activity got a new date: its planned session ("done" with it) moves
// along, so the plan shows it on the day you really did it.
// Never blocks: the activity itself is already saved.
async function moveLinkedSessions(activity) {
  try {
    const linked = await findSessionsLinkedTo(activity.id);
    const toMove = linked.filter((session) => session.session_date !== activity.activity_date);
    if (!toMove.length) return;
    const sameDay = await listPlannedSessions(activity.activity_date, activity.activity_date);
    await Promise.all(toMove.map((session, i) =>
      updatePlannedSession(session.id, { session_date: activity.activity_date, position: sameDay.length + i })));
    showToast(`Saved · ${sessionName(toMove[0])} moved to ${formatDayLabel(activity.activity_date)} in your plan`);
  } catch (error) {
    showToast("Saved, but could not move its planned session: " + error.message);
  }
}

// After logging a NEW activity: if that day has an open planned session of
// the same sport, link them and mark it done (with Undo). If there are
// several, ask which one. Never blocks saving if something goes wrong.
async function linkToPlan(activity) {
  try {
    const open = await findOpenPlannedSessions(activity.activity_date, activity.sport);
    if (!open.length) return;

    let session = open[0];
    if (open.length > 1) {
      const choice = await openSheet({
        title: "Which planned session was this?",
        html: `<div class="sheet-list">${open.map((s) =>
          `<button type="button" class="sheet-item" data-value="${s.id}">${escapeHtml(sessionName(s))}</button>`).join("")}</div>
          <div class="sheet-actions"><button type="button" class="button" data-value="none">None of them</button></div>`,
      });
      session = open.find((s) => s.id === choice);
      if (!session) return;
    }

    await completeSession(session, activity.id);
    showToast(`Linked to your planned ${sessionName(session)}`, {
      actionLabel: "Undo",
      onAction: async () => {
        await reopenSession(session);
        showToast("Unlinked");
      },
    });
  } catch (error) {
    showToast("Saved, but could not link it to your plan: " + error.message);
  }
}

// After a workout:
//   - from a catalogue recipe, and something changed (sets, reps/time,
//     weights, exercises added or removed): "update the recipe?"
//     Yes = every session that isn't done yet follows today's version.
//   - a custom session (or "just a sport" where you added exercises):
//     "add it to your catalogue?"
// Never blocks: the activity is already saved. Returns a short note for the
// toast ("recipe updated" / "added to the catalogue") or "".
async function offerRecipeUpdate(planned, workout) {
  if (!planned.template_id) return offerAddToCatalogue(planned, workout);
  const changes = recipeChanges(workout);
  if (!changes.length) return "";
  const choice = await openSheet({
    title: "Update your recipe?",
    html: `
      <p>You changed ${changes.length === 1 ? "this" : "these"} today:</p>
      <ul class="exercise-list">${changes.map((c) => `<li>${escapeHtml(c)}</li>`).join("")}</ul>
      <p class="muted small">Updating changes "${escapeHtml(sessionName(planned))}" in your catalogue to
        today's version, so every session that isn't done yet uses it.</p>
      <div class="sheet-actions">
        <button type="button" class="button primary" data-value="update">Update the recipe</button>
        <button type="button" class="button" data-value="keep">Only today</button>
      </div>`,
  });
  if (choice !== "update") return "";
  try {
    const recipe = await getSessionTemplate(planned.template_id);
    if (!recipe) return "";
    await saveSessionTemplate({ ...recipe, ...recipeFromWorkout(workout) });
    return "recipe updated";
  } catch (error) {
    window.alert("Could not update the recipe: " + error.message);
    return "";
  }
}

async function offerAddToCatalogue(planned, workout) {
  if (!workout.exercises.length) return "";
  const name = await openSheet({
    title: "Add it to your catalogue?",
    html: `
      <p>This session isn't in your catalogue. Save today's version as a recipe to plan it again later?</p>
      <label for="recipe-name" class="sheet-subtitle">Name</label>
      <input id="recipe-name" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(workout.name)}">
      <p id="recipe-error" class="status error" hidden></p>
      <div class="sheet-actions">
        <button type="button" class="button primary" id="recipe-go">${icon("library")} Add to the catalogue</button>
        <button type="button" class="button" data-value="">No thanks</button>
      </div>`,
    onReady: (dialog, close) => {
      const input = dialog.querySelector("#recipe-name");
      const go = () => {
        if (!input.value.trim()) {
          const errorEl = dialog.querySelector("#recipe-error");
          errorEl.textContent = "Give it a name.";
          errorEl.hidden = false;
          return;
        }
        close(input.value.trim());
      };
      dialog.querySelector("#recipe-go").addEventListener("click", go);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } });
    },
  });
  if (!name) return "";
  try {
    await addToCatalogue(planned, name, recipeFromWorkout(workout));
    return "added to the catalogue";
  } catch (error) {
    window.alert("Could not add it to the catalogue: " + error.message);
    return "";
  }
}
