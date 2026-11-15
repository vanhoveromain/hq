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
export const requireLogin = hq.requireLogin;
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
export async function getMyHousehold(userId) {
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
