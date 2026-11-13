// focus.js: Focus mode (#/focus/<task id>), from To do today.
//
// One task, full screen (no tabs): its project, title and fields, a
// countdown timer you set yourself, and its notes. Decided 2026-11-08:
//   - presets 25 / 50 / 90 minutes, or your own number of minutes;
//   - Pause / Resume, +10 min, Stop;
//   - at the end: a soft sound, then Done (ticks the task) / +10 min / Stop;
//   - the screen stays on while the timer runs (where the device allows it);
//   - leaving Focus mode stops the timer.
// The timer counts against the clock (an end time), not by adding up seconds,
// so it stays right even when the browser slows down a background tab.

import { getTask, getProject, updateTask } from "../storage.js";
import { PRIORITIES, SCOPES, STATES, labelOf } from "../rules.js";
import { openTaskSheet } from "./taskSheet.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon, errorHtml } from "../utils/html.js";

const PRESETS = [25, 50, 90];

// The one running timer (only one Focus screen at a time).
// phase: "idle" | "running" | "paused" | "over"
let timer = null;
let tick = null;
let wakeLock = null;
let rootEl = null;
let focusTask = null;

// Called by main.js when you leave this screen: the timer stops.
export function leave() {
  stopTimer();
  rootEl = null;
}

export async function render(el, { params }) {
  stopTimer();
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
      <p class="focus-project">${project ? escapeHtml(project.name) : "No project"}</p>
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
  timer = { phase: "idle", minutes: 25 };
  drawTimer();
  wireNotes(el.querySelector("#notes"), el.querySelector("#notes-state"), task);

  el.querySelector("#done").addEventListener("click", markDone);
  el.querySelector("#open-sheet").addEventListener("click", () => {
    // The sheet can change anything; the timer keeps running.
    openTaskSheet(focusTask, {
      onChange: async () => {
        const fresh = await getTask(focusTask.id).catch(() => null);
        if (!fresh || fresh.done) {
          window.location.hash = "#/priorities";
          return;
        }
        focusTask = fresh;
        drawHeader();
        const notes = rootEl && rootEl.querySelector("#notes");
        if (notes && document.activeElement !== notes) notes.value = fresh.notes || "";
      },
    });
  });
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
// The timer
// ---------------------------------------------------------------------

function drawTimer() {
  const box = rootEl && rootEl.querySelector("#timer");
  if (!box) return;
  box.className = "timer" + (timer.phase === "paused" ? " is-paused" : "") + (timer.phase === "over" ? " is-over" : "");

  if (timer.phase === "idle") {
    box.innerHTML = `
      <p class="timer-label">How long do you want to focus?</p>
      <div class="timer-presets">
        ${PRESETS.map((m) => `<button type="button" class="chip${m === timer.minutes ? " active" : ""}" data-preset="${m}" aria-pressed="${m === timer.minutes}">${m} min</button>`).join("")}
        <label class="timer-custom"><span class="sr-only">Your own number of minutes</span>
          <input type="number" id="custom-minutes" min="1" max="240" inputmode="numeric" placeholder="min" value="${PRESETS.includes(timer.minutes) ? "" : timer.minutes}"> min</label>
      </div>
      <button type="button" class="btn" id="start">${icon("play")} Start ${timer.minutes} min</button>`;
    box.querySelectorAll("[data-preset]").forEach((b) => b.addEventListener("click", () => {
      timer.minutes = Number(b.dataset.preset);
      drawTimer();
    }));
    const custom = box.querySelector("#custom-minutes");
    custom.addEventListener("input", () => {
      const m = Math.round(Number(custom.value));
      if (m >= 1 && m <= 240) {
        timer.minutes = m;
        box.querySelectorAll("[data-preset]").forEach((b) => {
          const on = Number(b.dataset.preset) === m;
          b.classList.toggle("active", on);
          b.setAttribute("aria-pressed", on);
        });
        box.querySelector("#start").innerHTML = `${icon("play")} Start ${m} min`;
      }
    });
    box.querySelector("#start").addEventListener("click", () => startTimer(timer.minutes));
    return;
  }

  const over = timer.phase === "over";
  box.innerHTML = `
    <p class="timer-label">${over ? "Time's up. Done, or a little longer?" : timer.phase === "paused" ? "Paused" : "Focus"}</p>
    <div class="timer-time" id="timer-time">${format(over ? 0 : remainingMs())}</div>
    <div class="timer-bar" aria-hidden="true"><span id="timer-bar"></span></div>
    <div class="timer-controls">
      ${over
        ? `<button type="button" class="btn" data-act="done">${icon("check")} Done</button>
           <button type="button" class="btn secondary" data-act="plus">+10 min</button>
           <button type="button" class="btn secondary" data-act="stop">Stop</button>`
        : `<button type="button" class="btn secondary" data-act="${timer.phase === "paused" ? "resume" : "pause"}">${timer.phase === "paused" ? `${icon("play")} Resume` : `${icon("pause")} Pause`}</button>
           <button type="button" class="btn secondary" data-act="plus">+10 min</button>
           <button type="button" class="btn secondary" data-act="stop">${icon("stop")} Stop</button>`}
    </div>`;
  updateTime();
  box.querySelectorAll("[data-act]").forEach((b) => b.addEventListener("click", () => {
    const act = b.dataset.act;
    if (act === "pause") pauseTimer();
    if (act === "resume") resumeTimer();
    if (act === "plus") addMinutes(10);
    if (act === "stop") { stopTimer(); timer = { phase: "idle", minutes: timer.minutes }; drawTimer(); }
    if (act === "done") markDone();
  }));
}

function startTimer(minutes) {
  unlockSound(); // browsers only allow sound that a tap started
  const total = minutes * 60000;
  timer = { phase: "running", minutes, totalMs: total, endAt: Date.now() + total };
  runTicks();
  keepScreenOn(true);
  drawTimer();
}

function pauseTimer() {
  timer.leftMs = remainingMs();
  timer.phase = "paused";
  clearInterval(tick);
  keepScreenOn(false);
  drawTimer();
}

function resumeTimer() {
  timer.endAt = Date.now() + timer.leftMs;
  timer.phase = "running";
  runTicks();
  keepScreenOn(true);
  drawTimer();
}

// +10 min: while running, paused, or after the end (starts again for 10).
function addMinutes(n) {
  const extra = n * 60000;
  if (timer.phase === "over") {
    timer = { phase: "running", minutes: timer.minutes, totalMs: extra, endAt: Date.now() + extra };
    runTicks();
    keepScreenOn(true);
  } else if (timer.phase === "paused") {
    timer.leftMs += extra;
    timer.totalMs += extra;
  } else {
    timer.endAt += extra;
    timer.totalMs += extra;
  }
  drawTimer();
}

function stopTimer() {
  clearInterval(tick);
  tick = null;
  keepScreenOn(false);
  document.title = "QED HQ";
}

function runTicks() {
  clearInterval(tick);
  tick = setInterval(() => {
    if (remainingMs() <= 0) {
      clearInterval(tick);
      timer.phase = "over";
      keepScreenOn(false);
      chime();
      document.title = `Time's up · ${focusTask.title}`;
      drawTimer();
      return;
    }
    updateTime();
  }, 250);
}

function remainingMs() {
  if (!timer || timer.phase === "idle") return 0;
  if (timer.phase === "paused") return timer.leftMs;
  return Math.max(0, timer.endAt - Date.now());
}

function updateTime() {
  if (!rootEl) return;
  const left = timer.phase === "over" ? 0 : remainingMs();
  const timeEl = rootEl.querySelector("#timer-time");
  const bar = rootEl.querySelector("#timer-bar");
  if (timeEl) timeEl.textContent = format(left);
  if (bar && timer.totalMs) bar.style.width = `${Math.min(100, 100 * (1 - left / timer.totalMs))}%`;
  if (timer.phase === "running") document.title = `${format(left)} · ${focusTask.title}`;
}

// 1499000 -> "24:59"; an hour or more -> "1:05:00"
function format(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
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
  stopTimer();
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

// A soft two-note chime, made by the browser (no sound file to load).
let audio = null;
function unlockSound() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch {
    audio = null;
  }
}
function chime() {
  if (!audio) return;
  const now = audio.currentTime;
  [[660, 0], [880, 0.35], [660, 0.9], [880, 1.25]].forEach(([freq, at]) => {
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = "sine";
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0, now + at);
    gain.gain.linearRampToValueAtTime(0.18, now + at + 0.03);
    gain.gain.exponentialRampToValueAtTime(0.001, now + at + 0.6);
    osc.connect(gain).connect(audio.destination);
    osc.start(now + at);
    osc.stop(now + at + 0.65);
  });
}

// Keep the screen on while the timer runs (Screen Wake Lock, where the
// browser offers it; elsewhere nothing happens). The lock drops when the tab
// is hidden, so it's asked again when you come back.
async function keepScreenOn(on) {
  if (!on) {
    if (wakeLock) wakeLock.release().catch(() => {});
    wakeLock = null;
    return;
  }
  try {
    if ("wakeLock" in navigator && !wakeLock) {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLock.addEventListener("release", () => { wakeLock = null; });
    }
  } catch {
    wakeLock = null;
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && timer && timer.phase === "running") keepScreenOn(true);
});
