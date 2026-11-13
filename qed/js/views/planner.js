// planner.js: the Task planner (#/planner/<board>), to organise the week.
//
// Five boards (PLANNER_BOARDS in rules.js), as tabs:
//   This week (one column per day, opens first) · This week's scope ·
//   Today's scope · Today's priority · Tomorrow's priority
// Open tasks only. Drag a card to another column to change that field
// (the day, the scope or the priority), with Undo. Tap a card to open it;
// tick it to mark it done. On a phone: press and hold a card, then drag.

import { listOpenTasksBetween, listOpenTasksWithoutDate, listProjects, updateTask, listMeetingNames } from "../storage.js";
import { PLANNER_BOARDS, PRIORITIES, SCOPES, labelOf, priorityScore } from "../rules.js";
import { openTaskSheet } from "./taskSheet.js";
import { quickAddHtml, wireQuickAdd } from "./taskList.js";
import { makeBoardDraggable } from "../utils/drag.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon, showActiveTab } from "../utils/html.js";
import { brusselsToday, addDays, mondayOf, friendlyDay } from "../utils/dates.js";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
let disposeDrag = null;

export function leave() {
  if (disposeDrag) disposeDrag();
  disposeDrag = null;
}

export async function render(el, { params = [] } = {}) {
  const board = PLANNER_BOARDS.find((b) => b.id === params[0]) || PLANNER_BOARDS[0];
  const today = brusselsToday();
  // Week boards: which week (0 = this week, 1 = next week…; never in the
  // past: the rollover leaves nothing open there). UX review #4, 2026-11-13.
  const offset = board.weekly ? Math.max(0, parseInt(params[1], 10) || 0) : 0;
  const monday = addDays(mondayOf(today), 7 * offset);
  const d = { today, tomorrow: addDays(today, 1), monday, sunday: addDays(monday, 6) };

  if (!el.querySelector(".board")) el.innerHTML = `<p class="muted">Loading…</p>`;
  let tasks;
  let projects;
  let meetingNames;
  try {
    // The week, plus tomorrow when tomorrow is next Monday.
    const to = !offset && d.tomorrow > d.sunday ? d.tomorrow : d.sunday;
    let undated;
    [tasks, undated, projects, meetingNames] = await Promise.all([
      listOpenTasksBetween(monday, to),
      board.withUndated ? listOpenTasksWithoutDate() : [],
      listProjects(),
      listMeetingNames().catch(() => []),
    ]);
    tasks = [...tasks, ...undated];
  } catch (error) {
    el.innerHTML = `<p class="error">Could not load your tasks: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const redraw = () => render(el, { params });
  const names = Object.fromEntries(projects.map((p) => [p.id, p.name]));
  const projectName = (t) => names[t.project_id] || "";
  const columns = board.columns(d);
  const shown = tasks.filter((t) => board.filter(t, d));
  const sorter = {
    project: (a, b) => projectName(a).localeCompare(projectName(b), "en", { sensitivity: "base" }) || priorityScore(b, today) - priorityScore(a, today),
    score: (a, b) => priorityScore(b, today) - priorityScore(a, today),
    "score-project": (a, b) => priorityScore(b, today) - priorityScore(a, today) || projectName(a).localeCompare(projectName(b), "en", { sensitivity: "base" }),
  }[board.sort];

  document.title = `${board.label} · Task planner · QED HQ`;
  el.innerHTML = `
    <nav class="tabs" aria-label="Boards">
      ${PLANNER_BOARDS.map((b) => `<a href="#/planner/${b.id}${b.weekly && offset ? "/" + offset : ""}" class="${b === board ? "active" : ""}"${b === board ? ' aria-current="page"' : ""}>${escapeHtml(b.label)}</a>`).join("")}
    </nav>
    ${board.weekly ? weekNavHtml(board, offset, d) : ""}
    ${quickAddHtml({ today: board.id === "tomorrow-priority" ? d.tomorrow : offset ? d.monday : today, projects })}
    <p class="board-hint muted">${board.field === "due_date" ? "Drag a card onto a day to give it that date (No date = tasks still waiting for one)." : `Drag a card to another column to change its ${board.field}.`} On a phone: press and hold, then drag. Tap a card to open it (laptop: double-click, or select it and use ← →).</p>
    <div class="board" data-board="${board.id}">
      <div class="board-columns" style="--cols:${columns.length}">
        ${columns.map((col) => columnHtml(col, shown.filter((t) => (t[board.field] || null) === col.value).sort(sorter), board, d, projectName)).join("")}
      </div>
    </div>`;

  showActiveTab(el);
  const boardEl = el.querySelector(".board");
  const findTask = (id) => tasks.find((t) => t.id === id);

  // Tick a card: done (with Undo).
  boardEl.addEventListener("change", async (event) => {
    if (!event.target.classList.contains("tick")) return;
    const task = findTask(event.target.closest("[data-card]").dataset.card);
    try {
      await updateTask(task.id, { done: true });
    } catch (error) {
      event.target.checked = false;
      showToast("Could not save: " + error.message);
      return;
    }
    showToast(`Done: "${task.title}"`, {
      actionLabel: "Undo",
      onAction: async () => { await updateTask(task.id, { done: false }); redraw(); },
    });
    redraw();
  });

  // Drag a card to another column: that field takes the column's value.
  if (disposeDrag) disposeDrag();
  const openCard = (id) => openTaskSheet(findTask(id), { onChange: redraw, meetingNames });

  // A card's field changes (drag, ← →, T, 1-5), with Undo.
  async function setField(task, field, value, message) {
    const before = task[field];
    if (before === value) return;
    try {
      await updateTask(task.id, { [field]: value });
    } catch (error) {
      showToast("Could not save: " + error.message);
      return;
    }
    showToast(message, {
      actionLabel: "Undo",
      onAction: async () => { await updateTask(task.id, { [field]: before }); redraw(); },
    });
    redraw();
  }

  // Dropped on a column: the board's field takes the column's value. A due
  // date dropped on today counts as "do it today", so Pending / Delegated stay
  // as they are: only the field moves.
  const dropOn = (id, columnEl) => {
    const task = findTask(id);
    const value = columnEl.dataset.column || null;
    return setField(task, board.field, value, `"${task.title}" → ${columnLabel(board, value, d)}`);
  };

  disposeDrag = makeBoardDraggable(boardEl, {
    // A mouse click selects the card (utils/keys.js); a double-click opens it.
    // A finger opens it with one tap (no double tap on a phone).
    onTap: (id, type) => { if (type !== "mouse") openCard(id); },
    onDrop: dropOn,
  });
  boardEl.addEventListener("dblclick", (event) => {
    const card = event.target.closest("[data-card]");
    if (card && !event.target.closest("input, button, a, select, label")) openCard(card.dataset.card);
  });

  // Keyboard shortcuts on the selected card (utils/keys.js).
  boardEl.addEventListener("qed:task-key", (event) => {
    const card = event.target.closest("[data-card]");
    if (!card) return;
    const task = findTask(card.dataset.card);
    const { action, value } = event.detail;
    if (action === "open") openCard(task.id);
    if (action === "done") {
      const tick = card.querySelector(".tick");
      tick.checked = true;
      tick.dispatchEvent(new Event("change", { bubbles: true }));
    }
    if (action === "move") {
      const columns = [...boardEl.querySelectorAll("[data-column]")];
      const next = columns[columns.indexOf(card.closest("[data-column]")) + value];
      if (next) dropOn(task.id, next);
    }
    if (action === "push") setField(task, "due_date", d.tomorrow, `Pushed to tomorrow: "${task.title}"`);
    if (action === "priority") setField(task, "priority", value, `"${task.title}": ${labelOf(PRIORITIES, value)}`);
  });

  wireQuickAdd(el.querySelector(".quick-add"), { onAdded: redraw });
}

// ‹ This week › (week boards): the week on show, arrows to move.
function weekNavHtml(board, offset, d) {
  const name = offset === 0 ? "This week" : offset === 1 ? "Next week" : `In ${offset} weeks`;
  const [, m1, d1] = d.monday.split("-").map(Number);
  const [, m2, d2] = d.sunday.split("-").map(Number);
  const href = (n) => `#/planner/${board.id}${n ? "/" + n : ""}`;
  return `
    <nav class="week-nav" aria-label="Week">
      ${offset > 0
        ? `<a class="icon-btn" href="${href(offset - 1)}" aria-label="Previous week" title="Previous week">${icon("back")}</a>`
        : `<span class="icon-btn" aria-hidden="true"></span>`}
      <span class="week-name"><strong>${name}</strong> <span class="muted">${d1}/${m1} – ${d2}/${m2}</span></span>
      <a class="icon-btn week-next" href="${href(offset + 1)}" aria-label="Next week" title="Next week">${icon("back")}</a>
      ${offset > 0 ? `<a class="week-today" href="${href(0)}">Back to this week</a>` : ""}
    </nav>`;
}

function columnLabel(board, value, d) {
  if (board.field === "due_date") return value ? friendlyDay(value, d.today) : "No date";
  if (board.field === "scope") return value ? labelOf(SCOPES, value) : "No scope";
  return value ? labelOf(PRIORITIES, value) : "No priority";
}

function columnHtml(col, tasks, board, d, projectName) {
  let title = escapeHtml(col.label);
  if (board.field === "due_date" && col.value) {
    const [y, m, dd] = col.value.split("-").map(Number);
    const weekday = WEEKDAYS[(new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7]; // Monday = 0
    title = `${weekday} <span class="muted">${dd}/${m}</span>${col.isToday ? ' <span class="board-today">Today</span>' : ""}`;
  }
  const undated = board.field === "due_date" && !col.value;
  // Today's scope: the 1-3-5 room per column (amber when over).
  const room = col.limit !== undefined && board.id === "today-scope" ? col.limit : null;
  const count = room !== null ? `${tasks.length}/${room}` : String(tasks.length);
  const over = room !== null && tasks.length > room;
  return `
    <section class="board-col${col.isToday ? " is-today" : ""}${undated ? " is-undated" : ""}" data-column="${escapeHtml(col.value || "")}" aria-label="${escapeHtml(col.label)}">
      <header class="board-col-head">
        <h2>${title}</h2>
        <span class="board-count${over ? " is-over" : ""}">${count}</span>
      </header>
      <div class="board-cards">
        ${tasks.map((t) => cardHtml(t, board, d, projectName)).join("") || `<p class="board-empty">${undated ? "Every task has a date" : "Drop here"}</p>`}
      </div>
    </section>`;
}

function cardHtml(t, board, d, projectName) {
  const tags = [];
  if (board.field !== "priority" && t.priority) tags.push(`<span class="pill prio-${t.priority}">${escapeHtml(labelOf(PRIORITIES, t.priority))}</span>`);
  if (board.field !== "scope" && t.scope) tags.push(`<span class="pill">${escapeHtml(labelOf(SCOPES, t.scope))}</span>`);
  if (board.field !== "due_date" && board.id.startsWith("week")) tags.push(`<span class="pill">${escapeHtml(friendlyDay(t.due_date, d.today))}</span>`);
  if (t.period) tags.push(`<span class="pill">${t.period.toUpperCase()}</span>`);
  if (t.state === "pending" || t.state === "delegated") tags.push(`<span class="pill">${t.state === "delegated" ? `Delegated${t.delegated_to ? " · " + escapeHtml(t.delegated_to) : ""}` : "Pending"}</span>`);
  if (t.is_meeting) tags.push(`<span class="pill">${icon("meeting")} Meeting</span>`);
  return `
    <article class="kcard" data-card="${t.id}" tabindex="0" aria-label="${escapeHtml(t.title)}">
      <div class="kcard-top">
        <input type="checkbox" class="tick" aria-label="Done: ${escapeHtml(t.title)}">
        <span class="kcard-title">${escapeHtml(t.title)}</span>
      </div>
      ${projectName(t) ? `<p class="kcard-project">${escapeHtml(projectName(t))}</p>` : ""}
      ${tags.length ? `<div class="kcard-tags">${tags.join("")}</div>` : ""}
    </article>`;
}
