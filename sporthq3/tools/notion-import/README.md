# Notion import (Sport HQ2 → SportHQ3)

> **Retired on switch day (2026-10-21).** The app is now the source of truth. Do not re-run this
> import: it would overwrite edits made in the app to imported rows with Notion's old values.
> Kept for reference only.

Re-runnable import of the Notion "Sport HQ2" history into Supabase.

## How it works
1. Claude reads the Notion databases **read-only** (Notion MCP, SQL queries) and saves them as
   `data/data.json` (gitignored: personal data never goes into this public repo).
2. `node build-sql.mjs data/data.json data/import.sql` turns it into one SQL file.
3. Paste `import.sql` into Supabase → SQL Editor → Run. One transaction: all or nothing.

## Re-running
Every imported row carries `notion_id` (its Notion page id). Running a newer file:
- adds new Notion pages, updates changed ones, removes rows whose page was deleted in Notion;
- never touches rows created in the app (`notion_id` is empty);
- keeps app-only fields: `session_type` (only set on first import), `rpe`, match cards.

## What is imported
| Notion | SportHQ3 |
|---|---|
| Running activities | activities (running), type guessed from name/description, Notion name → title |
| Muscle training | activities (muscle), type guessed: lower/explo → explosivity, routine → morning routine, else upper body |
| Biking, Swimming (m → km), Stair stepper | activities |
| Training sessions with sport Football and Done ✓ | activities (football): game/match → match, futsal → futsal, else team training. No duration |
| Races (incl. ideas without date) | races; result time = time of the linked run |
| Training blocks | training_blocks; races linked through the block |
| Running shoes + Old running shoes (retired) | shoes; runs linked to their pair |

Not imported: planner sessions (old plans), "Les Patrons" match stats (no date, can't be matched).

## data.json shape
`runs[]: {url, date, distance_km, h, m, s, elevation_m, shoes[], races[], name, description}`,
`muscle[]: {url, date, name, description}`, `biking[]` (like runs, no shoes/races),
`swimming[]: {url, date, distance_m, h, m, s, name}`, `stairs[]: {url, date, stairs, name}`,
`football[]: {url, date, name}`, `shoes[]: {url, name, type, purchase_date, retired}`,
`blocks[]: {url, name, start_date, end_date, goal, recap, races[]}`,
`races[]: {url, name, date, status, distance_km, elevation_m, goal_min, runs[]}`.
`url` / relation values may be full Notion URLs or bare 32-character page ids.
