// "Me" tab (step 20e): your athlete profile on top (name, this year's
// numbers, personal bests), small tiles to Body & goals, Shoes, Training
// blocks and the football season, then Settings (also the gear in the top bar).

import { listActivitiesBetween, listRunsWithTimes, listPersonalBests, listWeighIns, getSettings, listTrainingBlocks } from "../storage.js?v=202610232118";
import { PB_DISTANCES } from "../rules.js?v=202610232118";
import { todayISO, formatDayLabel } from "../utils/dates.js?v=202610232118";
import { escapeHtml, formatDuration, formatHours, numHtml } from "../utils/format.js?v=202610232118";
import { autoPersonalBests, distanceKeyOf } from "../utils/body.js?v=202610232118";
import { overview } from "../utils/stats.js?v=202610232118";
import { setTopbarAction } from "../utils/topbar.js?v=202610232118";
import { drawFootball, drawShoes } from "./dashboard.js?v=202610232118";
import { blockWeek } from "./blocks.js?v=202610232118";
import { icon } from "../utils/icons.js?v=202610232118";

// Short names for the PB row (the full ones are in Body & goals).
const PB_SHORT = { "5k": "5k", "10k": "10k", half: "Half", marathon: "Marathon" };

export function render(container, { user } = {}) {
  // Laptop: no gear, the Settings row is on the page already (29b).
  setTopbarAction({ iconName: "settings", label: "Settings", onClick: () => { window.location.hash = "#/settings"; }, phoneOnly: true });
  const today = todayISO();
  const year = today.slice(0, 4);
  container.innerHTML = `
    <div class="me-page">
      <section class="me-hero">
        <div class="me-who">
          <span class="me-avatar" aria-hidden="true">${escapeHtml(displayName(user).charAt(0).toUpperCase() || "?")}</span>
          <div>
            <h2 class="me-name">${escapeHtml(displayName(user))}</h2>
            <p class="me-tagline">Hybrid athlete</p>
          </div>
        </div>
        <div class="me-year" id="me-year">
          <span><span class="num">–</span><span class="me-year-label">km run in ${year}</span></span>
          <span><span class="num">–</span><span class="me-year-label">sessions</span></span>
          <span><span class="num">–</span><span class="me-year-label">training</span></span>
        </div>
      </section>

      <a class="card me-pbs" id="me-pbs" href="#/body">
        <span class="dash-head"><span class="section-label">Personal bests</span>${icon("chevron-right", { className: "is-muted" })}</span>
        <span class="me-pb-row" id="me-pb-row"><span class="muted small">Loading…</span></span>
      </a>

      <div class="dash-tiles me-tiles">
        <a class="dash-tile" id="me-body" href="#/body">
          <span class="tile-label">${icon("scale")} Body &amp; goals</span>
          <span class="tile-value muted small">No weigh-in yet</span>
        </a>
        <a class="dash-tile" id="me-shoes" href="#/shoes">
          <span class="tile-label">${icon("footprints")} Shoes</span>
          <span class="tile-value muted small">No shoes yet</span>
        </a>
        <a class="dash-tile" id="me-blocks" href="#/blocks">
          <span class="tile-label">${icon("book-open")} Training blocks</span>
          <span class="tile-value muted small">No block now</span>
        </a>
        <a class="dash-tile" id="me-season" href="#/log/stats" hidden></a>
      </div>

      <nav class="card menu" aria-label="App">
        <a href="#/settings">${icon("settings")} Settings <span class="muted small menu-hint">account, password, backup</span> <span aria-hidden="true">›</span></a>
      </nav>
    </div>
  `;
  const $ = (id) => container.querySelector(id);
  // Each part loads on its own; one failing never blocks the others.
  const quietly = (task) => task().catch(() => {});
  quietly(() => drawYear($("#me-year"), year, today));
  quietly(() => drawBests($("#me-pb-row")));
  quietly(() => drawBody($("#me-body")));
  quietly(() => drawBlocks($("#me-blocks"), today));
  quietly(() => drawShoesTile($("#me-shoes")));
  quietly(() => drawFootball($("#me-season"), today));
}

// The name to show: a display name if the account has one, else the part
// of the email before the @ (no name is stored anywhere else).
function displayName(user) {
  const meta = (user && user.user_metadata) || {};
  const name = meta.display_name || meta.full_name || meta.name;
  if (name) return String(name);
  const email = (user && user.email) || "";
  const local = email.split("@")[0] || "Me";
  return local.charAt(0).toUpperCase() + local.slice(1);
}

