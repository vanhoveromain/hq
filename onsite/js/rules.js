// rules.js: Onsite HQ's lists and rules, in one place (never in screen code).

// Who can own a run-of-show line. Plain text in the database, so adding a
// person is a change here only. First = default for a new task.
export const OWNERS = [
  "Romain", "Gabriella", "Paula", "Cristina", "Kevin", "Flavio", "Emmanuella", "Adriana",
  "Hosts", "AV supplier", "Caterer", "Venue", "Client",
];
export const DEFAULT_OWNER = "Romain";

// Rooms offered for a new event (editable per event).
export const DEFAULT_ROOMS = ["Plenary", "Breakout room", "Registration desk", "Foyer", "Control room"];

export const DAY_KINDS = [
  { value: "setup", label: "Setup" },
  { value: "event", label: "Event day" },
  { value: "teardown", label: "Teardown" },
];

// An event's days in order, each with its tab label: "Setup", "Day 1",
// "Day 2", "Teardown" (or the label typed for that day).
export function orderedDays(days) {
  const sorted = [...days].sort((a, b) => a.day.localeCompare(b.day));
  let n = 0;
  return sorted.map((d) => {
    if (d.kind === "event") n++;
    const auto = d.kind === "setup" ? "Setup" : d.kind === "teardown" ? "Teardown" : `Day ${n}`;
    return { ...d, tabLabel: d.label || auto };
  });
}

// An event's first and last calendar day (all kinds), for lists.
export function eventSpan(days) {
  if (!days.length) return { start: null, end: null };
  const sorted = days.map((d) => d.day).sort();
  return { start: sorted[0], end: sorted[sorted.length - 1] };
}

// "Plenary, Breakout room" / one per line -> clean list, no doubles.
export function parseRooms(text) {
  const seen = new Set();
  const out = [];
  for (const part of String(text || "").split(/[\n,]/)) {
    const name = part.trim();
    if (name && !seen.has(name.toLowerCase())) {
      seen.add(name.toLowerCase());
      out.push(name);
    }
  }
  return out;
}

// Packing order of the categories (boxes): the smallest position found in
// each one (master list first, then the event's items).
export function categoryOrder(rows) {
  const order = new Map();
  for (const r of rows) {
    const key = r.category || "Other";
    const pos = r.position ?? 0;
    if (!order.has(key) || pos < order.get(key)) order.set(key, pos);
  }
  return order;
}

// Position for a new item: right after the last one of its category, or after
// everything if the category is new. Positions are spaced by 100 (seed), so
// there is room in between.
export function nextPosition(rows, category) {
  const same = rows.filter((r) => (r.category || null) === (category || null));
  const pool = same.length ? same : rows;
  return pool.length ? Math.max(...pool.map((r) => r.position ?? 0)) + 1 : 0;
}
