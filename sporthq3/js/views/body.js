// Body & goals (opened from the Me tab): #/body
//   - weight: quick weigh-in, goal progress, trend chart, list
//   - personal bests: found automatically in your runs, plus records you add

import {
  listWeighIns, saveWeighIn, deleteWeighIn, getSettings, saveWeightGoal,
  listRunsWithTimes, listPersonalBests, savePersonalBest, deletePersonalBest,
} from "../storage.js?v=202610232118";
import { PB_DISTANCES, PB_RULES, WEIGHT_TREND_POINTS } from "../rules.js?v=202610232118";
import { todayISO, addDays, formatDayLabel } from "../utils/dates.js?v=202610232118";
import { escapeHtml, formatDuration, parseDuration, formatSpeed, numHtml } from "../utils/format.js?v=202610232118";
import { autoPersonalBests, distanceKeyOf, weightTrend } from "../utils/body.js?v=202610232118";
import { drawWeightChart } from "../utils/weightChart.js?v=202610232118";
import { showToast } from "../utils/toast.js?v=202610232118";
import { icon } from "../utils/icons.js?v=202610232118";

const RANGE_KEY = "sporthq3.weightRange";
const RANGES = [
  { key: "3m", label: "3 months", days: 91 },
  { key: "6m", label: "6 months", days: 182 },
  { key: "1y", label: "1 year", days: 365 },
  { key: "all", label: "All", days: null },
];

export function render(container) {
  container.innerHTML = `
    <!-- Laptop: weight + PBs on the left, the chart on the right -->
    <div class="body-page">
      <section class="card" id="weight-card"><p class="muted">Loading…</p></section>
      <section class="card" id="chart-card" hidden></section>
      <section class="card" id="pb-card"><p class="muted">Looking for your personal bests…</p></section>
    </div>
  `;
  drawWeight(container);
  drawPersonalBests(container.querySelector("#pb-card"));
}

const parseKg = (text) => {
  const value = Number(String(text).trim().replace(",", "."));
  return String(text).trim() !== "" && Number.isFinite(value) && value >= 20 && value <= 300 ? value : null;
};
const kgText = (n) => `${Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 })} kg`;


// ---------------------------------------------------------------------
// Weight
// ---------------------------------------------------------------------

async function drawWeight(container) {
  const card = container.querySelector("#weight-card");
  const chartCard = container.querySelector("#chart-card");
  let weighIns = [];
  let settings = {};
  try {
    [weighIns, settings] = await Promise.all([listWeighIns(), getSettings()]);
  } catch (error) {
    card.innerHTML = `<p class="status error"></p>`;
    card.querySelector(".status").textContent = "Could not load your weight: " + error.message;
    return;
  }

  const latest = weighIns[weighIns.length - 1] || null;
  const start = settings.start_weight_kg != null ? Number(settings.start_weight_kg) : (weighIns[0] ? Number(weighIns[0].weight_kg) : null);
  const target = settings.target_weight_kg != null ? Number(settings.target_weight_kg) : null;

  card.innerHTML = `
    <h2>Weight</h2>
    <!-- Today / Other day chips like the log form (30b): the date box only shows
         for another day, so kg + Save keep a whole row on a phone. -->
    <form id="weigh-form" class="weigh-form" novalidate>
      <div class="chip-row weigh-when" id="weigh-when">
        <button type="button" class="chip-button" data-when="today" aria-pressed="true">Today</button>
        <button type="button" class="chip-button" data-when="other" aria-pressed="false">${icon("calendar")} Other day</button>
      </div>
      <input type="date" name="weigh_date" value="${todayISO()}" aria-label="Date" hidden>
      <div class="add-item">
        <input type="text" name="weight_kg" inputmode="decimal" autocomplete="off" placeholder="kg" aria-label="Weight in kg">
        <button type="submit" class="button primary">Save</button>
      </div>
    </form>
    <p id="weigh-status" class="status" role="status"></p>
    ${latest ? `<p class="weight-latest">Latest: <strong>${numHtml(kgText(latest.weight_kg))}</strong> <span class="muted small">· ${escapeHtml(formatDayLabel(latest.weigh_date))}</span></p>` : ""}
    ${goalHtml(start, target, latest)}
    <details class="goal-edit">
      <summary>${target ? "Change my goal" : "Set my goal"}</summary>
      <form id="goal-form" class="field-row" novalidate>
        <div><label for="g-start">Start (kg)</label>
          <input id="g-start" name="start" type="text" inputmode="decimal" value="${start ?? ""}"></div>
        <div><label for="g-target">Target (kg)</label>
          <input id="g-target" name="target" type="text" inputmode="decimal" value="${target ?? ""}"
                 placeholder="${start ? Math.round((start - 5) * 10) / 10 : ""}"></div>
        <button type="submit" class="button">Save goal</button>
      </form>
    </details>
  `;

  const status = card.querySelector("#weigh-status");
  // Today / Other day (30b): "Other day" shows the date box; "Today" hides it and resets it to today.
  card.querySelector("#weigh-when").addEventListener("click", (event) => {
    const chip = event.target.closest("[data-when]");
    if (!chip) return;
    const other = chip.dataset.when === "other";
    for (const c of card.querySelectorAll("#weigh-when [data-when]")) c.setAttribute("aria-pressed", String(c === chip));
    const dateBox = card.querySelector('input[name="weigh_date"]');
    dateBox.hidden = !other;
    if (other) dateBox.focus();
    else dateBox.value = todayISO();
  });
  card.querySelector("#weigh-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const kg = parseKg(form.elements.weight_kg.value);
    if (!kg) {
      status.textContent = "Weight not understood (e.g. 82,4).";
      status.className = "status error";
      return;
    }
    try {
      await saveWeighIn({ weigh_date: form.elements.weigh_date.value || todayISO(), weight_kg: kg });
      showToast(`${kgText(kg)} saved`);
      drawWeight(container);
    } catch (error) {
      status.textContent = "Could not save: " + error.message;
      status.className = "status error";
    }
  });

  card.querySelector("#goal-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const startKg = parseKg(form.elements.start.value);
    const targetKg = parseKg(form.elements.target.value);
    if (!startKg || !targetKg) return showToast("Fill in both weights (e.g. 84 and 79).");
    try {
      await saveWeightGoal({ start_weight_kg: startKg, target_weight_kg: targetKg });
      showToast("Goal saved");
      drawWeight(container);
    } catch (error) {
      showToast("Could not save the goal: " + error.message);
    }
  });


  drawChartCard(chartCard, weighIns, target, () => drawWeight(container));
}

