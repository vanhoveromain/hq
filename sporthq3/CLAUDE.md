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
   (save a week as template / apply a template) (done 2026-10-13), 7d workout mode (done 2026-10-14)
8. Rule warnings — done 2026-10-14
9. Races + checklist + race routine — done 2026-10-14
10. Training blocks — done 2026-10-14
11. Body & goals (weigh-ins, trend chart, PBs) — done 2026-10-14
12. Dashboard (incl. football season totals, shoe km) — done 2026-10-14
13. In 4 parts: 13a JSON export (done 2026-10-14), 13b drag and drop of planner cards (laptop + phone:
    press and hold) (done 2026-10-14), 13c design pass + polish (done 2026-10-14: "A + C", violet), 13d switch day
    (final Notion re-import, big clean, merge to live, phone check)
14. Phone feedback round 1 (2026-10-16): 14a timer for timed sets, 14b change the session during a
    workout (+ update the recipe), 14c custom sessions (+ add to catalogue)
15. Phone feedback round 2 (2026-10-19): 15a Home training load (hours per week), 15b sport colours on
    the planner, 15c add details to a "just a sport" session
16. Test round (2026-10-20, Claude tested as a user on a fake database): 16a data fixes, 16b small fixes,
    16c races on the planner, 16d missed-session nudge, 16e smarter warnings, 16f load / taper check,
    16g Sunday weekly review

## Training rules (live in `js/rules.js`, never hardcoded in UI)
Rules are data + small pure functions so future users can define their own.
- Categories: heavy legs (leg explosivity, intervals, team training, match, race), easy run, upper body, rest.
- Warn when two heavy-leg sessions fall on consecutive days.
- Leg explosivity OR intervals, never both on the same day (any day; was "Monday" until 2026-10-14).
- Race routine (RACE_ROUTINE): race day + light activation jog 2 days before; full rest the day before
  (rule rest_before_race warns if anything is planned then). A planned match wins over the jog.
- Shoes: warn from 700 km, suggest replacing at 800 km (configurable in SHOE_RULES).
- No automatic default week (decided 2026-10-13): Rom plans each week himself (catalogue, quick-add,
  copy last week, later templates). The Thu/Fri A/B swap was dropped.

## Ideas for the public version ("SportHQ", not v1)
- Each user defines their own training rules (turn rules on/off, change them, create new ones:
  e.g. which session types count as "heavy legs", rest days needed, max sessions per day). The rules
  are already data in rules.js (TRAINING_RULES) so they can later move to a per-user table.
