// data.js: the schedule's data, in QED HQ's Supabase project (table
// staff_docs, migration qed/supabase/migrations/20261127000001_staff_hq.sql).
//
// Two ways in (decided by Romain 2026-11-27):
//   - Editor (Romain): logged in with the hq login + QED project session, and
//     listed in staff_editors. Reads and writes the table directly; the
//     database refuses writes from anyone else.
//   - Team: no login, the secret link staff.ownhq.app/#k=<key>. The key is
//     sent to staff_read(key), which returns the schedule and nothing else.
//     The key is remembered on this device (localStorage "staff.key"), so the
//     plain address works there afterwards. Wrong / changed key = nothing.
//
// The page expects a Firestore-like interface (see staff/CLAUDE.md,
// "Interface the page expects"): db.doc(path).set / delete / onSnapshot and
// db.collection(name).onSnapshot / doc().id. There is no realtime here:
// listeners fire once loaded, after every change made on this page, and
// after a refresh every 20 s (only while the page is visible).

import { HQ_BASE, IS_PREVIEW } from "./hqBase.js";

const COLLECTIONS = ["config", "events", "notes"];
const KEY_STORE = "staff.key";
const POLL_MS = 20000;

const hq = await import(HQ_BASE + "auth.js");
const sb = hq.getQedSupabase();

if (IS_PREVIEW) document.title = "Staff HQ · test";


// ---------------------------------------------------------------------
// Who is this?
// ---------------------------------------------------------------------

