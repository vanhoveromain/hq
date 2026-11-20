// focusTimer.js: the one Focus timer, shared by the whole app (Romain, 2026-11-20).
//
// Before: the timer lived inside the Focus screen and stopped when you left it.
// Now it lives here, so you can leave Focus mode (look at the project, add a
// task…) while it keeps counting. Focus mode (views/focus.js) and the floating
// mini timer (views/miniTimer.js) both just draw what this module holds.
//
//   - one timer at a time, tied to one task (id + title, for the label);
//   - counts against an end time, so it stays right in a background tab;
//   - kept in localStorage (this device), so a page refresh doesn't lose it;
//   - at the end: a soft chime, phase "over" (Done / +10 min / Stop);
//   - the screen stays on while it runs (Screen Wake Lock, where offered);
//   - the tab title shows the time left, on every screen.
//
// phase: "idle" (no timer) | "running" | "paused" | "over"

const STORE_KEY = "qedhq.focusTimer";
const TITLE_MARK = "⏱ ";

let state = { phase: "idle" };
let tick = null;
let wakeLock = null;
let baseTitle = "QED HQ";
const listeners = new Set();

// --- reading -----------------------------------------------------------

export function getTimer() {
  return state;
}

export function isActive() {
  return state.phase !== "idle";
}

export function remainingMs() {
  if (state.phase === "paused") return state.leftMs;
  if (state.phase === "running") return Math.max(0, state.endAt - Date.now());
  return 0;
}

// Share of the time used, 0..1 (for the progress bar).
export function progress() {
  if (!state.totalMs) return 0;
  return Math.min(1, 1 - remainingMs() / state.totalMs);
}

// 1499000 -> "24:59"; an hour or more -> "1:05:00"
export function format(ms) {
  const total = Math.ceil(ms / 1000);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h ? `${h}:${two(m)}:${two(s)}` : `${two(m)}:${two(s)}`;
}

// listener(state, { tickOnly }) — tickOnly = only the time moved (redraw the
// numbers, not the buttons). Returns a function that unsubscribes.
export function subscribe(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// --- changing ----------------------------------------------------------

// task = { id, title, project_id }
export function startTimer(task, minutes) {
  unlockSound(); // browsers only allow sound that a tap started
  const total = minutes * 60000;
  state = {
    phase: "running", minutes, totalMs: total, endAt: Date.now() + total,
    taskId: task.id, taskTitle: task.title, projectId: task.project_id || null,
  };
  changed();
}

export function pauseTimer() {
  if (state.phase !== "running") return;
  state = { ...state, phase: "paused", leftMs: remainingMs() };
  changed();
}

export function resumeTimer() {
  if (state.phase !== "paused") return;
  unlockSound();
  state = { ...state, phase: "running", endAt: Date.now() + state.leftMs };
  delete state.leftMs;
  changed();
}

// +n min: while running, paused, or after the end (starts again for n).
export function addMinutes(n) {
  const extra = n * 60000;
  unlockSound();
  if (state.phase === "over") {
    state = { ...state, phase: "running", totalMs: extra, endAt: Date.now() + extra };
  } else if (state.phase === "paused") {
    state = { ...state, leftMs: state.leftMs + extra, totalMs: state.totalMs + extra };
  } else if (state.phase === "running") {
    state = { ...state, endAt: state.endAt + extra, totalMs: state.totalMs + extra };
  }
  changed();
}

export function stopTimer() {
  state = { phase: "idle", minutes: state.minutes };
  changed();
}

// Undo of a Stop: put the timer back as it was (a running one carries on
// from the time it had left when stopped).
export function restoreTimer(snapshot) {
  if (!snapshot || snapshot.phase === "idle") return;
  state = { ...snapshot };
  if (state.phase === "running") {
    state.endAt = Date.now() + (state.leftMs ?? 0);
    delete state.leftMs;
  }
  changed();
}

// main.js just set a new screen title: show the time in it again.
export function refreshTitle() {
  updateTitle();
}

// The task was renamed somewhere: keep the label right.
export function renameTask(taskId, title) {
  if (state.taskId !== taskId || state.taskTitle === title) return;
  state = { ...state, taskTitle: title };
  changed();
}

// --- inside ------------------------------------------------------------

function changed({ tickOnly = false } = {}) {
  if (!tickOnly) {
    save();
    runTicks();
    keepScreenOn(state.phase === "running");
  }
  updateTitle();
  for (const listener of listeners) {
    try { listener(state, { tickOnly }); } catch (error) { console.warn("Timer view:", error); }
  }
}

function runTicks() {
  clearInterval(tick);
  tick = null;
  if (state.phase !== "running") return;
  tick = setInterval(() => {
    if (remainingMs() <= 0) {
      state = { ...state, phase: "over" };
      chime();
      changed();
      return;
    }
    changed({ tickOnly: true });
  }, 250);
}

function updateTitle() {
  // The screen's own title (set by main.js on every navigation) is kept aside
  // and put back once the timer is gone.
  if (!document.title.startsWith(TITLE_MARK)) baseTitle = document.title;
  if (state.phase === "running") document.title = `${TITLE_MARK}${format(remainingMs())} · ${state.taskTitle}`;
  else if (state.phase === "paused") document.title = `${TITLE_MARK}Paused · ${state.taskTitle}`;
  else if (state.phase === "over") document.title = `${TITLE_MARK}Time's up · ${state.taskTitle}`;
  else if (document.title.startsWith(TITLE_MARK)) document.title = baseTitle;
}

function save() {
  try {
    if (state.phase === "idle") localStorage.removeItem(STORE_KEY);
    else localStorage.setItem(STORE_KEY, JSON.stringify(state));
  } catch { /* private window: the timer just won't survive a refresh */ }
}

function restore() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || "null");
    if (!saved || !saved.taskId || !["running", "paused", "over"].includes(saved.phase)) return;
    state = saved;
    // Ended while the page was closed: no chime (no tap yet), just "Time's up".
    if (state.phase === "running" && state.endAt <= Date.now()) state.phase = "over";
  } catch { /* nothing usable */ }
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

// Keep the screen on while the timer runs. The lock drops when the tab is
// hidden, so it's asked again when you come back.
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

// --- start-up ----------------------------------------------------------

restore();
if (state.phase !== "idle") {
  runTicks();
  keepScreenOn(state.phase === "running");
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && state.phase === "running") keepScreenOn(true);
});
// After a refresh the browser blocks sound until you tap something: the first
// tap anywhere makes the end chime possible again.
document.addEventListener("pointerdown", () => { if (state.phase === "running") unlockSound(); }, { capture: true });
// Another tab of QED HQ changed the timer: follow it.
window.addEventListener("storage", (event) => {
  if (event.key !== STORE_KEY) return;
  state = { phase: "idle" };
  restore();
  changed();
});
// Initial title once main.js has set the screen's own.
queueMicrotask(updateTitle);
