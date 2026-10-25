// changeSession.js — change what a planned session IS, without adding a new
// one and removing the old one (step 21, Rom's request).
//
//   "Just running" -> a session from the catalogue ("Easy 8k"):
//     you planned the sport before knowing the session; now you know.
//   A catalogue (or custom) session -> "just running" again:
//     the opposite, when the plan becomes open again.
//
// Day, place in the day, status and notes stay as they are. Each change shows
// a toast with Undo, which puts the previous values back exactly.
//
// The two pickers (sport, then a session of that sport) are also used by the
// planner's "+" (pickSessionToAdd), so both look the same.

import { listSessionTemplates, updatePlannedSession } from "../storage.js?v=202610252302";
import { SPORTS, sportIcon, sportLabel } from "../rules.js?v=202610252302";
import { sessionName, isCustomSession, isPlainSession } from "./plan.js?v=202610252302";
import { openSheet } from "./sheet.js?v=202610252302";
import { showToast } from "./toast.js?v=202610252302";
import { escapeHtml } from "./format.js?v=202610252302";

// What a change touches (and what Undo puts back).
const KIND_FIELDS = ["template_id", "sport", "session_type", "title", "details"];

// Race-routine sessions (activation jog, race day) stay as the routine made them.
function isRaceRoutine(session) {
  return session.source === "race_routine" || Boolean(session.race_id);
}

// A planned "just a sport" session -> can get a session from the catalogue.
export function canChooseFromCatalogue(session) {
  return session.status === "planned" && isPlainSession(session) && !isRaceRoutine(session);
}

// A planned catalogue or custom session -> can go back to "just a sport".
export function canClearSession(session) {
  return session.status === "planned" && !isPlainSession(session) && !isRaceRoutine(session);
}

// The catalogue sessions you can pick (archived ones are hidden everywhere).
export async function activeTemplates() {
  return (await listSessionTemplates()).filter((t) => !t.archived);
}

// Step 1: the sport. `extraHtml` = more choices below the list (the planner's
// "+" adds "Custom session"). Returns a sport key, a value from extraHtml, or null.
export function pickSport({ title, templates, extraHtml = "" }) {
  const items = SPORTS.map((sport) => {
    const count = templates.filter((t) => t.sport === sport.key).length;
    const hint = count ? `<span class="muted small"> · ${count} in catalogue</span>` : "";
    return `<button type="button" class="sheet-item" data-value="${sport.key}">${sportIcon(sport.key)} ${escapeHtml(sport.label)}${hint}</button>`;
  }).join("");
  return openSheet({ title, html: `<div class="sheet-list">${items}</div>${extraHtml}` });
}

// Step 2: a session of that sport from the catalogue.
//   withPlain    -> first choice "Just <sport> (no recipe)" (the planner's "+")
//   footerChoice -> the button at the bottom: "back" (← Back) or "other" (Another sport…)
// Returns "sport:<key>", "template:<id>", "back", "other" or null (closed).
export function pickFromSport({ title, sportKey, templates, withPlain = false, footerChoice = "back" }) {
  const items = templates.filter((t) => t.sport === sportKey);
  const label = sportLabel(sportKey).toLowerCase();
  const footer = footerChoice === "other" ? "Another sport…" : "← Back";
  return openSheet({
    title,
    html: `
      ${withPlain ? `<div class="sheet-list">
        <button type="button" class="sheet-item" data-value="sport:${sportKey}">Just ${escapeHtml(label)} (no recipe)</button>
      </div>` : ""}
      <h3 class="sheet-subtitle">From your catalogue</h3>
      <div class="sheet-list">${items.map((t) =>
        `<button type="button" class="sheet-item" data-value="template:${t.id}">${escapeHtml(t.name)}</button>`).join("")
        || `<p class="muted small">Nothing for ${escapeHtml(label)} in your catalogue yet.</p>`}</div>
      <div class="sheet-actions">
        <button type="button" class="button" data-value="${footerChoice}">${footer}</button>
      </div>`,
  });
}

// "Choose from the catalogue": that sport's sessions first, "Another sport…"
// if the plan changed. Returns the chosen recipe, or null.
async function pickTemplateFor(session, templates) {
  let sportKey = session.sport;
  let footerChoice = "other";
  while (true) {
    const choice = await pickFromSport({
      title: `Choose a ${sportLabel(sportKey).toLowerCase()} session`, sportKey, templates, footerChoice,
    });
    if (!choice) return null;
    if (choice.startsWith("template:")) return templates.find((t) => t.id === choice.slice("template:".length)) || null;
    if (choice === "back") {
      // Back from another sport: start again from the session's own sport.
      sportKey = session.sport;
      footerChoice = "other";
      continue;
    }
    // "Another sport…": pick the sport, then its sessions (← Back returns here).
    const other = await pickSport({ title: "Which sport?", templates });
    if (!other) return null;
    sportKey = other;
    footerChoice = "back";
  }
}

// The values a change replaces, to put them back on Undo.
function kindOf(session) {
  return Object.fromEntries(KIND_FIELDS.map((field) => [field, session[field] ?? null]));
}

function offerUndo(message, session, onChange) {
  const before = kindOf(session);
  showToast(message, {
    actionLabel: "Undo",
    onAction: async () => {
      try {
        await updatePlannedSession(session.id, before);
        await onChange();
      } catch (error) {
        showToast("Could not undo: " + error.message);
      }
    },
  });
}

// "Just a sport" -> a catalogue session. `onChange` redraws the screen (also
// after an Undo). `templates` can be passed when already loaded.
// Returns true when the session changed.
export async function chooseFromCatalogue(session, { onChange = () => {}, templates = null } = {}) {
  const list = templates || await activeTemplates();
  const template = await pickTemplateFor(session, list);
  if (!template) return false;
  await updatePlannedSession(session.id, {
    template_id: template.id, sport: template.sport, session_type: template.session_type || null,
    title: null, details: null,
  });
  await onChange();
  offerUndo(`Now: ${template.name}`, session, onChange);
  return true;
}

// A catalogue / custom session -> "just <sport>" again. A custom session's
// content lives on the session itself, so it's asked first (Undo still works).
export async function clearSession(session, { onChange = () => {} } = {}) {
  if (isCustomSession(session)
    && !window.confirm(`Clear "${sessionName(session)}"? Its exercises and details will be removed (just ${sportLabel(session.sport).toLowerCase()}).`)) {
    return false;
  }
  await updatePlannedSession(session.id, { template_id: null, session_type: null, title: null, details: null });
  await onChange();
  offerUndo(`Now: just ${sportLabel(session.sport).toLowerCase()}`, session, onChange);
  return true;
}

// The hint next to "Choose from the catalogue": "4 running sessions".
export function catalogueCountLabel(sportKey, templates) {
  const count = templates.filter((t) => t.sport === sportKey).length;
  return count ? `${count} ${sportLabel(sportKey).toLowerCase()} session${count === 1 ? "" : "s"}` : "";
}
