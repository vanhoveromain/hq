// importProgramme.js: "Import from link" on the run of show.
//
// 1. You give the programme's address (web page or PDF).
// 2. Our server reads it with Claude (api/programme.js) and sends back the
//    sessions it found. Nothing is saved yet.
// 3. Review: sessions grouped per day of the programme, each group sent to one
//    of the event's days (matched by date, else in order); tick what to keep.
//    Sessions already in the run of show (same day, time and title) start
//    unticked (their speaker / moderator counts are still filled in when they
//    have none). Sessions with no room go to the room you pick ("main room").
// 4. "Add" creates them as programme lines (never ticked). Undo available.

import * as store from "../storage.js";
import { escapeHtml } from "../utils/html.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { orderedDays, hhmm, stageLabel } from "../rules.js";
import { formatDay } from "../utils/dates.js";

export function openImport(event, onDone) {
  openDialog({
    title: "Import the programme from a link",
    submitLabel: "Read the programme",
    body: `
      <p class="muted small">Paste the address of the event's programme (web page or PDF). It's read automatically;
        you check the sessions before anything is added. Speakers' names are left out.</p>
      <label class="field"><span>Programme link</span>
        <input name="url" type="url" inputmode="url" required placeholder="https://www.example.eu/programme"></label>
      <p class="muted small" data-wait hidden>Reading the programme… this can take up to a minute.</p>`,
    async onSubmit(form) {
      const url = form.url.value.trim();
      if (!/^https:\/\//i.test(url)) throw new Error("Paste a full address starting with https://");
      form.querySelector("[data-wait]").hidden = false;
      try {
        const result = await store.importProgramme(url);
        if (!result.sessions || !result.sessions.length) {
          throw new Error(result.warnings && result.warnings.length ? `No sessions found. ${result.warnings.join(" ")}` : "No sessions found on this page.");
        }
        // Open the review once this pop-up has closed.
        setTimeout(() => openReview(event, result, onDone), 0);
      } finally {
        form.querySelector("[data-wait]").hidden = true;
      }
    },
  });
}

function openReview(event, result, onDone) {
  const days = orderedDays(store.list("days", (d) => d.event_id === event.id));
  const eventDays = days.filter((d) => d.kind === "event");
  const rooms = event.rooms || [];

  // Programme days in order of appearance: key = date or label.
  const groups = [];
  for (const s of result.sessions) {
    const key = s.date || s.day_label || "Programme";
    let g = groups.find((x) => x.key === key);
    if (!g) groups.push(g = { key, date: s.date, label: s.day_label, sessions: [] });
    g.sessions.push(s);
  }
  // Suggested event day: same date, else the n-th event day.
  groups.forEach((g, i) => {
    const byDate = g.date && days.find((d) => d.day === g.date);
    g.dayId = (byDate || eventDays[i] || eventDays[eventDays.length - 1] || days[0]).id;
  });

  const keyOf = (dayId, start, title) => `${dayId}|${start}|${title.trim().toLowerCase()}`;
  const existing = new Map(store.list("ros", (r) => r.event_id === event.id)
    .map((r) => [keyOf(r.day_id, hhmm(r.start_time), r.title), r]));
  const isDup = (g, s) => existing.has(keyOf(g.dayId, s.start, s.title));

  openDialog({
    title: `Programme found · ${result.sessions.length} sessions`,
    submitLabel: "Add ticked sessions",
    body: `
      ${result.event_name ? `<p class="muted small">${escapeHtml(result.event_name)}</p>` : ""}
      ${result.warnings && result.warnings.length ? `<div class="import-warn">${result.warnings.map((w) => `<p>${escapeHtml(w)}</p>`).join("")}</div>` : ""}
      <label class="field"><span>Sessions with no room go to</span>
        <select name="mainRoom"><option value="">— no room</option>${rooms.map((r, i) => `<option ${i === 0 ? "selected" : ""}>${escapeHtml(r)}</option>`).join("")}</select></label>
      ${groups.map((g, gi) => `
        <fieldset class="pick-group import-group">
          <legend>${escapeHtml(g.label || (g.date ? formatDay(g.date) : "Programme"))}${g.date && g.label ? ` · ${escapeHtml(formatDay(g.date))}` : ""}</legend>
          <label class="field import-day"><span>Add to</span><select name="day-${gi}">
            ${days.map((d) => `<option value="${d.id}" ${d.id === g.dayId ? "selected" : ""}>${escapeHtml(d.tabLabel)} · ${escapeHtml(formatDay(d.day))}</option>`).join("")}
          </select></label>
          ${g.sessions.map((s, si) => `
            <label class="pick-row import-row">
              <input type="checkbox" name="s" value="${gi}:${si}" ${isDup(g, s) ? "" : "checked"}>
              <span class="import-time">${escapeHtml(s.start)}${s.end ? `–${escapeHtml(s.end)}` : ""}</span>
              <span>${escapeHtml(s.title)}${s.room ? ` <small class="muted">· ${escapeHtml(s.room)}</small>` : ""}${stageLabel(s) ? ` <small class="people-note">· ${escapeHtml(stageLabel(s))}</small>` : ""}${isDup(g, s) ? ` <small class="muted">· already in the run of show</small>` : ""}</span>
            </label>`).join("")}
        </fieldset>`).join("")}`,
    async onSubmit(form) {
      const picked = [...form.querySelectorAll("input[name=s]:checked")].map((b) => b.value.split(":").map(Number));
      const anyCounts = result.sessions.some((s) => s.speakers != null || s.moderators != null);
      if (!picked.length && !anyCounts) throw new Error("Tick at least one session.");
      const mainRoom = form.mainRoom.value || null;
      const newRooms = [];
      const created = store.batch(() => picked.map(([gi, si], i) => {
        const s = groups[gi].sessions[si];
        // A room written differently from the event's ("plenary") uses the event's spelling.
        const known = s.room && [...rooms, ...newRooms].find((r) => r.toLowerCase() === s.room.toLowerCase());
        if (s.room && !known) newRooms.push(s.room);
        return store.create("ros", {
          event_id: event.id, day_id: form[`day-${gi}`].value, kind: "programme",
          start_time: s.start, end_time: s.end || null, title: s.title.slice(0, 300),
          room: known || s.room || mainRoom, notes: s.notes || null, owner: null, position: i,
          speakers: s.speakers ?? null, moderators: s.moderators ?? null,
        });
      }));
      // Sessions already in the run of show (left unticked): fill in their
      // speaker / moderator counts if they have none yet.
      let counted = 0;
      store.batch(() => groups.forEach((g, gi) => g.sessions.forEach((s) => {
        const line = existing.get(keyOf(form[`day-${gi}`].value, s.start, s.title));
        if (!line || (s.speakers == null && s.moderators == null)) return;
        if (line.speakers != null || line.moderators != null) return;
        store.update("ros", line.id, { speakers: s.speakers ?? null, moderators: s.moderators ?? null });
        counted++;
      })));
      // New rooms from the programme join the event's room list.
      if (newRooms.length) store.update("events", event.id, { rooms: [...rooms, ...newRooms] });
      showToast(`${created.length} sessions added${counted ? ` · speakers counted on ${counted} existing` : ""}`, {
        actionLabel: "Undo",
        onAction: () => { store.batch(() => created.forEach((r) => store.remove("ros", r.id))); onDone(); },
        duration: 10000,
      });
      onDone();
    },
  });
}
