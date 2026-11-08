// taskList.js: how a task looks in a list, and quick add.
// Shared by the project page (step 4) and Priorities of the day (step 5).

import { createTask, updateTask } from "../storage.js";
import { PRIORITIES, STATES, SCOPES, labelOf, priorityScore } from "../rules.js";
import { escapeHtml } from "../utils/html.js";
import { friendlyDay } from "../utils/dates.js";
import { showToast } from "../utils/toast.js";

// One row: tick, title + details, score.
//   options.today         "YYYY-MM-DD" (Brussels)
//   options.projectNames  { id: name } to show the project (lists across projects)
//   options.showScore     show the priority score badge
export function taskRowHtml(task, { today, projectNames = null, showScore = true }) {
  const meta = [];
  if (task.due_date && !task.done) {
    const overdue = task.due_date < today;
    meta.push(`<span class="${overdue ? "overdue" : ""}">${escapeHtml(friendlyDay(task.due_date, today))}</span>`);
  }
  if (projectNames && task.project_id && projectNames[task.project_id]) {
    meta.push(`<span>${escapeHtml(projectNames[task.project_id])}</span>`);
  }
  const tags = [];
  if (task.is_meeting) tags.push(`<span class="pill">Meeting</span>`);
  if (task.state !== "active") {
    const label = task.state === "delegated" && task.delegated_to
      ? `Delegated to ${task.delegated_to}` : labelOf(STATES, task.state);
    tags.push(`<span class="pill state-${task.state}">${escapeHtml(label)}</span>`);
  }
  if (task.priority) tags.push(`<span class="pill prio-${task.priority}">${escapeHtml(labelOf(PRIORITIES, task.priority))}</span>`);
  if (task.scope) tags.push(`<span class="pill">${escapeHtml(labelOf(SCOPES, task.scope))}</span>`);
  if (task.period) tags.push(`<span class="pill">${task.period.toUpperCase()}</span>`);

  const score = priorityScore(task, today);
  return `
    <li class="task${task.done ? " is-done" : ""}" data-task="${task.id}">
      <input type="checkbox" class="tick" aria-label="Done: ${escapeHtml(task.title)}"${task.done ? " checked" : ""}>
      <button type="button" class="task-main" data-open>
        <span class="task-title">${escapeHtml(task.title)}</span>
        ${meta.length || tags.length ? `<span class="task-meta">${meta.join('<span aria-hidden="true">·</span>')}${tags.join("")}</span>` : ""}
      </button>
      ${showScore && !task.done ? `<span class="score" title="Priority score">${score}</span>` : ""}
    </li>`;
}

// Wires the ticks and the "open" buttons of a list drawn with taskRowHtml.
//   onOpen(task)   open the task sheet
//   onChange()     redraw after a change
export function wireTaskList(listEl, tasks, { onOpen, onChange }) {
  listEl.querySelectorAll("[data-task]").forEach((row) => {
    const task = tasks.find((t) => t.id === row.dataset.task);
    row.querySelector("[data-open]").addEventListener("click", () => onOpen(task));
    row.querySelector(".tick").addEventListener("change", async (event) => {
      const done = event.target.checked;
      row.classList.toggle("is-done", done);
      try {
        await updateTask(task.id, { done });
      } catch (error) {
        showToast("Could not save: " + error.message);
        event.target.checked = !done;
        row.classList.toggle("is-done", !done);
        return;
      }
      showToast(done ? `Done: "${task.title}"` : `Back to open: "${task.title}"`, {
        actionLabel: "Undo",
        onAction: async () => {
          await updateTask(task.id, { done: !done });
          onChange();
        },
      });
      onChange();
    });
  });
}

// Quick add: a title + a due date (default today). Enter adds it.
export function quickAddHtml({ today, placeholder = "Add a task…" }) {
  return `
    <form class="quick-add" novalidate>
      <input name="title" class="quick-title" placeholder="${escapeHtml(placeholder)}" maxlength="300" aria-label="New task">
      <input name="due_date" type="date" value="${today}" aria-label="Due date">
      <button type="submit" class="btn small">Add</button>
    </form>`;
}

// defaults = fields every new task gets (e.g. { project_id }).
export function wireQuickAdd(formEl, { defaults = {}, onAdded }) {
  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = formEl.elements.title.value.trim();
    if (!title) {
      formEl.elements.title.focus();
      return;
    }
    const button = formEl.querySelector("button");
    button.disabled = true;
    try {
      await createTask({ ...defaults, title, due_date: formEl.elements.due_date.value || null });
      formEl.elements.title.value = "";
      onAdded();
    } catch (error) {
      showToast("Could not add the task: " + error.message);
    }
    button.disabled = false;
  });
}
