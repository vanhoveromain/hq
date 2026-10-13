# SportHQ3 — personal training hub (v1)

## Context
- Owner: Rom, amateur hybrid athlete in Brussels: 11-a-side football, running, trail, gym.
- Replaces the Notion system "Sport HQ2" (Sport HQ 1 and 2 were Notion; this is the third version).
- v1 is single-user (me), but structure everything so it can become a public multi-user product
  ("SportHQ") for hybrid amateur athletes (club sport + running + gym).
- Learning project: I know HTML/CSS/JS fundamentals, no React yet. Readable code > clever code.

## Stack (fixed for v1)
- Vanilla HTML, CSS, JavaScript (ES modules). No frameworks, no build step, no npm runtime deps.
- Data: Supabase (Postgres) via supabase-js loaded from a CDN (pinned version).
- **All Supabase access goes through `js/storage.js`.** UI code never imports supabase-js directly.
- Auth: email + password (main way in, works in the iPhone home-screen app) and magic link (backup),
  single user. Row Level Security (RLS) on every table, scoped to `auth.uid()`.
- Every table has a `user_id` column (needed for RLS now, and for multi-user later).
- Schema changes only via SQL migrations in `supabase/migrations/`, never ad-hoc in the dashboard.
- JSON export for backup.
- Mobile-first, responsive (sessions are logged from my phone).
- ES modules + magic link need the app served over http (local static server), not opened as `file://`.

## Security
- Never expose or commit the `service_role` key. It never goes in browser code.
- Secrets live in `.env` (gitignored from the first commit). `.env.example` documents the variables.
- The Supabase anon/publishable key is designed to be public; RLS is what protects the data.

## v1 modules
1. **Weekly planner** — week view planned by hand from a session catalogue (+ copy last week, week
   templates). Move, swap, cancel, mark done, link a session to an activity log entry, workout mode.
2. **Activity log** — date, sport, session type, duration, distance (optional), elevation (optional), RPE 1–10, notes.
   No HR zones (I train by feel). Sports (same as Sport HQ2): running, football, muscle training, biking,
   swimming, stair stepper. Football matches carry a match card: opponent, minutes played, goals, assists
   (season totals computed from it).
3. **Races** — upcoming and past, distance, elevation, goal time, result, notes, pre-race checklist.
4. **Body & goals** — weekly weigh-in with trend chart (target −5 kg), personal bests (10k: 46:00).
5. **Dashboard** — this week plan vs done, next race countdown, weight trend, active rule warnings.
6. **Shoes** — name, road/trail, purchase date, retired or not; runs link to a shoe; total km computed.
7. **Training blocks** — name, start/end dates, goal/focus, recap; races link to a block.

## Milestones
1. Supabase setup (tables, RLS, auth) — done 2026-10-12
2. App shell + login — done 2026-10-12
3. Activity log (incl. football match card) — done 2026-10-12
4. Hosting (put the app online so it works on my phone) — done 2026-10-12 (live, tested on iPhone)
5. Shoes — done 2026-10-12
6. Import Sport HQ2 history from Notion (re-runnable until switch day) — done 2026-10-13 (549 activities, 29 races, 8 blocks, 6 shoes)
7. Weekly planner, in 4 parts: 7a session catalogue (done 2026-10-13), 7b planner (done 2026-10-13), 7c week templates
   (save a week as template / apply a template), 7d workout mode
8. Rule warnings
9. Races + checklist + race routine
10. Training blocks
11. Body & goals (weigh-ins, trend chart, PBs)
12. Dashboard (incl. football season totals, shoe km)
13. JSON export + polish + design pass (overall look, laptop layout for older screens, drag and drop
    of planner cards on laptop + phone (press and hold))

## Training rules (live in `js/rules.js`, never hardcoded in UI)
Rules are data + small pure functions so future users can define their own.
- Categories: heavy legs (leg explosivity, intervals, team training, match, race), easy run, upper body, rest.
- Warn when two heavy-leg sessions fall on consecutive days.
- Monday is leg explosivity OR intervals, never both.
- Race routine: when a race is added, suggest a light activation jog 2 days before and full rest the day before.
- Shoes: warn from 700 km, suggest replacing at 800 km (configurable in SHOE_RULES).
- No automatic default week (decided 2026-10-13): Rom plans each week himself (catalogue, quick-add,
  copy last week, later templates). The Thu/Fri A/B swap was dropped.

