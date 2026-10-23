// Races tab.
//   #/races        -> Upcoming / Ideas / Past
//   #/races/new    -> a new race
//   #/races/<id>   -> a race: summary (Edit = details form), checklist, race routine

import {
  listRaces, getRace, saveRace, deleteRace, listTrainingBlocks, listRaceSessions, listRaceActivities, listPlannedSessions, listRunsOn, linkActivityToRace,
  listPersonalBests, savePersonalBest,
  addChecklistItems, updateChecklistItem, deleteChecklistItem, findLastChecklist,
} from "../storage.js?v=202610231441";
import { releaseWorkoutOf } from "../utils/savedWorkout.js?v=202610231441";
import { RACE_STATUSES, STARTER_CHECKLIST, RACE_ROUTINE, sportIcon, sessionTypeLabel } from "../rules.js?v=202610231441";
import { todayISO, formatDayLabel, startOfWeek, addDays, parseISODate } from "../utils/dates.js?v=202610231441";
import { escapeHtml, formatDuration, parseDuration, formatSpeed, formatKm, numHtml } from "../utils/format.js?v=202610231441";
import { sportBadge } from "../utils/plan.js?v=202610231441";
import { blockWeek } from "./blocks.js?v=202610231441";
import { addRaceRoutine, moveRaceRoutine, removeRaceRoutine } from "../utils/raceRoutine.js?v=202610231441";
import { showToast } from "../utils/toast.js?v=202610231441";
import { icon } from "../utils/icons.js?v=202610231441";
import { setTopbarAction, clearTopbarAction } from "../utils/topbar.js?v=202610231441";

export function render(container, { params = [] } = {}) {
  if (params[0] === "new") return renderRace(container, null);
  if (params[0]) return renderRace(container, params[0]);
  renderList(container);
}


// ---------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------

// Which group a race goes in (shown in this order since 2026-10-23: upcoming, past, ideas):
//   upcoming = a date from today on, and "to register" or "registered"
//   past     = finished, cancelled, or a date before today
//   ideas    = everything else (no date yet, or an idea / potential race)
function groupOf(race, today) {
  if (race.status === "finished" || race.status === "cancelled") return "past";
  if (race.race_date && race.race_date < today) return "past";
  if (race.race_date && (race.status === "to_register" || race.status === "registered")) return "upcoming";
  return "ideas";
}

// Past races shown before "Show all" (26): the list keeps the ideas in sight.
const PAST_SHOWN = 5;

async function renderList(container) {
  container.innerHTML = `
    <div class="wide-page">
    <a href="#/races/new" class="button primary add-button">+ Add a race</a>
    <div id="race-list"><p class="muted">Loading…</p></div>
    </div>
  `;
  const listEl = container.querySelector("#race-list");
  try {
    const races = await listRaces();
    const today = todayISO();
    const upcoming = races.filter((r) => groupOf(r, today) === "upcoming")
      .sort((a, b) => a.race_date.localeCompare(b.race_date));
    const ideas = races.filter((r) => groupOf(r, today) === "ideas")
      .sort((a, b) => (a.race_date || "9999").localeCompare(b.race_date || "9999") || a.name.localeCompare(b.name));
    const past = races.filter((r) => groupOf(r, today) === "past")
      .sort((a, b) => (b.race_date || "").localeCompare(a.race_date || ""));

    listEl.innerHTML = `
      <section class="week">
        <h2 class="week-title"><span>${icon("flag")} Upcoming</span><span class="muted">${upcoming.length}</span></h2>
        ${upcoming.length ? `<div class="card-grid">${upcoming.map((r) => raceCardHtml(r, today, "upcoming")).join("")}</div>`
          : `<p class="muted">No race booked. Set a race to "To register" or "Registered" (with a date) to see it here.</p>`}
      </section>
      ${past.length ? `
        <details class="retired" open>
          <summary>Past races (${past.length})</summary>
          <div class="card-grid" id="past-grid">${past.slice(0, PAST_SHOWN).map((r) => raceCardHtml(r, today, "past")).join("")}</div>
          ${past.length > PAST_SHOWN ? `
            <button type="button" class="link-button show-all-past" data-show-all-past>Show all ${past.length} past races</button>` : ""}
        </details>` : ""}
      ${ideas.length ? `
        <section class="week">
          <h2 class="week-title"><span>${icon("lightbulb")} Ideas</span><span class="muted">${ideas.length}</span></h2>
          <div class="card-grid">${ideas.map((r) => raceCardHtml(r, today, "ideas")).join("")}</div>
        </section>` : ""}
    `;
    // The bin on an idea card (24a): delete it straight from the list.
    // onclick (not addEventListener) so a redraw never piles up listeners.
    listEl.onclick = async (event) => {
      // "Show all N past races" (26): add the older ones in place.
      const showAll = event.target.closest("[data-show-all-past]");
      if (showAll) {
        listEl.querySelector("#past-grid").insertAdjacentHTML("beforeend",
          past.slice(PAST_SHOWN).map((r) => raceCardHtml(r, today, "past")).join(""));
        showAll.remove();
        return;
      }
      const button = event.target.closest("[data-delete-idea]");
      if (!button) return;
      const race = ideas.find((r) => r.id === button.dataset.deleteIdea);
      if (race && await deleteIdea(race)) renderList(container);
    };
  } catch (error) {
    listEl.innerHTML = `<p class="status error"></p>`;
    listEl.querySelector(".status").textContent = "Could not load races: " + error.message;
  }
}

