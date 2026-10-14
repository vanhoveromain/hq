// plan.js — small helpers shared by the planner, the log and (later) the
// workout mode: how a planned session is named, which details it shows,
// and how it is marked done / reopened.

import { updatePlannedSession } from "../storage.js?v=202610141654";
import { sessionTypeLabel, sportLabel } from "../rules.js?v=202610141654";

// The name shown on a session card.
//   own title > recipe name > session type > sport ("Running")
export function sessionName(session) {
  if (session.title) return session.title;
  const details = sessionDetails(session);
  if (details && details.name) return details.name;
  if (session.session_type) return sessionTypeLabel(session.sport, session.session_type);
  return sportLabel(session.sport);
}

// Which details to show: the frozen "photo" once done, otherwise the live recipe.
export function sessionDetails(session) {
  return session.details || session.template || null;
}

// Takes the "photo" of a recipe, to freeze it on a done session.
export function snapshotOf(template) {
  if (!template) return null;
  return {
    name: template.name,
    description: template.description,
    rounds: template.rounds,
    exercises: template.exercises || [],
    target_duration_s: template.target_duration_s,
    target_distance_km: template.target_distance_km,
  };
}

// Marks a session done, links the activity (if any) and freezes the details.
// `details` can be passed in (workout mode: what was really done); otherwise
// the current recipe is photographed.
export function completeSession(session, activityId = null, details = undefined) {
  return updatePlannedSession(session.id, {
    status: "done",
    activity_id: activityId,
    details: details !== undefined ? details : snapshotOf(session.template),
  });
}

// Back to "planned": unlink, unfreeze (it follows the recipe again).
export function reopenSession(sessionId) {
  return updatePlannedSession(sessionId, { status: "planned", activity_id: null, details: null });
}

// What really counts on the calendar, for the training rules:
//   - planned sessions that aren't cancelled (a done one counts as what was
//     logged, if it's linked to an activity)
//   - logged activities that aren't linked to a session ("extras")
// Returns [{ date, sport, session_type }].
export function calendarItems(sessions, activities) {
  const linkedIds = new Set(sessions.map((s) => s.activity_id).filter(Boolean));
  const fromPlan = sessions
    .filter((s) => s.status !== "cancelled")
    .map((s) => (s.activity
      ? { date: s.session_date, sport: s.activity.sport, session_type: s.activity.session_type }
      : { date: s.session_date, sport: s.sport, session_type: s.session_type }));
  const extras = activities
    .filter((a) => !linkedIds.has(a.id))
    .map((a) => ({ date: a.activity_date, sport: a.sport, session_type: a.session_type }));
  return [...fromPlan, ...extras];
}
