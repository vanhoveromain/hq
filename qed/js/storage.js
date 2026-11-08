// storage.js: the ONLY file that talks to the QED HQ database.
//
// Every other file asks this one for data ("give me the Tools links", "move
// open tasks to today"). If the database ever changes, only this file changes.
//
// Two logins are involved:
//   - the shared hq login (ownhq.app, hq-home/auth.js): who you are;
//   - QED HQ's own Supabase project (EU), where the QED data lives. The hq
//     login signs in to it with the same email + password.
// Both clients live in auth.js, loaded from ownhq.app (localhost: serve.py's
// /_hq/), so every hq site shares one login.

const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(window.location.hostname);
const AUTH_URL = ON_OWNHQ ? "https://ownhq.app/auth.js" : "/_hq/auth.js";

const hq = await import(AUTH_URL);
const db = hq.getQedSupabase();


// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

// Address of the hq login page that brings you back to `next`.
export const loginUrl = hq.loginUrl;

// callback(user) when you log in or out of hq, also from another hq site.
export const onAuthChange = hq.onAuthChange;

// Checks both logins. Not logged in to hq: off to the hq login page (and back
// here afterwards). Logged in to hq but not (or no longer) to the QED project:
// { locked: true }, and the app shows the Unlock screen.
export async function requireLogin() {
  const user = await hq.requireLogin();
  let qedUser = null;
  try {
    // getUser() asks the QED server, so an expired or revoked session counts
    // as "not signed in" instead of failing later on the first query.
    const { data } = await db.auth.getUser();
    qedUser = data ? data.user : null;
  } catch {
    qedUser = null;
  }
  if (qedUser && sameEmail(qedUser.email, user.email)) {
    return { user, locked: false };
  }
  if (qedUser) {
    // A QED session for another email (shouldn't happen): drop it.
    try { await db.auth.signOut(); } catch { /* local cookies cleared anyway */ }
  }
  return { user, locked: true };
}

// The Unlock screen: signs in to the QED project with your hq email.
export async function unlock(email, password) {
  await hq.signInToQed(email, password);
}

function sameEmail(a, b) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}


// ---------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------

// Safety net for the nightly rollover: moves every open task due before today
// (Brussels time) to today. The database also does it every hour; running it
// twice moves nothing. Returns how many tasks moved.
export async function runRollover() {
  const { data, error } = await db.rpc("qed_rollover_tasks");
  if (error) throw error;
  return data;
}


// ---------------------------------------------------------------------
// Projects (events, non-event projects, sales leads)
//
// Rows travel through the app with their database column names (date_start,
// sales_status…), so the code matches the table in Supabase.
// ---------------------------------------------------------------------

// The columns the app may write. Anything else on the object (id, user_id,
// created_at…) is ignored when saving.
const PROJECT_COLUMNS = [
  "name", "type", "status", "sales_status", "owner",
  "date_start", "date_end", "notes", "notion_url",
];
const PROJECT_FIELDS = "id, name, type, status, sales_status, owner, date_start, date_end, notes, notion_url, created_at";

function pick(object, keys) {
  const result = {};
  for (const key of keys) {
    if (key in object) result[key] = object[key];
  }
  return result;
}

// All projects (a few hundred at most: Home filters and sorts them itself).
export async function listProjects() {
  const { data, error } = await db.from("qed_projects").select(PROJECT_FIELDS);
  if (error) throw error;
  return data;
}

export async function createProject(project) {
  const { data, error } = await db
    .from("qed_projects")
    .insert(pick(project, PROJECT_COLUMNS))
    .select(PROJECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

export async function updateProject(id, changes) {
  const { data, error } = await db
    .from("qed_projects")
    .update(pick(changes, PROJECT_COLUMNS))
    .eq("id", id)
    .select(PROJECT_FIELDS)
    .single();
  if (error) throw error;
  return data;
}

// Its tasks stay (they just lose the link to the project).
export async function deleteProject(id) {
  const { error } = await db.from("qed_projects").delete().eq("id", id);
  if (error) throw error;
}


// ---------------------------------------------------------------------
// Tools links (Home)
// ---------------------------------------------------------------------

export async function listLinks() {
  const { data, error } = await db
    .from("qed_links")
    .select("id, label, url, sort_order")
    .order("sort_order")
    .order("label");
  if (error) throw error;
  return data;
}

export async function createLink({ label, url, sort_order }) {
  const { data, error } = await db
    .from("qed_links")
    .insert({ label, url, sort_order })
    .select("id, label, url, sort_order")
    .single();
  if (error) throw error;
  return data;
}

export async function updateLink(id, { label, url }) {
  const { error } = await db.from("qed_links").update({ label, url }).eq("id", id);
  if (error) throw error;
}

export async function deleteLink(id) {
  const { error } = await db.from("qed_links").delete().eq("id", id);
  if (error) throw error;
}

// Saves a new order: `ids` = every link, top to bottom.
export async function reorderLinks(ids) {
  const results = await Promise.all(
    ids.map((id, i) => db.from("qed_links").update({ sort_order: i + 1 }).eq("id", id)),
  );
  const failed = results.find((r) => r.error);
  if (failed) throw failed.error;
}
