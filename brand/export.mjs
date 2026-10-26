// Builds every logo file in brand/ and the SportHQ3 app icons from one source.
// Run from the repo root:  node brand/export.mjs
// PNGs are rendered with Playwright (Chromium); SVGs are plain files, no fonts needed.

import { writeFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { execSync } from "node:child_process";

const require = createRequire(import.meta.url);
let playwright;
try { playwright = require("playwright"); }
catch { playwright = require(execSync("npm root -g").toString().trim() + "/playwright"); }

const C = {
  black: "#111111",
  white: "#ffffff",
  purple: "#3d0079",       // SportHQ deep purple (same as --accent in sporthq3/css/style.css)
  purpleLight: "#c4a5ff",  // infield on the purple tile (same as --accent in dark mode)
  purpleTint: "#ece4f7",   // infield on a light page
};

// ---------- Letters (stroke drawing, 104 units tall) ----------

// hq: 141 x 104
const HQ_W = 141;
const hqLetters = (ink) => `
  <path d="M17 8 V80 M17 56 a21 21 0 0 1 42 0 V80" fill="none" stroke="${ink}" stroke-width="13"/>
  <circle cx="102.5" cy="57.5" r="22.5" fill="none" stroke="${ink}" stroke-width="13"/>
  <path d="M125 28.5 V104" stroke="${ink}" stroke-width="13"/>`;

// shq: 188 x 104. The q is a stadium: track with one lane line, football pitch in the infield.
const SHQ_W = 188;
const TRACK = "M139 35 H159 A22.5 22.5 0 0 1 159 80 H139 A22.5 22.5 0 0 1 139 35 Z";
const STEM = "M181.5 28.5 V104";
const shqLetters = ({ ink, infield, pitch, id }) => `
  <defs>
    <!-- The lane line is cut out of the track, so it shows whatever is behind the logo -->
    <mask id="${id}" maskUnits="userSpaceOnUse" x="0" y="0" width="${SHQ_W}" height="104">
      <rect width="${SHQ_W}" height="104" fill="#fff"/>
      <path d="${TRACK}" fill="none" stroke="#000" stroke-width="2.4"/>
      <path d="${STEM}" stroke="#fff" stroke-width="13"/>
    </mask>
  </defs>
  <path d="M139 41.5 H159 A16 16 0 0 1 159 73.5 H139 A16 16 0 0 1 139 41.5 Z" fill="${infield}"/>
  <g fill="none" stroke="${pitch}" stroke-width="1.5">
    <rect x="130" y="46" width="38" height="23"/>
    <path d="M149 46 V69"/>
    <circle cx="149" cy="57.5" r="4.5"/>
    <rect x="130" y="51.5" width="6" height="12"/>
    <rect x="162" y="51.5" width="6" height="12"/>
  </g>
  <g mask="url(#${id})">
    <path d="M31 42.55 A14 9.5 0 1 0 19.5 57.5 A14 9.5 0 1 1 8 72.45" fill="none" stroke="${ink}" stroke-width="11"/>
    <path d="M53.5 8 V80 M53.5 56 a21 21 0 0 1 42 0 V80" fill="none" stroke="${ink}" stroke-width="13"/>
    <path d="${TRACK}" fill="none" stroke="${ink}" stroke-width="13"/>
    <path d="${STEM}" stroke="${ink}" stroke-width="13"/>
  </g>`;

// ---------- Files ----------

const svg = (w, h, body) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}">${body}\n</svg>\n`;

// Logo on its own (transparent background)
const hqMark = (ink) => svg(HQ_W, 104, hqLetters(ink));
const shqMark = (ink, infield, pitch) => svg(SHQ_W, 104, shqLetters({ ink, infield, pitch, id: "lane" }));

// App icon on a 100 x 100 tile. rounded = true for SVGs; PNG app icons are square (iOS/Android round them).
const hqIcon = (rounded) => svg(100, 100, `
  <rect width="100" height="100" ${rounded ? 'rx="22"' : ""} fill="${C.white}"/>
  <svg x="14" y="20" width="72" height="${(72 * 104 / HQ_W).toFixed(2)}" viewBox="0 0 ${HQ_W} 104">${hqLetters(C.black)}</svg>`);

