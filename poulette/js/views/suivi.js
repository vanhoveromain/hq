// suivi.js: measurements (step 1.9). Weight / length / head + source, a
// simple weight chart (one line, teal, birth weight as the first point) and
// the gap with the birth weight. The list under the chart is its table view.

import * as store from "../store.js";
import * as rules from "../rules.js";
import { escapeHtml } from "../utils/html.js";
import { openSheet } from "../utils/sheet.js";
import { shortDate, toLocalInput, fromLocalInput } from "../utils/dates.js";

let baby = null;

export function render(el, { home, params }) {
  baby = home.babies[0];
  if (!baby) {
    el.innerHTML = `<div class="placeholder"><strong>Pas encore de bébé</strong><span class="muted">Ajoute-le dans <a href="#/reglages">Réglages</a>.</span></div>`;
    return;
  }
  el.innerHTML = `<button type="button" class="btn block big" data-add>⚖️ Ajouter une mesure</button>
    <section class="section"><div id="chart"></div></section>
    <section class="section"><h2 class="section-title">Mesures</h2><div id="list"></div></section>`;
  el.querySelector("[data-add]").addEventListener("click", () => measureSheet());
  refresh(el);
  if (params && params[0] === "ajout") {
    history.replaceState(null, "", "#/suivi");
    measureSheet();
  }
}

function weightPoints(b = baby, list = store.measurements()) {
  const pts = list.filter((m) => m.weight_g)
    .map((m) => ({ t: Date.parse(m.measured_at), g: m.weight_g, label: shortDate(m.measured_at), source: m.source }));
  if (b.birth_weight_g && b.birth_date) {
    pts.push({ t: Date.parse(b.birth_date + "T12:00:00"), g: b.birth_weight_g, label: `${shortDate(b.birth_date + "T12:00:00")} (naissance)`, birth: true });
  }
  return pts.sort((x, y) => x.t - y.t);
}

// "+120 g (+3,5 %) depuis la naissance"
export function gapFromBirth(g, b = baby) {
  if (!b || !b.birth_weight_g || !g) return "";
  const diff = g - b.birth_weight_g;
  const pct = (diff / b.birth_weight_g) * 100;
  return `${diff >= 0 ? "+" : "−"}${rules.fmtNumber(Math.abs(diff))} g (${diff >= 0 ? "+" : "−"}${rules.fmtNumber(Math.abs(pct), 1)} %) depuis la naissance`;
}

export function refresh(el) {
  const chart = el.querySelector("#chart");
  const list = el.querySelector("#list");
  if (!chart || !list) return;
  drawChart(chart, weightPoints(), baby);

  const rows = store.measurements().sort((a, b) => b.measured_at.localeCompare(a.measured_at));
  list.innerHTML = rows.length ? rows.map((m) => `<button type="button" class="entry wide" data-id="${m.id}">
      <span class="entry-time">${shortDate(m.measured_at)}</span>
      <span class="entry-main"><span class="entry-title">${[m.weight_g ? `${rules.fmtNumber(m.weight_g)} g` : null, m.length_cm ? `${rules.fmtNumber(m.length_cm, 1)} cm` : null,
        m.head_cm ? `PC ${rules.fmtNumber(m.head_cm, 1)} cm` : null].filter(Boolean).join(" · ")}${m._pending ? " ⏳" : ""}</span>
        <span class="entry-sub">${escapeHtml([m.source, m.weight_g && baby.birth_weight_g ? gapFromBirth(m.weight_g) : null].filter(Boolean).join(" · "))}</span></span></button>`).join("")
    : '<p class="muted">Aucune mesure pour l\'instant.</p>';
  list.querySelectorAll("[data-id]").forEach((b) => b.addEventListener("click", () => {
    measureSheet(store.measurements().find((m) => m.id === b.dataset.id));
  }));
}

// One line, the accent colour, 2 px; 8 px points; a recessive grid; tap or
// hover a point to read it (the line above the chart).
// Used by the report too (weightChart below).
export function weightChart(box, b, list) {
  drawChart(box, weightPoints(b, list), b);
}

