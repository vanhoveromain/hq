// store.js: what the screens show, and every change they make (step 1.1).
//
//   what you see = what the database sent (kept on the phone too)
//                + your changes still in the outbox (queue.js)
//
// So a new entry shows AT ONCE, with or without network. The outbox is then
// sent in order; a change the database refuses stays listed as "refusée"
// (top-bar badge) until you retry or throw it away: never lost silently.
// The other phone's changes arrive live (Supabase Realtime, step 1.8).

import {
  fetchEvents, fetchRunning, fetchMeasurements, fetchQuestions, fetchAppointments, sendChange, subscribeChanges,
} from "./storage.js";
import { addItem, putItem, removeItem, allItems } from "./queue.js";
import { dayKey, dayStart, addDays } from "./utils/dates.js";

const TABLES = {
  poulette_events: "events",
  poulette_measurements: "measurements",
  poulette_questions: "questions",
  poulette_appointments: "appointments",
};
const RECENT_DAYS = 3;         // fetched at start (and kept on the phone)
const RETRY_MS = 30000;        // outbox retry while items wait

const server = { events: new Map(), measurements: new Map(), questions: new Map(), appointments: new Map() };
let outbox = [];
let ctx = null;                // { userId, babyId, householdId }
let listeners = new Set();
let flushing = false;
let retryTimer = null;
let unsubscribe = null;
let loadedDays = new Set();
export let liveStatus = "off"; // Realtime: "SUBSCRIBED" when live

// ---------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------

function applyOutbox(collection, table) {
  const rows = new Map(server[collection]);
  for (const item of outbox) {
    if (item.table !== table) continue;
    if (item.kind === "insert") rows.set(item.id, { ...item.row, _pending: item.status });
    else if (item.kind === "update" && rows.has(item.id)) rows.set(item.id, { ...rows.get(item.id), ...item.patch, _pending: item.status });
    else if (item.kind === "delete") rows.delete(item.id);
  }
  return [...rows.values()];
}

export function events() { return applyOutbox("events", "poulette_events"); }
export function measurements() { return applyOutbox("measurements", "poulette_measurements"); }
export function questions() { return applyOutbox("questions", "poulette_questions"); }
export function appointments() { return applyOutbox("appointments", "poulette_appointments"); }

export function outboxState() {
  return {
    pending: outbox.filter((i) => i.status === "pending").length,
    failed: outbox.filter((i) => i.status === "failed"),
  };
}

export function onChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
function notify() {
  saveCache();
  for (const l of listeners) {
    try { l(); } catch (error) { console.error(error); }
  }
}

// ---------------------------------------------------------------------
// Start / load
// ---------------------------------------------------------------------

const cacheKey = () => `poulette.cache.${ctx.babyId}`;

function saveCache() {
  if (!ctx) return;
  const since = dayStart(addDays(dayKey(), -RECENT_DAYS)).toISOString();
  const recent = [...server.events.values()].filter((e) => e.started_at >= since || !e.ended_at);
  try {
    localStorage.setItem(cacheKey(), JSON.stringify({
      events: recent, measurements: [...server.measurements.values()], questions: [...server.questions.values()],
      appointments: [...server.appointments.values()],
    }));
  } catch { /* full or blocked: the database still has everything */ }
}

function loadCache() {
  try {
    const cached = JSON.parse(localStorage.getItem(cacheKey()) || "null");
    if (!cached) return;
    for (const [collection, rows] of Object.entries(cached)) {
      if (!server[collection]) continue;
      for (const row of rows) server[collection].set(row.id, row);
    }
  } catch { /* ignore a broken cache */ }
}

// Called once the household + baby are known. Shows the phone's copy at once,
// then fetches fresh data, sends the outbox and listens to the other phone.
export async function start({ userId, babyId, householdId }) {
  if (ctx && ctx.babyId === babyId) return refresh();
  stop();
  ctx = { userId, babyId, householdId };
  for (const m of Object.values(server)) m.clear();
  loadedDays = new Set();
  loadCache();
  outbox = await allItems();
  notify();
  await refresh();
  if (!unsubscribe) {
    unsubscribe = subscribeChanges(babyId, householdId, onRemoteChange, (status) => {
      liveStatus = status;
      // Back after a cut: catch up on what we may have missed.
      if (status === "SUBSCRIBED") refresh();
    });
  }
}