// Each group has its own card:
//   upcoming = the big countdown, goal and checklist progress
//   ideas    = light and dashed: a "maybe"
//   past     = the result first (cancelled / never run = greyed)
function raceCardHtml(race, today, group) {
  const status = RACE_STATUSES[race.status];
  const facts = [
    race.distance_km ? `${Number(race.distance_km)} km` : "",
    race.elevation_m ? `${race.elevation_m} m D+` : "",
    race.location || "",
  ].filter(Boolean).join(" · ");
  const href = `#/races/${encodeURIComponent(race.id)}`;
  const chip = status ? `<span class="chip">${status.label}</span>` : "";

  if (group === "upcoming") {
    const days = Math.round((Date.parse(race.race_date) - Date.parse(today)) / 86400000);
    const ready = race.checklist ? race.checklist.filter((i) => i.done).length : 0;
    const total = race.checklist ? race.checklist.length : 0;
    return `
      <a class="card race-card race-upcoming" href="${href}">
        <span class="race-top"><strong>${escapeHtml(race.name)}</strong>${chip}</span>
        <span class="race-countdown">${days === 0 ? "Today!" : days === 1 ? "Tomorrow" : `${days} <span>days</span>`}</span>
        <span class="muted small">${formatDayLabel(race.race_date)}${facts ? ` · ${escapeHtml(facts)}` : ""}</span>
        ${race.goal_time_s ? `<span class="small">${icon("target")} Goal ${formatDuration(race.goal_time_s)}${escapeHtml(paceText(race.goal_time_s, race.distance_km))}</span>` : ""}
        ${total ? `<span class="small">${icon("check", { className: "is-ok" })} Checklist ${ready} / ${total}</span>` : ""}
      </a>`;
  }

  if (group === "ideas") {
    // The bin sits NEXT to the link (a button inside a link isn't allowed),
    // placed in the card's corner by CSS (24a).
    return `
      <div class="race-idea-item">
        <a class="card race-card race-idea" href="${href}">
          <span class="race-top"><strong>${icon("lightbulb")} ${escapeHtml(race.name)}</strong>${chip}</span>
          <span class="muted small">${race.race_date ? formatDayLabel(race.race_date) : "No date yet"}${facts ? ` · ${escapeHtml(facts)}` : ""}</span>
        </a>
        <button type="button" class="race-idea-delete" data-delete-idea="${escapeHtml(race.id)}"
                aria-label="Delete the idea ${escapeHtml(race.name)}" title="Delete this idea">${icon("trash-2")}</button>
      </div>`;
  }

  // Past: finished with a result, or cancelled / never run.
  const ran = race.status === "finished";
  return `
    <a class="card race-card race-past ${ran ? "" : "is-not-run"}" href="${href}">
      <span class="race-top"><strong>${escapeHtml(race.name)}</strong>${ran ? "" : chip}</span>
      ${ran && race.result_time_s ? `<span class="race-result">${formatDuration(race.result_time_s)}
        <span class="muted small">${escapeHtml(paceText(race.result_time_s, race.distance_km).replace(/[()]/g, "").trim())}</span></span>` : ""}
      <span class="muted small">${race.race_date ? formatDayLabel(race.race_date) : "No date"}${facts ? ` · ${escapeHtml(facts)}` : ""}</span>
      ${ran && !race.result_time_s ? `<span class="small muted">${icon("flag")} Finished · no result time yet</span>` : ""}
    </a>`;
}

// " (4:36 /km)" or "" when we can't compute it.
function paceText(seconds, km) {
  const pace = formatSpeed("per_km", seconds, Number(km));
  return pace ? ` (${pace})` : "";
}


// Asks, then deletes a race idea (24a / 24b). Its checklist goes with it
// (cascade). Returns true when it was deleted.
async function deleteIdea(race) {
  if (!window.confirm(`Delete the idea "${race.name}"?`)) return false;
  try {
    // An idea with a date may have routine sessions: free a workout saved for one (step 22).
    releaseWorkoutOf((await listRaceSessions(race.id)).map((s) => s.id));
    await deleteRace(race.id);
    showToast(`Deleted: ${race.name}`);
    return true;
  } catch (error) {
    showToast("Could not delete: " + error.message);
    return false;
  }
}

// ---------------------------------------------------------------------
// One race: a summary first (step 19), the details form behind "Edit"
// ---------------------------------------------------------------------

// What the page shows depends on where the race stands:
//   upcoming  = a date from today on, and you're going (registered, to register, potential)
//   past      = finished, or its date has passed
//   cancelled = cancelled (greyed)
//   idea      = no date yet, or an idea with a date
function raceState(race, today) {
  if (race.status === "cancelled") return "cancelled";
  if (!race.race_date) return "idea";
  if (race.status === "finished" || race.race_date < today) return "past";
  if (race.status === "registered" || race.status === "to_register" || race.status === "potential") return "upcoming";
  return "idea";
}

