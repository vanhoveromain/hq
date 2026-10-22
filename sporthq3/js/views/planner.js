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
  listRacesBetween, getMutedWarnings, saveMutedWarnings,
} from "../storage.js?v=202610221143";
import { SPORTS, sportIcon, sessionTypeLabel, getSport, checkTrainingRules, LOAD_RULES, dayLoadTag } from "../rules.js?v=202610221143";
import { todayISO, startOfWeek, addDays, parseISODate, formatDayLabel, formatWeekLabel } from "../utils/dates.js?v=202610221143";
import { escapeHtml, formatDuration, formatHours, formatKm, formatExercise, numHtml } from "../utils/format.js?v=202610221143";
import {
  sessionName, sessionDetails, reopenSession, calendarItems, daySummary,
  isCustomSession, isPlainSession, addToCatalogue, sportBadge, racesNotPlanned, plannedSeconds,
} from "../utils/plan.js?v=202610221143";
import { overview } from "../utils/stats.js?v=202610221143";
import { weekLoadNotes } from "../utils/load.js?v=202610221143";
import { openSheet, sheetRowHtml } from "../utils/sheet.js?v=202610221143";
import { doneInOneTap } from "../utils/quickLog.js?v=202610221143";
import { setTopbarAction } from "../utils/topbar.js?v=202610221143";
import { showToast } from "../utils/toast.js?v=202610221143";
import { loadWorkout } from "../utils/workout.js?v=202610221143";
import { blockWeek } from "./blocks.js?v=202610221143";
import { enableDragToDay } from "../utils/dragDrop.js?v=202610221143";
import { icon } from "../utils/icons.js?v=202610221143";

// Week or month view; the last one you used is remembered on this device.
//   #/planner                -> your last view (week by default)
//   #/planner/2026-10-19     -> the week containing that day
//   #/planner/month/2026-10  -> that month
const VIEW_KEY = "sporthq3.planView";

export function render(container, { params = [] } = {}) {
  if (params[0] === "month") {
    const month = /^\d{4}-\d{2}$/.test(params[1] || "") ? params[1] : todayISO().slice(0, 7);
    rememberView("month");
    return drawMonth(container, month);
  }
  if (!params[0] && readView() === "month") return drawMonth(container, todayISO().slice(0, 7));
  const requested = /^\d{4}-\d{2}-\d{2}$/.test(params[0] || "") ? params[0] : todayISO();
  rememberView("week");
  drawWeek(container, startOfWeek(requested));
}

function readView() {
  try { return localStorage.getItem(VIEW_KEY) || "week"; } catch { return "week"; }
}
function rememberView(view) {
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* not important */ }
}

// The "Week | Month" switch at the top of both views.
function viewSwitchHtml(active, weekHref, monthHref) {
  return `<div class="view-switch" role="tablist" aria-label="View">
    <a href="${weekHref}" role="tab" aria-selected="${active === "week"}">Week</a>
    <a href="${monthHref}" role="tab" aria-selected="${active === "month"}">Month</a>
  </div>`;
}

// "‹ This week ›" (or the month) + the Week | Month switch, on one row (20a).
function headHtml({ prevHref, prevLabel, nextHref, nextLabel, title, subtitle, switchHtml }) {
  return `
    <div class="week-head">
      <a class="nav-button" href="${prevHref}" aria-label="${prevLabel}">${icon("chevron-left")}</a>
      <div class="week-nav-title">
        <strong>${escapeHtml(title)}</strong>
        ${subtitle ? `<span class="muted small">${escapeHtml(subtitle)}</span>` : ""}
      </div>
      <a class="nav-button" href="${nextHref}" aria-label="${nextLabel}">${icon("chevron-right")}</a>
      ${switchHtml}
    </div>`;
}

// "19 – 25 Oct", or "28 Sept – 4 Oct" when the week runs over two months.
function rangeLabel(monday, sunday) {
  const start = parseISODate(monday);
  const end = parseISODate(sunday);
  const month = (date) => date.toLocaleDateString("en-GB", { month: "short" });
  return start.getMonth() === end.getMonth()
    ? `${start.getDate()} – ${end.getDate()} ${month(end)}`
    : `${start.getDate()} ${month(start)} – ${end.getDate()} ${month(end)}`;
}

// The "⋯" menu of the month view: the planning screens (20a).
async function monthMenu() {
  const choice = await openSheet({
    title: "Planning",
    html: `<div class="sheet-rows">
      ${sheetRowHtml("catalogue", "library", "Session catalogue")}
      ${sheetRowHtml("manage", "clipboard-list", "Week templates")}
    </div>`,
  });
  if (choice === "catalogue") window.location.hash = "#/catalogue";
  if (choice === "manage") window.location.hash = "#/weektemplates";
}


// ---------------------------------------------------------------------
// The week
// ---------------------------------------------------------------------

