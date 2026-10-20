// storage.js — the ONLY file that talks to Supabase.
//
// Every other file asks this one for data ("give me this week's sessions",
// "save this run"). That way, if we ever change database, only this file
// changes. Think of it as the one messenger allowed into the cupboard.

// supabase-js is loaded straight from a CDN, with an exact version number so
// it can never change under our feet.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js?v=202610201000";

// When a magic link fails (expired, already used…), Supabase sends you back
// with the reason in the address (#error_description=…). The client below
// cleans the address as soon as it starts, so we copy it first.
const addressHashAtStart = window.location.hash;

const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);


// ---------------------------------------------------------------------
// Auth (logging in and out)
// ---------------------------------------------------------------------

// Returns the logged-in user, or null if nobody is logged in.
// When you arrive from a magic link, supabase-js first reads the login
// token from the URL; awaiting getSession() waits for that to finish.
export async function getCurrentUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ? data.session.user : null;
}

// Returns the reason a magic link failed, or "" if it didn't.
// (URLSearchParams also turns the "+" in the address back into spaces.)
export function getLoginErrorFromUrl() {
  const params = new URLSearchParams(addressHashAtStart.replace(/^#/, ""));
  return params.get("error_description") || "";
}

// Emails a magic link. shouldCreateUser: false means "only for people who
// already exist" — a second safety net on top of disabled sign-ups.
export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      // Come back to this same page after clicking the link.
      emailRedirectTo: window.location.origin + window.location.pathname,
    },
  });
  if (error) throw error;
}

// Logs in with email + password (works inside the iPhone home-screen app,
// which can't receive the magic link because links always open in Safari).
export async function signInWithPassword(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  // Success: onAuthChange (below) fires and main.js shows the app.
}

// Sets or changes the password of the logged-in user.
export async function setPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// Calls `callback(user)` whenever you log in or out (also in another tab).
export function onAuthChange(callback) {
  supabase.auth.onAuthStateChange((event, session) => {
    // setTimeout(…, 0) = "run this right after the current work is done".
    // Supabase advises not to do more Supabase work *inside* this listener,
    // because it can freeze; pushing it to the next tick avoids that.
    setTimeout(() => callback(session ? session.user : null), 0);
  });
}


// ---------------------------------------------------------------------
// Activities (+ the football "match card" stapled to a match)
//
// Rows travel through the app with their database column names
// (activity_date, duration_s…), so what you see in the code matches the
// table in Supabase. A loaded activity looks like:
//   { id, activity_date, sport, session_type, duration_s, distance_km,
//     elevation_m, stairs_climbed, rpe, notes, …, match_stats: {…} | null }
// ---------------------------------------------------------------------

// The columns we're allowed to write. Anything else on the object
// (id, user_id, created_at, match_stats) is ignored when saving.
const ACTIVITY_COLUMNS = [
  "activity_date", "sport", "session_type", "title", "duration_s",
  "distance_km", "elevation_m", "stairs_climbed", "rpe", "notes",
  "shoe_id", "race_id",
];
const MATCH_COLUMNS = ["opponent", "minutes_played", "goals", "assists"];

function pick(object, keys) {
  const result = {};
  for (const key of keys) {
    if (key in object) result[key] = object[key];
  }
  return result;
}

// Supabase returns a one-to-one link either as an object or as a list with
// one item, depending on how it reads the tables. Always give back object|null.
function withMatchStats(row) {
  const stats = Array.isArray(row.match_stats) ? row.match_stats[0] : row.match_stats;
  return { ...row, match_stats: stats || null };
}

// Newest first. `offset` skips rows already shown ("Load more").
// The select text "*, match_stats(*)" means: every column of the activity,
// plus every column of its match card if it has one.
// `sport` = a sport key to keep only that sport, or "all" / nothing for every sport.
export async function listActivities({ limit = 30, offset = 0, sport = "all" } = {}) {
  let query = supabase
    .from("activities")
    .select("*, match_stats(*)");
  // Filtered in the database (not in the browser), so each page is 30 sessions OF that sport.
  if (sport && sport !== "all") query = query.eq("sport", sport);
  const { data, error } = await query
    .order("activity_date", { ascending: false })
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;
  return data.map(withMatchStats);
}

