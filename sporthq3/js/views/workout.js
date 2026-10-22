// Workout mode (opened from the planner): #/workout/<plannedSessionId>
//
// The exercise you're on as a big card with one big "Set done" button, the
// others as short rows, a countdown for timed sets ("45s"), an optional rest
// timer (bar pinned at the bottom), and the session can be changed on the
// spot (sets, reps/time, weight, add/remove exercises). Everything is saved on the phone
// as you go (see utils/workout.js). "Finish" opens the log form, pre-filled;
// saving it marks the session done, freezes what you really did and offers
// to update the recipe.

import { getPlannedSession } from "../storage.js?v=202610221143";
import { escapeHtml, formatDuration, numHtml } from "../utils/format.js?v=202610221143";
import { startOfWeek } from "../utils/dates.js?v=202610221143";
import { sessionName, sessionDetails } from "../utils/plan.js?v=202610221143";
import { openSheet } from "../utils/sheet.js?v=202610221143";
import { icon } from "../utils/icons.js?v=202610221143";
import {
  loadWorkout, saveWorkout, clearWorkout, newWorkout, readRestSeconds, saveRestSeconds,
  REST_CHOICES, parseRest, ticksDone, ticksTotal, resizeTicks, parseExerciseTime, amountText,
} from "../utils/workout.js?v=202610221143";

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


