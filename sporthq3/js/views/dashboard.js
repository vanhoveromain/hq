// Home tab: your training at a glance. Each card loads on its own (if one
// fails, the others still show) and opens the full screen when tapped.

import {
  listPlannedSessions, listActivitiesBetween, listRaces, getRace, findBlockOn,
  listWeighIns, getSettings, listMatchesBetween, listShoes, getShoeDistances,
  listRacesBetween, getMutedWarnings, updatePlannedSession, getWeekReview,
  getTrainingBlock, listPersonalBests,
} from "../storage.js?v=202610212125";
import { checkTrainingRules, sportIcon, shoeStatus, LOAD_RULES, isRaceMode } from "../rules.js?v=202610212125";
import { todayISO, addDays, startOfWeek, formatDayLabel } from "../utils/dates.js?v=202610212125";
import { escapeHtml, formatDuration, formatHours, formatSpeed, numHtml } from "../utils/format.js?v=202610212125";
import { overview } from "../utils/stats.js?v=202610212125";
import { sessionName, sessionDetails, isPlainSession, calendarItems, daySummary, sportBadge, completeSession } from "../utils/plan.js?v=202610212125";
import { weekLoadNotes } from "../utils/load.js?v=202610212125";
import { showToast } from "../utils/toast.js?v=202610212125";
import { loadWorkout } from "../utils/workout.js?v=202610212125";
import { currentSeason } from "../utils/season.js?v=202610212125";
import { blockWeek } from "./blocks.js?v=202610212125";
import { icon } from "../utils/icons.js?v=202610212125";

// Home layout (step 17c, "Today first"):
//   1. Today hero (violet): today's sessions with one big button, and the
//      "Did you do it?" sessions of the last days inside it
//   2. small notes (Sunday review, load warnings)
//   3. next race   4. this week (+ one warnings line)   5. training load
//   6. small tiles (weight, season, shoes, block, 10k best)
// Laptop: left column = 1, 2, 4, 5; right column = 3, 6. On a phone the two
// columns melt into one list and CSS `order` sets the sequence above.
// Race mode (step 17d, HOME_RULES in rules.js): in the last 3 weeks before a
// registered race, the race comes first as a dark block, Today becomes a
// white card under it, and a one-line status strip (week, load, warnings)
// sums up the week. The class "race-mode" on .dashboard switches the look.
export function render(container) {
  container.innerHTML = `
    <div class="dashboard">
      <div class="dash-main">
        <section class="dash-hero" id="dash-hero">
          <div id="dash-today"><p>Loading…</p></div>
          <div class="hero-missed" id="dash-missed" hidden></div>
        </section>
        <a class="card dash-strip" id="dash-strip" href="#/planner" hidden>
          <span><span class="strip-label">Week</span><span id="strip-week">–</span></span>
          <span><span class="strip-label">Load</span><span id="strip-load">–</span></span>
          <span><span class="strip-label">Warnings</span><span id="strip-warnings">–</span></span>
        </a>
        <div class="dash-notes" id="dash-notes">
          <section class="card dash-card dash-note" id="dash-review" hidden></section>
          <div id="dash-load-notes"></div>
        </div>
        <section class="card dash-card" id="dash-week"><p class="muted">Loading…</p></section>
        <section class="card dash-card" id="dash-load"><p class="muted">Loading…</p></section>
      </div>
      <div class="dash-side">
        <section class="card dash-card dash-race" id="dash-race" hidden></section>
        <div class="dash-tiles">
          <a class="dash-tile" id="tile-block" hidden></a>
          <a class="dash-tile" id="tile-weight" hidden></a>
          <a class="dash-tile" id="tile-football" hidden></a>
          <a class="dash-tile" id="tile-shoes" hidden></a>
          <a class="dash-tile" id="tile-pb" hidden></a>
        </div>
      </div>
    </div>
  `;
  const $ = (id) => container.querySelector(id);
  const today = todayISO();

  // A tap anywhere on a card = a tap on its title (opens that screen).
  // Links and buttons inside the card (Start, Log, …) keep their own job.
  container.querySelector(".dashboard").addEventListener("click", (event) => {
    if (event.target.closest("a, button")) return;
    const titleLink = event.target.closest(".dash-card, .dash-hero")?.querySelector("h2 a");
    if (titleLink) window.location.hash = titleLink.getAttribute("href");
  });
  // Each card is its own little task; a failing one shows its error only.
  const card = (el, task) => task().catch((error) => {
    el.hidden = false;
    el.innerHTML = `<p class="status error"></p>`;
    el.querySelector(".status").textContent = "Could not load: " + error.message;
  });
  card($("#dash-missed"), () => drawMissed($("#dash-missed"), today));
  card($("#dash-review"), () => drawReviewNudge($("#dash-review"), today));
  card($("#dash-today"), () => drawWeek($("#dash-today"), $("#dash-week"), today, container));
  card($("#dash-load"), () => drawLoad($("#dash-load"), $("#dash-load-notes"), today, container));
  // The block tile only shows when the race card doesn't already show the block.
  const race = card($("#dash-race"), () => drawRace($("#dash-race"), today, container));
  card($("#tile-block"), async () => drawBlockTile($("#tile-block"), today, await race));
  card($("#tile-weight"), () => drawWeight($("#tile-weight")));
  card($("#tile-football"), () => drawFootball($("#tile-football"), today));
  card($("#tile-shoes"), () => drawShoes($("#tile-shoes")));
  card($("#tile-pb"), () => drawBest($("#tile-pb")));
}


