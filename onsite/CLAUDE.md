# Onsite HQ — QED on site (run of show + packing list)

## Context
- Owner: Romain (QED). Started 2026-11-26 to replace the Notion "OnsiteHQ" template (Notion stays read-only).
- Goal: an iPad on site showing what happens now / next, ticking tasks as they're done, plus the packing
  list (packed at the office, returned after the event). First real use: Blockchain for Europe Summit 2026
  (setup + 1-2 Dec 2026, Sparks, Rue Ravenstein 60, Brussels).
- QED data is client-confidential: never commit real event data, never log it.

## Decisions (Romain, 2026-11-26)
- Separate app: onsite.ownhq.app (Vercel project root `onsite/`), same hq login, data in QED HQ's Supabase
  project (EU), tables `onsite_*` (migration `qed/supabase/migrations/20261126000001_onsite_hq.sql`, RUN
  2026-11-26). One migrations folder for that database: `qed/supabase/migrations/`.
- Single user now, owner on every run-of-show line so the team can join later.
- Run-of-show line: start time (+ optional end), title, owner, room, notes, speakers + moderators on stage
  (counts only). Two kinds: `programme` (on stage) and `task`; both ticked (`done_at`). Since 2026-11-26
  (Romain: sessions run late) a programme session stays "on stage" until ticked, whatever the clock says.
- Main screen (iPad): big Now / Next cards on top, the day's full timeline below; unticked tasks past their
  time in red.