// "−2.3 kg of −5 kg · 46%" with a bar.
function goalHtml(start, target, latest) {
  if (!target || !start || !latest) {
    return target ? `<p class="muted">Goal: ${kgText(target)}</p>` : "";
  }
  const goal = start - target;                     // e.g. 5 kg to lose
  const done = start - Number(latest.weight_kg);   // e.g. 2.3 kg lost so far
  const percent = goal ? Math.max(0, Math.min(100, Math.round((done / goal) * 100))) : 0;
  const sign = (n) => (n > 0 ? "−" : n < 0 ? "+" : "") + Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return `
    <p class="goal-line">${icon("target")} <strong>${sign(done)} kg</strong> of ${sign(goal)} kg · ${percent}%
      <span class="muted small">(${kgText(start)} → ${kgText(target)})</span></p>
    <span class="bar" role="img" aria-label="${percent}% of the goal"><span class="bar-fill" style="width: ${percent}%"></span></span>`;
}

function readRange() {
  try { return localStorage.getItem(RANGE_KEY) || "6m"; } catch { return "6m"; }
}

function drawChartCard(card, weighIns, target, refresh) {
  if (!weighIns.length) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  let range = readRange();
  // The trend is computed on ALL weigh-ins, so the first point of a short
  // period still averages the weigh-ins just before it.
  const trend = weightTrend(weighIns);

  function draw() {
    const days = (RANGES.find((r) => r.key === range) || RANGES[1]).days;
    const from = days ? addDays(todayISO(), -days) : "";
    const keep = weighIns.map((w, i) => i).filter((i) => weighIns[i].weigh_date >= from);
    card.innerHTML = `
      <h2>Trend <span class="muted small">(average of the last ${WEIGHT_TREND_POINTS} weigh-ins)</span></h2>
      <div class="chip-row">${RANGES.map((r) => `
        <button type="button" class="chip-button" data-range="${r.key}" aria-pressed="${r.key === range}">${r.label}</button>`).join("")}</div>
      <div id="weight-chart"></div>
      ${weighIns.length ? `
      <details class="weigh-list">
        <summary>All weigh-ins (${weighIns.length})</summary>
        <ul class="checklist">${weighIns.slice().reverse().map((w) => `
          <li><span>${escapeHtml(formatDayLabel(w.weigh_date))} · <strong>${kgText(w.weight_kg)}</strong></span>
            <button type="button" class="button small-button danger" data-delete="${w.id}" aria-label="Delete">${icon("x")}</button></li>`).join("")}
        </ul>
        <p class="hint">To correct a weigh-in, save the right weight on the same date.</p>
      </details>` : ""}
    `;
    drawWeightChart(card.querySelector("#weight-chart"), {
      weighIns: keep.map((i) => weighIns[i]),
      trend: keep.map((i) => trend[i]),
      targetKg: target,
    });
  }
  card.onclick = (event) => {
    const remove = event.target.closest("[data-delete]");
    if (remove) {
      if (!window.confirm("Delete this weigh-in?")) return;
      deleteWeighIn(remove.dataset.delete).then(refresh, (error) => showToast("Could not delete: " + error.message));
      return;
    }
    const chip = event.target.closest("[data-range]");
    if (!chip) return;
    range = chip.dataset.range;
    try { localStorage.setItem(RANGE_KEY, range); } catch { /* not important */ }
    draw();
  };
  draw();
}


// ---------------------------------------------------------------------
// Personal bests
// ---------------------------------------------------------------------