// ---------- Today (the hero) + this week (one load for both) ----------

async function drawWeek(todayEl, weekEl, today, container) {
  const monday = startOfWeek(today);
  const sunday = addDays(monday, 6);
  // One extra day on each side, for the rules (Sunday -> next Monday).
  const [allSessions, allActivities, races, muted] = await Promise.all([
    listPlannedSessions(addDays(monday, -1), addDays(sunday, 1)),
    listActivitiesBetween(addDays(monday, -1), addDays(sunday, 1)),
    listRacesBetween(addDays(monday, -1), addDays(sunday, 1)),
    getMutedWarnings().catch(() => []),
  ]);
  const inWeek = (date) => date >= monday && date <= sunday;
  const sessions = allSessions.filter((s) => inWeek(s.session_date));
  const activities = allActivities.filter((a) => inWeek(a.activity_date));

  // Today
  const todays = sessions.filter((s) => s.session_date === today);
  const workout = loadWorkout();
  todayEl.innerHTML = `
    <h2 class="hero-label"><a href="#/planner">Today · ${escapeHtml(formatDayLabel(today))}</a></h2>
    ${workout ? `<a class="hero-resume" href="#/workout/${escapeHtml(workout.plannedId)}">
      ${icon("dumbbell")} <span>Workout in progress: <strong>${escapeHtml(workout.name)}</strong></span> ${icon("chevron-right")}</a>` : ""}
    ${todays.length ? todays.map(heroSessionHtml).join("")
      : `<p class="hero-rest">${icon("moon")} Nothing planned: rest day</p>
         <a class="hero-button is-quiet" href="#/planner">${icon("plus")} Plan something</a>`}
  `;

  // This week: done / planned, the 7-day strip
  const counted = sessions.filter((s) => s.status !== "cancelled");
  const done = counted.filter((s) => s.status === "done").length;
  // The 7 days: the sport icons planned (or logged) that day, nothing else;
  // a done day gets a light green background.
  const strip = Array.from({ length: 7 }, (_, i) => addDays(monday, i)).map((day) => {
    const { icons, done } = daySummary(day, sessions, activities, (sport) => sportBadge(sport, sportIcon, "small"));
    const name = new Date(day + "T12:00:00").toLocaleDateString("en-GB", { weekday: "narrow" });
    const label = icons.length ? (done ? "done" : "planned") : "rest";
    return `<span class="strip-day ${day === today ? "is-today" : ""} ${done ? "is-done" : ""}" title="${label}">
      <span class="muted small">${name}</span>
      <span class="strip-icons" aria-label="${label}">${icons.length ? icons.join("") : "–"}</span></span>`;
  }).join("");

  // Warnings of this week that still matter: not muted ("my normal pattern"),
  // and not only about days already gone (those are history now). Home shows
  // them as ONE line; the planner shows each one on its day.
  const warnings = checkTrainingRules(calendarItems(allSessions, allActivities, races), muted)
    .filter((w) => w.days.some(inWeek) && !w.muted && w.days.some((day) => day >= today));
  const warningLine = warnings.length ? `
    <a class="warning-line" href="#/planner">${icon("alert-triangle")}
      <span><strong>${warnings.length} warning${warnings.length === 1 ? "" : "s"}</strong> · ${escapeHtml(warnings[0].message)}</span>
      ${icon("chevron-right")}</a>` : "";

  weekEl.innerHTML = `
    <div class="dash-head">
      <h2><a href="#/planner">This week</a></h2>
      ${counted.length ? `<p class="dash-count">${numHtml(done)}<span class="num of"> / ${counted.length}</span> <span class="unit">done</span></p>` : ""}
    </div>
    ${counted.length ? "" : `<p class="muted">Nothing planned yet</p>`}
    <div class="week-strip">${strip}</div>
    ${warningLine}
  `;

  // Race mode's status strip (hidden otherwise)
  container.querySelector("#strip-week").innerHTML = counted.length
    ? `${numHtml(done)}<span class="num of">/${counted.length}</span>` : "–";
  const stripWarnings = container.querySelector("#strip-warnings");
  stripWarnings.innerHTML = numHtml(warnings.length);
  stripWarnings.classList.toggle("is-warning", warnings.length > 0);
}

