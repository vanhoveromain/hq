// planner.js: the Task planner (#/planner/<board>), to organise the week.
//
// Five boards (PLANNER_BOARDS in rules.js), as tabs:
//   This week (one column per day, opens first) · This week's scope ·
//   Today's scope · Today's priority · Tomorrow's priority
// Open tasks only. Drag a card to another column to change that field
// (the day, the scope or the priority), with Undo. Tap a card to open it;
// tick it to mark it done. On a phone: press and hold a card, then drag.

import { listOpenTasksBetween, listProjects, updateTask, listMeetingNames } from "../storage.js";
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
  const monday = mondayOf(today);
  const d = { today, tomorrow: addDays(today, 1), monday, sunday: addDays(monday, 6) };

  if (!el.querySelector(".board")) el.innerHTML = `<p class="muted">Loading…</p>`;
  let tasks;
  let projects;
  let meetingNames;
  try {
    // The week, plus tomorrow when tomorrow is next Monday.
    const to = d.tomorrow > d.sunday ? d.tomorrow : d.sunday;
    [tasks, projects, meetingNames] = await Promise.all([
      listOpenTasksBetween(monday, to),
      listProjects(),
      listMeetingNames().catch(() => []),
    ]);
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
      ${PLANNER_BOARDS.map((b) => `<a href="#/planner/${b.id}" class="${b === board ? "active" : ""}"${b === board ? ' aria-current="page"' : ""}>${escapeHtml(b.label)}</a>`).join("")}
    </nav>
    ${quickAddHtml({ today: board.id === "tomorrow-priority" ? d.tomorrow : today })}
    <p class="board-hint muted">Drag a card to another column to change its ${board.field === "due_date" ? "day" : board.field}. On a phone: press and hold, then drag. Tap a card to open it.</p>
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
  disposeDrag = makeBoardDraggable(boardEl, {
    onTap: (id) => openTaskSheet(findTask(id), { onChange: redraw, meetingNames }),
    onDrop: async (id, columnEl) => {
      const task = findTask(id);
      const value = columnEl.dataset.column || null;
      const before = task[board.field];
      const changes = { [board.field]: value };
      // A due date dropped on today counts as "do it today", so Pending /
      // Delegated stay as they are: only the field moves.
      try {
        await updateTask(task.id, changes);
      } catch (error) {
        showToast("Could not move it: " + error.message);
        return;
      }
      showToast(`"${task.title}" → ${columnLabel(board, value, d)}`, {
        actionLabel: "Undo",
        onAction: async () => { await updateTask(task.id, { [board.field]: before }); redraw(); },
      });
      redraw();
    },
  });

  wireQuickAdd(el.querySelector(".quick-add"), { onAdded: redraw });
}

function columnLabel(board, value, d) {
  if (board.field === "due_date") return friendlyDay(value, d.today);
  if (board.field === "scope") return value ? labelOf(SCOPES, value) : "No scope";
  return value ? labelOf(PRIORITIES, value) : "No priority";
}

function columnHtml(col, tasks, board, d, projectName) {
  let title = escapeHtml(col.label);
  if (board.field === "due_date") {
    const [y, m, dd] = col.value.split("-").map(Number);
    const weekday = WEEKDAYS[(new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7]; // Monday = 0
    title = `${weekday} <span class="muted">${dd}/${m}</span>${col.isToday ? ' <span class="board-today">Today</span>' : ""}`;
  }
  // Today's scope: the 1-3-5 room per column (amber when over).
  const room = col.limit !== undefined && board.id === "today-scope" ? col.limit : null;
  const count = room !== null ? `${tasks.length}/${room}` : String(tasks.length);
  const over = room !== null && tasks.length > room;
  return `
    <section class="board-col${col.isToday ? " is-today" : ""}" data-column="${escapeHtml(col.value || "")}" aria-label="${escapeHtml(col.label)}">
      <header class="board-col-head">
        <h2>${title}</h2>
        <span class="board-count${over ? " is-over" : ""}">${count}</span>
      </header>
      <div class="board-cards">
        ${tasks.map((t) => cardHtml(t, board, d, projectName)).join("") || `<p class="board-empty">Drop here</p>`}
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
