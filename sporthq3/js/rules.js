// rules.js — the rulebook.
//
// Everything the app "knows" about training lives here as plain data:
// which sports exist, their session types, and how each type counts for
// the training rules. The screens read this file; they never hardcode it.
// To add a sport or rename a session type, change it here only.
//
// Keys (like "easy_run") are what gets saved in the database, so once you
// have data, change a label freely but don't rename a key.
//
// Later steps add more to this file: personal-best distances.

import { addDays } from "./utils/dates.js?v=202610211800";
import { icon } from "./utils/icons.js?v=202610211800";


// How a session counts for the rules (e.g. "no two heavy-leg days in a row").
export const CATEGORIES = {
  heavy_legs: { label: "Heavy legs" },
  easy_run:   { label: "Easy run" },
  upper_body: { label: "Upper body" },
  rest:       { label: "Rest" },
  other:      { label: "Other" }, // counts as training, never triggers leg warnings
};

// icon: the name of the sport's line icon in utils/icons.js (sportIcon() draws it).
// Which extra boxes the activity form shows for a sport:
//   distance  -> km          elevation -> D+ in metres
//   stairs    -> stairs climbed
//   shoe      -> which pair of shoes (see SHOE_RULES below)
// speed: how speed is shown — "per_km" (4:36 /km), "kmh" (28.5 km/h),
//        "per_100m" (1:52 /100m), or null (not shown)
// matchCard: true on a session type -> show opponent, minutes played, goals,
//            assists. "Minutes played" is then also used as the duration.
export const SPORTS = [
  {
    key: "running", label: "Running", icon: "footprints",
    fields: ["distance", "elevation", "shoe"], speed: "per_km",
    sessionTypes: [
      { key: "easy_run",        label: "Easy run (EF)",   category: "easy_run" },
      { key: "long_run",        label: "Long run",        category: "other" },
      { key: "intervals_short", label: "Short intervals", category: "heavy_legs" },
      { key: "intervals_long",  label: "Long intervals",  category: "heavy_legs" },
      { key: "intervals_hill",  label: "Hill intervals",  category: "heavy_legs" },
      { key: "trail",           label: "Trail",           category: "heavy_legs" },
      { key: "elevation",       label: "D+ session",      category: "heavy_legs" },
      { key: "race",            label: "Race",            category: "heavy_legs" },
    ],
  },
  {
    key: "football", label: "Football", icon: "football",
    fields: [], speed: null,
    sessionTypes: [
      { key: "team_training", label: "Team training", category: "heavy_legs" },
      { key: "match",         label: "Match",         category: "heavy_legs", matchCard: true },
      { key: "futsal",        label: "Futsal",        category: "other" },
    ],
  },
  {
    key: "muscle", label: "Muscle training", icon: "dumbbell",
    fields: [], speed: null,
    sessionTypes: [
      { key: "explosivity",     label: "Leg explosivity",   category: "heavy_legs" },
      { key: "upper_body",      label: "Upper body + core", category: "upper_body" },
      { key: "morning_routine", label: "Morning routine",   category: "other" },
    ],
  },
  {
    key: "biking", label: "Biking", icon: "bike",
    fields: ["distance", "elevation"], speed: "kmh",
    sessionTypes: [
      { key: "ride", label: "Ride", category: "other" },
    ],
  },
  {
    key: "swimming", label: "Swimming", icon: "waves",
    fields: ["distance"], speed: "per_100m",
    sessionTypes: [
      { key: "swim", label: "Swim", category: "other" },
    ],
  },
  {
    key: "stairs", label: "Stair stepper", icon: "stairs",
    fields: ["stairs"], speed: null,
    sessionTypes: [
      { key: "stairs", label: "Stairs", category: "other" },
    ],
  },
];

// RPE = "rate of perceived exertion": how hard it felt, 1 to 10.
export const RPE_LABELS = {
  1: "Very easy", 2: "Easy", 3: "Easy", 4: "Comfortable", 5: "Moderate",
  6: "Somewhat hard", 7: "Hard", 8: "Very hard", 9: "Extremely hard", 10: "Max effort",
};


