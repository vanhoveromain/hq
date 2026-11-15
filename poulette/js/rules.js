// rules.js: what Poulette HQ knows about babies' events, in ONE place.
// Labels, lists (poop colours...), the next-breast rule, how an event is
// summed up in one line, durations. Never in screen code.
//
// The app records and sums up; it never interprets (no medical advice, no
// alerts on thresholds: out of scope, see CLAUDE.md).

// Event types (poulette_events.type). `timer` = has a start and an end
// (chrono). Order = order of the quick actions on Accueil.
export const TYPES = {
  breastfeed:  { label: "Tétée",          emoji: "🤱" },
  bottle:      { label: "Biberon",        emoji: "🍼" },
  diaper:      { label: "Change",         emoji: "🧷" },
  sleep:       { label: "Sommeil",        emoji: "😴", timer: true },
  pump:        { label: "Tirage",         emoji: "🥛" },
  spit_up:     { label: "Régurgitation",  emoji: "💧" },
  temperature: { label: "Température",    emoji: "🌡️" },
  medication:  { label: "Médicament",     emoji: "💊" },
};
// Accueil buttons (Rom, 2026-11-15: no sleep; a "Question pédiatre" button).
// "sleep" stays a known type (old entries still show) but is offered nowhere.
export const QUICK_ACTIONS = ["breastfeed", "bottle", "diaper", "pump", "spit_up", "question"];
export const QUESTION_ACTION = { label: "Question pédiatre", emoji: "❓" };
export const MORE_ACTIONS = ["temperature", "medication"];

export const SIDES = { L: "Gauche", R: "Droite" };
export const SIDE_SHORT = { L: "G", R: "D", both: "G+D" };

export const MILKS = { breast: "Lait maternel", formula: "Lait infantile" };

// Poop colours: the 6 of the usual paediatric stool colour cards. Shown as
// coloured dots WITH their name (never colour alone). Decided 2026-11-15
// (Rom: "fais tout"), to check with the midwife if needed.
export const POOP_COLORS = {
  black:  { label: "Noir (méconium)", hex: "#2B2A26" },
  green:  { label: "Vert",            hex: "#5E7A2E" },
  yellow: { label: "Jaune",           hex: "#D9B13B" },
  brown:  { label: "Brun",            hex: "#8A5A2B" },
  pale:   { label: "Pâle / blanc",    hex: "#E9E4D4" },
  red:    { label: "Rouge",           hex: "#B23A32" },
};
export const POOP_TEXTURES = {
  liquid: "Liquide",
  seedy:  "Grumeleuse",
  pasty:  "Pâteuse",
  formed: "Moulée",
};

export const SPIT_KINDS = { spit_up: "Régurgitation", vomit: "Vomissement" };
export const SPIT_SIZES = { small: "Petite", large: "Grande", projectile: "En jet" };

export const MEASURE_SOURCES = ["Maternité", "Sage-femme", "ONE / Kind en Gezin", "Pédiatre", "Maison"];

// Bottle / pump buttons (ml)
export const ML_STEPS = [10, 30, -10];
export const DEFAULT_BOTTLE_ML = 60;
export const DEFAULT_TEMPERATURE = 37.0;


// ---------------------------------------------------------------------
// Breastfeeding
// ---------------------------------------------------------------------
// No chrono (Rom, 2026-11-15): what matters is WHICH breast. A feed is one
// entry: data = { sides: ["L"] | ["R"] | ["L","R"] | ["R","L"] (order used),
// minutes?: total duration, optional }. Older test entries with
// data.segments (chrono version) are still read.

// The choices offered when logging a feed (2 taps: Tétée, then one of these).
export const FEED_CHOICES = [
  { id: "L", sides: ["L"], label: "Gauche", short: "G" },
  { id: "R", sides: ["R"], label: "Droite", short: "D" },
  { id: "LR", sides: ["L", "R"], label: "Gauche puis droite", short: "G → D" },
  { id: "RL", sides: ["R", "L"], label: "Droite puis gauche", short: "D → G" },
];
export const FEED_MINUTES = [5, 10, 15, 20, 30];

export function feedSides(event) {
  const d = (event && event.data) || {};
  if (Array.isArray(d.sides)) return d.sides;
  return (d.segments || []).map((s) => s.side);
}

// Total minutes of a feed, or null when not given.
export function feedMinutes(event) {
  const d = (event && event.data) || {};
  if (d.minutes != null) return Number(d.minutes);
  if (d.segments && d.segments.length && d.segments.every((s) => s.end)) {
    return Math.round(d.segments.reduce((sum, s) => sum + (Date.parse(s.end) - Date.parse(s.start)), 0) / 60000);
  }
  return null;
}