// editing: true = show the details form instead of the summary.
// focus: the id of a form box to put the cursor in (e.g. "r-date").
async function renderRace(container, raceId, { editing = false, focus = null } = {}) {
  container.innerHTML = `<p class="muted">Loading…</p>`;
  let race = null;
  let blocks = [];
  let runs = [];
  let dayRuns = [];
  let bests = [];
  try {
    [race, blocks] = await Promise.all([raceId ? getRace(raceId) : null, listTrainingBlocks()]);
    if (race) runs = await listRaceActivities(race.id);
    if (race && needsResult(race, todayISO())) {
      [dayRuns, bests] = await Promise.all([listRunsOn(race.race_date), listPersonalBests()]);
    }
  } catch (error) {
    container.innerHTML = `<p class="status error"></p>`;
    container.querySelector(".status").textContent = "Could not load: " + error.message;
    return;
  }
  if (raceId && !race) {
    container.innerHTML = `<section class="card placeholder"><p>This race doesn't exist (any more).</p>
      <a class="button" href="#/races">Back to races</a></section>`;
    return;
  }

  const today = todayISO();
  const state = race ? raceState(race, today) : null;
  const showForm = !race || editing;
  const block = race && race.training_block_id ? blocks.find((b) => b.id === race.training_block_id) : null;
  // Routine + checklist sit next to the summary (laptop) or under it (phone).
  // A past race folds them into one-line rows inside the summary instead.
  const hasSide = race && state !== "past";
  // A past race without a result: the run from the log that looks like it.
  const found = race && needsResult(race, today) ? findRaceRun(race, runs, dayRuns) : null;

  clearTopbarAction(); // the summary below sets "Edit" again
  container.innerHTML = `
    <div class="race-page">

    <div class="race-layout">
      <div class="race-main">
        ${showForm ? raceFormHtml(race, blocks) : summaryHtml(race, state, block, runs, today, found)}
      </div>
      ${hasSide ? `
        <aside class="race-side">
          <section class="card" id="routine"><p class="muted">Loading…</p></section>
          <section class="card" id="checklist"></section>
        </aside>` : ""}
    </div>
    </div>
  `;

  const refresh = (options) => renderRace(container, race.id, options);
  if (showForm) setUpForm(container, race, refresh, focus);
  else setUpSummary(container, race, refresh);
  if (!showForm && container.querySelector("#result-card")) setUpResultCard(container, race, found, bests, refresh);

  if (race) {
    const routineEl = container.querySelector("#routine");
    if (routineEl) drawRoutine(routineEl, race, () => refresh());
    const checklistEl = container.querySelector("#checklist");
    if (checklistEl) drawChecklist(checklistEl, race);
  }
}

function setUpSummary(container, race, refresh) {
  // "Edit" sits in the top bar (20d), like the block page.
  setTopbarAction({ text: "Edit", label: "Edit this race", onClick: () => {
    window.scrollTo(0, 0);
    refresh({ editing: true });
  } });
  const setDate = container.querySelector("#set-date");
  if (setDate) setDate.addEventListener("click", () => refresh({ editing: true, focus: "r-date" }));
  // An idea can be deleted right here, no need to go through Edit (24b).
  const deleteButton = container.querySelector("#delete-idea");
  if (deleteButton) deleteButton.addEventListener("click", async () => {
    if (await deleteIdea(race)) window.location.hash = "#/races";
  });
}


// ---------- The summary ----------

function summaryHtml(race, state, block, runs, today, found) {
  const hero = state === "upcoming" ? upcomingHeroHtml(race, block, today)
    : state === "past" ? pastHeroHtml(race)
    : plainHeroHtml(race, state);
  return `
    ${hero}
    ${needsResult(race, today) ? noResultHtml(found) : ""}
    ${runs.length ? `
      <h3 class="section-label">Your run</h3>
      <div class="card race-runs">${runs.map(runRowHtml).join("")}</div>` : ""}
    ${race.notes ? `
      <section class="card race-notes">
        <h3 class="section-label">Notes</h3>
        <p>${escapeHtml(race.notes)}</p>
      </section>` : ""}
    ${state === "past" ? foldedRowsHtml(race, block) : ""}
    ${groupOf(race, today) === "ideas" ? `
      <button type="button" class="link-button race-delete-idea" id="delete-idea">${icon("trash-2")} Delete this idea</button>` : ""}
  `;
}

// "Sat 14 Nov · La Roche-en-Ardenne" with the status pill in front.
function metaHtml(race, pillClass = "") {
  const status = RACE_STATUSES[race.status];
  const where = [race.race_date ? formatDayLabel(race.race_date) : "No date yet", race.location || ""].filter(Boolean).join(" · ");
  return `<p class="race-sum-meta">${status ? `<span class="race-pill ${pillClass}">${escapeHtml(status.label)}</span>` : ""}
    <span>${escapeHtml(where)}</span></p>`;
}

// A row of numbers: [value, label] pairs, empty ones left out.
function factsHtml(facts) {
  const shown = facts.filter(([value]) => value);
  if (!shown.length) return "";
  return `<div class="race-sum-facts">${shown.map(([value, label]) =>
    `<div><span class="num">${escapeHtml(value)}</span><span class="race-sum-label">${escapeHtml(label)}</span></div>`).join("")}</div>`;
}

// "6:48" (the pace alone, without " /km"), or "".
function paceOnly(seconds, km) {
  return formatSpeed("per_km", seconds, Number(km)).replace(" /km", "");
}

function upcomingHeroHtml(race, block, today) {
  const days = Math.round((Date.parse(race.race_date) - Date.parse(today)) / 86400000);
  const countdown = days === 0 ? `<span class="num">Race day!</span>`
    : `<span class="num">${days}</span> <span class="race-sum-days-label">${days === 1 ? "day to go" : "days to go"}</span>`;
  return `
    <section class="card race-sum is-dark">
      ${metaHtml(race, race.status === "registered" ? "is-ok" : "")}
      <h2 class="race-sum-name">${escapeHtml(race.name)}</h2>
      <p class="race-sum-days">${countdown}</p>
      ${factsHtml([
        [race.distance_km ? String(Number(race.distance_km)) : "", "km"],
        [race.elevation_m ? String(race.elevation_m) : "", "m D+"],
        [race.goal_time_s ? formatDuration(race.goal_time_s) : "", "goal"],
        [race.goal_time_s ? paceOnly(race.goal_time_s, race.distance_km) : "", "/km goal"],
      ])}
      ${block ? blockBarHtml(block, today) : ""}
    </section>`;
}

