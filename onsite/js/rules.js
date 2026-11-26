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


// ---------------------------------------------------------------------
// Run of show
// ---------------------------------------------------------------------

// "09:00:00" (database) or "09:00" -> "09:00". Empty stays "".
export function hhmm(time) {
  return time ? String(time).slice(0, 5) : "";
}

// The time now in Brussels, "HH:MM" (whatever the device's own time zone).
export function brusselsNow() {
  return new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Brussels", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
}

// Minutes from "09:10" to "09:45" (same day) -> 35.
export function minutesBetween(from, to) {
  const m = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  return m(to) - m(from);
}

// Timeline order: start time, then programme before tasks at the same time
// (what's on stage first), then position, then title.
export function sortLines(lines) {
  return [...lines].sort((a, b) =>
    hhmm(a.start_time).localeCompare(hhmm(b.start_time))
    || (a.kind === b.kind ? 0 : a.kind === "programme" ? -1 : 1)
    || (a.position ?? 0) - (b.position ?? 0)
    || a.title.localeCompare(b.title));
}

// When a programme line ends: its end time, or else the start of the next
// programme line in the same room (or with no room), or else end of day.
export function programmeEnd(line, programme) {
  if (line.end_time) return hhmm(line.end_time);
  const start = hhmm(line.start_time);
  const next = programme
    .filter((p) => hhmm(p.start_time) > start && (!line.room || !p.room || p.room === line.room))
    .map((p) => hhmm(p.start_time))
    .sort()[0];
  return next || "23:59";
}

// Pasted text -> lines. Understands:
//   "09:00 - 09:20 Keynote", "09:00–09:20: Keynote", "9.00 Open doors",
//   "18:05 Networking drinks", Excel rows (tabs): start, [end], title, owner,
//   room, notes. A line with no time at the start goes into the notes of the
//   line above (a speaker list, a description). Returns { lines, skipped }.
const TIME = String.raw`(\d{1,2})[:.hH](\d{2})`;
const LINE_RE = new RegExp(String.raw`^${TIME}(?:\s*(?:-|–|—|to)\s*${TIME})?\s*[-–—:|]?\s*(.*)$`);
export function parsePastedLines(text) {
  const lines = [];
  const skipped = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    const row = raw.trim();
    if (!row) continue;
    if (raw.includes("\t")) {
      const cols = raw.split("\t").map((c) => c.trim());
      const start = toTime(cols[0]);
      if (start) {
        const hasEnd = Boolean(toTime(cols[1]));
        const [title, owner, room, notes] = cols.slice(hasEnd ? 2 : 1);
        if (title) {
          lines.push({ start, end: hasEnd ? toTime(cols[1]) : null, title: title.slice(0, 300), owner: owner || null, room: room || null, notes: notes || null });
          continue;
        }
      }
    }
    const m = row.match(LINE_RE);
    if (m && validTime(m[1], m[2]) && m[5].trim()) {
      lines.push({
        start: pad(m[1], m[2]),
        end: m[3] && validTime(m[3], m[4]) ? pad(m[3], m[4]) : null,
        title: m[5].trim().slice(0, 300), owner: null, room: null, notes: null,
      });
    } else if (lines.length) {
      const last = lines[lines.length - 1];
      last.notes = (last.notes ? last.notes + "\n" : "") + row;
    } else {
      skipped.push(row);
    }
  }
  return { lines, skipped };
}
function toTime(value) {
  const m = String(value || "").trim().match(/^(\d{1,2})[:.hH](\d{2})(?::\d{2})?$/);
  return m && validTime(m[1], m[2]) ? pad(m[1], m[2]) : null;
}
function validTime(h, m) {
  return Number(h) < 24 && Number(m) < 60;
}
function pad(h, m) {
  return `${String(h).padStart(2, "0")}:${m}`;
}