export function stop() {
  if (unsubscribe) unsubscribe();
  unsubscribe = null;
  ctx = null;
}

let refreshing = null;
export function refresh() {
  if (!ctx) return Promise.resolve();
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const since = dayStart(addDays(dayKey(), -RECENT_DAYS)).toISOString();
        const [recent, open, meas, qs, appts] = await Promise.all([
          fetchEvents(ctx.babyId, since), fetchRunning(ctx.babyId),
          fetchMeasurements(ctx.babyId), fetchQuestions(ctx.householdId), fetchAppointments(ctx.babyId),
        ]);
        // Replace the recent window (an event deleted for good disappears).
        for (const [id, e] of server.events) if (e.started_at >= since) server.events.delete(id);
        for (const e of [...recent, ...open]) server.events.set(e.id, e);
        server.measurements = new Map(meas.map((m) => [m.id, m]));
        server.questions = new Map(qs.map((q) => [q.id, q]));
        server.appointments = new Map(appts.map((a) => [a.id, a]));
        for (let i = 0; i <= RECENT_DAYS; i++) loadedDays.add(addDays(dayKey(), -i));
      } catch (error) {
        console.warn("Refresh failed (offline?):", error.message);
      }
      notify();
      flush();
    })().finally(() => { refreshing = null; });
  }
  return refreshing;
}

// Journal: make sure an older day is loaded.
export async function ensureDay(key) {
  if (!ctx || loadedDays.has(key)) return;
  const rows = await fetchEvents(ctx.babyId, dayStart(key).toISOString(), dayStart(addDays(key, 1)).toISOString());
  for (const e of rows) server.events.set(e.id, e);
  loadedDays.add(key);
  notify();
}

// Report: make sure every day of a period is loaded (one query for the days
// not loaded yet).
export async function ensureRange(fromKey, toKey) {
  if (!ctx) return;
  const missing = [];
  for (let d = fromKey; d <= toKey; d = addDays(d, 1)) if (!loadedDays.has(d)) missing.push(d);
  if (!missing.length) return;
  const rows = await fetchEvents(ctx.babyId, dayStart(missing[0]).toISOString(), dayStart(addDays(missing[missing.length - 1], 1)).toISOString());
  for (const e of rows) server.events.set(e.id, e);
  for (const d of missing) loadedDays.add(d);
  notify();
}

function onRemoteChange(table, kind, row, old) {
  const collection = TABLES[table];
  if (!collection) return;
  if (kind === "DELETE") server[collection].delete(old && old.id);
  else server[collection].set(row.id, row);
  notify();
}

// ---------------------------------------------------------------------
// Changing (always through the outbox)
// ---------------------------------------------------------------------

function uuid() {
  if (crypto.randomUUID) return crypto.randomUUID();
  return "10000000-1000-4000-8000-100000000000".replace(/[018]/g, (c) =>
    (c ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (c / 4)))).toString(16));
}

async function enqueue(item) {
  const full = { ...item, status: "pending", error: null, at: new Date().toISOString() };
  full.seq = await addItem(full);
  outbox.push(full);
  notify();
  flush();
  return full;
}

export async function addEvent(type, fields = {}) {
  const now = new Date().toISOString();
  const row = {
    id: uuid(), baby_id: ctx.babyId, type,
    started_at: fields.started_at || now, ended_at: fields.ended_at ?? null,
    data: fields.data || {}, note: fields.note ?? null,
    created_by: ctx.userId, created_at: now, updated_at: now, deleted_at: null,
  };
  await enqueue({ table: "poulette_events", kind: "insert", id: row.id, row });
  return row;
}

export async function updateEvent(id, patch) {
  await enqueue({ table: "poulette_events", kind: "update", id, patch: { ...patch, updated_at: new Date().toISOString() } });
}