// ---------- Shoes ----------
// Running shoes wear out with distance. warnKm = start warning, replaceKm = time for a new pair.
export const SHOE_RULES = {
  warnKm: 700,
  replaceKm: 800,
  // Which surface of shoe a new run suggests: these session types -> trail pair, any other -> road pair.
  trailSessionTypes: ["trail"],
};

// "trail" or "road": the kind of shoe a run of this session type needs.
export function shoeSurfaceFor(sessionType) {
  return SHOE_RULES.trailSessionTypes.includes(sessionType) ? "trail" : "road";
}

// "ok" | "warn" | "replace" for a pair that has done `km` kilometres.
export function shoeStatus(km) {
  if (km >= SHOE_RULES.replaceKm) return "replace";
  if (km >= SHOE_RULES.warnKm) return "warn";
  return "ok";
}

export const SHOE_SURFACES = {
  road:  { label: "Road" },
  trail: { label: "Trail" },
};


// ---------- Small lookup helpers ----------

export function getSport(sportKey) {
  return SPORTS.find((sport) => sport.key === sportKey) || null;
}

export function getSessionType(sportKey, typeKey) {
  const sport = getSport(sportKey);
  if (!sport) return null;
  return sport.sessionTypes.find((type) => type.key === typeKey) || null;
}

// Category of a session ("heavy_legs", …). Unknown types count as "other".
export function categoryOf(sportKey, typeKey) {
  const type = getSessionType(sportKey, typeKey);
  return type ? type.category : "other";
}

// Display helpers that never crash on old/unknown keys.
export function sportLabel(sportKey) {
  const sport = getSport(sportKey);
  return sport ? sport.label : sportKey;
}
// Returns the sport's line icon as <svg> markup (utils/icons.js); an unknown
// sport gets the fallback dot. Only for HTML: plain text (an <option>, a
// toast) shows the label alone.
export function sportIcon(sportKey) {
  const sport = getSport(sportKey);
  return icon(sport ? sport.icon : "");
}
export function sessionTypeLabel(sportKey, typeKey) {
  const type = getSessionType(sportKey, typeKey);
  return type ? type.label : (typeKey || sportLabel(sportKey));
}


// ---------- Training rules (warnings) ----------
// Each rule looks at everything that counts on the calendar and returns
// warnings. It never blocks or changes anything: it only warns.
//
// An "item" = one session that counts: { date: "2026-10-14", sport, session_type }
// (planned sessions that aren't cancelled, and logged activities).
// A warning = { rule, days: ["2026-10-13", "2026-10-14"], message, canMute }
// canMute: the rule is about your weekly habits, so you may say "this is my
// normal pattern, don't warn me" (Plan -> tap the warning). Race warnings are
// one-off, so they can't be muted.

// A race from the Races tab (not yet in the planner) carries its own name.
function itemLabel(item) {
  return item.title || sessionTypeLabel(item.sport, item.session_type);
}

function shortDay(iso) {
  return new Date(iso + "T12:00:00").toLocaleDateString("en-GB", { weekday: "short" });
}

const isHeavyLegs = (item) => categoryOf(item.sport, item.session_type) === "heavy_legs";
const isExplosivity = (item) => item.sport === "muscle" && item.session_type === "explosivity";
const isIntervals = (item) => item.sport === "running" && String(item.session_type).startsWith("intervals_");

const isRace = (item) => item.sport === "running" && item.session_type === "race";

