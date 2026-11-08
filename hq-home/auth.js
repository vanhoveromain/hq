// auth.js: the one hq login, shared by every hq site.
//
// Served from https://ownhq.app/auth.js. Every hq site (ownhq.app,
// sport.ownhq.app, qed.ownhq.app…) imports this same file, so they all use the
// same Supabase client and the same login.
//
// How the login is shared: browsers keep localStorage per site, so a login
// saved there on ownhq.app is invisible to sport.ownhq.app. Instead, the
// session is kept in cookies set for the whole ownhq.app domain. Every
// *.ownhq.app site reads the same cookies: log in once, logged in everywhere.
// Log out anywhere, logged out everywhere.

// Exact version so it never changes under our feet (same as SportHQ3).
import { createClient } from "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm";

// Both PUBLIC by design (see sporthq3/js/config.js). Never put the secret /
// service_role key here.
const SUPABASE_URL = "https://cmctqoshvncnzxavghqf.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_PATtWKyTn8z2ree9fs53jg_3tps8MW4";

const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(window.location.hostname);

// The login page. While testing on your computer (localhost), SportHQ3's
// serve.py shows hq-home/ at /_hq/ on the same server, so the login is local too.
export const HOME_URL = ON_OWNHQ ? "https://ownhq.app/" : window.location.origin + "/_hq/";

// When a magic link fails, Supabase sends you back with the reason after "#".
// The client cleans the address as soon as it starts, so copy it first.
const hashAtStart = window.location.hash;


// ---------------------------------------------------------------------
// Cookie storage (shared by all *.ownhq.app sites)
// ---------------------------------------------------------------------

// On ownhq.app and its subdomains: share across all of them. Elsewhere
// (localhost while developing): a normal cookie for this site only.
const DOMAIN = ON_OWNHQ ? "; Domain=ownhq.app" : "";
const SECURE = window.location.protocol === "https:" ? "; Secure" : "";
const MAX_AGE = 60 * 60 * 24 * 400; // 400 days, the most browsers allow
// A cookie holds about 4 KB. A session can be bigger, so it is cut into
// numbered pieces: hq-auth.0, hq-auth.1…
const CHUNK = 3000;

function readCookies() {
  const cookies = {};
  for (const part of document.cookie.split("; ")) {
    const i = part.indexOf("=");
    if (i > 0) cookies[part.slice(0, i)] = part.slice(i + 1);
  }
  return cookies;
}

function writeCookie(name, value, maxAge) {
  document.cookie = `${name}=${value}; Path=/; Max-Age=${maxAge}; SameSite=Lax${DOMAIN}${SECURE}`;
}

const cookieStorage = {
  getItem(key) {
    const cookies = readCookies();
    let joined = "";
    for (let i = 0; cookies[`${key}.${i}`] !== undefined; i++) joined += cookies[`${key}.${i}`];
    if (!joined) return null;
    try { return decodeURIComponent(joined); } catch { return null; }
  },
  setItem(key, value) {
    const encoded = encodeURIComponent(value);
    const cookies = readCookies();
    let i = 0;
    for (; i * CHUNK < encoded.length; i++) {
      writeCookie(`${key}.${i}`, encoded.slice(i * CHUNK, (i + 1) * CHUNK), MAX_AGE);
    }
    // Remove leftover pieces from a longer, older session.
    for (; cookies[`${key}.${i}`] !== undefined; i++) writeCookie(`${key}.${i}`, "", 0);
  },
  removeItem(key) {
    const cookies = readCookies();
    for (let i = 0; cookies[`${key}.${i}`] !== undefined; i++) writeCookie(`${key}.${i}`, "", 0);
  },
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { storage: cookieStorage, storageKey: "hq-auth" },
});


// ---------------------------------------------------------------------
// QED HQ's own Supabase project (EU), since 2026-11-08
//
// QED client data lives in a separate project, with its own user list. The
// hq login signs in to it too, with the same email + password, and keeps
// that second session in its own cookies ("qed-auth"). Log out anywhere =
// logged out of both.
//
// The client is only created when something asks for it (QED HQ, a login,
// a logout), so the other HQs don't run a second connection for nothing.
// Both values are PUBLIC by design, like the ones above.
// ---------------------------------------------------------------------
const QED_SUPABASE_URL = "https://xcyhpkmlhsaomliujqyr.supabase.co";
const QED_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_6D8-PhSeWAr2GTsp705i0Q_EjVcOtJA";
const QED_STORAGE_KEY = "qed-auth";

