// taskList.js: task rows you edit in place, and quick add.
// Shared by the project page and (from step 5) Priorities of the day.
//
// The title is plain text (click it to rename). Fields that are set show as
// soft tags; tap one to change it (a menu, a date picker or a toggle). Empty
// fields stay out of sight: they appear when you hover the row (laptop) or tap
// "+" (phone). "⋯" opens the full task sheet (project, notes, delete…).
// A change saves straight away and redraws only that row, so the list doesn't
// jump around while you edit; it re-sorts the next time the list is drawn.

import { createTask, updateTask } from "../storage.js";
import { PRIORITIES, STATES, SCOPES, PERIODS, DELEGATES, priorityScore } from "../rules.js";
import { escapeHtml, icon } from "../utils/html.js";
import { friendlyDay } from "../utils/dates.js";
import { showToast } from "../utils/toast.js";

// One row.
//   options.today     "YYYY-MM-DD" (Brussels)
//   options.projects  [{id, name}] -> adds a Project chip (lists across projects)
//   options.showScore show the priority score badge
export function taskRowHtml(task, { today, projects = null, showScore = true, expanded = false }) {
  const chips = [];
  chips.push(dateChip(task, today));
  chips.push(selectChip("period", PERIODS, task.period, "AM/PM"));
  chips.push(selectChip("priority", PRIORITIES, task.priority, "Priority", (v) => `prio-${v}`));
  chips.push(selectChip("scope", SCOPES, task.scope, "Scope"));
  chips.push(selectChip("state", STATES, task.state, null, (v) => (v === "active" ? "is-empty" : `state-${v}`)));
  chips.push(selectChip("delegated_to", DELEGATES, task.delegated_to, "Delegate to"));
  chips.push(`<button type="button" class="tchip${task.is_meeting ? " is-on" : " is-empty"}" data-toggle="is_meeting" aria-pressed="${task.is_meeting}">${icon("meeting")}Meeting</button>`);
  if (task.is_meeting) {
    chips.push(`<button type="button" class="tchip${task.meeting_name ? "" : " is-empty"}" data-edit-text="meeting_name">${escapeHtml(task.meeting_name || "Which meeting?")}</button>`);
  }
  if (projects) {
    chips.push(selectChip("project_id", projects.map((p) => ({ value: p.id, label: p.name })), task.project_id, "No project"));
  }
  chips.push(`<button type="button" class="tchip-add" data-expand aria-label="Show all fields of ${escapeHtml(task.title)}" title="Show all fields">${icon("plus")}</button>`);

  const score = priorityScore(task, today);
  return `
    <li class="task${task.done ? " is-done" : ""}${expanded ? " show-all" : ""}" data-task="${task.id}">
      <input type="checkbox" class="tick" aria-label="Done: ${escapeHtml(task.title)}"${task.done ? " checked" : ""}>
      <div class="task-body">
        <button type="button" class="task-title" data-edit-text="title" title="Click to rename">${escapeHtml(task.title)}</button>
        <div class="task-chips">${chips.join("")}</div>
      </div>
      ${showScore && !task.done ? `<span class="score" title="Priority score">${score}</span>` : ""}
      <button type="button" class="icon-btn task-more" data-open aria-label="Open ${escapeHtml(task.title)}">${icon("more")}</button>
    </li>`;
}

