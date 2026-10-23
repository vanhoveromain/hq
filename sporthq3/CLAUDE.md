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
6. Import Sport HQ2 history from Notion (re-runnable until switch day) — done 2026-10-13 (549 activities, 29 races, 8 blocks, 6 shoes);
   final re-import on switch day 2026-10-21 (563 activities, 29 races, 8 blocks, 6 shoes)
7. Weekly planner, in 4 parts: 7a session catalogue (done 2026-10-13), 7b planner (done 2026-10-13), 7c week templates
   (save a week as template / apply a template) (done 2026-10-13), 7d workout mode (done 2026-10-14)
8. Rule warnings — done 2026-10-14
9. Races + checklist + race routine — done 2026-10-14
10. Training blocks — done 2026-10-14
11. Body & goals (weigh-ins, trend chart, PBs) — done 2026-10-14
12. Dashboard (incl. football season totals, shoe km) — done 2026-10-14
13. In 4 parts: 13a JSON export (done 2026-10-14), 13b drag and drop of planner cards (laptop + phone:
    press and hold) (done 2026-10-14), 13c design pass + polish (done 2026-10-14: "A + C", violet), 13d switch day
    (final Notion re-import, big clean, merge to live, phone check) (done 2026-10-21: the app is now the source of truth)
14. Phone feedback round 1 (2026-10-16): 14a timer for timed sets, 14b change the session during a
    workout (+ update the recipe), 14c custom sessions (+ add to catalogue)
15. Phone feedback round 2 (2026-10-19): 15a Home training load (hours per week), 15b sport colours on
    the planner, 15c add details to a "just a sport" session
16. Test round (2026-10-20, Claude tested as a user on a fake database): 16a data fixes, 16b small fixes,
    16c races on the planner, 16d missed-session nudge, 16e smarter warnings, 16f load / taper check,
    16g Sunday weekly review (all built 2026-10-20; migration 20261020000001 applied 2026-10-21)
17. Design round 2 (2026-10-21): 17a line icons, 17b number style, 17c Home A (Today first), 17d race mode =
    Home B in the last 21 days before a REGISTERED race, 17e polish (all built 2026-10-21 in one batch on the
    draft; Rom tests everything locally, then merge to main)
18. Workout mode redesign (2026-10-21, after canvas mock-ups): 18a current exercise as a big card, 18b other
    exercises as short rows, 18c dark strip on top + tab bar hidden, 18d rest bar pinned at the bottom +
    "screen stays on" toggle, 18e polish (built 2026-10-21 on the draft, same way as 17: Rom tests locally, then main)
19. Race page redesign (2026-10-21, after canvas mock-ups): 19a summary first (hero per state), 19b details form
    behind "Edit", 19c routine as day rows + tappable checklist, 19d "Add your result" on a past race (found in
    your log + PB offer), 19e polish (built 2026-10-21 on the draft, same way as 17: Rom tests locally, then main)
20. Design round 3 (2026-10-22, after canvas mock-ups): 20a planner week (⋯ menu, one-row header, stat strip,
    day load tags, warning chips, play button), 20b session menu + one-tap Done that logs it, 20c log form as a
    pop-up page, 20d consistency (back in the top bar, violet links, block page summary first), 20e Me = athlete
    profile + polish (built 2026-10-22 on the draft, same way as 17: Rom tests locally, then main)