function drawChart(box, pts, b) {
  const gap = (g) => gapFromBirth(g, b);
  if (pts.length < 2) {
    box.innerHTML = `<p class="muted">Le graphique du poids apparaît dès qu'il y a deux poids${b.birth_weight_g ? "" : " (pense au poids de naissance dans Réglages)"}.</p>`;
    return;
  }
  // 1 unit = 1 px (the box's real width): text 12 px, line 2 px, points 8 px.
  const W = Math.max(280, Math.round(box.clientWidth || 600)), H = 220, L = 52, R = 12, T = 12, B = 28;
  const t0 = pts[0].t, t1 = pts[pts.length - 1].t || t0 + 1;
  let g0 = Math.min(...pts.map((p) => p.g)), g1 = Math.max(...pts.map((p) => p.g));
  const pad = Math.max(100, (g1 - g0) * 0.15);
  g0 = Math.floor((g0 - pad) / 100) * 100; g1 = Math.ceil((g1 + pad) / 100) * 100;
  const x = (t) => L + ((t - t0) / Math.max(1, t1 - t0)) * (W - L - R);
  const y = (g) => T + (1 - (g - g0) / (g1 - g0)) * (H - T - B);
  const ticks = [0, 1, 2, 3].map((i) => g0 + ((g1 - g0) * i) / 3);
  const last = pts[pts.length - 1];
  box.innerHTML = `<p class="chart-read" id="chart-read"><strong>${rules.fmtNumber(last.g)} g</strong> · ${escapeHtml(last.label)}${last.birth ? "" : ` · ${gap(last.g)}`}</p>
    <svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Poids du bébé dans le temps">
      ${ticks.map((g) => `<line class="grid" x1="${L}" x2="${W - R}" y1="${y(g)}" y2="${y(g)}"/><text class="axis" x="${L - 6}" y="${y(g) + 4}" text-anchor="end">${rules.fmtNumber(g / 1000, 1)} kg</text>`).join("")}
      <text class="axis" x="${L}" y="${H - 6}">${escapeHtml(pts[0].label.replace(" (naissance)", ""))}</text>
      <text class="axis" x="${W - R}" y="${H - 6}" text-anchor="end">${escapeHtml(last.label)}</text>
      <polyline class="line" points="${pts.map((p) => `${x(p.t)},${y(p.g)}`).join(" ")}"/>
      ${pts.map((p, i) => `<circle class="pt" cx="${x(p.t)}" cy="${y(p.g)}" r="4"/><circle class="hit" data-i="${i}" cx="${x(p.t)}" cy="${y(p.g)}" r="16"/>`).join("")}
    </svg>`;
  const read = box.querySelector("#chart-read");
  box.querySelectorAll(".hit").forEach((c) => {
    const show = () => {
      const p = pts[Number(c.dataset.i)];
      read.innerHTML = `<strong>${rules.fmtNumber(p.g)} g</strong> · ${escapeHtml(p.label)}${p.birth ? "" : ` · ${gap(p.g)}`}`;
      box.querySelectorAll(".pt").forEach((pt, j) => pt.classList.toggle("on", j === Number(c.dataset.i)));
    };
    c.addEventListener("pointerenter", show);
    c.addEventListener("click", show);
  });
}

function measureSheet(m = null) {
  const v = (x) => (x == null ? "" : x);
  openSheet({
    title: m ? "⚖️ Mesure" : "⚖️ Nouvelle mesure",
    body: `<form class="form" novalidate>
      <label class="field">Date et heure<input name="measured_at" type="datetime-local" required value="${toLocalInput(m ? m.measured_at : new Date().toISOString())}"></label>
      <label class="field">Poids (g)<input name="weight_g" type="number" inputmode="numeric" min="300" max="30000" step="1" value="${v(m && m.weight_g)}" placeholder="ex. 3520"></label>
      <div class="field-pair"><label class="field">Taille (cm)<input name="length_cm" type="number" inputmode="decimal" min="20" max="130" step="0.1" value="${v(m && m.length_cm)}"></label>
      <label class="field">Périmètre crânien (cm)<input name="head_cm" type="number" inputmode="decimal" min="20" max="60" step="0.1" value="${v(m && m.head_cm)}"></label></div>
      <label class="field">Source<select name="source"><option value="">—</option>${rules.MEASURE_SOURCES.map((s) => `<option ${m && m.source === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}</select></label>
      <p class="status" role="status"></p>
      <div class="actions">${m ? '<button type="button" class="btn danger" data-delete>Supprimer</button>' : ""}<button type="submit" class="btn">Enregistrer</button></div>
    </form>`,
    onOpen(el, close) {
      const form = el.querySelector("form");
      const status = form.querySelector(".status");
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const num = (n) => (form[n].value === "" ? null : Number(form[n].value));
        const fields = { measured_at: fromLocalInput(form.measured_at.value), weight_g: num("weight_g") === null ? null : Math.round(num("weight_g")),
          length_cm: num("length_cm"), head_cm: num("head_cm"), source: form.source.value || null };
        if (!fields.measured_at || !form.checkValidity() || (fields.weight_g == null && fields.length_cm == null && fields.head_cm == null)) {
          status.className = "status error";
          status.textContent = "Indique la date et au moins une mesure (poids 300 à 30 000 g, taille 20 à 130 cm, PC 20 à 60 cm).";
          return;
        }
        if (m) await store.updateMeasurement(m.id, fields);
        else await store.addMeasurement(fields);
        close();
      });
      const del = form.querySelector("[data-delete]");
      if (del) del.addEventListener("click", async () => {
        if (del.dataset.confirm !== "1") { del.dataset.confirm = "1"; del.textContent = "Confirmer la suppression"; return; }
        await store.deleteMeasurement(m.id);
        close();
      });
    },
  });
}

