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
   8b. Reach-out list you fill yourself (Romain, 2026-11-09; migration 20261109000001, add-only): qed_projects.reach_out_on
   (date) overrides the automatic created + 1 year; tap the date on a row to change it, clear it = automatic again;
   "+ Add to list" (To reach out tab) gives an existing lead (name match, any case) the date or creates a new lead;
   "Reached out" = next reach-out one year from today (Undo). Lead pages light the Sales tab.
   IMPORT NOTE (step 9): copy Notion's Created time into created_at, or every lead's reach-out date resets to
   the import day + 1 year
7b. No date column (Romain, 2026-11-13, UX review #1): This week board starts with a "No date" column (open
   tasks without a due date, listOpenTasksWithoutDate in storage.js; dashed outline). Drag onto a day = that date;
   drag a dated card onto No date = date cleared (Undo either way). Before this, undated tasks only showed on their
   project page
7c. UX review #2-#5 (2026-11-13): toasts stack (3 max, each its own Undo + timer, utils/toast.js) · every dialog
   warns once before closing with unsaved changes (Cancel turns into Discard; Esc, cross, outside click too) ·
   week boards have ‹ › to later weeks (#/planner/week/1 = next week; not before this week; quick add defaults to
   that Monday) · quick add on Priorities + Planner has a project menu (non-archived; last pick remembered while open)
