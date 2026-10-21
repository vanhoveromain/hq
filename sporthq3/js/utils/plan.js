// plan.js — small helpers shared by the planner, the log and (later) the
// workout mode: how a planned session is named, which details it shows,
// and how it is marked done / reopened.

import { updatePlannedSession, saveSessionTemplate } from "../storage.js?v=202610211800";
import { sessionTypeLabel, sportLabel } from "../rules.js?v=202610211800";
import { escapeHtml } from "./format.js?v=202610211800";

// The name shown on a session card.
//   own title > recipe name > session type > sport ("Running")
export function sessionName(session) {
  if (session.title) return session.title;
  const details = sessionDetails(session);
  if (details && details.name) return details.name;
  if (session.session_type) return sessionTypeLabel(session.sport, session.session_type);
  return sportLabel(session.sport);
}

// Which details to show: the frozen "photo" once done, otherwise the live
// recipe. A custom session (made in the planner, not in the catalogue) keeps
// its own details on the session itself, marked { custom: true }.
export function sessionDetails(session) {
  return session.details || session.template || null;
}

export function isCustomSession(session) {
  return Boolean(!session.template_id && session.details && session.details.custom);
}

// "Just a sport": planned without a recipe and without details of its own
// (e.g. "Running" added with the quick sport buttons). A done one may carry
// a photo, so only call this on planned sessions.
export function isPlainSession(session) {
  return !session.template_id && !isCustomSession(session);
}

// A sport icon in a small round badge tinted with the sport's colour
// (colours live in style.css: --sport-running, …). `size` "small" for the
// compact views (Home strip, month calendar).
export function sportBadge(sportKey, iconOf, size = "") {
  return `<span class="sport-badge ${size} sport-${escapeHtml(sportKey)}" aria-hidden="true">${iconOf(sportKey)}</span>`;
}

// A custom session's details without the "how many sets were ticked" counts
// (for copying it to another week, or opening it again).
export function customDetails(details) {
  return {
    ...details,
    custom: true,
    exercises: (details.exercises || []).map(({ done_sets, total_sets, ...line }) => line),
  };
}

// Puts a session in the catalogue as a new recipe and links the session to
// it. `content` = { rounds, exercises } to use (default: the session's own
// details, e.g. today's version after a workout). A planned session then
// follows the recipe; a done one keeps its frozen photo.
export async function addToCatalogue(session, name, content = null) {
  const own = sessionDetails(session) || {};
  const source = content || own;
  const recipe = await saveSessionTemplate({
    name,
    sport: session.sport,
    session_type: session.session_type,
    description: own.description || null,
    target_duration_s: own.target_duration_s || null,
    target_distance_km: own.target_distance_km || null,
    rounds: source.rounds || null,
    exercises: customDetails(source).exercises,
    archived: false,
  });
  await updatePlannedSession(session.id, session.status === "planned"
    ? { template_id: recipe.id, details: null }
    : { template_id: recipe.id });
  return recipe;
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
    // (a custom session has no recipe: its own details are its photo)
    details: details !== undefined ? details : (session.template ? snapshotOf(session.template) : session.details || null),
  });
}

// Back to "planned": unlink, unfreeze (it follows the recipe again).
// A custom session keeps its details (they ARE the session).
export function reopenSession(session) {
  return updatePlannedSession(session.id, {
    status: "planned", activity_id: null,
    details: isCustomSession(session) ? customDetails(session.details) : null,
  });
}

// What really counts on the calendar, for the training rules:
//   - planned sessions that aren't cancelled (a done one counts as what was
//     logged, if it's linked to an activity)
//   - logged activities that aren't linked to a session ("extras")
//   - races from the Races tab (registered / to register) that aren't in the
//     planner yet as a race-routine session, so a match on race day still warns
// Returns [{ date, sport, session_type, title? }].
export function calendarItems(sessions, activities, races = []) {
  const linkedIds = new Set(sessions.map((s) => s.activity_id).filter(Boolean));
  const fromPlan = sessions
    .filter((s) => s.status !== "cancelled")
    .map((s) => (s.activity
      ? { date: s.session_date, sport: s.activity.sport, session_type: s.activity.session_type }
      // a race-routine session keeps its title, so warnings name the race
      : { date: s.session_date, sport: s.sport, session_type: s.session_type, title: s.race_id ? s.title : null }));
  const extras = activities
    .filter((a) => !linkedIds.has(a.id))
    .map((a) => ({ date: a.activity_date, sport: a.sport, session_type: a.session_type }));
  return [...fromPlan, ...extras, ...raceItems(races, sessions)];
}

// Races not yet on the planner (no race-routine race-day session for them).
export function racesNotPlanned(races, sessions) {
  const planned = new Set(sessions.filter((s) => s.race_id && s.session_type === "race").map((s) => s.race_id));
  return races.filter((race) => race.race_date && !planned.has(race.id));
}

function raceItems(races, sessions) {
  return racesNotPlanned(races, sessions)
    .map((race) => ({ date: race.race_date, sport: "running", session_type: "race", title: race.name }));
}

// One day in a compact view (Home strip, month calendar): which sport icons
// to show and whether the day is done. Cancelled sessions are left out;
// activities logged without a plan count too.
//   -> { icons: [<what iconOf returns per sport>, …], done: true|false }
export function daySummary(day, sessions, activities, iconOf) {
  const planned = sessions.filter((s) => s.session_date === day && s.status !== "cancelled");
  const linkedIds = new Set(sessions.map((s) => s.activity_id).filter(Boolean));
  const extras = activities.filter((a) => a.activity_date === day && !linkedIds.has(a.id));
  const icons = [...planned.map((s) => iconOf(s.sport)), ...extras.map((a) => iconOf(a.sport))];
  const done = icons.length > 0 && planned.every((s) => s.status === "done");
  return { icons, done };
}