// The workout screen (step 18): a slim dark strip on top (time, sets done,
// rest + screen chips), the exercise you're on as a big card ("Now"), the
// others as short rows (Up next / Done), and a bar pinned at the bottom
// while you rest or while a timed set runs.
function drawWorkout(container, session, workout, backToPlan) {
  const details = sessionDetails(session) || {};
  let restSeconds = readRestSeconds();
  let justTicked = null; // "exercise:set" of the circle you just ticked (for the little animation)
  if (workout.keepAwake === undefined) workout.keepAwake = true; // screen stays on by default
  const setWord = workout.rounds ? "round" : "set";
  const SetWord = workout.rounds ? "Round" : "Set";

  container.innerHTML = `
    <section class="workout-strip">
      <div class="strip-top">
        <a href="${backToPlan}" class="strip-back" aria-label="Back to the plan (the workout keeps running)">${icon("chevron-left")}Plan</a>
        <div class="strip-time">
          <span class="num" id="timer" aria-live="off">0:00</span>
          <span class="strip-name">${escapeHtml(workout.name)}</span>
        </div>
        <div class="strip-sets" id="progress"></div>
      </div>
      <div class="strip-bar" aria-hidden="true"><span id="progress-fill"></span></div>
      <div class="strip-chips">
        <button type="button" class="strip-chip" id="rest-chip"></button>
        <button type="button" class="strip-chip" id="awake-chip" hidden></button>
      </div>
      ${details.description || targetsText(details) ? `<p class="strip-about">${escapeHtml([details.description, targetsText(details)].filter(Boolean).join(" · "))}</p>` : ""}
    </section>

    <div id="exercises"></div>

    <button type="button" class="button add-exercise" id="add-exercise">${icon("plus")} Add an exercise</button>
    <div class="workout-actions">
      <button type="button" class="button finish-button" id="finish">${icon("flag")} Finish workout</button>
      <button type="button" class="button danger" id="abandon">Stop without saving</button>
    </div>

    <div class="workout-bar" id="workout-bar" role="timer" hidden>
      <div class="bar-row">
        <div class="bar-text">
          <span class="bar-label" id="bar-label">Rest</span>
          <span class="num bar-left" id="bar-left">0:00</span>
        </div>
        <button type="button" class="button bar-more" id="rest-more">+15 s</button>
        <button type="button" class="button bar-skip" id="rest-skip">Skip</button>
        <button type="button" class="button bar-skip" id="set-stop" hidden>Stop</button>
      </div>
      <div class="bar-track" aria-hidden="true"><span id="bar-fill"></span></div>
      <p class="bar-next" id="bar-next"></p>
    </div>
  `;

  const exercisesEl = container.querySelector("#exercises");
  const timerEl = container.querySelector("#timer");
  const progressEl = container.querySelector("#progress");
  const progressFill = container.querySelector("#progress-fill");
  const restChip = container.querySelector("#rest-chip");
  const awakeChip = container.querySelector("#awake-chip");
  const barEl = container.querySelector("#workout-bar");
  const barLabel = container.querySelector("#bar-label");
  const barLeft = container.querySelector("#bar-left");
  const barFill = container.querySelector("#bar-fill");
  const barNext = container.querySelector("#bar-next");
  const restMore = container.querySelector("#rest-more");
  const restSkip = container.querySelector("#rest-skip");
  const setStop = container.querySelector("#set-stop");
  const finishButton = container.querySelector("#finish");

  // ---- Which exercise is "now" ----

  // The one you tapped, else the next one with a set left (null = all done).
  function currentIndex() {
    const i = workout.currentIndex;
    if (Number.isInteger(i) && workout.exercises[i]) return i;
    return nextOpenIndex(-1);
  }

  // The next exercise with a set (or round) left, looking after `after`.
  // A circuit goes round by round: the first exercise with the fewest ticks.
  function nextOpenIndex(after) {
    const list = workout.exercises;
    if (workout.rounds) {
      let best = null;
      let bestDone = Infinity;
      list.forEach((e, i) => {
        const done = e.ticks.filter(Boolean).length;
        if (e.ticks.includes(false) && done < bestDone) { best = i; bestDone = done; }
      });
      return best;
    }
    for (let step = 1; step <= list.length; step++) {
      const i = (after + step + list.length) % list.length;
      if (list[i].ticks.includes(false)) return i;
    }
    return null;
  }

  // After a tick: stay on this exercise while it has sets left, else move on.
  function moveOnIfDone(index) {
    const e = workout.exercises[index];
    if (workout.rounds) workout.currentIndex = null; // circuits pick the next one themselves
    else if (e && !e.ticks.includes(false)) workout.currentIndex = nextOpenIndex(index);
  }

  // ---- Drawing ----

  function draw() {
    const cur = currentIndex();
    const resting = Boolean(workout.rest);
    let html = cur == null ? doneCardHtml() : nowCardHtml(cur, resting);

    if (workout.rounds) {
      html += `<p class="workout-rounds"><strong>${workout.rounds} rounds</strong> · tick each exercise once per round
        <button type="button" class="button small-button" id="edit-rounds" aria-label="Change the rounds">${icon("pencil")}</button></p>`;
    }
    const others = workout.exercises.map((e, i) => i).filter((i) => i !== cur);
    const upNext = others.filter((i) => workout.exercises[i].ticks.includes(false));
    const done = others.filter((i) => !workout.exercises[i].ticks.includes(false));
    if (upNext.length) {
      html += `<h2 class="week-title">Up next</h2>
        <section class="card ex-list">${upNext.map((i) => rowHtml(i, false)).join("")}</section>`;
    }
    if (done.length) {
      html += `<h2 class="week-title">Done</h2>
        <section class="card ex-list is-done-list">${done.map((i) => rowHtml(i, true)).join("")}</section>`;
    }
    exercisesEl.innerHTML = html;
    justTicked = null;

    const total = ticksTotal(workout);
    const doneCount = ticksDone(workout);
    progressEl.innerHTML = total
      ? `<span class="strip-count"><span class="num">${doneCount}</span><span class="strip-of">/ ${total}</span></span><span class="strip-unit">${workout.rounds ? "ticks" : "sets"}</span>`
      : "";
    // All done: the big card has the Finish button, so the one at the bottom steps aside.
    finishButton.hidden = cur == null;
    progressFill.style.width = total ? `${Math.round((doneCount / total) * 100)}%` : "0%";
  }

  // The big card: the exercise you're on.
  function nowCardHtml(i, resting) {
    const e = workout.exercises[i];
    const timed = parseExerciseTime(e.reps);
    const next = e.ticks.indexOf(false);
    const running = workout.setTimer && workout.setTimer.index === i;
    const doneCount = e.ticks.filter(Boolean).length;
    const label = workout.rounds
      ? `Now · round ${Math.min(doneCount + 1, e.ticks.length)} of ${e.ticks.length} · exercise ${i + 1} of ${workout.exercises.length}`
      : `Now · exercise ${i + 1} of ${workout.exercises.length}`;

    let button;
    if (next < 0) {
      const later = nextOpenIndex(i);
      button = later == null ? "" : `<button type="button" class="button now-button is-outline" data-pick="${later}">
        ${icon("chevron-right")} Next: ${escapeHtml(workout.exercises[later].name)}</button>`;
    } else if (timed) {
      button = `<button type="button" class="button now-button" data-timer="${i}" ${running ? "disabled" : ""}>
        ${running ? `${icon("timer")} Running…` : `${icon("play")} Start ${escapeHtml(formatRest(timed))} · ${setWord} ${next + 1}`}</button>`;
    } else {
      button = `<button type="button" class="button now-button ${resting ? "is-outline" : ""}" data-tick="${i}:${next}">
        ${icon("check")} ${SetWord} ${next + 1} done</button>`;
    }
    let hint = "";
    if (next >= 0 && resting) hint = "Resting · you can still tap early";
    else if (next >= 0 && restSeconds && !running) hint = `Rest ${formatRest(restSeconds)} starts when you ${timed ? "finish" : "tap"}`;
    else if (next < 0) hint = `All ${e.ticks.length} ${setWord}s done`;

    return `
      <section class="card workout-now">
        <div class="now-head">
          <p class="now-label">${escapeHtml(label)}</p>
          <button type="button" class="now-edit" data-edit="${i}" aria-label="Change ${escapeHtml(e.name)}">${icon("pencil")}</button>
        </div>
        <h2 class="now-name">${escapeHtml(e.name)}${e.origIndex == null ? ` <span class="muted small">(added)</span>` : ""}</h2>
        ${factsHtml(e, timed)}
        ${e.note ? `<p class="now-note">${escapeHtml(e.note)}</p>` : ""}
        <div class="tick-row">${e.ticks.map((ticked, t) => `
          <button type="button" class="tick ${ticked ? "is-ticked" : t === next ? "is-next" : ""} ${justTicked === `${i}:${t}` ? "just-ticked" : ""}"
            data-tick="${i}:${t}" aria-pressed="${ticked}" aria-label="${SetWord} ${t + 1}${ticked ? ", done" : ""}">
            ${ticked ? icon("check") : `<span class="num">${t + 1}</span>`}</button>`).join("")}</div>
        ${button}
        ${hint ? `<p class="now-hint">${escapeHtml(hint)}</p>` : ""}
      </section>`;
  }

  // Reps (or time) and weight in big numbers.
  function factsHtml(e, timed) {
    const facts = [];
    if (timed) facts.push(`<span class="now-fact">${numHtml(formatRest(timed))}</span>`);
    else if (e.reps && /^\d+(\s*[-–]\s*\d+)?$/.test(String(e.reps).trim())) facts.push(`<span class="now-fact">${numHtml(String(e.reps).trim(), "reps")}</span>`);
    else if (e.reps) facts.push(`<span class="now-fact now-fact-text">${escapeHtml(e.reps)}</span>`);
    if (e.weight_kg != null) facts.push(`<span class="now-fact is-weight">${numHtml(Number(e.weight_kg), "kg")}</span>`);
    return facts.length ? `<div class="now-facts">${facts.join("")}</div>` : "";
  }

  // When every set is ticked.
  function doneCardHtml() {
    const total = ticksTotal(workout);
    return `
      <section class="card workout-now is-all-done">
        <p class="now-label">${icon("check", { className: "is-ok" })} All done</p>
        <h2 class="now-name">${total ? `All ${total} ${workout.rounds ? "ticks" : "sets"} done` : "No exercises yet"}</h2>
        <p class="now-hint">${total ? "Nice one. Finish to log it." : "Add an exercise below, or finish to log the session."}</p>
        <button type="button" class="button now-button" data-finish>${icon("flag")} Finish workout</button>
      </section>`;
  }

  // One short row in "Up next" / "Done": tap it to make it the current exercise.
  function rowHtml(i, isDone) {
    const e = workout.exercises[i];
    const timed = parseExerciseTime(e.reps);
    const meta = [amountText(e, workout.rounds), e.weight_kg != null ? `${Number(e.weight_kg)} kg` : ""].filter(Boolean).join(" · ");
    const doneCount = e.ticks.filter(Boolean).length;
    const dots = e.ticks.map((ticked) => `<span class="ex-dot ${ticked ? "is-ticked" : ""}"></span>`).join("");
    return `
      <button type="button" class="ex-row" data-pick="${i}" aria-label="${escapeHtml(e.name)}, ${doneCount} of ${e.ticks.length} ${setWord}s done. Make it the current exercise">
        ${isDone ? `<span class="ex-done-badge">${icon("check")}</span>` : ""}
        <span class="ex-row-main">
          <span class="ex-row-name">${escapeHtml(e.name)}${timed ? " " + icon("timer", { className: "is-muted" }) : ""}${e.origIndex == null ? ` <span class="muted small">(added)</span>` : ""}</span>
          ${meta ? `<span class="ex-row-meta">${escapeHtml(meta)}</span>` : ""}
        </span>
        ${isDone ? "" : `<span class="ex-dots" aria-hidden="true">${dots}</span>`}
      </button>`;
  }

  // The rest chip in the strip ("Rest 90 s ▾" / "Rest off ▾").
  function drawRestChip() {
    restChip.innerHTML = `${icon("timer")} ${restSeconds ? `Rest ${escapeHtml(formatRest(restSeconds))}` : "Rest off"} ${icon("chevron-down")}`;
    restChip.setAttribute("aria-label", `Rest timer: ${restSeconds ? formatRest(restSeconds) : "off"}. Change it`);
  }

  // The screen chip: only shown where the phone can keep the screen on.
  function drawAwakeChip() {
    if (!("wakeLock" in navigator)) { awakeChip.hidden = true; return; }
    awakeChip.hidden = false;
    awakeChip.setAttribute("aria-pressed", String(workout.keepAwake));
    awakeChip.innerHTML = `${icon("smartphone")} ${wakeLockFailed && workout.keepAwake ? "Screen lock: not available" : workout.keepAwake ? "Screen stays on" : "Screen can sleep"}`;
  }

  // ---- Timers ----

  // Starts the countdown for the next open set of a timed exercise
  // (3 seconds "get ready" first, to get into position).
  function startSetTimer(index) {
    const e = workout.exercises[index];
    const seconds = parseExerciseTime(e.reps);
    const next = e.ticks.indexOf(false);
    if (!seconds || next < 0) return;
    unlockSound(); // sound needs a tap first on iPhone
    workout.rest = null;
    workout.currentIndex = index;
    const readyEndsAt = Date.now() + GET_READY_S * 1000;
    workout.setTimer = { index, tick: next, readyEndsAt, endsAt: readyEndsAt + seconds * 1000, goBeeped: false };
    saveWorkout(workout);
    draw();
    tick();
  }

  function stopSetTimer() {
    workout.setTimer = null;
    saveWorkout(workout);
    draw();
    tick();
  }

  // Time's up: tick that set, beep, then the rest timer (if on).
  function finishSetTimer() {
    const { index, tick: t } = workout.setTimer;
    const e = workout.exercises[index];
    if (e && t < e.ticks.length) {
      e.ticks[t] = true;
      justTicked = `${index}:${t}`;
      moveOnIfDone(index);
    }
    workout.setTimer = null;
    beep();
    startRest();
    saveWorkout(workout);
    draw();
  }

  // A rest countdown, if the rest timer is on. It's saved with the workout,
  // so it carries on after a reload.
  function startRest() {
    if (!restSeconds) return;
    unlockSound(); // sound needs a tap first on iPhone
    workout.rest = { endsAt: Date.now() + restSeconds * 1000, totalS: restSeconds };
  }

  function stopRest() {
    workout.rest = null;
    saveWorkout(workout);
    draw();
    tick();
  }

  // What comes after the rest / the timed set, for the bottom bar.
  function nextText() {
    const cur = currentIndex();
    if (cur == null) return "All done: finish when you're ready";
    const e = workout.exercises[cur];
    const next = e.ticks.indexOf(false);
    return next < 0 ? e.name : `${e.name} · ${setWord} ${next + 1}`;
  }

  // The bar pinned at the bottom: the rest countdown or a timed set.
  function drawBar(mode, label, secondsLeft, fraction) {
    barEl.hidden = !mode;
    container.classList.toggle("has-workout-bar", Boolean(mode));
    if (!mode) return;
    barEl.classList.toggle("is-set", mode === "set");
    barLabel.textContent = label;
    barLeft.textContent = formatDuration(Math.max(0, secondsLeft)) || "0:00";
    barEl.setAttribute("aria-label", `${label}, ${formatDuration(Math.max(0, secondsLeft)) || "0:00"} left`);
    barFill.style.width = `${Math.round(Math.min(1, Math.max(0, fraction)) * 100)}%`;
    restMore.hidden = mode !== "rest";
    restSkip.hidden = mode !== "rest";
    setStop.hidden = mode !== "set";
    if (mode === "rest") barNext.innerHTML = `Next: <strong>${escapeHtml(nextText())}</strong>`;
    else barNext.textContent = "Tap Stop to cancel (the set isn't ticked)";
  }

  // Runs every second: the main timer, the timed set and the rest countdown.
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
    const now = Date.now();
    const timer = workout.setTimer;
    if (timer) {
      const e = workout.exercises[timer.index];
      if (!e) {
        stopSetTimer();
        return;
      }
      if (now >= timer.endsAt) {
        finishSetTimer();
        return tick();
      }
      const ready = now < timer.readyEndsAt;
      if (!ready && !timer.goBeeped) {
        timer.goBeeped = true; // one short beep = go!
        saveWorkout(workout);
        beep(1);
      }
      const total = (timer.endsAt - timer.readyEndsAt) / 1000;
      drawBar("set",
        ready ? `Get ready · ${e.name}` : `${e.name} · ${setWord} ${timer.tick + 1}`,
        Math.ceil(((ready ? timer.readyEndsAt : timer.endsAt) - now) / 1000),
        ready ? 0 : 1 - (timer.endsAt - now) / 1000 / total);
      return;
    }
    if (workout.rest) {
      const left = Math.ceil((workout.rest.endsAt - now) / 1000);
      if (left <= 0) {
        workout.rest = null;
        saveWorkout(workout);
        beep();
        draw(); // the "Set done" button goes back to full colour
        drawBar(null);
        return;
      }
      drawBar("rest", "Rest", left, 1 - left / workout.rest.totalS);
      return;
    }
    drawBar(null);
  }
  const interval = setInterval(tick, 1000);

  // ---- Taps ----

  exercisesEl.addEventListener("click", async (event) => {
    const tickButton = event.target.closest("[data-tick]");
    if (tickButton) {
      const [i, t] = tickButton.dataset.tick.split(":").map(Number);
      const ticks = workout.exercises[i].ticks;
      ticks[t] = !ticks[t];
      // Ticked by hand while its countdown runs: the countdown stops.
      if (workout.setTimer && workout.setTimer.index === i && workout.setTimer.tick === t) workout.setTimer = null;
      if (ticks[t]) {
        justTicked = `${i}:${t}`;
        workout.currentIndex = i;
        moveOnIfDone(i);
        // A set just done -> start the rest countdown (if the rest timer is on).
        if (!workout.setTimer) startRest();
      }
      saveWorkout(workout);
      draw();
      tick();
      return;
    }
    const timerButton = event.target.closest("[data-timer]");
    if (timerButton) {
      startSetTimer(Number(timerButton.dataset.timer));
      return;
    }
    const pickButton = event.target.closest("[data-pick]");
    if (pickButton) {
      workout.currentIndex = Number(pickButton.dataset.pick);
      saveWorkout(workout);
      draw();
      tick();
      exercisesEl.querySelector(".workout-now").scrollIntoView({ behavior: "smooth", block: "nearest" });
      return;
    }
    if (event.target.closest("[data-finish]")) {
      finish();
      return;
    }
    if (event.target.closest("#edit-rounds")) {
      const rounds = await askRounds(workout.rounds);
      if (!rounds) return;
      workout.rounds = rounds;
      workout.exercises.forEach((e) => resizeTicks(e, rounds));
      saveWorkout(workout);
      draw();
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
        // The exercise list moved up by one: keep pointing at the same one.
        if (workout.currentIndex === index) workout.currentIndex = null;
        else if (workout.currentIndex > index) workout.currentIndex--;
      } else {
        Object.assign(exercise, result.values);
        resizeTicks(exercise, workout.rounds);
      }
      saveWorkout(workout);
      draw();
      tick();
    }
  });

  container.querySelector("#add-exercise").addEventListener("click", async () => {
    const result = await askExercise(null, workout.rounds);
    if (!result || result.remove) return;
    const exercise = { name: "", sets: null, reps: null, weight_kg: null, note: null, origIndex: null, ticks: [], ...result.values };
    resizeTicks(exercise, workout.rounds);
    workout.exercises.push(exercise);
    saveWorkout(workout);
    draw();
  });

  setStop.addEventListener("click", stopSetTimer);
  restSkip.addEventListener("click", stopRest);
  restMore.addEventListener("click", () => {
    if (!workout.rest) return;
    workout.rest.endsAt += 15 * 1000;
    workout.rest.totalS += 15;
    saveWorkout(workout);
    tick();
  });

  // Rest chip -> Off, the usual times, or Custom (remembered on this phone).
  restChip.addEventListener("click", async () => {
    const seconds = await askRestChoice(restSeconds);
    if (seconds == null) return;
    restSeconds = seconds;
    saveRestSeconds(restSeconds);
    if (!restSeconds) workout.rest = null;
    saveWorkout(workout);
    drawRestChip();
    draw();
    tick();
  });

  // Screen chip -> keep the screen on, or let it sleep.
  awakeChip.addEventListener("click", async () => {
    workout.keepAwake = !workout.keepAwake;
    saveWorkout(workout);
    if (workout.keepAwake) await keepScreenAwake();
    else releaseWakeLock();
    drawAwakeChip();
  });

  function finish() {
    const open = ticksTotal(workout) - ticksDone(workout);
    if (open && !window.confirm(`${open} ${setWord}${open === 1 ? "" : "s"} not ticked. Finish anyway?`)) return;
    workout.finishedAt = Date.now();
    workout.durationS = Math.round((workout.finishedAt - workout.startedAt) / 1000);
    workout.rest = null;
    workout.setTimer = null;
    saveWorkout(workout);
    releaseWakeLock();
    window.location.hash = `#/log/new/${session.id}`; // the log form picks up the workout
  }
  finishButton.addEventListener("click", finish);

  container.querySelector("#abandon").addEventListener("click", () => {
    if (!window.confirm("Stop this workout? Your ticks are thrown away and nothing is logged.")) return;
    clearWorkout();
    releaseWakeLock();
    window.location.hash = backToPlan;
  });

  drawRestChip();
  draw();
  tick();
  if (workout.keepAwake) keepScreenAwake().then(drawAwakeChip);
  drawAwakeChip();
}

