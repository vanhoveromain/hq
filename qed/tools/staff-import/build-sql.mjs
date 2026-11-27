// Staff HQ import: staff-schedule-data.json (export of the Claude artifact)
// -> data/import.sql, to run once in the QED project's SQL Editor.
//
//   node build-sql.mjs <path to staff-schedule-data.json>
//
// Keeps every document id. Re-runnable: a document already there is
// replaced by the export's version (on conflict ... do update); documents
// added in the app since are left alone.
// The data is client-confidential: data/ is gitignored, never commit it.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const COLLECTIONS = ["config", "events", "notes"];
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const src = process.argv[2];
if (!src) { console.error("Usage: node build-sql.mjs <staff-schedule-data.json>"); process.exit(1); }
const exp = JSON.parse(readFileSync(src, "utf8"));
const cols = exp.collections || {};

const unknown = Object.keys(cols).filter((c) => !COLLECTIONS.includes(c));
if (unknown.length) throw new Error("Unknown collections: " + unknown.join(", "));

const quote = (s) => "'" + String(s).replace(/'/g, "''") + "'";
const rows = [];
const counts = {};
for (const c of COLLECTIONS) {
  const docs = cols[c] || {};
  counts[c] = 0;
  for (const [id, data] of Object.entries(docs)) {
    if (!ID_RE.test(id)) throw new Error(`Bad id ${c}/${id}`);
    if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error(`Not an object: ${c}/${id}`);
    rows.push(`  (${quote(c)}, ${quote(id)}, ${quote(JSON.stringify(data))}::jsonb)`);
    counts[c]++;
  }
}
if (!counts.config) throw new Error("No config/main in the export");

const sql = `-- Staff HQ import (from ${exp.source || "export"}, exported ${exp.exportedAt || "?"})
-- ${counts.config} config · ${counts.events} events · ${counts.notes} notes
-- Run in the QED project's SQL Editor, after migration 20261127000001.
begin;
insert into public.staff_docs (collection, id, data) values
${rows.join(",\n")}
on conflict (collection, id) do update set data = excluded.data;
commit;

-- Check: expect ${JSON.stringify(counts)}
select collection, count(*) from public.staff_docs group by collection order by collection;
`;

const out = join(dirname(fileURLToPath(import.meta.url)), "data", "import.sql");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, sql);
console.log("Wrote", out, counts);
