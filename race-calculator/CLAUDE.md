# Race Pace & Fuelling Calculator

## Context
Personal tool for planning road and trail races (10k to 50k+).
I'm learning web development, so this project is also a learning exercise.

## Stack & constraints
- Vanilla HTML, CSS, JavaScript only. No frameworks, no build tools, no npm packages.
- Three files: index.html, style.css, app.js.
- No backend. Runs by opening index.html in a browser.
- Must work on mobile (I'll use it on my phone).

## How to work with me
- Before writing code, give me a short plan and wait for my approval.
- Work in small steps: one feature per change.
- After each change, explain what you did and why in 3–5 bullet points, including any JS concept I might not know.
- Keep code readable over clever. Comment non-obvious logic.
- After each completed step: commit and push to the working branch (agreed 2026-10-09; repo `hq` is personal).
- If a calculation rule is a judgment call, make it a configurable input, not a hardcoded value.

## Decisions so far (v1)
- Scope: calculations and outputs only. No saving, no charts, no export.
- Flat-equivalent distance = distance + (D+ / 100) × adjustment factor (default 1).
- Splits assume even pace (no course profile yet). Split interval is an input (default 5 km).
- Fuelling:
  - One stop every X min (input). Carbs per stop = carbs per hour × interval / 60.
  - Fuel mix: Compote, Gel, Energy bar, Candy. Each has a % and carbs per item (g).
  - The % applies to the **number of stops**, and the percentages must add up to 100.
  - Each stop gets one item type. Quantity = whole items closest to the carbs-per-stop target.
  - Item types are spread evenly over the race, not grouped.
  - Races longer than the threshold (input, default 3h): solids (energy bar, candy) only
    after "solids allowed from" (input). Warn if the requested % can't be reached.
  - No fuel in the last X min (input).
  - Electrolyte tablets: separate reminders at their own interval, not part of the mix.
  - Item for each stop: "credit" method (each item earns its % per stop, the eligible item
    with most credit gets the stop and pays 100 back). Solids catch up after they're allowed.
  - Show carbs/h at your rhythm (compare to target) and over the whole race, plus a packing list
    with asked vs actual % per item.
  - Bad fuel inputs only hide the fuel plan; pace and splits still show.
- Aid stations (step 5): text field of km, comma-separated. Shown in splits and fuel timeline;
  packing list split by section (start → AS1 → … → finish) for drop bags / crew.

## Build order
1. Skeleton: HTML form with all inputs, basic CSS, no logic.
2. Time helpers + pace outputs.
3. Split table (with clock times).
4. Fuelling plan + packing list.
5. Aid stations.
6. Styling pass + mobile check (incl. auto-scroll to results, tidy fuel table on phones).
