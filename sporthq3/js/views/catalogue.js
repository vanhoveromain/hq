// Session catalogue (opened from the Plan tab): your "recipe book".
//   #/catalogue        -> list of recipes, grouped by sport
//   #/catalogue/new    -> empty recipe
//   #/catalogue/<id>   -> edit that recipe
//
// Planned sessions point to a recipe, so changing a recipe here (e.g. a
// weight 25 -> 30 kg) shows up in every session that isn't done yet.
//
// The same editor makes "custom sessions" (see views/customSession.js):
// a session for one day only, kept on the planned session, not in the
// catalogue (unless you tick "Also add it to my catalogue").

import {
  listSessionTemplates, getSessionTemplate, saveSessionTemplate, deleteSessionTemplate,
  getPlannedSession, listPlannedSessions, createPlannedSession, updatePlannedSession,
} from "../storage.js?v=202610160915";
import { SPORTS, getSport, sportIcon, sessionTypeLabel } from "../rules.js?v=202610160915";
import { escapeHtml, formatDuration, parseDuration } from "../utils/format.js?v=202610160915";
import { startOfWeek } from "../utils/dates.js?v=202610160915";
import { isCustomSession } from "../utils/plan.js?v=202610160915";

export function render(container, { params = [] } = {}) {
  if (params[0] === "new") return renderEditor(container, null);
  if (params[0]) return renderEditor(container, params[0]);
  renderList(container);
}


// ---------- The list ----------

async function renderList(container) {
  container.innerHTML = `
    <a href="#/planner" class="back-link">‹ Plan</a>
    <a href="#/catalogue/new" class="button primary add-button">+ New session</a>
    <div id="catalogue-list"><p class="muted">Loading…</p></div>
  `;
  const listEl = container.querySelector("#catalogue-list");

  try {
    const templates = await listSessionTemplates();
    const active = templates.filter((t) => !t.archived);
    const archived = templates.filter((t) => t.archived);

    if (!templates.length) {
      listEl.innerHTML = `<section class="card placeholder"><p>Your catalogue is empty.
        Tap <strong>+ New session</strong> to create your first one.</p></section>`;
      return;
    }

    // One group per sport, in the rulebook's order.
    listEl.innerHTML = SPORTS
      .map((sport) => ({ sport, items: active.filter((t) => t.sport === sport.key) }))
      .filter((group) => group.items.length)
      .map((group) => `
        <section class="week">
          <h2 class="week-title"><span>${group.sport.icon} ${escapeHtml(group.sport.label)}</span>
            <span class="muted">${group.items.length}</span></h2>
          <ul class="activity-list">${group.items.map(templateItemHtml).join("")}</ul>
        </section>`)
      .join("") +
      (archived.length ? `
        <details class="retired">
          <summary>Archived (${archived.length})</summary>
          <ul class="activity-list">${archived.map(templateItemHtml).join("")}</ul>
        </details>` : "");
  } catch (error) {
    listEl.innerHTML = `<p class="status error"></p>`;
    listEl.querySelector(".status").textContent = "Could not load the catalogue: " + error.message;
  }
}

function templateItemHtml(t) {
  const summary = [
    // the type, unless it just repeats the name ("Long run" / "Long run")
    t.session_type && sessionTypeLabel(t.sport, t.session_type) !== t.name ? sessionTypeLabel(t.sport, t.session_type) : "",
    t.exercises.length ? `${t.exercises.length} exercise${t.exercises.length === 1 ? "" : "s"}` : "",
    t.rounds ? `${t.rounds} rounds` : "",
    t.target_duration_s ? formatDuration(t.target_duration_s) : "",
    t.target_distance_km ? `${Number(t.target_distance_km)} km` : "",
  ].filter(Boolean).join(" · ");
  return `
    <li>
      <a class="activity-item" href="#/catalogue/${encodeURIComponent(t.id)}">
        <span class="activity-icon" aria-hidden="true">${sportIcon(t.sport)}</span>
        <span class="activity-main">
          <span class="activity-title">${escapeHtml(t.name)}</span>
          ${summary ? `<span class="muted">${escapeHtml(summary)}</span>` : ""}
        </span>
      </a>
    </li>`;
}


// ---------- The editor ----------

