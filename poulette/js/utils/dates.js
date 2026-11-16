// dates.js: local time helpers (the phone's time zone = Brussels).

export function pad(n) {
  return String(n).padStart(2, "0");
}

// "03:12"
export function hhmm(iso) {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

// Local calendar day "2026-11-15" of a date / ISO string.
export function dayKey(value = new Date()) {
  const d = value instanceof Date ? value : new Date(value);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Start (00:00 local) of a day key, as a Date.
export function dayStart(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function addDays(key, n) {
  const d = dayStart(key);
  d.setDate(d.getDate() + n);
  return dayKey(d);
}

// "dimanche 15 novembre" (+ "Aujourd'hui" / "Hier")
export function dayLabel(key) {
  const today = dayKey();
  if (key === today) return "Aujourd'hui";
  if (key === addDays(today, -1)) return "Hier";
  return dayStart(key).toLocaleDateString("fr-BE", { weekday: "long", day: "numeric", month: "long" });
}

// "15/11/2026"
export function shortDate(value) {
  return new Date(value).toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit", year: "numeric" });
}

// Value for <input type="datetime-local"> from an ISO string, and back.
export function toLocalInput(iso) {
  const d = new Date(iso);
  return `${dayKey(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function fromLocalInput(value) {
  return value ? new Date(value).toISOString() : null;
}

// Minutes earlier than an ISO time.
export function minus(iso, minutes) {
  return new Date(Date.parse(iso) - minutes * 60000).toISOString();
}

export function nowIso() {
  return new Date().toISOString();
}