// This year: running km, sessions, hours.
async function drawYear(el, year, today) {
  const activities = await listActivitiesBetween(`${year}-01-01`, today);
  const totals = overview(activities);
  const runKm = activities.filter((a) => a.sport === "running").reduce((sum, a) => sum + Number(a.distance_km || 0), 0);
  el.innerHTML = `
    <span>${numHtml(Math.round(runKm).toLocaleString("en-GB"))}<span class="me-year-label">km run in ${year}</span></span>
    <span>${numHtml(totals.sessions)}<span class="me-year-label">sessions</span></span>
    <span>${numHtml(formatHours(totals.seconds).replace(/h00$/, "h"))}<span class="me-year-label">training</span></span>`;
}

// 5k / 10k / Half / Marathon: the best of your typed records and your runs
// (same rule as Body & goals); "—" when there's none.
async function drawBests(el) {
  const [runs, manual] = await Promise.all([listRunsWithTimes(), listPersonalBests()]);
  const auto = autoPersonalBests(runs);
  el.innerHTML = PB_DISTANCES.map((distance) => {
    const fromLog = auto[distance.key];
    const typed = manual.filter((pb) => distanceKeyOf(pb.distance_km) === distance.key)
      .sort((a, b) => a.time_s - b.time_s)[0];
    const seconds = typed && (!fromLog || typed.time_s <= fromLog.estimated_s) ? typed.time_s
      : fromLog ? fromLog.estimated_s : null;
    const approx = seconds && fromLog && seconds === fromLog.estimated_s && !fromLog.exact && !(typed && typed.time_s === seconds);
    return `<span class="me-pb">
      <span class="me-pb-label">${escapeHtml(PB_SHORT[distance.key] || distance.label)}</span>
      ${seconds ? `<span class="num">${approx ? "≈" : ""}${escapeHtml(formatDuration(seconds))}</span>` : `<span class="num is-empty">—</span>`}
    </span>`;
  }).join("");
}

// Weight + progress to the goal (bar).
async function drawBody(el) {
  const [weighIns, settings] = await Promise.all([listWeighIns(), getSettings()]);
  if (!weighIns.length) return;
  const latest = weighIns[weighIns.length - 1];
  const start = settings.start_weight_kg != null ? Number(settings.start_weight_kg) : Number(weighIns[0].weight_kg);
  const target = settings.target_weight_kg != null ? Number(settings.target_weight_kg) : null;
  const kg = (n) => Number(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  let progress = `<span class="tile-note">${escapeHtml(formatDayLabel(latest.weigh_date))}</span>`;
  if (target && start !== target) {
    const percent = Math.max(0, Math.min(100, Math.round(((start - Number(latest.weight_kg)) / (start - target)) * 100)));
    progress = `<span class="tile-bar" role="img" aria-label="${percent}% to your goal"><span style="width: ${percent}%"></span></span>
      <span class="tile-note">${percent}% to ${escapeHtml(kg(target))} kg</span>`;
  }
  el.innerHTML = `
    <span class="tile-label">${icon("scale")} Body &amp; goals</span>
    <span class="tile-value">${numHtml(kg(latest.weight_kg), "kg")}</span>
    ${progress}`;
}

// The current block (week x of y), else the next one.
async function drawBlocks(el, today) {
  const blocks = await listTrainingBlocks();
  const current = blocks.find((b) => b.start_date <= today && b.end_date >= today);
  const next = blocks.filter((b) => b.start_date > today).sort((a, b) => a.start_date.localeCompare(b.start_date))[0];
  const block = current || next;
  if (!block) return;
  const note = current
    ? `week ${numHtml(blockWeek(current, today).current)}<span class="unit"> of ${blockWeek(current, today).total}</span>`
    : `starts ${escapeHtml(formatDayLabel(next.start_date))}`;
  el.innerHTML = `
    <span class="tile-label">${icon("book-open")} Training blocks</span>
    <span class="tile-name">${escapeHtml(block.name)}</span>
    <span class="tile-note">${note}</span>`;
}

// Shoes: the same tile as Home (most worn pair, amber when it's getting worn).
async function drawShoesTile(el) {
  await drawShoes(el);
  el.querySelector(".tile-label").innerHTML = `${icon("footprints")} Shoes`;
}
