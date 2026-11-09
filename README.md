# hq

## Domains & Vercel

One Vercel project per app, all from this repo (Settings → Build and Deployment → Root Directory):

| Domain | Vercel project root | What |
|---|---|---|
| `ownhq.app` (+ `www` redirects to it) | `hq-home/` | HQ portal + the shared HQ login (cards to QED HQ and Sport HQ) + the shared HQ switcher (`switcher.js`) |
| `sport.ownhq.app` | `sporthq3/` | SportHQ3 |
| `qed.ownhq.app` | `qed/` | QED HQ: tools hub (behind the HQ login) + onboarding plan (`qed/onboarding/<code>/`: public, no login, hard-to-guess address) |

## Shared hq login

One login for every hq site, on `ownhq.app` (`hq-home/auth.js`).

- The Supabase session is stored in cookies for the whole `ownhq.app` domain, so every `*.ownhq.app` site sees the same login. Log out anywhere = logged out everywhere.
- Other hq sites import `https://ownhq.app/auth.js` and call `requireLogin()`: no login sends you to `ownhq.app/?next=<where you were>` and back after logging in. `next` only accepts `https://*.ownhq.app`.
- Static hq pages (QED HQ) add two lines to `<head>` to sit behind the login (`hq-home/gate.js`):
  `<style id="hq-gate">html{visibility:hidden}</style>` + `<script type="module" src="https://ownhq.app/gate.js"></script>`.
  This hides the page, it does not protect the file: anyone fetching the file directly can still read it.
- Supabase → Authentication → URL Configuration must allow `https://ownhq.app/**` as a redirect URL (magic link).
- Local testing: SportHQ3's `serve.py` shows `hq-home/` at `localhost:8000/_hq/` (local login page).

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

## Brand

HQ Brand Guidelines v1.0 live in `brand/guidelines-v1.0/`; tokens, fonts and logos in `brand/`. See `brand/README.md`.
Every HQ app (hq-home, QED HQ, Sport HQ) uses the shared tokens (`hq-tokens.css`), Geist, and the HQ switcher
(`<hq-switcher current="…">` from `https://ownhq.app/switcher.js`) in its top bar.
