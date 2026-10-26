// savedWorkout.js — keeps the "workout in progress" (saved on this phone, see
// utils/workout.js) in step with its planned session (step 22).
//
// The workout lives in localStorage, the session in the database. When the
// session goes away (removed from the plan, a week replaced, a race routine
// removed) or is no longer "planned" (skipped, done), the saved workout used
// to stay behind and Home showed a "Workout in progress" that led nowhere.
// Now:
//   - workoutState() tells if the saved workout can still be resumed;
//   - unfinishedRowHtml() + handleUnfinishedClick() offer "Log it anyway" /
//     "Discard" when it can't;
//   - releaseWorkoutOf() is called before a session is removed or skipped.

import { getPlannedSession } from "../storage.js?v=202610260916";
import { escapeHtml } from "./format.js?v=202610260916";
import { icon } from "./icons.js?v=202610260916";
import { loadWorkout, clearWorkout, ticksDone } from "./workout.js?v=202610260916";

// The address of the log form for a workout without its session.
export const LOG_ANYWAY_HREF = "#/log/new/workout";

// { workout, state, reason }
//   state "none"     = no saved workout
//   state "active"   = its session exists and is still planned (resume it)
//   state "orphan"   = its session is gone, done or skipped
// reason (orphan only): "removed" / "done" / "cancelled".
// If the database can't be reached we can't tell: treat it as active (as before).
export async function workoutState() {
  const workout = loadWorkout();
  if (!workout) return { workout: null, state: "none" };
  let session;
  try {
    session = await getPlannedSession(workout.plannedId);
  } catch {
    return { workout, state: "active" };
  }
  if (!session) return { workout, state: "orphan", reason: "removed" };
  if (session.status !== "planned") return { workout, state: "orphan", reason: session.status };
  return { workout, state: "active" };
}

// A short sentence for why the workout can't be resumed.
export function orphanReasonText(reason) {
  if (reason === "done") return "Its planned session is already done.";
  if (reason === "cancelled") return "Its planned session was skipped.";
  return "Its planned session was removed from the plan.";
}

// A compact row: "Unfinished workout: <name>" + Log it anyway / Discard.
// `className` lets each screen give it its own look (Home hero, planner banner).
export function unfinishedRowHtml(workout, reason, className = "") {
  const done = ticksDone(workout);
  return `<div class="unfinished-workout ${className}" data-unfinished>
    <p>${icon("dumbbell")} <span>Unfinished workout: <strong>${escapeHtml(workout.name)}</strong>
      <span class="small">${escapeHtml(orphanReasonText(reason))}${done ? ` ${done} set${done === 1 ? "" : "s"} ticked.` : ""}</span></span></p>
    <div class="unfinished-actions">
      <a class="button small-button" href="${LOG_ANYWAY_HREF}">Log it anyway</a>
      <button type="button" class="button small-button is-quiet" data-unfinished-discard>Discard</button>
    </div>
  </div>`;
}

// Click handler for the row's Discard button. Returns true when it handled
// the click (then `onDiscarded` runs, e.g. to redraw the screen).
export function handleUnfinishedClick(event, onDiscarded) {
  if (!event.target.closest("[data-unfinished-discard]")) return false;
  const workout = loadWorkout();
  const done = workout ? ticksDone(workout) : 0;
  if (done && !window.confirm(`Discard "${workout.name}"? ${done === 1 ? "Its 1 ticked set is" : `Its ${done} ticked sets are`} thrown away and nothing is logged.`)) return true;
  clearWorkout();
  if (onDiscarded) onDiscarded();
  return true;
}

// Call BEFORE removing or skipping planned sessions. If the saved workout
// belongs to one of them: nothing ticked yet -> cleared without a question;
// sets ticked -> asks. Returns false only when you chose to keep it (the
// removal still goes ahead; Home then offers "Log it anyway / Discard").
export function releaseWorkoutOf(sessionIds) {
  const workout = loadWorkout();
  if (!workout || !sessionIds.includes(workout.plannedId)) return true;
  const done = ticksDone(workout);
  if (done && !window.confirm(`"${workout.name}" has a workout in progress (${done} set${done === 1 ? "" : "s"} ticked). Discard it too?\n\nOK = discard it · Cancel = keep it, to log it later`)) {
    return false;
  }
  clearWorkout();
  return true;
}
