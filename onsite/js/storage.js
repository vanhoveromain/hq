// storage.js: the ONLY file that talks to the database (QED HQ's Supabase
// project, tables onsite_*). Screens never import supabase-js.
//
// OFFLINE FIRST (venue Wi-Fi is unreliable):
//   - Everything you can see lives in a copy on this device (localStorage,
//     one copy per account). Screens read that copy, so they work offline.
//   - Every change is made on the copy at once, and also written in an
//     "outbox". The outbox is sent to the database as soon as there is a
//     connection (on open, when the network comes back, every 20 s while
//     something waits, and when you come back to the app).
//   - Rows get their id here (crypto.randomUUID), so a line added offline
//     keeps the same id once it reaches the database: no duplicates.
//   - After sending, the app downloads everything again (it's small) so the
//     copy matches the database.
//   - Single user for now: last change wins.
//
// Login: the shared hq login (ownhq.app/auth.js) + the QED project session,
// like QED HQ. Offline, the app opens with the last account that logged in on
// this device and its copy (nothing is asked from the network).

import { HQ_BASE } from "./hqBase.js";

const hq = await import(HQ_BASE + "auth.js");
const db = hq.getQedSupabase();

// Our names -> database tables, and the columns the app may write.
export const TABLES = {
  events:    { table: "onsite_events",     cols: ["name", "venue", "address", "rooms", "project_id", "is_template", "notes", "archived_at"] },
  days:      { table: "onsite_days",       cols: ["event_id", "day", "kind", "label"] },
  ros:       { table: "onsite_ros_items",  cols: ["event_id", "day_id", "kind", "start_time", "end_time", "title", "owner", "room", "notes", "position", "done_at", "speakers", "moderators"] },
  materials: { table: "onsite_materials",  cols: ["name", "category", "default_qty", "note", "position", "archived_at"] },
  pack:      { table: "onsite_pack_items", cols: ["event_id", "material_id", "name", "category", "qty", "note", "position", "packed_at", "returned_at"] },
};
const KINDS = Object.keys(TABLES);

// Children removed with their parent (the database does the same: cascade).
const CHILDREN = { events: [["days", "event_id"], ["ros", "event_id"], ["pack", "event_id"]], days: [["ros", "day_id"]] };


// ---------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------

const LAST_USER_KEY = "onsite.lastUser";

export const loginUrl = hq.loginUrl;

// { user, locked, offline }
//   locked:  logged in to hq but not to the QED project -> Unlock screen
//   offline: no network; user = the last account seen on this device
export async function requireLogin() {
  if (navigator.onLine === false) return offlineLogin();
  let user;
  try {
    user = await withTimeout(hq.requireLogin(), 8000);
  } catch {
    return offlineLogin();
  }
  let qedUser = null;
  try {
    const { data, error } = await withTimeout(db.auth.getUser(), 8000);
    if (error && isNetworkError(error)) return offlineLogin(user);
    qedUser = data ? data.user : null;
  } catch {
    return offlineLogin(user);
  }
  if (qedUser && sameEmail(qedUser.email, user.email)) {
    rememberUser(qedUser);
    return { user: qedUser, locked: false, offline: false };
  }
  if (qedUser) {
    try { await db.auth.signOut(); } catch { /* local cookies cleared anyway */ }
  }
  return { user, locked: true, offline: false };
}

function offlineLogin(fallbackUser) {
  const last = readJson(LAST_USER_KEY);
  if (last && last.id) return { user: last, locked: false, offline: true };
  if (fallbackUser) return { user: fallbackUser, locked: true, offline: true };
  throw new Error("No connection, and Onsite HQ has never been opened on this device. Open it once with a connection first.");
}

function rememberUser(user) {
  writeJson(LAST_USER_KEY, { id: user.id, email: user.email });
}

export async function unlock(email, password) {
  await hq.signInToQed(email, password);
}

// Logged out on another hq site. Offline we can't know: keep going.
export function onAuthChange(callback) {
  hq.onAuthChange((user) => {
    if (!user && navigator.onLine === false) return;
    callback(user);
  });
}

function sameEmail(a, b) {
  return (a || "").trim().toLowerCase() === (b || "").trim().toLowerCase();
}


// ---------------------------------------------------------------------
// The copy on this device
// ---------------------------------------------------------------------

let userId = null;
let data = emptyData();   // { events: {id: row}, days: {...}, ... }
let outbox = [];          // [{ opId, kind, op: "insert"|"update"|"delete", id, row }]
let pulledAt = null;      // last full download (ISO), null = never

function emptyData() {
  return Object.fromEntries(KINDS.map((k) => [k, {}]));
}
const dataKey = () => `onsite.data.${userId}`;
const outboxKey = () => `onsite.outbox.${userId}`;

