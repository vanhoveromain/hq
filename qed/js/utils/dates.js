// dates.js: calendar days as "YYYY-MM-DD" strings (Postgres `date`), shown in
// British English ("12 Nov 2026"). Days are read as plain calendar days, never
// shifted by time zones.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parts(day) {
  const [y, m, d] = day.split("-").map(Number);
  return { y, m, d };
}

// "2026-11-12" -> "12 Nov 2026"
export function formatDay(day) {
  if (!day) return "";
  const { y, m, d } = parts(day);
  return `${d} ${MONTHS[m - 1]} ${y}`;
}

// A project's dates: "12 Nov 2026", "12–14 Nov 2026", "28 Nov – 2 Dec 2026"…
export function formatRange(start, end) {
  if (!start) return end ? formatDay(end) : "";
  if (!end || end === start) return formatDay(start);
  const a = parts(start);
  const b = parts(end);
  if (a.y === b.y && a.m === b.m) return `${a.d}–${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  if (a.y === b.y) return `${a.d} ${MONTHS[a.m - 1]} – ${b.d} ${MONTHS[b.m - 1]} ${b.y}`;
  return `${formatDay(start)} – ${formatDay(end)}`;
}

// Today's date in Brussels, as "YYYY-MM-DD" (QED HQ's "today", whatever the
// device's own time zone).
export function brusselsToday() {
  // en-CA writes dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
}

// "2026-11-08" + 1 -> "2026-11-09" (calendar arithmetic, no time zones).
export function addDays(day, n) {
  const [y, m, d] = day.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + n));
  return date.toISOString().slice(0, 10);
}

// A task's due date, as people say it: "Today", "Tomorrow", "Yesterday",
// "Mon 10 Nov" (this year) or "10 Nov 2027".
export function friendlyDay(day, today) {
  if (!day) return "";
  if (day === today) return "Today";
  if (day === addDays(today, 1)) return "Tomorrow";
  if (day === addDays(today, -1)) return "Yesterday";
  const [y, m, d] = day.split("-").map(Number);
  const weekday = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  if (y === Number(today.slice(0, 4))) return `${weekday} ${d} ${MONTHS[m - 1]}`;
  return formatDay(day);
}