// The race's block: one segment per week while it runs, else just its name.
function blockBarHtml(block, today) {
  const link = `<a href="#/blocks/${encodeURIComponent(block.id)}">${escapeHtml(block.name)}</a>`;
  if (today < block.start_date || today > block.end_date) {
    return `<p class="race-sum-block small">${icon("book-open")} Part of ${link}</p>`;
  }
  const week = blockWeek(block, today);
  const segments = Array.from({ length: week.total }, (_, i) =>
    `<span class="${i + 1 < week.current ? "is-done" : i + 1 === week.current ? "is-now" : ""}"></span>`).join("");
  return `
    <div class="race-sum-bar">
      <p class="small">${link}<span>week ${week.current} of ${week.total}</span></p>
      <span class="week-segments" role="img" aria-label="Week ${week.current} of ${week.total}">${segments}</span>
    </div>`;
}

function pastHeroHtml(race) {
  if (!race.result_time_s) {
    return `
      <section class="card race-sum">
        ${metaHtml(race)}
        <h2 class="race-sum-name">${escapeHtml(race.name)}</h2>
        ${factsHtml([
          [race.distance_km ? String(Number(race.distance_km)) : "", "km"],
          [race.elevation_m ? String(race.elevation_m) : "", "m D+"],
          [race.goal_time_s ? formatDuration(race.goal_time_s) : "", "goal"],
        ])}
      </section>`;
  }
  return `
    <section class="card race-sum">
      ${metaHtml(race)}
      <h2 class="race-sum-name">${escapeHtml(race.name)}</h2>
      <p class="race-sum-label-top">Result</p>
      <p class="race-sum-result"><span class="num">${formatDuration(race.result_time_s)}</span></p>
      ${goalDeltaHtml(race)}
      <div class="race-sum-box">${factsHtml([
        [race.distance_km ? String(Number(race.distance_km)) : "", "km"],
        [race.elevation_m ? String(race.elevation_m) : "", "m D+"],
        [paceOnly(race.result_time_s, race.distance_km), "/km"],
      ])}</div>
    </section>`;
}

// "↑ 2:20 under goal" (green) or "3:05 over goal" (quiet grey, never red:
// a slower race is not an error).
function goalDeltaHtml(race) {
  if (!race.goal_time_s) return "";
  const diff = race.goal_time_s - race.result_time_s;
  const goal = `<span class="muted small">goal ${numHtml(formatDuration(race.goal_time_s))}</span>`;
  if (diff === 0) return `<p class="race-delta"><span class="race-pill is-ok">Right on goal</span> ${goal}</p>`;
  return diff > 0
    ? `<p class="race-delta"><span class="race-pill is-ok">${icon("arrow-up")} ${formatDuration(diff)} under goal</span> ${goal}</p>`
    : `<p class="race-delta"><span class="race-pill">${formatDuration(-diff)} over goal</span> ${goal}</p>`;
}

// Ideas (no date: "Set a date") and cancelled races (greyed).
function plainHeroHtml(race, state) {
  return `
    <section class="card race-sum ${state === "cancelled" ? "is-not-run" : ""}">
      ${metaHtml(race)}
      <h2 class="race-sum-name">${escapeHtml(race.name)}</h2>
      ${factsHtml([
        [race.distance_km ? String(Number(race.distance_km)) : "", "km"],
        [race.elevation_m ? String(race.elevation_m) : "", "m D+"],
        [race.goal_time_s ? formatDuration(race.goal_time_s) : "", "goal"],
      ])}
      ${!race.race_date ? `<button type="button" class="button primary" id="set-date">${icon("calendar")} Set a date</button>` : ""}
    </section>`;
}

// ---------- "Add your result" (a past race without a time, step 19d) ----------

// The race day has passed (or it's marked finished) and there's no time yet.
function needsResult(race, today) {
  if (race.result_time_s || race.status === "cancelled" || !race.race_date) return false;
  return race.status === "finished" || race.race_date < today;
}

// The run that is most likely the race: one already linked to it, else a
// run logged on race day (a "race" session first, then the closest distance).
function findRaceRun(race, linked, dayRuns) {
  const withTime = (list) => list.filter((a) => a.sport === "running" && a.duration_s);
  const fromLink = withTime(linked);
  if (fromLink.length) return fromLink[0];
  const km = Number(race.distance_km) || 0;
  const gap = (a) => Math.abs((Number(a.distance_km) || 0) - km);
  return withTime(dayRuns).sort((a, b) =>
    (b.session_type === "race") - (a.session_type === "race") || gap(a) - gap(b))[0] || null;
}

// The personal best (typed in Body & goals) this time would beat: same
// distance within 2 %, and faster. null when there's none to beat.
function beatenBest(seconds, km, bests) {
  if (!seconds || !km) return null;
  return bests.find((pb) => Math.abs(Number(pb.distance_km) - km) / km <= 0.02 && seconds < pb.time_s) || null;
}

function noResultHtml(found) {
  return `
    <section class="card race-result-card" id="result-card">
      <div>
        <p class="section-label is-accent">How did it go?</p>
        <h3>Add your result</h3>
      </div>
      ${found ? `
        <div class="found-run">
          ${sportBadge(found.sport, sportIcon)}
          <span class="found-run-text"><span class="muted small">Found in your log, ${escapeHtml(formatDayLabel(found.activity_date))}</span>
            <span>${numHtml(formatDuration(found.duration_s))}${found.distance_km ? ` <span class="muted small">· ${escapeHtml(formatKm(found.distance_km))}</span>` : ""}</span></span>
          <button type="button" class="button primary" id="use-found">Use this</button>
        </div>
        <p class="or-line"><span>or type it</span></p>` : ""}
      <form id="result-form" class="result-form" novalidate>
        <div class="field">
          <label for="result-time">Result time</label>
          <input id="result-time" type="text" inputmode="decimal" autocomplete="off" placeholder="45:00 or 1:02:30">
        </div>
        <button type="submit" class="button">Save</button>
      </form>
      <p id="result-status" class="status" role="status"></p>
      <label class="check-row pb-offer" id="pb-offer" hidden>
        <input type="checkbox" id="pb-save" checked>
        <span id="pb-text"></span>
      </label>
      <button type="button" class="link-button is-quiet" id="not-run">I didn't run it</button>
    </section>`;
}