export const TRAINING_RULES = [
  {
    key: "heavy_legs_back_to_back",
    label: "No heavy-leg sessions two days in a row",
    canMute: true,
    check(items) {
      const heavyByDay = groupByDay(items.filter(isHeavyLegs));
      const warnings = [];
      for (const day of Object.keys(heavyByDay).sort()) {
        const next = addDays(day, 1);
        if (!heavyByDay[next]) continue;
        warnings.push({
          rule: this.key,
          days: [day, next],
          message: `Heavy legs two days in a row: ${shortDay(day)} ${heavyByDay[day].map(itemLabel).join(" + ")}`
            + ` → ${shortDay(next)} ${heavyByDay[next].map(itemLabel).join(" + ")}`,
        });
      }
      return warnings;
    },
  },
  {
    key: "explosivity_and_intervals",
    label: "Leg explosivity or intervals, never both on the same day",
    canMute: true,
    check(items) {
      const byDay = groupByDay(items);
      return Object.keys(byDay).sort()
        .filter((day) => byDay[day].some(isExplosivity) && byDay[day].some(isIntervals))
        .map((day) => ({
          rule: this.key,
          days: [day],
          message: `Leg explosivity AND intervals on ${shortDay(day)}: pick one`,
        }));
    },
  },
  {
    key: "rest_before_race",
    label: "Full rest the day before a race",
    check(items) {
      const byDay = groupByDay(items);
      return Object.keys(byDay).sort()
        .filter((day) => byDay[day].some(isRace))
        .flatMap((day) => {
          const before = addDays(day, -1);
          const planned = byDay[before] || [];
          return planned.length ? [{
            rule: this.key,
            days: [before, day],
            message: `Rest the day before your race: ${planned.map(itemLabel).join(" + ")} on ${shortDay(before)}`,
          }] : [];
        });
    },
  },
  {
    key: "race_day_clash",
    label: "Nothing else on race day",
    check(items) {
      const byDay = groupByDay(items);
      return Object.keys(byDay).sort().flatMap((day) => {
        const races = byDay[day].filter(isRace);
        const others = byDay[day].filter((item) => !isRace(item));
        return races.length && others.length ? [{
          rule: this.key,
          days: [day],
          message: `${races.map(itemLabel).join(" + ")} on ${shortDay(day)}: ${others.map(itemLabel).join(" + ")} planned the same day`,
        }] : [];
      });
    },
  },
];

function groupByDay(items) {
  const byDay = {};
  for (const item of items) (byDay[item.date] = byDay[item.date] || []).push(item);
  return byDay;
}

// All warnings for a list of items, in date order.
// `muted` = warning texts you marked "my normal pattern": they come back
// with muted: true (shown greyed in the planner, never counted or popped up).
export function checkTrainingRules(items, muted = []) {
  return TRAINING_RULES
    .flatMap((rule) => rule.check(items).map((w) => ({
      ...w,
      canMute: Boolean(rule.canMute),
      muted: Boolean(rule.canMute) && muted.includes(w.message),
    })))
    .sort((a, b) => a.days[0].localeCompare(b.days[0]));
}


// ---------- Training load (hours and sessions per week) ----------
// Home (step 17d): in the last days before a race you're REGISTERED for,
// Home switches to "race mode": the race countdown on top, today's session
// under it. 21 = the last 3 weeks (race day itself included). A race still
// "to register" never switches it (Rom's choice, 2026-10-21).
export const HOME_RULES = {
  raceModeDays: 21,
};

// Is Home in race mode for this race today? (race = { race_date, status })
export function isRaceMode(race, today) {
  if (!race || race.status !== "registered" || !race.race_date || race.race_date < today) return false;
  const days = Math.round((Date.parse(race.race_date) - Date.parse(today)) / 86400000);
  return days <= HOME_RULES.raceModeDays;
}

// "Usual" = the average of the LOAD_RULES.averageWeeks full weeks before the week shown.
// Warn only, never block (same as the training rules).
export const LOAD_RULES = {
  averageWeeks: 4,
  minUsualSessions: 2,  // below this there's too little history to compare
  spikeRatio: 1.3,      // a week 30% above your usual = a big jump (risk of fatigue / injury)
  taperRatio: 0.7,      // race week: plan at most ~70% of your usual sessions before race day
};