// Events are never really deleted (deleted_at): the other phone sees it go.
export async function deleteEvent(id) {
  await updateEvent(id, { deleted_at: new Date().toISOString() });
}

export async function addMeasurement(fields) {
  const now = new Date().toISOString();
  const row = { id: uuid(), baby_id: ctx.babyId, measured_at: now, source: null, created_by: ctx.userId, created_at: now, updated_at: now,
    weight_g: null, length_cm: null, head_cm: null, ...fields };
  await enqueue({ table: "poulette_measurements", kind: "insert", id: row.id, row });
  return row;
}
export async function updateMeasurement(id, patch) {
  await enqueue({ table: "poulette_measurements", kind: "update", id, patch });
}
export async function deleteMeasurement(id) {
  await enqueue({ table: "poulette_measurements", kind: "delete", id });
}

export async function addQuestion(text) {
  const now = new Date().toISOString();
  const row = { id: uuid(), household_id: ctx.householdId, baby_id: ctx.babyId, text, done_at: null, answer: null,
    created_by: ctx.userId, created_at: now, updated_at: now };
  await enqueue({ table: "poulette_questions", kind: "insert", id: row.id, row });
  return row;
}
export async function updateQuestion(id, patch) {
  await enqueue({ table: "poulette_questions", kind: "update", id, patch });
}
export async function deleteQuestion(id) {
  await enqueue({ table: "poulette_questions", kind: "delete", id });
}

export async function addAppointment(heldOn, note = null) {
  const now = new Date().toISOString();
  const row = { id: uuid(), baby_id: ctx.babyId, held_on: heldOn, note, created_by: ctx.userId, created_at: now, updated_at: now };
  await enqueue({ table: "poulette_appointments", kind: "insert", id: row.id, row });
  return row;
}
export async function updateAppointment(id, patch) {
  await enqueue({ table: "poulette_appointments", kind: "update", id, patch });
}
export async function deleteAppointment(id) {
  await enqueue({ table: "poulette_appointments", kind: "delete", id });
}

// ---------------------------------------------------------------------
// Sending the outbox
// ---------------------------------------------------------------------

export async function flush() {
  if (flushing || !ctx) return;
  flushing = true;
  let changed = false;
  try {
    for (const item of [...outbox]) {
      if (item.status === "failed") continue;
      try {
        await sendChange(item);
        // Accepted: the database's copy now holds it.
        const collection = TABLES[item.table];
        if (item.kind === "insert") server[collection].set(item.id, item.row);
        else if (item.kind === "update" && server[collection].has(item.id)) {
          server[collection].set(item.id, { ...server[collection].get(item.id), ...item.patch });
        } else if (item.kind === "delete") server[collection].delete(item.id);
        await removeItem(item.seq);
        outbox = outbox.filter((i) => i.seq !== item.seq);
        changed = true;
      } catch (error) {
        if (!error.permanent) break; // no network: keep the order, try later
        item.status = "failed";
        item.error = error.message;
        await putItem(item);
        changed = true;
      }
    }
  } finally {
    flushing = false;
  }
  if (changed) notify();
  clearTimeout(retryTimer);
  if (outbox.some((i) => i.status === "pending")) retryTimer = setTimeout(flush, RETRY_MS);
}

// A refused change: try again (after a fix on the database side) or drop it.
export async function retryItem(seq) {
  const item = outbox.find((i) => i.seq === seq);
  if (!item) return;
  item.status = "pending";
  item.error = null;
  await putItem(item);
  notify();
  flush();
}
export async function dropItem(seq) {
  await removeItem(seq);
  outbox = outbox.filter((i) => i.seq !== seq);
  notify();
}

export function describeItem(item) {
  const what = { poulette_events: "saisie", poulette_measurements: "mesure", poulette_questions: "question",
    poulette_appointments: "rendez-vous" }[item.table] || "changement";
  const how = { insert: "nouvelle", update: "modification", delete: "suppression" }[item.kind];
  return { what, how };
}

window.addEventListener("online", () => flush());
