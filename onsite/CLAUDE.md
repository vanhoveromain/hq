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
- Run-of-show line: start time (+ optional end), title, owner, room, notes. Two kinds: `programme` (on
  stage, never ticked) and `task` (ticked, `done_at`).
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
5. After the event: templates, link to QED HQ projects, HQ switcher entry

## Test address
- Local: `python3 serve.py` in onsite/ -> http://localhost:8002 (login at /_hq/).
- Preview: Vercel project "onsite" (created 2026-11-26; Root Directory typed in Settings because the import
  picker only lists folders on main), onsite-preview.ownhq.app assigned to the working branch, Vercel
  Authentication off. js/hqBase.js then loads the login file from hq-preview.ownhq.app. A branch only gets a
  deployment when a push touches onsite/ (ignoreCommand), so a new project needs one such push first.
