# Brand: hq & sporthq

`hq` is the umbrella for the personal tools in this repo. `sporthq` is the first product under it.

- **hq**: black letters, white tile.
- **sporthq**: lowercase s + hq. The q is a stadium (running track with one lane line, football pitch in the infield). White letters on a violet tile.
- Letters are drawn shapes, not a font: they look the same everywhere.

## Colours

| Use | Hex |
|---|---|
| hq letters | `#111111` |
| hq tile | `#ffffff` |
| sporthq violet (tile, letters on light) | `#6d28d9` (same as `--accent` in `sporthq3/css/style.css`) |
| Infield on the violet tile | `#a78bfa` |
| Infield on a light page | `#ede9fe` |

## Files

| File | Use |
|---|---|
| `hq/hq-mark.svg`, `hq/hq-mark-white.svg` | Logo on its own, for light / dark backgrounds |
| `hq/hq-icon.svg`, `hq/hq-icon-512.png`, `hq/hq-icon-180.png` | App icon |
| `sporthq/sporthq-mark.svg`, `sporthq/sporthq-mark-white.svg` | Logo on its own, for light / dark backgrounds (the lane line is see-through) |
| `sporthq/sporthq-icon.svg`, `sporthq/sporthq-icon-1024.png` | App icon |
| `sporthq/sporthq-favicon.svg`, `-32.png`, `-16.png`, `-16.svg` | Browser tab: the stadium alone |

SportHQ3 uses copies in `sporthq3/icons/` (`icon.svg` = favicon, `icon-192/512.png` + `apple-touch-icon.png` = app icon, `logo.svg` = header logo in light violet for the charcoal top bar).

PNG app icons are square on purpose: iOS and Android round the corners themselves.

## Changing the logo

All files come from `export.mjs`. Edit it, then run from the repo root:

```
node brand/export.mjs
```

It needs Playwright (Chromium) for the PNGs.
