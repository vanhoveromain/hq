// workout.js — the workout in progress (workout mode), kept on this phone.
//
// While you train, every tick and weight change is saved in localStorage
// (a small notebook inside the browser). If the app closes or the phone
// locks, you come back exactly where you were. Only one workout at a time.
//
// A workout:
//   { plannedId, name, startedAt (ms), finishedAt (ms|null), durationS,
//     rounds, exercises: [ { name, sets, reps, weight_kg, note,
//                            startWeight, ticks: [true, false, …] } ] }

const WORKOUT_KEY = "sporthq3.workout";
const REST_KEY = "sporthq3.restSeconds"; // the rest timer choice (0 = off)

export const REST_CHOICES = [0, 60, 90, 120, 180];

export function loadWorkout() {
  try {
    return JSON.parse(localStorage.getItem(WORKOUT_KEY)) || null;
  } catch {
    return null;
  }
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
    return REST_CHOICES.includes(value) ? value : 0;
  } catch {
    return 0;
  }
}

export function saveRestSeconds(seconds) {
  try { localStorage.setItem(REST_KEY, String(seconds)); } catch { /* not important */ }
}

// How many tick boxes an exercise gets: one per round for a circuit,
// otherwise one per set (at least one).
export function boxCount(exercise, rounds) {
  return rounds ? rounds : (exercise.sets || 1);
}

// A fresh workout from a session's details (recipe or "just a sport").
export function newWorkout(plannedId, name, details) {
  const rounds = (details && details.rounds) || null;
  const exercises = ((details && details.exercises) || []).map((e) => ({
    name: e.name, sets: e.sets ?? null, reps: e.reps ?? null, note: e.note ?? null,
    weight_kg: e.weight_kg ?? null,
    startWeight: e.weight_kg ?? null,
    ticks: Array(boxCount(e, rounds)).fill(false),
  }));
  return { plannedId, name, startedAt: Date.now(), finishedAt: null, durationS: null, rounds, exercises };
}

export function ticksDone(workout) {
  return workout.exercises.reduce((sum, e) => sum + e.ticks.filter(Boolean).length, 0);
}

export function ticksTotal(workout) {
  return workout.exercises.reduce((sum, e) => sum + e.ticks.length, 0);
}

// The frozen "photo" saved on the planned session: the recipe as it was,
// with the weights really used and how many sets were ticked.
export function workoutSnapshot(workout, details) {
  return {
    name: (details && details.name) || workout.name,
    description: (details && details.description) || null,
    rounds: workout.rounds,
    target_duration_s: (details && details.target_duration_s) || null,
    target_distance_km: (details && details.target_distance_km) || null,
    exercises: workout.exercises.map((e) => ({
      name: e.name, sets: e.sets, reps: e.reps, weight_kg: e.weight_kg, note: e.note,
      done_sets: e.ticks.filter(Boolean).length,
      total_sets: e.ticks.length,
    })),
  };
}

// Exercises whose weight was changed during the workout.
export function weightChanges(workout) {
  return workout.exercises
    .map((e, index) => ({ index, name: e.name, from: e.startWeight, to: e.weight_kg }))
    .filter((c) => c.from !== c.to);
}