// Custom mode: renderEditor(container, null, { date }) = new custom session
// on that day; renderEditor(container, null, { plannedId }) = edit one.
export async function renderEditor(container, templateId, custom = null) {
  if (custom) return renderCustomEditor(container, custom);
  let template = null;
  if (templateId) {
    container.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      template = await getSessionTemplate(templateId);
    } catch (error) {
      container.innerHTML = `<p class="status error"></p>`;
      container.querySelector(".status").textContent = "Could not load: " + error.message;
      return;
    }
    if (!template) {
      container.innerHTML = `<section class="card"><p>This session doesn't exist (any more).</p>
        <a class="button" href="#/catalogue">Back to the catalogue</a></section>`;
      return;
    }
  }
  const isEdit = Boolean(template);
  drawEditor(container, template || { sport: "muscle", exercises: [] }, {
    title: isEdit ? "Edit session" : "New session",
    saveLabel: isEdit ? "Save changes" : "Save session",
    cancelHref: "#/catalogue",
    canDelete: isEdit,
    onSave: async (recipe) => {
      if (isEdit) recipe.id = template.id;
      await saveSessionTemplate(recipe);
      window.location.hash = "#/catalogue";
    },
    onDelete: async () => {
      const question = "Delete this session from the catalogue?\n\n" +
        "Planned sessions using it stay, but lose their details. " +
        "Tip: tick \"Archived\" instead to keep it for history.";
      if (!window.confirm(question)) return;
      await deleteSessionTemplate(template.id);
      window.location.hash = "#/catalogue";
    },
  });
}

async function renderCustomEditor(container, { date, plannedId }) {
  let planned = null;
  if (plannedId) {
    container.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      planned = await getPlannedSession(plannedId);
    } catch (error) {
      container.innerHTML = `<p class="status error"></p>`;
      container.querySelector(".status").textContent = "Could not load: " + error.message;
      return;
    }
    if (!planned || !isCustomSession(planned) || planned.status !== "planned") {
      container.innerHTML = `<section class="card"><p>This custom session can't be edited (any more).</p>
        <a class="button" href="#/planner">Back to the plan</a></section>`;
      return;
    }
    date = planned.session_date;
  }
  const backToPlan = `#/planner/${startOfWeek(date)}`;
  const t = planned
    ? { ...planned.details, sport: planned.sport, session_type: planned.session_type }
    : { sport: "muscle", exercises: [] };

  drawEditor(container, t, {
    title: planned ? "Edit custom session" : "Custom session",
    intro: "Just for this day. It isn't added to your catalogue unless you tick the box below.",
    saveLabel: planned ? "Save changes" : "Add to the plan",
    cancelHref: backToPlan,
    custom: true,
    onSave: async (recipe, { addToCatalogue }) => {
      // archived is a catalogue thing; the rest is the session's content.
      const { archived, ...content } = recipe;
      const values = { sport: recipe.sport, session_type: recipe.session_type };
      if (addToCatalogue) {
        const saved = await saveSessionTemplate({ ...content, archived: false });
        Object.assign(values, { template_id: saved.id, details: null });
      } else {
        const { sport, session_type, ...details } = content;
        Object.assign(values, { template_id: null, details: { ...details, custom: true } });
      }
      if (planned) {
        await updatePlannedSession(planned.id, values);
      } else {
        const sameDay = await listPlannedSessions(date, date);
        await createPlannedSession({ ...values, session_date: date, status: "planned", source: "manual", position: sameDay.length });
      }
      window.location.hash = backToPlan;
    },
  });
}

