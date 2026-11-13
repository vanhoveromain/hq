// priorities.js: Priorities of the day (#/priorities).
//
// Top: today's date, the 1-3-5 counter, the day tools (Reset: Period / Scope /
// Priority · Push all to tomorrow; UX review #9) and quick add. Then the lists:
//   To do today · Overdue (only when not empty)
// (To do tomorrow lives in the Task planner: Romain, 2026-11-09.)
//   To delegate · Meetings (grouped by meeting) · Delegated · Pending
//   Achieved today · Achieved this week (folded)
// Which task goes where: PRIORITY_LISTS in rules.js. Every row is edited in
// place (taskList.js); the page redraws itself half a second after your last
// change, so a task lands in its new list / place by itself.
//
// Today / Tomorrow switch (#/priorities/tomorrow, Romain 2026-11-09): the same
// page for tomorrow (its To do list, counter, meetings, delegated, pending),
// to plan the next day. No Overdue, Achieved or bulk buttons there.

import {
  listDayTasks, listProjects, listMeetingNames,
  listOpenTasksWith, updateTasks, restoreTaskValues, updateTasksEach,
} from "../storage.js";
import { PRIORITY_LISTS, compareDayTasks, compareAchieved, countOneThreeFive, priorityScore, pushChanges } from "../rules.js";
import { openTaskSheet } from "./taskSheet.js";
import { taskListInnerHtml, wireTaskList, quickAddHtml, wireQuickAdd } from "./taskList.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon } from "../utils/html.js";
import { brusselsToday, addDays, mondayOf, brusselsDayOf, longDay } from "../utils/dates.js";

// Remembered while the app is open: which folded lists are open.
const unfolded = new Set();

// Laptop: a thin copy of the 1-3-5 counter stays under the top bar once the
// big one has scrolled away (UX review #9, 2026-11-13).
let counterWatch = null;
export function leave() {
  if (counterWatch) counterWatch.disconnect();
  counterWatch = null;
}

