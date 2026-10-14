// Plan tab: the weekly planner.
//   #/planner              -> this week
//   #/planner/2026-10-19   -> the week starting that Monday
//
// Each day shows its planned sessions (tap one for actions) and, in grey,
// activities you logged that day that weren't planned ("extra").

import {
  listPlannedSessions, listActivitiesBetween, listSessionTemplates,
  createPlannedSession, updatePlannedSession, deletePlannedSession, copyWeek,
  listWeekTemplates, saveWeekTemplate, applyWeekTemplate, findBlockOn,
} from "../storage.js?v=202610141721";
import { SPORTS, sportIcon, sessionTypeLabel, getSport, checkTrainingRules } from "../rules.js?v=202610141721";
import { todayISO, startOfWeek, addDays, parseISODate, formatDayLabel, formatWeekLabel } from "../utils/dates.js?v=202610141721";
import { escapeHtml, formatDuration, formatKm, formatExercise } from "../utils/format.js?v=202610141721";
import { sessionName, sessionDetails, completeSession, reopenSession, calendarItems } from "../utils/plan.js?v=202610141721";
import { openSheet } from "../utils/sheet.js?v=202610141721";
import { showToast } from "../utils/toast.js?v=202610141721";
import { loadWorkout } from "../utils/workout.js?v=202610141721";
import { blockWeek } from "./blocks.js?v=202610141721";

export function render(container, { params = [] } = {}) {
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(params[0] || "") ? params[0] : todayISO();
  drawWeek(container, startOfWeek(requested));
}


// ---------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------

