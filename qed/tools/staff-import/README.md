# Staff HQ import

One-time import of the staff schedule from the Claude artifact export into `staff_docs`
(migration `qed/supabase/migrations/20261127000001_staff_hq.sql`).

1. `node build-sql.mjs <path to staff-schedule-data.json>` -> `data/import.sql`
2. Supabase -> QED project -> SQL Editor -> paste `data/import.sql` -> Run
3. The last query shows the counts per collection (expect config 1, events 16, notes 1 for the 27 Nov 2026 export)

Every document id is kept. Re-running replaces the imported documents with the export's version
(changes made in the app to those documents are lost); documents added in the app are left alone.
`data/` is gitignored: client-confidential, never commit it.
