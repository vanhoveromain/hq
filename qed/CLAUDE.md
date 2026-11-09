# QED HQ — work planner (v1)

## Context
- Owner: Romain, Account Manager & Team Leader at QED (event agency, Brussels).
- Replaces Romain's Notion "QED HQ" planner. Full inventory + build spec: the Claude Doc
  "QED HQ — Notion inventory" (tabs "Notion inventory" and "Build spec"), decisions of 2026-11-05 → 11-08.
- v1 is single-user (Romain). Every row has `user_id` so the team can join later without redesign.
- QED data is client-confidential: never commit real data (import files stay gitignored), never log it.
- Notion "QED HQ" is read-only for this project: never create, edit or delete anything there.

## Stack (same as Sport HQ, see sporthq3/CLAUDE.md)
- Vanilla HTML, CSS, JS (ES modules). No framework, no build step.
- Supabase: QED HQ's OWN project (EU), separate from the shared hq project. All access through
  `js/storage.js`; screens never import supabase-js.
- Login: the shared hq login on ownhq.app, extended to sign in to the QED project too (same email +
  password; magic link only covers the main hq project). `requireLogin()` replaces `gate.js`.
- RLS on every table (`user_id = auth.uid()`); sign-ups closed in the QED project.
- Schema changes only via `supabase/migrations/`, flagged before running (one database for local + live).
- Rules (score, 1-3-5, rollover, people lists) live in `js/rules.js`, never in screen code.
- HQ Brand Guidelines v1.0 tokens (`assets/hq-tokens.css`) + `<hq-switcher current="qed">`.
- Brussels time decides "today"; weeks start Monday; calendar days are Postgres `date`.

## v1 modules
Home (project gallery, Tools links, Onboarding) · Project page · Task sheet · Priorities of the day
(1-3-5 counter, bulk buttons) · Focus mode (timer) · Task planner (boards, drag and drop) · Sales.
Stays in Notion: QED Projects, Mobile HQ, Meeting notes, Bucket, Event teams, Van log book, OnsiteHQ,
Coordination Team HQ, archived / passed projects.

## Key rules (details in the Build spec)
- Priority score (first match wins): overdue 7 · Pending, Delegated or Meeting 0 · Pending today 1 ·
  Critical 6, High 5, Medium 4, Low 3, Nice to do 2 · none 0. To delegate keeps its normal score.
- Rollover: open tasks due before today → today, every night, weekends included (`qed_rollover_tasks()`,
  hourly cron + on app open).
- 1-3-5: To do today holds 1 Major, 3 Medium, 5 Small; warns, never blocks; meetings not counted.
- Reset the Priority clears Priority and sets Pending today back to Active. Push all to tomorrow moves
  To do today + To delegate only. Achieved lists use the day the task was ticked (`done_at`).

## Build steps
1. Database (migration 20261108000001: tables, RLS, rollover + cron, starter links) — written and tested
   locally 2026-11-08; to run in the QED project (see supabase/README.md)
