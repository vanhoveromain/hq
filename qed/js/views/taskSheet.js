// taskSheet.js: the task sheet, every field of one task in a pop-up
// (a full sheet on a phone). Also "Push to tomorrow" and "Delete".

import { listProjects, updateTask, deleteTask } from "../storage.js";
import { PRIORITIES, STATES, SCOPES, PERIODS, DELEGATES } from "../rules.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/html.js";
import { brusselsToday, addDays } from "../utils/dates.js";

// onChange() = redraw the screen after a save / delete.
export async function openTaskSheet(task, { onChange, meetingNames = [] }) {
  // Projects for the "Project" menu: active ones, plus the task's own.
  let projects = [];
  try {
    projects = (await listProjects())
      .filter((p) => p.status !== "archived" || p.id === task.project_id)
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
  } catch {
    // The sheet still opens; the project menu just shows the current link.
  }

  const actions = [];
  if (!task.done) {
    actions.push({
      label: "Push to tomorrow",
      // Saves what's in the form, with tomorrow as the due date.
      onClick: (form) => {
        form.elements.due_date.value = addDays(brusselsToday(), 1);
        return save(form, "Pushed to tomorrow.");
      },
    });
  }
  actions.push({
    label: "Delete", kind: "danger", confirm: "Click again to delete",
    onClick: async () => {
      await deleteTask(task.id);
      showToast(`Task deleted: "${task.title}"`);
      onChange();
    },
  });

  async function save(form, message) {
    const f = form.elements;
    const title = f.title.value.trim();
    if (!title) throw new Error("Please give the task a title.");
    await updateTask(task.id, {
      title,
      project_id: f.project_id.value || null,
      due_date: f.due_date.value || null,
      period: f.period.value || null,
      scope: f.scope.value || null,
      priority: f.priority.value || null,
      state: f.state.value,
      is_meeting: f.is_meeting.checked,
      meeting_name: f.is_meeting.checked ? (f.meeting_name.value.trim() || null) : null,
      delegated_to: f.delegated_to.value || null,
      notes: f.notes.value.trim() || null,
      done: f.done.checked,
    });
    if (message) showToast(message);
    onChange();
  }

  openDialog({
    title: "Task",
    actions,
    body: `
      <label class="check-field"><input type="checkbox" name="done"${task.done ? " checked" : ""}> Done</label>
      <label class="field"><span>Title</span>
        <input name="title" required maxlength="300" value="${escapeHtml(task.title)}"></label>
      <label class="field"><span>Project</span>
        <select name="project_id">${projectOptions(projects, task.project_id)}</select></label>
      <div class="field-row">
        <label class="field"><span>Due date</span>
          <input name="due_date" type="date" value="${escapeHtml(task.due_date || "")}"></label>
        <label class="field"><span>Period</span>
          <select name="period">${options(PERIODS, task.period, "—")}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Priority</span>
          <select name="priority">${options(PRIORITIES, task.priority, "—")}</select></label>
        <label class="field"><span>Scope</span>
          <select name="scope">${options(SCOPES, task.scope, "—")}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>State</span>
          <select name="state">${options(STATES, task.state)}</select></label>
        <label class="field"><span>Delegated to</span>
          <select name="delegated_to">${options(DELEGATES, task.delegated_to, "—")}</select></label>
      </div>
      <label class="check-field"><input type="checkbox" name="is_meeting"${task.is_meeting ? " checked" : ""}> To settle in a meeting</label>
      <label class="field" data-meeting-name><span>Which meeting <em>(optional)</em></span>
        <input name="meeting_name" maxlength="120" list="sheet-meeting-names" placeholder="e.g. Weekly team meeting" value="${escapeHtml(task.meeting_name || "")}">
        <datalist id="sheet-meeting-names">${meetingNames.map((n) => `<option value="${escapeHtml(n)}"></option>`).join("")}</datalist></label>
      <label class="field"><span>Notes</span>
        <textarea name="notes" rows="5" maxlength="20000">${escapeHtml(task.notes || "")}</textarea></label>`,
    onOpen(form) {
      // "Which meeting" only shows for points to settle in a meeting.
      const meetingBox = form.elements.is_meeting;
      const nameField = form.querySelector("[data-meeting-name]");
      const syncMeeting = () => { nameField.hidden = !meetingBox.checked; };
      meetingBox.addEventListener("change", syncMeeting);
      syncMeeting();
      // Picking someone in "Delegated to" marks the task as Delegated.
      form.elements.delegated_to.addEventListener("change", () => {
        if (form.elements.delegated_to.value) form.elements.state.value = "delegated";
      });
    },
    onSubmit: (form) => save(form),
  });
}

function options(list, selected, emptyLabel) {
  const empty = emptyLabel !== undefined
    ? `<option value=""${selected ? "" : " selected"}>${escapeHtml(emptyLabel)}</option>` : "";
  return empty + list.map((o) =>
    `<option value="${escapeHtml(o.value)}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
  ).join("");
}

function projectOptions(projects, selectedId) {
  const list = projects.slice();
  // Keep the current link visible even if the list couldn't load.
  if (selectedId && !list.some((p) => p.id === selectedId)) list.unshift({ id: selectedId, name: "(current project)" });
  return `<option value=""${selectedId ? "" : " selected"}>No project</option>` + list.map((p) =>
    `<option value="${p.id}"${p.id === selectedId ? " selected" : ""}>${escapeHtml(p.name)}</option>`,
  ).join("");
}