## Out of scope for v1
Multi-user, social, payments, Strava/Garmin sync, nutrition, life organisation.

## Conventions
- Dates: weeks start Monday; store calendar days as Postgres `date` (no timezone surprises).
- Durations/times stored as integer seconds; formatted for display in one helper.
- Enumerations stored as `text` + `CHECK` constraint (easier to evolve than Postgres enums).
- Table and column names: `snake_case`. JS variables/functions: `camelCase`. Data rows keep their
  database column names in JS (`activity.duration_s`) so code and tables match. One module per view in `js/views/`.
- Anything the user typed is inserted into HTML via `escapeHtml()` (or `textContent`).
- Comments where logic isn't obvious. Small functions. No clever one-liners.

## How we work
- Workflow: build on the working branch (the "draft") -> test locally -> pull request -> merge into
  `main` -> GitHub Pages publishes `main` automatically. Live app: https://vanhoveromain.github.io/hq/sporthq3/
- Database migrations are NOT drafts: one database serves local and live. Always flag them, and make
  them backward-compatible (add first, remove only after the new code is live).
- Plan first, then wait for approval. One milestone at a time.
- After each milestone: stop, explain how to test it, wait for confirmation, then commit with a clear message.
- Briefly explain key code decisions (and any JS/SQL concept that may be new).
- Explain simply, "like I'm 10": plain words, everyday analogies, no unexplained jargon.
- Ask instead of assuming. Point out flaws in the plan proactively.
- Notion "Sport HQ2" is read-only for this project: never create, edit or delete anything there.

## Decisions log
- 2026-10-13: test freely in the real database until switch day. Switch day = "big clean": delete
  app-created test rows (activities without notion_id, planned sessions, ...), KEEP the catalogue and
  match cards, then run the final Notion re-import. (A re-import alone never removes app-created rows.)
- 2026-10-13: planner (7b): week view (7 columns on laptop), + per day (quick sport or catalogue
  recipe), tap a session for Done / Not done / Cancel / Move / Swap day / Edit recipe / Remove.
  Done = link to an activity of that day, "Log it now" (pre-filled form, linked on save) or just tick.
  Logging a new activity auto-links to an open session of the same sport that day (Undo; ask if 2+).
  Unplanned activities show as dashed "extra" cards. "Copy last week" copies sessions as fresh
  planned ones (no links, no frozen details, cancelled ones come back as planned).
- 2026-10-13: no A/B weeks, no rotation, no auto-filled weeks. Order: planner first (7b, incl.
  "copy last week"), then week templates (7c) built from real weeks ("save this week as template",
  "apply template"). settings.week_rotation stays unused for now.
- 2026-10-13: one responsive app for phone AND laptop (no separate versions). New screens are built
  laptop-aware from now on (planner: 7 day columns on wide screens); a global design pass happens in
  step 13. Colours/fonts/spacing stay centralised as CSS variables in style.css.
- 2026-10-13: planner details: auto-link when an activity is logged on a day with an open planned
  session of the same sport (Undo offered; ask if 2 candidates). Session type is optional everywhere
  ("just a run" = category other); planner offers quick-add per sport without a recipe. Catalogue
  pre-filled from the Notion session templates (gym ones with exercises; running ones name only;
  "Gym" dropped as duplicate; "Lower body training" = leg explosivity). Exercise line = name, sets,
  reps-or-time (text), weight kg, note; a recipe can have `rounds` (circuits). Workout mode (7d):
  Start -> tick sets with a timer, change weights on the spot (offer to update the catalogue),
  Finish -> creates the activity, marks the session done and freezes what was done. One migration
  (20261013000001_planner.sql) covers all of step 7.
