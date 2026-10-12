// storage.js — the ONLY file that talks to Supabase.
//
// Every other file asks this one for data ("give me this week's sessions",
// "save this run"). That way, if we ever change database, only this file
// changes. Think of it as the one messenger allowed into the cupboard.

// supabase-js is loaded straight from a CDN, with an exact version number so
// it can never change under our feet.
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from "./config.js";

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
export async function listActivities({ limit = 30, offset = 0 } = {}) {
  const { data, error } = await supabase
    .from("activities")
    .select("*, match_stats(*)")
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
