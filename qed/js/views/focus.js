// focus.js: Focus mode (#/focus/<task id>), from To do today.
//
// One task: its project, title and fields, a countdown timer you set
// yourself, and its notes. Decided 2026-11-08:
//   - presets 25 / 50 / 90 minutes, or your own number of minutes;
//   - Pause / Resume, +10 min, Stop;
//   - at the end: a soft sound, then Done (ticks the task) / +10 min / Stop;
//   - the screen stays on while the timer runs (where the device allows it).
// Since 2026-11-20 (Romain): the timer lives in utils/focusTimer.js, so it
// keeps running when you leave this screen (tabs stay on show); a small
// timer floats in the corner of every other screen (views/miniTimer.js) and
// can pop out into an always-on-top window (Chrome / Edge on a laptop). The
// project name opens the project side panel (notes, related tasks).

import { getTask, getProject, updateTask } from "../storage.js";
import { PRIORITIES, SCOPES, STATES, labelOf } from "../rules.js";
import { openTaskSheet } from "./taskSheet.js";
import { openProjectPanel } from "./projectPanel.js";
import { canPopOut, popOut } from "./miniTimer.js";
import * as Timer from "../utils/focusTimer.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon, errorHtml } from "../utils/html.js";

const PRESETS = [25, 50, 90];

let rootEl = null;
let focusTask = null;
let pickedMinutes = 25;
let unsubscribe = null;

// Called by main.js when you leave this screen: the timer keeps running.
export function leave() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  rootEl = null;
}

export async function render(el, { params }) {
  leave();
  rootEl = el;
  el.innerHTML = `<p class="muted">Loading…</p>`;

  let task;
  try {
    task = await getTask(params[0]);
  } catch (error) {
    el.innerHTML = errorHtml("Could not load the task: " + error.message);
    return;
  }
  if (!task) {
    el.innerHTML = `<p class="empty">This task doesn't exist any more. <a href="#/priorities">Back to Priorities</a></p>`;
    return;
  }
  focusTask = task;
  const project = task.project_id ? await getProject(task.project_id).catch(() => null) : null;

  el.innerHTML = `
    <div class="focus">
      <div class="focus-top">
        <a class="back" href="#/priorities">${icon("back")} Priorities</a>
        <button type="button" class="btn secondary small" id="open-sheet">${icon("more")} Details</button>
      </div>
      <p class="focus-project">${project
        ? `<button type="button" class="link-btn" id="open-project" title="Open the project beside this screen">${escapeHtml(project.name)}</button>`
        : "No project"}</p>
      <h1 class="focus-title" id="focus-title"></h1>
      <div class="focus-tags" id="focus-tags"></div>

      <section class="timer" id="timer" aria-live="polite"></section>

      <div class="focus-notes-head">
        <h2 class="section-title">Notes</h2>
        <span class="save-state muted" id="notes-state" aria-live="polite"></span>
      </div>
      <textarea class="notes" id="notes" rows="8" maxlength="20000" placeholder="What you need for this task, what you decided…">${escapeHtml(task.notes || "")}</textarea>

      <button type="button" class="btn focus-done" id="done">${icon("check")} Mark as done</button>
    </div>`;

  drawHeader();
  if (mine()) pickedMinutes = Timer.getTimer().minutes || pickedMinutes;
  drawTimer();
  unsubscribe = Timer.subscribe((_, { tickOnly }) => (tickOnly ? updateTime() : drawTimer()));
  if (project) {
    el.querySelector("#open-project").addEventListener("click", () => openProjectPanel(project.id, {
      onClose: refreshTask,
    }));
  }
  wireNotes(el.querySelector("#notes"), el.querySelector("#notes-state"), task);

  el.querySelector("#done").addEventListener("click", markDone);
  el.querySelector("#open-sheet").addEventListener("click", () => {
    // The sheet can change anything; the timer keeps running.
    openTaskSheet(focusTask, {
      onChange: refreshTask,
    });
  });
}

// The task may have changed elsewhere (task sheet, project panel).
async function refreshTask() {
  if (!focusTask) return;
  const fresh = await getTask(focusTask.id).catch(() => null);
  if (!rootEl) return;
  if (!fresh || fresh.done) {
    if (mine()) Timer.stopTimer();
    window.location.hash = "#/priorities";
    return;
  }
  focusTask = fresh;
  Timer.renameTask(fresh.id, fresh.title);
  drawHeader();
  const notes = rootEl.querySelector("#notes");
  if (notes && document.activeElement !== notes) notes.value = fresh.notes || "";
}

function drawHeader() {
  if (!rootEl) return;
  const t = focusTask;
  rootEl.querySelector("#focus-title").textContent = t.title;
  const tags = [];
  if (t.priority) tags.push(`<span class="pill prio-${t.priority}">${escapeHtml(labelOf(PRIORITIES, t.priority))}</span>`);
  if (t.scope) tags.push(`<span class="pill">${escapeHtml(labelOf(SCOPES, t.scope))}</span>`);
  if (t.period) tags.push(`<span class="pill">${t.period.toUpperCase()}</span>`);
  if (t.state !== "active") tags.push(`<span class="pill">${escapeHtml(labelOf(STATES, t.state))}</span>`);
  rootEl.querySelector("#focus-tags").innerHTML = tags.join("");
}


// ---------------------------------------------------------------------
// The timer (it lives in utils/focusTimer.js; this screen only draws it)
// ---------------------------------------------------------------------

const mine = () => Timer.getTimer().taskId === focusTask?.id;