function keyFromAddress() {
  const m = window.location.hash.match(/[#&]k=([A-Za-z0-9]{32,128})/);
  return m ? m[1] : null;
}

function storedKey() {
  try { return localStorage.getItem(KEY_STORE); } catch { return null; }
}

function rememberKey(key) {
  try { key ? localStorage.setItem(KEY_STORE, key) : localStorage.removeItem(KEY_STORE); } catch { /* private window */ }
}

async function isEditor() {
  try {
    const { data } = await sb.auth.getUser();
    if (!data || !data.user) return false;
    const { data: ok, error } = await sb.rpc("staff_is_editor");
    return !error && ok === true;
  } catch {
    return false;
  }
}

// Editor only (Romain, 2026-11-27): the shared HQ switcher replaces the QED
// logo + title in the page's top bar. The team (no login) keeps the page as
// it was. Coloured with the page's own tokens so it fits light + dark.
function showSwitcher() {
  const brand = document.querySelector("header.top .brand");
  if (!brand) return;
  const sw = document.createElement("hq-switcher");
  sw.setAttribute("current", "staff");
  sw.style.cssText = "--hq-font:var(--font);--hq-primary-text:var(--text);--hq-secondary-text:var(--muted);"
    + "--hq-surface:var(--surface);--hq-border:var(--line);--hq-subtle:var(--chip);--hq-accent:var(--text);--hq-accent-text:var(--text);--hq-shadow-pop:var(--shadow)";
  import(HQ_BASE + "switcher.js")
    .then(() => {
      for (const el of brand.children) el.style.display = "none";
      brand.prepend(sw);
    })
    .catch(() => { /* switcher unavailable: keep the page's own header */ });
}

// A message in the page's grey status bar, the page itself stays empty.
function stop(html) {
  const el = document.getElementById("status");
  if (el) { el.innerHTML = html; el.hidden = false; }
  return new Promise(() => {});
}

export async function connect() {
  const fromAddress = keyFromAddress();
  if (fromAddress) rememberKey(fromAddress);
  const key = fromAddress || storedKey();

  if (await isEditor()) {
    showSwitcher();
    return makeDb({ mode: "editor" });
  }
  if (key) return makeDb({ mode: "team", key });

  // No key and not an editor: Romain on a fresh device, or someone without
  // the link. Logged out of hq -> the hq login, which brings you back here.
  const hqUser = await hq.requireLogin();
  const { data } = await sb.auth.getUser().catch(() => ({ data: null }));
  if (!data || !data.user) {
    const qedUrl = IS_PREVIEW ? "https://qed-preview.ownhq.app/" : HQ_BASE.startsWith("/") ? "/" : "https://qed.ownhq.app/";
    return stop(`Open <a href="${qedUrl}">QED HQ</a> once and unlock it with your password, then reload this page.`);
  }
  return stop(`This account (${escapeHtml(hqUser.email || "")}) can’t edit the schedule. To view it, use the team link.`);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}


// ---------------------------------------------------------------------
// The database object the page uses
// ---------------------------------------------------------------------

function makeDb({ mode, key }) {
  // cache[collection] = Map(id -> data)
  const cache = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
  const docListeners = new Map();   // "collection/id" -> Set({ next, error })
  const colListeners = new Map();   // collection      -> Set({ next, error })
  let loaded = false;
  let pending = 0;                  // writes on their way
  let version = 0;                  // +1 on every change made here
  let loading = null;

  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  function split(path) {
    const [c, id, extra] = String(path).split("/");
    if (!COLLECTIONS.includes(c) || !id || extra !== undefined || !/^[A-Za-z0-9_-]{1,64}$/.test(id)) {
      throw { code: "invalid_argument", message: "Bad path " + path };
    }
    return [c, id];
  }

  const meta = () => ({ fromCache: false });

  function emitDoc(path, l) {
    const [c, id] = path.split("/");
    const data = cache[c].get(id);
    l.next({ exists: data !== undefined, data: () => clone(data), metadata: meta() });
  }
  function emitCol(c, l) {
    const docs = [...cache[c].entries()].map(([id, data]) => ({ id, data: () => clone(data) }));
    l.next({ docs, metadata: meta() });
  }
  function emitAll(onlyCollection) {
    for (const [path, set] of docListeners) {
      if (!onlyCollection || path.startsWith(onlyCollection + "/")) set.forEach((l) => emitDoc(path, l));
    }
    for (const [c, set] of colListeners) {
      if (!onlyCollection || c === onlyCollection) set.forEach((l) => emitCol(c, l));
    }
  }
  function failAll(err) {
    for (const set of [...docListeners.values(), ...colListeners.values()]) set.forEach((l) => l.error && l.error(err));
  }

  // Everything, in one go (small: a few dozen documents).
  async function fetchAll() {
    if (mode === "team") {
      const { data, error } = await sb.rpc("staff_read", { p_key: key });
      if (error) throw error;
      if (data == null) throw { code: "revoked" };
      return data;
    }
    const { data, error } = await sb.from("staff_docs").select("collection, id, data");
    if (error) throw error;
    const out = { config: {}, events: {}, notes: {} };
    for (const row of data) if (out[row.collection]) out[row.collection][row.id] = row.data;
    return out;
  }

  function refresh() {
    if (loading) return loading;
    const startedAt = version;
    loading = fetchAll()
      .then((all) => {
        // A change made here while loading: keep ours, the next refresh catches up.
        if (pending || version !== startedAt) return;
        for (const c of COLLECTIONS) cache[c] = new Map(Object.entries(all[c] || {}));
        loaded = true;
        emitAll();
      })
      .catch((err) => {
        if (err && err.code === "revoked") {
          rememberKey(null);
          clearInterval(timer);
          failAll({ code: "revoked" });
        } else if (!loaded) {
          failAll({ code: "unavailable" });
        } // later refresh failed (offline a moment): keep what is on screen
      })
      .finally(() => { loading = null; });
    return loading;
  }

  const timer = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, POLL_MS);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible" && loaded) refresh(); });
  refresh();

  function listen(map, k, next, error, emit) {
    if (!map.has(k)) map.set(k, new Set());
    const l = { next, error };
    map.get(k).add(l);
    if (loaded) emit(l);
    return () => map.get(k).delete(l);
  }

  function toError(error) {
    if (!error) return { code: "unknown" };
    if (error.code) {
      // 42501 = refused by the database's rules (not an editor)
      if (error.code === "42501" || error.code === "PGRST301" || error.code === "invalid_argument") return { code: "invalid_argument" };
      return { code: "unknown", message: error.message };
    }
    // fetch failed: no network
    return { code: "unavailable" };
  }

  async function write(path, data) {
    if (mode !== "editor") throw { code: "invalid_argument" };
    const [c, id] = split(path);
    const before = cache[c].get(id);
    version++;
    pending++;
    if (data === null) cache[c].delete(id); else cache[c].set(id, clone(data));
    emitAll(c);
    try {
      const q = data === null
        ? sb.from("staff_docs").delete().eq("collection", c).eq("id", id)
        : sb.from("staff_docs").upsert({ collection: c, id, data }, { onConflict: "collection,id" });
      let res;
      try { res = await q; } catch (e) { res = { error: e }; }
      if (res.error) {
        if (before === undefined) cache[c].delete(id); else cache[c].set(id, before);
        throw toError(res.error);
      }
    } finally {
      pending--;
      if (!pending) setTimeout(refresh, 1500);
    }
  }

  function newId() {
    const abc = "abcdefghijklmnopqrstuvwxyz0123456789";
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    return Array.from(bytes, (b) => abc[b % abc.length]).join("");
  }

  function docRef(path) {
    const [c, id] = split(path);
    const full = c + "/" + id;
    return {
      id,
      set: (data) => write(full, data),
      delete: () => write(full, null),
      onSnapshot: (next, error) => listen(docListeners, full, next, error, (l) => emitDoc(full, l)),
    };
  }

  const db = {
    doc: docRef,
    collection(c) {
      if (!COLLECTIONS.includes(c)) throw { code: "invalid_argument" };
      return {
        doc: (id) => docRef(c + "/" + (id || newId())),
        onSnapshot: (next, error) => listen(colListeners, c, next, error, (l) => emitCol(c, l)),
      };
    },
  };

  const user = { isOwner: async () => mode === "editor" };
  return { db, user };
}
