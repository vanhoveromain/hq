// taskList.js: task rows you edit in place, and quick add.
// Shared by the project page and (from step 5) Priorities of the day.
//
// The title is plain text (click it to rename). Fields that are set show as
// soft tags; tap one to change it (a menu, a date picker or a toggle). Empty
// fields stay out of sight: they appear when you hover the row (laptop) or tap
// "+" (phone). "⋯" opens the full task sheet (project, notes, delete…).
// A change saves straight away and shows on the row at once; half a second
// after your last change the whole list redraws, so it re-sorts (Romain,
// 2026-11-09). The priority score only decides the order: it isn't shown.

import { createTask, updateTask } from "../storage.js";
import { PRIORITIES, STATES, SCOPES, PERIODS, DELEGATES } from "../rules.js";
import { escapeHtml, icon } from "../utils/html.js";
import { friendlyDay, brusselsToday, addDays } from "../utils/dates.js";
import { showToast } from "../utils/toast.js";

// One row.
//   options.today     "YYYY-MM-DD" (Brussels)
//   options.projects  [{id, name}] -> adds a Project chip (lists across projects)
//   options.showPush  show a "Push to tomorrow" button on the row
//   options.showFocus show a "Focus" button (To do today only, decided 2026-11-08)
export function taskRowHtml(task, { today, projects = null, showPush = false, showFocus = false, expanded = false }) {
  // Fields grouped in cells. On a phone the cells simply flow under the
  // title; on a laptop each cell is a column, aligned from row to row.
  const cell = (name, html) => `<span class="cell cell-${name}">${html}</span>`;
  const status = [
    selectChip("state", "State", STATES, task.state, {
      clearable: false,
      classFor: (v) => (v === "active" ? "is-empty" : `state-${v}`),
    }),
    selectChip("delegated_to", "Delegate to", DELEGATES, task.delegated_to),
    `<button type="button" class="tchip${task.is_meeting ? " is-on" : " is-empty"}" data-toggle="is_meeting" aria-pressed="${task.is_meeting}">${icon("meeting")}Meeting</button>`,
    task.is_meeting
      ? `<button type="button" class="tchip${task.meeting_name ? "" : " is-empty"}" data-edit-text="meeting_name">${escapeHtml(task.meeting_name || "Which meeting?")}</button>`
      : "",
  ].join("");
  const cells = [
    cell("due", dateChip(task, today)),
    cell("period", selectChip("period", "AM / PM", PERIODS, task.period, { emptyLabel: "AM/PM" })),
    cell("priority", selectChip("priority", "Priority", PRIORITIES, task.priority, { classFor: (v) => `prio-${v}` })),
    cell("scope", selectChip("scope", "Scope", SCOPES, task.scope)),
    cell("status", status),
  ];
  if (projects) {
    cells.push(cell("project", selectChip("project_id", "Project", projects.map((p) => ({ value: p.id, label: p.name })), task.project_id, {
      emptyLabel: "No project", clearLabel: "No project",
    })));
  }
  cells.push(cell("add", `<button type="button" class="tchip-add" data-expand aria-label="Show all fields of ${escapeHtml(task.title)}" title="Show all fields">${icon("plus")}</button>`));

  // The push slot is always there (empty if not used), so the columns line
  // up in every list.
  return `
    <li class="task${task.done ? " is-done" : ""}${expanded ? " show-all" : ""}" data-task="${task.id}">
      <input type="checkbox" class="tick" aria-label="Done: ${escapeHtml(task.title)}"${task.done ? " checked" : ""}>
      <div class="task-body">
        <button type="button" class="task-title" data-edit-text="title" title="Click to rename">${escapeHtml(task.title)}</button>
        <div class="task-chips">${cells.join("")}</div>
      </div>
      <span class="slot-push">${showFocus && !task.done ? `<a class="icon-btn task-focus" href="#/focus/${task.id}" aria-label="Focus on ${escapeHtml(task.title)}" title="Focus on this task">${icon("target")}</a>` : ""}${showPush && !task.done ? `<button type="button" class="icon-btn task-push" data-push aria-label="Push ${escapeHtml(task.title)} to tomorrow" title="Push to tomorrow">${icon("forward")}</button>` : ""}</span>
      <button type="button" class="icon-btn task-more" data-open aria-label="Open ${escapeHtml(task.title)}">${icon("more")}</button>
    </li>`;
}

// A whole list: the column titles (shown on a laptop only), then the rows.
// Put it inside <ul class="task-list"> (add "with-project" when rowOptions
// has projects, for the extra column).
export function taskListInnerHtml(tasks, rowOptions) {
  const head = `
    <li class="task-head" aria-hidden="true">
      <span></span><span>Task</span><span>Due</span><span>AM/PM</span><span>Priority</span><span>Scope</span><span>Status</span>
      ${rowOptions.projects ? "<span>Project</span>" : ""}<span></span><span></span>
    </li>`;
  return head + tasks.map((t) => taskRowHtml(t, rowOptions)).join("");
}

// A <select> dressed as a chip. The menu shows the field's name as a heading
// (a group label you can't pick), then the choices, then "Clear" when the
// field is set. An empty field has NO option ticked: the select is left on
// "nothing chosen" (selectedIndex -1, set by markEmptySelects), so picking any
// choice, even the first one, counts as a change.
//   title       heading in the menu ("Priority")
//   emptyLabel  what the chip says when empty (default: the title)
//   clearable   offer "Clear" (State always has a value: false)
//   classFor    extra class for a set value (colours)
function selectChip(field, title, list, value, options = {}) {
  const { emptyLabel = title, clearable = true, clearLabel = "Clear", classFor = () => "" } = options;
  const selected = list.find((o) => o.value === value);
  const cls = selected ? classFor(value) : "is-empty";
  const choices = list.map((o) =>
    `<option value="${escapeHtml(o.value)}"${o.value === value ? " selected" : ""}>${escapeHtml(o.label)}</option>`).join("");
  const clear = selected && clearable ? `<option value="">${escapeHtml(clearLabel)}</option>` : "";
  return `
    <label class="tchip tchip-select ${cls}">
      <span class="sr-only">${escapeHtml(title)}</span>
      <span aria-hidden="true">${escapeHtml(selected ? selected.label : emptyLabel)}</span>
      <select data-field="${field}"${selected ? "" : " data-empty"}><optgroup label="${escapeHtml(title)}">${choices}</optgroup>${clear}</select>
    </label>`;
}

