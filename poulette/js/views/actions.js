// actions.js: the quick entries (steps 1.2 to 1.5). Each one is at most
// 2 taps from Accueil: the action button, then one big choice.
// After a save, a small panel (the "receipt") offers -5 / -15 / -30 min,
// Modifier (time, note, details) and Annuler, and goes away by itself.

import * as store from "../store.js";
import * as rules from "../rules.js";
import { openSheet, closeSheet } from "../utils/sheet.js";
import { escapeHtml } from "../utils/html.js";
import { hhmm, minus } from "../utils/dates.js";
import { openEditor, poopPickers, makeRadiosClearable } from "./editor.js";

let members = [];
export function setMembers(list) { members = list || []; }

// ---------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------

export function startAction(type) {
  const all = store.events();
  switch (type) {
    case "breastfeed": return breastfeedSheet(all);
    case "bottle": return bottleSheet(all);
    case "diaper": return diaperSheet();
    case "sleep": return sleepAction(all);
    case "pump": return pumpSheet(all);
    case "spit_up": return spitSheet();
    case "temperature": return temperatureSheet(all);
    case "medication": return medicationSheet(all);
    case "more": return moreSheet();
    default: return null;
  }
}

// ---------------------------------------------------------------------
// Feeds and sleep (chronos)
// ---------------------------------------------------------------------

function breastfeedSheet(all) {
  const next = rules.nextBreast(all);
  const btn = (c) => {
    const suggested = c.sides[0] === next;
    return `<button type="button" class="big-choice ${c.sides.length === 1 && suggested ? "suggested" : ""}" data-feed="${c.id}">
      <span class="big-letter">${c.short}</span><span>${c.label}</span>
      ${c.sides.length === 1 && suggested ? '<span class="tag">suggéré</span>' : ""}</button>`;
  };
  openSheet({
    title: "🤱 Tétée : quel sein ?",
    body: `<div class="big-grid two">${rules.FEED_CHOICES.map(btn).join("")}</div>
      <p class="hint center">Durée facultative juste après.</p>`,
    onOpen(el, close) {
      el.querySelectorAll("[data-feed]").forEach((b) => b.addEventListener("click", async () => {
        const choice = rules.FEED_CHOICES.find((c) => c.id === b.dataset.feed);
        const e = await store.addEvent("breastfeed", { data: { sides: choice.sides } });
        close();
        receipt(e);
      }));
    },
  });
}

// Stops a chrono (sleep; also an old feed from the chrono version).
export async function stopTimer(e) {
  const now = new Date().toISOString();
  const patch = { ended_at: now };
  if (e.data && e.data.segments) {
    patch.data = { ...e.data, segments: e.data.segments.map((s) => (s.end ? s : { ...s, end: now })) };
  }
  await store.updateEvent(e.id, patch);
}

function sleepAction(all) {
  const open = rules.running(all).find((e) => e.type === "sleep");
  if (open) {
    openSheet({
      title: "😴 Sommeil en cours",
      body: `<div class="big-grid one"><button type="button" class="big-choice stop" data-stop><span class="big-letter">☀</span><span>Réveil (fin du sommeil)</span></button></div>`,
      onOpen(el, close) { el.querySelector("[data-stop]").addEventListener("click", async () => { await stopTimer(open); close(); }); },
    });
    return;
  }
  // One tap: the chrono starts.
  store.addEvent("sleep", { data: {} }).then(receipt);
}

// ---------------------------------------------------------------------
// One-off entries
// ---------------------------------------------------------------------

function diaperSheet() {
  openSheet({
    title: "🧷 Change",
    body: `<div class="big-grid three">
      <button type="button" class="big-choice" data-d="pee"><span class="big-letter">💧</span><span>Pipi</span></button>
      <button type="button" class="big-choice" data-d="poop"><span class="big-letter">💩</span><span>Caca</span></button>
      <button type="button" class="big-choice" data-d="both"><span class="big-letter">💧💩</span><span>Les deux</span></button></div>`,
    onOpen(el, close) {
      el.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", async () => {
        const v = b.dataset.d;
        const e = await store.addEvent("diaper", { data: { pee: v !== "poop", poop: v !== "pee" } });
        close();
        receipt(e);
      }));
    },
  });
}