const GET_READY_S = 3; // seconds to get into position before a timed set

// "45:00 · 8 km": the session's targets in a few words ("" when none).
function targetsText(details) {
  return [details.target_duration_s ? `target ${formatDuration(details.target_duration_s)}` : "",
    details.target_distance_km ? `${Number(details.target_distance_km)} km` : ""].filter(Boolean).join(" · ");
}

// 45 -> "45 s", 90 -> "90 s", 120 -> "2 min", 75 -> "1:15"
function formatRest(seconds) {
  if (seconds < 60 || seconds === 90) return `${seconds} s`;
  if (seconds % 60 === 0) return `${seconds / 60} min`;
  return formatDuration(seconds);
}

// Pop-up from the rest chip: Off, the usual times, or Custom.
// Resolves to seconds (0 = off), or null when closed.
async function askRestChoice(current) {
  const isCustom = !REST_CHOICES.includes(current);
  const value = await openSheet({
    title: "Rest timer",
    html: `
      <p class="muted small">Starts by itself when you tick a set.</p>
      <div class="sheet-list">
        ${REST_CHOICES.map((s) => `<button type="button" class="sheet-item ${s === current ? "is-current" : ""}" data-value="${s}"
          aria-pressed="${s === current}">${s === 0 ? "Off" : escapeHtml(formatRest(s))}${s === current ? icon("check") : ""}</button>`).join("")}
        <button type="button" class="sheet-item ${isCustom ? "is-current" : ""}" data-value="custom" aria-pressed="${isCustom}">
          ${isCustom ? `Custom · ${escapeHtml(formatRest(current))}` : "Custom…"}${isCustom ? icon("check") : ""}</button>
      </div>`,
  });
  if (value == null) return null;
  if (value === "custom") return askRest(current);
  return Number(value);
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
  // (Buzz only after a tap on this page: browsers refuse it otherwise, e.g. a
  // timed set that ended while the app was reloading. iPhones never buzz.)
  const tapped = !navigator.userActivation || navigator.userActivation.hasBeenActive;
  try { if (tapped && navigator.vibrate) navigator.vibrate(count === 1 ? 150 : [200, 100, 200]); } catch { /* ignore */ }
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

// Ask the phone not to go to sleep during the workout (where supported,
// and only while the "Screen stays on" chip is on). The lock is dropped when
// the app goes to the background, so we ask again when it comes back.
// Note: iPhone home-screen apps may not honour it (Safari does since iOS 16.4);
// Rom checks it on his phone. If it fails, the chip says so; never an error.
let wakeLock = null;
let wakeLockFailed = false;
async function keepScreenAwake() {
  try {
    if ("wakeLock" in navigator && document.visibilityState === "visible") {
      wakeLock = await navigator.wakeLock.request("screen");
      wakeLockFailed = false;
    }
  } catch {
    wakeLockFailed = true; // not allowed here: the chip shows "not available"
  }
}
function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible" || !document.querySelector(".workout-strip")) return;
  const workout = loadWorkout();
  if (workout && workout.keepAwake !== false) keepScreenAwake();
});