// The side to offer next = the opposite of the LAST side used in the last
// feed ("Gauche puis droite" -> next is Gauche).
export function nextBreast(events) {
  const last = latest(events, "breastfeed");
  if (!last) return null;
  const sides = feedSides(last);
  const side = sides[sides.length - 1];
  return side === "L" ? "R" : side === "R" ? "L" : null;
}

// ---------------------------------------------------------------------
// Lists of events
// ---------------------------------------------------------------------

// Only events that count (not deleted).
export function live(events) {
  return events.filter((e) => !e.deleted_at);
}

// The most recent event of a type (by start time), or null.
export function latest(events, type) {
  let best = null;
  for (const e of events) {
    if (e.deleted_at || e.type !== type) continue;
    if (!best || e.started_at > best.started_at) best = e;
  }
  return best;
}

// Running chronos (feed / sleep without an end), newest first.
export function running(events) {
  return live(events)
    .filter((e) => TYPES[e.type] && TYPES[e.type].timer && !e.ended_at)
    .sort((a, b) => b.started_at.localeCompare(a.started_at));
}

// Medication names + doses already used, most used first (Plus → Médicament).
export function medicationSuggestions(events, max = 6) {
  const count = new Map();
  for (const e of live(events)) {
    if (e.type !== "medication" || !e.data || !e.data.name) continue;
    const key = `${e.data.name}\u0000${e.data.dose || ""}`;
    const prev = count.get(key) || { name: e.data.name, dose: e.data.dose || "", n: 0, last: "" };
    prev.n += 1;
    if (e.started_at > prev.last) prev.last = e.started_at;
    count.set(key, prev);
  }
  return [...count.values()].sort((a, b) => b.n - a.n || b.last.localeCompare(a.last)).slice(0, max);
}


// ---------------------------------------------------------------------
// Words
// ---------------------------------------------------------------------

// One line that sums up an event ("G 12 min · D 8 min", "90 ml · maternel"...).
export function summary(event, now = Date.now()) {
  const d = event.data || {};
  switch (event.type) {
    case "breastfeed": {
      const sides = feedSides(event).map((s) => SIDE_SHORT[s]).join(" → ");
      const minutes = feedMinutes(event);
      return [sides || "—", minutes != null ? fmtMinutes(minutes) : null].filter(Boolean).join(" · ");
    }
    case "bottle":
      return [d.ml != null ? `${d.ml} ml` : null, d.milk ? (d.milk === "breast" ? "maternel" : "infantile") : null].filter(Boolean).join(" · ");
    case "pump":
      return [d.side ? SIDE_SHORT[d.side] : null, d.ml != null ? `${d.ml} ml` : null].filter(Boolean).join(" · ");
    case "diaper": {
      const what = d.pee && d.poop ? "Pipi + caca" : d.poop ? "Caca" : d.pee ? "Pipi" : "Sec";
      const extra = [d.poop_color && POOP_COLORS[d.poop_color] ? POOP_COLORS[d.poop_color].label.toLowerCase() : null,
        d.poop_texture ? (POOP_TEXTURES[d.poop_texture] || "").toLowerCase() : null].filter(Boolean);
      return extra.length ? `${what} · ${extra.join(", ")}` : what;
    }
    case "sleep":
      return event.ended_at ? fmtDuration(Date.parse(event.ended_at) - Date.parse(event.started_at)) : "en cours";
    case "spit_up":
      return [SPIT_KINDS[d.kind] || "Régurgitation", d.size ? (SPIT_SIZES[d.size] || "").toLowerCase() : null].filter(Boolean).join(" · ");
    case "temperature":
      return d.celsius != null ? `${fmtNumber(d.celsius, 1)} °C` : "";
    case "medication":
      return [d.name, d.dose].filter(Boolean).join(" · ");
    default:
      return "";
  }
}

export function label(type) {
  return TYPES[type] ? TYPES[type].label : type;
}

export function emoji(type) {
  return TYPES[type] ? TYPES[type].emoji : "•";
}

export function fmtMinutes(minutes) {
  return `${Math.round(minutes)} min`;
}

// 75 min -> "1 h 15", 9 min -> "9 min", 40 s -> "0 min"
export function fmtDuration(ms) {
  const minutes = Math.max(0, Math.round(ms / 60000));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} h ${String(m).padStart(2, "0")}` : `${h} h`;
}

// Chrono display: "12:05" (mm:ss) or "1:02:05"
export function fmtChrono(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(h ? 2 : 1, "0");
  return h ? `${h}:${mm}:${String(s).padStart(2, "0")}` : `${mm}:${String(s).padStart(2, "0")}`;
}

// "il y a 2 h 15" / "il y a 5 min" / "à l'instant"
export function ago(iso, now = Date.now()) {
  const ms = now - Date.parse(iso);
  if (ms < 60000) return "à l'instant";
  return `il y a ${fmtDuration(ms)}`;
}

export function fmtNumber(value, decimals = 0) {
  return Number(value).toLocaleString("fr-BE", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}
