# hq
## QED Webinars landing page

`webinar-landing/` — static, responsive landing page for QED's webinar organisation services.

- `index.html` — landing page (formats, services, process, pick-and-choose builder, FAQ, contact)
- `brand-guidelines.html` — interactive brand book (logo, colour, type, components, voice, accessibility, tokens)
- `assets/styles.css` — design tokens & components shared by both pages
- `assets/script.js` — interactions (no dependencies)

Open `webinar-landing/index.html` in a browser, or serve the folder with any static host (e.g. GitHub Pages).

## Race Pace & Fuelling Calculator

`race-calculator/` — personal tool to plan pace, splits, fuelling and aid-station drop bags for road and trail races. Vanilla HTML/CSS/JS, no build step: open `race-calculator/index.html` in a browser. See `race-calculator/CLAUDE.md` for the rules and decisions behind the calculations.

## SportHQ3 — personal training hub

`sporthq3/` — training planner, activity log, races, shoes, body & goals. Vanilla HTML/CSS/JS + Supabase.
See `sporthq3/CLAUDE.md` for the brief, rules and decisions. Database schema lives in `sporthq3/supabase/migrations/`.
