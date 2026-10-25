// stats.js — the maths behind the Stats page (no database, no HTML here).

import { addDays, startOfWeek } from "./dates.js?v=202610252233";

// The periods you can pick. Returns { from, to } (both included).
export const PERIODS = [
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "year", label: "This year" },
  { key: "12m", label: "Last 12 months" },
  { key: "all", label: "All time" },
];

export function periodRange(key, today) {
  const year = today.slice(0, 4);
  if (key === "week") {
    const monday = startOfWeek(today);
    return { from: monday, to: addDays(monday, 6) };
  }
  if (key === "month") {
    const first = today.slice(0, 7) + "-01";
    const [y, m] = first.split("-").map(Number);
    const next = `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
    return { from: first, to: addDays(next, -1) };
  }
  if (key === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (key === "12m") return { from: addDays(today, -364), to: today };
  return { from: "1900-01-01", to: today };
}

// How to group a period in the chart: by week (up to ~3 months), by month
// (up to 3 years), otherwise by year.
export function bucketUnit(from, to) {
  const days = (Date.parse(to) - Date.parse(from)) / 86400000;
  if (days <= 93) return "week";
  if (days <= 3 * 366) return "month";
  return "year";
}

export function bucketKey(date, unit) {
  if (unit === "week") return startOfWeek(date);
  if (unit === "month") return date.slice(0, 7);
  return date.slice(0, 4);
}

// Every bucket between two days (so empty weeks/months still show as 0).
export function bucketKeys(from, to, unit) {
  const keys = [];
  let day = from;
  while (day <= to) {
    const key = bucketKey(day, unit);
    if (keys[keys.length - 1] !== key) keys.push(key);
    day = unit === "week" ? addDays(startOfWeek(day), 7)
      : unit === "month" ? nextMonth(day) : `${Number(day.slice(0, 4)) + 1}-01-01`;
  }
  return keys;
}

function nextMonth(day) {
  const [y, m] = day.split("-").map(Number);
  return `${m === 12 ? y + 1 : y}-${String(m === 12 ? 1 : m + 1).padStart(2, "0")}-01`;
}

const sum = (list, pick) => list.reduce((total, item) => total + (Number(pick(item)) || 0), 0);

// Totals for a list of activities.
export function overview(activities) {
  const withRpe = activities.filter((a) => a.rpe);
  const perSport = {};
  for (const a of activities) perSport[a.sport] = (perSport[a.sport] || 0) + 1;
  return {
    sessions: activities.length,
    seconds: sum(activities, (a) => a.duration_s),
    km: sum(activities, (a) => a.distance_km),
    elevation: sum(activities, (a) => a.elevation_m),
    avgRpe: withRpe.length ? sum(withRpe, (a) => a.rpe) / withRpe.length : null,
    perSport,
    missingTime: activities.some((a) => a.duration_s == null),
  };
}

// Running details. `weeks` = length of the period in weeks (for "per week").
export function runningStats(runs, weeks) {
  const timed = runs.filter((a) => a.duration_s && a.distance_km);
  const km = sum(runs, (a) => a.distance_km);
  const longest = runs.reduce((best, a) => (Number(a.distance_km) > Number(best?.distance_km || 0) ? a : best), null);
  const highest = runs.reduce((best, a) => (Number(a.elevation_m) > Number(best?.elevation_m || 0) ? a : best), null);
  return {
    runs: runs.length,
    km,
    kmPerWeek: weeks ? km / weeks : 0,
    avgPaceS: timed.length ? sum(timed, (a) => a.duration_s) / sum(timed, (a) => a.distance_km) : null,
    longest,
    highest: highest && highest.elevation_m ? highest : null,
  };
}

// Football: matches + what the match cards say.
export function footballStats(activities) {
  const matches = activities.filter((a) => a.sport === "football" && a.session_type === "match");
  const cards = matches.map((m) => m.match_stats).filter(Boolean);
  const trainings = activities.filter((a) => a.sport === "football" && a.session_type !== "match").length;
  return {
    matches: matches.length,
    withCard: cards.length,
    minutes: sum(cards, (c) => c.minutes_played),
    goals: sum(cards, (c) => c.goals),
    assists: sum(cards, (c) => c.assists),
    trainings,
  };
}

// How many sessions of each type, most frequent first.
export function countByType(activities, labelOf) {
  const counts = {};
  for (const a of activities) {
    const label = labelOf(a);
    counts[label] = (counts[label] || 0) + 1;
  }
  return Object.entries(counts).sort((x, y) => y[1] - x[1]);
}

// Plan vs done: planned sessions up to today (not cancelled) that were done.
export function adherence(planned, today) {
  const due = planned.filter((p) => p.session_date <= today && p.status !== "cancelled");
  const done = due.filter((p) => p.status === "done").length;
  return { due: due.length, done, percent: due.length ? Math.round((done / due.length) * 100) : null };
}

// Sessions per week (Monday -> count).
export function sessionsPerWeek(activities) {
  const weeks = {};
  for (const a of activities) {
    const monday = startOfWeek(a.activity_date);
    weeks[monday] = (weeks[monday] || 0) + 1;
  }
  return weeks;
}

// Weeks in a row (ending this week, or last week if this one isn't there
// yet) with at least `min` sessions.
export function currentStreak(activities, today, min) {
  const weeks = sessionsPerWeek(activities);
  let monday = startOfWeek(today);
  if ((weeks[monday] || 0) < min) monday = addDays(monday, -7);
  let streak = 0;
  while ((weeks[monday] || 0) >= min) {
    streak++;
    monday = addDays(monday, -7);
  }
  return streak;
}

export function busiestWeek(activities) {
  const weeks = sessionsPerWeek(activities);
  let best = null;
  for (const [monday, count] of Object.entries(weeks)) if (!best || count > best.count) best = { monday, count };
  return best;
}
