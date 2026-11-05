# Brand: HQ

Source of truth: **HQ Brand Guidelines v1.0** in `guidelines-v1.0/` (designer handoff kit, saved 2026-11-05).
Start with `guidelines-v1.0/README_START_HERE.md`, then `01_Brand_Book/HQ_Brand_Guidelines_FULL.md` (or the PDF).
It replaces the old hq / sporthq logos and the SportHQ brand book (removed; still in git history).

## In short

- **HQ** (parent): charcoal `#242424` monogram on white. Name is "HQ"; `ownhq.app` is the address, not the brand.
- **Products** are named `[Name] HQ` (with a space) and each has a white symbol on a muted square:

| HQ | Accent | Light | Dark | URL |
|---|---|---|---|---|
| Sport HQ | `#75638F` | `#F1EDF5` | `#594771` | sport.ownhq.app |
| QED HQ | `#547B91` | `#EBF2F5` | `#3B6075` | qed.ownhq.app |
| Work HQ (planned) | `#486B94` | `#EBF0F6` | `#345173` | — |
| Personal HQ (planned) | `#9F597A` | `#F7EDF1` | `#793E5D` | — |

- Neutrals: canvas `#FAFAF9`, surface `#FFFFFF`, subtle `#F2F2F0`, border `#E5E5E3`, text `#242424` / `#666666`.
- Type: Geist Sans (Geist Mono only for fixed-width / identifiers). Radius 8px (6px small). 4px spacing scale.
- Shared top bar with the product identity + HQ switcher (`hq-home/switcher.js`).

## Files

| File | Use |
|---|---|
| `hq-tokens.css` | The shared design tokens (`--hq-*`) + Geist @font-face. Copied into each app: `hq-home/hq-tokens.css`, `qed/assets/hq-tokens.css`, `sporthq3/css/hq-tokens.css`. Edit here, then copy. |
| `fonts/` | Geist Sans + Geist Mono variable woff2 (SIL OFL, `fonts/OFL.txt`, from the official `geist` npm package 1.9.1). Copied next to each app's tokens file. |
| `logos/hq-mark.svg`, `hq-mark-white.svg` | Parent HQ mark for light / dark backgrounds |
| `logos/hq-icon.svg`, `hq-icon-*.png` | Parent app icon (white tile, 0.25× clear space) |
| `logos/{sport,qed,work,personal}-hq.svg` | Product symbols, unchanged from the kit |
| `logos/*-icon-*.png`, `*-square.svg` | App icons / favicons (square: iOS and Android round the corners) |

## Parent mark: provisional

The approved parent logo is the small reference image `guidelines-v1.0/06_References/HQ_Approved_User_Reference_95x97.png`.
The kit's own SVG is an automatic, stair-stepped trace. `export.mjs` holds a clean geometric redraw (arcs + straight
shapes) lined up on the reference, used in the apps. It is still **provisional**: not the designer-approved vector
master (guidelines §03 / §12). Replace the paths in `export.mjs` once the master is signed off.

## Changing a logo

All logo files come from `export.mjs`, which also copies what each app needs. From the repo root:

```
node brand/export.mjs
```

It needs Playwright (Chromium) for the PNGs.

## Open points from the kit (§12 release QA)

Vector master for the parent mark; 16px checks of the product symbols (QED's hub is the most complex); dark-mode
contrast is provisional; trademark / originality checks before any public launch.