// A big number with +10 / +30 / -10 buttons.
function stepper(value, unit) {
  return `<div class="stepper"><output class="big-number" data-value>${value}</output><span class="unit">${unit}</span></div>
    <div class="step-buttons">${rules.ML_STEPS.map((s) => `<button type="button" class="btn secondary" data-step="${s}">${s > 0 ? "+" : "−"}${Math.abs(s)}</button>`).join("")}</div>`;
}
function wireStepper(el, start, { min = 0, max = 500 } = {}) {
  let value = start;
  const out = el.querySelector("[data-value]");
  el.querySelectorAll("[data-step]").forEach((b) => b.addEventListener("click", () => {
    value = Math.min(max, Math.max(min, value + Number(b.dataset.step)));
    out.textContent = value;
  }));
  return () => value;
}
function segmented(name, map, selected) {
  return `<div class="segmented" role="group">${Object.entries(map).map(([v, l]) =>
    `<button type="button" data-${name}="${v}" aria-pressed="${v === selected}">${escapeHtml(l)}</button>`).join("")}</div>`;
}
function wireSegmented(el, name, start) {
  let value = start;
  el.querySelectorAll(`[data-${name}]`).forEach((b) => b.addEventListener("click", () => {
    value = b.dataset[name];
    el.querySelectorAll(`[data-${name}]`).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
  }));
  return () => value;
}

function bottleSheet(all) {
  const last = rules.latest(all, "bottle");
  const ml = (last && last.data && last.data.ml) || rules.DEFAULT_BOTTLE_ML;
  const milk = (last && last.data && last.data.milk) || "breast";
  openSheet({
    title: "🍼 Biberon",
    body: `${stepper(ml, "ml")}${segmented("milk", { breast: "Maternel", formula: "Infantile" }, milk)}
      <button type="button" class="btn block big" data-ok>Valider</button>`,
    onOpen(el, close) {
      const getMl = wireStepper(el, ml);
      const getMilk = wireSegmented(el, "milk", milk);
      el.querySelector("[data-ok]").addEventListener("click", async () => {
        const e = await store.addEvent("bottle", { data: { ml: getMl(), milk: getMilk() } });
        close();
        receipt(e);
      });
    },
  });
}

function pumpSheet(all) {
  const last = rules.latest(all, "pump");
  const ml = (last && last.data && last.data.ml) || 60;
  const side = (last && last.data && last.data.side) || "both";
  openSheet({
    title: "🥛 Tirage",
    body: `${segmented("side", { L: "Gauche", R: "Droite", both: "Les deux" }, side)}${stepper(ml, "ml")}
      <button type="button" class="btn block big" data-ok>Valider</button>`,
    onOpen(el, close) {
      const getSide = wireSegmented(el, "side", side);
      const getMl = wireStepper(el, ml);
      el.querySelector("[data-ok]").addEventListener("click", async () => {
        const e = await store.addEvent("pump", { data: { side: getSide(), ml: getMl() } });
        close();
        receipt(e);
      });
    },
  });
}

function spitSheet() {
  openSheet({
    title: "💧 Régurgitation",
    body: `${segmented("kind", rules.SPIT_KINDS, "spit_up")}
      <div class="big-grid three">${Object.entries(rules.SPIT_SIZES).map(([k, l]) =>
        `<button type="button" class="big-choice" data-size="${k}"><span>${escapeHtml(l)}</span></button>`).join("")}</div>`,
    onOpen(el, close) {
      const getKind = wireSegmented(el, "kind", "spit_up");
      el.querySelectorAll("[data-size]").forEach((b) => b.addEventListener("click", async () => {
        const e = await store.addEvent("spit_up", { data: { kind: getKind(), size: b.dataset.size } });
        close();
        receipt(e);
      }));
    },
  });
}

