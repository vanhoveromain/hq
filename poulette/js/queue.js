// queue.js: the OUTBOX on the phone (IndexedDB). Every change (new entry,
// edit, delete) is written here FIRST, then sent to the database by store.js.
// No network: it simply waits here, and is sent when the network comes back.
// Nothing leaves the outbox without having been accepted by the database, or
// thrown away by you (a refused change stays visible as "refusée").
//
// An item: { seq (auto), table, kind: "insert" | "update" | "delete", id,
//            row | patch, status: "pending" | "failed", error, at }

const DB_NAME = "poulette";
const STORE = "outbox";

let dbPromise = null;
let memory = null; // fallback when IndexedDB is unavailable (private mode...)

function open() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      if (!("indexedDB" in self)) return reject(new Error("no IndexedDB"));
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: "seq", autoIncrement: true });
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    }).catch((error) => {
      console.warn("Outbox in memory only:", error.message);
      memory = memory || { next: 1, items: new Map() };
      return null;
    });
  }
  return dbPromise;
}

function tx(db, mode, work) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const result = work(t.objectStore(STORE));
    t.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}

export async function addItem(item) {
  const db = await open();
  if (!db) {
    const seq = memory.next++;
    memory.items.set(seq, { ...item, seq });
    return seq;
  }
  return tx(db, "readwrite", (s) => s.add(item));
}

export async function putItem(item) {
  const db = await open();
  if (!db) { memory.items.set(item.seq, item); return; }
  await tx(db, "readwrite", (s) => s.put(item));
}

export async function removeItem(seq) {
  const db = await open();
  if (!db) { memory.items.delete(seq); return; }
  await tx(db, "readwrite", (s) => s.delete(seq));
}

// Every item, oldest first.
export async function allItems() {
  const db = await open();
  if (!db) return [...memory.items.values()].sort((a, b) => a.seq - b.seq);
  const items = await tx(db, "readonly", (s) => s.getAll());
  return (items || []).sort((a, b) => a.seq - b.seq);
}