21. Change what a planned session is (2026-10-22, Rom's request): 21a "Choose from the catalogue" on a "just a
    sport" session, 21b keeps day / place / status / notes + Undo, 21c "Choose session" on Home's Today, 21e the
    opposite "Clear the session (just <sport>)", 21d docs
22. Unfinished workout fix (2026-10-22, Rom's bug report): 22a workout page "session removed" + Log it anyway /
    Discard, 22b Home / planner banner only when the session is still planned, 22c removing or skipping a
    session frees its saved workout, 22d no underline on links styled as buttons
23. Laptop quick wins (2026-10-23, after Claude's UX review of the laptop version): 23a duration example, 23b hover
    feedback, 23c "Resume workout" on Home, 23d one look for "selected" in the log form, 23e log list without
    repeated titles (built 2026-10-23 on the draft, same way as 17: Rom tests locally, then main). Next, a separate
    step: Log search + filter by session type

## Training rules (live in `js/rules.js`, never hardcoded in UI)
Rules are data + small pure functions so future users can define their own.
- Categories: heavy legs (leg explosivity, intervals, team training, match, race), easy run, upper body, rest.
- Warn when two heavy-leg sessions fall on consecutive days.
- Leg explosivity OR intervals, never both on the same day (any day; was "Monday" until 2026-10-14).
- Race routine (RACE_ROUTINE): race day + light activation jog 2 days before; full rest the day before
  (rule rest_before_race warns if anything is planned then). A planned match wins over the jog.
- Nothing else on race day (race_day_clash); races from the Races tab count even before their routine is planned.
- Load (LOAD_RULES): warn on a week > 1.3 × your usual (4-week average); race week: ~70% of usual sessions max.
- Habit rules can be muted per pattern ("this is my normal pattern"); race rules can't.
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
  Exception asked by Rom on 2026-10-21 for step 17 (design round 2): all of 17a–17e built in one batch on
  the draft (each part still its own commit), Rom tests everything together locally, then merge to main.
  Same way for 18, 19 and 20 (design rounds after canvas mock-ups).
- After each milestone: stop, explain how to test it, wait for confirmation, then commit with a clear message.
- Briefly explain key code decisions (and any JS/SQL concept that may be new).
- Explain simply, "like I'm 10": plain words, everyday analogies, no unexplained jargon.
- Ask instead of assuming. Point out flaws in the plan proactively.
- Notion "Sport HQ2" is read-only for this project: never create, edit or delete anything there.

## Decisions log
- 2026-10-23: laptop quick wins (23; no migration), from Claude's UX review of the laptop version (screens checked
  at 1440 / 1280 / 1100 px on a fake database). 23a the empty Duration box showed "45:00" big and dark, as if
  filled in: the example is now "e.g. 45:00" in the normal font, light grey (::placeholder on .big-input and
  .mid-input). 23b hover: only inside @media (hover: hover) (= a real mouse; a phone would keep a hover look stuck
  after a tap): cards that open a screen (a.card, .dash-tile, Home cards) lift (--shadow-hover; dark mode: no
  shadow, the border lights up, --card-border-hover), planner cards a bit darker + lift, rows (log, sheet, routine,
  race fold, checklist) --hover-bg, buttons / chips / sport tiles / type chips a darker border, RPE buttons an
  inner ring. 23c Home: when the saved workout belongs to one of today's planned sessions, that session's big
  button says "Resume workout" (+ the small Log it button) and the "Workout in progress" row is hidden; the row
  stays for a workout of another session. 23d log form (Rom approved, replaces the 20c look): the chosen sport
  tile and type chip are violet (accent border + light violet tile; filled violet chip) instead of the sport
  colour / black; the sport icon keeps its colour. RPE 9-10 were dark red even when not chosen: new tokens
  --rpe-max-soft-bg / -text (light and dark) make them light like 1-8, the chosen button is filled in its band
  colour (the --rpe-max-* tokens stay for the RPE badges in the log list). 23e log list: a title equal to the
  session type (ignoring capitals) is hidden, like a match title that names the opponent. Kept as decided on
  2026-10-20: column titles inside each week card.
- 2026-10-22: unfinished workout fix (22; no migration). Bug (Rom): Home showed "Workout in progress: Spa30 -
  Explo" and the link said "This session doesn't exist (any more)". Cause: the workout in progress lives in
  localStorage on that device (utils/workout.js) and points to a planned session; removing the session (Remove
  from plan, Replace this week, removing a race routine or a race) or skipping it left the saved workout behind,
  and Home only checked "is there a saved workout?". Fix, utils/savedWorkout.js: workoutState() = none / active
  (session exists and is planned) / orphan (gone, done or skipped; one getPlannedSession; database error =
  active, as before). 22a workout page: an orphan = "This workout's session was removed" (or "already done" /
  "skipped") with "Log it anyway" and "Discard" (asks if sets were ticked); no saved workout for that id = the
  old message. "Log it anyway" = #/log/new/workout: the log form filled in from the workout (day it started,
  sport + type, stored in the workout since 22: older workouts fall back to the last sport used, so check it;
  its name as title; duration from Finish, else the time since it started when under 6 hours, else empty),
  saved as a normal activity (no planned session to tick; the usual auto-link to an open session of that sport
  that day still runs), then the workout is cleared. 22b Home's Today hero and the planner (redrawn with the
  week) show "Workout in progress" only for an active one; an orphan = "Unfinished workout: <name>" row with
  the reason, sets ticked, Log it anyway / Discard. 22c releaseWorkoutOf(ids) before Remove from plan, Replace
  this week, removeRaceRoutine, deleting a race, Mark as skipped (planner) and Skip (Home): nothing ticked ->
  cleared silently; sets ticked -> asks "Discard it too?" (Cancel keeps it for Log it anyway). 22d `a.button`
  (and hero link buttons) never underlined. One-tap Done (utils/quickLog.js) also calls releaseWorkoutOf
  before it marks the session done (same question when sets are ticked; kept -> the row says "already done").