async function drawWeek(container, monday) {
  const sunday = addDays(monday, 6);
  const thisMonday = startOfWeek(todayISO());

  container.innerHTML = `
    <nav class="card menu" aria-label="Planning">
      <a href="#/catalogue">📚 Session catalogue <span aria-hidden="true">›</span></a>
      <a href="#/weektemplates">📋 Week templates <span aria-hidden="true">›</span></a>
    </nav>
    <div class="week-nav">
      <a class="button small-button" href="#/planner/${addDays(monday, -7)}" aria-label="Previous week">‹</a>
      <div class="week-nav-title">
        <strong>${formatWeekLabel(monday)}</strong>
        <span class="muted small">${formatDayLabel(monday)} – ${formatDayLabel(sunday)}</span>
      </div>
      <a class="button small-button" href="#/planner/${addDays(monday, 7)}" aria-label="Next week">›</a>
    </div>
    ${workoutBannerHtml()}
    ${monday !== thisMonday ? `<a class="today-link" href="#/planner">↩ Back to this week</a>` : ""}
    <p id="week-summary" class="muted week-summary"></p>
    <a id="week-block" class="week-block" hidden></a>
    <div id="days" class="days"><p class="muted">Loading…</p></div>
    <div class="week-actions">
      <button id="templates" type="button" class="button">📋 Templates</button>
      <button id="copy-week" type="button" class="button">⧉ Copy last week into this week</button>
    </div>
  `;

  const daysEl = container.querySelector("#days");
  let sessions = [];    // this week's planned sessions
  let activities = [];  // this week's logged activities
  let warnings = [];    // training-rule warnings touching this week
  let shownWarnings = null; // warnings already seen (to pop up only new ones)

  async function load() {
    try {
      // One extra day on each side, so "Sunday + next Monday" is checked too.
      const [allSessions, allActivities] = await Promise.all([
        listPlannedSessions(addDays(monday, -1), addDays(sunday, 1)),
        listActivitiesBetween(addDays(monday, -1), addDays(sunday, 1)),
      ]);
      const inWeek = (date) => date >= monday && date <= sunday;
      sessions = allSessions.filter((s) => inWeek(s.session_date));
      activities = allActivities.filter((a) => inWeek(a.activity_date));
      warnings = checkTrainingRules(calendarItems(allSessions, allActivities))
        .filter((w) => w.days.some(inWeek));
      drawDays();
      announceNewWarnings();
    } catch (error) {
      daysEl.innerHTML = `<p class="status error"></p>`;
      daysEl.querySelector(".status").textContent = "Could not load the week: " + error.message;
    }
  }

  function drawDays() {
    const linkedIds = new Set(sessions.map((s) => s.activity_id).filter(Boolean));
    const today = todayISO();

    daysEl.innerHTML = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => {
      const daySessions = sessions.filter((s) => s.session_date === day);
      const extras = activities.filter((a) => a.activity_date === day && !linkedIds.has(a.id));
      return `
        <section class="day ${day === today ? "is-today" : ""} ${day < today ? "is-past" : ""}" data-day="${day}">
          <h2 class="day-title">
            <span>${dayHeading(day)}</span>
            <button type="button" class="day-add" data-add="${day}" aria-label="Add a session on ${formatDayLabel(day)}">+</button>
          </h2>
          ${daySessions.map(sessionCardHtml).join("")}
          ${extras.map(extraCardHtml).join("")}
          ${!daySessions.length && !extras.length ? `<p class="day-empty muted">Rest</p>` : ""}
          ${warnings.filter((w) => w.days.includes(day)).map((w) =>
            `<p class="day-warning" role="note">⚠️ ${escapeHtml(w.message)}</p>`).join("")}
        </section>`;
    }).join("");

    const planned = sessions.length;
    const done = sessions.filter((s) => s.status === "done").length;
    const cancelled = sessions.filter((s) => s.status === "cancelled").length;
    container.querySelector("#week-summary").textContent = (planned
      ? `${planned} planned · ${done} done${cancelled ? ` · ${cancelled} cancelled` : ""}`
      : "Nothing planned yet. Tap + on a day, or copy last week.")
      + (warnings.length ? ` · ⚠️ ${warnings.length} warning${warnings.length === 1 ? "" : "s"}` : "");
  }

  // After you add / move / swap something: pop up a warning it just created.
  // (Not on the first load: the warnings are already visible on the days.)
  function announceNewWarnings() {
    const keys = warnings.map((w) => w.rule + w.days.join());
    if (shownWarnings) {
      const fresh = warnings.find((w, i) => !shownWarnings.has(keys[i]));
      if (fresh) showToast("⚠️ " + fresh.message, { seconds: 8 });
    }
    shownWarnings = new Set(keys);
  }

  // One listener for the whole week ("event delegation").
  daysEl.addEventListener("click", async (event) => {
    const add = event.target.closest("[data-add]");
    if (add) return addSession(add.dataset.add);
    const card = event.target.closest("[data-session]");
    if (card) return sessionMenu(sessions.find((s) => s.id === card.dataset.session));
    const extra = event.target.closest("[data-activity]");
    if (extra) window.location.hash = `#/log/${extra.dataset.activity}`;
  });

  container.querySelector("#copy-week").addEventListener("click", async () => {
    const lastMonday = addDays(monday, -7);
    if (sessions.length && !window.confirm("This week already has sessions. Add last week's sessions on top?")) return;
    try {
      const count = await copyWeek(lastMonday, monday, addDays);
      showToast(count ? `Copied ${count} session${count === 1 ? "" : "s"} from last week` : "Last week was empty");
      await load();
    } catch (error) {
      showToast("Could not copy: " + error.message);
    }
  });

  container.querySelector("#templates").addEventListener("click", () => templatesMenu());

  // Which training block this week is in (today's, or the week's Monday).
  async function showBlock() {
    const day = todayISO() >= monday && todayISO() <= sunday ? todayISO() : monday;
    try {
      const block = await findBlockOn(day);
      if (!block) return;
      const link = container.querySelector("#week-block");
      const week = blockWeek(block, day);
      link.href = `#/blocks/${block.id}`;
      link.textContent = `📘 ${block.name} · week ${week.current} / ${week.total}`;
      link.hidden = false;
    } catch { /* not important: the planner works without it */ }
  }
  showBlock();


  // ----- week templates: save this week / apply one -----
  async function templatesMenu() {
    let templates = [];
    try {
      templates = await listWeekTemplates();
    } catch (error) {
      return showToast("Could not load the templates: " + error.message);
    }
    const toSave = sessions.filter((s) => s.status !== "cancelled");
    const choice = await openSheet({
      title: "Week templates",
      html: `
        <div class="sheet-actions">
          <button type="button" class="button primary" data-value="save" ${toSave.length ? "" : "disabled"}>
            💾 Save this week as a template</button>
        </div>
        ${toSave.length ? "" : `<p class="muted small">Plan some sessions first, then save the week.</p>`}
        <h3 class="sheet-subtitle">Apply a template to this week</h3>
        ${templates.length ? `<div class="sheet-list">${templates.map((t) => `
          <button type="button" class="sheet-item" data-value="apply:${t.id}">
            ${escapeHtml(t.name)} <span class="muted small">${t.items.length} session${t.items.length === 1 ? "" : "s"}</span>
          </button>`).join("")}</div>`
        : `<p class="muted small">No templates yet.</p>`}`,
    });
    if (!choice) return;
    if (choice === "save") return saveAsTemplate(toSave, templates);
    const template = templates.find((t) => "apply:" + t.id === choice);
    if (template) await applyTemplate(template);
  }

  async function saveAsTemplate(toSave, templates) {
    const name = await openSheet({
      title: "Save this week as a template",
      html: `
        <label for="template-name" class="sheet-subtitle">Name</label>
        <input id="template-name" type="text" maxlength="60" placeholder="e.g. Normal week" list="template-names">
        <datalist id="template-names">${templates.map((t) => `<option value="${escapeHtml(t.name)}">`).join("")}</datalist>
        <p class="muted small">${toSave.length} session${toSave.length === 1 ? "" : "s"} (cancelled ones are left out).
          Use an existing name to replace that template.</p>
        <p id="template-error" class="status error" hidden></p>
        <button type="button" class="button primary" id="template-go">Save template</button>`,
      onReady: (dialog, close) => {
        const input = dialog.querySelector("#template-name");
        const go = () => {
          const value = input.value.trim();
          if (!value) {
            const errorEl = dialog.querySelector("#template-error");
            errorEl.textContent = "Give it a name.";
            errorEl.hidden = false;
            return;
          }
          close(value);
        };
        dialog.querySelector("#template-go").addEventListener("click", go);
        input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } });
        input.focus();
      },
    });
    if (!name) return;

    // Same name (ignoring capitals) = replace that template, after asking.
    const existing = templates.find((t) => t.name.toLowerCase() === name.toLowerCase());
    if (existing && !window.confirm(`A template called "${existing.name}" already exists. Replace it with this week?`)) return;

    // weekday 1 = Monday … 7 = Sunday; keep the order inside each day.
    const items = toSave.map((s, index) => ({
      weekday: Math.round((Date.parse(s.session_date) - Date.parse(monday)) / 86400000) + 1,
      template_id: s.template_id, sport: s.sport, session_type: s.session_type, position: index,
    }));
    try {
      await saveWeekTemplate(name, items, existing ? existing.id : null);
      showToast(`📋 Saved as "${name}"`);
    } catch (error) {
      showToast("Could not save the template: " + error.message);
    }
  }

  async function applyTemplate(template) {
    if (!template.items.length) return showToast("This template is empty");
    if (sessions.length && !window.confirm(`This week already has sessions. Add "${template.name}" on top?`)) return;
    try {
      const count = await applyWeekTemplate(template, monday, addDays, sessions);
      showToast(`Added ${count} session${count === 1 ? "" : "s"} from "${template.name}"`);
      await load();
    } catch (error) {
      showToast("Could not apply the template: " + error.message);
    }
  }


  // ----- add a session -----
  async function addSession(day) {
    let templates = [];
    try {
      templates = (await listSessionTemplates()).filter((t) => !t.archived);
    } catch (error) {
      return showToast("Could not load the catalogue: " + error.message);
    }
    const quick = SPORTS.map((s) =>
      `<button type="button" class="chip-button" data-value="sport:${s.key}">${s.icon} ${escapeHtml(s.label)}</button>`).join("");
    const fromCatalogue = SPORTS.map((sport) => {
      const items = templates.filter((t) => t.sport === sport.key);
      if (!items.length) return "";
      return `<h3 class="sheet-subtitle">${sport.icon} ${escapeHtml(sport.label)}</h3>
        <div class="sheet-list">${items.map((t) =>
          `<button type="button" class="sheet-item" data-value="template:${t.id}">${escapeHtml(t.name)}</button>`).join("")}</div>`;
    }).join("");

    const choice = await openSheet({
      title: `Add on ${formatDayLabel(day)}`,
      html: `
        <h3 class="sheet-subtitle">Just a sport</h3>
        <div class="chip-row">${quick}</div>
        ${fromCatalogue || `<p class="muted">Your catalogue is empty.</p>`}`,
    });
    if (!choice) return;

    const position = sessions.filter((s) => s.session_date === day).length;
    const [kind, value] = choice.split(":");
    const values = { session_date: day, status: "planned", source: "manual", position };
    if (kind === "sport") {
      values.sport = value;
    } else {
      const t = templates.find((x) => x.id === value);
      Object.assign(values, { template_id: t.id, sport: t.sport, session_type: t.session_type });
    }
    try {
      await createPlannedSession(values);
      await load();
    } catch (error) {
      showToast("Could not add: " + error.message);
    }
  }


  // ----- tap a session: actions -----
  async function sessionMenu(session) {
    if (!session) return;
    const details = sessionDetails(session);
    const isDone = session.status === "done";
    const isCancelled = session.status === "cancelled";
    const workout = loadWorkout();
    const inProgress = workout && workout.plannedId === session.id;

    const choice = await openSheet({
      title: sessionName(session),
      html: `
        ${detailsHtml(session, details)}
        <div class="sheet-actions">
          ${!isDone && !isCancelled ? `<button type="button" class="button primary" data-value="start">▶️ ${inProgress ? "Resume" : "Start"} workout</button>
          <button type="button" class="button" data-value="done">✅ Done</button>` : ""}
          ${isDone ? `<button type="button" class="button" data-value="reopen">↩ Not done</button>` : ""}
          ${isDone && session.activity_id ? `<button type="button" class="button" data-value="open-activity">Open the logged activity</button>` : ""}
          ${!isDone ? (isCancelled
            ? `<button type="button" class="button" data-value="uncancel">↩ Un-cancel</button>`
            : `<button type="button" class="button" data-value="cancel">❌ Cancel (skipped)</button>`) : ""}
          ${!isDone ? `<button type="button" class="button" data-value="move">📅 Move to another day</button>
          <button type="button" class="button" data-value="swap">⇄ Swap this day with another day</button>` : ""}
          ${session.template_id ? `<button type="button" class="button" data-value="recipe">📚 Edit the recipe</button>` : ""}
          ${session.race_id ? `<button type="button" class="button" data-value="race">🏁 Open the race</button>` : ""}
          <button type="button" class="button danger" data-value="delete">🗑 Remove from plan</button>
        </div>`,
    });

    try {
      if (choice === "start") window.location.hash = `#/workout/${session.id}`;
      if (choice === "done") await markDone(session);
      if (choice === "reopen") await reopenSession(session.id);
      if (choice === "open-activity") window.location.hash = `#/log/${session.activity_id}`;
      if (choice === "cancel") await updatePlannedSession(session.id, { status: "cancelled" });
      if (choice === "uncancel") await updatePlannedSession(session.id, { status: "planned" });
      if (choice === "move") await moveSession(session);
      if (choice === "swap") await swapDay(session.session_date);
      if (choice === "recipe") window.location.hash = `#/catalogue/${session.template_id}`;
      if (choice === "race") window.location.hash = `#/races/${session.race_id}`;
      if (choice === "delete" && window.confirm("Remove this session from the plan?")) await deletePlannedSession(session.id);
    } catch (error) {
      showToast("Something went wrong: " + error.message);
    }
    if (choice && !["open-activity", "recipe", "start", "race"].includes(choice)) await load();
  }

  // Done: link to an activity of that day, log it now, or just tick it.
  async function markDone(session) {
    const sameDay = activities.filter((a) => a.activity_date === session.session_date);
    const linked = new Set(sessions.map((s) => s.activity_id).filter(Boolean));
    const candidates = sameDay.filter((a) => !linked.has(a.id));
    // Same sport first: the most likely match.
    candidates.sort((a, b) => (b.sport === session.sport) - (a.sport === session.sport));

    const choice = await openSheet({
      title: "Mark as done",
      html: `
        ${candidates.length ? `<h3 class="sheet-subtitle">Link to what you logged that day</h3>
          <div class="sheet-list">${candidates.map((a) => `
            <button type="button" class="sheet-item" data-value="link:${a.id}">
              ${sportIcon(a.sport)} ${escapeHtml(a.title || sessionTypeLabel(a.sport, a.session_type))}
              <span class="muted small">${[formatDuration(a.duration_s), a.distance_km != null ? formatKm(a.distance_km) : ""].filter(Boolean).join(" · ")}</span>
            </button>`).join("")}</div>` : ""}
        <div class="sheet-actions">
          <button type="button" class="button primary" data-value="log">✍️ Log it now</button>
          <button type="button" class="button" data-value="tick">✅ Just mark done (no log)</button>
        </div>`,
    });
    if (!choice) return;
    if (choice === "log") {
      window.location.hash = `#/log/new/${session.id}`; // the log form links it after saving
      return;
    }
    await completeSession(session, choice.startsWith("link:") ? choice.slice(5) : null);
  }

  async function moveSession(session) {
    const target = await openSheet({
      title: "Move to…",
      html: `${weekdayButtons(monday, session.session_date)}
        <label for="move-date" class="sheet-subtitle">Or another date</label>
        <input id="move-date" type="date" value="${session.session_date}">
        <button type="button" class="button primary" id="move-go">Move</button>`,
      onReady: (dialog, close) => {
        dialog.querySelector("#move-go").addEventListener("click", () => close(dialog.querySelector("#move-date").value));
      },
    });
    if (!target || target === session.session_date) return;
    const position = sessions.filter((s) => s.session_date === target).length;
    await updatePlannedSession(session.id, { session_date: target, position });
    if (target < monday || target > sunday) showToast(`Moved to ${formatDayLabel(target)}`);
  }

  // Swap: every session of day A goes to day B and the other way round.
  async function swapDay(day) {
    const other = await openSheet({
      title: `Swap ${formatDayLabel(day)} with…`,
      html: weekdayButtons(monday, day),
    });
    if (!other || other === day) return;
    const a = sessions.filter((s) => s.session_date === day);
    const b = sessions.filter((s) => s.session_date === other);
    await Promise.all([
      ...a.map((s) => updatePlannedSession(s.id, { session_date: other })),
      ...b.map((s) => updatePlannedSession(s.id, { session_date: day })),
    ]);
  }

  await load();
}


