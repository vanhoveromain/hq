// editor.js: change or delete one entry (step 1.6). Opened by a tap in the
// Journal, or "Modifier" on the panel shown after a quick entry.
// Every field, the time included; the note is always optional.

import * as store from "../store.js";
import * as rules from "../rules.js";
import { openSheet } from "../utils/sheet.js";
import { escapeHtml } from "../utils/html.js";
import { toLocalInput, fromLocalInput } from "../utils/dates.js";

const options = (map, selected) => Object.entries(map)
  .map(([v, l]) => `<option value="${v}" ${v === selected ? "selected" : ""}>${escapeHtml(l)}</option>`).join("");

function typeFields(e) {
  const d = e.data || {};
  switch (e.type) {
    case "breastfeed": {
      const segs = d.segments || [];
      if (segs.length <= 1) {
        return `<label class="field">Côté<select name="side">${options(rules.SIDES, segs[0] ? segs[0].side : "L")}</select></label>`;
      }
      return `<p class="hint">Côtés : ${escapeHtml(rules.summary(e))} (changer l'heure de début / fin ajuste le premier / dernier côté).</p>`;
    }
    case "bottle":
      return `<div class="field-pair"><label class="field">Quantité (ml)<input name="ml" type="number" inputmode="numeric" min="0" max="500" step="5" value="${d.ml ?? ""}"></label>`
        + `<label class="field">Lait<select name="milk">${options(rules.MILKS, d.milk || "breast")}</select></label></div>`;
    case "pump":
      return `<div class="field-pair"><label class="field">Côté<select name="side">${options({ L: "Gauche", R: "Droite", both: "Les deux" }, d.side || "both")}</select></label>`
        + `<label class="field">Quantité (ml)<input name="ml" type="number" inputmode="numeric" min="0" max="500" step="5" value="${d.ml ?? ""}"></label></div>`;
    case "diaper":
      return `<div class="toggles"><label class="check"><input type="checkbox" name="pee" ${d.pee ? "checked" : ""}> Pipi</label>`
        + `<label class="check"><input type="checkbox" name="poop" ${d.poop ? "checked" : ""}> Caca</label></div>`
        + poopPickers(d);
    case "spit_up":
      return `<div class="field-pair"><label class="field">Type<select name="kind">${options(rules.SPIT_KINDS, d.kind || "spit_up")}</select></label>`
        + `<label class="field">Quantité<select name="size">${options(rules.SPIT_SIZES, d.size || "small")}</select></label></div>`;
    case "temperature":
      return `<label class="field">Température (°C)<input name="celsius" type="number" inputmode="decimal" min="34" max="43" step="0.1" value="${d.celsius ?? ""}"></label>`;
    case "medication":
      return `<div class="field-pair"><label class="field">Médicament<input name="name" maxlength="80" value="${escapeHtml(d.name || "")}"></label>`
        + `<label class="field">Dose<input name="dose" maxlength="40" value="${escapeHtml(d.dose || "")}"></label></div>`;
    default:
      return "";
  }
}

// Colour dots + texture chips (optional). Used here and on the quick panel.
export function poopPickers(d = {}, { compact = false } = {}) {
  const colors = Object.entries(rules.POOP_COLORS).map(([k, c]) =>
    `<label class="dot-choice"><input type="radio" name="poop_color" value="${k}" ${d.poop_color === k ? "checked" : ""}>`
    + `<span class="dot" style="background:${c.hex}"></span><span class="dot-label">${escapeHtml(c.label)}</span></label>`).join("");
  const textures = Object.entries(rules.POOP_TEXTURES).map(([k, l]) =>
    `<label class="chip-choice"><input type="radio" name="poop_texture" value="${k}" ${d.poop_texture === k ? "checked" : ""}><span>${escapeHtml(l)}</span></label>`).join("");
  return `<fieldset class="poop ${compact ? "compact" : ""}"><legend>Couleur (facultatif)</legend><div class="dots">${colors}</div></fieldset>`
    + `<fieldset class="poop ${compact ? "compact" : ""}"><legend>Texture (facultatif)</legend><div class="chips">${textures}</div></fieldset>`;
}

