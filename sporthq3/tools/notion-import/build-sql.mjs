// build-sql.mjs — turns a Notion export (data.json) into one SQL file that
// imports it into Supabase. Run with Node:
//
//   node build-sql.mjs data/data.json data/import.sql
//
// The SQL is RE-RUNNABLE ("idempotent"): every imported row carries the id
// of its Notion page (notion_id). Running a newer file again:
//   - adds pages that are new in Notion,
//   - updates pages that changed in Notion,
//   - removes rows whose Notion page was deleted,
//   - never touches rows created in the app (they have no notion_id).
//
// Fields that only exist in the app are never overwritten by a re-import:
// session_type (you may have fixed a guess), rpe, and match cards.
//
// data.json is personal data: it lives in data/, which is gitignored.

import fs from "node:fs";

const [inputPath, outputPath] = process.argv.slice(2);
if (!inputPath || !outputPath) {
  console.error("Usage: node build-sql.mjs <data.json> <import.sql>");
  process.exit(1);
}
const data = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const warnings = [];


// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

// A Notion page URL ends with its 32-character id; that's our luggage tag.
function notionId(url) {
  const match = String(url).replace(/-/g, "").match(/[0-9a-f]{32}/i);
  if (!match) throw new Error("No Notion id in " + url);
  return match[0].toLowerCase();
}
const ids = (list) => (list || []).map(notionId);

// Notion dates are "2026-06-21" or "2026-06-21 16:01:00Z" (UTC). A run at
// 23:30 in Brussels is already the next day in UTC terms… the other way
// round, so we convert times to the Brussels calendar day.
function toDay(value) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value.replace(" ", "T"));
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("sv-SE", { timeZone: "Europe/Brussels" }); // "2026-06-21"
}

function seconds(h, m, s) {
  const total = (Number(h) || 0) * 3600 + (Number(m) || 0) * 60 + (Number(s) || 0);
  return total > 0 ? Math.round(total) : null;
}

const positive = (n) => (n == null || Number(n) <= 0 ? null : Number(n));
const clean = (text) => (text == null || String(text).trim() === "" ? null : String(text).trim());