// ---------------------------------------------------------------------
// HTML pieces
// ---------------------------------------------------------------------

// "Workout in progress" reminder at the top of the planner.
function workoutBannerHtml() {
  const workout = loadWorkout();
  if (!workout) return "";
  return `<a class="plan-banner workout-banner" href="#/workout/${escapeHtml(workout.plannedId)}">
    🏋️ Workout in progress: <strong>${escapeHtml(workout.name)}</strong> · Resume ›</a>`;
}

function dayHeading(day) {
  const date = parseISODate(day);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "long" });
  const dayMonth = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${weekday} <span class="muted">${dayMonth}</span>`;
}

const STATUS_ICON = { planned: "", done: "✅", cancelled: "❌" };

function sessionCardHtml(session) {
  const details = sessionDetails(session);
  const bits = [];
  if (details && details.exercises && details.exercises.length) {
    bits.push(`${details.exercises.length} exercises${details.rounds ? ` · ${details.rounds} rounds` : ""}`);
  }
  if (details && details.target_duration_s) bits.push(formatDuration(details.target_duration_s));
  if (details && details.target_distance_km) bits.push(`${Number(details.target_distance_km)} km`);
  if (session.status === "done" && session.activity) {
    const a = session.activity;
    bits.push("Logged: " + [formatDuration(a.duration_s), a.distance_km != null ? formatKm(a.distance_km) : ""].filter(Boolean).join(" · "));
  }
  return `
    <button type="button" class="plan-card status-${session.status}" data-session="${session.id}">
      <span class="activity-icon" aria-hidden="true">${sportIcon(session.sport)}</span>
      <span class="activity-main">
        <span class="activity-title">${escapeHtml(sessionName(session))}</span>
        ${bits.length ? `<span class="muted small">${escapeHtml(bits.join(" · "))}</span>` : ""}
      </span>
      <span class="plan-status" aria-label="${session.status}">${STATUS_ICON[session.status]}</span>
    </button>`;
}

function extraCardHtml(a) {
  return `
    <button type="button" class="plan-card extra" data-activity="${a.id}">
      <span class="activity-icon" aria-hidden="true">${sportIcon(a.sport)}</span>
      <span class="activity-main">
        <span class="activity-title">${escapeHtml(a.title || sessionTypeLabel(a.sport, a.session_type))}</span>
        <span class="muted small">Not planned · ${escapeHtml([formatDuration(a.duration_s), a.distance_km != null ? formatKm(a.distance_km) : ""].filter(Boolean).join(" · "))}</span>
      </span>
    </button>`;
}

// The recipe (or frozen photo) inside the action sheet.
function detailsHtml(session, details) {
  const sport = getSport(session.sport);
  const lines = [];
  lines.push(`<p class="muted small">${sport ? sport.icon + " " + escapeHtml(sport.label) : ""}${session.session_type ? " · " + escapeHtml(sessionTypeLabel(session.sport, session.session_type)) : ""}${session.status === "done" && session.details ? " · frozen when done" : ""}</p>`);
  if (!details) return lines.join("");
  if (details.description) lines.push(`<p class="pre-line">${escapeHtml(details.description)}</p>`);
  const targets = [details.target_duration_s ? formatDuration(details.target_duration_s) : "",
    details.target_distance_km ? `${Number(details.target_distance_km)} km` : ""].filter(Boolean);
  if (targets.length) lines.push(`<p><strong>Target:</strong> ${escapeHtml(targets.join(" · "))}</p>`);
  if (details.exercises && details.exercises.length) {
    lines.push(`${details.rounds ? `<p><strong>${details.rounds} rounds of:</strong></p>` : ""}
      <ul class="exercise-list">${details.exercises.map((e) => `
        <li>${escapeHtml(formatExercise(e))}${e.note ? ` <span class="muted small">(${escapeHtml(e.note)})</span>` : ""}${e.total_sets ? ` <span class="muted small">✓ ${e.done_sets}/${e.total_sets}</span>` : ""}</li>`).join("")}</ul>`);
  }
  return lines.join("");
}

// Mon … Sun buttons for "move to" / "swap with".
function weekdayButtons(monday, current) {
  return `<div class="chip-row">${Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => {
    const label = parseISODate(day).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
    return `<button type="button" class="chip-button" data-value="${day}" ${day === current ? "disabled" : ""}>${label}</button>`;
  }).join("")}</div>`;
}
