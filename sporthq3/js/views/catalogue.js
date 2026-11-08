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
} from "../storage.js?v=202611081505";
import { SPORTS, getSport, sportIcon, sessionTypeLabel } from "../rules.js?v=202611081505";
import { escapeHtml, formatDuration, parseDuration, parseDecimal } from "../utils/format.js?v=202611081505";
import { startOfWeek, formatDayLabel } from "../utils/dates.js?v=202611081505";
import { isCustomSession, isPlainSession, canAdjustSession, snapshotOf, sessionName, sportBadge } from "../utils/plan.js?v=202611081505";
import { icon } from "../utils/icons.js?v=202611081505";
import { withCircuits, inCircuit, circuitCount } from "../utils/circuits.js?v=202611081505";

export function render(container, { params = [] } = {}) {
  if (params[0] === "new") return renderEditor(container, null);
  if (params[0]) return renderEditor(container, params[0]);
  renderList(container);
}


// ---------- The list ----------

async function renderList(container) {
  container.innerHTML = `
    <a href="#/catalogue/new" class="button primary add-button" aria-label="New session"><span class="add-plus" aria-hidden="true">+</span> <span class="add-text">New session</span></a>
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
          <h2 class="week-title"><span>${sportIcon(group.sport.key)} ${escapeHtml(group.sport.label)}</span>
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

// "1 circuit", "2 circuits" (an old session-wide rounds counts as one).
function circuitText(t) {
  const count = circuitCount(t);
  return count ? `${count} circuit${count === 1 ? "" : "s"}` : "";
}

function templateItemHtml(t) {
  const summary = [
    // the type, unless it just repeats the name ("Long run" / "Long run")
    t.session_type && sessionTypeLabel(t.sport, t.session_type) !== t.name ? sessionTypeLabel(t.sport, t.session_type) : "",
    t.exercises.length ? `${t.exercises.length} exercise${t.exercises.length === 1 ? "" : "s"}` : "",
    circuitText(t),
    t.target_duration_s ? formatDuration(t.target_duration_s) : "",
    t.target_distance_km ? `${Number(t.target_distance_km)} km` : "",
  ].filter(Boolean).join(" · ");
  return `
    <li>
      <a class="activity-item" href="#/catalogue/${encodeURIComponent(t.id)}">
        ${sportBadge(t.sport, sportIcon)}
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
    // Editable: a custom session, a "just a sport" one (no recipe, no
    // details yet: saving gives it its own details = it becomes custom), or
    // a catalogue one adjusted for this day only (it becomes a custom copy).
    const editable = planned && (isCustomSession(planned) || isPlainSession(planned) || canAdjustSession(planned));
    if (!editable || planned.status !== "planned") {
      container.innerHTML = `<section class="card"><p>This custom session can't be edited (any more).</p>
        <a class="button" href="#/planner">Back to the plan</a></section>`;
      return;
    }
    date = planned.session_date;
  }
  const backToPlan = `#/planner/${startOfWeek(date)}`;
  const addingDetails = Boolean(planned && isPlainSession(planned));
  const adjusting = Boolean(planned && canAdjustSession(planned));
  let t = { sport: "muscle", exercises: [] };
  if (addingDetails) t = { name: sessionName(planned), sport: planned.sport, session_type: planned.session_type, exercises: [] };
  else if (adjusting) t = { ...snapshotOf(planned.template), sport: planned.sport, session_type: planned.session_type };
  else if (planned) t = { ...planned.details, sport: planned.sport, session_type: planned.session_type };

  drawEditor(container, t, {
    title: addingDetails ? "Add details" : adjusting ? "Adjust this session" : planned ? "Edit custom session" : "Custom session",
    intro: adjusting
      ? `Only for ${formatDayLabel(date)}: the recipe "${planned.template.name}" in your catalogue stays as it is.`
      : "Just for this day. It isn't added to your catalogue unless you tick the box below.",
    saveLabel: planned ? "Save changes" : "Add to the plan",
    cancelHref: backToPlan,
    custom: true,
    onSave: async (recipe, { addToCatalogue }) => {
      // archived is a catalogue thing; the rest is the session's content.
      const { archived, ...content } = recipe;
      // title: null so the name typed here is the one shown (a session's
      // own title would win over it, see sessionName).
      const values = { sport: recipe.sport, session_type: recipe.session_type, title: null };
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
  // write into it as you type, and buttons (↑ ↓ remove +) change it and redraw.
  // Circuits (step 38): `linked` = "in a circuit with the line above"; the
  // circuit's rounds are kept on its first line. (An old session-wide rounds
  // becomes one circuit here, and is saved that way.)
  const lines = withCircuits(t);
  const exercises = lines.map((e, i) => {
    const { block, ...rest } = e;
    const prev = lines[i - 1];
    return { ...rest, linked: i > 0 && inCircuit(e) && inCircuit(prev) && prev.block === block };
  });

  container.innerHTML = `
    <form id="template-form" class="card form" novalidate>
      <h2>${escapeHtml(options.title)}</h2>
      ${options.intro ? `<p class="muted small">${escapeHtml(options.intro)}</p>` : ""}

      <label for="t-name">Name</label>
      <input id="t-name" name="name" type="text" required autocomplete="off"
             placeholder="e.g. Leg workout" value="${escapeHtml(t.name || "")}">

      <label for="t-sport">Sport</label>
      <select id="t-sport" name="sport">
        ${SPORTS.map((s) => `<option value="${s.key}">${escapeHtml(s.label)}</option>`).join("")}
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
          <input id="t-distance" name="distance" type="text" inputmode="decimal" autocomplete="off"
                 value="${t.target_distance_km ?? ""}">
        </div>
      </div>

      <fieldset class="exercises">
        <legend>Exercises <span class="muted">(optional)</span></legend>
        <p class="hint">Circuit (e.g. 3 × push-ups + gainage): tick "Circuit with the exercise above" on the
          second exercise, then give the circuit its rounds.</p>
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
    rowsEl.innerHTML = exercises.map((e, i) => {
      const starts = startsCircuit(exercises, i);
      const inGroup = starts || e.linked;
      return `
      <div class="exercise-row${inGroup ? " in-circuit" : ""}${starts ? " circuit-start" : ""}" data-index="${i}">
        ${starts ? `
        <div class="circuit-head">
          <span class="circuit-title">${icon("repeat")} Circuit</span>
          <label>Rounds<input type="number" data-key="rounds" inputmode="numeric" min="1" max="50" placeholder="3"
                 value="${escapeHtml(e.rounds ?? "")}"></label>
        </div>` : ""}
        <input type="text" data-key="name" placeholder="Exercise (e.g. Leg extension)"
               autocomplete="off" value="${escapeHtml(e.name || "")}" aria-label="Exercise name">
        <div class="${inGroup ? "row-2" : "row-3"}">
          ${inGroup ? "" : `<label>Sets<input type="number" data-key="sets" inputmode="numeric" min="1" max="50" value="${e.sets ?? ""}"></label>`}
          <label>Reps / time<input type="text" data-key="reps" autocomplete="off" placeholder="10 or 45s" value="${escapeHtml(e.reps ?? "")}"></label>
          <label>kg<input type="text" data-key="weight_kg" inputmode="decimal" autocomplete="off" value="${e.weight_kg ?? ""}"></label>
        </div>
        <input type="text" data-key="note" placeholder="Note (optional)" autocomplete="off"
               value="${escapeHtml(e.note || "")}" aria-label="Note">
        ${i > 0 ? `
        <label class="checkbox circuit-link">
          <input type="checkbox" data-link ${e.linked ? "checked" : ""}> Circuit with the exercise above
        </label>` : ""}
        <div class="row-actions">
          <button type="button" class="button small-button" data-move="-1" ${i === 0 ? "disabled" : ""} aria-label="Move up">↑</button>
          <button type="button" class="button small-button" data-move="1" ${i === exercises.length - 1 ? "disabled" : ""} aria-label="Move down">↓</button>
          <button type="button" class="button small-button danger" data-remove aria-label="Remove">${icon("x")}</button>
        </div>
      </div>`;
    }).join("");
  }
  drawRows();

  // Typing in a box updates the list (one listener for all rows: "event delegation").
  rowsEl.addEventListener("input", (event) => {
    const row = event.target.closest(".exercise-row");
    if (!row || !event.target.dataset.key) return;
    exercises[Number(row.dataset.index)][event.target.dataset.key] = event.target.value;
  });
  // "Circuit with the exercise above" ticked / unticked.
  rowsEl.addEventListener("change", (event) => {
    if (!("link" in event.target.dataset)) return;
    const i = Number(event.target.closest(".exercise-row").dataset.index);
    exercises[i].linked = event.target.checked;
    if (exercises[i].linked) {
      // A new circuit: suggest the first exercise's sets as its rounds.
      let start = i - 1;
      while (start > 0 && exercises[start].linked) start--;
      const first = exercises[start];
      if (first.rounds == null || first.rounds === "") first.rounds = first.sets ?? "";
    }
    drawRows();
  });
  rowsEl.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    const row = event.target.closest(".exercise-row");
    if (!button || !row) return;
    const i = Number(row.dataset.index);
    if ("remove" in button.dataset) {
      // Removing the first line of a circuit: the next line leads it now.
      const next = exercises[i + 1];
      if (!exercises[i].linked && next && next.linked) {
        next.linked = false;
        next.rounds = exercises[i].rounds;
      }
      exercises.splice(i, 1);
    }
    if (button.dataset.move) {
      // Swap the two exercises; the circuits stay where they are (the
      // "linked" ticks and the rounds belong to the position, not the exercise).
      const j = i + Number(button.dataset.move);
      const a = exercises[i];
      const b = exercises[j];
      exercises[i] = { ...b, linked: a.linked, rounds: a.rounds };
      exercises[j] = { ...a, linked: b.linked, rounds: b.rounds };
    }
    drawRows();
  });
  form.querySelector("#add-exercise").addEventListener("click", () => {
    exercises.push({ name: "", linked: false });
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

// Does line i start a circuit? (not linked itself, the next one is)
function startsCircuit(exercises, i) {
  return !exercises[i].linked && Boolean(exercises[i + 1] && exercises[i + 1].linked);
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
  const distance = sport.fields.includes("distance") ? parseDecimal(f.distance.value) : null;
  if (distance !== null && !(distance > 0)) return { error: "Target distance must be more than 0." };

  const lines = [];
  let circuit = null; // { block, rounds } while we're inside a circuit
  let blockCount = 0;
  for (const [i, e] of exercises.entries()) {
    if (startsCircuit(exercises, i)) {
      const rounds = Number(e.rounds);
      if (!(String(e.rounds ?? "").trim() && Number.isInteger(rounds) && rounds >= 1 && rounds <= 50)) {
        const label = (e.name || "").trim() || (exercises[i + 1].name || "").trim() || "a circuit";
        return { error: `Circuit starting with "${label}": rounds must be a whole number between 1 and 50.` };
      }
      blockCount++;
      circuit = { block: blockCount, rounds };
    } else if (!e.linked) {
      circuit = null;
    }
    const exerciseName = (e.name || "").trim();
    if (!exerciseName) continue;
    const sets = circuit || e.sets === "" || e.sets == null ? null : Number(e.sets);
    const weight = parseDecimal(e.weight_kg); // "27,5" works too
    if (sets !== null && !(Number.isInteger(sets) && sets >= 1 && sets <= 50)) {
      return { error: `"${exerciseName}": sets must be a whole number between 1 and 50.` };
    }
    if (weight !== null && !(weight >= 0)) return { error: `"${exerciseName}": weight must be 0 or more.` };
    const line = { name: exerciseName };
    if (circuit) {
      line.block = circuit.block; // in a circuit, rounds decide (no sets)
      line.rounds = circuit.rounds;
    } else if (sets !== null) {
      line.sets = sets;
    }
    if ((e.reps ?? "").toString().trim()) line.reps = e.reps.toString().trim();
    if (weight !== null) line.weight_kg = weight;
    if ((e.note || "").trim()) line.note = e.note.trim();
    lines.push(line);
  }
  // A "circuit" left with one exercise (the other lines were empty) is just
  // that exercise, with its rounds as sets.
  for (const line of lines) {
    if (line.block != null && lines.filter((l) => l.block === line.block).length < 2) {
      line.sets = line.rounds;
      delete line.block;
      delete line.rounds;
    }
  }

  return {
    template: {
      name,
      sport: sport.key,
      session_type: f.session_type.value || null,
      description: f.description.value.trim() || null,
      target_duration_s: duration,
      target_distance_km: distance,
      rounds: null, // circuits now live on the exercise lines (step 38)
      exercises: lines,
      archived: Boolean(f.archived && f.archived.checked),
    },
  };
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}