- 2026-10-13: planner redesign (Rom): a **session catalogue** (reusable sessions with details: gym =
  exercises with sets x reps x weight; others = description + optional targets) and **week templates**
  built from catalogue sessions (several menus, e.g. Normal / Race / Holiday; A/B alternation replaces the
  hardcoded Thu/Fri swap). The default week moves from rules.js into editable data; training *rules*
  stay in rules.js. Planned sessions POINT to a catalogue session, so editing it (25 kg -> 30 kg)
  updates every not-yet-done session. When a session is marked done, its details are FROZEN (snapshot)
  so history stays true.
- 2026-10-12: import details (see tools/notion-import/README.md): session types guessed from names
  (Notion has no type field), Notion name kept as activity `title` (now shown and editable in the app);
  football comes from planner sessions marked Done (no duration); match stats not imported (no date);
  planner history not imported; race ideas without a date are allowed (race_date nullable).
  A re-import never overwrites session_type, rpe or match cards. Imported gym/football activities
  can be saved without a duration.
- 2026-10-12: Notion import moved to step 6 (right after shoes). It must be re-runnable: imported rows
  carry their Notion page id (new `notion_id` column, additive migration); a re-import adds new, updates
  changed and removes deleted Notion rows, never touching rows created in the app. Until switch day,
  Notion is the source of truth (log real sessions there; the app is for testing). Import = generated
  SQL file pasted into the SQL Editor (no secret key leaves Supabase).
- 2026-10-12: shoes have no "km before the app" field: the km come from imported runs. Km are
  computed in the browser from linked runs (not stored). Warn at 700 km, replace at 800 (SHOE_RULES in
  rules.js; changed from 600/700 on 2026-10-12). Shoe picker only for running; pre-selects the last pair used; retired pairs hidden.
  Screens that live inside a tab use `tab:` in the routes list (Shoes -> Me tab).
- 2026-10-12: hosting on GitHub Pages (repo is public, Pages already enabled) from `main`.
  Web app manifest + icons for "Add to Home Screen".
- 2026-10-12: login = email + password, magic link as backup. Reason: the iPhone home-screen app
  doesn't share Safari's login and email links always open in Safari. Email codes were rejected
  because editing Supabase's email template requires custom SMTP. Password is set in the app
  (Me -> Password, min 12 characters) after a first login by link.
- 2026-10-12: for a football match the Duration box is hidden; "Minutes played" (required, 0–200) is
  saved as the match card value AND as the activity duration (0 min -> duration empty).
- 2026-10-12: activity log: sports + session types + categories live in rules.js (from the Sport HQ2
  templates; trail and D+ = heavy legs; long run, futsal, morning routine, bike, swim, stairs = other).
  Form shows only the fields a sport uses; hidden fields are saved as null. Duration typed as
  `45:00` / `1:02:30` ("." also works for the iPhone keypad). RPE optional. List: 30 per page, grouped by week.
- 2026-10-12: app shell: single page with a hash router (`#/planner`), bottom tab bar
  Home / Plan / Log / Races / Me (body, shoes, blocks and export live under Me).
  supabase-js pinned to 2.117.2 (jsDelivr `+esm`). Magic link uses the default (implicit) flow so a
  link works in any browser; `shouldCreateUser: false`. Local dev: `python3 -m http.server 8000`.
- 2026-10-12: Supabase project `sporthq3` (EU region, free plan). Migrations are applied by pasting the
  file into the dashboard SQL Editor (no CLI for now). Auth: Site URL + redirect `http://localhost:8000`,
  my user created manually, public sign-ups disabled.
- 2026-10-11: race routine vs. existing sessions: a planned match wins. The routine never replaces it;
  the app keeps the match and shows a warning instead.
- 2026-10-11: personal bests are computed automatically from every run whose distance is close to a
  PB distance (window in rules.js); manual PB entries are kept for older records (e.g. 10k 46:00).
- 2026-10-11: v1 scope extended to match Sport HQ2: football match stats, shoes, training blocks,
  all six sports.
- 2026-10-11: project is named SportHQ3; the possible future public product is still called "SportHQ".
- 2026-10-11: project lives in `sporthq3/` inside the `hq` repo (same pattern as `race-calculator/`).