// The form itself, shared by recipes and custom sessions.
//   options: { title, intro, saveLabel, cancelHref, canDelete, custom,
//              onSave(recipe, { addToCatalogue }), onDelete() }
function drawEditor(container, t, options) {

  // The exercise lines live in this list while you edit; the boxes on screen
  // write into it as you type, and buttons (↑ ↓ ✕ +) change it and redraw.
  const exercises = t.exercises.map((e) => ({ ...e }));

  container.innerHTML = `
    <form id="template-form" class="card form" novalidate>
      <h2>${escapeHtml(options.title)}</h2>
      ${options.intro ? `<p class="muted small">${escapeHtml(options.intro)}</p>` : ""}

      <label for="t-name">Name</label>
      <input id="t-name" name="name" type="text" required autocomplete="off"
             placeholder="e.g. Leg workout" value="${escapeHtml(t.name || "")}">

      <label for="t-sport">Sport</label>
      <select id="t-sport" name="sport">
        ${SPORTS.map((s) => `<option value="${s.key}">${s.icon} ${escapeHtml(s.label)}</option>`).join("")}
      </select>

      <label for="t-type">Session type</label>
      <select id="t-type" name="session_type"></select>
      <p class="hint">The type decides how it counts for the rules (e.g. heavy legs).</p>

      <label for="t-description">Description <span class="muted">(optional)</span></label>
      <textarea id="t-description" name="description" rows="3"
        placeholder="Warm-up, structure, rest times…">${escapeHtml(t.description || "")}</textarea>

      <div class="row-2">
        <div>
          <label for="t-duration">Target duration</label>
          <input id="t-duration" name="duration" type="text" inputmode="decimal" autocomplete="off"
                 placeholder="45:00" value="${escapeHtml(formatDuration(t.target_duration_s))}">
        </div>
        <div data-field="distance">
          <label for="t-distance">Target distance (km)</label>
          <input id="t-distance" name="distance" type="number" inputmode="decimal" min="0" step="0.1"
                 value="${t.target_distance_km ?? ""}">
        </div>
      </div>

      <fieldset class="exercises">
        <legend>Exercises <span class="muted">(optional)</span></legend>
        <label for="t-rounds">Rounds <span class="muted">(for a circuit: the whole list is repeated)</span></label>
        <input id="t-rounds" name="rounds" type="number" inputmode="numeric" min="1" max="50"
               placeholder="—" value="${t.rounds ?? ""}">
        <div id="exercise-rows"></div>
        <button type="button" id="add-exercise" class="button">+ Add exercise</button>
      </fieldset>

      ${options.custom ? `
      <label class="checkbox">
        <input type="checkbox" name="add_to_catalogue">
        Also add it to my catalogue (to plan it again later)
      </label>` : `
      <label class="checkbox">
        <input type="checkbox" name="archived" ${t.archived ? "checked" : ""}>
        Archived (kept for history, hidden from the planner)
      </label>`}

      <p id="template-status" class="status" role="status"></p>

      <div class="form-actions">
        <button type="submit" class="button primary">${escapeHtml(options.saveLabel)}</button>
        <a href="${options.cancelHref}" class="button">Cancel</a>
        ${options.canDelete ? `<button type="button" id="delete" class="button danger">Delete</button>` : ""}
      </div>
    </form>
  `;

  const form = container.querySelector("#template-form");
  const status = form.querySelector("#template-status");
  const rowsEl = form.querySelector("#exercise-rows");

  form.elements.sport.value = getSport(t.sport) ? t.sport : "muscle";
  fillTypes(form, t.session_type ?? "");
  updateDistanceBox(form);
  form.elements.sport.addEventListener("change", () => {
    fillTypes(form, "");
    updateDistanceBox(form);
  });

  // ----- exercise lines -----
  function drawRows() {
    rowsEl.innerHTML = exercises.map((e, i) => `
      <div class="exercise-row" data-index="${i}">
        <input type="text" data-key="name" placeholder="Exercise (e.g. Leg extension)"
               autocomplete="off" value="${escapeHtml(e.name || "")}" aria-label="Exercise name">
        <div class="row-3">
          <label>Sets<input type="number" data-key="sets" inputmode="numeric" min="1" max="50" value="${e.sets ?? ""}"></label>
          <label>Reps / time<input type="text" data-key="reps" autocomplete="off" placeholder="10 or 45s" value="${escapeHtml(e.reps ?? "")}"></label>
          <label>kg<input type="number" data-key="weight_kg" inputmode="decimal" min="0" step="0.5" value="${e.weight_kg ?? ""}"></label>
        </div>
        <input type="text" data-key="note" placeholder="Note (optional)" autocomplete="off"
               value="${escapeHtml(e.note || "")}" aria-label="Note">
        <div class="row-actions">
          <button type="button" class="button small-button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button type="button" class="button small-button" data-move="1" ${i === exercises.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
          <button type="button" class="button small-button danger" data-remove aria-label="Remove">✕</button>
        </div>
      </div>`).join("");
  }
  drawRows();

  // Typing in a box updates the list (one listener for all rows: "event delegation").
  rowsEl.addEventListener("input", (event) => {
    const row = event.target.closest(".exercise-row");
    if (!row || !event.target.dataset.key) return;
    exercises[Number(row.dataset.index)][event.target.dataset.key] = event.target.value;
  });
  rowsEl.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const row = event.target.closest(".exercise-row");
    if (!button || !row) return;
    const i = Number(row.dataset.index);
    if ("remove" in button.dataset) exercises.splice(i, 1);
    if (button.dataset.move) {
      const j = i + Number(button.dataset.move);
      [exercises[i], exercises[j]] = [exercises[j], exercises[i]]; // swap the two lines
    }
    drawRows();
  });
  form.querySelector("#add-exercise").addEventListener("click", () => {
    exercises.push({ name: "" });
    drawRows();
    rowsEl.querySelector(".exercise-row:last-child input").focus();
  });

  // ----- save / delete -----
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = readTemplate(form, exercises);
    if (result.error) return showStatus(status, result.error, "error");

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus(status, "Saving…", "");
    try {
      await options.onSave(result.template, {
        addToCatalogue: Boolean(form.elements.add_to_catalogue && form.elements.add_to_catalogue.checked),
      });
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
      button.disabled = false;
    }
  });

  const deleteButton = form.querySelector("#delete");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      try {
        await options.onDelete();
      } catch (error) {
        showStatus(status, "Could not delete: " + error.message, "error");
      }
    });
  }
}