7d. Search (UX review #6, 2026-11-13; js/views/search.js): Cmd/Ctrl + K, "/" (not while typing) or the magnifier
   in the top bar (all sizes; hidden on Unlock + Focus). Finds project names, sales leads (client-side) and task
   titles (searchTasks: ilike, open first, max 20). Arrows + Enter. Project/lead -> its page; task -> task sheet over
   the current screen (redraw via the "qedhq:refresh" event in main.js). Empty box = last 5 opened (project page +
   task sheet call rememberOpened; localStorage "qedhq.recent", this device only)
7e. Keyboard shortcuts (UX review #7, 2026-11-13; js/utils/keys.js, help with "?"): N = quick add, G+H/P/L/S =
   go to. Selected task (task-list row or Planner card; ↓↑/J K or a click on an empty part, never hover; accent bar):
   Enter / double-click = open (title keeps one-click rename), X done, T push to tomorrow, 1-5 priority, ← → Planner
   card to the previous / next column, Esc clears. keys.js sends "qed:task-key" {action, value} to the row / card;
   taskList.js + planner.js do the work (same Undo). Planner: mouse click selects, double-click opens; a finger tap
   still opens. Off while typing, with a dialog open, on Unlock and in Focus mode
7f. Home (UX review #8, 2026-11-13): Today strip on top (1-3-5 of To do today, Overdue, Meeting points today ->
   #/priorities; Leads to reach out to -> #/sales/reach-out; amber when over / > 0; same rules as PRIORITY_LISTS +
   reachOutDate; removed silently if it can't load). Team section gone: the onboarding plan is a fixed last icon in
   Tools (not a qed_links row, not editable). Order: Today, Projects, Tools
7g. Priorities layout (UX review #9, 2026-11-13): bulk buttons = one toolbar under the counter (Today only):
   "Reset: Period · Scope · Priority" left, "Push all to tomorrow" right (same confirm + Undo). Empty To delegate /
   meetings / Delegated / Pending = one grey line ("To delegate · 0"). Laptop (>= 720 px): a thin 1-3-5 bar stays
   under the top bar once the big counter scrolls away (IntersectionObserver; priorities.leave() disconnects it)
7h. Put-off count (UX review #10, 2026-11-13; migration 20261113000001, add-only, run in the QED project 2026-11-13):
   qed_tasks.rolled_over (int, default 0). +1 by the nightly rollover and by every Push to tomorrow (row arrow, T,
   Push all, task sheet button, Planner T); = 0 when you pick a date (date chip, task sheet date, Planner drag /
   ← →). Helpers pushChanges / pickedDateChanges in rules.js. Shown as "↻ n" on the date chip and Planner cards
   from 2, amber from 5 (ROLLED_SHOW / ROLLED_WARN). Undo puts back date + count
7i. Routines (UX review #11, 2026-11-13; js/views/routine.js, full screen like Focus): #/routine/plan/<step> =
   Plan my day (Catch up: overdue + due today with ↻ >= 2 · No date yet · Your 1-3-5 (counter + quick add, always) ·
   Meeting points); #/routine/close/<step> = Close the day (Achieved today · What's left: To do + To delegate, push
   one or all · A look at tomorrow (counter + quick add, always)). Empty steps skipped, decided at start. Same rows /
   chips / Undo (taskList.js). Back / Skip / Next; last step marks it done today (localStorage qedhq.routine.<kind>).
   Started from the Priorities toolbar; Home reminder above the Today strip: Plan before 13:00, Close from 16:00
   (Brussels), until done today on this device
7j. Tap targets (UX review #12, 2026-11-13): touch screens only (@media (hover:none) and (pointer:coarse)): chips
   36 px + 8 px gaps, "+" 36 px, ⋯ / push / focus 44 px, tick 22 px. Laptop unchanged
7k. Quick capture (UX review #13, 2026-11-13; js/views/capture.js): round "＋" in the middle of the phone bottom bar +
   manifest shortcut "Add task" (#/capture -> Home + sheet; Android only, iOS has no web-app shortcuts). Sheet: title,
   project (last used, localStorage qedhq.captureProject), No date (default) / Today / Tomorrow. Stays open after Add
   (list of what was added), "Done" closes and redraws the screen underneath. Phone: sheet at the top (keyboard)
7l. Project page (UX review #15, 2026-11-13): progress line under the header ("12 open · 3 overdue · next due Thu
   20 Nov · 28 done"). Notes: light format (js/utils/markdown.js: # ## ### titles, - / 1. lists, **bold**, *italic*,
   https links bare or [text](url); escaped first, https only) shown formatted outside the field; click (not on a
   link, not while selecting text) or Enter = edit (textarea sized to the text); leaving the field = saved + formatted.
   Task notes (sheet, Focus) stay plain text. (#14 "Move to…" on Planner cards: declined by Romain)
7m. Sales (UX review #16, 2026-11-13; migration 20261113000002, add-only, run in the QED project 2026-11-13): leads get
   contact_name + contact_email (project form, Sales type only; email checked; GDPR: name + work email only, clear on
   declined leads). Lead page shows them (mailto). Next step = the lead's first open task (earliest due, undated
   last; listOpenTasksOf), NOT a column: shown in a "Next step" column (amber when due today or before, ↻), tap =
   task sheet; none = "+ Next step" (task on the lead, tomorrow by default) -> it shows in Priorities too. "New
   lead" is always the main button; "Add to list" = secondary next to it on To reach out. Table from 1100 px
7n. Polish (UX review #17-#18, 2026-11-13): row chip "Delegated to" (same as the sheet). Loading errors use
   errorHtml() (utils/html.js) with a "Try again" button; main.js redraws the current screen on [data-retry].
   #19 (faint "—" in empty table columns): declined, empty fields stay hidden until hover
7o. Romain's feedback (2026-11-15): date chip shows only the calendar icon when the task is due on the list's own
   day (rowOptions.hideDay: Priorities Today / Tomorrow, routines) · fix: an empty date chip hid (and closed its
   calendar) when the mouse left the row: row gets .is-picking until a date is picked or you click elsewhere ·
   scope = 3 buttons always on show (Major Medium Small; click the set one = clear), no "+" needed · bin on every
   open row: delete with two clicks + Undo (re-creates the task), never counted as done · Task planner uses the full
   screen width (body.is-wide) · Non-event projects have no dates (hidden in form, saved as null, not shown on
   page / card / search; hasDates in rules.js) · status "archived" now reads "Event done" ("Done" on non-event,
   projectStatusLabel in rules.js; stored value unchanged, no migration); "Event done" / "Done" button in the
   project header (Undo), "Reopen" once done; Home toggle "Show done events". Task lists with a project: Project
   column right after Task, before Due (phone: first chip). Home projects = compact list (.plist: one thin line per
   project, name · dates · tags; phone: dates under the name), replaces the big cards
7p. UX review #2 batch 1 (2026-11-15): fix: on touch screens the row bin (44 px) squeezed the title under the icons
   + sideways scroll: bin only in a "+"-opened row there (stacked layout), .task-body column minmax(0,1fr) · long
   chip values cut with "…" (full value on hover) · Planner cards: priority pill with a flag, scope pill dashed ·
   Priorities: column titles once, above the first list (rowOptions.noHead) · meeting name tag hidden inside its own
   group (rowOptions.inMeeting) · wider Project column · push arrow pinned right in its slot so icons line up.
   Project page quick add keeps today as default (Romain). Next: batch 2 = phone Priorities (#2 + #12), batch 3 =
   planner (#4 past days, #5 phone agenda)
7q. UX review #2 batch 2 (2026-11-15): Priorities toolbar = Plan · Close · "Reset ▾" menu (details.menu: period /
   scope / priority, same confirm + Undo; closes on outside click / Esc) + Push all. Phone (< 640): menu = "More"
   and also holds Push all; 1-3-5 rule text hidden (warnings + "n without a scope" stay); quick add = one line, project
   / date / Add appear once you tap it (:focus-within / :has). Stacked rows (< 1100): .task is a grid, .task-body
   display:contents: tick · title · icons on line 1, fields across the full width below; project tag max 180 px;
   scope buttons read Maj / Med / Sma on a phone (.show-phone / .hide-phone helpers)
7r. UX review #2 batch 3 (2026-11-15): Planner This week: past days with no task = thin 44 px strip (col.isPast;
   grid-template-columns set per board in boardColumnsHtml: var(--col) / var(--col-thin)). Phone (< 640): every board
   = agenda, columns stacked top to bottom, past days hidden, no min-height. drag.js: page auto-scrolls up / down
   (rAF loop) while a dragged card is held near the top / bottom of the screen
7s. UX review #2 #11 (2026-11-15): Planner hint in <details class="board-help">: open on the first visit, closing it
   stores localStorage qedhq.plannerHintSeen = 1 (this device), then it stays behind a small "?"
9. Notion import (re-runnable) · 10. Switch day. 2026-11-15: fresh export (82 projects / leads, 158 open tasks;
   3 tasks of archived / passed projects left out; 8 Paula / Gabriella projects imported as Bespoke), built with
   `node build-sql.mjs --clean` (new flag: first deletes app-made projects + tasks, Tools links kept), tested on a
   local Postgres (import + re-run). Romain runs data/import.sql in the QED project for switch day 16 Nov (run 2026-11-15, success)
   SWITCH DAY DONE 2026-11-19: Notion kept in use until then, so a fresh export (81 projects / leads, 124 open
   tasks, 3 left out) was built with --clean (app test data deleted, Tools links kept), tested on a local Postgres,
   run by Romain in the QED project (success, checked in the app). QED HQ is now the source of truth for projects,
   tasks and sales; Notion QED HQ databases are retired (read-only archive). The import is retired: never run it again
   2026-11-20: Notion page comments (Romain uses them as notes) added to the END of the project notes under
   "## Notion comments", text only (no date / name): tools/notion-import/build-comments-sql.mjs, 13 projects /
   25 comments, append only, skips projects already done; run by Romain (success). Task comments: not moved
7u. Project side panel (Romain, 2026-11-19; js/views/projectPanel.js): on Priorities and the routines, a task's
   project name is a link (tchip-project, data-open-project) that opens the project in a side panel (laptop: from
   the right, 560 px, page visible beside it; phone < 720: full screen): name, status / type / dates, "Full page"
   link, close (cross / Esc / outside click), quick add (today by default, project set) and the open tasks, edited
   in place (rows always stacked inside the panel, also >= 1100 px). Closing redraws the page underneath only if
   something changed. Moving a task to another project = "⋯" (task sheet); a task with no project keeps the
   project menu on the row. wireTaskList takes onOpenProject(id) (default: go to #/project/<id>)
7t. Romain's feedback (2026-11-15): project statuses relabelled (codes unchanged, no migration): coming_up =
   "Scheduled" (hard deadline), ongoing = "Continuous" (no deadline: multi-event contracts, website maintenance);
   new Non-event project + Reopen of a non-event = Continuous. Task-list columns resizable on a laptop
   (utils/colResize.js): handle on each column title's right edge, drag = width, double-click = normal width;
   widths in localStorage qedhq.cols (this device), as --w-<col> on <html>, used in --task-cols with the normal
   width as fallback; .task-list scrolls sideways if columns get wider than the page. Fit (Romain, 2026-11-15): a chosen width
   is a maximum (minmax(smallest, chosen)), so columns give way in a narrower window; while dragging, a column
   stops growing at what really fits (no column ever leaves the frame). Priorities: Due column last, just before
   the push / focus icons (rowOptions.dueLast + list class due-last); other lists keep Due after Project.
   Priorities uses the full screen width too (body.is-wide, like the planner). Home (2026-11-16): All projects = compact
   list, the other tabs (Own-initiated, Bespoke, Non-event, Followed up) = cards again (cardHtml, <a class="card">)
   Planner (Romain, 2026-11-16): column titles (day + date) stick under the top bar while scrolling a long column
   (.board-col-head sticky; >= 1100 px .board-columns overflow-x visible so sticky works; also on the phone agenda;
   640-1099 px still scrolls sideways, so no sticky there) · 11. Phone / laptop check + polish

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
