// body.js — calculations for Body & goals (no database here, just maths).

import { PB_DISTANCES, PB_RULES, WEIGHT_TREND_POINTS } from "../rules.js?v=202610232058";

// Best run for each PB distance.
// Returns { "10k": { estimated_s, exact, run } | null, ... }
//   estimated_s: the run's real time when it's (almost) exactly the distance
//                (up to 50 m longer), else its time scaled by its pace
//   exact: true in the first case (shown without "≈")
export function autoPersonalBests(runs) {
  const result = {};
  for (const distance of PB_DISTANCES) {
    let best = null;
    for (const run of runs) {
      const km = Number(run.distance_km);
      if (km < distance.km || km > distance.km * PB_RULES.maxRatio) continue;
      // (Almost) exactly the distance: its real time. Longer: scaled by pace.
      const exact = km - distance.km <= 0.05;
      const estimated = exact ? run.duration_s : Math.round(run.duration_s * (distance.km / km));
      if (!best || estimated < best.estimated_s) {
        best = { estimated_s: estimated, exact, run };
      }
    }
    result[distance.key] = best;
  }
  return result;
}

// Which PB distance a manual record belongs to (same km, ±1%), or null.
export function distanceKeyOf(km) {
  const match = PB_DISTANCES.find((d) => Math.abs(Number(km) - d.km) <= d.km * 0.01);
  return match ? match.key : null;
}

// Trend = average of the last N weigh-ins at each point (smooths the
// day-to-day ups and downs). Returns [{ date, kg }].
export function weightTrend(weighIns, points = WEIGHT_TREND_POINTS) {
  return weighIns.map((w, i) => {
    const window = weighIns.slice(Math.max(0, i - points + 1), i + 1);
    const kg = window.reduce((sum, x) => sum + Number(x.weight_kg), 0) / window.length;
    return { date: w.weigh_date, kg: Math.round(kg * 100) / 100 };
  });
}
