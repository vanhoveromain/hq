# SportHQ3

Personal training hub: weekly planner, activity log, races, shoes, body & goals.
Vanilla HTML/CSS/JS + Supabase. Brief, rules and decisions: see `CLAUDE.md`.

**Live:** https://vanhoveromain.github.io/hq/sporthq3/ (published from `main` by GitHub Pages).
On iPhone: open it in Safari → Share → Add to Home Screen, then log in with your **password**
(set it once under Me → Password after a first login by email link).

## Run it on your Mac

The app must be opened through a small local web server (not by double-clicking
`index.html`): ES modules and the magic-link login only work over `http://`.

1. Get the code (first time only): in **GitHub Desktop**, clone `vanhoveromain/hq`,
   then switch to the branch you're working on.
2. Open **Terminal** and go into the project folder, e.g.:
   ```
   cd ~/Documents/GitHub/hq/sporthq3
   ```
3. Start the server:
   ```
   python3 -m http.server 8000
   ```
   (The first time, macOS may offer to install "command line developer tools": accept.)
4. Open **http://localhost:8000** in your browser.
5. Stop the server with **Ctrl + C** in Terminal.

## Files

| Path | What it does |
|---|---|
| `index.html` | The single page: top bar, main area, bottom tab bar |
| `css/style.css` | All styles (mobile-first, light + dark mode) |
| `js/config.js` | Supabase URL + publishable key (public by design) |
| `js/storage.js` | The only file that talks to Supabase |
| `js/main.js` | Starts the app, login check, switches screens (hash router) |
| `js/rules.js` | The rulebook: sports, session types, categories (later: training rules) |
| `js/utils/*.js` | Helpers: dates, formatting, planned-session helpers (`plan.js`), pop-up sheet, toast |
| `js/views/*.js` | One file per screen (`shoes.js` opens from Me, `catalogue.js` and `weekTemplates.js` from Plan) |
| `manifest.webmanifest`, `icons/` | Name and icon for "Add to Home Screen" |
| `supabase/migrations/` | SQL that builds the database; paste into Supabase's SQL Editor |