// Radios that can be un-ticked by tapping them again (optional choices).
export function makeRadiosClearable(root) {
  root.querySelectorAll('input[type="radio"]').forEach((input) => {
    input.addEventListener("pointerdown", () => { input.dataset.was = input.checked ? "1" : ""; });
    input.addEventListener("click", () => {
      if (input.dataset.was === "1") { input.checked = false; input.dispatchEvent(new Event("change", { bubbles: true })); }
    });
  });
}

function readData(e, form) {
  const d = { ...(e.data || {}) };
  const num = (name) => (form[name].value === "" ? null : Number(form[name].value));
  switch (e.type) {
    case "bottle": d.ml = num("ml"); d.milk = form.milk.value; break;
    case "pump": d.side = form.side.value; d.ml = num("ml"); break;
    case "diaper": {
      d.pee = form.pee.checked; d.poop = form.poop.checked;
      const color = form.querySelector('[name="poop_color"]:checked');
      const texture = form.querySelector('[name="poop_texture"]:checked');
      if (d.poop && color) d.poop_color = color.value; else delete d.poop_color;
      if (d.poop && texture) d.poop_texture = texture.value; else delete d.poop_texture;
      break;
    }
    case "spit_up": d.kind = form.kind.value; d.size = form.size.value; break;
    case "temperature": d.celsius = num("celsius"); break;
    case "medication": d.name = form.name.value.trim(); d.dose = form.dose.value.trim(); break;
    default: break;
  }
  return d;
}

export function openEditor(event, { members = [] } = {}) {
  const e = event;
  const timer = rules.TYPES[e.type] && rules.TYPES[e.type].timer;
  const who = members.find((m) => m.user_id === e.created_by);
  openSheet({
    title: `${rules.emoji(e.type)} ${rules.label(e.type)}`,
    body: `<form class="form" novalidate>
      <div class="${timer ? "field-pair" : ""}">
        <label class="field">${timer ? "Début" : "Heure"}<input name="started_at" type="datetime-local" required value="${toLocalInput(e.started_at)}"></label>
        ${timer ? `<label class="field">Fin<input name="ended_at" type="datetime-local" value="${e.ended_at ? toLocalInput(e.ended_at) : ""}"></label>` : ""}
      </div>
      ${typeFields(e)}
      <label class="field">Note (facultatif)<textarea name="note" rows="2" maxlength="2000">${escapeHtml(e.note || "")}</textarea></label>
      ${who ? `<p class="hint">Saisi par ${escapeHtml(who.display_name)}</p>` : ""}
      <p class="status" role="status"></p>
      <div class="actions"><button type="button" class="btn danger" data-delete>Supprimer</button>
        <button type="submit" class="btn">Enregistrer</button></div>
    </form>`,
    onOpen(el, close) {
      const form = el.querySelector("form");
      const status = form.querySelector(".status");
      makeRadiosClearable(form);
      form.addEventListener("submit", async (ev) => {
        ev.preventDefault();
        const started = fromLocalInput(form.started_at.value);
        const ended = timer ? fromLocalInput(form.ended_at.value) : null;
        if (!started || (ended && ended < started)) {
          status.className = "status error";
          status.textContent = !started ? "Indique l'heure." : "La fin doit être après le début.";
          return;
        }
        if (!form.checkValidity()) {
          status.className = "status error";
          status.textContent = "Une valeur n'est pas acceptée (vérifie les chiffres).";
          return;
        }
        const data = readData(e, form);
        if (e.type === "breastfeed") data.segments = adjustSegments(e, form, started, ended);
        const patch = { started_at: started, data, note: form.note.value.trim() || null };
        if (timer) patch.ended_at = ended;
        await store.updateEvent(e.id, patch);
        close();
      });
      const del = form.querySelector("[data-delete]");
      del.addEventListener("click", async () => {
        if (del.dataset.confirm !== "1") {
          del.dataset.confirm = "1";
          del.textContent = "Confirmer la suppression";
          return;
        }
        await store.deleteEvent(e.id);
        close();
      });
    },
  });
}

// Keeps a feed's sides in line with a changed start / end.
function adjustSegments(e, form, started, ended) {
  const segs = ((e.data && e.data.segments) || []).map((s) => ({ ...s }));
  if (segs.length <= 1) {
    return [{ side: form.side.value, start: started, end: ended }];
  }
  segs[0].start = started;
  if (ended) segs[segs.length - 1].end = ended;
  return segs;
}
