// format.js — turning numbers into text and back (times, paces, distances).
// Times are stored as whole seconds everywhere (46:00 -> 2760).

// Reads what you type in the duration box and returns seconds, or null if
// it can't be understood. Accepted:
//   "45"       -> 45 minutes
//   "45:30"    -> 45 min 30 s
//   "1:02:30"  -> 1 h 2 min 30 s
// "." "," or a space work instead of ":" because the iPhone number
// keyboard has no colon key ("1.02.30" = "1:02:30").
export function parseDuration(text) {
  // Between the numbers: ":", ".", ",", a space, or ' and " (44'30, 44'30")
  const parts = String(text).trim().split(/[:.,'’"″\s]+/).filter(Boolean);
  if (parts.length === 0 || parts.length > 3) return null;
  if (!parts.every((part) => /^\d+$/.test(part))) return null;

  const numbers = parts.map(Number);
  let hours = 0, minutes = 0, seconds = 0;
  if (numbers.length === 1) [minutes] = numbers;
  if (numbers.length === 2) [minutes, seconds] = numbers;
  if (numbers.length === 3) [hours, minutes, seconds] = numbers;

  // In "1:75:00" the minutes make no sense, so refuse it.
  if (numbers.length > 1 && seconds > 59) return null;
  if (numbers.length === 3 && minutes > 59) return null;

  const total = hours * 3600 + minutes * 60 + seconds;
  return total > 0 ? total : null;
}

// 2700 -> "45:00", 3750 -> "1:02:30"
export function formatDuration(totalSeconds) {
  if (totalSeconds == null) return "";
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = Math.round(totalSeconds % 60);
  const pad = (n) => String(n).padStart(2, "0");
  return hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${minutes}:${pad(seconds)}`;
}

// A total of time, in hours: 16200 -> "4h30", 2700 -> "45 min", 0 -> "0h".
// For sums (a week, a block, stats); one session's time uses formatDuration.
export function formatHours(seconds) {
  const minutes = Math.round(seconds / 60);
  if (minutes === 0) return "0h";
  if (minutes < 60) return `${minutes} min`;
  return `${Math.floor(minutes / 60)}h${String(minutes % 60).padStart(2, "0")}`;
}

// A decimal number typed by hand: "11,2" and "11.2" both give 11.2.
// Empty -> null; anything else that isn't a number -> NaN (so the form can say so).
export function parseDecimal(text) {
  const clean = String(text ?? "").trim().replace(",", ".");
  if (clean === "") return null;
  return /^\d*\.?\d+$|^\d+\.$/.test(clean) ? Number(clean) : NaN;
}

// 10.5 -> "10.5 km", 10 -> "10 km"
export function formatKm(km) {
  if (km == null) return "";
  return `${Number(km).toLocaleString("en-GB", { maximumFractionDigits: 2 })} km`;
}

// Speed in the style the sport uses (see `speed` in rules.js).
// Returns "" when there isn't enough information.
export function formatSpeed(style, durationSeconds, km) {
  if (!style || !durationSeconds || !km || km <= 0) return "";
  if (style === "per_km") {
    return formatDuration(Math.round(durationSeconds / km)) + " /km";
  }
  if (style === "per_100m") {
    return formatDuration(Math.round(durationSeconds / (km * 10))) + " /100m";
  }
  if (style === "kmh") {
    const kmh = km / (durationSeconds / 3600);
    return kmh.toLocaleString("en-GB", { maximumFractionDigits: 1 }) + " km/h";
  }
  return "";
}

// Makes text safe to put inside HTML. Without it, notes containing
// "<b>" would turn bold — or worse, run code. Use it on anything you typed.
export function escapeHtml(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// One exercise line as text: "Leg extension — 3 × 10 @ 25 kg".
export function formatExercise(e) {
  // "3 × 10", or "3 sets" without reps, or just "10"
  const amount = e.sets && e.reps ? `${e.sets} × ${e.reps}` : e.sets ? `${e.sets} sets` : (e.reps || "");
  const weight = e.weight_kg != null && e.weight_kg !== "" ? `@ ${Number(e.weight_kg)} kg` : "";
  const detail = [amount, weight].filter(Boolean).join(" ");
  return detail ? `${e.name} — ${detail}` : e.name;
}

// Number style (step 17b): a value in the stat font (.num) with its unit
// small and light (.unit), like a sports watch.
//   numHtml("19.5 km")     -> <span class="num">19.5</span> <span class="unit">km</span>
//   numHtml("5:29 /km")    -> 5:29 big, "/km" small
//   numHtml(46, "kg")      -> the unit given separately
//   numHtml("1h57")        -> all of it is the number
// Without a unit, everything after the first space is taken as the unit.
// Both parts go through escapeHtml, so it is safe on any text.
export function numHtml(value, unit) {
  let number = String(value ?? "");
  let rest = unit ?? "";
  if (unit === undefined) {
    const space = number.indexOf(" ");
    if (space > 0 && /\d/.test(number.slice(0, space))) {
      rest = number.slice(space + 1);
      number = number.slice(0, space);
    }
  }
  return `<span class="num">${escapeHtml(number)}</span>${rest ? ` <span class="unit">${escapeHtml(rest)}</span>` : ""}`;
}

// RPE 1–10 -> a colour band, cool to warm (never green / amber / red,
// which mean done / warning / error). Used as a class: rpe-low, rpe-mid…
export function rpeLevel(rpe) {
  if (rpe <= 3) return "low";
  if (rpe <= 6) return "mid";
  if (rpe <= 8) return "high";
  return "max";
}
