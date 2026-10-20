// dates.js — calendar-day helpers.
//
// The database stores days as text like "2026-10-12" (no time, no timezone).
// We work with those strings and only turn them into Date objects to do
// maths or to show a nice label. Weeks start on Monday.
//
// Why not new Date().toISOString()? It gives the date in UTC (London time
// in winter, without daylight saving), so at 00:30 in Brussels it would
// still say "yesterday". These helpers always use your local day.

// "2026-10-12" -> Date at local midnight
export function parseISODate(iso) {
  const [year, month, day] = iso.split("-").map(Number);
  return new Date(year, month - 1, day); // months count from 0 in JS
}

// Date -> "2026-10-12"
export function toISODate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function todayISO() {
  return toISODate(new Date());
}

export function addDays(iso, days) {
  const date = parseISODate(iso);
  date.setDate(date.getDate() + days); // handles month/year changes for us
  return toISODate(date);
}

// Monday of the week that contains `iso`.
export function startOfWeek(iso) {
  const date = parseISODate(iso);
  // getDay(): Sunday = 0, Monday = 1 … Saturday = 6.
  // How many days to go back to reach Monday:
  const daysSinceMonday = (date.getDay() + 6) % 7;
  return addDays(iso, -daysSinceMonday);
}

// "Mon 12 Oct" this year, "Sat 1 Nov 2025" another year (otherwise an old
// date reads like a future one).
export function formatDayLabel(iso) {
  const date = parseISODate(iso);
  const otherYear = date.getFullYear() !== new Date().getFullYear();
  return date.toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short", ...(otherYear ? { year: "numeric" } : {}),
  });
}

// "This week", "Last week" or "Week of 28 Sep"
export function formatWeekLabel(mondayISO) {
  const thisMonday = startOfWeek(todayISO());
  if (mondayISO === thisMonday) return "This week";
  if (mondayISO === addDays(thisMonday, -7)) return "Last week";
  const label = parseISODate(mondayISO).toLocaleDateString("en-GB", {
    day: "numeric", month: "short", year: "numeric",
  });
  return "Week of " + label;
}