export async function render(el, { params = [] } = {}) {
  const today = brusselsToday();
  const tomorrow = addDays(today, 1);
  const isTomorrow = params[0] === "tomorrow";
  // The day this page is about.
  const day = isTomorrow ? tomorrow : today;
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  // A day early in UTC, so nothing ticked on Monday morning (Brussels) is
  // missed; the exact Brussels day is checked below.
  const doneSince = `${addDays(monday, -1)}T00:00:00Z`;

  if (!el.querySelector(".day-line")) el.innerHTML = `<p class="muted">Loading…</p>`;
  let tasks;
  let projects;
  let meetingNames;
  try {
    [tasks, projects, meetingNames] = await Promise.all([
      listDayTasks(tomorrow, doneSince),
      listProjects(),
      listMeetingNames().catch(() => []),
    ]);
  } catch (error) {
    el.innerHTML = `<p class="error">Could not load your tasks: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const redraw = () => render(el, { params });
  // The lists' rules look at "the day" (d.today) and the day after.
  const d = { today: day, tomorrow: addDays(day, 1) };
  const names = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const projectName = (t) => names[t.project_id] || "";
  // Project menu on each row: active projects, plus any a task points to.
  const used = new Set(tasks.map((t) => t.project_id));
  const projectChoices = projects
    .filter((p) => p.status !== "archived" || used.has(p.id))
    .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));

  const pick = (rule, sort) => tasks.filter((t) => rule(t, d)).sort(sort);
  // (Sorting keeps using the real today: "overdue" means before today.)
  const byDay = (a, b) => compareDayTasks(a, b, today, projectName);
  const byScore = (a, b) => priorityScore(b, today) - priorityScore(a, today);
  const lists = {
    today: pick(PRIORITY_LISTS.today, byDay),
    overdue: pick(PRIORITY_LISTS.overdue, byScore),
    toDelegate: pick(PRIORITY_LISTS.toDelegate, byScore),
    meetings: pick(PRIORITY_LISTS.meetings, byDay),
    delegated: pick(PRIORITY_LISTS.delegated, (a, b) => (a.delegated_to || "~").localeCompare(b.delegated_to || "~")),
    pending: pick(PRIORITY_LISTS.pending, byScore),
    achievedToday: tasks.filter((t) => t.done && t.done_at && brusselsDayOf(t.done_at) === today)
      .sort((a, b) => compareAchieved(a, b, today, projectName)),
    achievedWeek: tasks.filter((t) => {
      if (!t.done || !t.done_at || t.is_meeting) return false;
      const day = brusselsDayOf(t.done_at);
      return day >= monday && day <= sunday;
    }).sort((a, b) => compareAchieved(a, b, today, projectName)),
  };

  document.title = `Priorities ${isTomorrow ? "for tomorrow" : "of the day"} · QED HQ`;
  el.innerHTML = `
    <div class="day-head">
      <p class="day-line">${escapeHtml(longDay(day))}</p>
      <nav class="day-switch" aria-label="Day">
        <a href="#/priorities"${isTomorrow ? "" : ' class="active" aria-current="page"'}>Today</a>
        <a href="#/priorities/tomorrow"${isTomorrow ? ' class="active" aria-current="page"' : ""}>Tomorrow</a>
      </nav>
    </div>
    <div class="counter" id="counter" aria-live="polite"></div>
    <div class="counter-mini" id="counter-mini" aria-hidden="true"></div>
    ${isTomorrow ? "" : `
    <div class="day-tools" role="group" aria-label="Day tools">
      <span class="day-tools-group">
        <span class="day-tools-label">Reset:</span>
        <button type="button" class="btn secondary small" data-bulk="period" title="Clear AM/PM on every open task">Period</button>
        <button type="button" class="btn secondary small" data-bulk="scope" title="Clear the scope on every open task">Scope</button>
        <button type="button" class="btn secondary small" data-bulk="priority" title="Clear the priority on every open task; Pending today back to Active">Priority</button>
      </span>
      <button type="button" class="btn secondary small" data-bulk="push">${icon("forward")} Push all to tomorrow</button>
    </div>`}
    ${quickAddHtml({ today: day, placeholder: isTomorrow ? "Add a task for tomorrow…" : "Add a task for today…", projects })}

    ${listSection("today", isTomorrow ? "To do tomorrow" : "To do today", lists.today,
      isTomorrow ? "Nothing planned for tomorrow yet." : "Nothing planned for today. Add a task above.")}
    ${!isTomorrow && lists.overdue.length ? listSection("overdue", "Overdue", lists.overdue, "", "is-warning") : ""}


    ${listSection("toDelegate", "To delegate", lists.toDelegate, "")}
    ${meetingsSection(lists.meetings, isTomorrow)}
    ${listSection("delegated", "Delegated", lists.delegated, "")}
    ${listSection("pending", "Pending", lists.pending, "")}

    ${isTomorrow ? "" : foldedSection("achievedToday", "Achieved today", lists.achievedToday)}
    ${isTomorrow ? "" : foldedSection("achievedWeek", "Achieved this week", lists.achievedWeek)}
  `;

  // Rows: each list gets the same behaviour; To do today, Overdue and To
  // delegate also get a "Push to tomorrow" button.
  const onOpen = (task) => openTaskSheet(task, { onChange: redraw, meetingNames });
  // On the Tomorrow page "push to tomorrow" would change nothing: no button.
  const withPush = new Set(isTomorrow ? [] : ["today", "overdue", "toDelegate"]);
  el.querySelectorAll("[data-list]").forEach((ul) => {
    const key = ul.dataset.list;
    const group = ul.dataset.group;
    let listTasks = lists[key];
    if (group !== undefined) listTasks = listTasks.filter((t) => (t.meeting_name || "") === group);
    const rowOptions = { today, projects: projectChoices, showPush: withPush.has(key), showFocus: key === "today" && !isTomorrow };
    ul.classList.add("with-project");
    ul.innerHTML = taskListInnerHtml(listTasks, rowOptions);
    wireTaskList(ul, listTasks, {
      onOpen, onChange: redraw, rowOptions, meetingNames,
      onSaved: () => drawCounter(el.querySelector("#counter"), lists.today, d),
    });
  });
  el.querySelectorAll("details[data-fold]").forEach((details) => {
    details.addEventListener("toggle", () => {
      if (details.open) unfolded.add(details.dataset.fold); else unfolded.delete(details.dataset.fold);
    });
  });

  drawCounter(el.querySelector("#counter"), lists.today, d);
  watchCounter(el.querySelector("#counter"), el.querySelector("#counter-mini"));
  wireQuickAdd(el.querySelector(".quick-add"), { onAdded: redraw });
  el.querySelectorAll("[data-bulk]").forEach((button) => {
    button.addEventListener("click", () => runBulk(button.dataset.bulk, lists, tomorrow, redraw));
  });
}


// ---------------------------------------------------------------------
// Sections
// ---------------------------------------------------------------------

// An empty list with no emptyText: one grey line ("To delegate · 0").
function listSection(key, title, tasks, emptyText, extraClass = "") {
  if (!tasks.length && !emptyText) return emptyLine(title);
  return `
    <section class="section day-list ${extraClass}">
      <div class="section-head"><h2 class="section-title">${escapeHtml(title)} <span class="count">${tasks.length}</span></h2></div>
      ${tasks.length ? `<ul class="task-list" data-list="${key}"></ul>` : `<p class="list-empty">${escapeHtml(emptyText)}</p>`}
    </section>`;
}

// Meetings: one small group per meeting ("Weekly team meeting"…), points
// without a meeting name last.
function emptyLine(title) {
  return `<p class="list-none">${escapeHtml(title)} · 0</p>`;
}

function meetingsSection(tasks, isTomorrow) {
  if (!tasks.length) return emptyLine(`To settle in meetings ${isTomorrow ? "tomorrow" : "today"}`);
  const groups = [...new Set(tasks.map((t) => t.meeting_name || ""))]
    .sort((a, b) => (a === "") - (b === "") || a.localeCompare(b, "en", { sensitivity: "base" }));
  return `
    <section class="section day-list">
      <div class="section-head"><h2 class="section-title">To settle in meetings ${isTomorrow ? "tomorrow" : "today"} <span class="count">${tasks.length}</span></h2></div>
      ${tasks.length ? groups.map((name) => `
        <h3 class="group-title">${icon("meeting")} ${escapeHtml(name || "No meeting named")}</h3>
        <ul class="task-list" data-list="meetings" data-group="${escapeHtml(name)}"></ul>`).join("")
        : `<p class="list-empty">No meeting points for ${isTomorrow ? "tomorrow" : "today"}.</p>`}
    </section>`;
}

function foldedSection(key, title, tasks) {
  return `
    <section class="section day-list">
      <details data-fold="${key}"${unfolded.has(key) ? " open" : ""}>
        <summary class="fold-title">${escapeHtml(title)} <span class="count">${tasks.length}</span></summary>
        ${tasks.length ? `<ul class="task-list" data-list="${key}"></ul>` : `<p class="list-empty">Nothing yet.</p>`}
      </details>
    </section>`;
}

// The 1-3-5 counter: Major 1/1 · Medium 2/3 · Small 6/5 (amber when over).
function drawCounter(counterEl, todayTasks, d) {
  // Only tasks still in To do today count (a task just moved by a chip
  // leaves the count straight away, even before the lists re-sort).
  const { scopes, noScope } = countOneThreeFive(todayTasks.filter((t) => PRIORITY_LISTS.today(t, d)));
  const over = scopes.filter((s) => s.over);
  const mini = counterEl.parentElement?.querySelector("#counter-mini");
  if (mini) {
    mini.innerHTML = `<span class="counter-mini-in">${scopes.map((s) =>
      `<span class="${s.over ? "is-over" : ""}">${escapeHtml(s.label)} <strong>${s.count}/${s.perDay}</strong></span>`).join("")}</span>`;
  }
  counterEl.innerHTML = `
    <div class="counter-boxes">
      ${scopes.map((s) => `
        <div class="counter-box${s.over ? " is-over" : ""}${s.count === s.perDay ? " is-full" : ""}">
          <span class="counter-num">${s.count}<span class="counter-of">/${s.perDay}</span></span>
          <span class="counter-label">${escapeHtml(s.label)}</span>
        </div>`).join("")}
    </div>
    <p class="counter-note">${over.length
      ? `${icon("target")} Too much for one day: ${over.map((s) => `${s.count - s.perDay} ${s.label.toLowerCase()} over`).join(", ")}. Push something to tomorrow?`
      : "1-3-5 rule: 1 major, 3 medium, 5 small a day."}${noScope ? ` (${noScope} without a scope)` : ""}</p>`;
}


// Shows the thin counter while the big one is out of sight (laptop only, CSS).
function watchCounter(counterEl, miniEl) {
  leave();
  if (!counterEl || !miniEl || !("IntersectionObserver" in window)) return;
  counterWatch = new IntersectionObserver(([entry]) => {
    miniEl.classList.toggle("is-shown", !entry.isIntersecting && entry.boundingClientRect.top < 0);
  }, { rootMargin: "-64px 0px 0px 0px" });
  counterWatch.observe(counterEl);
}

// ---------------------------------------------------------------------
// The four bulk buttons (each asks first, each can be undone)
// ---------------------------------------------------------------------

const RESETS = {
  period: { label: "AM/PM", title: "Reset the period" },
  scope: { label: "Scope", title: "Reset the scope" },
};

async function runBulk(kind, lists, tomorrow, redraw) {
  try {
    if (kind === "period" || kind === "scope") await resetField(kind, redraw);
    if (kind === "priority") await resetPriority(redraw);
    if (kind === "push") pushAll(lists, tomorrow, redraw);
  } catch (error) {
    showToast("Could not do that: " + error.message);
  }
}

function confirm({ title, text, submitLabel, onConfirm }) {
  openDialog({
    title,
    submitLabel,
    body: `<p class="confirm-text">${text}</p>`,
    onSubmit: onConfirm,
  });
}

const tasksWord = (n) => `${n} open task${n === 1 ? "" : "s"}`;

// Reset the period / scope: clears it on ALL open tasks (any date).
async function resetField(field, redraw) {
  const { label, title } = RESETS[field];
  const rows = await listOpenTasksWith(field);
  if (!rows.length) {
    showToast(`No open task has ${field === "period" ? "an AM/PM" : "a scope"} set.`);
    return;
  }
  confirm({
    title,
    text: `Clear <strong>${escapeHtml(label)}</strong> on ${tasksWord(rows.length)}?`,
    submitLabel: "Clear",
    async onConfirm() {
      await updateTasks(rows.map((r) => r.id), { [field]: null });
      showToast(`${label} cleared on ${tasksWord(rows.length)}.`, {
        actionLabel: "Undo",
        onAction: async () => {
          await restoreTaskValues(field, rows);
          redraw();
        },
      });
      redraw();
    },
  });
}

// Reset the Priority (decided 2026-11-08): clears Priority and puts "Pending
// today" back to Active, on all open tasks. Other states are kept.
async function resetPriority(redraw) {
  const [priorities, states] = await Promise.all([listOpenTasksWith("priority"), listOpenTasksWith("state")]);
  const pendingToday = states.filter((r) => r.value === "pending_today");
  const total = new Set([...priorities, ...pendingToday].map((r) => r.id)).size;
  if (!total) {
    showToast("No open task has a priority set.");
    return;
  }
  confirm({
    title: "Reset the Priority",
    text: `Clear the <strong>priority</strong> on ${tasksWord(total)}${pendingToday.length
      ? `, and put ${pendingToday.length} “Pending today” back to Active` : ""}?`,
    submitLabel: "Reset",
    async onConfirm() {
      await Promise.all([
        updateTasks(priorities.map((r) => r.id), { priority: null }),
        updateTasks(pendingToday.map((r) => r.id), { state: "active" }),
      ]);
      showToast(`Priority reset on ${tasksWord(total)}.`, {
        actionLabel: "Undo",
        onAction: async () => {
          await Promise.all([restoreTaskValues("priority", priorities), restoreTaskValues("state", pendingToday)]);
          redraw();
        },
      });
      redraw();
    },
  });
}

// Push all to tomorrow (decided 2026-11-08): To do today + To delegate only.
// Pending, Delegated and meeting points stay on today.
function pushAll(lists, tomorrow, redraw) {
  const moving = [...lists.today, ...lists.toDelegate].filter((t) => t.due_date !== tomorrow);
  if (!moving.length) {
    showToast("Nothing in To do today or To delegate to push.");
    return;
  }
  // Each task's own "put off" count goes up by 1 (UX review #10); Undo puts
  // back both its date and its count.
  const rows = moving.map((t) => ({
    id: t.id,
    changes: pushChanges(t, tomorrow),
    before: { due_date: t.due_date, rolled_over: t.rolled_over || 0 },
  }));
  confirm({
    title: "Push all to tomorrow",
    text: `Move ${tasksWord(rows.length)} from <strong>To do today</strong> and <strong>To delegate</strong> to tomorrow?`,
    submitLabel: "Push to tomorrow",
    async onConfirm() {
      await updateTasksEach(rows.map((r) => ({ id: r.id, changes: r.changes })));
      showToast(`${tasksWord(rows.length)} pushed to tomorrow.`, {
        actionLabel: "Undo",
        onAction: async () => {
          await updateTasksEach(rows.map((r) => ({ id: r.id, changes: r.before })));
          redraw();
        },
      });
      redraw();
    },
  });
}