export async function getActivity(id) {
  const { data, error } = await supabase
    .from("activities")
    .select("*, match_stats(*)")
    .eq("id", id)
    .maybeSingle(); // null instead of an error when it doesn't exist
  if (error) throw error;
  return data ? withMatchStats(data) : null;
}

// Creates (no id) or updates (with id) an activity, then its match card.
// `matchStats` = { opponent, minutes_played, goals, assists } or null.
// null removes an existing card (e.g. a "match" changed into "training").
//
// Note: these are two separate saves. If the second one fails, the activity
// is saved without its card; the error is shown and saving again fixes it.
export async function saveActivity(activity, matchStats) {
  const values = pick(activity, ACTIVITY_COLUMNS);

  const query = activity.id
    ? supabase.from("activities").update(values).eq("id", activity.id)
    : supabase.from("activities").insert(values);
  const { data: saved, error } = await query.select().single();
  if (error) throw error;

  if (matchStats) {
    // upsert = "insert, or update if a card for this activity already exists"
    const { error: statsError } = await supabase
      .from("match_stats")
      .upsert({ activity_id: saved.id, ...pick(matchStats, MATCH_COLUMNS) });
    if (statsError) throw statsError;
  } else {
    const { error: deleteError } = await supabase
      .from("match_stats").delete().eq("activity_id", saved.id);
    if (deleteError) throw deleteError;
  }
  return saved;
}

// The match card is deleted automatically with it (on delete cascade).
export async function deleteActivity(id) {
  const { error } = await supabase.from("activities").delete().eq("id", id);
  if (error) throw error;
}


// ---------------------------------------------------------------------
// Shoes
// A shoe row: { id, name, surface ("road"|"trail"|null), purchase_date,
//               retired (true/false), notes }
// Its km are not stored: they're added up from the runs linked to it,
// so they're always right (see getShoeDistances).
// ---------------------------------------------------------------------

const SHOE_COLUMNS = ["name", "surface", "purchase_date", "retired", "notes"];

