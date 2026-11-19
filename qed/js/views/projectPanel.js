// projectPanel.js: a project in a side panel (Romain, 2026-11-19).
//
// Opened by a click on a task's project name on Priorities and in the
// routines (Plan my day / Close the day), so you can look at a project and
// add tasks to it without leaving the page. Laptop: a panel from the right,
// the page stays visible behind it. Phone (< 720 px): full screen.
//
//   - header: name, status / type, dates, "Open full page", close
//   - quick add (today by default, the project already set)
//   - the project's open tasks, edited in place like everywhere else
//
// Closing it (cross, Esc, a click outside) redraws the page underneath once,
// if anything changed, so a task added for today shows up straight away.
// Moving a task to another project: "⋯" (the task sheet), not this panel.

import { getProject, listProjectTasks, listMeetingNames } from "../storage.js";
import { PROJECT_TYPES, SALES_STATUSES, labelOf, compareByDueThenScore, projectStatusLabel, hasDates } from "../rules.js";
import { openTaskSheet } from "./taskSheet.js";
import { taskListInnerHtml, wireTaskList, quickAddHtml, wireQuickAdd } from "./taskList.js";
import { escapeHtml, icon, errorHtml } from "../utils/html.js";
import { formatRange, brusselsToday } from "../utils/dates.js";

let openNow = null;

// onClose() = redraw the page underneath (only called when something changed).
export function openProjectPanel(projectId, { onClose = () => {} } = {}) {
  if (openNow) openNow.close();
  const dialog = document.createElement("dialog");
  dialog.className = "dialog panel";
  dialog.setAttribute("aria-label", "Project");
  dialog.innerHTML = `<div class="panel-inner"><p class="muted panel-loading">Loading…</p></div>`;
  document.body.append(dialog);
  openNow = dialog;

  let changed = false;
  const markChanged = () => { changed = true; };
  const close = () => dialog.close();
  dialog.addEventListener("close", () => {
    dialog.remove();
    if (openNow === dialog) openNow = null;
    if (changed) onClose();
  });
  // A click on the dimmed page beside the panel closes it.
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener("click", (event) => { if (event.target.closest("[data-close]")) close(); });
  // "Open full page" leaves for the project page: close first.
  dialog.addEventListener("click", (event) => { if (event.target.closest("[data-full]")) close(); });

  dialog.showModal();
  draw(dialog.querySelector(".panel-inner"), projectId, markChanged, { focus: true });
  return { close };
}

async function draw(inner, projectId, markChanged, { focus = false } = {}) {
  let project;
  let tasks;
  let meetingNames = [];
  try {
    [project, tasks, meetingNames] = await Promise.all([
      getProject(projectId), listProjectTasks(projectId), listMeetingNames().catch(() => []),
    ]);
  } catch (error) {
    inner.innerHTML = headHtml(null) + errorHtml("Could not load the project: " + error.message);
    inner.querySelector("[data-retry]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      draw(inner, projectId, markChanged);
    });
    return;
  }
  if (!inner.isConnected) return; // closed while loading
  if (!project) {
    inner.innerHTML = headHtml(null) + `<p class="empty">This project doesn't exist any more.</p>`;
    return;
  }

  const today = brusselsToday();
  const open = tasks.filter((t) => !t.done).sort((a, b) => compareByDueThenScore(a, b, today));
  const doneCount = tasks.length - open.length;
  const redraw = () => { markChanged(); draw(inner, projectId, markChanged); };
  // Keep the scroll position when the list redraws (re-sort after a change).
  const scroller = inner.querySelector(".panel-body");
  const scrollTop = scroller ? scroller.scrollTop : 0;

  inner.innerHTML = `
    ${headHtml(project)}
    <div class="panel-body">
      ${quickAddHtml({ today, placeholder: "Add a task to this project…" })}
      <h3 class="panel-subtitle">Open tasks <span class="count">${open.length}</span>${doneCount ? `<span class="muted"> · ${doneCount} done</span>` : ""}</h3>
      ${open.length
        ? `<ul class="task-list">${taskListInnerHtml(open, { today, noHead: true })}</ul>`
        : `<p class="empty">No open tasks. Add one above.</p>`}
    </div>`;
  const body = inner.querySelector(".panel-body");
  body.scrollTop = scrollTop;

  const listEl = inner.querySelector(".task-list");
  if (listEl) {
    wireTaskList(listEl, open, {
      onOpen: (task) => openTaskSheet(task, { onChange: redraw, meetingNames }),
      onChange: redraw,
      rowOptions: { today, noHead: true },
      meetingNames,
      onSaved: markChanged,
    });
  }
  const form = inner.querySelector(".quick-add");
  wireQuickAdd(form, { defaults: { project_id: project.id }, onAdded: () => {
    redraw();
  } });
  if (focus && window.matchMedia("(min-width: 720px)").matches) form.elements.title.focus();
}

function headHtml(p) {
  const close = `<button type="button" class="icon-btn" data-close aria-label="Close" title="Close (Esc)">${icon("close")}</button>`;
  if (!p) return `<header class="panel-head"><div></div>${close}</header>`;
  const tags = [];
  if (p.type === "sales" && p.sales_status) tags.push(`<span class="pill">${escapeHtml(labelOf(SALES_STATUSES, p.sales_status))}</span>`);
  if (p.status) tags.push(`<span class="pill status-${p.status}">${escapeHtml(projectStatusLabel(p))}</span>`);
  tags.push(`<span class="pill">${escapeHtml(labelOf(PROJECT_TYPES, p.type))}</span>`);
  const dates = hasDates(p.type) ? `<span class="muted">${escapeHtml(formatRange(p.date_start, p.date_end) || "No date yet")}</span>` : "";
  return `
    <header class="panel-head">
      <div class="panel-title">
        <h2>${escapeHtml(p.name)}</h2>
        <p class="project-meta">${tags.join("")}${dates}</p>
      </div>
      <div class="panel-actions">
        <a class="btn secondary small" href="#/project/${escapeHtml(p.id)}" data-full>${icon("external")} Full page</a>
        ${close}
      </div>
    </header>`;
}
