// raceRoutine.js — puts a race's routine into the planner (see RACE_ROUTINE
// in rules.js): the race itself on race day, an activation jog 2 days before.
// The day before stays empty (rest); a rule warns if something is planned.
//
// Routine sessions carry the race's id (race_id), so the app knows they
// belong to that race: they move with it and disappear when it's deleted.

import {
  listRaceSessions, listPlannedSessions, createPlannedSession, updatePlannedSession, deletePlannedSession,
} from "../storage.js?v=202610161542";
import { RACE_ROUTINE } from "../rules.js?v=202610161542";
import { addDays, formatDayLabel } from "./dates.js?v=202610161542";

// Which routine sessions already exist for this race, by routine key.
function routineKeyOf(session) {
  const step = RACE_ROUTINE.find((r) => r.sport === session.sport && r.session_type === session.session_type);
  return step ? step.key : null;
}

// Adds the missing routine sessions. Returns { added, notes } where notes
// are messages to show (e.g. "a match wins over the jog").
export async function addRaceRoutine(race) {
  if (!race.race_date) throw new Error("The race needs a date first.");
  const existing = await listRaceSessions(race.id);
  const have = new Set(existing.map(routineKeyOf));
  let added = 0;
  const notes = [];

  for (const step of RACE_ROUTINE) {
    if (have.has(step.key)) continue;
    const date = addDays(race.race_date, step.dayOffset);
    const dayPlan = (await listPlannedSessions(date, date)).filter((s) => s.status !== "cancelled");

    // A planned match wins: never put the jog on top of it.
    if (step.key === "activation_jog" && dayPlan.some((s) => s.sport === "football" && s.session_type === "match")) {
      notes.push(`Match on ${formatDayLabel(date)}: no activation jog added (the match wins).`);
      continue;
    }
    await createPlannedSession({
      session_date: date, sport: step.sport, session_type: step.session_type,
      title: step.title || race.name, status: "planned", source: "race_routine",
      position: dayPlan.length, race_id: race.id,
    });
    added++;
  }
  return { added, notes };
}

// When the race date changes: move the routine sessions not done yet by the
// same number of days. Returns how many moved.
export async function moveRaceRoutine(raceId, oldDate, newDate) {
  const days = Math.round((Date.parse(newDate) - Date.parse(oldDate)) / 86400000);
  if (!days) return 0;
  const open = (await listRaceSessions(raceId)).filter((s) => s.status !== "done");
  await Promise.all(open.map((s) => updatePlannedSession(s.id, { session_date: addDays(s.session_date, days) })));
  return open.length;
}

// Removes the routine sessions not done yet (done ones stay: they're history).
export async function removeRaceRoutine(raceId) {
  const open = (await listRaceSessions(raceId)).filter((s) => s.status !== "done");
  await Promise.all(open.map((s) => deletePlannedSession(s.id)));
  return open.length;
}
