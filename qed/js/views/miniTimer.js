// miniTimer.js: the Focus timer, small, on every screen (Romain, 2026-11-20).
//
// While a Focus timer runs (utils/focusTimer.js) and you're not on that
// task's Focus screen, a small timer floats in the corner (laptop: bottom
// right; phone: just above the bottom bar): time left, task name, Pause /
// Resume, Pop out, Stop (with Undo). Tap the time or the name = back to
// Focus mode. When time's up: Done (ticks the task, Undo) / +10 min / Stop.
//
// Pop out (Chrome / Edge on a laptop: Document Picture-in-Picture): the same
// small timer in its own always-on-top window, visible over Outlook, Teams…
// While it's open the corner timer is hidden. Closing it = back in the corner.

import { updateTask } from "../storage.js";
import * as Timer from "../utils/focusTimer.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon } from "../utils/html.js";

let cornerEl = null;
let pipWin = null;
let pipEl = null;

export function canPopOut() {
  return "documentPictureInPicture" in window && window.isSecureContext;
}

// Called once by main.js at start-up.
export function mountMiniTimer() {
  cornerEl = document.createElement("aside");
  cornerEl.className = "mini-timer";
  cornerEl.setAttribute("aria-label", "Focus timer");
  cornerEl.hidden = true;
  document.body.append(cornerEl);
  wire(cornerEl);
  Timer.subscribe((_, { tickOnly }) => (tickOnly ? updateTimes() : drawAll()));
  drawAll();
}

// Called by main.js after every screen change (the corner timer hides on the
// timer's own Focus screen and on the Unlock screen).
export function refreshMiniTimer() {
  Timer.refreshTitle();
  drawAll();
}

export async function popOut() {
  if (!canPopOut()) return;
  if (pipWin) { pipWin.focus(); return; }
  try {
    pipWin = await window.documentPictureInPicture.requestWindow({ width: 340, height: 150 });
  } catch (error) {
    showToast("Could not pop out the timer: " + error.message);
    pipWin = null;
    return;
  }
  const doc = pipWin.document;
  // Same look as the app: its stylesheets, theme and accent colour.
  for (const link of document.querySelectorAll('link[rel="stylesheet"]')) {
    const copy = doc.createElement("link");
    copy.rel = "stylesheet";
    copy.href = link.href; // absolute, so it loads from the app's address
    doc.head.append(copy);
  }
  for (const name of ["data-hq", "data-theme"]) {
    const value = document.documentElement.getAttribute(name);
    if (value) doc.documentElement.setAttribute(name, value);
  }
  doc.title = "Focus timer";
  doc.body.className = "pip-body";
  pipEl = doc.createElement("div");
  pipEl.className = "mini-timer is-pip";
  doc.body.append(pipEl);
  wire(pipEl);
  pipWin.addEventListener("pagehide", () => {
    pipWin = null;
    pipEl = null;
    drawAll();
  });
  drawAll();
}

// --- drawing -------------------------------------------------------------

function drawAll() {
  const t = Timer.getTimer();
  if (pipWin && t.phase === "idle") pipWin.close(); // stopped: the window goes too
  if (pipEl) draw(pipEl, t);
  if (cornerEl) {
    const onItsFocus = window.location.hash === `#/focus/${t.taskId}`;
    const show = t.phase !== "idle" && !onItsFocus && !pipWin && !document.body.classList.contains("is-locked");
    cornerEl.hidden = !show;
    document.body.classList.toggle("has-mini-timer", show);
    if (show) draw(cornerEl, t);
  }
}

function draw(el, t) {
  if (t.phase === "idle") { el.innerHTML = ""; return; }
  const over = t.phase === "over";
  const paused = t.phase === "paused";
  el.classList.toggle("is-over", over);
  el.classList.toggle("is-paused", paused);
  const btn = (act, iconName, label, extra = "") =>
    `<button type="button" class="icon-btn mt-btn${extra}" data-mt="${act}" aria-label="${label}" title="${label}">${icon(iconName)}</button>`;
  el.innerHTML = `
    <button type="button" class="mt-open" data-mt="open" title="Back to Focus mode">
      <span class="mt-time">${over ? "Time's up" : Timer.format(Timer.remainingMs())}</span>
      <span class="mt-task">${paused ? "Paused · " : ""}${escapeHtml(t.taskTitle || "")}</span>
    </button>
    <div class="mt-actions">
      ${over
        ? `<button type="button" class="btn small" data-mt="done">${icon("check")} Done</button>
           <button type="button" class="btn secondary small" data-mt="plus">+10</button>
           ${btn("stop", "stop", "Stop the timer")}`
        : `${paused ? btn("resume", "play", "Resume") : btn("pause", "pause", "Pause")}
           ${canPopOut() && !el.classList.contains("is-pip") ? btn("popout", "popout", "Pop out: a small window that stays on top of your other apps") : ""}
           ${btn("stop", "stop", "Stop the timer")}`}
    </div>
    <div class="mt-bar" aria-hidden="true"><span style="width:${over ? 100 : 100 * Timer.progress()}%"></span></div>`;
}

// Only the numbers moved (4 times a second while running).
function updateTimes() {
  for (const el of [cornerEl, pipEl]) {
    if (!el || el.hidden) continue;
    const time = el.querySelector(".mt-time");
    const bar = el.querySelector(".mt-bar span");
    if (time) time.textContent = Timer.format(Timer.remainingMs());
    if (bar) bar.style.width = `${100 * Timer.progress()}%`;
  }
}

// --- buttons -------------------------------------------------------------

function wire(el) {
  el.addEventListener("click", (event) => {
    const button = event.target.closest("[data-mt]");
    if (!button) return;
    const act = button.dataset.mt;
    if (act === "open") {
      window.focus();
      window.location.hash = `#/focus/${Timer.getTimer().taskId}`;
    }
    if (act === "pause") Timer.pauseTimer();
    if (act === "resume") Timer.resumeTimer();
    if (act === "plus") Timer.addMinutes(10);
    if (act === "popout") popOut();
    if (act === "stop") stopWithUndo();
    if (act === "done") markDone();
  });
}

function stopWithUndo() {
  const before = { ...Timer.getTimer() };
  if (before.phase === "running") before.leftMs = Timer.remainingMs();
  Timer.stopTimer();
  showToast("Timer stopped", {
    actionLabel: "Undo",
    onAction: () => Timer.restoreTimer(before),
  });
}

async function markDone() {
  const { taskId, taskTitle } = Timer.getTimer();
  try {
    await updateTask(taskId, { done: true });
  } catch (error) {
    showToast("Could not save: " + error.message);
    return;
  }
  Timer.stopTimer();
  window.dispatchEvent(new Event("qedhq:refresh"));
  showToast(`Done: "${taskTitle}"`, {
    actionLabel: "Undo",
    onAction: async () => {
      await updateTask(taskId, { done: false });
      window.dispatchEvent(new Event("qedhq:refresh"));
    },
  });
}
