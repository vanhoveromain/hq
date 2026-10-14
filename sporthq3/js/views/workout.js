// Workout mode (opened from the planner): #/workout/<plannedSessionId>
//
// A timer, one tick box per set, weights you can change on the spot and an
// optional rest timer. Everything is saved on the phone as you go (see
// utils/workout.js). "Finish" opens the log form, pre-filled; saving it
// marks the session done and freezes what you really did.

import { getPlannedSession } from "../storage.js?v=202610142257";
import { getSport } from "../rules.js?v=202610142257";
import { escapeHtml, formatDuration } from "../utils/format.js?v=202610142257";
import { startOfWeek } from "../utils/dates.js?v=202610142257";
import { sessionName, sessionDetails } from "../utils/plan.js?v=202610142257";
import { openSheet } from "../utils/sheet.js?v=202610142257";
import {
  loadWorkout, saveWorkout, clearWorkout, newWorkout, readRestSeconds, saveRestSeconds,
  REST_CHOICES, parseRest, ticksDone, ticksTotal,
} from "../utils/workout.js?v=202610142257";

export async function render(container, { params = [] } = {}) {
  const plannedId = params[0];
  container.innerHTML = `<p class="muted">Loading…</p>`;

  let session = null;
  try {
    session = plannedId ? await getPlannedSession(plannedId) : null;
  } catch (error) {
    container.innerHTML = `<p class="status error"></p>`;
    container.querySelector(".status").textContent = "Could not load the session: " + error.message;
    return;
  }
  if (!session) {
    container.innerHTML = `<section class="card placeholder"><p>This session doesn't exist (any more).</p>
      <a class="button" href="#/planner">Back to the plan</a></section>`;
    return;
  }
  const backToPlan = `#/planner/${startOfWeek(session.session_date)}`;
  if (session.status !== "planned") {
    container.innerHTML = `<section class="card placeholder"><p>This session is already ${session.status === "done" ? "done ✅" : "cancelled"}.</p>
      <a class="button" href="${backToPlan}">Back to the plan</a></section>`;
    return;
  }

  // Resume, replace another workout, or start fresh.
  let workout = loadWorkout();
  if (workout && workout.plannedId !== session.id) {
    if (!window.confirm(`"${workout.name}" is still in progress. Stop it (nothing is saved) and start this one?`)) {
      window.location.hash = `#/workout/${workout.plannedId}`;
      return;
    }
    workout = null;
  }
  if (!workout) {
    workout = newWorkout(session.id, sessionName(session), sessionDetails(session));
  }
  workout.finishedAt = null; // back from the log form = still training
  saveWorkout(workout);

  drawWorkout(container, session, workout, backToPlan);
}


