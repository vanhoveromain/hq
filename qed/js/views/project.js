// project.js: one project's page (#/project/<id>).
//
//   - header: name, status / type / owner, dates, Notion link, Edit
//   - open tasks (by due date, then score) + quick add
//   - done tasks, folded
//   - notes: free text, saved by itself while you type

import { getProject, updateProject, listProjectTasks, listMeetingNames } from "../storage.js";
import { PROJECT_TYPES, PROJECT_STATUSES, SALES_STATUSES, OWNERS, DEFAULT_OWNER, labelOf, compareByDueThenScore } from "../rules.js";
import { openProjectForm } from "./projectForm.js";
import { openTaskSheet } from "./taskSheet.js";
import { taskListInnerHtml, wireTaskList, quickAddHtml, wireQuickAdd } from "./taskList.js";
import { escapeHtml, safeUrl, icon } from "../utils/html.js";
import { formatRange, brusselsToday } from "../utils/dates.js";
import { rememberOpened } from "./search.js";

// Remembered while the app is open: is the Done list unfolded?
let showDone = false;
// A notes save still on its way (redraws wait for it, so they never show
// older notes than what you typed).
let notesSaving = Promise.resolve();

export async function render(el, { params }) {
  const id = params[0];
  await notesSaving;
  if (!el.querySelector(".project-head")) el.innerHTML = `<p class="muted">Loading…</p>`;

  let project;
  let tasks;
  let meetingNames = [];
  try {
    [project, tasks, meetingNames] = await Promise.all([
      getProject(id), listProjectTasks(id), listMeetingNames().catch(() => []),
    ]);
  } catch (error) {
    el.innerHTML = `<p class="error">Could not load the project: ${escapeHtml(error.message)}</p>`;
    return;
  }
  if (!project) {
    el.innerHTML = `<p class="empty">This project doesn't exist any more. <a href="#/home">Back to Home</a></p>`;
    return;
  }

  const today = brusselsToday();
  const open = tasks.filter((t) => !t.done).sort((a, b) => compareByDueThenScore(a, b, today));
  const done = tasks.filter((t) => t.done).sort((a, b) => (b.done_at || "").localeCompare(a.done_at || ""));
  const redraw = () => render(el, { params });
  const isSales = project.type === "sales";
  const backHref = isSales ? "#/sales" : "#/home";
  // A lead's page belongs to Sales: light that tab instead of Home.
  document.querySelectorAll("[data-route]").forEach((link) => {
    const active = link.dataset.route === (isSales ? "sales" : "home");
    link.classList.toggle("active", active);
    if (active) link.setAttribute("aria-current", "page"); else link.removeAttribute("aria-current");
  });

  document.title = `${project.name} · QED HQ`;
  rememberOpened({ kind: "project", id: project.id, label: project.name, sub: isSales ? "Lead" : labelOf(PROJECT_STATUSES, project.status) });
  el.innerHTML = `
    <a class="back" href="${backHref}">${icon("back")} ${isSales ? "Sales" : "Projects"}</a>
    <header class="project-head">
      <div>
        <h1 class="project-name">${escapeHtml(project.name)}</h1>
        <p class="project-meta">
          ${headerTags(project)}
          <span class="muted">${escapeHtml(formatRange(project.date_start, project.date_end) || "No date yet")}</span>
        </p>
      </div>
      <div class="project-actions">
        ${notionLink(project)}
        <button type="button" class="btn secondary small" id="edit-project">${icon("pencil")} Edit</button>
      </div>
    </header>

    <section class="section">
      <div class="section-head"><h2 class="section-title">Tasks <span class="count">${open.length} open</span></h2></div>
      ${quickAddHtml({ today })}
      ${open.length
        ? `<ul class="task-list" id="open-tasks">${taskListInnerHtml(open, { today })}</ul>`
        : `<p class="empty">No open tasks. Add one above.</p>`}
      ${done.length ? `
        <details class="done-list"${showDone ? " open" : ""}>
          <summary>Done (${done.length})</summary>
          <ul class="task-list" id="done-tasks">${taskListInnerHtml(done, { today })}</ul>
        </details>` : ""}
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">Notes</h2>
        <span class="save-state muted" id="notes-state" aria-live="polite"></span>
      </div>
      <textarea class="notes" id="notes" rows="10" maxlength="100000" placeholder="Meeting notes, contacts, decisions…">${escapeHtml(project.notes || "")}</textarea>
    </section>
  `;

  const onOpen = (task) => openTaskSheet(task, { onChange: redraw, meetingNames });
  const listOptions = { onOpen, onChange: redraw, rowOptions: { today }, meetingNames };
  const openEl = el.querySelector("#open-tasks");
  if (openEl) wireTaskList(openEl, open, listOptions);
  const doneEl = el.querySelector("#done-tasks");
  if (doneEl) wireTaskList(doneEl, done, listOptions);
  const details = el.querySelector(".done-list");
  if (details) details.addEventListener("toggle", () => { showDone = details.open; });

  wireQuickAdd(el.querySelector(".quick-add"), { defaults: { project_id: project.id }, onAdded: redraw });

  el.querySelector("#edit-project").addEventListener("click", () => {
    openProjectForm({ project, onChange: redraw, onDeleted: () => { window.location.hash = "#/home"; } });
  });

  wireNotes(el.querySelector("#notes"), el.querySelector("#notes-state"), project);
}

function headerTags(p) {
  const tags = [];
  if (p.type === "sales" && p.sales_status) tags.push(`<span class="pill">${escapeHtml(labelOf(SALES_STATUSES, p.sales_status))}</span>`);
  if (p.status) tags.push(`<span class="pill status-${p.status}">${escapeHtml(labelOf(PROJECT_STATUSES, p.status))}</span>`);
  tags.push(`<span class="pill">${escapeHtml(labelOf(PROJECT_TYPES, p.type))}</span>`);
  if (p.owner !== DEFAULT_OWNER) tags.push(`<span class="pill owner">${escapeHtml(labelOf(OWNERS, p.owner) || p.owner)}</span>`);
  return tags.join("");
}

function notionLink(p) {
  const url = safeUrl(p.notion_url);
  return url ? `<a class="btn secondary small" href="${escapeHtml(url)}" target="_blank" rel="noopener">${icon("external")} Notion</a>` : "";
}

// Notes save by themselves: 1 second after you stop typing, and when you
// leave the field. "Saving… / Saved" shows next to the title.
function wireNotes(textarea, stateEl, project) {
  let timer = null;
  let lastSaved = project.notes || "";

  function save() {
    clearTimeout(timer);
    if (textarea.value === lastSaved) return notesSaving;
    notesSaving = saveNow();
    return notesSaving;
  }

  async function saveNow() {
    const value = textarea.value;
    stateEl.textContent = "Saving…";
    try {
      await updateProject(project.id, { notes: value.trim() ? value : null });
      lastSaved = value;
      stateEl.textContent = "Saved";
    } catch (error) {
      stateEl.textContent = "Not saved: " + error.message;
    }
  }

  textarea.addEventListener("input", () => {
    stateEl.textContent = "";
    clearTimeout(timer);
    timer = setTimeout(save, 1000);
  });
  textarea.addEventListener("blur", save);
}
