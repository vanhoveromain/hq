// season.js — which football season a day belongs to (see FOOTBALL_SEASON).

import { FOOTBALL_SEASON } from "../rules.js?v=202610261241";

const pad = (n) => String(n).padStart(2, "0");

// Returns { from, to, label, finished } for the season of `today`, or the
// last finished one when `today` is between two seasons.
export function currentSeason(today) {
  const year = Number(today.slice(0, 4));
  const { start, end } = FOOTBALL_SEASON;
  const startOf = (y) => `${y}-${pad(start.month)}-${pad(start.day)}`;
  const endOf = (y) => `${y + 1}-${pad(end.month)}-${pad(end.day)}`; // season starting in y ends in y+1
  // The season that started most recently (on or before today).
  const startYear = today >= startOf(year) ? year : year - 1;
  return {
    from: startOf(startYear),
    to: endOf(startYear),
    label: `${startYear}–${String(startYear + 1).slice(2)}`,
    finished: today > endOf(startYear),
  };
}
