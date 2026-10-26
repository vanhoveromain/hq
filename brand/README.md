# Brand: hq & sporthq

`hq` is the umbrella for the personal tools in this repo. `sporthq` is the first product under it.

**SportHQ brand book:** `sporthq-guidelines.html` (logo, colour incl. dark mode and sport colours, number font, components, icons, voice, accessibility, tokens). Open it from the repo root or on GitHub Pages so the logo files load.

- **hq**: black letters, white tile.
- **sporthq**: lowercase s + hq. The q is a stadium (running track with one lane line, football pitch in the infield). White letters on a deep purple tile.
- Letters are drawn shapes, not a font: they look the same everywhere.

## Colours

| Use | Hex |
|---|---|
| hq letters | `#111111` |
| hq tile | `#ffffff` |
| sporthq deep purple (tile, letters on light) | `#3d0079` (same as `--accent` in `sporthq3/css/style.css`) |
| Infield on the purple tile, logo on dark | `#c4a5ff` (same as `--accent` in dark mode) |
| Infield on a light page | `#ece4f7` |
| SportHQ3 page background | `#e9edf2` |

## Files

| File | Use |
|---|---|
| `hq/hq-mark.svg`, `hq/hq-mark-white.svg` | Logo on its own, for light / dark backgrounds |
| `hq/hq-icon.svg`, `hq/hq-icon-512.png`, `hq/hq-icon-180.png` | App icon |
| `sporthq/sporthq-mark.svg`, `sporthq/sporthq-mark-white.svg` | Logo on its own, for light / dark backgrounds (the lane line is see-through) |
| `sporthq/sporthq-icon.svg`, `sporthq/sporthq-icon-1024.png` | App icon |
| `sporthq/sporthq-favicon.svg`, `-32.png`, `-16.png`, `-16.svg` | Browser tab: the stadium alone |

SportHQ3 uses copies in `sporthq3/icons/` (`icon.svg` = favicon, `icon-192/512.png` + `apple-touch-icon.png` = app icon, `logo.svg` = header logo in light purple for the charcoal top bar).

PNG app icons are square on purpose: iOS and Android round the corners themselves.

## Changing the logo

All files come from `export.mjs`. Edit it, then run from the repo root:

```
node brand/export.mjs
```

It needs Playwright (Chromium) for the PNGs.
