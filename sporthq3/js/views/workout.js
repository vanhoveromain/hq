// Workout mode (opened from the planner): #/workout/<plannedSessionId>
//
// A timer, one tick box per set, a countdown for timed sets ("45s"), an
// optional rest timer, and the session can be changed on the spot (sets,
// reps/time, weight, add/remove exercises). Everything is saved on the phone
// as you go (see utils/workout.js). "Finish" opens the log form, pre-filled;
// saving it marks the session done, freezes what you really did and offers
// to update the recipe.

import { getPlannedSession } from "../storage.js?v=202610211550";
import { getSport, sportIcon } from "../rules.js?v=202610211550";
import { escapeHtml, formatDuration } from "../utils/format.js?v=202610211550";
import { startOfWeek } from "../utils/dates.js?v=202610211550";
import { sessionName, sessionDetails } from "../utils/plan.js?v=202610211550";
import { openSheet } from "../utils/sheet.js?v=202610211550";
import { icon } from "../utils/icons.js?v=202610211550";
import {
  loadWorkout, saveWorkout, clearWorkout, newWorkout, readRestSeconds, saveRestSeconds,
  REST_CHOICES, parseRest, ticksDone, ticksTotal, resizeTicks, parseExerciseTime, amountText,
} from "../utils/workout.js?v=202610211550";

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
    container.innerHTML = `<section class="card placeholder"><p>This session is already ${session.status === "done" ? `done ${icon("check", { className: "is-ok" })}` : "cancelled"}.</p>
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
      <p class="muted small">${sport ? sportIcon(sport.key) + " " + escapeHtml(sport.label) : ""}</p>
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

    <div id="set-banner" class="rest-banner set-banner" hidden>
      <span><span id="set-label"></span> <strong id="set-left">0:00</strong></span>
      <button type="button" class="button small-button" id="set-stop">Stop</button>
    </div>

    <p class="workout-rounds" id="rounds-line" hidden></p>
    <div id="exercises"></div>
    <button type="button" class="button add-exercise" id="add-exercise">+ Add an exercise</button>

    <div class="workout-actions">
      <button type="button" class="button primary" id="finish">${icon("flag")} Finish</button>
      <button type="button" class="button danger" id="abandon">Stop without saving</button>
    </div>
  `;

  const exercisesEl = container.querySelector("#exercises");
  const timerEl = container.querySelector("#timer");
  const progressEl = container.querySelector("#progress");
  const restBanner = container.querySelector("#rest-banner");
  const restLeftEl = container.querySelector("#rest-left");
  const setBanner = container.querySelector("#set-banner");
  const setLabelEl = container.querySelector("#set-label");
  const setLeftEl = container.querySelector("#set-left");
  const roundsLine = container.querySelector("#rounds-line");
  const setWord = workout.rounds ? "round" : "set";

  function drawExercises() {
    exercisesEl.innerHTML = workout.exercises.map((e, i) => {
      const done = e.ticks.filter(Boolean).length;
      const timed = parseExerciseTime(e.reps);
      const next = e.ticks.indexOf(false);
      const running = workout.setTimer && workout.setTimer.index === i;
      return `
        <section class="card exercise ${done === e.ticks.length ? "is-complete" : ""}">
          <div class="exercise-head">
            <div>
              <h3>${escapeHtml(e.name)}${e.origIndex == null ? ` <span class="muted small">(added)</span>` : ""}</h3>
              <p class="muted small">${escapeHtml([amountText(e, workout.rounds), e.note].filter(Boolean).join(" · "))}</p>
            </div>
            <button type="button" class="button small-button weight-button" data-edit="${i}"
              aria-label="Change ${escapeHtml(e.name)}">${e.weight_kg != null ? `<span class="num">${Number(e.weight_kg)}</span> kg ${icon("pencil")}` : `${icon("pencil")} Edit`}</button>
          </div>
          <div class="tick-row">${e.ticks.map((ticked, t) => `
            <button type="button" class="tick ${ticked ? "is-ticked" : ""}" data-tick="${i}:${t}"
              aria-pressed="${ticked}" aria-label="${workout.rounds ? "Round" : "Set"} ${t + 1}">
              ${ticked ? icon("check") : t + 1}</button>`).join("")}</div>
          ${timed ? `<button type="button" class="button primary set-timer-button" data-timer="${i}" ${next < 0 || running ? "disabled" : ""}>
            ${running ? `${icon("timer")} Running…` : next < 0 ? `${icon("check")} All done` : `${icon("play")} Start ${formatRest(timed)} · ${setWord} ${next + 1}`}</button>` : ""}
        </section>`;
    }).join("");
    const total = ticksTotal(workout);
    progressEl.textContent = total ? `${ticksDone(workout)} / ${total} ${workout.rounds ? "ticks" : "sets"} done` : "";
    roundsLine.hidden = !workout.rounds;
    if (workout.rounds) {
      roundsLine.innerHTML = `<strong>${workout.rounds} rounds</strong> · tick each exercise once per round
        <button type="button" class="button small-button" id="edit-rounds" aria-label="Change the rounds">${icon("pencil")}</button>`;
    }
  }

  // Starts the countdown for the next open set of a timed exercise
  // (3 seconds "get ready" first, to get into position).
  function startSetTimer(index) {
    const e = workout.exercises[index];
    const seconds = parseExerciseTime(e.reps);
    const next = e.ticks.indexOf(false);
    if (!seconds || next < 0) return;
    unlockSound(); // sound needs a tap first on iPhone
    restEndsAt = null;
    restBanner.hidden = true;
    const readyEndsAt = Date.now() + GET_READY_S * 1000;
    workout.setTimer = { index, tick: next, readyEndsAt, endsAt: readyEndsAt + seconds * 1000, goBeeped: false };
    saveWorkout(workout);
    drawExercises();
    tick();
  }

  function stopSetTimer() {
    workout.setTimer = null;
    saveWorkout(workout);
    setBanner.hidden = true;
    drawExercises();
  }

  // Time's up: tick that set, beep, then the rest timer (if on).
  function finishSetTimer() {
    const { index, tick: t } = workout.setTimer;
    const e = workout.exercises[index];
    if (e && t < e.ticks.length) e.ticks[t] = true;
    stopSetTimer();
    beep();
    if (restSeconds) restEndsAt = Date.now() + restSeconds * 1000;
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
    const timer = workout.setTimer;
    if (timer) {
      const now = Date.now();
      const e = workout.exercises[timer.index];
      if (!e) {
        stopSetTimer();
      } else if (now >= timer.endsAt) {
        finishSetTimer();
      } else {
        const ready = now < timer.readyEndsAt;
        if (!ready && !timer.goBeeped) {
          timer.goBeeped = true; // one short beep = go!
          saveWorkout(workout);
          beep(1);
        }
        setLabelEl.textContent = ready ? `Get ready · ${e.name}` : `${e.name} · ${setWord} ${timer.tick + 1}`;
        setLeftEl.textContent = formatDuration(Math.ceil(((ready ? timer.readyEndsAt : timer.endsAt) - now) / 1000));
        setBanner.hidden = false;
      }
    }
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
      // Ticked by hand while its countdown runs: the countdown stops.
      if (workout.setTimer && workout.setTimer.index === i && workout.setTimer.tick === t) {
        workout.setTimer = null;
        setBanner.hidden = true;
      }
      saveWorkout(workout);
      drawExercises();
      // A set just done -> start the rest countdown (if the rest timer is on).
      if (ticks[t] && restSeconds && !workout.setTimer) {
        unlockSound(); // sound needs a tap first on iPhone
        restEndsAt = Date.now() + restSeconds * 1000;
        tick();
      }
      return;
    }
    const timerButton = event.target.closest("[data-timer]");
    if (timerButton) {
      startSetTimer(Number(timerButton.dataset.timer));
      return;
    }
    const editButton = event.target.closest("[data-edit]");
    if (editButton) {
      const index = Number(editButton.dataset.edit);
      const exercise = workout.exercises[index];
      const result = await askExercise(exercise, workout.rounds);
      if (!result) return;
      // Its countdown (if running) belongs to the old version: stop it.
      if (workout.setTimer && (result.remove || workout.setTimer.index === index)) workout.setTimer = null;
      if (result.remove) {
        if (workout.setTimer && workout.setTimer.index > index) workout.setTimer.index--;
        workout.exercises.splice(index, 1);
      } else {
        Object.assign(exercise, result.values);
        resizeTicks(exercise, workout.rounds);
      }
      setBanner.hidden = !workout.setTimer;
      saveWorkout(workout);
      drawExercises();
    }
  });

  // A circuit: change the number of rounds (every exercise gets that many boxes).
  roundsLine.addEventListener("click", async (event) => {
    if (!event.target.closest("#edit-rounds")) return;
    const rounds = await askRounds(workout.rounds);
    if (!rounds) return;
    workout.rounds = rounds;
    workout.exercises.forEach((e) => resizeTicks(e, rounds));
    saveWorkout(workout);
    drawExercises();
  });

  container.querySelector("#add-exercise").addEventListener("click", async () => {
    const result = await askExercise(null, workout.rounds);
    if (!result || result.remove) return;
    const exercise = { name: "", sets: null, reps: null, weight_kg: null, note: null, origIndex: null, ticks: [], ...result.values };
    resizeTicks(exercise, workout.rounds);
    workout.exercises.push(exercise);
    saveWorkout(workout);
    drawExercises();
  });

  container.querySelector("#set-stop").addEventListener("click", stopSetTimer);

  // The rest choices: Off, the usual times, and "Custom" (shows your own
  // time once you've set one).
  const restChoicesEl = container.querySelector("#rest-choices");
  function drawRestChoices() {
    const isCustom = !REST_CHOICES.includes(restSeconds);
    restChoicesEl.innerHTML = REST_CHOICES.map((s) => `
      <button type="button" class="chip-button" data-rest="${s}" aria-pressed="${s === restSeconds}">
        ${s === 0 ? "Off" : formatRest(s)}</button>`).join("") + `
      <button type="button" class="chip-button" data-rest="custom" aria-pressed="${isCustom}">
        ${isCustom ? `${formatRest(restSeconds)} ${icon("pencil")}` : "Custom"}</button>`;
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


const GET_READY_S = 3; // seconds to get into position before a timed set

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

// Pop-up to change an exercise (or add one when `exercise` is null):
// name, sets (not in a circuit: rounds decide), reps or time, weight.
// Resolves to { values }, { remove: true } or null (closed).
async function askExercise(exercise, rounds) {
  const e = exercise || {};
  const value = await openSheet({
    title: exercise ? exercise.name : "Add an exercise",
    html: `
      <label for="ex-name" class="sheet-subtitle">Exercise</label>
      <input id="ex-name" type="text" autocomplete="off" placeholder="e.g. Plank" value="${escapeHtml(e.name || "")}">
      <div class="${rounds ? "row-2" : "row-3"}">
        ${rounds ? "" : `<label>Sets<input id="ex-sets" type="number" inputmode="numeric" min="1" max="50" value="${e.sets ?? ""}"></label>`}
        <label>Reps / time<input id="ex-reps" type="text" autocomplete="off" placeholder="10 or 45s" value="${escapeHtml(e.reps ?? "")}"></label>
        <label>kg<input id="ex-kg" type="text" inputmode="decimal" autocomplete="off" value="${e.weight_kg ?? ""}"></label>
      </div>
      <p class="muted small">"10" = reps. "45s" or "1:00" = a timed set: you get a Start countdown button.</p>
      <p id="ex-error" class="status error" hidden></p>
      <div class="sheet-actions">
        <button type="button" class="button primary" id="ex-go">${exercise ? "Save" : "Add"}</button>
        ${exercise ? `<button type="button" class="button danger" data-value="remove">Remove this exercise</button>` : ""}
      </div>`,
    onReady: (dialog, close) => {
      const field = (id) => dialog.querySelector(id);
      const fail = (text) => {
        field("#ex-error").textContent = text;
        field("#ex-error").hidden = false;
      };
      const go = () => {
        const name = field("#ex-name").value.trim();
        if (!name) return fail("Give the exercise a name.");
        const values = { name, reps: field("#ex-reps").value.trim() || null };
        if (!rounds) {
          const setsText = field("#ex-sets").value.trim();
          const sets = setsText === "" ? null : Number(setsText);
          if (sets !== null && !(Number.isInteger(sets) && sets >= 1 && sets <= 50)) return fail("Sets: a whole number between 1 and 50.");
          values.sets = sets;
        }
        const kgText = field("#ex-kg").value.replace(",", ".").trim();
        const kg = kgText === "" ? null : Number(kgText);
        if (kg !== null && !(Number.isFinite(kg) && kg >= 0 && kg <= 500)) return fail("Weight: a number between 0 and 500 (or empty).");
        values.weight_kg = kg;
        close(JSON.stringify(values));
      };
      field("#ex-go").addEventListener("click", go);
      dialog.querySelectorAll("input").forEach((input) =>
        input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } }));
      if (!exercise) field("#ex-name").focus();
    },
  });
  if (!value) return null;
  if (value === "remove") return { remove: true };
  return { values: JSON.parse(value) };
}