// Empty fields: no choice ticked (see selectChip).
function markEmptySelects(rootEl) {
  rootEl.querySelectorAll("select[data-empty]").forEach((select) => { select.selectedIndex = -1; });
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
//   onSaved(task)  after a field changed in place (e.g. update a counter)
export function wireTaskList(listEl, tasks, { onOpen, onChange, rowOptions, meetingNames = [], onSaved = () => {} }) {
  markEmptySelects(listEl);
  listEl.querySelectorAll("[data-task]").forEach((row) => {
    if (expandedIds.has(row.dataset.task)) row.classList.add("show-all");
  });
  const byId = (row) => tasks.find((t) => t.id === row.dataset.task);
  const rowOf = (el) => el.closest("[data-task]");

  // Shows the change on the row at once and saves it. Half a second after
  // the LAST save has finished, the whole list redraws (and so re-sorts):
  // a few quick changes in a row don't make the list jump between each one.
  let saving = 0;
  let resortTimer = null;
  async function save(task, changes) {
    const before = {};
    for (const key of Object.keys(changes)) before[key] = task[key];
    Object.assign(task, changes);
    redrawRow(task);
    onSaved(task);
    clearTimeout(resortTimer);
    saving += 1;
    try {
      await updateTask(task.id, changes);
    } catch (error) {
      Object.assign(task, before);
      redrawRow(task);
      onSaved(task);
      showToast("Could not save: " + error.message);
    }
    saving -= 1;
    if (!saving) resortTimer = setTimeout(resortUnlessTyping, 500);
  }

  // Not while you're typing a title or a meeting name: try again after.
  function resortUnlessTyping() {
    const typing = listEl.querySelector(".task-title-input, .tchip-input");
    if (typing) {
      typing.addEventListener("blur", () => { resortTimer = setTimeout(resortUnlessTyping, 500); }, { once: true });
      return;
    }
    onChange();
  }


  function redrawRow(task) {
    const row = listEl.querySelector(`[data-task="${task.id}"]`);
    if (!row) return;
    row.outerHTML = taskRowHtml(task, { ...rowOptions, expanded: expandedIds.has(task.id) });
    markEmptySelects(listEl.querySelector(`[data-task="${task.id}"]`));
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
    if (event.target.closest("[data-push]")) {
      pushToTomorrow(task);
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

  // Push to tomorrow: the task leaves today's lists, so the whole screen
  // redraws; Undo puts the old date back.
  async function pushToTomorrow(task) {
    const before = task.due_date;
    try {
      await updateTask(task.id, { due_date: addDays(brusselsToday(), 1) });
    } catch (error) {
      showToast("Could not save: " + error.message);
      return;
    }
    showToast(`Pushed to tomorrow: "${task.title}"`, {
      actionLabel: "Undo",
      onAction: async () => {
        await updateTask(task.id, { due_date: before });
        onChange();
      },
    });
    onChange();
  }

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

// Rows opened up with "+" stay open while you edit them, also after the
// list redraws to re-sort.
const expandedIds = new Set();

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
// With `projects` (Priorities, Planner: lists across projects), a project menu
// too, so a new task isn't left without one (UX review #5, 2026-11-13). The
// last project picked stays picked while the app is open.
let lastQuickProject = "";

export function quickAddHtml({ today, placeholder = "Add a task…", projects = null }) {
  const choices = projects
    ? projects
      .filter((p) => p.status !== "archived")
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
    : null;
  if (choices && !choices.some((p) => p.id === lastQuickProject)) lastQuickProject = "";
  const projectMenu = choices ? `
      <select name="project_id" class="quick-project" aria-label="Project">
        <option value="">No project</option>
        ${choices.map((p) => `<option value="${escapeHtml(p.id)}"${p.id === lastQuickProject ? " selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
      </select>` : "";
  return `
    <form class="quick-add" novalidate>
      <input name="title" class="quick-title" placeholder="${escapeHtml(placeholder)}" maxlength="300" aria-label="New task">
      ${projectMenu}
      <input name="due_date" type="date" value="${today}" aria-label="Due date">
      <button type="submit" class="btn small">Add</button>
    </form>`;
}

// defaults = fields every new task gets (e.g. { project_id }).
export function wireQuickAdd(formEl, { defaults = {}, onAdded }) {
  const projectMenu = formEl.elements.project_id || null;
  if (projectMenu) projectMenu.addEventListener("change", () => { lastQuickProject = projectMenu.value; });
  formEl.addEventListener("submit", async (event) => {
    event.preventDefault();
    const title = formEl.elements.title.value.trim();
    if (!title) {
      formEl.elements.title.focus();
      return;
    }
    const button = formEl.querySelector("button");
    button.disabled = true;
    const fields = { ...defaults, title, due_date: formEl.elements.due_date.value || null };
    if (projectMenu) fields.project_id = projectMenu.value || null;
    try {
      await createTask(fields);
      formEl.elements.title.value = "";
      onAdded();
    } catch (error) {
      showToast("Could not add the task: " + error.message);
    }
    button.disabled = false;
  });
}
