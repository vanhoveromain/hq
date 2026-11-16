// storage.js: the ONLY file that talks to the database.
//
// Poulette HQ's data lives in the shared "own-hq" Supabase project (tables
// poulette_*, see supabase/migrations/). The login is the shared hq login
// (hq-home/auth.js, loaded from ownhq.app; localhost: serve.py's /_hq/), so
// the own-hq client from auth.js is used as is.

import { HQ_BASE } from "./hqBase.js";

const hq = await import(HQ_BASE + "auth.js");
const db = hq.supabase;


// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

// The logged-in user, or off to the hq login page (and back here afterwards).
// Offline (step 0.5c): when the login can't be checked because there is no
// network (an expired token can't be renewed), the login saved on this device
// is trusted, so the app still opens at night without wifi. The database stays
// protected anyway: nothing can be read or written without a valid token.
export async function requireLogin() {
  let user = null;
  let unreachable = false;
  try {
    user = await hq.getUser();
  } catch {
    unreachable = true;
  }
  if (user) return user;
  const saved = savedLoginUser();
  if (saved && (unreachable || !navigator.onLine)) return saved;
  return hq.requireLogin();
}

// The user of the login saved in the shared hq cookies (hq-auth.0, .1...),
// read without any network. null if none.
function savedLoginUser() {
  try {
    const cookies = Object.fromEntries(document.cookie.split("; ").map((c) => {
      const i = c.indexOf("=");
      return [c.slice(0, i), c.slice(i + 1)];
    }));
    let joined = "";
    for (let i = 0; cookies[`hq-auth.${i}`] !== undefined; i++) joined += cookies[`hq-auth.${i}`];
    return joined ? JSON.parse(decodeURIComponent(joined)).user || null : null;
  } catch {
    return null;
  }
}
export const loginUrl = hq.loginUrl;
export const onAuthChange = hq.onAuthChange;

// Logs out of every hq site (shared cookies).
export async function signOut() {
  await hq.signOut();
}


// ---------------------------------------------------------------------
// Household (foyer)
// ---------------------------------------------------------------------

// Your household, your member row and its babies, or null when you belong to
// none yet (first start: step 0.6 creates it). Only one household is built;
// if there were several, the oldest membership wins.
// The last answer is kept on this device: without network, it is used instead
// ({ ...home, fromCache: true }), so the app opens offline. No cached answer
// and no network: the error is thrown (main.js shows "Réessayer").
const HOME_KEY = "poulette.home.";

export async function getMyHousehold(userId) {
  try {
    const home = await fetchHousehold(userId);
    try { localStorage.setItem(HOME_KEY + userId, JSON.stringify(home)); } catch { /* not important */ }
    return home;
  } catch (error) {
    let cached;
    try { cached = localStorage.getItem(HOME_KEY + userId); } catch { cached = null; }
    if (cached === null) throw error;
    const home = JSON.parse(cached);
    return home ? { ...home, fromCache: true } : null;
  }
}

