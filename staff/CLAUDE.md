# Staff HQ — QED staff schedule

## Context
- Owner: Romain (QED). Who works on which event, which day. Built as a Claude artifact, moved to
  staff.ownhq.app on 2026-11-27 ("look and behave exactly like the current version").
- Staff names + client event names: confidential. Never commit real data (`qed/tools/staff-import/data/` is gitignored).

## Decisions (Romain, 2026-11-27)
- Separate app: staff.ownhq.app (Vercel project root `staff/`), data in QED HQ's Supabase project (EU),
  migration `qed/supabase/migrations/20261127000001_staff_hq.sql` (RUN 2026-11-27).
- Romain edits, logged in (hq login + QED session) and listed in `staff_editors` (writes enforced by RLS).
- The team views WITHOUT a login via a secret link `staff.ownhq.app/#k=<key>`; the key opens the schedule
  only (`staff_read(key)`), nothing else in the app. Leaked link = change the key (see qed/supabase/README.md).
  The key is in the "#" part, so it is never sent to the server or in a referrer. Not in the HQ switcher.
- Page kept as is (QED brand, Poppins), not the HQ tokens.

## Files
- `index.html`: the artifact page, unchanged except: `<title>Staff HQ</title>`, `noindex` + `no-referrer`
  metas, and `<script src="js/bridge.js">` before the page script.
- `js/bridge.js`: plain script, defines `window.claude.use('db' | 'user')` (the artifact runtime the page
  was built for) and loads `js/data.js` on first use.
- `js/data.js`: the data layer. Editor (logged in + `staff_is_editor()`) reads / writes `staff_docs`;
  otherwise the key (from "#k=", remembered in localStorage `staff.key`) -> `staff_read`. No key, not an
  editor: hq login (redirect), then a message (unlock QED HQ, or "use the team link").
- `js/hqBase.js`: auth.js from ownhq.app (live), hq-preview.ownhq.app (staff-preview), /_hq/ (serve.py).
- `vercel.json`: build only when staff/ changed; noindex, no-referrer, no framing headers. `robots.txt`: disallow all.

## Interface the page expects (from the artifact)
- `use('user')` -> `{ isOwner() }` (true = editor: Edit tab, Add event, Undo, Settings).
- `use('db')`: `db.doc("collection/id")` -> `{ id, set(data), delete(), onSnapshot(next, error) }`;
  `db.collection(name)` -> `{ doc() (new id), onSnapshot(next, error) }`. Collections: config, events, notes.
- Snapshots: no realtime; fired when loaded, after every change made here, and every 20 s while visible.
  `metadata.fromCache` is always false. Errors: `invalid_argument` (view only), `unavailable` (page retries
  once), `revoked` (key wrong or changed).
- Data model: `config/main` {team, suppliers, roles}, `events/<id>` {name, line, notes, manager, days[]},
  `notes/<YYYY-MM-DD>` {date, text}.

## Test address
- Local: `python3 serve.py` in staff/ -> http://localhost:8003 (login at /_hq/).
- Preview: Vercel project "staff", staff-preview.ownhq.app on the working branch (loads the login from hq-preview).

## Build steps
1. Database (migration 20261127000001) — RUN 2026-11-27, Romain only editor
2. Import of the artifact export (`qed/tools/staff-import/`) — RUN 2026-11-27 (config 1, events 16, notes 1)
3. App — built 2026-11-27, tested in Chromium with a stand-in database (team key, wrong key, no key,
   locked QED session, other account, editor edit + Undo + reload, phone, dark)
