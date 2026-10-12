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
// Later steps add more to this file: the default week, warnings, race
// routine, personal-best distances.


// How a session counts for the rules (e.g. "no two heavy-leg days in a row").
export const CATEGORIES = {
  heavy_legs: { label: "Heavy legs" },
  easy_run:   { label: "Easy run" },
  upper_body: { label: "Upper body" },
  rest:       { label: "Rest" },
  other:      { label: "Other" }, // counts as training, never triggers leg warnings
};

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
    key: "running", label: "Running", icon: "🏃",
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
    key: "football", label: "Football", icon: "⚽",
    fields: [], speed: null,
    sessionTypes: [
      { key: "team_training", label: "Team training", category: "heavy_legs" },
      { key: "match",         label: "Match",         category: "heavy_legs", matchCard: true },
      { key: "futsal",        label: "Futsal",        category: "other" },
    ],
  },
  {
    key: "muscle", label: "Muscle training", icon: "🏋️",
    fields: [], speed: null,
    sessionTypes: [
      { key: "explosivity",     label: "Leg explosivity",   category: "heavy_legs" },
      { key: "upper_body",      label: "Upper body + core", category: "upper_body" },
      { key: "morning_routine", label: "Morning routine",   category: "other" },
    ],
  },
  {
    key: "biking", label: "Biking", icon: "🚴",
    fields: ["distance", "elevation"], speed: "kmh",
    sessionTypes: [
      { key: "ride", label: "Ride", category: "other" },
    ],
  },
  {
    key: "swimming", label: "Swimming", icon: "🏊",
    fields: ["distance"], speed: "per_100m",
    sessionTypes: [
      { key: "swim", label: "Swim", category: "other" },
    ],
  },
  {
    key: "stairs", label: "Stair stepper", icon: "🪜",
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
  warnKm: 600,
  replaceKm: 700,
};

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
export function sportIcon(sportKey) {
  const sport = getSport(sportKey);
  return sport ? sport.icon : "•";
}
export function sessionTypeLabel(sportKey, typeKey) {
  const type = getSessionType(sportKey, typeKey);
  return type ? type.label : (typeKey || sportLabel(sportKey));
}