// One of today's sessions inside the hero: icon, name, a few numbers and
// one big button. With a recipe the big button starts the workout; without
// one ("just a run") it logs it. The small button next to it does the other.
function heroSessionHtml(s) {
  const details = sessionDetails(s);
  const facts = [];
  if (details && details.exercises && details.exercises.length) facts.push(numHtml(details.exercises.length, "exercises"));
  if (details && details.rounds) facts.push(numHtml(details.rounds, "rounds"));
  if (details && details.target_duration_s) facts.push(numHtml(Math.round(details.target_duration_s / 60), "min"));
  if (details && details.target_distance_km) facts.push(numHtml(Number(details.target_distance_km), "km"));
  const withRecipe = !isPlainSession(s);
  let actions = "";
  if (s.status === "planned") {
    actions = withRecipe
      ? `<a class="hero-button" href="#/workout/${s.id}">${icon("play")} Start workout</a>
         <a class="hero-icon-button" href="#/log/new/${s.id}" aria-label="Log it instead">${icon("square-pen")}</a>`
      : `<a class="hero-button" href="#/log/new/${s.id}">${icon("square-pen")} Log it</a>
         <a class="hero-icon-button" href="#/workout/${s.id}" aria-label="Start with the timer">${icon("play")}</a>`;
  }
  return `
    <div class="hero-session status-${s.status}">
      <div class="hero-session-top">
        <span class="hero-badge" aria-hidden="true">${sportIcon(s.sport)}</span>
        <div class="hero-session-text">
          <p class="hero-name">${escapeHtml(sessionName(s))}</p>
          ${facts.length ? `<p class="hero-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</p>` : ""}
        </div>
        ${s.status === "done" ? `<span class="hero-state">${icon("check")} Done</span>`
          : s.status === "cancelled" ? `<span class="hero-state">Skipped</span>` : ""}
      </div>
      ${actions ? `<div class="hero-actions">${actions}</div>` : ""}
    </div>`;
}


// ---------- Still open: sessions of the last days never ticked (16d) ----------
// Shown inside the Today hero (17c), one compact row each.

const MISSED_DAYS = 7; // look back this many days (yesterday included)
const MISSED_SHOWN = 5; // more than that: "+ n more in the plan"

async function drawMissed(el, today) {
  const sessions = (await listPlannedSessions(addDays(today, -MISSED_DAYS), addDays(today, -1)))
    .filter((s) => s.status === "planned");
  el.hidden = !sessions.length;
  if (!sessions.length) return;
  const week = startOfWeek(sessions[0].session_date);
  el.innerHTML = `
    <p class="hero-missed-title"><a href="#/planner/${week}">Did you do it?</a></p>
    <ul class="hero-missed-list">${sessions.slice(0, MISSED_SHOWN).map((s) => `
      <li data-id="${s.id}">
        <span class="hero-missed-name">${escapeHtml(sessionName(s))}
          <span class="small">${escapeHtml(formatDayLabel(s.session_date))}</span></span>
        <button type="button" class="hero-small-button" data-missed="done" aria-label="Done">${icon("check")}</button>
        <a class="hero-small-button" href="#/log/new/${s.id}">Log</a>
        <button type="button" class="hero-small-button is-quiet" data-missed="skip">Skip</button>
      </li>`).join("")}</ul>
    ${sessions.length > MISSED_SHOWN ? `<p class="small">+ ${sessions.length - MISSED_SHOWN} more
      <a href="#/planner/${week}">in the plan</a></p>` : ""}`;
  // Done = done without a log; Skip = cancelled (it stays in the plan, struck through).
  el.onclick = async (event) => {
    const button = event.target.closest("[data-missed]");
    if (!button) return;
    const session = sessions.find((s) => s.id === button.closest("li").dataset.id);
    button.disabled = true;
    try {
      if (button.dataset.missed === "done") await completeSession(session);
      else await updatePlannedSession(session.id, { status: "cancelled" });
      showToast(button.dataset.missed === "done" ? `${sessionName(session)} marked done` : `${sessionName(session)} marked skipped`);
      await drawMissed(el, today);
    } catch (error) {
      showToast("Could not save: " + error.message);
      button.disabled = false;
    }
  };
}


// ---------- Weekly review nudge (16g): Sunday for this week, Mon / Tue for last week ----------

async function drawReviewNudge(el, today) {
  const weekday = (new Date(today + "T12:00:00").getDay() + 6) % 7; // Monday = 0 … Sunday = 6
  let monday = null;
  if (weekday === 6) monday = startOfWeek(today);
  else if (weekday <= 1) monday = addDays(startOfWeek(today), -7);
  if (!monday) return;
  const review = await getWeekReview(monday);
  if (review && review.reviewed_at) return; // already done
  el.hidden = false;
  el.innerHTML = `
    <h2><a href="#/review/${monday}">${icon("notebook-pen")} Week review</a></h2>
    <p>${weekday === 6 ? "Your week is done" : "Last week is done"}: two minutes to look back?</p>
    <a class="button small-button" href="#/review/${monday}">Review the week</a>`;
}


// ---------- Training load: hours per week ----------

const LOAD_WEEKS = 8;     // weeks in the little chart (this week included)
// "average" = the LOAD_RULES.averageWeeks full weeks before this one (rules.js)

// `notesEl` = where the big jump / race week notes go (under the hero).
async function drawLoad(el, notesEl, today, container) {
  const monday = startOfWeek(today);
  const firstMonday = addDays(monday, -7 * (LOAD_WEEKS - 1));
  const [activities, sessions, races] = await Promise.all([
    listActivitiesBetween(firstMonday, addDays(monday, 6)),
    listPlannedSessions(monday, addDays(monday, 6)),
    listRacesBetween(monday, addDays(monday, 6)),
  ]);

  // The weeks, oldest first: [{ monday, activities }]
  const weeks = Array.from({ length: LOAD_WEEKS }, (_, i) => {
    const start = addDays(firstMonday, 7 * i);
    const end = addDays(start, 6);
    return { monday: start, activities: activities.filter((a) => a.activity_date >= start && a.activity_date <= end) };
  });
  const thisWeek = overview(weeks[weeks.length - 1].activities);
  const secondsOf = (week) => overview(week.activities).seconds;
  const previous = weeks.slice(-1 - LOAD_RULES.averageWeeks, -1);
  const average = previous.reduce((total, week) => total + secondsOf(week), 0) / previous.length;
  const runKm = weeks[weeks.length - 1].activities.filter((a) => a.sport === "running")
    .reduce((total, a) => total + Number(a.distance_km || 0), 0);
  const noTime = weeks[weeks.length - 1].activities.filter((a) => a.duration_s == null).length;
  const planned = plannedSeconds(sessions);
  // Big jump / race week notes (same check as the planner).
  const notes = weekLoadNotes({
    sessions, activities: weeks[weeks.length - 1].activities, races,
    previousActivities: weeks.slice(-1 - LOAD_RULES.averageWeeks, -1).flatMap((week) => week.activities),
  });
  container.querySelector("#strip-load").innerHTML = `${numHtml(formatHours(thisWeek.seconds))}${planned.seconds
    ? ` <span class="unit">/ ${escapeHtml(formatHours(planned.seconds))}</span>` : ""}`;
  notesEl.innerHTML = notes.map((note) => `<p class="card dash-note status warning small">${icon("trending-up")} ${escapeHtml(note)}</p>`).join("");

  el.innerHTML = `
    <div class="dash-head">
      <h2><a href="#/log/stats">Training load</a></h2>
      <p class="small muted">avg ${numHtml(formatHours(average))}</p>
    </div>
    <p class="dash-load-total">${numHtml(formatHours(thisWeek.seconds))} <span class="unit">done</span>
      ${planned.seconds ? `<span class="dash-load-planned">· ${numHtml(formatHours(planned.seconds))} <span class="unit">planned</span></span>` : ""}</p>
    <div class="stat-grid dash-load-stats">
      <div><strong>${numHtml(thisWeek.sessions)}</strong><span class="muted small">sessions</span></div>
      <div><strong>${numHtml(runKm.toLocaleString("en-GB", { maximumFractionDigits: 1 }))}</strong><span class="muted small">km run</span></div>
      <div><strong>${numHtml(Math.round(thisWeek.elevation))}</strong><span class="muted small">m D+</span></div>
      <div><strong>${numHtml(thisWeek.avgRpe ? thisWeek.avgRpe.toFixed(1) : "–")}</strong><span class="muted small">avg RPE</span></div>
    </div>
    ${loadChartHtml(weeks.map((week) => ({ monday: week.monday, seconds: secondsOf(week) })), monday, planned.seconds)}
    ${noTime ? `<p class="hint">${noTime} session${noTime === 1 ? "" : "s"} this week without a duration (not in the hours).</p>` : ""}
    ${planned.missing ? `<p class="hint">${planned.missing} planned session${planned.missing === 1 ? "" : "s"} without a duration (not in the planned hours).</p>` : ""}
  `;
}

// This week's planned hours (17c): the recipe's target time of every session
// not cancelled; a done session without a target counts with its logged time.
//   -> { seconds, missing: how many sessions had neither }
function plannedSeconds(sessions) {
  let seconds = 0;
  let missing = 0;
  for (const s of sessions.filter((x) => x.status !== "cancelled")) {
    const details = sessionDetails(s);
    const time = (details && details.target_duration_s) || (s.activity && s.activity.duration_s) || 0;
    if (time) seconds += time;
    else missing += 1;
  }
  return { seconds, missing };
}

// Hours per week as simple columns (plain HTML boxes, no chart library).
// The tallest week fills the box; this week is in the accent colour, with
// its planned hours as a dashed "ghost" column behind it.
function loadChartHtml(weeks, thisMonday, plannedThisWeek = 0) {
  const highest = Math.max(...weeks.map((w) => w.seconds), plannedThisWeek, 1);
  const percentOf = (seconds) => Math.round((seconds / highest) * 100);
  return `<div class="load-chart" role="img" aria-label="Hours per week, last ${weeks.length} weeks">
    ${weeks.map((w) => {
      const current = w.monday === thisMonday;
      const label = new Date(w.monday + "T12:00:00").toLocaleDateString("en-GB", { day: "numeric", month: "short" });
      const ghost = current && plannedThisWeek > w.seconds
        ? `<span class="load-ghost" style="height: ${percentOf(plannedThisWeek)}%"></span>` : "";
      return `<div class="load-week ${current ? "is-current" : ""}" title="Week of ${label}: ${formatHours(w.seconds)}${current && plannedThisWeek ? ` (${formatHours(plannedThisWeek)} planned)` : ""}">
        <span class="load-value">${w.seconds ? formatHours(w.seconds) : ""}</span>
        <span class="load-track">${ghost}<span class="load-column" style="height: ${percentOf(w.seconds)}%"></span></span>
      </div>`;
    }).join("")}
  </div>
  <p class="muted small load-caption"><span>${weeks.length} weeks ago</span><span class="load-caption-now">This week</span></p>`;
}


// ---------- Next race ----------

// Returns the id of the block it shows (so the block tile can stay hidden).
// Also switches Home to race mode when a registered race is close (17d).
async function drawRace(el, today, container) {
  const upcoming = (await listRaces())
    .filter((r) => r.race_date && r.race_date >= today && (r.status === "registered" || r.status === "to_register"))
    .sort((a, b) => a.race_date.localeCompare(b.race_date));
  // Race mode follows the next REGISTERED race, even if a "to register" one comes first.
  const modeRace = upcoming.find((r) => r.status === "registered");
  const raceMode = isRaceMode(modeRace, today);
  const next = raceMode ? modeRace : upcoming[0];
  if (!next) return null;
  const race = await getRace(next.id);
  // The race's own block, else the block running today.
  const block = race.training_block_id ? await getTrainingBlock(race.training_block_id) : await findBlockOn(today);
  container.querySelector(".dashboard").classList.toggle("race-mode", raceMode);
  container.querySelector("#dash-strip").hidden = !raceMode;
  el.hidden = false;
  el.innerHTML = raceMode ? raceModeHtml(race, block, today) : raceHeroHtml(race, block, today);
  return block ? block.id : null;
}

// Race mode's dark block: huge countdown, the race's numbers, block and checklist.
function raceModeHtml(race, block, today) {
  const days = Math.round((Date.parse(race.race_date) - Date.parse(today)) / 86400000);
  const ready = race.checklist.filter((i) => i.done).length;
  const facts = [
    race.distance_km ? numHtml(Number(race.distance_km), "km") : "",
    race.elevation_m ? numHtml(Number(race.elevation_m), "m D+") : "",
    race.goal_time_s ? numHtml(formatDuration(race.goal_time_s), "goal") : "",
  ].filter(Boolean);
  const week = block ? blockWeek(block, today) : null;
  return `
    <div class="dash-head">
      <h2><a href="#/races/${race.id}">Next race · ${escapeHtml(formatDayLabel(race.race_date))}</a></h2>
      <span class="race-mode-tag">${icon("flag")} Race mode</span>
    </div>
    <div class="race-mode-top">
      ${days === 0 ? `<p class="race-mode-days"><span class="num">Race day</span></p>`
        : `<p class="race-mode-days"><span class="num">${days}</span></p>
           <p class="race-mode-name"><span class="race-mode-to">${days === 1 ? "day to" : "days to"}</span>${escapeHtml(race.name)}</p>`}
    </div>
    ${days === 0 ? `<p class="race-mode-name">${escapeHtml(race.name)}</p>` : ""}
    ${facts.length ? `<p class="race-mode-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</p>` : ""}
    ${week || race.checklist.length ? `
      <div class="race-mode-bar">
        <p class="small">${block ? `<span>${escapeHtml(block.name)}</span>` : "<span></span>"}
          <span>${[week ? `week ${week.current} of ${week.total}` : "", race.checklist.length ? `checklist ${ready}/${race.checklist.length}` : ""].filter(Boolean).join(" · ")}</span></p>
        ${week ? `<span class="week-segments" role="img" aria-label="Week ${week.current} of ${week.total}">${Array.from({ length: week.total }, (_, i) =>
          `<span class="${i + 1 < week.current ? "is-done" : i + 1 === week.current ? "is-now" : ""}"></span>`).join("")}</span>` : ""}
      </div>` : ""}
  `;
}

// The countdown, the race's numbers, the block's weeks and the checklist.
function raceHeroHtml(race, block, today) {
  const days = Math.round((Date.parse(race.race_date) - Date.parse(today)) / 86400000);
  const ready = race.checklist.filter((i) => i.done).length;
  const facts = [
    race.distance_km ? numHtml(Number(race.distance_km), "km") : "",
    race.elevation_m ? numHtml(Number(race.elevation_m), "m D+") : "",
    race.goal_time_s ? `<span class="unit">goal</span> ${numHtml(formatDuration(race.goal_time_s))}` : "",
  ].filter(Boolean);
  return `
    <div class="dash-head">
      <h2><a href="#/races/${race.id}">Next race</a></h2>
      <span class="chip ${race.status === "registered" ? "is-ok" : ""}">${race.status === "registered" ? "Registered" : "To register"}</span>
    </div>
    <div class="race-hero-top">
      <p class="race-hero-days">${days === 0 ? `<span class="num">Today!</span>` : days === 1 ? `<span class="num">Tomorrow</span>`
        : `<span class="num">${days}</span> <span class="race-hero-days-label">days</span>`}</p>
      <div class="race-hero-name">
        <p class="race-hero-title">${escapeHtml(race.name)}</p>
        <p class="muted small">${escapeHtml(formatDayLabel(race.race_date))}${race.location ? ` · ${escapeHtml(race.location)}` : ""}</p>
      </div>
    </div>
    ${facts.length ? `<p class="race-hero-facts">${facts.map((f) => `<span>${f}</span>`).join("")}</p>` : ""}
    ${block ? blockBarHtml(block, today) : ""}
    ${race.checklist.length ? `
      <div class="race-hero-bar">
        <p class="small"><strong>Checklist</strong> <span class="muted">${ready} of ${race.checklist.length} ready</span></p>
        <span class="bar" role="img" aria-label="${ready} of ${race.checklist.length} ready">
          <span class="bar-fill" style="width: ${Math.round((ready / race.checklist.length) * 100)}%"></span></span>
      </div>` : ""}
  `;
}

// A block as one small segment per week: done weeks filled, this week half.
function blockBarHtml(block, today) {
  const week = blockWeek(block, today);
  const segments = Array.from({ length: week.total }, (_, i) =>
    `<span class="${i + 1 < week.current ? "is-done" : i + 1 === week.current ? "is-now" : ""}"></span>`).join("");
  return `
    <div class="race-hero-bar">
      <p class="small"><strong>${escapeHtml(block.name)}</strong> <span class="muted">week ${week.current} of ${week.total}</span></p>
      <span class="week-segments" role="img" aria-label="Week ${week.current} of ${week.total}">${segments}</span>
    </div>`;
}


// ---------- Small tiles ----------

// Current training block, unless the race card already shows it.
async function drawBlockTile(el, today, shownBlockId) {
  const block = await findBlockOn(today);
  if (!block || block.id === shownBlockId) return;
  const week = blockWeek(block, today);
  el.href = `#/blocks/${block.id}`;
  el.hidden = false;
  el.innerHTML = `
    <span class="tile-label">${icon("book-open")} Block</span>
    <span class="tile-value">${numHtml(week.current)}<span class="unit"> of ${week.total} weeks</span></span>
    <span class="tile-note">${escapeHtml(block.name)}</span>`;
}

