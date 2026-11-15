// export.js: download everything (step 1.11), to keep a copy in Dropbox.
// JSON = complete (re-importable later); CSV = readable in Excel (";" and a
// BOM so Excel in Belgium opens accents and columns right).

import * as rules from "../rules.js";
import { fetchAllEvents, fetchMeasurements, fetchQuestions } from "../storage.js";
import { dayKey, hhmm, shortDate } from "../utils/dates.js";

function download(name, text, type) {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.append(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

const cell = (v) => {
  const s = String(v ?? "");
  return /[";\n\r]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
};

export async function exportAll(home, format) {
  const baby = home.babies[0];
  const [events, measurements, questions] = await Promise.all([
    fetchAllEvents(baby.id), fetchMeasurements(baby.id), fetchQuestions(home.household.id),
  ]);
  const stamp = dayKey();
  if (format === "json") {
    download(`poulette-hq-${stamp}.json`, JSON.stringify({
      exported_at: new Date().toISOString(), household: home.household, baby, members: home.members,
      events, measurements, questions,
    }, null, 2), "application/json");
    return;
  }
  const who = (id) => (home.members.find((m) => m.user_id === id) || {}).display_name || "";
  const lines = [["Date", "Début", "Fin", "Type", "Détail", "Note", "Saisi par", "Supprimé"].join(";")];
  for (const e of events) {
    lines.push([shortDate(e.started_at), hhmm(e.started_at), e.ended_at ? hhmm(e.ended_at) : "", rules.label(e.type),
      rules.summary(e), e.note || "", who(e.created_by), e.deleted_at ? "oui" : ""].map(cell).join(";"));
  }
  lines.push("", ["Mesures", "Poids (g)", "Taille (cm)", "PC (cm)", "Source"].join(";"));
  for (const m of measurements) {
    lines.push([shortDate(m.measured_at), m.weight_g ?? "", m.length_cm ?? "", m.head_cm ?? "", m.source || ""].map(cell).join(";"));
  }
  lines.push("", ["Questions", "Ajoutée", "Posée", "Réponse"].join(";"));
  for (const q of questions) {
    lines.push([q.text, shortDate(q.created_at), q.done_at ? shortDate(q.done_at) : "", q.answer || ""].map(cell).join(";"));
  }
  download(`poulette-hq-${stamp}.csv`, "﻿" + lines.join("\r\n"), "text/csv;charset=utf-8");
}