function drawWorkout(container, session, workout, backToPlan) {
  const details = sessionDetails(session) || {};
  const sport = getSport(session.sport);
  let restSeconds = readRestSeconds();
  let restEndsAt = null; // when the current rest countdown ends (ms), or null

  container.innerHTML = `
    <a href="${backToPlan}" class="back-link">‹ Plan (the workout keeps running)</a>
    <section class="card workout-head">
      <p class="muted small">${sport ? sport.icon + " " + escapeHtml(sport.label) : ""}</p>
      <h2>${escapeHtml(workout.name)}</h2>
      <p class="workout-timer" id="timer" aria-live="off">0:00</p>
      <p class="muted small" id="progress"></p>
      ${details.description ? `<p class="pre-line">${escapeHtml(details.description)}</p>` : ""}
      ${targetsHtml(details)}
    </section>

    <section class="card rest-settings">
      <h3>Rest timer</h3>
      <div class="chip-row" id="rest-choices"></div>
    </section>

    <div id="rest-banner" class="rest-banner" hidden>
      <span>Rest <strong id="rest-left">0:00</strong></span>
      <button type="button" class="button small-button" id="rest-skip">Skip</button>
    </div>

    ${workout.rounds ? `<p class="workout-rounds"><strong>${workout.rounds} rounds</strong> · tick each exercise once per round</p>` : ""}
    <div id="exercises"></div>

    <div class="workout-actions">
      <button type="button" class="button primary" id="finish">🏁 Finish</button>
      <button type="button" class="button danger" id="abandon">Stop without saving</button>
    </div>
  `;

  const exercisesEl = container.querySelector("#exercises");
  const timerEl = container.querySelector("#timer");
  const progressEl = container.querySelector("#progress");
  const restBanner = container.querySelector("#rest-banner");
  const restLeftEl = container.querySelector("#rest-left");

  function drawExercises() {
    exercisesEl.innerHTML = workout.exercises.map((e, i) => {
      const done = e.ticks.filter(Boolean).length;
      const amount = e.reps ? (workout.rounds ? e.reps : `${e.sets ? e.sets + " × " : ""}${e.reps}`) : (e.sets ? `${e.sets} sets` : "");
      return `
        <section class="card exercise ${done === e.ticks.length ? "is-complete" : ""}">
          <div class="exercise-head">
            <div>
              <h3>${escapeHtml(e.name)}</h3>
              <p class="muted small">${escapeHtml([amount, e.note].filter(Boolean).join(" · "))}</p>
            </div>
            <button type="button" class="button small-button weight-button" data-weight="${i}">
              ${e.weight_kg != null ? `${Number(e.weight_kg)} kg` : "+ kg"} ✎</button>
          </div>
          <div class="tick-row">${e.ticks.map((ticked, t) => `
            <button type="button" class="tick ${ticked ? "is-ticked" : ""}" data-tick="${i}:${t}"
              aria-pressed="${ticked}" aria-label="${workout.rounds ? "Round" : "Set"} ${t + 1}">
              ${ticked ? "✓" : t + 1}</button>`).join("")}</div>
        </section>`;
    }).join("");
    const total = ticksTotal(workout);
    progressEl.textContent = total ? `${ticksDone(workout)} / ${total} ${workout.rounds ? "ticks" : "sets"} done` : "";
  }

  // Runs every second: the main timer and the rest countdown.
  // Times come from the clock (Date.now), so they stay right even if the
  // phone slept for a while.
  function tick() {
    if (!document.body.contains(timerEl)) {
      // We left the screen: stop the clock and the screen-awake lock.
      clearInterval(interval);
      releaseWakeLock();
      return;
    }
    timerEl.textContent = formatDuration(Math.floor((Date.now() - workout.startedAt) / 1000)) || "0:00";
    if (restEndsAt) {
      const left = Math.ceil((restEndsAt - Date.now()) / 1000);
      if (left <= 0) {
        restEndsAt = null;
        restBanner.hidden = true;
        beep();
      } else {
        restLeftEl.textContent = formatDuration(left);
        restBanner.hidden = false;
      }
    }
  }
  const interval = setInterval(tick, 1000);

  exercisesEl.addEventListener("click", async (event) => {
    const tickButton = event.target.closest("[data-tick]");
    if (tickButton) {
      const [i, t] = tickButton.dataset.tick.split(":").map(Number);
      const ticks = workout.exercises[i].ticks;
      ticks[t] = !ticks[t];
      saveWorkout(workout);
      drawExercises();
      // A set just done -> start the rest countdown (if the rest timer is on).
      if (ticks[t] && restSeconds) {
        unlockSound(); // sound needs a tap first on iPhone
        restEndsAt = Date.now() + restSeconds * 1000;
        tick();
      }
      return;
    }
    const weightButton = event.target.closest("[data-weight]");
    if (weightButton) {
      const exercise = workout.exercises[Number(weightButton.dataset.weight)];
      const value = await askWeight(exercise);
      if (value === undefined) return;
      exercise.weight_kg = value;
      saveWorkout(workout);
      drawExercises();
    }
  });

  // The rest choices: Off, the usual times, and "Custom" (shows your own
  // time once you've set one).
  const restChoicesEl = container.querySelector("#rest-choices");
  function drawRestChoices() {
    const isCustom = !REST_CHOICES.includes(restSeconds);
    restChoicesEl.innerHTML = REST_CHOICES.map((s) => `
      <button type="button" class="chip-button" data-rest="${s}" aria-pressed="${s === restSeconds}">
        ${s === 0 ? "Off" : formatRest(s)}</button>`).join("") + `
      <button type="button" class="chip-button" data-rest="custom" aria-pressed="${isCustom}">
        ${isCustom ? formatRest(restSeconds) + " ✎" : "Custom"}</button>`;
  }

  restChoicesEl.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-rest]");
    if (!button) return;
    if (button.dataset.rest === "custom") {
      const seconds = await askRest(restSeconds);
      if (seconds == null) return;
      restSeconds = seconds;
    } else {
      restSeconds = Number(button.dataset.rest);
    }
    saveRestSeconds(restSeconds);
    drawRestChoices();
    if (!restSeconds) {
      restEndsAt = null;
      restBanner.hidden = true;
    }
  });

  container.querySelector("#rest-skip").addEventListener("click", () => {
    restEndsAt = null;
    restBanner.hidden = true;
  });

  container.querySelector("#finish").addEventListener("click", () => {
    const open = ticksTotal(workout) - ticksDone(workout);
    if (open && !window.confirm(`${open} set${open === 1 ? "" : "s"} not ticked. Finish anyway?`)) return;
    workout.finishedAt = Date.now();
    workout.durationS = Math.round((workout.finishedAt - workout.startedAt) / 1000);
    saveWorkout(workout);
    window.location.hash = `#/log/new/${session.id}`; // the log form picks up the workout
  });

  container.querySelector("#abandon").addEventListener("click", () => {
    if (!window.confirm("Stop this workout? Your ticks are thrown away and nothing is logged.")) return;
    clearWorkout();
    window.location.hash = backToPlan;
  });

  drawRestChoices();
  drawExercises();
  tick();
  keepScreenAwake();
}