const SHQ_H = 88 * 104 / SHQ_W;
const shqIcon = (rounded) => svg(100, 100, `
  <rect width="100" height="100" ${rounded ? 'rx="22"' : ""} fill="${C.purple}"/>
  <svg x="6" y="${(50 - 44 * SHQ_H / 104).toFixed(2)}" width="88" height="${SHQ_H.toFixed(2)}" viewBox="0 0 ${SHQ_W} 104">${shqLetters({ ink: C.white, infield: C.purpleLight, pitch: C.white, id: "lane-icon" })}</svg>`);

// Favicons: the stadium alone. 32 px keeps the centre circle, 16 px only the halfway line.
const favicon32 = svg(100, 100, `
  <rect width="100" height="100" rx="22" fill="${C.purple}"/>
  <path d="M40 34.5 H60 A15.5 15.5 0 0 1 60 65.5 H40 A15.5 15.5 0 0 1 40 34.5 Z" fill="${C.purpleLight}"/>
  <path d="M40 28 H60 A22 22 0 0 1 60 72 H40 A22 22 0 0 1 40 28 Z" fill="none" stroke="${C.white}" stroke-width="13"/>
  <path d="M50 34.5 V65.5" stroke="${C.white}" stroke-width="4"/>
  <circle cx="50" cy="50" r="6" fill="none" stroke="${C.white}" stroke-width="3.5"/>`);
const favicon16 = svg(100, 100, `
  <rect width="100" height="100" rx="22" fill="${C.purple}"/>
  <path d="M41 36 H59 A14 14 0 0 1 59 64 H41 A14 14 0 0 1 41 36 Z" fill="${C.purpleLight}"/>
  <path d="M41 28 H59 A22 22 0 0 1 59 72 H41 A22 22 0 0 1 41 28 Z" fill="none" stroke="${C.white}" stroke-width="16"/>
  <path d="M50 36 V64" stroke="${C.white}" stroke-width="7"/>`);

const SVGS = {
  "brand/hq/hq-mark.svg": hqMark(C.black),
  "brand/hq/hq-mark-white.svg": hqMark(C.white),
  "brand/hq/hq-icon.svg": hqIcon(true),
  "brand/sporthq/sporthq-mark.svg": shqMark(C.purple, C.purpleTint, C.purple),
  "brand/sporthq/sporthq-mark-white.svg": shqMark(C.white, "rgba(255,255,255,0.2)", C.white),
  "brand/sporthq/sporthq-icon.svg": shqIcon(true),
  "brand/sporthq/sporthq-favicon.svg": favicon32,
  "brand/sporthq/sporthq-favicon-16.svg": favicon16,
  "sporthq3/icons/icon.svg": favicon32,
  // App header: the top bar is deep purple, so white letters (same as sporthq-mark-white.svg)
  "sporthq3/icons/logo.svg": shqMark(C.white, "rgba(255,255,255,0.2)", C.white),
};

// [output path, svg source, size in px]
const PNGS = [
  ["brand/hq/hq-icon-512.png", hqIcon(false), 512],
  ["brand/hq/hq-icon-180.png", hqIcon(false), 180],
  ["brand/sporthq/sporthq-icon-1024.png", shqIcon(false), 1024],
  ["brand/sporthq/sporthq-favicon-32.png", favicon32, 32],
  ["brand/sporthq/sporthq-favicon-16.png", favicon16, 16],
  ["sporthq3/icons/icon-512.png", shqIcon(false), 512],
  ["sporthq3/icons/icon-192.png", shqIcon(false), 192],
  ["sporthq3/icons/apple-touch-icon.png", shqIcon(false), 180],
];

mkdirSync("brand/hq", { recursive: true });
mkdirSync("brand/sporthq", { recursive: true });
for (const [path, content] of Object.entries(SVGS)) writeFileSync(path, content);

const browser = await playwright.chromium.launch();
const page = await browser.newPage();
for (const [path, source, size] of PNGS) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}body>svg{display:block;width:${size}px;height:${size}px}</style>${source}`);
  await page.locator("svg").first().screenshot({ path, omitBackground: true });
}
await browser.close();
console.log(`Wrote ${Object.keys(SVGS).length} SVGs and ${PNGS.length} PNGs.`);