function setUpResultCard(container, race, found, bests, refresh) {
  const card = container.querySelector("#result-card");
  const input = card.querySelector("#result-time");
  const status = card.querySelector("#result-status");
  const offer = card.querySelector("#pb-offer");

  // The PB line follows the time on show: the typed one, else the found run's.
  function km() {
    return Number(race.distance_km) || (found ? Number(found.distance_km) : 0);
  }
  function shownTime() {
    return parseDuration(input.value) || (found ? found.duration_s : null);
  }
  function updateOffer() {
    const seconds = shownTime();
    const pb = beatenBest(seconds, km(), bests);
    offer.hidden = !pb;
    if (pb) {
      card.querySelector("#pb-text").textContent =
        `${formatDuration(seconds)} beats your ${pb.label || "PB"} best (${formatDuration(pb.time_s)}). Save it as your new PB too.`;
    }
  }
  input.addEventListener("input", () => {
    updateOffer();
    if (status.classList.contains("error")) showStatus(status, "", "");
  });
  updateOffer();

  async function saveResult(seconds, activity) {
    showStatus(status, "Saving…", "");
    try {
      await saveRace({ ...race, result_time_s: seconds, status: "finished" });
      if (activity && !activity.race_id) await linkActivityToRace(activity.id, race.id);
      const pb = beatenBest(seconds, km(), bests);
      const newBest = pb && card.querySelector("#pb-save").checked;
      if (newBest) {
        await savePersonalBest({ id: pb.id, label: pb.label, distance_km: pb.distance_km, time_s: seconds,
          achieved_on: race.race_date, notes: race.name });
      }
      showToast(newBest ? `Result saved · new ${pb.label ? pb.label + " " : ""}PB!` : "Result saved, race marked finished");
      refresh();
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
    }
  }

  const useFound = card.querySelector("#use-found");
  if (useFound) useFound.addEventListener("click", () => {
    useFound.disabled = true;
    saveResult(found.duration_s, found);
  });

  card.querySelector("#result-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = input.value.trim();
    const seconds = parseDuration(text);
    if (!seconds) return showStatus(status, "Time not understood. Use 45:00 or 1:45:00.", "error");
    // A typed time doesn't link the found run: it may not be this race.
    saveResult(seconds, null);
  });

  card.querySelector("#not-run").addEventListener("click", async () => {
    if (!window.confirm("Mark this race as not run? It moves to the cancelled races (you can change it back with Edit).")) return;
    try {
      await saveRace({ ...race, status: "cancelled" });
      showToast("Marked as not run");
      refresh();
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
    }
  });
}

// One activity linked to the race: tap = open it in the log.
function runRowHtml(a) {
  const name = a.title || sessionTypeLabel(a.sport, a.session_type);
  const facts = [
    formatDayLabel(a.activity_date),
    a.distance_km ? numHtml(formatKm(a.distance_km)) : "",
    a.duration_s ? numHtml(formatDuration(a.duration_s)) : "",
    a.rpe ? `RPE ${numHtml(String(a.rpe))}` : "",
  ].filter(Boolean);
  return `
    <a class="race-run" href="#/log/${encodeURIComponent(a.id)}">
      ${sportBadge(a.sport, sportIcon)}
      <span class="race-run-text"><strong>${escapeHtml(name)}</strong>
        <span class="muted small">${facts.map((f) => f.startsWith("<") || f.startsWith("RPE") ? f : escapeHtml(f)).join(" · ")}</span></span>
      ${icon("chevron-right", { className: "is-muted" })}
    </a>`;
}

// A past race: its block and its checklist as short rows (checklist opens on tap).
function foldedRowsHtml(race, block) {
  const done = race.checklist.filter((i) => i.done).length;
  return `
    <section class="card race-folds">
      ${block ? `<a class="race-fold-row" href="#/blocks/${encodeURIComponent(block.id)}">
        ${icon("book-open", { className: "is-muted" })}<span>${escapeHtml(block.name)}</span>${icon("chevron-right", { className: "is-muted" })}</a>` : ""}
      <details class="race-fold">
        <summary class="race-fold-row">${icon("clipboard-list", { className: "is-muted" })}
          <span>Checklist${race.checklist.length ? ` <span class="muted">· ${done} / ${race.checklist.length}</span>` : ""}</span>
          ${icon("chevron-down", { className: "is-muted" })}</summary>
        <div id="checklist" class="race-fold-body"></div>
      </details>
    </section>`;
}


// ---------- The details form ("Edit", or a new race) ----------

