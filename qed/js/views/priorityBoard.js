// priorityBoard.js: Priorities as a sprint board (Romain, 2026-11-25; the idea
// comes from the sprint boards of developers' PM tools).
//
//   To do     today's To do + Overdue, not marked ongoing
//   Ongoing   the same tasks, marked ongoing (qed_tasks.ongoing: board only)
//   Done      ticked today
//
// Drag a card (planner's drag.js: mouse drag, finger press-and-hold):
//   -> To do    ongoing off (and un-ticked if it came from Done)
//   -> Ongoing  ongoing on (un-ticked if it came from Done)
//   -> Done     ticked, ongoing off
// Every move has Undo. Tick on a card = Done / back to To do. Tap (finger) or
// double-click (mouse) = task sheet. Keyboard (utils/keys.js): ← → move a
// card, X done, T push to tomorrow, 1-5 priority, Enter open.
// To delegate, Delegated, Pending and meeting points stay in the List view.

import { updateTask } from "../storage.js";
import { PRIORITIES, labelOf, pushChanges } from "../rules.js";
import { cardHtml } from "./planner.js";
import { openTaskSheet } from "./taskSheet.js";
import { makeBoardDraggable } from "../utils/drag.js";
import { showToast } from "../utils/toast.js";

// List or Board, remembered on this device.
const VIEW_KEY = "qedhq.prioritiesView";
export function prioritiesView() {
  try { return localStorage.getItem(VIEW_KEY) === "board" ? "board" : "list"; } catch { return "list"; }
}
export function setPrioritiesView(view) {
  try { localStorage.setItem(VIEW_KEY, view); } catch { /* private window: back to List next time */ }
}

const COLUMNS = [
  { value: "todo", label: "To do" },
  { value: "ongoing", label: "Ongoing" },
  { value: "done", label: "Done" },
];
const columnOf = (t) => (t.done ? "done" : t.ongoing ? "ongoing" : "todo");

// The cards: { todo, ongoing, done } built by priorities.js from its lists.
export function boardHtml(cols, d, projectName) {
  // Same ticket cards as the Planner; no field is "the board's", so every tag shows.
  const board = { id: "priorities", field: "none" };
  return `
    <div class="board prio-board" data-board="priorities">
      <div class="board-columns" style="grid-template-columns:repeat(3,var(--col))">
        ${COLUMNS.map((col) => `
          <section class="board-col is-${col.value}" data-column="${col.value}" aria-label="${col.label}">
            <header class="board-col-head">
              <h2>${col.label}</h2>
              <span class="board-count">${cols[col.value].length}</span>
            </header>
            <div class="board-cards">
              ${cols[col.value].map((t) => cardHtml(t, board, d, projectName)).join("")
                || `<p class="board-empty">${col.value === "done" ? "Drop here when it's done" : "Drop here"}</p>`}
            </div>
          </section>`).join("")}
      </div>
    </div>`;
}

// Returns a function that removes the drag listeners (call it before the next draw).
export function wireBoard(boardEl, { tasks, d, redraw, meetingNames }) {
  const findTask = (id) => tasks.find((t) => t.id === id);
  // Done cards come ticked.
  boardEl.querySelectorAll(".is-done .tick").forEach((tick) => { tick.checked = true; });

  async function change(task, changes, message) {
    const keys = Object.keys(changes).filter((k) => (task[k] ?? null) !== (changes[k] ?? null));
    if (!keys.length) return;
    const before = Object.fromEntries(keys.map((k) => [k, task[k] ?? (k === "rolled_over" ? 0 : k === "ongoing" || k === "done" ? false : null)]));
    try {
      await updateTask(task.id, changes);
    } catch (error) {
      showToast("Could not save: " + error.message);
      redraw();
      return;
    }
    showToast(message, {
      actionLabel: "Undo",
      onAction: async () => { await updateTask(task.id, before); redraw(); },
    });
    redraw();
  }

  const moveTo = (task, column) => {
    if (!task || columnOf(task) === column) return;
    const label = COLUMNS.find((c) => c.value === column).label;
    const changes = column === "done" ? { done: true, ongoing: false }
      : column === "ongoing" ? { done: false, ongoing: true }
      : { done: false, ongoing: false };
    change(task, changes, `"${task.title}" → ${label}`);
  };

  // Tick: Done; untick (a Done card): back to To do.
  boardEl.addEventListener("change", (event) => {
    if (!event.target.classList.contains("tick")) return;
    const task = findTask(event.target.closest("[data-card]").dataset.card);
    moveTo(task, event.target.checked ? "done" : "todo");
  });

  const openCard = (id) => openTaskSheet(findTask(id), { onChange: redraw, meetingNames });
  const dispose = makeBoardDraggable(boardEl, {
    onTap: (id, type) => { if (type !== "mouse") openCard(id); },
    onDrop: (id, columnEl) => moveTo(findTask(id), columnEl.dataset.column),
  });
  boardEl.addEventListener("dblclick", (event) => {
    const card = event.target.closest("[data-card]");
    if (card && !event.target.closest("input, button, a, select, label")) openCard(card.dataset.card);
  });

  boardEl.addEventListener("qed:task-key", (event) => {
    const card = event.target.closest("[data-card]");
    if (!card) return;
    const task = findTask(card.dataset.card);
    const { action, value } = event.detail;
    if (action === "open") openCard(task.id);
    if (action === "done") moveTo(task, task.done ? "todo" : "done");
    if (action === "move") {
      const i = COLUMNS.findIndex((c) => c.value === columnOf(task)) + value;
      if (COLUMNS[i]) moveTo(task, COLUMNS[i].value);
    }
    if (action === "push" && !task.done && task.due_date !== d.tomorrow) {
      change(task, { ...pushChanges(task, d.tomorrow), ongoing: false }, `Pushed to tomorrow: "${task.title}"`);
    }
    if (action === "priority" && !task.done) change(task, { priority: value }, `"${task.title}": ${labelOf(PRIORITIES, value)}`);
  });
  return dispose;
}