// Called once the user is known (main.js). Loads this account's copy.
export function openStore(user) {
  userId = user.id;
  const saved = readJson(dataKey());
  data = emptyData();
  if (saved && saved.data) for (const k of KINDS) data[k] = saved.data[k] || {};
  pulledAt = saved ? saved.pulledAt || null : null;
  outbox = readJson(outboxKey()) || [];
  wireSync();
  sync();
}

function persist() {
  writeJson(dataKey(), { data, pulledAt });
  writeJson(outboxKey(), outbox);
}

// Read helpers (screens). Rows are copies: change them through save().
export function list(kind, filter) {
  const rows = Object.values(data[kind]).map((r) => ({ ...r }));
  return filter ? rows.filter(filter) : rows;
}
export function get(kind, id) {
  const row = data[kind][id];
  return row ? { ...row } : null;
}
export function hasEverSynced() {
  return Boolean(pulledAt);
}


// ---------------------------------------------------------------------
// Changes (made on the copy at once, sent later)
// ---------------------------------------------------------------------

// New row: returns it with its id. `row` holds only writable columns.
export function create(kind, row) {
  const now = new Date().toISOString();
  const clean = pick(row, TABLES[kind].cols);
  const full = { ...clean, id: crypto.randomUUID(), created_at: now, updated_at: now };
  data[kind][full.id] = full;
  enqueue({ kind, op: "insert", id: full.id, row: { id: full.id, ...clean } });
  changed();
  return { ...full };
}

// Change some fields of a row. Returns the previous values (for Undo).
export function update(kind, id, changes) {
  const row = data[kind][id];
  if (!row) return null;
  const clean = pick(changes, TABLES[kind].cols);
  const before = pick(row, Object.keys(clean));
  data[kind][id] = { ...row, ...clean, updated_at: new Date().toISOString() };
  enqueue({ kind, op: "update", id, row: clean });
  changed();
  return before;
}

// Delete a row (and its children). Returns what was removed, for Undo.
export function remove(kind, id) {
  if (!data[kind][id]) return [];
  const removed = [];
  const collect = (k, rowId) => {
    const row = data[k][rowId];
    if (!row) return;
    removed.push({ kind: k, row: { ...row } });
    for (const [childKind, field] of CHILDREN[k] || []) {
      for (const child of Object.values(data[childKind])) {
        if (child[field] === rowId) collect(childKind, child.id);
      }
    }
  };
  collect(kind, id);
  for (const { kind: k, row } of removed) delete data[k][row.id];
  // Children go with the parent in the database (cascade): drop their own
  // waiting changes, then send one delete for the parent.
  const gone = new Set(removed.map((r) => r.row.id));
  outbox = outbox.filter((o) => o.opId === inFlight || !(gone.has(o.id) && o.id !== id));
  enqueue({ kind, op: "delete", id });
  changed();
  return removed;
}

// Undo of a delete: puts the rows back (parents first, same ids).
export function restore(removed) {
  for (const { kind, row } of removed) {
    data[kind][row.id] = { ...row };
    enqueue({ kind, op: "insert", id: row.id, row: { id: row.id, ...pick(row, TABLES[kind].cols) } });
  }
  changed();
}

// Several changes as one (e.g. a new event + its days): one redraw.
export function batch(fn) {
  quiet++;
  try { return fn(); } finally {
    quiet--;
    if (!quiet) changed();
  }
}
let quiet = 0;

// Adds a change to the outbox, merged with a waiting change of the same row
// when possible (keeps the outbox short after a long offline stretch).
function enqueue(entry) {
  const waiting = (o) => o.kind === entry.kind && o.id === entry.id && o.opId !== inFlight;
  if (entry.op === "update") {
    const prev = outbox.findLast(waiting);
    if (prev && (prev.op === "insert" || prev.op === "update")) {
      prev.row = { ...prev.row, ...entry.row };
      return;
    }
  }
  if (entry.op === "delete") {
    const hadInsert = outbox.some((o) => waiting(o) && o.op === "insert");
    outbox = outbox.filter((o) => !waiting(o));
    // Created and deleted before it ever reached the database: nothing to send
    // (unless the insert is being sent right now).
    if (hadInsert && !outbox.some((o) => o.kind === entry.kind && o.id === entry.id)) return;
  }
  outbox.push({ opId: crypto.randomUUID(), ...entry });
}


// ---------------------------------------------------------------------
// Sync
// ---------------------------------------------------------------------

const listeners = new Set();
let status = { state: "idle", pending: 0, error: null, lastSync: null };
let syncing = null;
let inFlight = null;
let retryTimer = null;
let wired = false;

// callback() after every change of the copy or of the sync status.
export function subscribe(callback) {
  listeners.add(callback);
  return () => listeners.delete(callback);
}
export function syncStatus() {
  return { ...status, pending: outbox.length, online: navigator.onLine !== false };
}

