// build-sql.mjs: turns the Notion export (data/*.json) into one SQL file
// for QED HQ's database, plus a preview to check before running it.
//
//   node build-sql.mjs            -> data/import.sql + data/preview.txt
//
// data/ is gitignored: client data never goes into the public repo.
// Inputs (written by Claude, reading Notion read-only):
//   data/projects.json   {projects:[{url,name,type,status,sales_status,date_start,date_end,created_time,body}]}
//   data/tasks-*.json    {tasks:[{url,title,project_urls,due_date,period,scope,priority,created_time,body}]}
//   data/types.json      optional: {"<notion id>": "bespoke" | "own_initiated" | "non_event"} for the
//                        projects tagged Paula / Gabriella in Notion (default: bespoke)
//
// What the SQL does (one transaction, all or nothing; safe to run again):
//   - every imported row keeps its Notion page id (notion_id): a re-run updates it
//     instead of adding a copy;
//   - Notion rows that left the import (archived, done or deleted in Notion) are removed;
//   - rows created in the app (no notion_id) are never touched;
//   - app-only fields are kept on a re-run: a task you ticked in the app, a meeting
//     name, a reach-out date you picked.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const read = (name) => JSON.parse(fs.readFileSync(path.join(DIR, name), "utf8"));

// ---------------------------------------------------------------------
// Mappings (decided 2026-11-08, Build spec "Import from Notion")
// ---------------------------------------------------------------------

const TYPES = {
  "Own-initiated": "own_initiated",
  "Bespoke": "bespoke",
  "Non-event related": "non_event",
  "Sales": "sales",
};
// Notion used two people as "types": they become the owner.
const OWNER_TYPES = { "Paula": "paula", "Gabriella": "gabriella" };
const STATUSES = { "Tbc": "tbc", "Coming up": "coming_up", "Ongoing": "ongoing", "Passed": "passed", "Archived": "archived" };
const SALES = { "Lead": "lead", "Improvements": "improvements", "Confirmed": "confirmed", "Declined": "declined" };
const PERIODS = { "AM": "am", "PM": "pm" };
const SCOPES = { "Major": "major", "Medium": "medium", "Small": "small" };
const PRIORITY = {
  "Critical": "critical", "High priority": "high", "Medium priority": "medium",
  "Low priority": "low", "Nice to do": "nice_to_do",
};
const PEOPLE = ["Alina", "Adriana", "Cristina", "Emma", "Flavio", "Gabriella", "Paula", "Kevin", "Martin", "Design"];

// Notion page id (32 hex) from a page URL.
function notionId(url) {
  const m = String(url).match(/([0-9a-f]{32})(?:\?|$)/i) || String(url).replace(/-/g, "").match(/([0-9a-f]{32})/i);
  if (!m) throw new Error("No page id in " + url);
  return m[1].toLowerCase();
}
// A Notion date: a plain day ("2026-11-12"), or a moment in UTC
// ("2026-11-12 23:00:00Z") that we read in Brussels time (= 13 November).
const day = (v) => {
  if (!v) return null;
  const s = String(v);
  if (s.length <= 10) return s;
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date(s.replace(" ", "T")));
};
const iso = (v) => (v ? new Date(String(v).replace(" ", "T")).toISOString() : null);

// Notion's "Priority" held four things: split them.
function splitPriority(p) {
  const out = { priority: null, state: "active", is_meeting: false, delegated_to: null };
  if (!p) return out;
  if (PRIORITY[p]) out.priority = PRIORITY[p];
  else if (p === "Pending") out.state = "pending";
  else if (p === "Pending today") out.state = "pending_today";
  else if (p === "Meeting") out.is_meeting = true;
  else if (p === "Delegeted" || p === "Delegated") out.state = "delegated";
  else if (PEOPLE.includes(p)) { out.state = "delegated"; out.delegated_to = p; }
  else out.unknown = p;
  return out;
}

// ---------------------------------------------------------------------
// Page text -> plain-text notes
// ---------------------------------------------------------------------

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

