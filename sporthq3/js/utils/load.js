// load.js — the "training load" check for one week (step 16f).
// It gathers the numbers checkLoad (rules.js) needs: how many sessions this
// week, hours already done, your usual week, and a race if there is one.
// The rules (how much is "too much") stay in rules.js (LOAD_RULES).

import { checkLoad, LOAD_RULES } from "../rules.js?v=202610252302";
import { calendarItems, racesNotPlanned } from "./plan.js?v=202610252302";

// monday              = the week shown
// sessions, activities = that week's planned sessions and logged activities
// previousActivities  = the activities of the LOAD_RULES.averageWeeks weeks before it
// races               = that week's races (registered / to register)
// Returns a list of texts (empty = nothing to say).
export function weekLoadNotes({ sessions, activities, previousActivities, races }) {
  const isRaceItem = (item) => item.session_type === "race";
  const items = calendarItems(sessions, activities).filter((item) => !isRaceItem(item));
  const seconds = activities.reduce((sum, a) => sum + (a.duration_s || 0), 0);
  const weeks = LOAD_RULES.averageWeeks;
  const usual = previousActivities.length ? {
    sessions: previousActivities.length / weeks,
    seconds: previousActivities.reduce((sum, a) => sum + (a.duration_s || 0), 0) / weeks,
  } : null;
  return checkLoad({ sessions: items.length, seconds, usual, race: raceOfWeek(items, sessions, races) });
}

// The first race of the week (on the planner or only in the Races tab), with
// how many sessions come before it that week. null when there's no race.
function raceOfWeek(items, sessions, races) {
  const fromPlan = sessions
    .filter((s) => s.race_id && s.session_type === "race" && s.status !== "cancelled")
    .map((s) => ({ name: s.title || "your race", date: s.session_date }));
  const fromRaces = racesNotPlanned(races, sessions).map((r) => ({ name: r.name, date: r.race_date }));
  const first = [...fromPlan, ...fromRaces].sort((a, b) => a.date.localeCompare(b.date))[0];
  if (!first) return null;
  return { name: first.name, sessionsBefore: items.filter((item) => item.date < first.date).length };
}