function fillTypes(form, selected) {
  const sport = getSport(form.elements.sport.value);
  form.elements.session_type.innerHTML =
    sport.sessionTypes.map((t) => `<option value="${t.key}">${escapeHtml(t.label)}</option>`).join("") +
    `<option value="">Just ${escapeHtml(sport.label.toLowerCase())} (no type)</option>`;
  form.elements.session_type.value = sport.sessionTypes.some((t) => t.key === selected) ? selected : "";
}

function updateDistanceBox(form) {
  const sport = getSport(form.elements.sport.value);
  form.querySelector('[data-field="distance"]').hidden = !sport.fields.includes("distance");
}

// Reads the form into { template } or { error }. Empty exercise lines are dropped.
function readTemplate(form, exercises) {
  const f = form.elements;
  const name = f.name.value.trim();
  if (!name) return { error: "Please give the session a name." };

  const durationText = f.duration.value.trim();
  const duration = durationText ? parseDuration(durationText) : null;
  if (durationText && !duration) return { error: 'Target duration not understood. Try "45:00".' };

  const sport = getSport(f.sport.value);
  const distance = sport.fields.includes("distance") && f.distance.value !== "" ? Number(f.distance.value) : null;
  if (distance !== null && !(distance > 0)) return { error: "Target distance must be more than 0." };

  const rounds = f.rounds.value === "" ? null : Number(f.rounds.value);
  if (rounds !== null && !(Number.isInteger(rounds) && rounds >= 1 && rounds <= 50)) {
    return { error: "Rounds must be a whole number between 1 and 50." };
  }

  const lines = [];
  for (const e of exercises) {
    const exerciseName = (e.name || "").trim();
    if (!exerciseName) continue;
    const sets = e.sets === "" || e.sets == null ? null : Number(e.sets);
    const weight = e.weight_kg === "" || e.weight_kg == null ? null : Number(e.weight_kg);
    if (sets !== null && !(Number.isInteger(sets) && sets >= 1 && sets <= 50)) {
      return { error: `"${exerciseName}": sets must be a whole number between 1 and 50.` };
    }
    if (weight !== null && !(weight >= 0)) return { error: `"${exerciseName}": weight must be 0 or more.` };
    const line = { name: exerciseName };
    if (sets !== null) line.sets = sets;
    if ((e.reps ?? "").toString().trim()) line.reps = e.reps.toString().trim();
    if (weight !== null) line.weight_kg = weight;
    if ((e.note || "").trim()) line.note = e.note.trim();
    lines.push(line);
  }

  return {
    template: {
      name,
      sport: sport.key,
      session_type: f.session_type.value || null,
      description: f.description.value.trim() || null,
      target_duration_s: duration,
      target_distance_km: distance,
      rounds,
      exercises: lines,
      archived: Boolean(f.archived && f.archived.checked),
    },
  };
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}