function changed() {
  if (quiet) return;
  persist();
  emit();
  scheduleSync(300);
}
function emit() {
  for (const fn of listeners) {
    try { fn(); } catch (error) { console.error(error); }
  }
}
function setStatus(next) {
  status = { ...status, ...next };
  emit();
}

function wireSync() {
  if (wired) return;
  wired = true;
  window.addEventListener("online", () => sync());
  window.addEventListener("offline", () => setStatus({ state: "offline" }));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") sync();
  });
  // Safety net: try again regularly while something waits.
  setInterval(() => { if (outbox.length) sync(); }, 20000);
}

function scheduleSync(ms) {
  clearTimeout(retryTimer);
  retryTimer = setTimeout(() => sync(), ms);
}

// Sends the outbox, then downloads everything. Safe to call any time.
export function sync() {
  if (!userId) return Promise.resolve();
  if (syncing) return syncing;
  syncing = (async () => {
    if (navigator.onLine === false) {
      setStatus({ state: "offline" });
      return;
    }
    setStatus({ state: "syncing" });
    try {
      const sent = await flush();
      if (!sent) return; // no connection: try again later
      await pull();
      setStatus({ state: "synced", error: status.error, lastSync: new Date().toISOString() });
    } catch (error) {
      if (isNetworkError(error)) setStatus({ state: "offline" });
      else setStatus({ state: "error", error: error.message || String(error) });
    }
  })().finally(() => { syncing = null; });
  return syncing;
}

// true = outbox empty; false = stopped on a network problem.
async function flush() {
  let rejected = null;
  while (outbox.length) {
    const op = outbox[0];
    inFlight = op.opId;
    let error = null;
    try {
      const q = db.from(TABLES[op.kind].table);
      let res;
      if (op.op === "insert") res = await q.upsert(op.row, { onConflict: "id", ignoreDuplicates: true });
      else if (op.op === "update") res = await q.update(op.row).eq("id", op.id);
      else res = await q.delete().eq("id", op.id);
      error = res.error;
    } catch (thrown) {
      error = thrown;
    } finally {
      inFlight = null;
    }
    if (error && (isNetworkError(error) || isAuthError(error))) {
      setStatus({ state: "offline" });
      scheduleSync(10000);
      return false;
    }
    // Refused by the database (rule broken): drop it, the next download
    // puts back what the database really holds.
    if (error) rejected = error.message || String(error);
    outbox = outbox.filter((o) => o.opId !== op.opId);
    persist();
    emit();
  }
  status.error = rejected ? "A change was refused by the database and undone: " + rejected : null;
  return true;
}

async function pull() {
  const results = await Promise.all(KINDS.map((k) => db.from(TABLES[k].table).select("*")));
  for (const r of results) if (r.error) throw r.error;
  const fresh = emptyData();
  KINDS.forEach((k, i) => {
    for (const row of results[i].data) fresh[k][row.id] = row;
  });
  // Changes made while downloading: put them back on top.
  for (const o of outbox) {
    if (o.op === "delete") delete fresh[o.kind][o.id];
    else fresh[o.kind][o.id] = { ...(fresh[o.kind][o.id] || data[o.kind][o.id] || {}), ...o.row };
  }
  data = fresh;
  pulledAt = new Date().toISOString();
  persist();
  emit();
}

function isNetworkError(error) {
  if (navigator.onLine === false) return true;
  const text = String(error && (error.message || error)).toLowerCase();
  return error instanceof TypeError || /failed to fetch|network|load failed|timeout|fetch/.test(text);
}
function isAuthError(error) {
  const text = String(error && (error.message || "")).toLowerCase();
  return error && (error.code === "PGRST301" || error.status === 401 || /jwt/.test(text));
}


// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

function pick(obj, keys) {
  const out = {};
  for (const k of keys) if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
  return out;
}
function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
}
function writeJson(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch (error) {
    console.error("Could not save on this device:", error);
  }
}
function withTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, reject) => setTimeout(() => reject(new TypeError("timeout")), ms))]);
}


// ---------------------------------------------------------------------
// Programme import (api/programme.js on this site)
// ---------------------------------------------------------------------

// Sends a programme link to our server, which reads it with Claude and
// returns the sessions found (nothing is saved). Needs a connection.
export async function importProgramme(url) {
  if (navigator.onLine === false) throw new Error("The import needs a connection.");
  const { data } = await db.auth.getSession();
  const token = data && data.session ? data.session.access_token : null;
  if (!token) throw new Error("Please unlock Onsite HQ again (log in) to import.");
  let response;
  try {
    response = await fetch("api/programme", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ url }),
    });
  } catch {
    throw new Error("No connection to the server. Try again.");
  }
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.error || `Import failed (${response.status}).`);
  return body;
}
