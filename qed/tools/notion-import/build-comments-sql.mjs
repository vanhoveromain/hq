// build-comments-sql.mjs: Notion page comments -> the end of each project's notes
// (Romain, 2026-11-20: "I use the comments as a note"). One-off, after switch day.
//
//   node build-comments-sql.mjs   -> data/comments.sql + data/comments-preview.txt
//
// Input (written by Claude, reading Notion read-only; gitignored):
//   data/comments-*.json  {pages:[{url, name, comments:[{text, resolved, context, datetime}]}]}
//
// What the SQL does (one transaction, all or nothing):
//   - adds a "## Notion comments" section at the END of the project's notes, one
//     paragraph per comment (text only: no date, no name);
//   - what is already in the notes (Notion page text, edits made in the app) stays;
//   - a project whose notes already hold that section is skipped, so running it
//     twice changes nothing;
//   - matched on notion_id; projects made in the app are never touched.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "data");
const HEADING = "## Notion comments";

const notionId = (url) => {
  const m = String(url).replace(/-/g, "").match(/([0-9a-f]{32})/i);
  if (!m) throw new Error("No page id in " + url);
  return m[1].toLowerCase();
};

const ENTITIES = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&#39;": "'", "&nbsp;": " " };

// Notion comment text -> the notes' light format (utils/markdown.js: **bold**,
// *italic*, bare https links or [text](url)).
export function commentToText(raw) {
  let t = String(raw || "");
  t = t.replace(/<br\s*\/?>/g, "\n");
  // Mentions and other tags: keep the words inside.
  t = t.replace(/<mention-date\b[^>]*start="([^"]*)"[^>]*\/>/g, "$1");
  t = t.replace(/<\/?[a-z][a-z0-9-]*\b[^>]*>/gi, "");
  t = t.replace(/&[a-z#0-9]+;/gi, (e) => ENTITIES[e] ?? e);
  // A link whose text is its own address: the bare address (it still links).
  t = t.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (all, text, url) => (text.replace(/\\(.)/g, "$1") === url ? url : all));
  // Markdown escapes Notion adds (\_ \* …) outside links.
  t = t.replace(/\\([*_[\]()#>`~-])/g, "$1");
  t = t.replace(/[ \t]+$/gm, "").replace(/\n{3,}/g, "\n\n").trim();
  return t;
}

const q = (v) => `'${String(v).replace(/'/g, "''")}'`;

function main() {
  const pages = fs.readdirSync(DIR).filter((f) => /^comments-[a-z0-9]+\.json$/.test(f)).sort()
    .flatMap((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), "utf8")).pages);

  const rows = [];
  for (const p of pages) {
    const texts = (p.comments || []).map((c) => commentToText(c.text)).filter(Boolean);
    if (!texts.length) continue;
    rows.push({ id: notionId(p.url), name: p.name, section: `${HEADING}\n\n${texts.join("\n\n")}`, count: texts.length });
  }

  const L = [];
  L.push("-- QED HQ: Notion comments added to the end of each project's notes.");
  L.push(`-- ${rows.length} projects, ${rows.reduce((n, r) => n + r.count, 0)} comments. Safe to run again (skips projects already done).`);
  L.push("begin;");
  for (const r of rows) {
    L.push(`update public.qed_projects set notes = case when coalesce(notes, '') = '' then ${q(r.section)} else notes || E'\\n\\n' || ${q(r.section)} end`);
    L.push(`  where notion_id = ${q(r.id)} and position(${q(HEADING)} in coalesce(notes, '')) = 0;`);
  }
  L.push("commit;");
  fs.writeFileSync(path.join(DIR, "comments.sql"), L.join("\n") + "\n");

  const P = [`Pages read: ${pages.length} · with comments: ${rows.length} · comments: ${rows.reduce((n, r) => n + r.count, 0)}`, ""];
  for (const r of rows) P.push(`  ${String(r.count).padStart(2)}  ${r.name}`);
  fs.writeFileSync(path.join(DIR, "comments-preview.txt"), P.join("\n") + "\n");
  console.log(P.join("\n"));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
