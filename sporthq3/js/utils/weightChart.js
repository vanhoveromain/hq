// weightChart.js — draws the weight chart as SVG (a drawing made of code:
// lines, dots and text), so no chart library is needed.
//
//   drawWeightChart(element, { weighIns, trend, targetKg })
//
// Dots = each weigh-in. Line = the trend (average of the last weigh-ins).
// Dashed line = your target. Tap or hover the chart to read a value.

import { escapeHtml } from "./format.js?v=202610212125";
import { formatDayLabel } from "./dates.js?v=202610212125";

const HEIGHT = 220;
const PAD = { top: 16, right: 12, bottom: 26, left: 40 };

export function drawWeightChart(el, { weighIns, trend, targetKg }) {
  if (weighIns.length < 2) {
    el.innerHTML = `<p class="muted">The chart appears from your second weigh-in.</p>`;
    return;
  }
  const width = Math.max(280, Math.round(el.clientWidth || 340));
  const innerW = width - PAD.left - PAD.right;
  const innerH = HEIGHT - PAD.top - PAD.bottom;

  // Scales: turn a date / a weight into a position in the drawing.
  const times = weighIns.map((w) => Date.parse(w.weigh_date));
  const t0 = Math.min(...times);
  const t1 = Math.max(...times);
  const values = weighIns.map((w) => Number(w.weight_kg)).concat(targetKg ? [Number(targetKg)] : []);
  let low = Math.floor(Math.min(...values) - 0.5);
  let high = Math.ceil(Math.max(...values) + 0.5);
  if (high - low < 2) { low -= 1; high += 1; }
  const x = (date) => PAD.left + ((Date.parse(date) - t0) / Math.max(1, t1 - t0)) * innerW;
  const y = (kg) => PAD.top + (1 - (kg - low) / (high - low)) * innerH;

  // About 4 horizontal grid lines with round kg values.
  const step = Math.max(1, Math.ceil((high - low) / 4));
  const gridValues = [];
  for (let v = Math.ceil(low / step) * step; v <= high; v += step) gridValues.push(v);

  const trendPath = trend.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.kg).toFixed(1)}`).join(" ");
  const firstLabel = formatDayLabel(weighIns[0].weigh_date).replace(/^\w+, /, "");
  const lastLabel = formatDayLabel(weighIns[weighIns.length - 1].weigh_date).replace(/^\w+, /, "");

  el.innerHTML = `
    <div class="chart-legend" aria-hidden="true">
      <span><i class="key key-dot"></i>Weigh-ins</span>
      <span><i class="key key-line"></i>Trend</span>
      ${targetKg ? `<span><i class="key key-dash"></i>Target</span>` : ""}
    </div>
    <div class="chart-box">
      <svg class="weight-chart" viewBox="0 0 ${width} ${HEIGHT}" width="100%" height="${HEIGHT}"
           role="img" aria-label="Weight from ${escapeHtml(firstLabel)} to ${escapeHtml(lastLabel)}">
        ${gridValues.map((v) => `
          <line class="grid" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(v)}" y2="${y(v)}"></line>
          <text class="axis" x="${PAD.left - 6}" y="${y(v) + 4}" text-anchor="end">${v}</text>`).join("")}
        <text class="axis" x="${PAD.left}" y="${HEIGHT - 6}">${escapeHtml(firstLabel)}</text>
        <text class="axis" x="${width - PAD.right}" y="${HEIGHT - 6}" text-anchor="end">${escapeHtml(lastLabel)}</text>
        ${targetKg ? `<line class="target" x1="${PAD.left}" x2="${width - PAD.right}" y1="${y(targetKg)}" y2="${y(targetKg)}"></line>` : ""}
        ${weighIns.map((w) => `<circle class="dot" cx="${x(w.weigh_date)}" cy="${y(Number(w.weight_kg))}" r="4"></circle>`).join("")}
        <path class="trend" d="${trendPath}"></path>
        <line class="cursor" y1="${PAD.top}" y2="${HEIGHT - PAD.bottom}" visibility="hidden"></line>
        <circle class="cursor-dot" r="6" visibility="hidden"></circle>
        <rect class="hit" x="${PAD.left}" y="0" width="${innerW}" height="${HEIGHT}"></rect>
      </svg>
      <div class="chart-tip" hidden></div>
    </div>
  `;

  // Tap / hover: show the nearest weigh-in.
  const svg = el.querySelector("svg");
  const tip = el.querySelector(".chart-tip");
  const cursor = el.querySelector(".cursor");
  const cursorDot = el.querySelector(".cursor-dot");

  function showNearest(event) {
    const box = svg.getBoundingClientRect();
    const px = ((event.clientX - box.left) / box.width) * width;
    let index = 0;
    weighIns.forEach((w, i) => {
      if (Math.abs(x(w.weigh_date) - px) < Math.abs(x(weighIns[index].weigh_date) - px)) index = i;
    });
    const w = weighIns[index];
    const cx = x(w.weigh_date);
    const cy = y(Number(w.weight_kg));
    cursor.setAttribute("x1", cx);
    cursor.setAttribute("x2", cx);
    cursorDot.setAttribute("cx", cx);
    cursorDot.setAttribute("cy", cy);
    // (SVG shapes use "visibility", not "hidden" like HTML elements)
    cursor.setAttribute("visibility", "visible");
    cursorDot.setAttribute("visibility", "visible");
    tip.innerHTML = `<strong>${Number(w.weight_kg)} kg</strong><br>${escapeHtml(formatDayLabel(w.weigh_date))}
      <br><span class="muted">trend ${trend[index].kg} kg</span>`;
    tip.hidden = false;
    // Keep the tooltip inside the chart.
    const left = Math.min(Math.max((cx / width) * box.width - tip.offsetWidth / 2, 0), box.width - tip.offsetWidth);
    tip.style.left = `${left}px`;
  }
  function hide() {
    cursor.setAttribute("visibility", "hidden");
    cursorDot.setAttribute("visibility", "hidden");
    tip.hidden = true;
  }
  svg.addEventListener("pointermove", showNearest);
  svg.addEventListener("pointerdown", showNearest);
  svg.addEventListener("pointerleave", hide);
}