async function drawWeight(el) {
  const [weighIns, settings] = await Promise.all([listWeighIns(), getSettings()]);
  if (!weighIns.length) return;
  const latest = weighIns[weighIns.length - 1];
  const start = settings.start_weight_kg != null ? Number(settings.start_weight_kg) : Number(weighIns[0].weight_kg);
  const target = settings.target_weight_kg != null ? Number(settings.target_weight_kg) : null;
  const kg = (n) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  const change = Number(latest.weight_kg) - start;
  let note = escapeHtml(formatDayLabel(latest.weigh_date));
  if (target) {
    const goal = start - target;
    const percent = goal ? Math.max(0, Math.min(100, Math.round((-change / goal) * 100))) : 0;
    note = `${change < 0 ? "−" : change > 0 ? "+" : ""}${kg(Math.abs(change))} kg · ${percent}% to goal`;
  }
  el.href = "#/body";
  el.hidden = false;
  el.innerHTML = `
    <span class="tile-label">${icon("scale")} Weight</span>
    <span class="tile-value">${numHtml(kg(latest.weight_kg), "kg")}</span>
    <span class="tile-note">${note}</span>`;
}

async function drawFootball(el, today) {
  const season = currentSeason(today);
  const matches = await listMatchesBetween(season.from, season.to);
  if (!matches.length) return;
  const cards = matches.map((m) => m.match_stats).filter(Boolean);
  const sum = (key) => cards.reduce((total, c) => total + Number(c[key] || 0), 0);
  el.href = "#/log/stats";
  el.hidden = false;
  el.innerHTML = `
    <span class="tile-label">${sportIcon("football")} Season ${escapeHtml(season.label)}</span>
    <span class="tile-value">${numHtml(matches.length, matches.length === 1 ? "match" : "matches")}</span>
    <span class="tile-note">${sum("goals")} G · ${sum("assists")} A · ${sum("minutes_played")}′</span>`;
}