function temperatureSheet(all) {
  const last = rules.latest(all, "temperature");
  let value = (last && last.data && last.data.celsius) || rules.DEFAULT_TEMPERATURE;
  openSheet({
    title: "🌡️ Température",
    body: `<div class="stepper"><output class="big-number" data-value>${rules.fmtNumber(value, 1)}</output><span class="unit">°C</span></div>
      <div class="step-buttons"><button type="button" class="btn secondary" data-t="-0.5">−0,5</button><button type="button" class="btn secondary" data-t="-0.1">−0,1</button>
      <button type="button" class="btn secondary" data-t="0.1">+0,1</button><button type="button" class="btn secondary" data-t="0.5">+0,5</button></div>
      <button type="button" class="btn block big" data-ok>Valider</button>`,
    onOpen(el, close) {
      const out = el.querySelector("[data-value]");
      el.querySelectorAll("[data-t]").forEach((b) => b.addEventListener("click", () => {
        value = Math.round(Math.min(43, Math.max(34, value + Number(b.dataset.t))) * 10) / 10;
        out.textContent = rules.fmtNumber(value, 1);
      }));
      el.querySelector("[data-ok]").addEventListener("click", async () => {
        const e = await store.addEvent("temperature", { data: { celsius: value } });
        close();
        receipt(e);
      });
    },
  });
}

function medicationSheet(all) {
  const suggestions = rules.medicationSuggestions(all);
  openSheet({
    title: "💊 Médicament",
    body: `${suggestions.length ? `<p class="hint">Déjà donnés (un tap = enregistré) :</p><div class="chips wrap">${suggestions.map((s, i) =>
        `<button type="button" class="chip" data-sugg="${i}">${escapeHtml(s.name)}${s.dose ? ` · ${escapeHtml(s.dose)}` : ""}</button>`).join("")}</div>` : ""}
      <form class="form" novalidate>
        <div class="field-pair"><label class="field">Médicament<input name="name" maxlength="80" required placeholder="ex. Vitamine D"></label>
        <label class="field">Dose<input name="dose" maxlength="40" placeholder="ex. 1 goutte"></label></div>
        <button type="submit" class="btn block big">Valider</button></form>`,
    onOpen(el, close) {
      const save = async (name, dose) => {
        const e = await store.addEvent("medication", { data: { name, dose } });
        close();
        receipt(e);
      };
      el.querySelectorAll("[data-sugg]").forEach((b) => b.addEventListener("click", () => {
        const s = suggestions[Number(b.dataset.sugg)];
        save(s.name, s.dose);
      }));
      const form = el.querySelector("form");
      form.addEventListener("submit", (ev) => {
        ev.preventDefault();
        const name = form.name.value.trim();
        if (!name) { form.name.focus(); return; }
        save(name, form.dose.value.trim());
      });
    },
  });
}

function moreSheet() {
  openSheet({
    title: "Plus",
    body: `<div class="big-grid two">
      <button type="button" class="big-choice" data-more="temperature"><span class="big-letter">🌡️</span><span>Température</span></button>
      <button type="button" class="big-choice" data-more="medication"><span class="big-letter">💊</span><span>Médicament</span></button>
      <a class="big-choice" href="#/suivi/ajout"><span class="big-letter">⚖️</span><span>Mesure</span></a>
      <button type="button" class="big-choice" data-more="question"><span class="big-letter">❓</span><span>Question pédiatre</span></button></div>`,
    onOpen(el, close) {
      el.querySelectorAll("[data-more]").forEach((b) => b.addEventListener("click", () => {
        const what = b.dataset.more;
        close();
        if (what === "question") questionSheet();
        else startAction(what);
      }));
      el.querySelector("a").addEventListener("click", () => close());
    },
  });
}

export function questionSheet() {
  openSheet({
    title: "❓ Question pour la pédiatre",
    body: `<form class="form" novalidate><label class="field">Question<textarea name="text" rows="3" maxlength="1000" required></textarea></label>
      <button type="submit" class="btn block big">Ajouter</button></form>`,
    onOpen(el, close) {
      const form = el.querySelector("form");
      form.text.focus();
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const text = form.text.value.trim();
        if (!text) return;
        await store.addQuestion(text);
        close();
        toast("Question ajoutée (onglet Pédiatre)");
      });
    },
  });
}

// ---------------------------------------------------------------------
// The receipt panel after a quick entry
// ---------------------------------------------------------------------

let panelTimer = null;

