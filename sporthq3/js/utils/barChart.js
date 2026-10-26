// barChart.js — a simple bar chart drawn as SVG (no library).
//
//   drawBarChart(element, {
//     bars: [{ label: "Oct", value: 64.2, tip: "October 2026 · 64.2 km" }],
//     unit: "km",
//     reference: { value: 80, label: "Min 80 km" },   // optional dashed line
//   })
//
// One colour (the accent), a thin grid, a few labels; tap / hover a bar to
// read its exact value.

import { escapeHtml } from "./format.js?v=202610260916";

const HEIGHT = 200;
const PAD = { top: 14, right: 8, bottom: 24, left: 36 };

export function drawBarChart(el, { bars, unit = "", reference = null }) {
  if (!bars.length || bars.every((b) => !b.value)) {
    el.innerHTML = `<p class="muted">Nothing to show for this period.</p>`;
    return;
  }
  const width = Math.max(280, Math.round(el.clientWidth || 340));
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;
  const top = niceMax(Math.max(...bars.map((b) => b.value), reference ? reference.value : 0));
  const y = (v) => PAD.top + innerH - (v / top) * innerH;
  const slot = innerW / bars.length;
  const barW = Math.max(2, Math.min(36, slot - 4));
  // Show a label under every bar if there's room, otherwise every few bars.
  const every = Math.ceil(bars.length / Math.floor(innerW / 34));
  const grid = [0, top / 2, top];

  el.innerHTML = `
    <div class="chart-box">
      <svg class="bar-chart" viewBox="0 0 ${width} ${HEIGHT}" width="100%" height="${HEIGHT}" role="img"
           aria-label="${escapeHtml(bars.map((b) => `${b.label}: ${round(b.value)} ${unit}`).join(", "))}">
        ${grid.map((v) => `
          <line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(v)}" y2="${y(v)}"></line>
          <text class="axis" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${round(v)}</text>`).join("")}
        ${bars.map((b, i) => {
          const x = PAD.left + i * slot + (slot - barW) / 2;
          const h = Math.max(0, y(0) - y(b.value));
          return `
            <rect class="bc-bar" x="${x}" y="${y(0) - h}" width="${barW}" height="${h}" rx="${Math.min(4, barW / 2)}"></rect>
            <rect class="bc-hit" data-i="${i}" x="${PAD.left + i * slot}" y="${PAD.top}" width="${slot}" height="${innerH}"></rect>
            ${i % every === 0 ? `<text class="axis" x="${x + barW / 2}" y="${HEIGHT - 6}" text-anchor="middle">${escapeHtml(b.label)}</text>` : ""}`;
        }).join("")}
        ${reference ? `
          <line class="target" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(reference.value)}" y2="${y(reference.value)}"></line>
          <text class="axis ref-label" x="${width - PAD.right}" y="${y(reference.value) - 4}" text-anchor="end">${escapeHtml(reference.label)}</text>` : ""}
      </svg>
      <div class="chart-tip" hidden></div>
    </div>`;

  const svg = el.querySelector("svg");
  const tip = el.querySelector(".chart-tip");
  const show = (event) => {
    const hit = event.target.closest(".bc-hit");
    if (!hit) return;
    const b = bars[Number(hit.dataset.i)];
    tip.innerHTML = `<strong>${round(b.value)} ${escapeHtml(unit)}</strong><br>${escapeHtml(b.tip || b.label)}`;
    tip.hidden = false;
    const box = svg.getBoundingClientRect();
    const center = ((PAD.left + (Number(hit.dataset.i) + 0.5) * slot) / width) * box.width;
    tip.style.left = `${Math.min(Math.max(center - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth)}px`;
  };
  svg.addEventListener("pointermove", show);
  svg.addEventListener("pointerdown", show);
  svg.addEventListener("pointerleave", () => { tip.hidden = true; });
}

// A round top for the scale: 37 -> 40, 182 -> 200.
function niceMax(value) {
  if (value <= 0) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

function round(value) {
  return Number(value).toLocaleString("en-GB", { maximumFractionDigits: value < 10 ? 1 : 0 });
}