// Pairs still in use first, then newest purchase first.
export async function listShoes() {
  const { data, error } = await supabase
    .from("shoes")
    .select("*")
    .order("retired", { ascending: true })
    .order("purchase_date", { ascending: false, nullsFirst: false })
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

// The shoes of your most recent runs, newest first (one id per run, so the
// same pair can appear many times). Read from the database, so every phone /
// browser suggests the same pair. 50 runs is plenty to find your last road
// pair AND your last trail pair.
export async function listRecentShoeIds() {
  const { data, error } = await supabase
    .from("activities")
    .select("shoe_id")
    .not("shoe_id", "is", null)
    .order("activity_date", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw error;
  return data.map((row) => row.shoe_id);
}

export async function getShoe(id) {
  const { data, error } = await supabase.from("shoes").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveShoe(shoe) {
  const values = pick(shoe, SHOE_COLUMNS);
  const query = shoe.id
    ? supabase.from("shoes").update(values).eq("id", shoe.id)
    : supabase.from("shoes").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Runs that used this pair keep existing; they just lose the link
// (the database sets their shoe_id to empty: "on delete set null").
export async function deleteShoe(id) {
  const { error } = await supabase.from("shoes").delete().eq("id", id);
  if (error) throw error;
}

// Returns { [shoeId]: { km, runs } } for every pair that has runs.
//
// Supabase sends at most 1,000 rows per request, so we ask page by page
// until a page comes back short. With a few hundred runs that's 1 request.
export async function getShoeDistances() {
  const PAGE = 1000;
  const totals = {};
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("activities")
      .select("shoe_id, distance_km")
      .not("shoe_id", "is", null)
      .order("id")                       // a fixed order so pages don't overlap
      .range(from, from + PAGE - 1);
    if (error) throw error;

    for (const row of data) {
      const total = totals[row.shoe_id] || (totals[row.shoe_id] = { km: 0, runs: 0 });
      total.km += Number(row.distance_km) || 0;
      total.runs += 1;
    }
    if (data.length < PAGE) break;
  }
  return totals;
}


// ---------------------------------------------------------------------
// Session catalogue ("recipe book")
// A recipe: { id, name, sport, session_type, description, rounds,
//             exercises: [{ name, sets, reps, weight_kg, note }],
//             target_duration_s, target_distance_km, archived }
// ---------------------------------------------------------------------

const TEMPLATE_COLUMNS = ["name", "sport", "session_type", "description", "rounds",
  "exercises", "target_duration_s", "target_distance_km", "archived"];

// All recipes, A→Z. Archived ones too (the screen decides what to show).
export async function listSessionTemplates() {
  const { data, error } = await supabase
    .from("session_templates")
    .select("*")
    .order("name", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getSessionTemplate(id) {
  const { data, error } = await supabase.from("session_templates").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

export async function saveSessionTemplate(template) {
  // updated_at is set here so we know when a recipe last changed.
  const values = { ...pick(template, TEMPLATE_COLUMNS), updated_at: new Date().toISOString() };
  const query = template.id
    ? supabase.from("session_templates").update(values).eq("id", template.id)
    : supabase.from("session_templates").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Planned sessions that used it keep existing; they just lose the link.
// (Week templates that used it lose that item.)
export async function deleteSessionTemplate(id) {
  const { error } = await supabase.from("session_templates").delete().eq("id", id);
  if (error) throw error;
}


// ---------------------------------------------------------------------
// Planner: planned sessions
// A planned session: { id, session_date, sport, session_type, title,
//   status ('planned'|'done'|'cancelled'), position, template_id,
//   activity_id, details (frozen when done), notes,
//   template: {…recipe…} | null, activity: {…} | null }
// ---------------------------------------------------------------------

const PLANNED_COLUMNS = ["session_date", "sport", "session_type", "title", "status", "source",
  "position", "template_id", "activity_id", "details", "notes", "race_id"];

// "template:session_templates(*)" = also bring the linked recipe, and call it
// `template` in the result. Same for the linked activity.
const PLANNED_SELECT = "*, template:session_templates(*), " +
  "activity:activities(id, activity_date, sport, session_type, title, duration_s, distance_km, rpe)";

// Every planned session between two days (inclusive), in day + position order.
export async function listPlannedSessions(fromDate, toDate) {
  const { data, error } = await supabase
    .from("planned_sessions")
    .select(PLANNED_SELECT)
    .gte("session_date", fromDate)
    .lte("session_date", toDate)
    .order("session_date", { ascending: true })
    .order("position", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function getPlannedSession(id) {
  const { data, error } = await supabase.from("planned_sessions").select(PLANNED_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// Activities between two days, light version (for "what did I really do").
export async function listActivitiesBetween(fromDate, toDate) {
  const { data, error } = await supabase
    .from("activities")
    .select("id, activity_date, sport, session_type, title, duration_s, distance_km, elevation_m, rpe")
    .gte("activity_date", fromDate)
    .lte("activity_date", toDate)
    .order("activity_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;
  return data;
}

export async function createPlannedSession(session) {
  const { data, error } = await supabase
    .from("planned_sessions").insert(pick(session, PLANNED_COLUMNS)).select().single();
  if (error) throw error;
  return data;
}

export async function updatePlannedSession(id, changes) {
  const { data, error } = await supabase
    .from("planned_sessions").update(pick(changes, PLANNED_COLUMNS)).eq("id", id).select().single();
  if (error) throw error;
  return data;
}

export async function deletePlannedSession(id) {
  const { error } = await supabase.from("planned_sessions").delete().eq("id", id);
  if (error) throw error;
}

// Open (not done, not cancelled) sessions on a day for one sport:
// used to link a freshly logged activity to its planned session.
export async function findOpenPlannedSessions(date, sport) {
  const { data, error } = await supabase
    .from("planned_sessions")
    .select(PLANNED_SELECT)
    .eq("session_date", date)
    .eq("sport", sport)
    .eq("status", "planned")
    .order("position", { ascending: true });
  if (error) throw error;
  return data;
}

// The planned sessions ticked "done" with this activity (usually 0 or 1).
// Used to keep the plan right when the activity is moved to another day or deleted.
export async function findSessionsLinkedTo(activityId) {
  const { data, error } = await supabase
    .from("planned_sessions")
    .select(PLANNED_SELECT)
    .eq("activity_id", activityId);
  if (error) throw error;
  return data;
}

// Copies every session of one week into another, as fresh "planned" sessions
// (no link to activities, no frozen details; a custom session keeps its own
// content, without the ticked counts). Returns how many were copied.
function customCopy(details) {
  return { ...details, exercises: (details.exercises || []).map(({ done_sets, total_sets, ...line }) => line) };
}

export async function copyWeek(fromMonday, toMonday, addDays) {
  // Race-routine sessions belong to their race (date), so they're not copied.
  const sessions = (await listPlannedSessions(fromMonday, addDays(fromMonday, 6))).filter((s) => !s.race_id);
  if (!sessions.length) return 0;
  const shift = (date) => {
    // same weekday, other week: count the days from Monday and add them to the target Monday
    const offset = Math.round((Date.parse(date) - Date.parse(fromMonday)) / 86400000);
    return addDays(toMonday, offset);
  };
  const copies = sessions.map((s) => ({
    session_date: shift(s.session_date), sport: s.sport, session_type: s.session_type,
    title: s.title, template_id: s.template_id, position: s.position, notes: s.notes,
    details: !s.template_id && s.details && s.details.custom ? customCopy(s.details) : null,
    status: "planned", source: "manual",
  }));
  const { error } = await supabase.from("planned_sessions").insert(copies);
  if (error) throw error;
  return copies.length;
}


// ---------------------------------------------------------------------
// Week templates: a saved week ("Normal week", "Race week").
// A template: { id, name, position, items: [ { weekday 1-7, template_id,
//   sport, session_type, position, template: {…recipe…} | null } ] }
// ---------------------------------------------------------------------

const WEEK_TEMPLATE_SELECT = "*, items:week_template_items(*, " +
  "template:session_templates(id, name, sport, session_type, archived))";

// Items come back sorted by day, then by their place in the day.
function sortItems(weekTemplate) {
  weekTemplate.items.sort((a, b) => a.weekday - b.weekday || a.position - b.position);
  return weekTemplate;
}

export async function listWeekTemplates() {
  const { data, error } = await supabase
    .from("week_templates")
    .select(WEEK_TEMPLATE_SELECT)
    .order("position", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return data.map(sortItems);
}

// Saves a week as a template. `items` = [{ weekday, template_id, sport, session_type, position }].
// With `replaceId`, the old template keeps its id but its content is replaced.
// Note: this takes 2-3 separate requests; if the internet drops halfway, the
// template can end up half-saved. Saving it again fixes it.
export async function saveWeekTemplate(name, items, replaceId = null) {
  let id = replaceId;
  if (id) {
    const { error: renameError } = await supabase.from("week_templates").update({ name }).eq("id", id);
    if (renameError) throw renameError;
    const { error: clearError } = await supabase.from("week_template_items").delete().eq("week_template_id", id);
    if (clearError) throw clearError;
  } else {
    const { data, error } = await supabase.from("week_templates").insert({ name }).select().single();
    if (error) throw error;
    id = data.id;
  }
  if (items.length) {
    const rows = items.map((item) => ({ ...pick(item, ["weekday", "template_id", "sport", "session_type", "position"]), week_template_id: id }));
    const { error } = await supabase.from("week_template_items").insert(rows);
    if (error) throw error;
  }
  return id;
}

export async function renameWeekTemplate(id, name) {
  const { error } = await supabase.from("week_templates").update({ name }).eq("id", id);
  if (error) throw error;
}

// Its items are removed with it (on delete cascade). Planned sessions are not touched.
export async function deleteWeekTemplate(id) {
  const { error } = await supabase.from("week_templates").delete().eq("id", id);
  if (error) throw error;
}

// Puts a template's sessions into the week starting `monday`, after the
// sessions already planned each day. `existing` = sessions already in that week.
export async function applyWeekTemplate(weekTemplate, monday, addDays, existing = []) {
  const perDay = {};
  existing.forEach((s) => { perDay[s.session_date] = (perDay[s.session_date] || 0) + 1; });
  const rows = weekTemplate.items.map((item) => {
    const date = addDays(monday, item.weekday - 1);
    const position = perDay[date] || 0;
    perDay[date] = position + 1;
    return {
      session_date: date, template_id: item.template_id,
      sport: item.sport || (item.template && item.template.sport) || null,
      session_type: item.session_type ?? (item.template ? item.template.session_type : null),
      position, status: "planned", source: "template",
    };
  });
  if (!rows.length) return 0;
  const { error } = await supabase.from("planned_sessions").insert(rows);
  if (error) throw error;
  return rows.length;
}


// ---------------------------------------------------------------------
// Races + their checklist
// A race: { id, name, race_date (or null = idea), location, distance_km,
//   elevation_m, status, goal_time_s, result_time_s, training_block_id,
//   notes, block: { id, name } | null }
// ---------------------------------------------------------------------

const RACE_COLUMNS = ["name", "race_date", "location", "distance_km", "elevation_m", "status",
  "goal_time_s", "result_time_s", "training_block_id", "notes"];

export async function listRaces() {
  const { data, error } = await supabase
    .from("races")
    .select("*, block:training_blocks(id, name), checklist:race_checklist_items(done)")
    .order("race_date", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data;
}

// One race with its checklist (in order).
export async function getRace(id) {
  const { data, error } = await supabase
    .from("races")
    .select("*, block:training_blocks(id, name), checklist:race_checklist_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (data) data.checklist.sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));
  return data;
}

export async function saveRace(race) {
  const values = pick(race, RACE_COLUMNS);
  const query = race.id
    ? supabase.from("races").update(values).eq("id", race.id)
    : supabase.from("races").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Its checklist and its race-routine sessions in the planner go with it
// (on delete cascade).
export async function deleteRace(id) {
  const { error } = await supabase.from("races").delete().eq("id", id);
  if (error) throw error;
}


// ---------------------------------------------------------------------
// Training blocks: { id, name, start_date, end_date, goal, recap,
//   races: [ { id, name, race_date, status, result_time_s, distance_km } ] }
// ---------------------------------------------------------------------

const BLOCK_COLUMNS = ["name", "start_date", "end_date", "goal", "recap"];
const BLOCK_SELECT = "*, races(id, name, race_date, status, result_time_s, goal_time_s, distance_km)";

// Races you're going to (registered or to register) between two days,
// for the planner and the rules. Ideas and potential races aren't shown.
export async function listRacesBetween(fromDate, toDate) {
  const { data, error } = await supabase
    .from("races")
    .select("id, name, race_date, status, distance_km")
    .gte("race_date", fromDate)
    .lte("race_date", toDate)
    .in("status", ["to_register", "registered"])
    .order("race_date", { ascending: true });
  if (error) throw error;
  return data;
}

// All blocks, newest first (also used by the block picker on a race).
export async function listTrainingBlocks() {
  const { data, error } = await supabase
    .from("training_blocks")
    .select(BLOCK_SELECT)
    .order("start_date", { ascending: false });
  if (error) throw error;
  return data;
}

export async function getTrainingBlock(id) {
  const { data, error } = await supabase.from("training_blocks").select(BLOCK_SELECT).eq("id", id).maybeSingle();
  if (error) throw error;
  return data;
}

// The block that contains this day, or null.
export async function findBlockOn(date) {
  const { data, error } = await supabase
    .from("training_blocks")
    .select("id, name, start_date, end_date")
    .lte("start_date", date)
    .gte("end_date", date)
    .order("start_date", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0] || null;
}

export async function saveTrainingBlock(block) {
  const values = pick(block, BLOCK_COLUMNS);
  const query = block.id
    ? supabase.from("training_blocks").update(values).eq("id", block.id)
    : supabase.from("training_blocks").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

// Its races stay; they just lose the link (on delete set null).
export async function deleteTrainingBlock(id) {
  const { error } = await supabase.from("training_blocks").delete().eq("id", id);
  if (error) throw error;
}

// Adds lines at the end of a race's checklist.
export async function addChecklistItems(raceId, labels, startPosition = 0) {
  if (!labels.length) return [];
  const rows = labels.map((label, i) => ({ race_id: raceId, label, position: startPosition + i }));
  const { data, error } = await supabase.from("race_checklist_items").insert(rows).select();
  if (error) throw error;
  return data;
}

export async function updateChecklistItem(id, changes) {
  const { error } = await supabase.from("race_checklist_items").update(pick(changes, ["label", "done", "position"])).eq("id", id);
  if (error) throw error;
}

export async function deleteChecklistItem(id) {
  const { error } = await supabase.from("race_checklist_items").delete().eq("id", id);
  if (error) throw error;
}

// The checklist of the most recent OTHER race that has one (to copy it).
// Returns { raceName, labels } or null.
export async function findLastChecklist(excludeRaceId) {
  const { data, error } = await supabase
    .from("race_checklist_items")
    .select("label, position, race_id, race:races(name)")
    .neq("race_id", excludeRaceId)
    .order("created_at", { ascending: false })
    .limit(200);
  if (error) throw error;
  if (!data.length) return null;
  const raceId = data[0].race_id;
  const items = data.filter((item) => item.race_id === raceId).sort((a, b) => a.position - b.position);
  return { raceName: data[0].race ? data[0].race.name : "", labels: items.map((item) => item.label) };
}

// The planner sessions created by a race's routine (race day, activation jog).
export async function listRaceSessions(raceId) {
  const { data, error } = await supabase
    .from("planned_sessions")
    .select(PLANNED_SELECT)
    .eq("race_id", raceId)
    .order("session_date", { ascending: true });
  if (error) throw error;
  return data;
}


// ---------------------------------------------------------------------
// Body & goals: weigh-ins, weight goal (settings), personal bests
// ---------------------------------------------------------------------

// All weigh-ins, oldest first (the chart reads them left to right).
export async function listWeighIns() {
  const { data, error } = await supabase
    .from("weigh_ins")
    .select("id, weigh_date, weight_kg, notes")
    .order("weigh_date", { ascending: true });
  if (error) throw error;
  return data;
}

// Max one weigh-in per day: saving a second one on the same day replaces it
// ("upsert" = insert, or update if that day already exists).
export async function saveWeighIn({ weigh_date, weight_kg, notes = null }) {
  const user = await getCurrentUser();
  const { data, error } = await supabase
    .from("weigh_ins")
    .upsert({ user_id: user.id, weigh_date, weight_kg, notes }, { onConflict: "user_id,weigh_date" })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteWeighIn(id) {
  const { error } = await supabase.from("weigh_ins").delete().eq("id", id);
  if (error) throw error;
}

// Your settings row (start + target weight), or an empty one.
export async function getSettings() {
  const { data, error } = await supabase.from("settings").select("*").maybeSingle();
  if (error) throw error;
  return data || {};
}

// Warnings you marked "this is my normal pattern" (a list of warning texts).
// [] when there are none, or before the 2026-10-20 migration added the column.
export async function getMutedWarnings() {
  const settings = await getSettings();
  return Array.isArray(settings.muted_warnings) ? settings.muted_warnings : [];
}

export async function saveMutedWarnings(list) {
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, muted_warnings: list }, { onConflict: "user_id" });
  if (error) throw error;
}

export async function saveWeightGoal({ start_weight_kg, target_weight_kg }) {
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("settings")
    .upsert({ user_id: user.id, start_weight_kg, target_weight_kg }, { onConflict: "user_id" });
  if (error) throw error;
}

// Every run with a distance and a time (for the automatic personal bests).
export async function listRunsWithTimes() {
  const PAGE = 1000;
  const runs = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("activities")
      .select("id, activity_date, title, session_type, distance_km, duration_s")
      .eq("sport", "running")
      .not("distance_km", "is", null)
      .not("duration_s", "is", null)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    runs.push(...data);
    if (data.length < PAGE) break;
  }
  return runs;
}

// Records you typed in yourself (e.g. an old 10k from before the app).
export async function listPersonalBests() {
  const { data, error } = await supabase.from("personal_bests").select("*").order("distance_km");
  if (error) throw error;
  return data;
}

export async function savePersonalBest(pb) {
  const values = pick(pb, ["label", "distance_km", "time_s", "achieved_on", "notes"]);
  const query = pb.id
    ? supabase.from("personal_bests").update(values).eq("id", pb.id)
    : supabase.from("personal_bests").insert(values);
  const { data, error } = await query.select().single();
  if (error) throw error;
  return data;
}

export async function deletePersonalBest(id) {
  const { error } = await supabase.from("personal_bests").delete().eq("id", id);
  if (error) throw error;
}


// ---------------------------------------------------------------------
// Dashboard helpers
// ---------------------------------------------------------------------

// Football matches between two days, with their match card (or null).
export async function listMatchesBetween(fromDate, toDate) {
  const { data, error } = await supabase
    .from("activities")
    .select("id, activity_date, match_stats(minutes_played, goals, assists)")
    .eq("sport", "football")
    .eq("session_type", "match")
    .gte("activity_date", fromDate)
    .lte("activity_date", toDate);
  if (error) throw error;
  return data.map(withMatchStats);
}


// ---------------------------------------------------------------------
// Weekly review: a note per week, stored on planned_weeks (one row per Monday).
// A review: { week_start, review_notes, reviewed_at }
// ---------------------------------------------------------------------

export async function getWeekReview(monday) {
  const { data, error } = await supabase
    .from("planned_weeks").select("week_start, review_notes, reviewed_at").eq("week_start", monday).maybeSingle();
  if (error) throw error;
  return data;
}

// Reviews of the weeks starting between two Mondays (inclusive), oldest first.
export async function listWeekReviews(fromMonday, toMonday) {
  const { data, error } = await supabase
    .from("planned_weeks")
    .select("week_start, review_notes, reviewed_at")
    .gte("week_start", fromMonday)
    .lte("week_start", toMonday)
    .not("reviewed_at", "is", null)
    .order("week_start", { ascending: true });
  if (error) throw error;
  return data;
}

// upsert: the week's row may not exist yet.
export async function saveWeekReview(monday, notes) {
  const user = await getCurrentUser();
  const { error } = await supabase
    .from("planned_weeks")
    .upsert({ user_id: user.id, week_start: monday, review_notes: notes || null, reviewed_at: new Date().toISOString() },
      { onConflict: "user_id,week_start" });
  if (error) throw error;
}


// ---------------------------------------------------------------------
// Export: every table, every row of yours, in one object (JSON backup).
// ---------------------------------------------------------------------

// Table name -> the column that orders it (its primary key), so the pages
// of 1000 rows never overlap.
const EXPORT_TABLES = {
  settings: "user_id", shoes: "id", training_blocks: "id", races: "id", race_checklist_items: "id",
  activities: "id", match_stats: "activity_id", session_templates: "id", week_templates: "id",
  week_template_items: "id", planned_weeks: "week_start", planned_sessions: "id", weigh_ins: "id", personal_bests: "id",
};

export async function exportAllData() {
  const PAGE = 1000;
  const tables = {};
  for (const [table, key] of Object.entries(EXPORT_TABLES)) {
    tables[table] = [];
    for (let from = 0; ; from += PAGE) {
      const { data, error } = await supabase.from(table).select("*").order(key).range(from, from + PAGE - 1);
      if (error) throw new Error(`${table}: ${error.message}`);
      tables[table].push(...data);
      if (data.length < PAGE) break;
    }
  }
  return tables;
}


// ---------------------------------------------------------------------
// Stats: everything between two days, paged by 1000 (all-time can be big)
// ---------------------------------------------------------------------

async function selectAllBetween(table, columns, dateColumn, fromDate, toDate) {
  const PAGE = 1000;
  const rows = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from(table)
      .select(columns)
      .gte(dateColumn, fromDate)
      .lte(dateColumn, toDate)
      .order("id")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...data);
    if (data.length < PAGE) break;
  }
  return rows;
}

// Activities with their match card (for goals / assists / minutes).
export async function listActivitiesForStats(fromDate, toDate) {
  const rows = await selectAllBetween("activities",
    "id, activity_date, sport, session_type, title, duration_s, distance_km, elevation_m, rpe, match_stats(minutes_played, goals, assists)",
    "activity_date", fromDate, toDate);
  return rows.map(withMatchStats);
}

// Planned sessions (for "plan vs done").
export async function listPlannedForStats(fromDate, toDate) {
  return selectAllBetween("planned_sessions", "id, session_date, sport, status", "session_date", fromDate, toDate);
}