function raceFormHtml(race, blocks) {
  const isEdit = Boolean(race);
  const r = race || { status: "registered" };
  return `
    <form id="race-form" class="card form race-form" novalidate>
      <h2>${isEdit ? "Edit race" : "New race"}</h2>
      <div class="form-grid">
        <div class="field">
          <label for="r-name">Name</label>
          <input id="r-name" name="name" type="text" required autocomplete="off" placeholder="e.g. 20 km de Bruxelles"
                 value="${escapeHtml(r.name || "")}">
        </div>
        <div class="field">
          <label for="r-date">Date <span class="muted">(empty = just an idea)</span></label>
          <input id="r-date" name="race_date" type="date" value="${escapeHtml(r.race_date || "")}">
        </div>
        <div class="field">
          <label for="r-status">Status</label>
          <select id="r-status" name="status">
            ${Object.entries(RACE_STATUSES).map(([key, s]) =>
              `<option value="${key}" ${r.status === key ? "selected" : ""}>${s.label}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="r-location">Location</label>
          <input id="r-location" name="location" type="text" autocomplete="off" value="${escapeHtml(r.location || "")}">
        </div>
        <div class="field">
          <label for="r-distance">Distance (km)</label>
          <input id="r-distance" name="distance_km" type="text" inputmode="decimal" autocomplete="off"
                 value="${r.distance_km != null ? Number(r.distance_km) : ""}">
        </div>
        <div class="field">
          <label for="r-elevation">D+ (m)</label>
          <input id="r-elevation" name="elevation_m" type="text" inputmode="numeric" autocomplete="off"
                 value="${r.elevation_m ?? ""}">
        </div>
        <div class="field">
          <label for="r-goal">Goal time</label>
          <input id="r-goal" name="goal" type="text" inputmode="decimal" autocomplete="off" placeholder="1:45:00"
                 value="${escapeHtml(formatDuration(r.goal_time_s))}">
          <p class="hint" id="goal-pace"></p>
        </div>
        <div class="field">
          <label for="r-result">Result time</label>
          <input id="r-result" name="result" type="text" inputmode="decimal" autocomplete="off" placeholder="1:43:12"
                 value="${escapeHtml(formatDuration(r.result_time_s))}">
          <p class="hint" id="result-pace"></p>
        </div>
        <div class="field field-full">
          <label for="r-block">Training block</label>
          <select id="r-block" name="training_block_id">
            <option value="">— none —</option>
            ${blocks.map((b) => `<option value="${b.id}" ${r.training_block_id === b.id ? "selected" : ""}>${escapeHtml(b.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field field-full">
          <label for="r-notes">Notes</label>
          <textarea id="r-notes" name="notes" rows="4">${escapeHtml(r.notes || "")}</textarea>
        </div>
      </div>

      <p id="race-status" class="status" role="status"></p>
      <div class="form-actions">
        <button type="submit" class="button primary">${isEdit ? "Save changes" : "Save race"}</button>
        ${isEdit ? `<button type="button" class="button" id="cancel-edit">Cancel</button>` : `<a href="#/races" class="button">Cancel</a>`}
        ${isEdit ? `<button type="button" id="delete" class="button danger">Delete</button>` : ""}
      </div>
    </form>`;
}

function setUpForm(container, race, refresh, focus) {
  const isEdit = Boolean(race);
  const form = container.querySelector("#race-form");
  const status = form.querySelector("#race-status");

  // Live pace under the goal / result boxes.
  function updatePaces() {
    const km = parseNumber(form.elements.distance_km.value);
    for (const [name, id] of [["goal", "#goal-pace"], ["result", "#result-pace"]]) {
      const seconds = parseDuration(form.elements[name].value);
      form.querySelector(id).textContent = seconds && km ? formatSpeed("per_km", seconds, km) : "";
    }
  }
  form.addEventListener("input", () => {
    updatePaces();
    if (status.classList.contains("error")) showStatus(status, "", "");
  });
  updatePaces();
  if (focus) {
    const box = form.querySelector("#" + focus);
    if (box) box.focus();
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const result = readRaceForm(form);
    if (result.error) return showStatus(status, result.error, "error");
    const values = result.race;
    if (isEdit) values.id = race.id;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus(status, "Saving…", "");
    try {
      const saved = await saveRace(values);
      // New race: go to its page, so the checklist and routine are right there.
      if (!isEdit) {
        window.location.hash = `#/races/${saved.id}`;
        return;
      }
      // The date changed: the routine sessions follow (or go, if no date any more).
      let message = "Race saved";
      if (race.race_date && values.race_date !== race.race_date) {
        if (values.race_date) {
          const moved = await moveRaceRoutine(race.id, race.race_date, values.race_date);
          if (moved) message += ` · race routine moved too (${moved} session${moved === 1 ? "" : "s"})`;
        } else {
          const removed = await removeRaceRoutine(race.id);
          if (removed) message += " · no date any more, so the race routine left the planner";
        }
      }
      showToast(message);
      refresh();
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
      button.disabled = false;
    }
  });

  const cancel = form.querySelector("#cancel-edit");
  if (cancel) cancel.addEventListener("click", () => refresh());

  const deleteButton = form.querySelector("#delete");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      if (!window.confirm("Delete this race? Its checklist and its race-routine sessions in the planner go too.")) return;
      try {
        // Its routine sessions go with it (cascade): free a workout saved for one (step 22).
        releaseWorkoutOf((await listRaceSessions(race.id)).map((s) => s.id));
        await deleteRace(race.id);
        window.location.hash = "#/races";
      } catch (error) {
        showStatus(status, "Could not delete: " + error.message, "error");
      }
    });
  }
}

function parseNumber(text) {
  const value = Number(String(text).trim().replace(",", "."));
  return String(text).trim() !== "" && Number.isFinite(value) ? value : null;
}