- Packing list: categories (= boxes) + quantities, Packed + Returned ticks, master material list to pick from
  (seeded from last year's list).
- New event: standard templates, save a past event as a template, link to a QED HQ project — AFTER the
  event (columns `is_template`, `project_id` already exist).
- Offline-proof.
- Scope until the summit (core only): event, packing list, run-of-show editor, Now / Next, offline.

## Stack
- Vanilla HTML / CSS / JS modules, no build step (same as QED HQ). HQ Brand Guidelines tokens, data-hq="qed".
- `js/storage.js` is the only file that talks to the database. Offline first: a copy per account in
  localStorage (`onsite.data.<user id>`), changes made on the copy at once + an outbox
  (`onsite.outbox.<user id>`) sent when online (open, `online` event, every 20 s while waiting, back to the
  app). Ids made in the app (crypto.randomUUID) so offline rows don't duplicate. After sending: full download.
  Last change wins. Refused changes are dropped and the download restores the database's truth.
- Login: hq `auth.js` + QED project session (Unlock screen, like QED HQ). Offline: opens with the last account
  seen on this device (`onsite.lastUser`).
- `sw.js`: keeps the app files (network first, 4 s, then the saved copy), the hq login file and the
  jsdelivr libraries (cache first). The page hands the SW the files loaded before it started. Bump VERSION
  when the SHELL list changes. Never touches supabase.co.
- Rules and lists (owners, rooms, day labels) in `js/rules.js`.

## Build steps
1. Database — migration 20261126000001 (5 tables, RLS, cascades), tested on a local Postgres, RUN 2026-11-26
2. App shell — built 2026-11-26: login + Unlock, offline copy + outbox + sync pill (Connecting / Synced /
   Offline · n waiting / Sync problem; tap = sync now), service worker, icon, Events home (coming up / past,
   "On site now"), event form (name, venue, address, first-last event day, optional setup + teardown day,
   rooms, notes; removing a day with lines warns first), event page with Run of show / Packing list tabs
   (placeholders), delete with Undo. Tested in Chromium with a fake database (create, offline edit, offline
   reload, sync back, delete + Undo)
3. Packing list + master material list — built 2026-11-26: #/materials (top nav "Material list"): grouped by
   box / category in packing order (categoryOrder: smallest position per category; seed positions spaced by 100,
   nextPosition = last of the category + 1), empty -> "Load QED's standard list" (js/seed.js: 47 items from the
   2025 to-bring list, typos fixed, laptop labels = note), edit / remove (archived, Undo). Event tab "Packing list"
   (views/packing.js): empty -> add the whole material list / pick / type an item; meters Packed n/N + Back at the
   office n/N; filters All · To pack · Not back yet; per item two 44 px ticks Packed (packed_at) + Back
   (returned_at); tap the name = edit / delete (Undo); "+ Item" can also add to the material list (ticked by
   default). Event items are copies (material changes don't touch existing lists). main.js resets
   viewEl.onclick on every screen change (a screen's handler leaked into the next one: double pop-ups)
4. Run of show + Now / Next — built 2026-11-26 (views/ros.js, rules in rules.js): #/event/<id>/ros/<day id>, day
   tabs (opens today's day, else the next one). Live (the day itself, Brussels time, or "Preview live" at a chosen
   time): NOW card (programme on stage: start <= now < programmeEnd = its end, else next programme start in the same
   room; "To do now" = unticked tasks started, late in red) + NEXT card (next 4 lines, "in 35 min", tick on tasks),
   red "now" line in the timeline, refresh every 30 s (not while typing / pop-up), Wake Lock while live. Timeline:
   sortLines (time, programme first, position), programme shaded / no tick, late tasks red (end passed, or start
   passed if no end). Filters: kind, owner, room. Tap a line = edit (kind, title, start, end, day, owner, room,
   notes) / delete (Undo). Quick add (Task / Programme, Enter adds, focus stays, same time kept). "Paste lines"
   (parsePastedLines: "09:00 - 09:20 Title", "9.30 Title", Excel tabs start/end/title/owner/room/notes; a line
   without a time goes into the notes of the line above). "Live view" (body.is-live) hides the top bar, event
   header, tabs, quick add. Tested in Chromium with the fake database
   4b. Paste lines: Owner choice (Romain's request, 2026-11-26): applies to lines without an owner column;
   defaults to Romain for tasks, nobody for programme (follows the kind), "— nobody" possible
   4d. Paste lines also reads four-digit times "0800" / "0800 - 0920" (Romain, 2026-11-26), Excel columns too;
   exactly four digits only ("100 chairs" stays text)
   4c. Import from link (Romain, 2026-11-26; option "AI reads the page" chosen over plain text parsing):
   api/programme.js (Vercel Node function, @anthropic-ai/sdk 1.14.0 in onsite/package.json, maxDuration 120 in
   vercel.json, needs ANTHROPIC_API_KEY in Vercel env). Checks the caller's QED Supabase token (/auth/v1/user), SSRF
   guard (https, port 443, no credentials, DNS -> no private / local IPs, every redirect re-checked), 15 s / 4 MB,
   HTML -> visible text + Next.js flight strings + JSON scripts; PDF -> document block. Claude: claude-opus-5-5,
   effort medium, structured output (json_schema: event_name, sessions[date, day_label, start, end, title, room,
   format, notes], warnings), fallbacks "default" (beta server-side-fallback-2026-07-01), refusal / max_tokens
   handled. Prompt: only what the page says, no speaker names (GDPR), leave out off-site side events. App:
   views/importProgramme.js: link -> review (groups per programme day -> event day by date else in order; tick
   boxes; duplicates = same day + time + title unticked; "no room" -> chosen main room; new rooms join the event);
   adds programme lines, Undo. sw.js skips /api/. Quick add keeps typed values when switching Task / Programme.
   Tested: URL guard + page reading on the real blockchain4eu page (Day 2 + breakouts found); review flow with a
   stand-in server. Real Claude call tested by Romain on the preview, then pushed to main 2026-11-26.
   Fix 2026-11-26 (Romain: only Day 1 + Day 2 breakouts imported): readableStrings dropped time strings
   ("09:00 - 09:30" looked like a CSS class list) and one-word titles ("Break"), and de-duplicated repeated
   strings, so Day 2 (only in the page code) had titles without times -> skipped. Now: anything with a time is
   kept, capitalised single words kept, only immediate repeats dropped (19/19 Day 2 times found)
   4e. Speakers + programme ticks (Romain, 2026-11-26; migration 20261126000002, add-only: speakers 0-50 +
   moderators 0-10 columns, drops onsite_ros_items_programme_not_ticked; tested on a local Postgres; RUN in the
   QED project by Romain 2026-11-26, tested on the preview, pushed to main). stageLabel (rules.js): "3 + 1 mod · 4 on stage" /
   "2 speakers" / "1 mod", pill on the timeline, Now / Next cards; edit form fields. stageState (rules.js): per room
   (no room = the room most sessions use), the first unticked started programme line is on stage (overBy = minutes
   past programmeEnd -> red "Running late · n min over"), started ones behind it are "waiting" at the top of Next;
   tick on programme lines too (timeline, Now card, Next card; blue tick, toast "Finished"); "On stage" pill.
   Import: schema + prompt count speakers / moderators (numbers only, never names); review shows them; sessions
   already in the run of show get their counts filled in when they have none (works with nothing else ticked).
   Tested in Chromium (stand-in server): counts, late keynote stays on stage, panel waiting, tick moves it on
LIVE 2026-11-26: merged to main (fast-forward), onsite.ownhq.app serves it. ownhq.app portal card (hq-home/index.html,
   data-hq="onsite", icon hq-home/onsite-hq.svg); hq_access row 'onsite' added in own-hq by Romain 2026-11-26
   HQ switcher (Romain, 2026-11-26): hq-home/switcher.js lists Onsite HQ (id "onsite", symbol = onsite-hq.svg, after
   QED HQ; shown when hq_access has 'onsite'); Onsite HQ's top bar uses <hq-switcher current="onsite"> (loaded from
   HQ_BASE in main.js; offline the plain "Onsite HQ" link stays); "Test version" label moved to .top-row::after
5. After the event: templates, link to QED HQ projects

## Test address
- Local: `python3 serve.py` in onsite/ -> http://localhost:8002 (login at /_hq/).
- Preview: Vercel project "onsite" (created 2026-11-26; Root Directory typed in Settings because the import
  picker only lists folders on main), onsite-preview.ownhq.app assigned to the working branch, Vercel
  Authentication off. js/hqBase.js then loads the login file from hq-preview.ownhq.app. A branch only gets a
  deployment when a push touches onsite/ (ignoreCommand), so a new project needs one such push first.