async function drawWeek(container, monday) {
  const sunday = addDays(monday, 6);
  const thisMonday = startOfWeek(todayISO());

  // The planning tools (catalogue, templates, copy last week) live in the
  // "⋯" of the top bar (20a), so the week starts right at the top.
  setTopbarAction({ iconName: "more", label: "Planning: catalogue, templates, copy last week", onClick: () => planningMenu() });
  container.innerHTML = `
    <div class="planner">
    ${headHtml({
      prevHref: `#/planner/${addDays(monday, -7)}`, prevLabel: "Previous week",
      nextHref: `#/planner/${addDays(monday, 7)}`, nextLabel: "Next week",
      title: formatWeekLabel(monday), subtitle: rangeLabel(monday, sunday),
      switchHtml: viewSwitchHtml("week", `#/planner/${monday}`, `#/planner/month/${monday.slice(0, 7)}`),
    })}
    ${workoutBannerHtml()}
    ${monday !== thisMonday ? `<a class="today-link" href="#/planner">${icon("undo-2")} Back to this week</a>` : ""}
    <div class="card dash-strip plan-strip">
      <span><span class="strip-label">Done</span><span id="strip-done">–</span></span>
      <span><span class="strip-label">Load</span><span id="strip-load">–</span></span>
      <button type="button" class="strip-cell" id="strip-warnings" disabled>
        <span class="strip-label">Warnings</span><span id="strip-warnings-count">–</span></button>
    </div>
    <div class="week-links">
      <a id="week-block" class="week-block" hidden></a>
      ${monday <= thisMonday ? `<a class="week-review-link" href="#/review/${monday}">${icon("notebook-pen")} Week review</a>` : ""}
    </div>
    <p id="week-empty" class="muted week-summary" hidden>Nothing planned yet. Tap + on a day, or ⋯ (top right) to copy last week or apply a template.</p>
    <div id="week-load"></div>
    <div id="days" class="days"><p class="muted">Loading…</p></div>
    </div>
  `;

  const daysEl = container.querySelector("#days");
  let sessions = [];    // this week's planned sessions
  let activities = [];  // this week's logged activities
  let races = [];       // this week's races from the Races tab (registered / to register)
  let warnings = [];    // training-rule warnings touching this week (muted ones included)
  let muted = [];       // warning texts marked "my normal pattern"
  let loadNotes = [];   // "big jump" / "race week" notes (16f)
  let shownWarnings = null; // warnings already seen (to pop up only new ones)
  const active = () => warnings.filter((w) => !w.muted);

  async function load() {
    try {
      // One extra day on each side, so "Sunday + next Monday" is checked too.
      // + the weeks before, for "your usual week" (load check). For a future
      // week that's the weeks before THIS week: the ones in between aren't logged yet.
      const usualEnd = monday > thisMonday ? thisMonday : monday;
      const [allSessions, allActivities, allRaces, mutedList, previousActivities] = await Promise.all([
        listPlannedSessions(addDays(monday, -1), addDays(sunday, 1)),
        listActivitiesBetween(addDays(monday, -1), addDays(sunday, 1)),
        listRacesBetween(addDays(monday, -1), addDays(sunday, 1)),
        getMutedWarnings().catch(() => []), // never block the week for this
        listActivitiesBetween(addDays(usualEnd, -7 * LOAD_RULES.averageWeeks), addDays(usualEnd, -1)),
      ]);
      const inWeek = (date) => date >= monday && date <= sunday;
      sessions = allSessions.filter((s) => inWeek(s.session_date));
      activities = allActivities.filter((a) => inWeek(a.activity_date));
      races = allRaces.filter((r) => inWeek(r.race_date));
      muted = mutedList;
      warnings = checkTrainingRules(calendarItems(allSessions, allActivities, allRaces), muted)
        .filter((w) => w.days.some(inWeek));
      loadNotes = weekLoadNotes({ sessions, activities, previousActivities, races });
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
    const inWeek = (d) => d >= monday && d <= sunday;
    const items = calendarItems(sessions, activities, races);
    // Where each warning shows (20a):
    //  - about two days of this week in a row: one small chip BETWEEN the two
    //    day cards (phone), and inside the later day on a laptop (7 columns)
    //  - otherwise: a chip inside its (latest) day of this week
    const between = {}; // first day -> chips shown after that day's card
    const inside = {};  // day -> chips inside that day
    const push = (map, day, html) => { (map[day] = map[day] || []).push(html); };
    warnings.forEach((w, index) => {
      const days = w.days.filter(inWeek).sort();
      if (w.days.length === 2 && days.length === 2) {
        push(between, days[0], warningChipHtml(w, index, "warning-between"));
        push(inside, days[1], warningChipHtml(w, index, "warning-dup"));
      } else {
        push(inside, days[days.length - 1], warningChipHtml(w, index));
      }
    });

    daysEl.innerHTML = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => {
      const daySessions = sessions.filter((s) => s.session_date === day);
      const extras = activities.filter((a) => a.activity_date === day && !linkedIds.has(a.id));
      const dayRaces = racesNotPlanned(races, sessions).filter((r) => r.race_date === day);
      const tag = dayLoadTag(items.filter((item) => item.date === day));
      return `
        <section class="day ${day === today ? "is-today" : ""} ${day < today ? "is-past" : ""}" data-day="${day}">
          <h2 class="day-title">
            <span class="day-name">${dayHeading(day)}</span>
            ${day === today ? `<span class="day-tag is-today">Today</span>` : ""}
            ${tag ? `<span class="day-tag tag-${tag.key}">${escapeHtml(tag.label)}</span>` : ""}
            <button type="button" class="day-add" data-add="${day}" aria-label="Add a session on ${formatDayLabel(day)}">${icon("plus")}</button>
          </h2>
          ${dayRaces.map(raceMarkerHtml).join("")}
          ${daySessions.map((session) => sessionCardHtml(session, today)).join("")}
          ${extras.map(extraCardHtml).join("")}
          ${(inside[day] || []).join("")}
        </section>
        ${(between[day] || []).join("")}`;
    }).join("");

    // The stat strip: done / planned, hours done / planned, warnings.
    const counted = sessions.filter((s) => s.status !== "cancelled");
    const done = counted.filter((s) => s.status === "done").length;
    const planned = plannedSeconds(sessions).seconds;
    const count = active().length;
    container.querySelector("#strip-done").innerHTML = counted.length
      ? `${numHtml(done)}<span class="num of"> / ${counted.length}</span>` : numHtml("–");
    container.querySelector("#strip-load").innerHTML = `${numHtml(formatHours(overview(activities).seconds))}${planned
      ? ` <span class="unit">/ ${escapeHtml(formatHours(planned))}</span>` : ""}`;
    const warningsButton = container.querySelector("#strip-warnings");
    container.querySelector("#strip-warnings-count").innerHTML = numHtml(count);
    warningsButton.classList.toggle("is-warning", count > 0);
    warningsButton.disabled = count === 0;
    container.querySelector("#week-empty").hidden = sessions.length > 0;
    container.querySelector("#week-load").innerHTML = loadNotes
      .map((note) => `<p class="plan-banner load-banner" role="note">${icon("trending-up")} ${escapeHtml(note)}</p>`).join("");
  }

  // Warnings in the stat strip: tap = scroll to the first warning chip you can see.
  container.querySelector("#strip-warnings").addEventListener("click", () => {
    const chip = [...daysEl.querySelectorAll(".warning-chip:not(.is-muted)")].find((el) => el.offsetParent !== null);
    if (chip) chip.scrollIntoView({ behavior: "smooth", block: "center" });
  });

  // After you add / move / swap something: pop up a warning it just created.
  // (Not on the first load: the warnings are already visible on the days.)
  function announceNewWarnings() {
    const list = active();
    const keys = list.map((w) => w.rule + w.days.join());
    if (shownWarnings) {
      const fresh = list.find((w, i) => !shownWarnings.has(keys[i]));
      if (fresh) showToast(fresh.message, { seconds: 8 });
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
    const warning = event.target.closest("[data-warning]");
    if (warning) return warningMenu(warnings[Number(warning.dataset.warning)]);
  });

  // Tap a warning: "this is my normal pattern" (mute) or "warn me again".
  // Race warnings are one-off: the sheet only shows the full message.
  async function warningMenu(w) {
    if (!w) return;
    if (!w.canMute) {
      await openSheet({ title: "Warning", html: `<p>${escapeHtml(w.message)}</p>
        <p class="muted small">This one is about this race only, so it can't be muted.</p>` });
      return;
    }
    const choice = await openSheet({
      title: w.muted ? "Muted warning" : "Warning",
      html: `
        <p>${escapeHtml(w.message)}</p>
        <p class="muted small">${w.muted
          ? "You said this is your normal pattern, so it isn't counted or shown on Home."
          : "If this is how you always train, mute it: it won't be counted, popped up or shown on Home any more (it stays here, greyed). Settings lists what you muted."}</p>
        <div class="sheet-actions">
          ${w.muted
            ? `<button type="button" class="button primary" data-value="unmute">${icon("bell")} Warn me again</button>`
            : `<button type="button" class="button primary" data-value="mute">${icon("bell-off")} This is my normal pattern</button>`}
        </div>`,
    });
    if (!choice) return;
    const next = choice === "mute" ? [...muted, w.message] : muted.filter((m) => m !== w.message);
    try {
      await saveMutedWarnings(next);
      showToast(choice === "mute" ? "Muted" : "You'll be warned again");
      await load();
    } catch (error) {
      showToast("Could not save: " + error.message);
    }
  }

  // The "⋯" menu (top bar): the planning tools of this week.
  async function planningMenu() {
    const choice = await openSheet({
      title: "Planning",
      html: `<div class="sheet-rows">
        ${sheetRowHtml("copy", "copy", "Copy last week into this week")}
        ${sheetRowHtml("templates", "clipboard-list", "Save or apply a week template")}
        ${sheetRowHtml("catalogue", "library", "Session catalogue")}
        ${sheetRowHtml("manage", "list", "Manage week templates")}
      </div>`,
    });
    if (choice === "copy") await copyLastWeek();
    if (choice === "templates") await templatesMenu();
    if (choice === "catalogue") window.location.hash = "#/catalogue";
    if (choice === "manage") window.location.hash = "#/weektemplates";
  }

  async function copyLastWeek() {
    const lastMonday = addDays(monday, -7);
    const mode = await askAddOrReplace("last week's sessions");
    if (!mode) return;
    try {
      if (mode === "replace") await clearWeekForReplace();
      const count = await copyWeek(lastMonday, monday, addDays);
      showToast(count ? `Copied ${count} session${count === 1 ? "" : "s"} from last week` : "Last week was empty");
      await load();
    } catch (error) {
      showToast("Could not copy: " + error.message);
    }
  }

  // Drag a card onto another day (done sessions stay put: they're tied to a log).
  enableDragToDay(daysEl, {
    canDrag: (card) => {
      const session = sessions.find((s) => s.id === card.dataset.session);
      return Boolean(session) && session.status !== "done";
    },
    onDrop: async (sessionId, day) => {
      try {
        const position = sessions.filter((s) => s.session_date === day).length;
        await updatePlannedSession(sessionId, { session_date: day, position });
        await load();
      } catch (error) {
        showToast("Could not move: " + error.message);
      }
    },
  });

  // Which training block this week is in (today's, or the week's Monday).
  async function showBlock() {
    const day = todayISO() >= monday && todayISO() <= sunday ? todayISO() : monday;
    try {
      const block = await findBlockOn(day);
      if (!block) return;
      const link = container.querySelector("#week-block");
      const week = blockWeek(block, day);
      link.href = `#/blocks/${block.id}`;
      link.innerHTML = `${icon("book-open")} ${escapeHtml(block.name)} · week ${week.current} / ${week.total}`;
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
    // Cancelled and race-routine sessions aren't part of a "normal" week.
    const toSave = sessions.filter((s) => s.status !== "cancelled" && !s.race_id);
    const choice = await openSheet({
      title: "Week templates",
      html: `
        <div class="sheet-actions">
          <button type="button" class="button primary" data-value="save" ${toSave.length ? "" : "disabled"}>
            ${icon("save")} Save this week as a template</button>
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
    const customCount = toSave.filter(isCustomSession).length;
    const name = await openSheet({
      title: "Save this week as a template",
      html: `
        <label for="template-name" class="sheet-subtitle">Name</label>
        <input id="template-name" type="text" maxlength="60" placeholder="e.g. Normal week" list="template-names">
        <datalist id="template-names">${templates.map((t) => `<option value="${escapeHtml(t.name)}">`).join("")}</datalist>
        <p class="muted small">${toSave.length} session${toSave.length === 1 ? "" : "s"} (cancelled and race-routine ones are left out).
          Use an existing name to replace that template.</p>
        ${customCount ? `<p class="status warning">${icon("alert-triangle")} ${customCount} custom session${customCount === 1 ? " is" : "s are"} not in your catalogue:
          the template only keeps ${customCount === 1 ? "its" : "their"} sport, not the exercises.
          Add ${customCount === 1 ? "it" : "them"} to your catalogue first to keep everything.</p>` : ""}
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
      showToast(`Saved as "${name}"`);
    } catch (error) {
      showToast("Could not save the template: " + error.message);
    }
  }

  // The week isn't empty: add on top, or replace what's planned?
  // Returns "add", "replace" or null (closed). An empty week just adds.
  async function askAddOrReplace(what) {
    const replaceable = sessions.filter(isReplaceable);
    if (!sessions.length) return "add";
    const kept = sessions.length - replaceable.length;
    return openSheet({
      title: "This week already has sessions",
      html: `
        <p>Add ${escapeHtml(what)} on top of them, or replace them?</p>
        ${kept ? `<p class="muted small">Replace keeps the ${kept} session${kept === 1 ? "" : "s"} already done
          or from a race routine.</p>` : ""}
        <div class="sheet-actions">
          <button type="button" class="button primary" data-value="replace" ${replaceable.length ? "" : "disabled"}>
            Replace this week</button>
          <button type="button" class="button" data-value="add">Add on top</button>
        </div>`,
    });
  }

  // "Replace" removes the sessions not done yet. Done ones (they match a
  // log) and race-routine ones (they belong to a race) stay.
  function isReplaceable(s) {
    return s.status !== "done" && !s.race_id;
  }
  async function clearWeekForReplace() {
    await Promise.all(sessions.filter(isReplaceable).map((s) => deletePlannedSession(s.id)));
  }

  async function applyTemplate(template) {
    if (!template.items.length) return showToast("This template is empty");
    const mode = await askAddOrReplace(`"${template.name}"`);
    if (!mode) return;
    try {
      if (mode === "replace") await clearWeekForReplace();
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
    const choice = await pickSessionToAdd(day, templates);
    if (!choice) return;
    if (choice === "custom") {
      window.location.hash = `#/custom/new/${day}`;
      return;
    }

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


  // Two short steps instead of one long list: first the sport, then a session
  // of that sport ("just a sport" or a catalogue recipe). Returns "sport:<key>",
  // "template:<id>", "custom" or null (closed).
  async function pickSessionToAdd(day, templates) {
    while (true) {
      const sportItems = SPORTS.map((sport) => {
        const count = templates.filter((t) => t.sport === sport.key).length;
        const hint = count ? `<span class="muted small"> · ${count} in catalogue</span>` : "";
        return `<button type="button" class="sheet-item" data-value="${sport.key}">${sportIcon(sport.key)} ${escapeHtml(sport.label)}${hint}</button>`;
      }).join("");
      const sportKey = await openSheet({
        title: `Add on ${formatDayLabel(day)}`,
        html: `
          <div class="sheet-list">${sportItems}</div>
          <h3 class="sheet-subtitle">Something else</h3>
          <div class="sheet-actions">
            <button type="button" class="button" data-value="custom">${icon("pencil")} Custom session (not in the catalogue)</button>
          </div>`,
      });
      if (!sportKey || sportKey === "custom") return sportKey;

      // Nothing in the catalogue for this sport: "just a sport" is the only choice.
      const items = templates.filter((t) => t.sport === sportKey);
      if (!items.length) return `sport:${sportKey}`;

      const sport = SPORTS.find((x) => x.key === sportKey);
      const choice = await openSheet({
        title: `${sport.label} on ${formatDayLabel(day)}`,
        html: `
          <div class="sheet-list">
            <button type="button" class="sheet-item" data-value="sport:${sport.key}">Just ${escapeHtml(sport.label.toLowerCase())} (no recipe)</button>
          </div>
          <h3 class="sheet-subtitle">From your catalogue</h3>
          <div class="sheet-list">${items.map((t) =>
            `<button type="button" class="sheet-item" data-value="template:${t.id}">${escapeHtml(t.name)}</button>`).join("")}</div>
          <div class="sheet-actions">
            <button type="button" class="button" data-value="back">← Back</button>
          </div>`,
      });
      if (choice !== "back") return choice;
    }
  }


  // ----- tap a session: actions (20b) -----
  // One main action (planned with a recipe: Start workout; "just a sport":
  // Log it), then Done + Log it side by side, then quiet rows for the rest.
  async function sessionMenu(session) {
    if (!session) return;
    const details = sessionDetails(session);
    const isDone = session.status === "done";
    const isCancelled = session.status === "cancelled";
    const isPlanned = session.status === "planned";
    const workout = loadWorkout();
    const inProgress = workout && workout.plannedId === session.id;
    const withRecipe = isPlanned && !isPlainSession(session);
    // Something of that sport already logged that day (and not linked yet)?
    const linkedIds = new Set(sessions.map((s) => s.activity_id).filter(Boolean));
    const loggedThatDay = activities.some((a) => a.activity_date === session.session_date
      && a.sport === session.sport && !linkedIds.has(a.id));

    let main = "";
    if (isPlanned && withRecipe) {
      main = `<button type="button" class="button primary sheet-main" data-value="start">${icon("play")} ${inProgress ? "Resume" : "Start"} workout</button>
        <div class="sheet-pair">
          <button type="button" class="button" data-value="done">${icon("check")} Done</button>
          <button type="button" class="button" data-value="log">${icon("square-pen")} Log it</button>
        </div>`;
    } else if (isPlanned) {
      main = `<button type="button" class="button primary sheet-main" data-value="log">${icon("square-pen")} Log it</button>`;
    } else if (isDone && session.activity_id) {
      main = `<button type="button" class="button primary sheet-main" data-value="open-activity">Open the logged activity</button>`;
    } else if (isCancelled) {
      main = `<button type="button" class="button sheet-main" data-value="uncancel">${icon("undo-2")} Not skipped after all</button>`;
    }

    const rows = [];
    if (isPlanned && !withRecipe && loggedThatDay) rows.push(sheetRowHtml("done", "check", "Link to what you logged that day"));
    if (isPlanned && !withRecipe) rows.push(sheetRowHtml("start", "play", inProgress ? "Resume with the timer" : "Start with the timer"));
    if (!isDone) rows.push(sheetRowHtml("move", "calendar", "Move or swap day"));
    if (session.template_id) rows.push(sheetRowHtml("recipe", "library", "Edit the recipe"));
    if (isCustomSession(session) && !isDone && !isCancelled) rows.push(sheetRowHtml("edit-custom", "pencil", "Edit this session"));
    if (isPlainSession(session) && isPlanned) rows.push(sheetRowHtml("edit-custom", "pencil", "Add details (name, exercises…)"));
    if (isCustomSession(session)) rows.push(sheetRowHtml("to-catalogue", "library", "Add to my catalogue"));
    if (session.race_id) rows.push(sheetRowHtml("race", "flag", "Open the race"));
    if (isPlanned) rows.push(sheetRowHtml("cancel", "x", "Mark as skipped"));
    if (isDone) rows.push(sheetRowHtml("reopen", "undo-2", "Not done"));
    rows.push(sheetRowHtml("delete", "trash-2", "Remove from plan", { danger: true }));

    const choice = await openSheet({
      title: sessionName(session),
      badge: sportBadge(session.sport, sportIcon),
      subtitle: sheetSubtitle(session),
      html: `
        ${factsHtml(session, details)}
        ${detailsHtml(session, details)}
        ${main ? `<div class="sheet-actions">${main}</div>` : ""}
        <div class="sheet-rows">${rows.join("")}</div>`,
    });

    try {
      if (choice === "start") window.location.hash = `#/workout/${session.id}`;
      if (choice === "log") window.location.hash = `#/log/new/${session.id}`;
      if (choice === "done") await doneInOneTap(session, { onChange: load });
      if (choice === "reopen") await reopenSession(session);
      if (choice === "open-activity") window.location.hash = `#/log/${session.activity_id}`;
      if (choice === "cancel") await updatePlannedSession(session.id, { status: "cancelled" });
      if (choice === "uncancel") await updatePlannedSession(session.id, { status: "planned" });
      if (choice === "move") await moveOrSwap(session);
      if (choice === "recipe") window.location.hash = `#/catalogue/${session.template_id}`;
      if (choice === "edit-custom") window.location.hash = `#/custom/${session.id}`;
      if (choice === "to-catalogue") await sendToCatalogue(session);
      if (choice === "race") window.location.hash = `#/races/${session.race_id}`;
      if (choice === "delete" && window.confirm("Remove this session from the plan?")) await deletePlannedSession(session.id);
    } catch (error) {
      showToast("Something went wrong: " + error.message);
    }
    if (choice && !["open-activity", "recipe", "start", "log", "race", "edit-custom"].includes(choice)) await load();
  }

  // "Move or swap day": move this one session, or swap the whole day.
  async function moveOrSwap(session) {
    const choice = await openSheet({
      title: "Move or swap",
      html: `<div class="sheet-rows">
        ${sheetRowHtml("move", "calendar", "Move this session to another day")}
        ${sheetRowHtml("swap", "arrow-left-right", "Swap the whole day with another day")}
      </div>`,
    });
    if (choice === "move") await moveSession(session);
    if (choice === "swap") await swapDay(session.session_date);
  }

  // A custom session -> a recipe in the catalogue (asks for the name).
  async function sendToCatalogue(session) {
    const name = await openSheet({
      title: "Add to my catalogue",
      html: `
        <label for="recipe-name" class="sheet-subtitle">Name in the catalogue</label>
        <input id="recipe-name" type="text" maxlength="80" autocomplete="off" value="${escapeHtml(sessionName(session))}">
        <p class="muted small">${session.status === "planned"
          ? "This session then follows the recipe (edit it in the catalogue)."
          : "This session keeps what you did; the recipe is for next time."}</p>
        <button type="button" class="button primary" id="recipe-go">${icon("library")} Add</button>`,
      onReady: (dialog, close) => {
        const input = dialog.querySelector("#recipe-name");
        const go = () => { if (input.value.trim()) close(input.value.trim()); };
        dialog.querySelector("#recipe-go").addEventListener("click", go);
        input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } });
      },
    });
    if (!name) return;
    await addToCatalogue(session, name);
    showToast(`"${name}" added to your catalogue`);
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
  // Done sessions stay put: they happened on their day (and match a logged activity).
  async function swapDay(day) {
    const other = await openSheet({
      title: `Swap ${formatDayLabel(day)} with…`,
      html: `${weekdayButtons(monday, day)}
        <p class="muted small">Sessions already done stay on their day.</p>`,
    });
    if (!other || other === day) return;
    const notDone = (s) => s.status !== "done";
    const a = sessions.filter((s) => s.session_date === day && notDone(s));
    const b = sessions.filter((s) => s.session_date === other && notDone(s));
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
    ${icon("dumbbell")} Workout in progress: <strong>${escapeHtml(workout.name)}</strong> · Resume ›</a>`;
}

function dayHeading(day) {
  const date = parseISODate(day);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  const dayMonth = date.toLocaleDateString("en-GB", { day: "numeric", month: "short" });
  return `${weekday} <span class="muted">${dayMonth}</span>`;
}

// Done = green tick; skipped (cancelled) = a quiet word, no red (20a).
const STATUS_ICON = {
  planned: "",
  done: icon("check", { label: "done", className: "is-ok" }),
  cancelled: `<span class="skipped-tag">Skipped</span>`,
};

// A race from the Races tab on its day (until its routine is added to the plan).
function raceMarkerHtml(race) {
  return `<a class="race-marker" href="#/races/${race.id}">${icon("flag")} <strong>${escapeHtml(race.name)}</strong>
    <span class="muted small">${[race.distance_km ? `${Number(race.distance_km)} km` : "", race.status === "to_register" ? "to register" : "registered"]
      .filter(Boolean).join(" · ")}</span></a>`;
}

// A warning as a small amber chip (20a): a few words ("Heavy legs Thu → Fri"),
// the full message on tap (and to screen readers). Muted ones are grey with a
// crossed-out bell. `where` = "warning-between" (between two day cards) or
// "warning-dup" (the same chip inside the later day, for the laptop's columns).
function warningChipHtml(w, index, where = "") {
  return `<button type="button" class="warning-chip ${where} ${w.muted ? "is-muted" : ""}" data-warning="${index}"
    aria-label="${escapeHtml((w.muted ? "Muted: " : "Warning: ") + w.message)}">
    ${icon(w.muted ? "bell-off" : "alert-triangle")}<span>${escapeHtml(w.short || w.message)}</span></button>`;
}

// `today` = to spot a session left open on a past day ("missed?").
function sessionCardHtml(session, today) {
  const missed = session.status === "planned" && session.session_date < today;
  const details = sessionDetails(session);
  const bits = [];
  if (details && details.exercises && details.exercises.length) {
    bits.push(`${details.exercises.length} exercises${details.rounds ? ` · ${details.rounds} rounds` : ""}`);
  }
  if (details && details.target_duration_s) bits.push(formatDuration(details.target_duration_s));
  if (details && details.target_distance_km) bits.push(`${Number(details.target_distance_km)} km`);
  if (isCustomSession(session)) bits.push("custom");
  if (session.status === "done" && session.activity) {
    const a = session.activity;
    bits.push("Logged: " + [formatDuration(a.duration_s), a.distance_km != null ? formatKm(a.distance_km) : ""].filter(Boolean).join(" · "));
  }
  const card = `
    <button type="button" class="plan-card status-${session.status} ${missed ? "is-missed" : ""}" data-session="${session.id}">
      ${sportBadge(session.sport, sportIcon)}
      <span class="activity-main">
        <span class="activity-title">${escapeHtml(sessionName(session))}</span>
        ${bits.length ? `<span class="muted small">${escapeHtml(bits.join(" · "))}</span>` : ""}
        ${missed ? `<span class="missed-tag small">Missed?</span>` : ""}
      </span>
      <span class="plan-status">${STATUS_ICON[session.status]}</span>
    </button>`;
  // Today's session with a recipe: a round play button starts the workout in
  // one tap (20a). It sits next to the card (a button can't hold a button).
  const canStart = session.status === "planned" && session.session_date === today && !isPlainSession(session);
  return canStart ? `<div class="plan-row has-play">${card}
    <a class="plan-play" href="#/workout/${session.id}" aria-label="Start workout: ${escapeHtml(sessionName(session))}">${icon("play")}</a></div>` : card;
}

function extraCardHtml(a) {
  return `
    <button type="button" class="plan-card extra" data-activity="${a.id}">
      ${sportBadge(a.sport, sportIcon)}
      <span class="activity-main">
        <span class="activity-title">${escapeHtml(a.title || sessionTypeLabel(a.sport, a.session_type))}</span>
        <span class="muted small">Not planned · ${escapeHtml([formatDuration(a.duration_s), a.distance_km != null ? formatKm(a.distance_km) : ""].filter(Boolean).join(" · "))}</span>
      </span>
    </button>`;
}

// Under the sheet's title: "Wed 21 Oct · Upper body + core (· frozen when done)".
function sheetSubtitle(session) {
  const sport = getSport(session.sport);
  const kind = session.session_type ? sessionTypeLabel(session.sport, session.session_type) : (sport ? sport.label : "");
  return [formatDayLabel(session.session_date), kind, session.status === "done" && session.details ? "frozen when done" : ""]
    .filter(Boolean).join(" · ");
}

// The session's numbers in one row (20b): exercises, sets, minutes, km; a
// done session shows what was logged instead.
function factsHtml(session, details) {
  const facts = [];
  const a = session.status === "done" ? session.activity : null;
  if (a) {
    if (a.duration_s) facts.push(numHtml(formatDuration(a.duration_s), "logged"));
    if (a.distance_km != null) facts.push(numHtml(formatKm(a.distance_km)));
    if (a.rpe) facts.push(numHtml(a.rpe, "RPE"));
  } else if (details) {
    const exercises = details.exercises || [];
    const sets = exercises.reduce((sum, e) => sum + (Number(e.sets) || 0), 0) * (details.rounds || 1);
    if (exercises.length) facts.push(numHtml(exercises.length, exercises.length === 1 ? "exercise" : "exercises"));
    if (sets) facts.push(numHtml(sets, "sets"));
    if (details.rounds) facts.push(numHtml(details.rounds, "rounds"));
    if (details.target_duration_s) facts.push(numHtml(Math.round(details.target_duration_s / 60), "min"));
    if (details.target_distance_km) facts.push(numHtml(Number(details.target_distance_km), "km"));
  }
  return facts.length ? `<div class="sheet-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</div>` : "";
}

// The recipe (or frozen photo) inside the action sheet: description, and the
// exercises folded away (tap to see them).
function detailsHtml(session, details) {
  if (!details) return "";
  const lines = [];
  if (details.description) lines.push(`<p class="pre-line">${escapeHtml(details.description)}</p>`);
  if (details.exercises && details.exercises.length) {
    lines.push(`<details class="sheet-exercises"><summary>${details.rounds ? `${details.rounds} rounds of ` : ""}${details.exercises.length} exercise${details.exercises.length === 1 ? "" : "s"}</summary>
      <ul class="exercise-list">${details.exercises.map((e) => `
        <li>${escapeHtml(formatExercise(e))}${e.note ? ` <span class="muted small">(${escapeHtml(e.note)})</span>` : ""}${e.total_sets ? ` <span class="muted small">${icon("check")} ${e.done_sets}/${e.total_sets}</span>` : ""}</li>`).join("")}</ul></details>`);
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


// ---------------------------------------------------------------------
// The month: a calendar with the sport icons of each day.
// Tap a day to open its week.
// ---------------------------------------------------------------------

async function drawMonth(container, month) {
  const first = `${month}-01`;
  const [year, monthNumber] = month.split("-").map(Number);
  const nextMonth = toMonth(new Date(year, monthNumber, 1));
  const previousMonth = toMonth(new Date(year, monthNumber - 2, 1));
  const lastDay = addDays(`${nextMonth}-01`, -1);
  // Full weeks: from the Monday before the 1st to the Sunday after the last day.
  const gridStart = startOfWeek(first);
  const gridEnd = addDays(startOfWeek(lastDay), 6);
  const today = todayISO();
  const title = parseISODate(first).toLocaleDateString("en-GB", { month: "long", year: "numeric" });

  setTopbarAction({ iconName: "more", label: "Planning: catalogue, templates", onClick: () => monthMenu() });
  container.innerHTML = `
    <div class="planner">
    ${headHtml({
      prevHref: `#/planner/month/${previousMonth}`, prevLabel: "Previous month",
      nextHref: `#/planner/month/${nextMonth}`, nextLabel: "Next month",
      title, subtitle: "",
      switchHtml: viewSwitchHtml("month", `#/planner/${month === today.slice(0, 7) ? today : first}`, `#/planner/month/${month}`),
    })}
    ${month !== today.slice(0, 7) ? `<a class="today-link" href="#/planner/month/${today.slice(0, 7)}">${icon("undo-2")} Back to this month</a>` : ""}
    <p id="month-summary" class="muted week-summary"></p>
    <div class="month card">
      <div class="month-head">${["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => `<span>${d}</span>`).join("")}</div>
      <div id="month-grid" class="month-grid"><p class="muted">Loading…</p></div>
    </div>
    </div>
  `;

  const grid = container.querySelector("#month-grid");
  try {
    const [sessions, activities, races] = await Promise.all([
      listPlannedSessions(gridStart, gridEnd),
      listActivitiesBetween(gridStart, gridEnd),
      listRacesBetween(gridStart, gridEnd),
    ]);
    const unplannedRaces = racesNotPlanned(races, sessions);
    const days = [];
    for (let day = gridStart; day <= gridEnd; day = addDays(day, 1)) days.push(day);
    grid.innerHTML = days.map((day) => {
      const { icons, done } = daySummary(day, sessions, activities, (sport) => sportBadge(sport, sportIcon, "small"));
      const classes = ["month-day", day.slice(0, 7) !== month ? "is-other" : "", day === today ? "is-today" : "",
        done ? "is-done" : ""].join(" ");
      return `<a class="${classes}" href="#/planner/${day}" aria-label="${escapeHtml(formatDayLabel(day))}: ${icons.length ? icons.length + " session(s)" : "rest"}">
        <span class="month-date">${Number(day.slice(8))}</span>
        <span class="month-icons">${unplannedRaces.some((r) => r.race_date === day) ? `<span class="month-race" title="Race">${icon("flag", { label: "Race" })}</span>` : ""}${icons.join("")}</span>
      </a>`;
    }).join("");

    const inMonth = (date) => date.slice(0, 7) === month;
    const planned = sessions.filter((s) => inMonth(s.session_date) && s.status !== "cancelled");
    const done = planned.filter((s) => s.status === "done").length;
    const runKm = activities.filter((a) => inMonth(a.activity_date) && a.sport === "running")
      .reduce((sum, a) => sum + Number(a.distance_km || 0), 0);
    container.querySelector("#month-summary").textContent =
      `${planned.length} planned · ${done} done · ${runKm.toLocaleString("en-GB", { maximumFractionDigits: 1 })} km run`;
  } catch (error) {
    grid.innerHTML = `<p class="status error"></p>`;
    grid.querySelector(".status").textContent = "Could not load the month: " + error.message;
  }
}

// "2026-11" from a Date.
function toMonth(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}