// Reads and checks the race form. Returns { race } or { error }.
function readRaceForm(form) {
  const name = form.elements.name.value.trim();
  if (!name) return { error: "Please give the race a name." };

  const distanceText = form.elements.distance_km.value.trim();
  const distance = parseNumber(distanceText);
  if (distanceText && !(distance > 0 && distance < 1000)) return { error: "Distance not understood (e.g. 21.1)." };

  const elevationText = form.elements.elevation_m.value.trim();
  const elevation = parseNumber(elevationText);
  if (elevationText && !(Number.isInteger(elevation) && elevation >= 0)) return { error: "D+ must be a whole number of metres." };

  const times = {};
  for (const [field, label] of [["goal", "Goal time"], ["result", "Result time"]]) {
    const text = form.elements[field].value.trim();
    times[field] = text ? parseDuration(text) : null;
    if (text && !times[field]) return { error: `${label} not understood. Use 45:00 or 1:45:00.` };
  }

  const status = form.elements.status.value;
  const date = form.elements.race_date.value || null;
  if (!date && (status === "to_register" || status === "registered")) {
    return { error: "A race you register for needs a date." };
  }

  return {
    race: {
      name, race_date: date, status,
      location: form.elements.location.value.trim() || null,
      distance_km: distance, elevation_m: elevation,
      goal_time_s: times.goal, result_time_s: times.result,
      training_block_id: form.elements.training_block_id.value || null,
      notes: form.elements.notes.value.trim() || null,
    },
  };
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}


// ---------- Race routine card ----------

// Not planned yet: what the routine is + one button. Planned: one row per
// day (jog, rest day, race day), each opening that week in the planner.
async function drawRoutine(el, race, refresh) {
  let sessions = [];
  let busyRestDay = [];
  const restDate = race.race_date ? addDays(race.race_date, -1) : null;
  try {
    sessions = await listRaceSessions(race.id);
    // The day before should stay empty: anything else planned that day?
    if (restDate && sessions.length) {
      busyRestDay = (await listPlannedSessions(restDate, restDate)).filter((s) => s.status !== "cancelled");
    }
  } catch (error) {
    el.innerHTML = `<p class="status error"></p>`;
    el.querySelector(".status").textContent = "Could not load the routine: " + error.message;
    return;
  }
  const raceSession = sessions.find((s) => s.session_type === "race");
  const logged = raceSession && raceSession.activity;
  const canPlan = race.race_date && race.status !== "finished" && race.status !== "cancelled";
  const missing = RACE_ROUTINE.length - sessions.length;

  // The rows, in date order: the routine sessions + the rest day between them.
  const rows = sessions.map((s) => ({ date: s.session_date, html: routineRowHtml(s) }));
  if (sessions.length && restDate) rows.push({ date: restDate, html: restRowHtml(restDate, busyRestDay) });
  rows.sort((a, b) => a.date.localeCompare(b.date));

  el.innerHTML = `
    <div class="card-head">
      <h2>Race routine</h2>
      ${sessions.length && missing <= 0 ? `<span class="race-pill is-ok">${icon("check")} In your plan</span>` : ""}
    </div>
    ${sessions.length ? `<div class="routine-rows">${rows.map((r) => r.html).join("")}</div>` : `
      <p class="muted small">Race day + an activation jog 2 days before, and full rest the day before
        (you get a warning if something is planned then). A planned match always wins over the jog.</p>`}
    ${logged && race.result_time_s !== logged.duration_s && logged.duration_s ? `
      <p>Logged race time: ${numHtml(formatDuration(logged.duration_s))}</p>
      <button type="button" class="button primary" id="use-result">Use my logged time as result</button>` : ""}
    ${canPlan && missing > 0 ? `<button type="button" class="button ${sessions.length ? "" : "primary"}" id="add-routine">${icon("calendar")} ${sessions.length
      ? "Add the missing routine sessions" : "Add race routine to my planner"}</button>` : ""}
    ${!race.race_date ? `<p class="muted">Give the race a date to plan its routine.</p>` : ""}
    ${sessions.some((s) => s.status !== "done") ? `<button type="button" class="link-button" id="remove-routine">Remove the routine from the planner</button>` : ""}
  `;

  const add = el.querySelector("#add-routine");
  if (add) add.addEventListener("click", async () => {
    add.disabled = true;
    try {
      const { added, notes } = await addRaceRoutine(race);
      // One message only (a second toast would hide the first).
      const parts = [];
      if (added) parts.push(`Added ${added} session${added === 1 ? "" : "s"} to your planner.`);
      notes.forEach((note) => parts.push(note));
      if (parts.length) showToast(parts.join(" "), { seconds: notes.length ? 10 : 6 });
      refresh();
    } catch (error) {
      showToast("Could not add the routine: " + error.message);
      add.disabled = false;
    }
  });

  const remove = el.querySelector("#remove-routine");
  if (remove) remove.addEventListener("click", async () => {
    if (!window.confirm("Remove this race's routine sessions from the planner? (Done ones stay.)")) return;
    try {
      await removeRaceRoutine(race.id);
      refresh();
    } catch (error) {
      showToast("Could not remove: " + error.message);
    }
  });

  const useResult = el.querySelector("#use-result");
  if (useResult) useResult.addEventListener("click", async () => {
    try {
      await saveRace({ ...race, result_time_s: logged.duration_s, status: "finished" });
      showToast("Result saved, race marked finished");
      refresh();
    } catch (error) {
      showToast("Could not save: " + error.message);
    }
  });
}

// "THU / 12": the day box at the start of a routine row.
function dayBoxHtml(iso, isRaceDay = false) {
  const date = parseISODate(iso);
  const weekday = date.toLocaleDateString("en-GB", { weekday: "short" });
  return `<span class="routine-day ${isRaceDay ? "is-race" : ""}"><span>${weekday}</span><span class="num">${date.getDate()}</span></span>`;
}