async function fetchHousehold(userId) {
  const { data: mine, error } = await db
    .from("poulette_members")
    .select("id, display_name, role, household:poulette_households (id, name)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1);
  if (error) throw error;
  const member = mine[0];
  if (!member) return null;

  const { data: babies, error: babyError } = await db
    .from("poulette_babies")
    .select("id, name, birth_date, birth_weight_g, birth_length_cm")
    .eq("household_id", member.household.id)
    .order("created_at");
  if (babyError) throw babyError;

  const members = await listMembers(member.household.id);
  return { household: member.household, member, babies, members };
}

// Creates your household and makes you its first member (database function
// poulette_create_household), then adds the baby. Needs the network.
export async function createHousehold({ name, displayName, baby }) {
  const { data: householdId, error } = await db.rpc("poulette_create_household", {
    p_name: name,
    p_display_name: displayName,
  });
  if (error) throw error;
  // The household exists now: never let a baby problem make you create a
  // second one. The baby can be added again from Réglages → Bébé.
  try {
    await createBaby(householdId, baby);
  } catch (babyError) {
    console.warn("Baby not added:", babyError.message);
  }
  return householdId;
}

// Members of the household (Rom, Léa...), oldest first.
export async function listMembers(householdId) {
  const { data, error } = await db
    .from("poulette_members")
    .select("id, user_id, display_name, role, created_at")
    .eq("household_id", householdId)
    .order("created_at");
  if (error) throw error;
  return data;
}

// Adds an existing own-hq account to the household by its email (database
// function poulette_add_member: only members may add someone).
export async function addMember(householdId, email, displayName) {
  const { error } = await db.rpc("poulette_add_member", {
    p_household_id: householdId,
    p_email: email,
    p_display_name: displayName,
  });
  if (error) throw error;
}


// ---------------------------------------------------------------------
// Baby
// ---------------------------------------------------------------------

const BABY_FIELDS = ["name", "birth_date", "birth_weight_g", "birth_length_cm"];

function babyRow(fields) {
  const row = {};
  for (const key of BABY_FIELDS) if (key in fields) row[key] = fields[key] === "" ? null : fields[key];
  return row;
}

export async function createBaby(householdId, fields) {
  const { error } = await db.from("poulette_babies").insert({ household_id: householdId, ...babyRow(fields) });
  if (error) throw error;
}

export async function updateBaby(babyId, fields) {
  const { error } = await db.from("poulette_babies").update(babyRow(fields)).eq("id", babyId);
  if (error) throw error;
}

// Supabase's messages are technical (and in English): the common ones in French.
export function friendlyError(error) {
  const text = String((error && error.message) || error || "");
  if (/Failed to fetch|NetworkError|Load failed|offline/i.test(text)) return "Pas de réseau. Réessaie quand la connexion revient.";
  if (/Ligne introuvable/.test(text)) return "Cette saisie n'existe plus (supprimée sur l'autre téléphone ?).";
  if (/Aucun compte avec cet email/.test(text)) return "Aucun compte HQ avec cet email. Crée-le d'abord dans Supabase (Authentication → Users), puis réessaie.";
  if (/Pas membre de ce foyer/.test(text)) return "Seul un membre du foyer peut ajouter quelqu'un.";
  if (/check constraint/i.test(text)) return "Une valeur n'est pas acceptée (vérifie les chiffres).";
  return "Quelque chose n'a pas marché : " + text;
}


// ---------------------------------------------------------------------
// Events, measurements, questions (read). Writes go through store.js and
// its outbox (queue.js), then sendChange() below.
// ---------------------------------------------------------------------

const EVENT_FIELDS = "id, baby_id, type, started_at, ended_at, data, note, created_by, created_at, updated_at, deleted_at";

// Events of a baby that started in [fromIso, toIso), deleted ones included
// (the app hides them; needed so a deletion made on the other phone shows).
// Read 1000 at a time (the database answers at most 1000 rows per request).
export async function fetchEvents(babyId, fromIso, toIso) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    let query = db.from("poulette_events").select(EVENT_FIELDS).eq("baby_id", babyId).gte("started_at", fromIso);
    if (toIso) query = query.lt("started_at", toIso);
    const { data, error } = await query.order("started_at", { ascending: false }).range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Chronos still running, however old (a feed started before the window).
export async function fetchRunning(babyId) {
  const { data, error } = await db.from("poulette_events").select(EVENT_FIELDS)
    .eq("baby_id", babyId).is("ended_at", null).in("type", ["breastfeed", "sleep"]).is("deleted_at", null);
  if (error) throw error;
  return data;
}

// Every event of a type (for suggestions / report), lighter columns.
export async function fetchEventsOfType(babyId, type, limit = 200) {
  const { data, error } = await db.from("poulette_events").select(EVENT_FIELDS)
    .eq("baby_id", babyId).eq("type", type).is("deleted_at", null)
    .order("started_at", { ascending: false }).limit(limit);
  if (error) throw error;
  return data;
}

export async function fetchMeasurements(babyId) {
  const { data, error } = await db.from("poulette_measurements")
    .select("id, baby_id, measured_at, weight_g, length_cm, head_cm, source, created_by, created_at, updated_at")
    .eq("baby_id", babyId).order("measured_at", { ascending: false });
  if (error) throw error;
  return data;
}

export async function fetchQuestions(householdId) {
  const { data, error } = await db.from("poulette_questions")
    .select("id, household_id, baby_id, text, done_at, answer, created_by, created_at, updated_at")
    .eq("household_id", householdId).order("created_at", { ascending: false });
  if (error) throw error;
  return data;
}

// Paediatrician appointments (Phase 2). Until the migration has run, the
// table doesn't exist: answer "none" instead of breaking the app.
export async function fetchAppointments(babyId) {
  const { data, error } = await db.from("poulette_appointments")
    .select("id, baby_id, held_on, note, created_by, created_at, updated_at")
    .eq("baby_id", babyId).order("held_on", { ascending: false });
  if (error) {
    console.warn("Appointments not loaded (migration 20261116000001 not run yet?):", error.message);
    return [];
  }
  return data;
}

// Everything of a baby, for the export (Réglages).
export async function fetchAllEvents(babyId) {
  const out = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from("poulette_events").select(EVENT_FIELDS)
      .eq("baby_id", babyId).order("started_at").range(from, from + 999);
    if (error) throw error;
    out.push(...data);
    if (data.length < 1000) return out;
  }
}