- Each user defines their own sports / session types / categories (same reason).

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
- Workflow: build on the working branch (the "draft") -> test locally -> commit + push the draft.
  Since 2026-10-14 (after step 9): NO pull request per step. Merge into `main` (GitHub Pages publishes
  it: https://vanhoveromain.github.io/hq/sporthq3/) only when Rom wants to test on his phone, and
  before switch day. Every step is still committed and pushed, so nothing is lost.
- Before every pull request: run `node tools/bump-version.mjs` (new `?v=` on every file address, so
  phones fetch the whole new version together instead of mixing old and new saved copies).
  Local testing: `python3 serve.py` (no-cache server) instead of `python3 -m http.server 8000`.
- Database migrations are NOT drafts: one database serves local and live. Always flag them, and make
  them backward-compatible (add first, remove only after the new code is live).
- Plan first, then wait for approval. One milestone at a time.
- After each milestone: stop, explain how to test it, wait for confirmation, then commit with a clear message.
- Briefly explain key code decisions (and any JS/SQL concept that may be new).
- Explain simply, "like I'm 10": plain words, everyday analogies, no unexplained jargon.
- Ask instead of assuming. Point out flaws in the plan proactively.
- Notion "Sport HQ2" is read-only for this project: never create, edit or delete anything there.

## Decisions log
- 2026-10-20: data fixes (16a): deleting a logged activity puts its planned session back to "planned"
  (it was left "done" with nothing behind it); changing a linked activity's date moves its planned
  session to that day too (toast says so); "Swap day" leaves done sessions on their day; the shoe
  pre-selected for a new run comes from the DATABASE (listRecentShoeIds), not localStorage (a new
  phone / the home-screen app used to save runs with no shoe), and is picked BY SURFACE (Rom's choice):
  session types in SHOE_RULES.trailSessionTypes (trail) -> your last trail pair, others -> your last
  road pair (fallback: last pair used). It follows the session type until you pick a shoe by hand.
- 2026-10-20: Log list: sport filter = chips (All sports + each sport, same look as Stats), filtered in
  the database (listActivities({ sport })) so "Load more" pages stay 30 sessions of that sport; choice
  remembered per device (localStorage "sporthq3.logSport", separate from the Stats filter); week totals
  count only that sport. Laptop: column titles are the first row INSIDE each week card (they used to
  float above "This week" and looked like a second week label); chips left + "+ Add activity" right on
  one line (.log-toolbar). Phone: button above, chips scroll sideways. Week total hides the time when
  no session has a duration (was "0:00").
- 2026-10-19: phone feedback round 2 (15): (a) Home "Training load" card (after This week, opens Stats):
  hours this week vs average of the 4 weeks before, sessions, km run, D+, avg RPE, columns of hours per
  week for the last 8 weeks (this week in violet). Hours = logged activities' durations (a match = minutes
  played); sessions without a duration are left out and counted in a hint. (b) One colour per sport
  (--sport-running … tokens in style.css, never green/amber/red/violet): Rom chose "A, subtle" = the icon
  sits on a soft circle in the sport colour (utils/plan.js sportBadge), the card's left line still shows
  the status; same badges in the month view and on Home's week strip. (c) A planned "just a sport"
  session (no recipe, no details: isPlainSession) gets "✏️ Add details" -> #/custom/<id> pre-filled
  (name = the session's name); saving makes it a custom session (title cleared so the typed name shows).
- 2026-10-16: the SportHQ3 logo (top left) is a link to Home, on phone and laptop. Home: a tap anywhere
  on a card opens that card's screen (same as its title); links and buttons inside a card keep their job.
- 2026-10-16: phone fixes: date boxes no longer stick out of the card on iPhone (Safari ignores
  width: 100% on date inputs; fixed with appearance: none + min-width: 0 for every date box); the log's
  duration hint now says ":", "," and "." all work between the numbers (parsing already accepted them).
- 2026-10-16: laptop planner: the 7 day frames are all the same size (the tallest day sets the
  height for the whole week); month view: every week row the same height.
- 2026-10-16: workout + planner feedback (14, from Rom's first days on the phone):
  14a timed sets: an exercise whose "Reps / time" is a time ("45s", "1:00", "1 min", "1min30", "2'30";
  bare "m" is NOT minutes: 20m = metres) gets a "▶ Start 45 s · set 2" button: 3 s "get ready", one
  beep = go, at 0 three beeps, the set ticks itself, then the rest timer starts (if on). Stop = no tick.
  The countdown lives in the saved workout, so it survives a reload / locked phone (no beep while locked).
  14b during a workout: ✎ on each exercise = name, sets, reps/time, kg, or remove; "+ Add an exercise";
  circuits: ✎ next to the rounds. Ticks already done are kept when sets change. At the end, if anything
  differs from the recipe: one sheet listing the changes ("Squat: 3 → 4 sets, 25 kg → 30 kg", "+ Lunges",
  "− Crunch (removed)") -> "Update the recipe" replaces the recipe's exercises (and rounds) with today's
  version (whole list, not line by line), or "Only today". The done session's photo = what was really done.
  14c custom sessions: Plan -> + -> "Custom session" (#/custom/new/<date>, same editor as the catalogue,
  option "Also add it to my catalogue"). Stored on the planned session itself: template_id null, details =
  the content + custom: true (no migration). Card shows "custom"; menu: Edit this session (#/custom/<id>),
  Add to my catalogue (planned -> follows the new recipe; done -> keeps its photo, gets the link).
  "Not done" keeps a custom session's content; Copy last week copies it; a week template only keeps its
  sport (warning when saving). Finishing a workout on a session without a recipe (custom, or "just a sport"
  where you added exercises) offers "Add it to your catalogue?" with today's version.
- 2026-10-14: Stats page (Log tab -> List | Stats, #/log/stats). Filters: period (week, month, year,
  last 12 months, all time) + sport (all or one), remembered per device. Cards: Overview (sessions,
  per week, time, km or D+, avg RPE, sessions per sport), Year to date vs same day last year, Volume
  bar chart (per week up to ~3 months, per month up to 3 years, else per year; km for sports with a
  distance, running km when "all", sessions otherwise; 80 km/month "Min" line on monthly running =
  Sport HQ2's chart), Running (km, per week, avg pace, longest run, most D+), Football (matches,
  minutes / goals / assists from match cards), sessions by type, Consistency (plan vs done %, streak
  of weeks with 3+ sessions, busiest week), Weight change. Rules in STATS_RULES (rules.js); maths in
  utils/stats.js; chart in utils/barChart.js (SVG). Pace zones (Sport HQ2 running page, VMA 15.5)
  kept as an idea for later. CSS: never name a chart shape ".bar" (the shoe progress bar style).
- 2026-10-14: race cards differ per group: Upcoming = violet left line, big countdown, date + distance,
  goal + pace, checklist progress (listRaces brings checklist done flags); Ideas = dashed, no shadow,
  💡, name + date/distance only; Past = big result time + pace; cancelled / never run = greyed + struck.
  Cards are the same size WITHIN a group (grid-auto-rows: 1fr), groups may differ. Race page on laptop:
  header across the top, details form left (fields in 2 columns), routine + checklist sidebar right.
  Training blocks: same rule (same size within Current / Upcoming / Past); current block = violet left line.
- 2026-10-14: laptop + polish round (Rom's feedback): Home "This week" strip shows only the sport
  icons per day (done day = light green background; utils/plan.js daySummary, also used by the month).
  Plan: Week | Month switch (#/planner/month/YYYY-MM; last view remembered per device); month = calendar
  with sport icons, tap a day -> its week. Laptop: catalogue / templates links below the calendar
  (phone: still on top). Laptop (>= 1000px): Log = table (date, session, time, distance, pace, RPE);
  Races, Blocks, Shoes = card grids (.wide-page + .card-grid); Body = weight + PBs left, chart right.
  Me = menu (Body & goals, Shoes, Training blocks, Settings); Settings (#/settings) = account,
  password, backup (moved out of Me; not a 6th tab, the tab bar stays at 5).
- 2026-10-14: accent = VIOLET (#6d28d9 / #7c3aed lines / #a78bfa brand + dark mode). Orange felt too
  "Strava". Rom's end goal is one HQ hub hosting all his HQs (sport, work, personal) with the SAME
  style and one accent per HQ: hub = ink (black & white), Sport = violet, Work = blue, Personal =
  raspberry. Green / amber / red are reserved for done / warning / error in every HQ, so no HQ uses
  them as accent. (If Work HQ uses QED's teal + green later, its green clashes with "done".) Later:
  move the shared style into one stylesheet the HQs share, each HQ setting only --accent tokens.
- 2026-10-14: design pass (13c). Rom compared mock-ups (A Clean, B Night run, C Coach) and chose
  "A + C, orange": light cards lifted by a soft shadow (dark mode: thin borders instead), charcoal top
  bar (#1c1917) with orange brand, small grey UPPERCASE labels on dashboard cards and list sections,
  a 3px orange line on top of dashboard cards, a 4px left line on planner sessions (orange = planned,
  green = done, dashed = extra). Green was rejected: it clashed with "done = green". All colours are
  tokens in style.css (:root + dark mode). Laptop Home = 2 ordered columns: left "now" (Today, This
  week, Warnings), right overview (race, block, weight, football, shoes). Polish: laptop planner
  "+" next to the day name, weigh-in Save button sized, catalogue hides a type equal to the name,
  "Past ..." sections styled like the others; theme-color / manifest updated to the charcoal bar.
- 2026-10-14: drag and drop (13b): utils/dragDrop.js on pointer events (mouse and finger alike).
  Mouse: press + move 8px. Finger: hold 450 ms (a quick swipe still scrolls, a tap still opens the
  menu); page scrolling is blocked while dragging and the page auto-scrolls near the screen edges.
  Drop on another day of the shown week = move (added at the end of that day); rule warnings pop up as
  usual. Done sessions can't be dragged. Move / Swap buttons stay. Window listeners only live during a
  press (the planner redraws on every week change).
- 2026-10-14: JSON export (13a): Me -> Backup -> "Export my data" downloads sporthq3-backup-<date>.json
  with every row of the 14 tables (RLS = only your rows), paged by 1000, plus counts. "Last export"
  is remembered per device (localStorage), nudge after 30 days. No import in v1 (restore = SQL by hand).
- 2026-10-14: dashboard (12): Home = cards that each load on their own (one failing card shows its
  error, the rest still work), each title opens the full screen: Today (planned sessions with Start /
  Log, workout-in-progress banner, "rest day"), This week (done of planned, 7-day strip, running km),
  Warnings (hidden when none), Next race (registered / to register: countdown, checklist progress),
  Current block (week x of y), Weight (latest, goal %, sparkline of the trend), Football season
  (FOOTBALL_SEASON in rules.js = 1 Aug -> 15 Apr; between seasons the last one is shown as finished;
  matches = football match activities, minutes/goals/assists from match cards only), Shoes in use.
  Phone: one column; 2 columns from 700px, 3 from 1100px.
- 2026-10-14: body & goals (11): Me -> Body & goals (#/body). Weight: quick weigh-in (comma ok, one
  per day: same date = replace, via upsert), goal = settings start/target weight (start defaults to the
  first weigh-in), progress "−x kg of −y kg · z%". Chart = hand-made SVG (no library): weigh-in dots,
  trend line = average of the last WEIGHT_TREND_POINTS (4) weigh-ins (computed on all data), dashed
  target, tap/hover tooltip, range 3m/6m/1y/All (remembered); weigh-in list (delete) under the chart.
  PBs (PB_DISTANCES in rules.js: 5k, 10k, half, marathon): automatic from runs = a run counts if its
  distance is between d and d × 1.05; within 50 m it shows its real time, longer ones are scaled by
  pace and shown with "≈" (Rom chose this over strict matching). Manual records (personal_bests) win
  when faster. No migration.
- 2026-10-14: training blocks (10): Me -> Training blocks (#/blocks). List = Current (week x / y, days
  left, progress bar), Upcoming, Past (recap reminder only during the 14 days after a block ends, not for older blocks). Block page = stats computed from the
  log for the period (current block: up to today): sessions (+/week), running km (+/week), D+, total
  time (a minimum when some sessions have no duration), sessions per sport; its races; then the form
  (name, start, end, goal, recap). Overlapping blocks: warning on save, never blocked. Deleting a block
  keeps its races (link set to null). Planner shows "📘 <block> · week x / y" for the week shown.
- 2026-10-14: races (9): Races tab = Upcoming (date >= today + to register/registered, countdown),
  Ideas (no date or idea/potential), Past (finished/cancelled/date passed). Race page = routine card +
  checklist card first, details form below (goal/result time with live pace, training block picker;
  a registered race needs a date). Checklist per race: starter list (STARTER_CHECKLIST in rules.js) or
  "copy from my last race", tick / add / remove / untick all. Race routine = button "Add race routine
  to my planner" (sessions carry race_id, source race_routine); moving the race date moves the open
  routine sessions, removing the date removes them, deleting the race deletes them (cascade). The
  planner's race session links back to the race; once logged, "Use my logged time as result" sets the
  result + finished. Only ONE toast at a time: combine messages into one (a second hides the first).
- 2026-10-14: cache fix. Browsers kept old copies of some modules (planner stuck on "Loading…" when a
  new planner.js met an old rules.js; Safari's hard reload is Cmd+Option+R, not Cmd+Shift+R). Fix:
  every local import / index.html reference carries `?v=<version>`, stamped by tools/bump-version.mjs
  before each PR (one version for all files; a file imported with two versions would load twice).
  Local dev uses serve.py (Cache-Control: no-store).
- 2026-10-14: rule warnings (8): TRAINING_RULES in rules.js (data + check functions), checked by
  checkTrainingRules(items). Items = planned sessions not cancelled (a done+linked one counts as the
  logged activity) + unlinked logged activities (utils/plan.js calendarItems). The planner loads one
  extra day on each side so Sunday -> next Monday is checked. Warnings show on each day involved +
  count in the week summary; a NEW warning after an add/move/swap pops up as a toast. Warn only, never
  block. Sessions without a type ("just a sport") count as other, so they never trigger warnings.
- 2026-10-14: workout mode (7d): planner -> session -> Start workout (#/workout/<id>). Timer from the
  clock, one tick box per set (per round for circuits), weight editable on the spot (text box, comma
  ok), optional rest timer (Off/1/1.5/2/3 min or Custom: "45" = seconds, "1:15", 5 s-15 min; remembered; beeps + vibrates where allowed; no beep
  while the phone is locked), keep-screen-awake where supported. Progress lives in localStorage on
  that phone (one workout at a time). Finish -> log form pre-filled (duration from timer); saving it
  marks the session done with a snapshot (weights used, done_sets/total_sets) and, if weights
  changed, asks "update the recipe?" (matched by position + name). No migration.
- 2026-10-13: week templates (7c): made from a real week (Plan -> 📋 Templates -> Save this week;
  cancelled sessions left out; same name = replace after asking). Apply = add on top of the week
  (ask first if not empty, never deletes). No template editor: apply, adjust, save again.
  Plan -> Week templates lists them (view, rename, delete). Deleting a recipe removes it from
  templates (cascade); archiving doesn't. No migration needed.
- 2026-10-13: test freely in the real database until switch day. Switch day = "big clean": delete
  app-created test rows (activities without notion_id, planned sessions, races without notion_id +
  their checklists, week templates if Rom wants), KEEP the catalogue and match cards, then run the
  final Notion re-import. (A re-import alone never removes app-created rows.) Until switch day, real
  races are still added in Notion (an app-created race would be deleted by the big clean).
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
  link works in any browser; `shouldCreateUser: false`. Local dev: `python3 serve.py` (since 2026-10-14).
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
