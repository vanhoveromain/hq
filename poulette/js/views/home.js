// home.js: Accueil = "État actuel" (steps 1.2 to 1.5).
//   - running chronos on top (feed: side, time, change side, stop; sleep)
//   - the last feed (+ next breast), bottle, change, sleep
//   - today's counts
//   - the quick actions (big buttons), "Plus" for the rest

import * as store from "../store.js";
import * as rules from "../rules.js";
import { escapeHtml } from "../utils/html.js";
import { dayKey, hhmm } from "../utils/dates.js";
import { startAction, feedControls, switchSide, stopTimer } from "./actions.js";

let ticker = null;

export function render(el, { home }) {
  const baby = home.babies[0];
  if (!baby) {
    el.innerHTML = `<div class="placeholder"><strong>Pas encore de bébé</strong><span class="muted">Ajoute-le dans <a href="#/reglages">Réglages → Bébé</a>.</span></div>`;
    return;
  }
  el.innerHTML = `<div id="home-live"></div>
    <section class="section">
      <div class="quick">${rules.QUICK_ACTIONS.map((t) => `<button type="button" class="quick-btn" data-action="${t}">
        <span class="quick-emoji">${rules.emoji(t)}</span><span>${escapeHtml(rules.label(t))}</span></button>`).join("")}
        <button type="button" class="quick-btn more" data-action="more"><span class="quick-emoji">＋</span><span>Plus</span></button>
      </div>
    </section>`;
  el.querySelectorAll("[data-action]").forEach((b) => b.addEventListener("click", () => startAction(b.dataset.action)));
  refresh(el);
  clearInterval(ticker);
  ticker = setInterval(() => tick(el), 1000);
}

export function refresh(el) {
  const box = el.querySelector("#home-live");
  if (!box) return;
  const all = store.events();
  const now = Date.now();
  const runningOnes = rules.running(all);
  const feed = rules.latest(all, "breastfeed");
  const bottle = rules.latest(all, "bottle");
  const diaper = rules.latest(all, "diaper");
  // Last FINISHED sleep (a running one is the banner on top).
  const sleep = rules.live(all).filter((e) => e.type === "sleep" && e.ended_at)
    .sort((a, b) => b.ended_at.localeCompare(a.ended_at))[0] || null;
  const next = rules.nextBreast(all);

  const today = rules.live(all).filter((e) => dayKey(e.started_at) === dayKey());
  const count = (type, test = () => true) => today.filter((e) => e.type === type && test(e)).length;
  const ml = today.filter((e) => e.type === "bottle").reduce((sum, e) => sum + (Number(e.data && e.data.ml) || 0), 0);

  const card = (type, e, extra = "") => `<button type="button" class="status-card" data-action="${type}">
      <span class="status-title">${rules.emoji(type)} ${escapeHtml(rules.label(type))}</span>
      ${e ? `<span class="status-ago" data-ago="${escapeHtml(e.ended_at && type === "sleep" ? e.ended_at : e.started_at)}">${rules.ago(e.ended_at && type === "sleep" ? e.ended_at : e.started_at, now)}</span>
        <span class="status-sub">${escapeHtml(rules.summary(e, now))} · ${hhmm(e.started_at)}</span>` : '<span class="status-sub muted">Rien encore</span>'}
      ${extra}</button>`;

  box.innerHTML = `
    ${runningOnes.map((e) => banner(e, now)).join("")}
    <section class="section status-grid">
      ${card("breastfeed", feed, next ? `<span class="next-side">Prochain : <strong>${rules.SIDES[next]}</strong></span>` : "")}
      ${card("bottle", bottle)}
      ${card("diaper", diaper)}
      ${card("sleep", sleep)}
    </section>
    <p class="today muted">Aujourd'hui : ${count("breastfeed")} tétée(s) · ${ml} ml de biberon ·
      ${count("diaper", (e) => e.data && e.data.pee)} mouillée(s) · ${count("diaper", (e) => e.data && e.data.poop)} sale(s)</p>`;

  box.querySelectorAll(".status-card").forEach((b) => b.addEventListener("click", () => startAction(b.dataset.action)));
  box.querySelectorAll("[data-banner]").forEach((b) => {
    const e = runningOnes.find((x) => x.id === b.dataset.banner);
    b.querySelector("[data-switch]")?.addEventListener("click", () => switchSide(e));
    b.querySelector("[data-stop]")?.addEventListener("click", () => stopTimer(e));
  });
}

function banner(e, now) {
  if (e.type === "breastfeed") {
    const side = rules.currentSide(e);
    const segs = (e.data && e.data.segments) || [];
    const segStart = segs.length ? segs[segs.length - 1].start : e.started_at;
    return `<div class="banner" data-banner="${e.id}">
      <div class="banner-text"><span class="banner-title">🤱 Tétée · ${side ? rules.SIDES[side] : ""}</span>
        <span class="chrono" data-chrono="${escapeHtml(segStart)}">${rules.fmtChrono(now - Date.parse(segStart))}</span>
        <span class="muted small">total <span data-chrono="${escapeHtml(e.started_at)}">${rules.fmtChrono(now - Date.parse(e.started_at))}</span></span></div>
      <div class="banner-actions"><button type="button" class="btn secondary" data-switch>Côté ${side === "L" ? "D" : "G"}</button>
        <button type="button" class="btn" data-stop>Stop</button></div></div>`;
  }
  return `<div class="banner" data-banner="${e.id}">
    <div class="banner-text"><span class="banner-title">😴 Sommeil</span>
      <span class="chrono" data-chrono="${escapeHtml(e.started_at)}">${rules.fmtChrono(now - Date.parse(e.started_at))}</span>
      <span class="muted small">depuis ${hhmm(e.started_at)}</span></div>
    <div class="banner-actions"><button type="button" class="btn" data-stop>Réveil</button></div></div>`;
}

// Every second: chronos; every minute is enough for "il y a".
function tick(el) {
  const now = Date.now();
  el.querySelectorAll("[data-chrono]").forEach((s) => { s.textContent = rules.fmtChrono(now - Date.parse(s.dataset.chrono)); });
  el.querySelectorAll("[data-ago]").forEach((s) => { s.textContent = rules.ago(s.dataset.ago, now); });
}

export function leave() {
  clearInterval(ticker);
  ticker = null;
}

export { feedControls };
