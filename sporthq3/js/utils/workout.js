// workout.js — the workout in progress (workout mode), kept on this phone.
//
// While you train, every tick and weight change is saved in localStorage
// (a small notebook inside the browser). If the app closes or the phone
// locks, you come back exactly where you were. Only one workout at a time.
//
// A workout:
//   { plannedId, name, startedAt (ms), finishedAt (ms|null), durationS,
//     rounds (always null since step 38, see below),
//     exercises: [ { name, sets, reps, weight_kg, note, block, rounds,
//                    origIndex, ticks: [true, false, …] } ],
//     original: { rounds, exercises },   // the recipe as it was at the start
//     setTimer: { index, tick, readyEndsAt, endsAt } | null }
//
// You can change the session while you train (sets, reps/time, weight,
// add or remove exercises). `origIndex` = where the exercise was in the
// original recipe (null = added today), so at the end we can list what
// changed and offer to update the recipe.
//
// Circuits (step 38): exercises with the same `block` are done round by
// round, `rounds` times (see utils/circuits.js). An old session-wide
// `rounds` is turned into one circuit when the workout starts.

import { withCircuits, inCircuit } from "./circuits.js?v=202611081505";

const WORKOUT_KEY = "sporthq3.workout";
const REST_KEY = "sporthq3.restSeconds"; // the rest timer choice (0 = off)

export const REST_CHOICES = [0, 60, 90, 120, 180];
export const REST_MIN = 5;    // custom rest: between 5 seconds…
export const REST_MAX = 900;  // …and 15 minutes

function isValidRest(seconds) {
  return seconds === 0 || (Number.isInteger(seconds) && seconds >= REST_MIN && seconds <= REST_MAX);
}

// A custom rest time typed by you: "45" = 45 seconds, "1:15" = 1 min 15 s.
// (Not like the log's duration box, where "45" means minutes: rests are short.)
// Returns seconds, or null if not understood / out of range.
export function parseRest(text) {
  const clean = String(text).trim().replace(/[.,]/g, ":");
  let seconds;
  if (/^\d+$/.test(clean)) seconds = Number(clean);
  else if (/^\d+:\d{1,2}$/.test(clean)) {
    const [minutes, secs] = clean.split(":").map(Number);
    if (secs > 59) return null;
    seconds = minutes * 60 + secs;
  } else return null;
  return seconds >= REST_MIN && seconds <= REST_MAX ? seconds : null;
}

export function loadWorkout() {
  try {
    return upgrade(JSON.parse(localStorage.getItem(WORKOUT_KEY)) || null);
  } catch {
    return null;
  }
}

// A workout started with an older version of the app:
// - no `original`: rebuild it from what we have (the weights it started with);
// - a session-wide `rounds` (before step 38): turn it into one circuit.
function upgrade(workout) {
  if (!workout) return workout;
  if (!workout.original) {
    workout.exercises.forEach((e, i) => { e.origIndex = i; });
    workout.original = {
      rounds: workout.rounds,
      exercises: workout.exercises.map((e) => ({
        name: e.name, sets: e.sets, reps: e.reps, note: e.note,
        weight_kg: "startWeight" in e ? e.startWeight : e.weight_kg,
      })),
    };
    workout.setTimer = null;
  }
  if (workout.rounds) {
    const rounds = workout.rounds;
    workout.exercises.forEach((e) => { e.block = 1; e.rounds = rounds; });
    workout.original = { rounds: null, exercises: withCircuits(workout.original) };
    workout.rounds = null;
  }
  return workout;
}

export function saveWorkout(workout) {
  try { localStorage.setItem(WORKOUT_KEY, JSON.stringify(workout)); } catch { /* full or blocked */ }
}

export function clearWorkout() {
  try { localStorage.removeItem(WORKOUT_KEY); } catch { /* not important */ }
}