// The most worn pair still in use (amber note when it's getting worn).
async function drawShoes(el) {
  const [shoes, distances] = await Promise.all([listShoes(), getShoeDistances()]);
  const inUse = shoes.filter((s) => !s.retired)
    .map((shoe) => ({ shoe, km: (distances[shoe.id] || { km: 0 }).km }))
    .sort((a, b) => b.km - a.km);
  if (!inUse.length) return;
  const { shoe, km } = inUse[0];
  const status = shoeStatus(km);
  el.href = "#/shoes";
  el.hidden = false;
  el.innerHTML = `
    <span class="tile-label">${icon("footprints")} Shoes</span>
    <span class="tile-value">${numHtml(km.toFixed(0), "km")}</span>
    <span class="tile-note ${status === "ok" ? "" : "is-warning"}">${escapeHtml(shoe.name)}${status === "replace" ? " · replace" : status === "warn" ? " · getting worn" : ""}</span>`;
}

// The 10k record typed in Body & goals (the one Rom tracks), if there is one.
async function drawBest(el) {
  const best = (await listPersonalBests()).find((pb) => Number(pb.distance_km) === 10);
  if (!best) return;
  el.href = "#/body";
  el.hidden = false;
  el.innerHTML = `
    <span class="tile-label">${icon("timer")} 10k best</span>
    <span class="tile-value">${numHtml(formatDuration(best.time_s))}</span>
    <span class="tile-note">${escapeHtml(formatSpeed("per_km", best.time_s, 10))}</span>`;
}