export function bodyToText(body) {
  if (!body) return null;
  let t = String(body);
  // Embedded databases (the task lists) and blocks the API can't read: drop.
  t = t.replace(/<database\b[^>]*>[\s\S]*?<\/database>/g, "");
  t = t.replace(/<database\b[^>]*\/>/g, "");
  t = t.replace(/<unknown\b[^>]*\/>/g, "");
  // Sub-pages (e.g. OnsiteHQ): keep a pointer to them in Notion.
  t = t.replace(/<page\b[^>]*url="([^"]*)"[^>]*>([\s\S]*?)<\/page>/g, (_, url, title) => `Sub-page in Notion: ${title.trim()} (${url})`);
  // Mentions: keep their words; a date mention keeps its date.
  t = t.replace(/<mention-date\b[^>]*start="([^"]*)"[^>]*\/>/g, "$1");
  t = t.replace(/<mention-[a-z-]+\b[^>]*>([\s\S]*?)<\/mention-[a-z-]+>/g, "$1");
  t = t.replace(/<mention-[a-z-]+\b[^>]*\/>/g, "");
  // Empty blocks / paragraph breaks.
  t = t.replace(/<empty-block\s*\/>/g, "\n").replace(/<p\s*\/>/g, "\n").replace(/<br\s*\/?>/g, "\n");
  // Any other tag (callout, toggle, columns, details…): keep the words inside.
  t = t.replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, "");
  // Markdown: links -> "text (url)", no bold / italic markers, no heading #.
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => (text === url ? url : `${text} (${url})`));
  t = t.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1");
  t = t.replace(/(^|\s)\*([^*\n]+)\*(?=\s|$)/g, "$1$2");
  t = t.replace(/^#{1,6}\s+/gm, "");
  t = t.replace(/^---+\s*$/gm, "");
  t = t.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e);
  t = t.replace(/\\([*_[\]()#>-])/g, "$1");
  t = t.replace(/\t/g, "  ").replace(/[  ]+$/gm, "");
  t = t.replace(/\n{3,}/g, "\n\n").trim();
  return t || null;
}

// ---------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------

const q = (v) => (v === null || v === undefined ? "null" : `'${String(v).replace(/'/g, "''")}'`);
const b = (v) => (v ? "true" : "false");

function main() {
  const { projects: rawProjects } = read("projects.json");
  const rawTasks = fs.readdirSync(DIR).filter((f) => /^tasks-\d+\.json$/.test(f)).sort()
    .flatMap((f) => read(f).tasks);
  const typeChoices = fs.existsSync(path.join(DIR, "types.json")) ? read("types.json") : {};

  const notes = [];
  const projects = rawProjects.map((p) => {
    const id = notionId(p.url);
    const owner = OWNER_TYPES[p.type] || "romain";
    let type = TYPES[p.type];
    if (!type && OWNER_TYPES[p.type]) type = typeChoices[id] || "bespoke";
    if (!type) { notes.push(`Unknown type "${p.type}" on "${p.name}": imported as bespoke.`); type = "bespoke"; }
    return {
      notion_id: id,
      name: (p.name || "").trim() || "(no name)",
      type,
      status: STATUSES[p.status] || null,
      sales_status: type === "sales" ? (SALES[p.sales_status] || null) : null,
      owner,
      date_start: day(p.date_start),
      date_end: day(p.date_end) && day(p.date_end) !== day(p.date_start) ? day(p.date_end) : null,
      notes: bodyToText(p.body),
      notion_url: `https://www.notion.so/${id}`,
      created_at: iso(p.created_time),
      wasType: p.type,
    };
  });
  const projectIds = new Set(projects.map((p) => p.notion_id));

  const skipped = [];
  const seen = new Set();
  const tasks = [];
  for (const t of rawTasks) {
    const id = notionId(t.url);
    if (seen.has(id)) continue;
    seen.add(id);
    const projectId = (t.project_urls || []).map(notionId)[0] || null;
    if (projectId && !projectIds.has(projectId)) { skipped.push(t.title); continue; }
    const split = splitPriority(t.priority);
    if (split.unknown) notes.push(`Unknown priority "${split.unknown}" on task "${t.title}": left empty.`);
    tasks.push({
      notion_id: id,
      title: (t.title || "").trim() || "(no title)",
      project_notion_id: projectId,
      due_date: day(t.due_date),
      period: PERIODS[t.period] || null,
      scope: SCOPES[t.scope] || null,
      ...split,
      notes: bodyToText(t.body),
      created_at: iso(t.created_time),
    });
  }

  // --- SQL
  const L = [];
  L.push("-- QED HQ: import from Notion. Generated by tools/notion-import/build-sql.mjs.");
  L.push(`-- ${projects.length} projects / leads, ${tasks.length} open tasks. Safe to run again.`);
  L.push("begin;");
  L.push("do $$ begin");
  L.push("  if (select count(*) from auth.users) <> 1 then");
  L.push("    raise exception 'Expected exactly one account in this project (found %).', (select count(*) from auth.users);");
  L.push("  end if;");
  L.push("end $$;");
  L.push("create temporary table _owner on commit drop as select id from auth.users;");
  L.push("");
  L.push("-- Projects and sales leads");
  L.push("insert into public.qed_projects (user_id, notion_id, name, type, status, sales_status, owner, date_start, date_end, notes, notion_url, created_at) values");
  L.push(projects.map((p) => `  ((select id from _owner), ${q(p.notion_id)}, ${q(p.name)}, ${q(p.type)}, ${q(p.status)}, ${q(p.sales_status)}, ${q(p.owner)}, ${q(p.date_start)}, ${q(p.date_end)}, ${q(p.notes)}, ${q(p.notion_url)}, ${q(p.created_at)})`).join(",\n"));
  L.push("on conflict (user_id, notion_id) do update set");
  L.push("  name = excluded.name, type = excluded.type, status = excluded.status, sales_status = excluded.sales_status,");
  L.push("  owner = excluded.owner, date_start = excluded.date_start, date_end = excluded.date_end, notes = excluded.notes,");
  L.push("  notion_url = excluded.notion_url, created_at = excluded.created_at;");
  L.push("");
  if (tasks.length) {
    L.push("-- Open tasks");
    L.push("insert into public.qed_tasks (user_id, notion_id, title, project_id, due_date, period, scope, priority, state, is_meeting, delegated_to, notes, created_at) values");
    L.push(tasks.map((t) => `  ((select id from _owner), ${q(t.notion_id)}, ${q(t.title)}, ${t.project_notion_id ? `(select id from public.qed_projects where notion_id = ${q(t.project_notion_id)} and user_id = (select id from _owner))` : "null"}, ${q(t.due_date)}, ${q(t.period)}, ${q(t.scope)}, ${q(t.priority)}, ${q(t.state)}, ${b(t.is_meeting)}, ${q(t.delegated_to)}, ${q(t.notes)}, ${q(t.created_at)})`).join(",\n"));
    L.push("on conflict (user_id, notion_id) do update set");
    L.push("  title = excluded.title, project_id = excluded.project_id, due_date = excluded.due_date, period = excluded.period,");
    L.push("  scope = excluded.scope, priority = excluded.priority, state = excluded.state, is_meeting = excluded.is_meeting,");
    L.push("  delegated_to = excluded.delegated_to, notes = excluded.notes, created_at = excluded.created_at;");
    L.push("");
  }
  L.push("-- Notion rows that left the import (archived, done or deleted in Notion). App-made rows stay.");
  L.push(`delete from public.qed_tasks where notion_id is not null and notion_id not in (${tasks.map((t) => q(t.notion_id)).join(", ") || "''"});`);
  L.push(`delete from public.qed_projects where notion_id is not null and notion_id not in (${projects.map((p) => q(p.notion_id)).join(", ")});`);
  L.push("");
  L.push("commit;");
  fs.writeFileSync(path.join(DIR, "import.sql"), L.join("\n") + "\n");

  // --- Preview (counts only, plus the names Romain must check)
  const count = (list, key) => Object.entries(list.reduce((m, x) => { const k = x[key] ?? "(empty)"; m[k] = (m[k] || 0) + 1; return m; }, {}))
    .sort((a, c) => c[1] - a[1]).map(([k, n]) => `${k} ${n}`).join(" · ");
  const P = [];
  P.push(`Projects and leads: ${projects.length}`);
  P.push(`  by type: ${count(projects, "type")}`);
  P.push(`  by status: ${count(projects.filter((p) => p.type !== "sales"), "status")}`);
  P.push(`  leads by sales status: ${count(projects.filter((p) => p.type === "sales"), "sales_status")}`);
  P.push(`  with notes: ${projects.filter((p) => p.notes).length}`);
  P.push(`Open tasks: ${tasks.length} (${tasks.filter((t) => !t.project_notion_id).length} without a project)`);
  P.push(`  by state: ${count(tasks, "state")}`);
  P.push(`  by priority: ${count(tasks, "priority")}`);
  P.push(`  meeting points: ${tasks.filter((t) => t.is_meeting).length} · delegated to someone: ${tasks.filter((t) => t.delegated_to).length} · with notes: ${tasks.filter((t) => t.notes).length}`);
  P.push(`Open tasks left out (their project is archived / passed, so it stays in Notion): ${skipped.length}`);
  P.push("");
  P.push("Projects tagged Paula / Gabriella in Notion (owner set; type to confirm):");
  for (const p of projects.filter((x) => OWNER_TYPES[x.wasType])) P.push(`  ${p.notion_id}  ${p.wasType.padEnd(9)}  ${p.type.padEnd(13)}  ${p.name}`);
  if (notes.length) { P.push(""); P.push("Notes:"); notes.forEach((n) => P.push("  " + n)); }
  fs.writeFileSync(path.join(DIR, "preview.txt"), P.join("\n") + "\n");
  console.log(P.join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