async function drawPersonalBests(card) {
  let runs = [];
  let manual = [];
  try {
    [runs, manual] = await Promise.all([listRunsWithTimes(), listPersonalBests()]);
  } catch (error) {
    card.innerHTML = `<p class="status error"></p>`;
    card.querySelector(".status").textContent = "Could not load: " + error.message;
    return;
  }
  const auto = autoPersonalBests(runs);
  const otherManual = manual.filter((pb) => !distanceKeyOf(pb.distance_km));

  const rows = PB_DISTANCES.map((distance) => {
    const fromLog = auto[distance.key];
    const typed = manual.filter((pb) => distanceKeyOf(pb.distance_km) === distance.key)
      .sort((a, b) => a.time_s - b.time_s)[0];
    // The best of the two wins.
    const useTyped = typed && (!fromLog || typed.time_s <= fromLog.estimated_s);
    if (!fromLog && !typed) {
      return `<li class="pb-row"><span class="pb-label">${escapeHtml(distance.label)}</span><span class="muted">—</span></li>`;
    }
    if (useTyped) {
      return `
        <li class="pb-row">
          <span class="pb-label">${escapeHtml(distance.label)}</span>
          <span><strong>${formatDuration(typed.time_s)}</strong>
            <span class="muted small">${formatSpeed("per_km", typed.time_s, distance.km)}
            · ${typed.achieved_on ? escapeHtml(formatDayLabel(typed.achieved_on)) : "date unknown"} · added by hand</span></span>
        </li>`;
    }
    const run = fromLog.run;
    return `
      <li class="pb-row">
        <span class="pb-label">${escapeHtml(distance.label)}</span>
        <span><strong>${fromLog.exact ? "" : "≈ "}${formatDuration(fromLog.estimated_s)}</strong>
          <span class="muted small">${formatSpeed("per_km", fromLog.estimated_s, distance.km)} ·
            <a href="#/log/${run.id}">${escapeHtml(formatDayLabel(run.activity_date))}: ${Number(run.distance_km)} km in ${formatDuration(run.duration_s)}</a></span></span>
      </li>`;
  }).join("");

  card.innerHTML = `
    <h2>Personal bests</h2>
    <ul class="pb-list">${rows}</ul>
    <p class="hint">Found in your ${runs.length} logged runs: a run counts for a distance if it's up to
      ${Math.round((PB_RULES.maxRatio - 1) * 100)}% longer; "≈" = its time scaled to the exact distance by its pace.</p>
    ${otherManual.length ? `<h3 class="sheet-subtitle">Other records</h3><ul class="pb-list">${otherManual.map((pb) => `
      <li class="pb-row"><span class="pb-label">${escapeHtml(pb.label)}</span>
        <span><strong>${formatDuration(pb.time_s)}</strong> <span class="muted small">${Number(pb.distance_km)} km</span></span></li>`).join("")}</ul>` : ""}
    <details class="goal-edit">
      <summary>Records added by hand (${manual.length})</summary>
      ${manual.length ? `<ul class="checklist">${manual.map((pb) => `
        <li><span>${escapeHtml(pb.label)} · <strong>${formatDuration(pb.time_s)}</strong>
          <span class="muted small">${pb.achieved_on ? escapeHtml(formatDayLabel(pb.achieved_on)) : ""}</span></span>
          <button type="button" class="button small-button danger" data-delete-pb="${pb.id}" aria-label="Delete">${icon("x")}</button></li>`).join("")}</ul>` : ""}
      <form id="pb-form" class="form" novalidate>
        <div class="field-row">
          <div><label for="pb-distance">Distance</label>
            <select id="pb-distance" name="distance">
              ${PB_DISTANCES.map((d) => `<option value="${d.key}">${escapeHtml(d.label)}</option>`).join("")}
            </select></div>
          <div><label for="pb-time">Time</label>
            <input id="pb-time" name="time" type="text" inputmode="decimal" autocomplete="off" placeholder="46:00"></div>
        </div>
        <label for="pb-date">Date <span class="muted">(optional)</span></label>
        <input id="pb-date" name="achieved_on" type="date">
        <button type="submit" class="button">Add record</button>
      </form>
    </details>
  `;

  card.querySelector("#pb-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = event.target;
    const distance = PB_DISTANCES.find((d) => d.key === form.elements.distance.value);
    const time = parseDuration(form.elements.time.value);
    if (!time) return showToast("Time not understood. Use 46:00 or 1:42:30.");
    try {
      await savePersonalBest({
        label: distance.label, distance_km: distance.km, time_s: time,
        achieved_on: form.elements.achieved_on.value || null,
      });
      showToast(`${distance.label} record added`);
      drawPersonalBests(card);
    } catch (error) {
      showToast("Could not save: " + error.message);
    }
  });

  // onclick (not addEventListener): a redraw replaces it instead of adding a second one.
  card.onclick = async (event) => {
    const button = event.target.closest("[data-delete-pb]");
    if (!button || !window.confirm("Delete this record?")) return;
    try {
      await deletePersonalBest(button.dataset.deletePb);
      drawPersonalBests(card);
    } catch (error) {
      showToast("Could not delete: " + error.message);
    }
  };
}
