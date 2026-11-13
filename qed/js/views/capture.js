// capture.js: quick capture, a task in 3 seconds (UX review #13, Romain 2026-11-13).
//
// The "＋" in the phone's bottom bar, or the app icon's "Add task" shortcut
// (Android; #/capture). A sheet with only: title (keyboard open), project (the
// last one used, remembered on this device) and No date / Today / Tomorrow
// (No date by default: it lands in the Planner's No date column and in Plan my
// day, to sort out later). After Add the sheet stays open for the next one;
// "Done" closes it.

import { listProjects, createTask } from "../storage.js";
import { escapeHtml, icon } from "../utils/html.js";
import { brusselsToday, addDays } from "../utils/dates.js";
import { showToast } from "../utils/toast.js";

const PROJECT_KEY = "qedhq.captureProject";

function lastProject() {
  try { return localStorage.getItem(PROJECT_KEY) || ""; } catch { return ""; }
}
function rememberProject(id) {
  try { localStorage.setItem(PROJECT_KEY, id); } catch { /* fine */ }
}

let openNow = null;

// onAdded() = redraw the screen underneath (once the sheet closes).
export function openCapture({ onAdded = () => {} } = {}) {
  if (openNow) return;
  const dialog = document.createElement("dialog");
  dialog.className = "dialog capture";
  dialog.setAttribute("aria-label", "Add a task");
  dialog.innerHTML = `
    <form class="capture-form" novalidate>
      <header class="dialog-head">
        <h2>Add a task</h2>
        <button type="button" class="btn secondary small" data-close>Done</button>
      </header>
      <div class="capture-body">
        <input name="title" class="capture-title" placeholder="What needs doing?" maxlength="300" autocomplete="off" aria-label="Task">
        <select name="project_id" class="capture-project" aria-label="Project"><option value="">No project</option></select>
        <div class="capture-days" role="radiogroup" aria-label="Due date">
          <label><input type="radio" name="day" value="" checked><span>No date</span></label>
          <label><input type="radio" name="day" value="today"><span>Today</span></label>
          <label><input type="radio" name="day" value="tomorrow"><span>Tomorrow</span></label>
        </div>
        <button type="submit" class="btn capture-add">${icon("plus")} Add</button>
        <ul class="capture-added" aria-live="polite"></ul>
      </div>
    </form>`;
  document.body.append(dialog);
  openNow = dialog;

  const form = dialog.querySelector("form");
  const title = form.elements.title;
  const projectMenu = form.elements.project_id;
  const addedEl = dialog.querySelector(".capture-added");
  let added = 0;

  // Projects arrive a moment later; the last one used is picked again.
  listProjects().then((projects) => {
    const keep = lastProject();
    projectMenu.insertAdjacentHTML("beforeend", projects
      .filter((p) => p.status !== "archived")
      .sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }))
      .map((p) => `<option value="${escapeHtml(p.id)}"${p.id === keep ? " selected" : ""}>${escapeHtml(p.name)}</option>`)
      .join(""));
  }).catch(() => {});
  projectMenu.addEventListener("change", () => rememberProject(projectMenu.value));

  const close = () => dialog.close();
  dialog.addEventListener("close", () => {
    dialog.remove();
    openNow = null;
    if (added) onAdded();
  });
  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = title.value.trim();
    if (!text) {
      title.focus();
      return;
    }
    const day = form.elements.day.value;
    const today = brusselsToday();
    const due = day === "today" ? today : day === "tomorrow" ? addDays(today, 1) : null;
    const button = form.querySelector(".capture-add");
    button.disabled = true;
    try {
      await createTask({ title: text, project_id: projectMenu.value || null, due_date: due });
      added += 1;
      title.value = "";
      const project = projectMenu.selectedOptions[0]?.textContent || "";
      addedEl.insertAdjacentHTML("afterbegin", `<li>${icon("check")} ${escapeHtml(text)}<span class="muted"> · ${escapeHtml(projectMenu.value ? project : "No project")} · ${due ? (day === "today" ? "Today" : "Tomorrow") : "No date"}</span></li>`);
    } catch (error) {
      showToast("Could not add the task: " + error.message);
    }
    button.disabled = false;
    title.focus(); // ready for the next one
  });

  dialog.showModal();
  title.focus();
}