2. App shell + login on both projects — built 2026-11-08: hq-home/auth.js signs in to the QED project too
   (QED first, so its cookies exist before onAuthChange redirects; failure never blocks hq; wrong hq password
   clears both; logout and password change cover both). QED HQ: requireLogin() in storage.js checks hq + QED
   (server-side getUser); no QED session -> Unlock screen (password once, email prefilled). Hash router, four
   tabs (top bar >= 720px, bottom bar on a phone), Home = Tools links from qed_links + Onboarding, rollover on
   open. Tested with both projects simulated (the cloud sandbox can't reach Supabase); local: `python3 serve.py`
   in qed/ -> http://localhost:8001 (login at /_hq/)
3. Home — built 2026-11-08: project gallery (tabs All / Own-initiated / Bespoke / Non-event / Followed up with
   owner chips; archived hidden on every tab unless "Show archived"; tab in the address #/home/<tab>), "+ New"
   pre-fills type + status (+ owner on Followed up), card -> edit pop-up (until the project page in step 4), Archive
   with Undo, Delete with a second click (tasks kept). Tools panel: Edit mode (add, rename, reorder, remove + Undo,
   https only). Lists and gallery tabs live in js/rules.js
4. Project page + task sheet — built 2026-11-08: #/project/<id> (cards on Home open it). Header (status, type,
   owner, dates, Notion link, Edit -> project form; delete -> back Home), open tasks by due date then score +
   quick add (title + due date, default today), Done folded, notes saved by themselves (1 s after typing, and on
   leaving the field; redraws wait for a save on its way). Task rows (js/views/taskList.js, reused by Priorities):
   tick with Undo, score badge, overdue in red. Task sheet: every field, picking "Delegated to" sets State =
   Delegated, Push to tomorrow (saves the form with due = tomorrow), Delete (second click). Score: priorityScore()
   in rules.js
4b. Inline editing + meetings (Romain's feedback, 2026-11-08): every field on a task row is a chip you tap (a
   <select> laid invisibly over the chip; date chip opens the picker; title = click to rename, Enter saves, Esc
   cancels; "⋯" opens the sheet). Saves at once, redraws only that row (no jumping; the database's answer is not
   copied back, so two quick changes can't undo each other). is_meeting now means "to settle in a meeting today"
   (not a meeting itself) + optional meeting_name (migration 20261108000002, add-only); turning it off clears the
   name. The Meetings list (step 5) groups today's points per meeting
4c. Tools as small app icons (Romain, 2026-11-08): favicon of the site (origin/favicon.ico, no-referrer) over
   the first letters of the name (fallback when it fails or is < 16 px), name underneath, 4 per row on a phone
4d. Design round (Romain, 2026-11-08): task title = plain text (still renames on click); set fields = soft tags
   without borders; empty fields hidden until you hover the row (laptop) or tap "+" (phone); Tools = clean icons
   (white rounded squares, favicon or a globe, name underneath), picked over link pills
5. Priorities of the day — built 2026-11-09: #/priorities. Lists (PRIORITY_LISTS in rules.js): To do today (due
   today, Active / Pending today, no meeting; AM, PM, none, then score, scope, project), Overdue (own work + to
   delegate due before today; shown only when not empty), To do tomorrow, [bulk buttons], To delegate (due today),
   To settle in meetings today (grouped by meeting_name, unnamed last), Delegated + Pending (due today or earlier),
   Achieved today / this week (by done_at, Brussels day, folded). 1-3-5 counter (amber + note when over, live while
   editing). Row Push-to-tomorrow arrow on today / overdue / to delegate. Bulk buttons ask first (with the count) and
   undo per task: Reset the period / scope (all open tasks), Reset the Priority (+ Pending today -> Active), Push
   all to tomorrow (To do today + To delegate). Changes made in place re-sort on Refresh or the next redraw
5b. Romain's feedback (2026-11-09): To do tomorrow removed from Priorities (it goes to the Task planner). Laptop
   (>= 1100 px): task lists are tables, one row per task, fields in aligned columns with titles (Task, Due, AM/PM,
   Priority, Scope, Status, Project, Score); cells in taskRowHtml + taskListInnerHtml (header row); push / score
   slots always present so columns line up. Below 1100 px: stacked rows with "+". Page width 1160 px
5c. Romain's feedback (2026-11-09): lists re-sort by themselves 0.5 s after the last in-place change (not while a
   title / meeting name is being typed; Refresh button removed; "+"-opened rows stay open across redraws). The
   priority score is never shown (it only sorts). Today / Tomorrow switch on Priorities (#/priorities/tomorrow):
   same lists for tomorrow (To do, counter, to delegate, meetings, delegated, pending); no overdue, achieved, bulk
   buttons or push arrows there; quick add defaults to tomorrow
6. Focus mode — built 2026-11-09: #/focus/<task id> (js/views/focus.js), opened by the target button on To do
   today rows (not on Tomorrow). Full screen (body.is-focus hides tabs + footer): project, title, tags, timer, notes
   (auto-save), Mark as done, Details (task sheet; timer keeps running). Timer: presets 25/50/90 + own minutes,
   Pause/Resume, +10 min, Stop; counts against an end time (right even in a background tab); tab title shows the
   time left; at the end a soft Web Audio chime + Done / +10 min / Stop; Screen Wake Lock while running; main.js
   calls view.leave() on navigation, so leaving stops the timer. Done -> Priorities with Undo
7. Task planner — built 2026-11-09: #/planner/<board> (js/views/planner.js, boards in PLANNER_BOARDS in rules.js):
   This week (Mon-Sun columns, opens first, today marked), This week's scope, Today's scope (1-3-5 room per column,
   Pending / Delegated left out), Today's priority, Tomorrow's priority. Open tasks only. Drag a card to another
   column = that field takes the column's value (day / scope / priority; 'No …' column clears it), with Undo.
   js/utils/drag.js: pointer events; mouse drags after 5 px, a finger after a 0.35 s hold (a quick swipe still
   scrolls; touchmove prevented only while dragging); ghost card + column highlight + edge auto-scroll; tap = task
   sheet; listeners removed on redraw / leave. Tick on a card = done. Active tab scrolled into view on phones
8. Sales — built 2026-11-09: #/sales/<tab> (js/views/sales.js). Leads = qed_projects with type 'sales'. Tabs
   (SALES_TABS in rules.js): Open (Lead, Improvements, or no status), To reach out (reach-out date passed;
   Romain's addition to check), Confirmed, Declined, All, with counts. Table on a laptop (Lead, Event date, Sales
   status, Created, Reach out), stacked rows on a phone. Sales status changes in place (Undo); name opens the lead
   page (its back link goes to Sales); New lead = type sales, sales_status lead, no project status. Reach out =
   created day (Brussels) + 1 year (reachOutDate in rules.js), bell + amber once passed.
   IMPORT NOTE (step 9): copy Notion's Created time into created_at, or every lead's reach-out date resets to
   the import day + 1 year
9. Notion import (re-runnable) · 10. Switch day · 11. Phone / laptop check + polish

## Test address (since 2026-11-08)
- Romain can't run serve.py easily: Vercel publishes the working branch at https://qed-preview.ownhq.app (qed
  project) and https://hq-preview.ownhq.app (hq-home project), both domains assigned to the branch, previews not
  behind Vercel Authentication. js/hqBase.js: on qed-preview, QED HQ loads auth.js / switcher.js from hq-preview;
  login still happens on live ownhq.app (shared cookies), then Unlock once. Amber "Test version" label on top.
  Live sites untouched until a merge to main.

## How we work
- Plan first, one step at a time; Romain tests each step before the next.
- Database migrations are not drafts: always flagged, backward-compatible.
- Explain simply; ask instead of assuming; point out flaws proactively.
