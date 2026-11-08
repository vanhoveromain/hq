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