function routineRowHtml(s) {
  const isRace = s.session_type === "race";
  const state = s.status === "done" ? `${icon("check", { className: "is-ok" })} done`
    : s.status === "cancelled" ? `${icon("x", { className: "is-error" })} cancelled` : "planned";
  return `
    <a class="routine-row" href="#/planner/${startOfWeek(s.session_date)}">
      ${dayBoxHtml(s.session_date, isRace)}
      ${isRace ? `<span class="sport-badge routine-race" aria-hidden="true">${icon("flag")}</span>` : sportBadge(s.sport, sportIcon)}
      <span class="routine-text"><strong>${escapeHtml(isRace ? "Race day" : s.title || sessionTypeLabel(s.sport, s.session_type))}</strong>
        <span class="muted small">${isRace ? escapeHtml(s.title || "") + " · " : ""}${state}</span></span>
    </a>`;
}

function restRowHtml(iso, busy) {
  return `
    <a class="routine-row" href="#/planner/${startOfWeek(iso)}">
      ${dayBoxHtml(iso)}
      <span class="sport-badge routine-rest" aria-hidden="true">${icon("moon")}</span>
      <span class="routine-text"><strong>Full rest</strong>
        ${busy.length
          ? `<span class="small routine-warn">${icon("alert-triangle")} ${busy.length} session${busy.length === 1 ? "" : "s"} planned that day</span>`
          : `<span class="muted small">Nothing planned · good</span>`}</span>
    </a>`;
}


// ---------- Checklist card ----------

// Tap anywhere on a row to tick it. The remove buttons only show after
// "Edit list", so a quick tap never deletes an item by accident.
function drawChecklist(el, race) {
  let items = race.checklist.slice();
  let editing = false;

  function draw() {
    const done = items.filter((i) => i.done).length;
    el.innerHTML = `
      <div class="card-head">
        <h2>Checklist</h2>
        ${items.length ? `<span>${numHtml(String(done))}<span class="unit"> / ${items.length} ready</span></span>` : ""}
      </div>
      ${items.length ? `
        <span class="bar checklist-bar" role="img" aria-label="${done} of ${items.length} ready">
          <span class="bar-fill" style="width: ${Math.round((done / items.length) * 100)}%"></span></span>
        <ul class="checklist">${items.map((item) => `
          <li class="${item.done ? "is-done" : ""}">
            <label class="check-row"><input type="checkbox" data-toggle="${item.id}" ${item.done ? "checked" : ""}>
              <span>${escapeHtml(item.label)}</span></label>
            ${editing ? `<button type="button" class="button small-button danger" data-remove="${item.id}" aria-label="Remove ${escapeHtml(item.label)}">${icon("x")}</button>` : ""}
          </li>`).join("")}</ul>` : `
        <p class="muted">No checklist yet.</p>
        <div class="sheet-actions">
          <button type="button" class="button" id="copy-last">${icon("copy")} Copy from my last race</button>
          <button type="button" class="button" id="use-starter">Use the starter list</button>
        </div>`}
      <form id="add-item" class="add-item">
        <input type="text" name="label" placeholder="Add an item" autocomplete="off" aria-label="New checklist item">
        <button type="submit" class="button icon-only" aria-label="Add item">${icon("plus")}</button>
      </form>
      ${items.length ? `
        <div class="checklist-links">
          <button type="button" class="link-button" id="edit-list">${editing ? "Done editing" : "Edit list"}</button>
          ${done ? `<button type="button" class="link-button is-quiet" id="untick-all">Untick all</button>` : ""}
        </div>` : ""}
    `;
  }

  async function addLabels(labels) {
    const start = items.length ? Math.max(...items.map((i) => i.position)) + 1 : 0;
    const added = await addChecklistItems(race.id, labels, start);
    items = items.concat(added).sort((a, b) => a.position - b.position);
    draw();
  }

  el.addEventListener("change", async (event) => {
    const box = event.target.closest("[data-toggle]");
    if (!box) return;
    const item = items.find((i) => i.id === box.dataset.toggle);
    item.done = box.checked;
    draw();
    try {
      await updateChecklistItem(item.id, { done: item.done });
    } catch (error) {
      showToast("Could not save the tick: " + error.message);
    }
  });

  el.addEventListener("click", async (event) => {
    try {
      if (event.target.closest("#edit-list")) {
        editing = !editing;
        draw();
        return;
      }
      const remove = event.target.closest("[data-remove]");
      if (remove) {
        await deleteChecklistItem(remove.dataset.remove);
        items = items.filter((i) => i.id !== remove.dataset.remove);
        if (!items.length) editing = false;
        draw();
      }
      if (event.target.closest("#use-starter")) await addLabels(STARTER_CHECKLIST);
      if (event.target.closest("#copy-last")) {
        const last = await findLastChecklist(race.id);
        if (!last) return showToast("No other race has a checklist yet. Try the starter list.");
        await addLabels(last.labels);
        showToast(`Copied from ${last.raceName}`);
      }
      if (event.target.closest("#untick-all")) {
        const ticked = items.filter((i) => i.done);
        ticked.forEach((i) => { i.done = false; });
        draw();
        await Promise.all(ticked.map((i) => updateChecklistItem(i.id, { done: false })));
      }
    } catch (error) {
      showToast("Something went wrong: " + error.message);
    }
  });

  el.addEventListener("submit", async (event) => {
    event.preventDefault();
    const input = event.target.elements.label;
    const label = input.value.trim();
    if (!label) return;
    try {
      await addLabels([label]);
      el.querySelector('#add-item input[name="label"]').focus();
    } catch (error) {
      showToast("Could not add: " + error.message);
    }
  });

  draw();
}