// The load notes for one week (a list of texts, maybe empty).
//   sessions   = sessions in the week (planned not cancelled + logged extras), races not counted
//   seconds    = hours already logged this week (in seconds)
//   usual      = { sessions, seconds } per week on average (null when no history)
//   race       = { name, sessionsBefore } when a race is in this week, else null
//                (sessionsBefore = sessions in the week before race day)
export function checkLoad({ sessions, seconds, usual, race }) {
  if (!usual || usual.sessions < LOAD_RULES.minUsualSessions) return [];
  const notes = [];
  const usualCount = Math.round(usual.sessions);
  if (race) {
    const max = Math.max(1, Math.floor(usual.sessions * LOAD_RULES.taperRatio));
    if (race.sessionsBefore > max) {
      notes.push(`Race week: ${race.sessionsBefore} sessions before ${race.name} (usually ${usualCount} a week). `
        + `About ${max} or fewer help you arrive fresh.`);
    }
    return notes; // in race week, a "big jump" note would only repeat this
  }
  if (sessions > usual.sessions * LOAD_RULES.spikeRatio) {
    notes.push(`Big jump: ${sessions} sessions this week vs ${usualCount} usually. Watch out for fatigue.`);
  } else if (usual.seconds && seconds > usual.seconds * LOAD_RULES.spikeRatio) {
    const pct = Math.round((seconds / usual.seconds - 1) * 100);
    notes.push(`Big jump: already ${pct}% more hours than a usual week. Watch out for fatigue.`);
  }
  return notes;
}


// ---------- Races ----------

// The fixed list of race statuses (same keys as the database check).
export const RACE_STATUSES = {
  idea:        { label: "Idea" },
  potential:   { label: "Potential" },
  to_register: { label: "To register" },
  registered:  { label: "Registered" },
  finished:    { label: "Finished" },
  cancelled:   { label: "Cancelled" },
};

// Offered when a race has no checklist yet (each race gets its own copy).
export const STARTER_CHECKLIST = [
  "Bib + safety pins", "Race shoes", "Race outfit", "Watch charged", "Gels / nutrition",
  "Water bottle", "Headphones", "ID + race confirmation", "Change of clothes", "Recovery snack",
];

// The race routine: sessions added to the planner around a race.
// dayOffset: days from race day (-2 = two days before). The day before is
// full rest: no session, and the "rest_before_race" rule warns if anything
// is planned then. A planned match always wins over the activation jog.
export const RACE_ROUTINE = [
  { key: "activation_jog", dayOffset: -2, sport: "running", session_type: "easy_run", title: "Activation jog" },
  { key: "race_day",       dayOffset: 0,  sport: "running", session_type: "race",     title: null }, // title = race name
];


// ---------- Body & goals ----------

// Personal-best distances. A run counts for a distance when it is between
// that distance and maxRatio × it (10 → 10.5 km); its time is then scaled to
// the exact distance by its pace (shown with "≈"). Add a distance here and
// the app finds its PB by itself.
export const PB_DISTANCES = [
  { key: "5k",       label: "5k",            km: 5 },
  { key: "10k",      label: "10k",           km: 10 },
  { key: "half",     label: "Half marathon", km: 21.0975 },
  { key: "marathon", label: "Marathon",      km: 42.195 },
];
export const PB_RULES = { maxRatio: 1.05 };

// The weight trend line = average of the last N weigh-ins.
export const WEIGHT_TREND_POINTS = 4;

// Football season: 1 August -> 15 April (months 1-12). Outside the season,
// the dashboard shows the season that just ended.
export const FOOTBALL_SEASON = { start: { month: 8, day: 1 }, end: { month: 4, day: 15 } };

// ---------- Stats ----------
// monthlyRunTargetKm: the "Min" line of Sport HQ2's monthly mileage chart.
// streakMinSessions: a week counts in a streak with at least this many sessions.
export const STATS_RULES = { monthlyRunTargetKm: 80, streakMinSessions: 3 };