let qedClient = null;

export function getQedSupabase() {
  if (!qedClient) {
    qedClient = createClient(QED_SUPABASE_URL, QED_SUPABASE_PUBLISHABLE_KEY, {
      auth: { storage: cookieStorage, storageKey: QED_STORAGE_KEY },
    });
  }
  return qedClient;
}

// Signs in to the QED project only (QED HQ's "Unlock" screen uses it after a
// magic-link login, which has no password to pass on).
export async function signInToQed(email, password) {
  const { error } = await getQedSupabase().auth.signInWithPassword({ email, password });
  if (error) throw error;
}

// Leaves the QED project. Never fails: the local cookies go in any case.
async function signOutOfQed() {
  try {
    await getQedSupabase().auth.signOut();
  } catch {
    // Server unreachable: still clear the local session below.
  }
  cookieStorage.removeItem(QED_STORAGE_KEY);
}


// ---------------------------------------------------------------------
// Login helpers
// ---------------------------------------------------------------------

// The logged-in user, or null. Awaiting getSession() also waits for a
// magic-link token in the address to be read.
export async function getUser() {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session ? data.session.user : null;
}

// For the sub-HQs: returns the user, or sends you to ownhq.app to log in and
// back here afterwards (the returned promise then never resolves).
export async function requireLogin() {
  let user = null;
  try { user = await getUser(); } catch { /* treat as logged out */ }
  if (user) return user;
  window.location.replace(loginUrl(window.location.href));
  return new Promise(() => {});
}

// Address of the login page that brings you back to `next` afterwards.
export function loginUrl(next) {
  return next ? `${HOME_URL}?next=${encodeURIComponent(next)}` : HOME_URL;
}

// Only ever send people back to an hq site, never anywhere else
// (otherwise ?next= could be abused to bounce people to a fake page).
export function safeNext(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const hqHost = /(^|\.)ownhq\.app$/.test(url.hostname);
    if (url.protocol === "https:" && hqHost) return url.href;
    // Testing on your computer: the same local server is fine too.
    if (!ON_OWNHQ && url.origin === window.location.origin) return url.href;
    return null;
  } catch {
    return null;
  }
}

// Reason a magic link failed, or "".
export function loginErrorFromUrl() {
  const params = new URLSearchParams(hashAtStart.replace(/^#/, ""));
  return params.get("error_description") || "";
}

// Signs in to the hq project AND (same email + password) to QED HQ's project.
// QED goes FIRST: the hq login triggers onAuthChange, which may send you on
// to another page straight away, so the QED cookies must already be there.
// A QED failure never blocks the hq login (QED HQ then asks once to unlock).
export async function signInWithPassword(email, password) {
  try {
    await signInToQed(email, password);
  } catch {
    // No QED account, or a different password: QED HQ will ask.
  }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    await signOutOfQed(); // wrong hq password: leave no half login behind
    throw error;
  }
}

// shouldCreateUser: false = only for accounts that already exist.
export async function sendMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      // Back to this same page, keeping ?next= so you land where you were going.
      emailRedirectTo: window.location.origin + window.location.pathname + window.location.search,
    },
  });
  if (error) throw error;
}

// Changes the hq password. If you're also signed in to QED HQ's project, its
// password follows, so both keep matching (best effort: if that part fails,
// QED HQ asks for the new password once).
export async function setPassword(password) {
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
  if (cookieStorage.getItem(QED_STORAGE_KEY)) {
    try {
      await getQedSupabase().auth.updateUser({ password });
    } catch {
      // QED HQ will ask to unlock with the new password.
    }
  }
}

export async function signOut() {
  await signOutOfQed();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

// callback(user) on every login / logout. Logouts on another hq site are
// picked up when you come back to this tab (cookies have no change event in
// every browser, so check on focus).
export function onAuthChange(callback) {
  let last;
  const report = (user) => {
    const id = user ? user.id : null;
    if (id === last) return;
    last = id;
    callback(user);
  };
  supabase.auth.onAuthStateChange((event, session) => {
    // Supabase advises no more Supabase work inside this listener.
    setTimeout(() => report(session ? session.user : null), 0);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState !== "visible") return;
    let user = null;
    try { user = JSON.parse(cookieStorage.getItem("hq-auth")).user || null; } catch { /* no session */ }
    report(user);
  });
}
