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
