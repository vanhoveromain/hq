// export.mjs: builds every HQ logo file from the drawings below.
//
//   node brand/export.mjs      (from the repo root; needs Playwright for the PNGs)
//
// Source of truth: brand/guidelines-v1.0/ (HQ Brand Guidelines v1.0).
// - Parent HQ mark: a clean geometric redraw of the APPROVED reference image
//   (guidelines-v1.0/06_References/HQ_Approved_User_Reference_95x97.png).
//   It is still PROVISIONAL artwork (guidelines §03): a working vector for the
//   apps, not the signed-off trademark master. Charcoal #242424 on white.
// - Product symbols: copied unchanged from guidelines-v1.0/02_Logos/Products/.
//   Only the app-icon PNGs are made square (iOS / Android round the corners).
// Then copies what each app needs into hq-home/, qed/ and sporthq3/.

import { writeFileSync, readFileSync, copyFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, "..");
const out = (p) => join(here, "logos", p);

// The HQ monogram (95 x 97 reference grid, shifted to line up with the reference).
const HQ_PATHS = [
  "M59 12.42A40 40 0 0 0 20 81.5L20 70.67A32 32 0 0 1 59 21.23Z",      // ring, top → left → bottom-left
  "M68 17.5A40 40 0 0 1 78.95 68.95L73.01 63.01A32 32 0 0 0 68 28.33Z", // ring, right
  "M29 86.58A40 40 0 0 0 73.5 76.5L67.84 70.84A32 32 0 0 1 29 77.77Z",  // ring, bottom
  "M67.84 70.84L86.5 89.5L75.5 89.5L62.34 76.34Z",                       // Q tail
  "M29 32L37 28L37 85L29 85Z",                                           // H left stem
  "M51 15L59 15L59 67L51 71Z",                                           // H right stem
  "M36.5 46H51.5V53H36.5Z",                                              // H crossbar
];
const SHIFT = "translate(.6 .7)";
const BOX = { x: 4.6, y: 10.2, w: 82.5, h: 80 }; // the drawing's edges

const markGroup = (fill) => `<g fill="${fill}" transform="${SHIFT}">${HQ_PATHS.map((d) => `<path d="${d}"/>`).join("")}</g>`;

const mark = (fill) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${BOX.x} ${BOX.y} ${BOX.w} ${BOX.h}" width="${BOX.w * 4}" height="${BOX.h * 4}"><title>HQ</title>${markGroup(fill)}</svg>\n`;

// App icon: white square, mark centred. Clear space ≥ 0.25 × the mark's width
// on each side (guidelines §03) → the mark is 1 / 1.5 of the tile.
function icon({ rounded = false } = {}) {
  const side = BOX.w * 1.5;
  const x = BOX.x - BOX.w * 0.25;
  const y = BOX.y + BOX.h / 2 - side / 2;
  const rx = rounded ? side * 0.08 : 0;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${side} ${side}" width="512" height="512"><title>HQ</title><rect x="${x}" y="${y}" width="${side}" height="${side}" rx="${rx}" fill="#FFFFFF"/>${markGroup("#242424")}</svg>\n`;
}

// Product symbols, square tile for app icons (the drawing is unchanged).
const squareProduct = (name) => readFileSync(out(`${name}.svg`), "utf8").replace(/rx="8"/, 'rx="0"');

writeFileSync(out("hq-mark.svg"), mark("#242424"));
writeFileSync(out("hq-mark-white.svg"), mark("#FFFFFF"));
writeFileSync(out("hq-icon.svg"), icon({ rounded: true }));
writeFileSync(out("hq-icon-square.svg"), icon());
for (const name of ["sport-hq", "qed-hq", "work-hq", "personal-hq"]) {
  writeFileSync(out(`${name}-square.svg`), squareProduct(name));
}

// PNGs
// Playwright: the project's own, else the one installed globally.
const { createRequire } = await import("node:module");
const { execSync } = await import("node:child_process");
let chromium;
try { ({ chromium } = await import("playwright")); }
catch { ({ chromium } = createRequire(join(execSync("npm root -g").toString().trim(), "_"))("playwright")); }
const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 1 });
async function png(svgFile, size, file) {
  const svg = readFileSync(out(svgFile), "utf8").replace(/width="[\d.]+" height="[\d.]+"/, `width="${size}" height="${size}"`);
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block}</style>${svg}`);
  await page.screenshot({ path: out(file), omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
}
for (const s of [32, 180, 192, 512]) await png("hq-icon-square.svg", s, `hq-icon-${s}.png`);
for (const name of ["sport-hq", "qed-hq"]) {
  for (const s of [32, 180, 192, 512]) await png(`${name}-square.svg`, s, `${name}-icon-${s}.png`);
}
await browser.close();

// Copies into the apps (each Vercel project only serves its own folder).
const copies = {
  "hq-home": ["hq-mark.svg", "hq-mark-white.svg", "hq-icon.svg", "hq-icon-180.png", "sport-hq.svg", "qed-hq.svg"],
  "qed/assets": ["qed-hq.svg", "qed-hq-icon-180.png", "qed-hq-icon-32.png"],
  "sporthq3/icons": ["sport-hq.svg", "sport-hq-icon-180.png", "sport-hq-icon-192.png", "sport-hq-icon-512.png"],
};
for (const [dir, files] of Object.entries(copies)) {
  mkdirSync(join(root, dir), { recursive: true });
  for (const f of files) copyFileSync(out(f), join(root, dir, f));
}
console.log("Logos written to brand/logos/ and copied into the apps.");