export function readRestSeconds() {
  try {
    const value = Number(localStorage.getItem(REST_KEY));
    return isValidRest(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function saveRestSeconds(seconds) {
  try { localStorage.setItem(REST_KEY, String(seconds)); } catch { /* not important */ }
}

// How many tick boxes an exercise gets: one per round in a circuit,
// otherwise one per set (at least one).
export function boxCount(exercise) {
  return inCircuit(exercise) ? Number(exercise.rounds) : (exercise.sets || 1);
}

// A fresh workout from a session's details (recipe or "just a sport").
// `sport` / `sessionType` are kept so the workout can still be logged if its
// planned session disappears (step 22, utils/savedWorkout.js).
export function newWorkout(plannedId, name, details, { sport = null, sessionType = null } = {}) {
  const lines = withCircuits(details).map((e) => ({
    name: e.name, sets: e.sets ?? null, reps: e.reps ?? null, note: e.note ?? null,
    weight_kg: e.weight_kg ?? null,
    ...(inCircuit(e) ? { block: e.block, rounds: Number(e.rounds) } : {}),
  }));
  const exercises = lines.map((e, i) => ({ ...e, origIndex: i, ticks: Array(boxCount(e)).fill(false) }));
  return {
    plannedId, name, sport, sessionType, startedAt: Date.now(), finishedAt: null, durationS: null, rounds: null, exercises,
    original: { rounds: null, exercises: lines }, setTimer: null,
  };
}

// After the sets (or the circuit's rounds) changed: as many tick boxes as
// needed. Ticks already done are kept; extra boxes start empty.
export function resizeTicks(exercise) {
  const count = boxCount(exercise);
  exercise.ticks = Array.from({ length: count }, (_, i) => Boolean(exercise.ticks[i]));
}

// A time typed in "Reps / time": "45s", "45 sec", "1:30", "1 min",
// "1min30", "2'30". Returns seconds, or null when it's a number of reps
// ("10", "8-10", "10 each side"). Bare "m" is NOT minutes (20m = metres).
export function parseExerciseTime(text) {
  const t = String(text ?? "").trim().toLowerCase();
  let seconds = null;
  let m;
  if ((m = t.match(/^(\d{1,2}):([0-5]\d)(?!\d)/))) {
    seconds = Number(m[1]) * 60 + Number(m[2]);
  } else if ((m = t.match(/^(\d{1,4})\s*(?:s|sec|secs|seconds?|''|")(?![a-z])/))) {
    seconds = Number(m[1]);
  } else if ((m = t.match(/^(\d{1,2})\s*(?:min(?:utes?)?|mn|')(?:\s*(\d{1,2})\s*(?:s|sec|secs|seconds?|''|")?)?(?![a-z\d])/))) {
    seconds = Number(m[1]) * 60 + Number(m[2] || 0);
  }
  return seconds >= 3 && seconds <= 3600 ? seconds : null;
}

export function ticksDone(workout) {
  return workout.exercises.reduce((sum, e) => sum + e.ticks.filter(Boolean).length, 0);
}

export function ticksTotal(workout) {
  return workout.exercises.reduce((sum, e) => sum + e.ticks.length, 0);
}

// The frozen "photo" saved on the planned session: what you really did
// (today's exercises, sets and weights) and how many sets were ticked.
export function workoutSnapshot(workout, details) {
  return {
    ...(details && details.custom ? { custom: true } : {}),
    name: (details && details.name) || workout.name,
    description: (details && details.description) || null,
    rounds: null,
    target_duration_s: (details && details.target_duration_s) || null,
    target_distance_km: (details && details.target_distance_km) || null,
    exercises: workout.exercises.map((e) => ({
      name: e.name, sets: inCircuit(e) ? null : e.sets, reps: e.reps, weight_kg: e.weight_kg, note: e.note,
      ...(inCircuit(e) ? { block: e.block, rounds: e.rounds } : {}),
      done_sets: e.ticks.filter(Boolean).length,
      total_sets: e.ticks.length,
    })),
  };
}

// What changed compared with the recipe, in words, e.g.
//   ["Squat: 3 → 4 sets, 25 kg → 30 kg", "Push-ups: 3 → 4 rounds", "+ Lunges", "− Plank (removed)"]
export function recipeChanges(workout) {
  const original = workout.original;
  const changes = [];
  if ((original.rounds || null) !== (workout.rounds || null)) {
    changes.push(`Rounds: ${original.rounds || "none"} → ${workout.rounds || "none"}`);
  }
  const kept = new Set();
  for (const e of workout.exercises) {
    if (e.origIndex == null) {
      changes.push(`+ ${[e.name, amountText(e)].filter(Boolean).join(" · ")}`);
      continue;
    }
    kept.add(e.origIndex);
    const o = original.exercises[e.origIndex];
    const bits = [];
    if (inCircuit(e)) {
      if (Number(o.rounds) !== Number(e.rounds)) bits.push(`${o.rounds} → ${e.rounds} rounds`);
    } else if ((o.sets ?? null) !== (e.sets ?? null)) {
      bits.push(`${o.sets ?? "no"} → ${e.sets ?? "no"} sets`);
    }
    if ((o.reps ?? null) !== (e.reps ?? null)) bits.push(`${o.reps ?? "—"} → ${e.reps ?? "—"}`);
    if ((o.weight_kg ?? null) !== (e.weight_kg ?? null)) bits.push(`${kgText(o.weight_kg)} → ${kgText(e.weight_kg)}`);
    if (bits.length) changes.push(`${e.name}: ${bits.join(", ")}`);
  }
  original.exercises.forEach((o, i) => {
    if (!kept.has(i)) changes.push(`− ${o.name} (removed)`);
  });
  return changes;
}

// Today's version as recipe content: { rounds, exercises } (empty values left out,
// like the catalogue editor does).
export function recipeFromWorkout(workout) {
  return {
    rounds: null,
    exercises: workout.exercises.map((e) => {
      const line = { name: e.name };
      if (inCircuit(e)) {
        line.block = e.block;
        line.rounds = e.rounds;
      } else if (e.sets != null) {
        line.sets = e.sets;
      }
      if (e.reps) line.reps = e.reps;
      if (e.weight_kg != null) line.weight_kg = e.weight_kg;
      if (e.note) line.note = e.note;
      return line;
    }),
  };
}

// "3 × 10", "45s", "4 sets" (in a circuit: just the reps/time).
export function amountText(e) {
  const circuit = inCircuit(e);
  if (e.reps) return circuit ? e.reps : `${e.sets ? e.sets + " × " : ""}${e.reps}`;
  return !circuit && e.sets ? `${e.sets} sets` : "";
}

function kgText(value) {
  return value == null ? "no weight" : `${Number(value)} kg`;
}
