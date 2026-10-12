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