function targetsHtml(details) {
  const targets = [details.target_duration_s ? formatDuration(details.target_duration_s) : "",
    details.target_distance_km ? `${Number(details.target_distance_km)} km` : ""].filter(Boolean);
  return targets.length ? `<p><strong>Target:</strong> ${escapeHtml(targets.join(" · "))}</p>` : "";
}

// 45 -> "45 s", 90 -> "90 s", 120 -> "2 min", 75 -> "1:15"
function formatRest(seconds) {
  if (seconds < 60 || seconds === 90) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return formatDuration(seconds);
}

// Pop-up to type your own rest time. Resolves to seconds, or null.
function askRest(current) {
  return openSheet({
    title: "Custom rest time",
    html: `
      <label for="rest-input" class="sheet-subtitle">Rest between sets</label>
      <input id="rest-input" type="text" inputmode="decimal" autocomplete="off" placeholder="45 or 1:15"
             value="${current ? escapeHtml(formatDuration(current)) : ""}">
      <p class="muted small">"45" = 45 seconds, "1:15" = 1 minute 15. Between 5 seconds and 15 minutes.</p>
      <p id="rest-error" class="status error" hidden></p>
      <button type="button" class="button primary" id="rest-go">Use this time</button>`,
    onReady: (dialog, close) => {
      const input = dialog.querySelector("#rest-input");
      const go = () => {
        const seconds = parseRest(input.value);
        if (seconds == null) {
          const errorEl = dialog.querySelector("#rest-error");
          errorEl.textContent = "Not understood. Try 45 or 1:15.";
          errorEl.hidden = false;
          return;
        }
        close(String(seconds));
      };
      dialog.querySelector("#rest-go").addEventListener("click", go);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } });
      input.select();
    },
  }).then((value) => (value == null ? null : Number(value)));
}

// Pop-up to change a weight. Resolves to a number, null (no weight) or
// undefined (closed without saving).
async function askWeight(exercise) {
  const value = await openSheet({
    title: exercise.name,
    html: `
      <label for="weight-input" class="sheet-subtitle">Weight (kg)</label>
      <input id="weight-input" type="text" inputmode="decimal" autocomplete="off"
             value="${exercise.weight_kg ?? ""}">
      <p class="muted small">Leave empty for no weight.</p>
      <button type="button" class="button primary" id="weight-go">Save</button>`,
    onReady: (dialog, close) => {
      const input = dialog.querySelector("#weight-input");
      // "go:" prefix so an empty box is not mistaken for "closed".
      const go = () => close("go:" + input.value.replace(",", ".").trim());
      dialog.querySelector("#weight-go").addEventListener("click", go);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } });
      input.select();
    },
  });
  if (!value || !value.startsWith("go:")) return undefined;
  const text = value.slice(3);
  if (text === "") return null;
  const number = Number(text);
  return Number.isFinite(number) && number >= 0 && number <= 500 ? number : undefined;
}


// ---------------------------------------------------------------------
// Sound and screen
// ---------------------------------------------------------------------

// The browser only allows sound after you've tapped something, so the
// "speaker" is switched on during a tap and reused for the beep later.
let audio = null;
function unlockSound() {
  try {
    audio = audio || new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === "suspended") audio.resume();
  } catch { /* no sound on this device */ }
}

// Three short beeps (and a buzz on phones that support it).
function beep() {
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch { /* ignore */ }
  if (!audio) return;
  [0, 0.3, 0.6].forEach((delay) => {
    const oscillator = audio.createOscillator();
    const volume = audio.createGain();
    oscillator.frequency.value = 880;
    volume.gain.value = 0.2;
    oscillator.connect(volume).connect(audio.destination);
    oscillator.start(audio.currentTime + delay);
    oscillator.stop(audio.currentTime + delay + 0.15);
  });
}

// Ask the phone not to go to sleep during the workout (where supported).
// The lock is dropped when the app goes to the background, so we ask again
// when it comes back.
let wakeLock = null;
async function keepScreenAwake() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
    }
  } catch { /* not allowed or not supported: fine */ }
}
function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && document.querySelector(".workout-head")) keepScreenAwake();
});