// A <select> dressed as a chip. emptyLabel = what it says when nothing is set
// (null = no empty option, e.g. State always has a value).
function selectChip(field, list, value, emptyLabel, classFor = () => "") {
  const selected = list.find((o) => o.value === value);
  const cls = selected ? classFor(value) : "is-empty";
  const label = selected ? selected.label : emptyLabel;
  const empty = emptyLabel !== null
    ? `<option value=""${value ? "" : " selected"}>${escapeHtml(selected ? "— none —" : emptyLabel)}</option>` : "";
  return `
    <label class="tchip tchip-select ${cls}">
      <span class="sr-only">${escapeHtml(emptyLabel || field)}</span>
      <span aria-hidden="true">${escapeHtml(label || "")}</span>
      <select data-field="${field}">${empty}${list.map((o) =>
        `<option value="${escapeHtml(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>
    </label>`;
}

function dateChip(task, today) {
  const overdue = !task.done && task.due_date && task.due_date < today;
  return `
    <label class="tchip tchip-date${task.due_date ? "" : " is-empty"}${overdue ? " is-overdue" : ""}">
      ${icon("calendar")}<span>${escapeHtml(task.due_date ? friendlyDay(task.due_date, today) : "Due date")}</span>
      <input type="date" data-field="due_date" value="${escapeHtml(task.due_date || "")}" aria-label="Due date">
    </label>`;
}

// Wires a list drawn with taskRowHtml. Listeners sit on the list itself, so
// rows can be redrawn freely.
//   onOpen(task)   open the task sheet
//   onChange()     full redraw (after a tick: the task moves to Done)
//   rowOptions     the options taskRowHtml was called with
//   meetingNames   suggestions for "Which meeting?"
export function wireTaskList(listEl, tasks, { onOpen, onChange, rowOptions, meetingNames = [] }) {
  const byId = (row) => tasks.find((t) => t.id === row.dataset.task);
  const rowOf = (el) => el.closest("[data-task]");

  // Shows the change at once, saves it, and redraws only that row. The
  // database's answer is not copied back: with two quick changes in a row,
  // the first answer would otherwise undo the second one on screen.
  async function save(task, changes) {
    const before = {};
    for (const key of Object.keys(changes)) before[key] = task[key];
    Object.assign(task, changes);
    redrawRow(task);
    try {
      await updateTask(task.id, changes);
    } catch (error) {
      Object.assign(task, before);
      redrawRow(task);
      showToast("Could not save: " + error.message);
    }
  }

  // Rows opened up with "+" stay open while you edit them.
  const expandedIds = new Set();

  function redrawRow(task) {
    const row = listEl.querySelector(`[data-task="${task.id}"]`);
    if (row) row.outerHTML = taskRowHtml(task, { ...rowOptions, expanded: expandedIds.has(task.id) });
  }

  listEl.addEventListener("change", async (event) => {
    const row = rowOf(event.target);
    if (!row) return;
    const task = byId(row);

    if (event.target.classList.contains("tick")) {
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
      return;
    }

    const field = event.target.dataset.field;
    if (!field) return;
    const value = event.target.value || null;
    const changes = { [field]: value };
    // Picking someone to delegate to marks the task as Delegated.
    if (field === "delegated_to" && value) changes.state = "delegated";
    if (field === "state" && !value) changes.state = "active";
    save(task, changes);
  });

  listEl.addEventListener("click", (event) => {
    const row = rowOf(event.target);
    if (!row) return;
    const task = byId(row);

    if (event.target.closest("[data-open]")) {
      onOpen(task);
      return;
    }
    if (event.target.closest("[data-expand]")) {
      const open = !row.classList.contains("show-all");
      row.classList.toggle("show-all", open);
      if (open) expandedIds.add(task.id); else expandedIds.delete(task.id);
      return;
    }
    // Date chip: open the picker straight away where the browser allows it.
    const dateInput = event.target.closest(".tchip-date")?.querySelector("input");
    if (dateInput && event.target !== dateInput) {
      event.preventDefault();
      try { dateInput.showPicker(); } catch { dateInput.focus(); }
      return;
    }
    const toggle = event.target.closest("[data-toggle]");
    if (toggle) {
      const on = !task.is_meeting;
      save(task, on ? { is_meeting: true } : { is_meeting: false, meeting_name: null });
      return;
    }
    const textButton = event.target.closest("[data-edit-text]");
    if (textButton) editText(textButton, task, textButton.dataset.editText);
  });

  // Title / meeting name: the button turns into a text box. Enter or leaving
  // the box saves; Esc cancels.
  function editText(button, task, field) {
    const input = document.createElement("input");
    input.className = field === "title" ? "task-title-input" : "tchip-input";
    input.value = task[field] || "";
    input.maxLength = field === "title" ? 300 : 120;
    if (field === "meeting_name") {
      input.placeholder = "Which meeting?";
      input.setAttribute("list", "meeting-names");
      ensureMeetingList(meetingNames);
    }
    button.replaceWith(input);
    input.focus();
    input.select();

    let finished = false;
    const finish = (keep) => {
      if (finished) return;
      finished = true;
      const value = input.value.trim();
      if (!keep || value === (task[field] || "") || (field === "title" && !value)) {
        redrawRow(task);
        return;
      }
      save(task, { [field]: value || null });
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); finish(true); }
      if (e.key === "Escape") finish(false);
    });
    input.addEventListener("blur", () => finish(true));
  }
}

// Suggestions for meeting names, shared by every box that asks for one.
function ensureMeetingList(names) {
  let list = document.getElementById("meeting-names");
  if (!list) {
    list = document.createElement("datalist");
    list.id = "meeting-names";
    document.body.append(list);
  }
  list.innerHTML = names.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("");
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
