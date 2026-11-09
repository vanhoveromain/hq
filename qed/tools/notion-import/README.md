# Notion import (QED HQ in Notion → QED HQ app)

Re-runnable import of Romain's Notion "QED HQ" (projects, sales leads, open tasks) into QED HQ's own
Supabase project. Decided 2026-11-08 (Build spec, "Import from Notion"); built in step 9.

## How it works
1. Claude reads Notion **read-only** and saves the raw data in `data/` (gitignored: client data never goes into
   this public repo):
   - `data/projects.json`: projects with Status Tbc / Coming up / Ongoing, and every Sales lead (any status);
   - `data/tasks-*.json`: every open task (the ones of archived / passed projects are left out by the build).
2. `node build-sql.mjs` writes `data/import.sql` and `data/preview.txt` (counts + the projects tagged Paula /
   Gabriella, whose real type can be set in `data/types.json`, default Bespoke).
3. Romain runs `import.sql` in the QED Supabase project → SQL Editor → Run. One transaction: all or nothing.

## Re-running (until switch day)
Every imported row keeps its Notion page id (`notion_id`). Running a newer `import.sql`:
- updates rows that changed in Notion, adds new ones;
- removes imported rows that left the import (archived, done or deleted in Notion);
- never touches rows created in the app (no `notion_id`);
- keeps app-only fields: a task ticked in the app stays done, meeting names, reach-out dates picked in the app.

After switch day the app is the source of truth: **do not run it again** (it would overwrite app edits of
imported rows with Notion's old values).

## Mapping
| Notion | App |
|---|---|
| Type Own-initiated / Bespoke / Non-event related / Sales | type `own_initiated` / `bespoke` / `non_event` / `sales` |
| Type Paula / Gabriella | owner `paula` / `gabriella`, type from `types.json` (default `bespoke`) |
| Status, Sales Status | `status`, `sales_status` (sales status only on leads) |
| Date (may hold a time) | `date_start` / `date_end`, days only |
| Created time | `created_at` (so a lead's reach-out date, created + 1 year, stays right) |
| Page text | `notes`, plain text; embedded task lists dropped; sub-pages (OnsiteHQ…) kept as a line with their Notion link |
| Task Priority Critical … Nice to do | `priority` |
| Task Priority Pending / Pending today / Delegeted | `state` pending / pending_today / delegated |
| Task Priority = a person or Design | `state` delegated + `delegated_to` |
| Task Priority Meeting | `is_meeting` |
| Period, Scope, Due Date | `period`, `scope`, `due_date` |