export function receipt(e) {
  closePanel();
  const panel = document.createElement("div");
  panel.className = "receipt";
  panel.setAttribute("role", "status");
  const draw = () => {
    const cur = store.events().find((x) => x.id === e.id) || e;
    const poop = cur.type === "diaper" && cur.data && cur.data.poop;
    const feed = cur.type === "breastfeed";
    const minutes = feed ? rules.feedMinutes(cur) : null;
    panel.innerHTML = `<div class="receipt-head"><strong>✓ ${rules.emoji(cur.type)} ${escapeHtml(rules.label(cur.type))}</strong>
        <span class="muted">${hhmm(cur.started_at)}${rules.TYPES[cur.type].timer ? " · chrono lancé" : ""}</span>
        <button type="button" class="icon-close" data-close aria-label="Fermer">✕</button></div>
      <div class="receipt-row">
        <button type="button" class="btn secondary small" data-minus="5">−5 min</button>
        <button type="button" class="btn secondary small" data-minus="15">−15</button>
        <button type="button" class="btn secondary small" data-minus="30">−30</button>
        <button type="button" class="btn secondary small" data-edit>Modifier</button>
        <button type="button" class="btn danger small" data-undo>Annuler</button></div>
      ${feed ? `<div class="receipt-feed"><span class="hint">Durée (facultatif)</span><div class="chips">${rules.FEED_MINUTES.map((m) =>
        `<button type="button" class="chip ${minutes === m ? "on" : ""}" data-minutes="${m}" aria-pressed="${minutes === m}">${m} min</button>`).join("")}</div></div>` : ""}
      ${poop ? `<form class="receipt-poop">${poopPickers(cur.data, { compact: true })}</form>` : ""}
      <button type="button" class="btn block big" data-ok>✓ OK</button>`;
    const form = panel.querySelector(".receipt-poop");
    if (form) makeRadiosClearable(form);
  };
  draw();
  document.body.append(panel);

  const keepOpen = () => { clearTimeout(panelTimer); panelTimer = setTimeout(closePanel, 12000); };
  keepOpen();
  panel.addEventListener("click", async (ev) => {
    keepOpen();
    const cur = store.events().find((x) => x.id === e.id) || e;
    const t = ev.target.closest("button");
    if (!t) return;
    if (t.dataset.close !== undefined || t.dataset.ok !== undefined) return closePanel();
    if (t.dataset.minutes) {
      const m = Number(t.dataset.minutes);
      const data = { ...cur.data };
      if (rules.feedMinutes(cur) === m) delete data.minutes; else data.minutes = m; // tap again = no duration
      await store.updateEvent(cur.id, { data });
      draw();
      return;
    }
    if (t.dataset.minus) {
      const m = Number(t.dataset.minus);
      await store.updateEvent(cur.id, { started_at: minus(cur.started_at, m) });
      draw();
    } else if (t.dataset.edit !== undefined) {
      closePanel();
      openEditor(cur, { members });
    } else if (t.dataset.undo !== undefined) {
      await store.deleteEvent(cur.id);
      closePanel();
      toast(`${rules.label(cur.type)} annulé(e)`);
    }
  });
  panel.addEventListener("change", async (ev) => {
    keepOpen();
    if (!ev.target.name || !ev.target.name.startsWith("poop_")) return;
    const cur = store.events().find((x) => x.id === e.id) || e;
    const form = panel.querySelector(".receipt-poop");
    const color = form.querySelector('[name="poop_color"]:checked');
    const texture = form.querySelector('[name="poop_texture"]:checked');
    const data = { ...cur.data };
    if (color) data.poop_color = color.value; else delete data.poop_color;
    if (texture) data.poop_texture = texture.value; else delete data.poop_texture;
    await store.updateEvent(cur.id, { data });
  });
}

export function closePanel() {
  clearTimeout(panelTimer);
  document.querySelectorAll(".receipt").forEach((p) => p.remove());
}

export function toast(message) {
  const t = document.createElement("div");
  t.className = "toast";
  t.setAttribute("role", "status");
  t.textContent = message;
  document.body.append(t);
  setTimeout(() => t.remove(), 3500);
}

export { closeSheet };