// Pop-up to change the number of rounds of a circuit. Resolves to a number or null.
async function askRounds(current) {
  const value = await openSheet({
    title: "Rounds",
    html: `
      <label for="rounds-input" class="sheet-subtitle">How many rounds?</label>
      <input id="rounds-input" type="number" inputmode="numeric" min="1" max="50" value="${current ?? ""}">
      <p id="rounds-error" class="status error" hidden></p>
      <button type="button" class="button primary" id="rounds-go">Save</button>`,
    onReady: (dialog, close) => {
      const input = dialog.querySelector("#rounds-input");
      const go = () => {
        const rounds = Number(input.value);
        if (!(Number.isInteger(rounds) && rounds >= 1 && rounds <= 50)) {
          const errorEl = dialog.querySelector("#rounds-error");
          errorEl.textContent = "A whole number between 1 and 50.";
          errorEl.hidden = false;
          return;
        }
        close(String(rounds));
      };
      dialog.querySelector("#rounds-go").addEventListener("click", go);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } });
      input.select();
    },
  });
  return value ? Number(value) : null;
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

// Three short beeps (and a buzz on phones that support it); beep(1) = one.
function beep(count = 3) {
  try { navigator.vibrate && navigator.vibrate(count === 1 ? 150 : [200, 100, 200]); } catch { /* ignore */ }
  if (!audio) return;
  [0, 0.3, 0.6].slice(0, count).forEach((delay) => {
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
