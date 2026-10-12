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
1. **Weekly planner** — week view generated from a default template. Move, swap, cancel, mark done,
   link a session to an activity log entry.
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
2. App shell + magic-link login — done 2026-10-12
3. Activity log (incl. football match card) — done 2026-10-12
4. Hosting (put the app online so it works on my phone) — built 2026-10-12, awaiting merge + test
5. Shoes
6. Weekly planner
7. Rule warnings
8. Races + checklist + race routine
9. Training blocks
10. Body & goals (weigh-ins, trend chart, PBs)
11. Dashboard (incl. football season totals, shoe km)
12. JSON export + polish
13. (optional) Import Sport HQ2 history from Notion

## Training rules (live in `js/rules.js`, never hardcoded in UI)
Rules are data + small pure functions so future users can define their own.
- Categories: heavy legs (leg explosivity, intervals, team training, match, race), easy run, upper body, rest.
- Warn when two heavy-leg sessions fall on consecutive days.
- Monday is leg explosivity OR intervals, never both.
- Race routine: when a race is added, suggest a light activation jog 2 days before and full rest the day before.
- Shoes: warn when a pair gets close to its replacement distance (default 700 km, configurable).
- Default week: Mon explosivity/intervals, Tue easy run, Wed team training,
  Thu/Fri alternate easy run and upper body, Sat match, Sun rest.
  The Thu/Fri swap flips every week (odd week numbers: Thu easy run / Fri upper body; even: the reverse).
  It is an on/off switch in rules.js; when off, the week is always Thu easy run / Fri upper body.

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