- 2026-10-22: change what a planned session is (21; no migration). Rom: he often plans "just running"
  before knowing the session and didn't want to add a new one and remove the old one. utils/changeSession.js:
  chooseFromCatalogue(session) = sheet of that sport's catalogue sessions (not archived) + "Another sport…"
  (sport step, then that sport's sessions, ← Back) -> updatePlannedSession(template_id, sport, session_type,
  title null, details null); clearSession(session) = back to "just <sport>" (template_id, session_type, title,
  details null; a custom session is asked first, its content would be lost). Both keep the day, position,
  status and notes, redraw (warnings + planned hours update, a new warning pops like after a move) and show
  a toast with Undo that puts the previous values back exactly. Only planned sessions, never race-routine
  ones (source race_routine / race_id: the routine relies on them). Planner session menu: "Choose from the
  catalogue · N <sport> sessions" (first row; only when that sport has catalogue sessions) and "Clear the
  session (just <sport>)" (catalogue and custom sessions). Home's Today hero: a "just a sport" session gets a
  small "Choose session" button (same picker; Home redraws, also after Undo, only if Home is still shown).
  The sport / session sheets of the planner's "+" moved to changeSession.js (pickSport, pickFromSport) so
  both pickers look the same.
- 2026-10-22: design round 3 (20; no migration). Rom approved the canvas mock-ups (planner week, session
  menu, log form, block page, Me) and asked for everything at once on the draft.
  20a planner (views/planner.js): the top bar has an optional action slot and back link (utils/topbar.js,
  index.html topbar-left / topbar-right; main.js clears both before every screen; on a laptop the action
  sits next to the logo because the tabs use the right). Planner "⋯" = Copy last week, Save / apply a week
  template, Session catalogue, Manage week templates (month view: catalogue + templates); the old top menu
  and bottom buttons are gone. One-row header (‹ This week + "19 – 25 Oct" › + Week | Month; the switch
  drops below on < 360px), stat strip (done / planned, hours done / planned = plan.js plannedSeconds, moved
  there from dashboard.js; warnings count, tap = scroll to the first chip), block + Week review links. Day
  header = short day + date, "Today" pill, a load tag from rules.js dayLoadTag (heaviest category of the
  day: Heavy legs / Easy / Upper body; only "other" sessions = no tag; nothing = Rest; cool colours, never
  green / amber / red). Warnings: rules.js adds `short` to each warning ("Heavy legs Thu → Fri"); a warning
  about two days of the shown week in a row = one amber chip BETWEEN the two day cards (laptop: inside the
  later day, the 7 columns leave no gap), others = a chip inside their day; tap = full message (+ mute for
  habit rules; race rules show the message only). Today's planned session with a recipe gets a round play
  button (Start workout) next to the card. Skipped = greyed, dashed, "Skipped" (no strikethrough, no red ✕).
  20b session sheet: openSheet takes `badge` + `subtitle` (sheet.js) and sheetRowHtml (quiet rows). Header =
  sport badge, name, day · type; a numbers row; ONE main action (planned with a recipe: Start / Resume
  workout + Done and Log it side by side; "just a sport": Log it; done: Open the logged activity; skipped:
  Not skipped after all), then rows: Link to what you logged that day ("just a sport", only when there is
  one), Start with the timer, Move or swap day (asks which), Edit the recipe / Edit this session / Add
  details, Add to my catalogue, Open the race, Mark as skipped / Not done, Remove from plan (red). Exercises
  folded under "N exercises". ONE-TAP DONE (Rom's decision, 2026-10-22): "Done, no log" is removed
  everywhere because a session ticked without a log was missing from the load, stats and block totals.
  utils/quickLog.js doneInOneTap: something of that sport already logged that day and not linked -> link it
  (asks if several); else a planned duration (recipe target) -> creates the activity (date, sport, type,
  recipe name as title, duration, target km for distance sports, the usual shoe by surface, no RPE), links
  it, toast "Logged: <name> · 50:00" with Undo (deletes the activity, session back to planned); no planned
  duration or a match -> the log form, pre-filled. Same on Home's "Did you do it?" tick. suggestedShoe moved
  to quickLog.js (the log form imports it).
  20c log form (views/logForm.js): body.is-form on log/new and log/<id> hides the tab bar on a phone
  (laptop keeps the tabs in the top bar); top bar "Cancel" = the screen you came from (topbar.js
  previousScreen) and the title "New activity" / "Edit activity". When = Today / Yesterday / Other day
  chips (the date box only shows for another day). Sport = 3 × 2 tiles (radio inputs, icon in the sport
  colour); Type = chips (radio), first 5 + "More…" for long lists (running), "Just a run (no type)" kept.
  Numbers card: big duration (one-line hint), distance + D+ side by side, stairs, live pace / speed; the
  card hides for a football match (the match card has the minutes). RPE = 10 colour buttons cool to warm
  with "5 · Moderate" on the right (5 per row under 360px). Shoes / Title / Notes folded into rows that show
  their value. Save pinned at the bottom (safe area); Delete as a red text button above it.
  20d consistency: routes' back(params) in main.js = "‹ Me / Plan / Races / Blocks / Shoes / Catalogue" in
  the top bar instead of the logo on every screen inside another one (in-page back links removed). Edit in
  the top bar on the block and race pages (the race page's Edit pill is gone). Global `a { color: accent }`
  (no browser-default blue). Block page (views/blocks.js): summary first (Current / Upcoming / Past pill,
  dates, name, one segment per week, goal, recap, "Write the recap" when it just ended), stats in the
  number font, sessions per sport as one bar in the sport colours + legend, races and week notes as rows;
  the form opens with Edit (Cancel = back to the summary); a new block opens on the form. Number style on
  shoe km and the blocks list. Settings has no numbers worth styling (left as is).
  20e Me (views/me.js): dark header glued to the top bar (initial avatar, name = the account's display name
  if it has one, else the email before the @ with a capital; no new column; "Hybrid athlete"), this year's
  km run / sessions / hours; Personal bests 5k / 10k / Half / Marathon (best of typed records and runs,
  same rule as Body; "≈" for a scaled run; "—" when none); tiles: Body & goals (weight + progress bar to
  the goal), Shoes (Home's tile: most worn pair, amber when worn), Training blocks (current block week x of
  y, else the next one), Season (Home's tile; dashboard.js exports drawFootball / drawShoes); Settings row +
  gear in the top bar. Checked light / dark, 320px and laptop.
- 2026-10-21: race page redesign (19, views/races.js; no migration). Rom approved three canvas mock-ups
  (upcoming / past with result / past without result). 19a raceState(): upcoming (date from today, registered /
  to register / potential) = dark block like Home's race mode (status pill, date · place, name, countdown
  "N days to go" / "Race day!", km / D+ / goal / goal pace, the race's block as one segment per week while it
  runs, else "Part of <block>"); past (finished or date passed) with a result = white card, result big in
  the accent, "↑ m:ss under goal" green or "m:ss over goal" grey (never red), km / D+ / pace; idea (no date) =
  white card + "Set a date" (opens Edit on the date box); cancelled = greyed + struck. "Your run" = activities
  linked to the race (race_id, tap -> log). Notes shown as text (line breaks kept). A past race folds its
  block and checklist into one-line rows (checklist opens in place); routine + checklist cards only for
  races not past. 19b the details form (all fields as before) opens with the Edit pill; Cancel / Save go
  back to the summary (date change still moves / removes the routine), Delete stays in the form; a new race
  opens straight on the form. 19c routine planned = one row per day (activation jog, Full rest with a check
  that nothing else is planned that day, Race day with a flag), each opening that week in the planner, and
  "In your plan" when complete; not planned = the explanation + the button, as before; "Remove the routine"
  is a small link. Checklist = count + green bar, 48px rows (tap anywhere to tick), the remove buttons only
  after "Edit list" (no accidental deletes), "Untick all" a small link, + button to add. 19d a past race
  without a result (date passed or finished, not cancelled) gets "Add your result": the run found in the log
  (one linked to the race, else a run on race day: a "race" session first, then the closest distance) with
  "Use this" (saves its time as the result, marks the race finished, links the run to the race), or type a
  time + Save (does NOT link the found run: it may not be this race). If the time beats a PB typed in Body &
  goals for the same distance (within 2 %), a ticked box "Save it as your new PB too" updates that PB (time,
  date, race name). "I didn't run it" = status cancelled (asked first). storage.js: listRaceActivities,
  listRunsOn, linkActivityToRace (only sets race_id). 19e checked light / dark, 320px and laptop (summary or
  form left, routine + checklist right; a past race = one centred column).
- 2026-10-21: workout mode redesign (18, views/workout.js; no migration). Rom approved two canvas mock-ups
  (lifting / resting). 18a "Now" card = the exercise you're on: the one you tapped (workout.currentIndex,
  saved with the workout), else the next one with a set left; a circuit goes round by round (first exercise
  with the fewest ticks). Reps (or time) and kg in the stat font, 48px set circles (done = filled accent +
  check with a short pop, next = accent ring; tap a circle to tick / untick), one 64px "Set N done" button
  (timed exercise: "Start 45 s · set N", the 14a countdown), hint "Rest 90 s starts when you tap". When its
  sets are done it moves on by itself; all done = a "All N sets done" card with Finish (the bottom Finish
  hides then). ✎ (edit / remove) is on the Now card only: tap a row to make it current, then edit.
  18b "Up next" rows (name, sets × reps · kg, progress dots, timer icon if timed) and "Done" rows (greyed,
  green check); tap = make it current (also to fix a done one). 18c dark strip at the top of the screen:
  ‹ Plan, elapsed time, sets done N / total + thin bar, chips "Rest 90 s ▾" (sheet: Off / 1 min / 90 s /
  2 min / 3 min / Custom…, still remembered per device) and "Screen stays on"; the description / targets
  in one small line. main.js hides the tab bar on the workout route only (phone and laptop) and sets
  body.is-workout. 18d bar pinned at the bottom (safe-area aware): rest countdown + filling bar, "+15 s",
  Skip, "Next: <exercise> · set N"; a timed set uses the same bar (Get ready / set N, Stop). While resting
  the "Set done" button turns outline but still works (tap early). The rest is now saved with the workout
  (workout.rest = { endsAt, totalS }), so it carries on after a reload. Wake lock: on by default for each
  workout (workout.keepAwake), the chip turns it off / on, asked again when the app comes back; the chip is
  hidden where the browser has no wake lock and says "Screen lock: not available" if the phone refuses.
  iPhone home-screen apps may not honour it: Rom checks it on his phone. No vibration on iPhone (Safari has
  no vibrate), so the feedback is visual (+ the existing beeps); elsewhere a buzz only after a tap on the
  page (browsers refuse it otherwise). 18e checked in light / dark, 320px and laptop (workout column 560px).
- 2026-10-21: design round 2 (17), after Claude's sports-designer review and canvas mock-ups. Rom's
  choices: Home A (Today first) on normal days, Home B (race first) in the last 3 weeks (21 days) before
  a race, REGISTERED races only (not "to register"); line icons in the sport badges too (no emoji left);
  training load keeps a "planned hours" ghost bar for this week; the number font is self-hosted in the
  app (works offline, no Google Fonts / GDPR issue).
  17a line icons: every emoji / pictograph used as decoration is now a line icon (Lucide family, open
  source, inline SVG: no library loaded). js/utils/icons.js = ICONS (name -> drawing) + icon(name,
  { label, className }); icons take the text colour (currentColor), so dark mode and sport colours work
  by themselves; classes is-ok / is-error / is-muted = green / red / grey. rules.js SPORTS `icon` is now
  an icon NAME (footprints, football, dumbbell, bike, waves, stairs); sportIcon(key) returns the SVG.
  The tab bar (index.html) has the same drawings written out (inactive 1.75 stroke, active 2.25).
  Log and catalogue rows use the sport badge (sport-coloured circle) like the planner. Places that are
  plain text, not HTML (dropdown options, toasts, status messages, sheet titles) simply drop the emoji.
  Typographic arrows (→ ← ↑ ↓ › ‹) stay as text.
  17b number style: Barlow Condensed 600 / 700 (latin woff2, SIL OFL, fonts/OFL.txt) stored in fonts/,
  @font-face in style.css, token --font-num. `.num` = stat font, tabular digits; `.unit` = small grey unit
  in the normal font. format.js numHtml(value, unit) builds both ("19.5 km" splits by itself) and
  rpeLevel(rpe) gives the RPE band (low 1–3 / mid 4–6 / high 7–8 / max 9–10, --rpe-* tokens, cool to warm,
  never green / amber / red). Log list (phone): title, date, then a row of numbers (distance, time, pace,
  D+; a match: minutes played, goals, assists; "vs opponent" line kept); laptop table cells use .num.
  Stat font also on stats / block stat grids (.stat-grid strong), race countdown and result, weight, PBs,
  workout timer and weights. Planner meta lines only get tabular digits (small grey text, kept quiet).
  17c Home A (dashboard.js): order = Today hero (violet, --hero-* tokens; big "Start workout" when the
  session has a recipe, "Log it" when it's "just a sport", the other one as a small icon button; rest-day
  state; workout-in-progress resume row) with "Did you do it?" rows inside it -> review nudge + load notes
  -> next race (big countdown, km / D+ / goal, block as one segment per week, checklist bar) -> this week
  (N / M done, day strip, ALL warnings as one amber line -> planner) -> training load (done hours, planned
  hours = target time of every session not cancelled, a done one without target counts with its logged
  time, shown as a dashed ghost column behind this week's column; hint for sessions without a duration)
  -> 2-column tiles (block only if the race card doesn't show it, weight, season, most worn shoe, 10k best
  from the manual PBs). No more violet top line on cards. Phone: the two columns are display: contents and
  CSS `order` sets the sequence; laptop (>= 900px): left hero / notes / week / load, right race / tiles.
  17d race mode: rules.js HOME_RULES.raceModeDays = 21 + isRaceMode(race, today) (registered races only,
  race day included). drawRace puts class "race-mode" on .dashboard: the race becomes a dark block glued
  to the top bar (--race-mode-* tokens; huge countdown, km / D+ / goal, block weeks, checklist N/M, a
  "Race mode" tag), the Today hero turns into a white card with a violet button (the --hero-* tokens are
  overridden), and a status strip (week N/M, load done / planned, warnings count -> planner) comes next;
  then notes, tiles, week, load. A "to register" race still shows the normal race card.
  17e polish: dark mode checked (hero #4c1d95, race block #241d38 so it stands out from the dark page,
  load chart past weeks --load-past instead of a see-through violet); laptop (>= 1000px): the tab bar sits
  on the right of the top bar instead of floating at the bottom (1000–1199px: icons only, labels still
  read out); toast moves down accordingly. Checked at 320px wide (Home A / B, log, planner).
- 2026-10-21: planner "+" = two short steps (Rom: the one long list was too long): 1) pick the sport
  (with "· N in catalogue"; ✏️ Custom session below), 2) "Just <sport> (no recipe)" + that sport's
  catalogue sessions + ← Back. A sport with nothing in the catalogue skips step 2 (adds "just a sport").
  planner.js pickSessionToAdd; no migration.