function drawTimer() {
  const box = rootEl && rootEl.querySelector("#timer");
  if (!box) return;
  const t = mine() ? Timer.getTimer() : { phase: "idle" };
  box.className = "timer" + (t.phase === "paused" ? " is-paused" : "") + (t.phase === "over" ? " is-over" : "");

  if (t.phase === "idle") {
    const other = Timer.isActive() && !mine() ? Timer.getTimer() : null;
    box.innerHTML = `
      <p class="timer-label">How long do you want to focus?</p>
      <div class="timer-presets">
        ${PRESETS.map((m) => `<button type="button" class="chip${m === pickedMinutes ? " active" : ""}" data-preset="${m}" aria-pressed="${m === pickedMinutes}">${m} min</button>`).join("")}
        <label class="timer-custom"><span class="sr-only">Your own number of minutes</span>
          <input type="number" id="custom-minutes" min="1" max="240" inputmode="numeric" placeholder="min" value="${PRESETS.includes(pickedMinutes) ? "" : pickedMinutes}"> min</label>
      </div>
      <button type="button" class="btn" id="start">${icon("play")} Start ${pickedMinutes} min</button>
      ${other ? `<p class="timer-note muted">A timer is running for “${escapeHtml(other.taskTitle)}”. Starting here replaces it.</p>` : ""}`;
    box.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
      pickedMinutes = Number(b.dataset.preset);
      drawTimer();
    }));
    const custom = box.querySelector("#custom-minutes");
    custom.addEventListener("input", () => {
      const m = Math.round(Number(custom.value));
      if (m >= 1 && m <= 240) {
        pickedMinutes = m;
        box.querySelectorAll("[data-preset]").forEach((b) => {
          const on = Number(b.dataset.preset) === m;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", on);
        });
        box.querySelector("#start").innerHTML = `${icon("play")} Start ${m} min`;
      }
    });
    box.querySelector("#start").addEventListener("click", () => Timer.startTimer(focusTask, pickedMinutes));
    return;
  }

  const over = t.phase === "over";
  box.innerHTML = `
    <p class="timer-label">${over ? "Time's up. Done, or a little longer?" : t.phase === "paused" ? "Paused" : "Focus"}</p>
    <div class="timer-time" id="timer-time">${Timer.format(Timer.remainingMs())}</div>
    <div class="timer-bar" aria-hidden="true"><span id="timer-bar"></span></div>
    <div class="timer-controls">
      ${over
        ? `<button type="button" class="btn" data-act="done">${icon("check")} Done</button>
           <button type="button" class="btn secondary" data-act="plus">+10 min</button>
           <button type="button" class="btn secondary" data-act="stop">Stop</button>`
        : `<button type="button" class="btn secondary" data-act="${t.phase === "paused" ? "resume" : "pause"}">${t.phase === "paused" ? `${icon("play")} Resume` : `${icon("pause")} Pause`}</button>
           <button type="button" class="btn secondary" data-act="plus">+10 min</button>
           <button type="button" class="btn secondary" data-act="stop">${icon("stop")} Stop</button>`}
      ${canPopOut() ? `<button type="button" class="btn secondary" data-act="popout" title="A small window that stays on top of your other apps">${icon("popout")} Pop out</button>` : ""}
    </div>
    <p class="timer-note muted">You can leave this screen: the timer keeps running in the corner.</p>`;
  updateTime();
  box.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    const act = b.dataset.act;
    if (act === "pause") Timer.pauseTimer();
    if (act === "resume") Timer.resumeTimer();
    if (act === "plus") Timer.addMinutes(10);
    if (act === "stop") Timer.stopTimer();
    if (act === "done") markDone();
    if (act === "popout") popOut();
  }));
}

function updateTime() {
  if (!rootEl || !mine()) return;
  const timeEl = rootEl.querySelector("#timer-time");
  const bar = rootEl.querySelector("#timer-bar");
  if (timeEl) timeEl.textContent = Timer.format(Timer.remainingMs());
  if (bar) bar.style.width = `${100 * Timer.progress()}%`;
}


// ---------------------------------------------------------------------
// Done, notes, sound, screen
// ---------------------------------------------------------------------

async function markDone() {
  const task = focusTask;
  try {
    await updateTask(task.id, { done: true });
  } catch (error) {
    showToast("Could not save: " + error.message);
    return;
  }
  if (mine()) Timer.stopTimer();
  showToast(`Done: "${task.title}"`, {
    actionLabel: "Undo",
    onAction: async () => {
      await updateTask(task.id, { done: false });
      window.location.hash = `#/focus/${task.id}`;
    },
  });
  window.location.hash = "#/priorities";
}

// Same as the project page: saved 1 s after you stop typing, and on leaving.
function wireNotes(textarea, stateEl, task) {
  let timerId = null;
  let lastSaved = task.notes || "";
  async function save() {
    clearTimeout(timerId);
    const value = textarea.value;
    if (value === lastSaved) return;
    stateEl.textContent = "Saving…";
    try {
      await updateTask(task.id, { notes: value.trim() ? value : null });
      lastSaved = value;
      focusTask.notes = value;
      stateEl.textContent = "Saved";
    } catch (error) {
      stateEl.textContent = "Not saved: " + error.message;
    }
  }
  textarea.addEventListener("input", () => {
    stateEl.textContent = "";
    clearTimeout(timerId);
    timerId = setTimeout(save, 1000);
  });
  textarea.addEventListener("blur", save);
}