// SQL value: NULL, number, true/false, or 'text' with quotes doubled.
function sql(value) {
  if (value == null) return "null";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  return "'" + String(value).replace(/'/g, "''") + "'";
}

const USER = "(select id from _sporthq3_user)";
const ref = (table, nid) => (nid
  ? `(select id from public.${table} where user_id = ${USER} and notion_id = ${sql(nid)})`
  : "null");


// ---------------------------------------------------------------------
// Guessing the session type from free text (Notion has no type field).
// The original Notion name is kept as the activity title.
// ---------------------------------------------------------------------

function guessRunType(text, { isRace, km }) {
  const t = text.toLowerCase();
  if (isRace) return "race";
  if (/interval|fractionn|\bl-int|\bvma\b|\d+\s*x\s*\d+/.test(t)) {
    if (/c[ôo]te|mont[ée]e|hill/.test(t)) return "intervals_hill";
    if (/\blong|\bl-/.test(t)) return "intervals_long";
    return "intervals_short";
  }
  if (/trail/.test(t)) return "trail";
  if (/(?<!sans )d\+/.test(t)) return "elevation";              // "sans D+" = without D+
  if (/sortie longue|long run|\bsl\b/.test(t) || (km && km >= 18)) return "long_run";
  return "easy_run";
}

function guessMuscleType(text) {
  const t = text.toLowerCase();
  if (/explo|lower|jambe|leg|squat|pli/.test(t)) return "explosivity";
  if (/routine|morning|matin/.test(t)) return "morning_routine";
  return "upper_body";
}

function guessFootballType(text) {
  const t = text.toLowerCase();
  if (/futsal/.test(t)) return "futsal";
  if (/game|match/.test(t)) return "match";
  return "team_training";
}

const RACE_STATUS = {
  "Ideas": "idea",
  "Potential race": "potential",
  "To register for": "to_register",
  "Registered": "registered",
  "Finished": "finished",
  "Cancelled": "cancelled",
};


// ---------------------------------------------------------------------
// Build rows
// ---------------------------------------------------------------------

const shoes = (data.shoes || []).map((s) => ({
  notion_id: notionId(s.url),
  name: clean(s.name) || "Unnamed shoe",
  surface: /trail/i.test(s.type || "") ? "trail" : (s.type ? "road" : null),
  purchase_date: toDay(s.purchase_date),
  retired: Boolean(s.retired),
}));

// Which block does each race belong to? (The link is stored on the block in Notion.)
const blockOfRace = {};
const blocks = (data.blocks || []).map((b) => {
  const nid = notionId(b.url);
  for (const raceId of ids(b.races)) blockOfRace[raceId] = nid;
  const start = toDay(b.start_date);
  let end = toDay(b.end_date) || start;
  if (start && end < start) end = start;
  return { notion_id: nid, name: clean(b.name) || "Block", start_date: start, end_date: end,
           goal: clean(b.goal), recap: clean(b.recap) };
}).filter((b) => {
  if (!b.start_date) { warnings.push(`Block "${b.name}" skipped: no start date`); return false; }
  return true;
});

// Runs first (races need the result time of their race run).
const raceOfRun = {};
for (const r of data.races || []) {
  for (const runId of ids(r.runs)) raceOfRun[runId] = notionId(r.url);
}

const activities = [];
const raceResult = {}; // race notion id -> duration of its run

function addActivity(row, label) {
  if (!row.activity_date) {
    warnings.push(`${label} "${row.title || "(no name)"}" skipped: no date`);
    return;
  }
  activities.push(row);
}

for (const r of data.runs || []) {
  const nid = notionId(r.url);
  const raceId = ids(r.races)[0] || raceOfRun[nid] || null;
  const km = positive(r.distance_km);
  const duration = seconds(r.h, r.m, r.s);
  const text = `${r.name || ""} ${r.description || ""}`;
  if (raceId && duration) raceResult[raceId] = duration;
  addActivity({
    notion_id: nid, activity_date: toDay(r.date), sport: "running",
    session_type: guessRunType(text, { isRace: Boolean(raceId), km }),
    title: clean(r.name), duration_s: duration, distance_km: km,
    elevation_m: positive(r.elevation_m) && Math.round(r.elevation_m),
    notes: clean(r.description), shoe: ids(r.shoes)[0] || null, race: raceId,
  }, "Run");
}

for (const m of data.muscle || []) {
  addActivity({
    notion_id: notionId(m.url), activity_date: toDay(m.date), sport: "muscle",
    session_type: guessMuscleType(`${m.name || ""} ${m.description || ""}`),
    title: clean(m.name), notes: clean(m.description),
  }, "Muscle session");
}

for (const b of data.biking || []) {
  addActivity({
    notion_id: notionId(b.url), activity_date: toDay(b.date), sport: "biking", session_type: "ride",
    title: clean(b.name), duration_s: seconds(b.h, b.m, b.s), distance_km: positive(b.distance_km),
    elevation_m: positive(b.elevation_m) && Math.round(b.elevation_m), notes: clean(b.description),
  }, "Ride");
}

for (const s of data.swimming || []) {
  addActivity({
    notion_id: notionId(s.url), activity_date: toDay(s.date), sport: "swimming", session_type: "swim",
    title: clean(s.name), duration_s: seconds(s.h, s.m, s.s),
    // Notion stores swims in metres; the app uses km everywhere.
    distance_km: positive(s.distance_m) && Number(s.distance_m) / 1000,
    notes: clean(s.description),
  }, "Swim");
}

for (const s of data.stairs || []) {
  addActivity({
    notion_id: notionId(s.url), activity_date: toDay(s.date), sport: "stairs", session_type: "stairs",
    title: clean(s.name), stairs_climbed: positive(s.stairs) && Math.round(s.stairs),
  }, "Stairs");
}

for (const f of data.football || []) {
  addActivity({
    notion_id: notionId(f.url), activity_date: toDay(f.date), sport: "football",
    session_type: guessFootballType(f.name || ""), title: clean(f.name),
  }, "Football session");
}

const races = (data.races || []).map((r) => {
  const nid = notionId(r.url);
  const status = RACE_STATUS[r.status] || "idea";
  if (r.status && !RACE_STATUS[r.status]) warnings.push(`Race "${r.name}": unknown status "${r.status}", set to idea`);
  return {
    notion_id: nid, name: clean(r.name) || "Race", race_date: toDay(r.date), status,
    distance_km: positive(r.distance_km), elevation_m: positive(r.elevation_m) && Math.round(r.elevation_m),
    goal_time_s: positive(r.goal_min) && Math.round(r.goal_min * 60),
    result_time_s: status === "finished" ? (raceResult[nid] || null) : null,
    block: blockOfRace[nid] || null,
  };
});


// ---------------------------------------------------------------------
// Write the SQL
// ---------------------------------------------------------------------

function upsert(table, columns, rows, toValues, updateColumns) {
  if (!rows.length) return `-- ${table}: nothing to import\n`;
  const values = rows.map((row) => `  (${USER}, ${toValues(row).join(", ")})`).join(",\n");
  return `insert into public.${table} (user_id, ${columns.join(", ")}) values\n${values}\n` +
    `on conflict (user_id, notion_id) do update set\n  ` +
    updateColumns.map((c) => `${c} = excluded.${c}`).join(",\n  ") + ";\n";
}

// Rows imported earlier whose Notion page no longer exists -> remove.
function removeDeleted(table, rows, extraCondition = "") {
  const list = rows.map((r) => sql(r.notion_id)).join(", ") || "''";
  return `delete from public.${table} where user_id = ${USER} and notion_id is not null` +
    `${extraCondition} and notion_id not in (${list});\n`;
}

const now = new Date().toISOString();
const out = [];
out.push(`-- =====================================================================
-- SportHQ3 — import from Notion "Sport HQ2"
-- Generated ${now} by tools/notion-import/build-sql.mjs
--
-- Safe to run again with a newer file: it adds, updates and removes only
-- rows that came from Notion. Paste everything into Supabase > SQL Editor > Run.
-- Everything happens in one go (a "transaction"): if anything fails,
-- nothing is changed.
-- =====================================================================

begin;

-- The app has exactly one user (you). Stop if that's not the case.
do $$
begin
  if (select count(*) from auth.users) <> 1 then
    raise exception 'Expected exactly 1 user in auth.users, found %', (select count(*) from auth.users);
  end if;
end
$$;
create temp table _sporthq3_user on commit drop as select id from auth.users;
`);

out.push(`\n-- Shoes (${shoes.length})\n`);
out.push(upsert("shoes", ["notion_id", "name", "surface", "purchase_date", "retired"], shoes,
  (s) => [sql(s.notion_id), sql(s.name), sql(s.surface), sql(s.purchase_date), sql(s.retired)],
  ["name", "surface", "purchase_date", "retired"]));

out.push(`\n-- Training blocks (${blocks.length})\n`);
out.push(upsert("training_blocks", ["notion_id", "name", "start_date", "end_date", "goal", "recap"], blocks,
  (b) => [sql(b.notion_id), sql(b.name), sql(b.start_date), sql(b.end_date), sql(b.goal), sql(b.recap)],
  ["name", "start_date", "end_date", "goal", "recap"]));

out.push(`\n-- Races (${races.length})\n`);
out.push(upsert("races", ["notion_id", "name", "race_date", "status", "distance_km", "elevation_m",
  "goal_time_s", "result_time_s", "training_block_id"], races,
  (r) => [sql(r.notion_id), sql(r.name), sql(r.race_date), sql(r.status), sql(r.distance_km),
          sql(r.elevation_m), sql(r.goal_time_s), sql(r.result_time_s), ref("training_blocks", r.block)],
  ["name", "race_date", "status", "distance_km", "elevation_m", "goal_time_s", "result_time_s", "training_block_id"]));

out.push(`\n-- Activities (${activities.length})\n`);
out.push(`-- session_type is only set the first time: a re-import keeps your corrections.\n`);
const activityColumns = ["notion_id", "activity_date", "sport", "session_type", "title", "duration_s",
  "distance_km", "elevation_m", "stairs_climbed", "notes", "shoe_id", "race_id"];
out.push(upsert("activities", activityColumns, activities,
  (a) => [sql(a.notion_id), sql(a.activity_date), sql(a.sport), sql(a.session_type), sql(a.title),
          sql(a.duration_s ?? null), sql(a.distance_km ?? null), sql(a.elevation_m ?? null),
          sql(a.stairs_climbed ?? null), sql(a.notes ?? null), ref("shoes", a.shoe), ref("races", a.race)],
  ["activity_date", "sport", "title", "duration_s", "distance_km", "elevation_m", "stairs_climbed",
   "notes", "shoe_id", "race_id"]));

out.push(`\n-- Remove rows whose Notion page was deleted (app-created rows are never touched)\n`);
out.push(removeDeleted("activities", activities));
out.push(removeDeleted("races", races));
out.push(removeDeleted("training_blocks", blocks));
out.push(removeDeleted("shoes", shoes));

out.push(`\ncommit;\n
-- What's in the app now, from Notion vs. created in the app:
select 'activities' as drawer, count(*) filter (where notion_id is not null) as from_notion,
       count(*) filter (where notion_id is null) as from_app from public.activities
union all select 'races', count(*) filter (where notion_id is not null), count(*) filter (where notion_id is null) from public.races
union all select 'training_blocks', count(*) filter (where notion_id is not null), count(*) filter (where notion_id is null) from public.training_blocks
union all select 'shoes', count(*) filter (where notion_id is not null), count(*) filter (where notion_id is null) from public.shoes;
`);

fs.writeFileSync(outputPath, out.join(""));

// Summary for the person running the script.
const bySport = {};
for (const a of activities) {
  const key = `${a.sport}/${a.session_type}`;
  bySport[key] = (bySport[key] || 0) + 1;
}
console.log(`Wrote ${outputPath} (${Math.round(fs.statSync(outputPath).size / 1024)} KB)`);
console.log(`Shoes ${shoes.length}, blocks ${blocks.length}, races ${races.length}, activities ${activities.length}`);
console.log("Activities by sport/type:", bySport);
if (warnings.length) console.log("Warnings:\n  " + warnings.join("\n  "));