- 2026-10-21: SWITCH DAY (13d) done. From now on the app is the source of truth; Notion "Sport HQ2" is a
  read-only archive (nothing new is logged there). Order: JSON backup -> big clean
  (tools/switch-day/1-preview.sql then 2-clean.sql: deleted 6 app-created activities + 1 match card and 14
  planned sessions; also covers planned weeks + reviews, week templates, app-created races / shoes / blocks,
  muted warnings, all 0 that day) -> final Notion import (563 activities, 29 races, 8 blocks, 6 shoes; the
  race missing since an earlier re-import came back; 2 empty Notion run pages skipped; 3 races without a
  Notion status came in as "idea") -> match cards for the 7 matches of the 2026-27 season (Notion "Les
  Patrons" has no dates: Rom gave them in date order; minutes played also set as the activity duration;
  one-off SQL kept in the gitignored data/ folder) -> phone check OK. KEPT: catalogue (21 sessions),
  weigh-ins and PBs (both empty that day). Planner NOT imported (as decided 2026-10-12): Rom planned the
  current week by hand. DO NOT re-run the Notion import any more: it would overwrite the app's edits to
  imported rows (title, notes, duration incl. the match durations, shoe / race links) with Notion's values.
  Supabase's "Run and enable RLS?" prompt (shown when a script creates a table, here the import's temp
  table): answer "Run without RLS" for temp tables; real tables already have RLS.
  Same day: durations filled in by SQL for the 19 activities without one since 2026-08-31 (Rom's values:
  football team training 1h10; gym 30 min, 15 min on 7 Sep and 21 Sep), so the training load counts them.
  Then the same for ALL older activities without one (114, Rom's values): team training 1h10, match 70 min
  (2025-26 matches have no match card), futsal 50 min, morning routine 5 min, other gym 30 min, stair
  stepper 30 min. Since then every activity has a duration.
  The log form now requires a duration for every activity, edits included (the exception for imported
  activities without one is gone). Only a match with 0 minutes played (bench) still saves no duration.
- 2026-10-20: 16c–16g (Claude's calls after the test round; Rom tests them together). MIGRATION
  20261020000001_reviews_and_muted_warnings.sql (additive: planned_weeks.review_notes + reviewed_at,
  settings.muted_warnings jsonb) applied by Rom in the SQL Editor on 2026-10-21 (without it the rest of
  the app still works: muted list reads as empty, saving a review / mute shows the error).
  (c) Races (registered / to register, listRacesBetween) show on their planner day as a dashed 🏁 card
  (link to the race) and 🏁 in the month, until the race routine puts a race-day session there. They
  count for the rules (calendarItems(sessions, activities, races)); new rule race_day_clash = anything
  else planned on race day. (d) Home "📋 Did you do it?" = sessions still "planned" in the last 7 days
  (max 5 shown): ✅ (done, no log) / ✍️ Log / Skipped (= cancelled). Planner: a past open session gets a
  dashed amber line + "Missed?". (e) Home shows only warnings about today or later. Warnings of rules
  with canMute (heavy legs back to back, explosivity + intervals; not race rules) are buttons in the
  planner: "🔕 This is my normal pattern" stores the warning TEXT in settings.muted_warnings (the text
  has weekdays + session types, no dates, so it mutes the same pattern every week); muted = greyed in
  the planner, not counted, not popped up, not on Home; Settings lists them with "Warn me again".
  (f) LOAD_RULES + checkLoad in rules.js, utils/load.js: "usual week" = average sessions / hours of
  the 4 weeks before (for a future week: before this week). Big jump = sessions (or hours already
  logged) > 1.3 × usual. Race week (a race in the week): sessions before race day > 70% of usual ->
  "about N or fewer". Shown on Home's Training load card and as a 📈 banner in the planner week.
  (g) Week review #/review/<monday> (views/review.js): plan vs done (skipped, never ticked), logged
  numbers, football, weight vs the week before, note "How did it go?" saved on planned_weeks. Home
  nudge on Sunday (this week) and Monday / Tuesday (last week) until reviewed; planner link
  "📝 Week review" for this and past weeks; a block page lists its week notes (for the recap).
- 2026-10-20: small fixes (16b): formatDayLabel adds the year when it isn't this year ("Sat 1 Nov
  2025"); durations also accept ' and " (44'30); decimal boxes (log distance, catalogue kg and target
  km) are text boxes read by parseDecimal ("11,2" = 11.2; type="number" can refuse the iPhone comma);
  totals of time use formatHours ("6h55", "103h40": log week totals, Stats, block page; one session
  keeps 52:30); a match row hides its title when it already names the opponent; a 2-day warning shows
  once, on its later day of the week. Copy last week / apply a template on a non-empty week: sheet
  "Replace this week" (removes sessions not done and not from a race routine) or "Add on top" (was a
  browser confirm). Race-routine sessions are never copied to another week nor saved in a template.
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