// Sends one outbox item. Throws { permanent: true } when the database refuses
// it for good (rights, wrong value): it is then kept as "refusée", never lost.
export async function sendChange(item) {
  let result;
  if (item.kind === "insert") {
    result = await db.from(item.table).insert(item.row);
    // Already there (sent before, answer lost on the way): fine.
    if (result.error && result.error.code === "23505") return;
  } else if (item.kind === "update") {
    result = await db.from(item.table).update(item.patch).eq("id", item.id).select("id");
    if (!result.error && (!result.data || result.data.length === 0)) {
      throw Object.assign(new Error("Ligne introuvable (supprimée ou jamais enregistrée)"), { permanent: true });
    }
  } else if (item.kind === "delete") {
    result = await db.from(item.table).delete().eq("id", item.id);
  }
  if (result && result.error) {
    const error = result.error;
    const message = error.message || String(error);
    const network = !error.code || /Failed to fetch|NetworkError|Load failed|fetch/i.test(message);
    const tokenExpired = error.code === "PGRST301" || /JWT/i.test(message);
    throw Object.assign(new Error(message), { permanent: !network && !tokenExpired });
  }
}

// Live changes from the other phone (Supabase Realtime). onChange(table,
// eventType, newRow, oldRow). Returns a function that stops listening.
export function subscribeChanges(babyId, householdId, onChange, onStatus) {
  const channel = db.channel(`poulette-${babyId}`)
    .on("postgres_changes", { event: "*", schema: "public", table: "poulette_events", filter: `baby_id=eq.${babyId}` },
      (p) => onChange("poulette_events", p.eventType, p.new, p.old))
    .on("postgres_changes", { event: "*", schema: "public", table: "poulette_measurements", filter: `baby_id=eq.${babyId}` },
      (p) => onChange("poulette_measurements", p.eventType, p.new, p.old))
    .on("postgres_changes", { event: "*", schema: "public", table: "poulette_questions", filter: `household_id=eq.${householdId}` },
      (p) => onChange("poulette_questions", p.eventType, p.new, p.old))
    .on("postgres_changes", { event: "*", schema: "public", table: "poulette_appointments", filter: `baby_id=eq.${babyId}` },
      (p) => onChange("poulette_appointments", p.eventType, p.new, p.old))
    .subscribe((status) => onStatus && onStatus(status));
  return () => { db.removeChannel(channel); };
}
