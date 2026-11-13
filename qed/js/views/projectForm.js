// projectForm.js: the "New project" / "Edit project" pop-up.
// Used by Home (+ New) and the project page (Edit).

import { createProject, updateProject, deleteProject } from "../storage.js";
import {
  PROJECT_TYPES, PROJECT_STATUSES, SALES_STATUSES, OWNERS, DEFAULT_OWNER, labelOf,
} from "../rules.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml } from "../utils/html.js";

// project = an existing row (edit) or null (new). defaults = what "+ New"
// pre-fills. onChange() = redraw the screen after any save.
export function openProjectForm({ project = null, defaults = {}, onChange, onDeleted }) {
  const p = project || { type: "bespoke", status: "coming_up", owner: DEFAULT_OWNER, ...defaults };
  const isNew = !project;

  const actions = [];
  if (!isNew) {
    const archived = p.status === "archived";
    actions.push({
      label: archived ? "Restore" : "Archive",
      onClick: () => (archived ? restore(project, onChange) : archive(project, onChange)),
    });
    actions.push({
      label: "Delete", kind: "danger", confirm: "Click again to delete",
      onClick: async () => {
        await deleteProject(project.id);
        showToast(`"${project.name}" deleted. Its tasks were kept.`);
        (onDeleted || onChange)();
      },
    });
  }

  openDialog({
    title: isNew ? "New project" : "Edit project",
    submitLabel: isNew ? "Create" : "Save",
    actions,
    body: `
      <label class="field"><span>Name</span>
        <input name="name" required maxlength="200" value="${escapeHtml(p.name || "")}"></label>
      <div class="field-row">
        <label class="field"><span>Type</span>
          <select name="type">${options(PROJECT_TYPES, p.type)}</select></label>
        <label class="field" data-show="project"><span>Status</span>
          <select name="status">${options(PROJECT_STATUSES, p.status, "—")}</select></label>
        <label class="field" data-show="sales"><span>Sales status</span>
          <select name="sales_status">${options(SALES_STATUSES, p.sales_status, "—")}</select></label>
      </div>
      <label class="field"><span>Owner</span>
        <select name="owner">${options(OWNERS, p.owner)}</select></label>
      <div class="field-row">
        <label class="field"><span>Start date</span>
          <input name="date_start" type="date" value="${escapeHtml(p.date_start || "")}"></label>
        <label class="field"><span>End date <em>(optional)</em></span>
          <input name="date_end" type="date" value="${escapeHtml(p.date_end || "")}"></label>
      </div>
      <div class="field-row" data-show="sales">
        <label class="field"><span>Contact person</span>
          <input name="contact_name" maxlength="200" autocomplete="off" value="${escapeHtml(p.contact_name || "")}"></label>
        <label class="field"><span>Contact email</span>
          <input name="contact_email" type="email" inputmode="email" maxlength="320" autocomplete="off" value="${escapeHtml(p.contact_email || "")}"></label>
      </div>
      <label class="field" data-show="sales"><span>Reach out on <em>(empty = automatic: created + 1 year)</em></span>
        <input name="reach_out_on" type="date" value="${escapeHtml(p.reach_out_on || "")}"></label>
      <label class="field"><span>Notion link <em>(optional)</em></span>
        <input name="notion_url" type="url" inputmode="url" placeholder="https://www.notion.so/…" value="${escapeHtml(p.notion_url || "")}"></label>`,
    onOpen(form) {
      // Sales leads use Sales status; other projects use Status.
      const typeSelect = form.elements.type;
      const sync = () => {
        const sales = typeSelect.value === "sales";
        form.querySelectorAll('[data-show="sales"]').forEach((el) => { el.hidden = !sales; });
        if (sales && !form.elements.sales_status.value) form.elements.sales_status.value = "lead";
        if (!sales && !form.elements.status.value) form.elements.status.value = "coming_up";
      };
      typeSelect.addEventListener("change", sync);
      sync();
    },
    async onSubmit(form) {
      const values = readForm(form);
      if (isNew) {
        const created = await createProject(values);
        showToast(`"${created.name}" created.`);
      } else {
        await updateProject(project.id, values);
      }
      onChange();
    },
  });
}

function options(list, selected, emptyLabel) {
  const empty = emptyLabel !== undefined
    ? `<option value=""${selected ? "" : " selected"}>${escapeHtml(emptyLabel)}</option>` : "";
  return empty + list.map((o) =>
    `<option value="${o.value}"${o.value === selected ? " selected" : ""}>${escapeHtml(o.label)}</option>`,
  ).join("");
}

// Reads and checks the form. Throws an Error with a readable message.
function readForm(form) {
  const f = form.elements;
  const name = f.name.value.trim();
  if (!name) throw new Error("Please give the project a name.");
  const type = f.type.value;
  const dateStart = f.date_start.value || null;
  const dateEnd = f.date_end.value || null;
  if (dateStart && dateEnd && dateEnd < dateStart) {
    throw new Error("The end date is before the start date.");
  }
  const email = f.contact_email.value.trim();
  if (type === "sales" && email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("The contact email doesn't look right.");
  }
  const notionUrl = f.notion_url.value.trim() || null;
  if (notionUrl && !/^https:\/\//i.test(notionUrl)) {
    throw new Error("The Notion link must start with https://");
  }
  return {
    name,
    type,
    status: f.status.value || null,
    sales_status: type === "sales" ? (f.sales_status.value || null) : null,
    reach_out_on: type === "sales" ? (f.reach_out_on.value || null) : null,
    contact_name: type === "sales" ? (f.contact_name.value.trim() || null) : null,
    contact_email: type === "sales" ? (f.contact_email.value.trim() || null) : null,
    owner: f.owner.value,
    date_start: dateStart,
    date_end: dateEnd,
    notion_url: notionUrl,
  };
}

async function archive(project, onChange) {
  const previous = project.status;
  await updateProject(project.id, { status: "archived" });
  showToast(`"${project.name}" archived.`, {
    actionLabel: "Undo",
    onAction: async () => {
      await updateProject(project.id, { status: previous });
      onChange();
    },
  });
  onChange();
}

async function restore(project, onChange) {
  await updateProject(project.id, { status: "coming_up" });
  showToast(`"${project.name}" restored as ${labelOf(PROJECT_STATUSES, "coming_up")}.`);
  onChange();
}
