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
  const { data: members, error } = await db
    .from("poulette_members")
    .select("id, display_name, role, household:poulette_households (id, name)")
    .eq("user_id", userId)
    .order("created_at")
    .limit(1);
  if (error) throw error;
  const member = members[0];
  if (!member) return null;

  const { data: babies, error: babyError } = await db
    .from("poulette_babies")
    .select("id, name, birth_date, birth_weight_g, birth_length_cm")
    .eq("household_id", member.household.id)
    .order("created_at");
  if (babyError) throw babyError;

  return { household: member.household, member, babies };
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
  if (/Aucun compte avec cet email/.test(text)) return "Aucun compte HQ avec cet email. Crée-le d'abord dans Supabase (Authentication → Users), puis réessaie.";
  if (/Pas membre de ce foyer/.test(text)) return "Seul un membre du foyer peut ajouter quelqu'un.";
  if (/check constraint/i.test(text)) return "Une valeur n'est pas acceptée (vérifie les chiffres).";
  return "Quelque chose n'a pas marché : " + text;
}
