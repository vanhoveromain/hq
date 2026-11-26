// eventForm.js: new / edit event (pop-up). Name, venue, address, rooms and
// the days: event days from - to, plus an optional setup day and teardown day.
//
// Editing the dates adds / removes days. A removed day that already holds
// run-of-show lines is only removed after a warning (the lines go with it).

import { openDialog } from "../utils/dialog.js";
import { escapeHtml } from "../utils/html.js";
import { addDays, formatDay } from "../utils/dates.js";
import { DEFAULT_ROOMS, parseRooms } from "../rules.js";
import * as store from "../storage.js";

export function openEventForm({ event = null, onSaved } = {}) {
  const days = event ? store.list("days", (d) => d.event_id === event.id) : [];
  const eventDays = days.filter((d) => d.kind === "event").map((d) => d.day).sort();
  const setup = days.find((d) => d.kind === "setup");
  const teardown = days.find((d) => d.kind === "teardown");
  const rooms = event ? event.rooms || [] : DEFAULT_ROOMS;
  let warnedAbout = "";

  openDialog({
    title: event ? "Edit event" : "New event",
    submitLabel: event ? "Save" : "Create",
    body: `
      <label class="field"><span>Event name</span>
        <input name="name" required maxlength="200" value="${escapeHtml(event?.name)}" placeholder="Blockchain for Europe Summit 2026"></label>
      <div class="field-row">
        <label class="field"><span>Venue</span>
          <input name="venue" maxlength="200" value="${escapeHtml(event?.venue)}" placeholder="Sparks"></label>
        <label class="field"><span>Address</span>
          <input name="address" maxlength="300" value="${escapeHtml(event?.address)}" placeholder="Rue Ravenstein 60, 1000 Brussels"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>First event day</span>
          <input type="date" name="first" required value="${escapeHtml(eventDays[0] || "")}"></label>
        <label class="field"><span>Last event day</span>
          <input type="date" name="last" value="${escapeHtml(eventDays[eventDays.length - 1] || "")}"></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Setup day <small class="muted">(optional)</small></span>
          <input type="date" name="setup" value="${escapeHtml(setup?.day || "")}"></label>
        <label class="field"><span>Teardown day <small class="muted">(optional)</small></span>
          <input type="date" name="teardown" value="${escapeHtml(teardown?.day || "")}"></label>
      </div>
      <label class="field"><span>Rooms <small class="muted">(one per line or separated by commas)</small></span>
        <textarea name="rooms" rows="4">${escapeHtml(rooms.join("\n"))}</textarea></label>
      <label class="field"><span>Notes <small class="muted">(contacts, Wi-Fi, access…)</small></span>
        <textarea name="notes" rows="3" maxlength="10000">${escapeHtml(event?.notes)}</textarea></label>`,
    onOpen(form) {
      // Setup day: suggest the day before, once the first day is picked.
      form.first.addEventListener("change", () => {
        if (!form.last.value || form.last.value < form.first.value) form.last.value = form.first.value;
        if (!event && !form.setup.value && form.first.value) form.setup.value = addDays(form.first.value, -1);
      });
    },
    async onSubmit(form) {
      const name = form.name.value.trim();
      const first = form.first.value;
      const last = form.last.value || first;
      if (!name) throw new Error("Give the event a name.");
      if (!first) throw new Error("Pick the first event day.");
      if (last < first) throw new Error("The last event day is before the first one.");
      if (daysBetween(first, last) > 14) throw new Error("More than 14 event days: check the dates.");

      // The days the event should have: date -> kind.
      const wanted = new Map();
      for (let d = first; d <= last; d = addDays(d, 1)) wanted.set(d, "event");
      for (const [field, kind] of [["setup", "setup"], ["teardown", "teardown"]]) {
        const value = form[field].value;
        if (!value) continue;
        if (wanted.has(value)) throw new Error(`The ${kind} day can't be an event day.`);
        wanted.set(value, kind);
      }

      // Days that disappear and still hold lines: warn once.
      const dropping = days.filter((d) => !wanted.has(d.day));
      const lines = store.list("ros", (r) => dropping.some((d) => d.id === r.day_id)).length;
      const key = dropping.map((d) => d.day).join(",");
      if (lines && warnedAbout !== key) {
        warnedAbout = key;
        throw new Error(`${dropping.map((d) => formatDay(d.day)).join(", ")} will be removed with its ${lines} run-of-show line${lines > 1 ? "s" : ""}. Save again to confirm.`);
      }

      const fields = {
        name,
        venue: form.venue.value.trim() || null,
        address: form.address.value.trim() || null,
        rooms: parseRooms(form.rooms.value),
        notes: form.notes.value.trim() || null,
      };
      const saved = store.batch(() => {
        const ev = event ? (store.update("events", event.id, fields), { ...event, ...fields }) : store.create("events", fields);
        for (const d of dropping) store.remove("days", d.id);
        for (const [day, kind] of wanted) {
          const existing = days.find((d) => d.day === day);
          if (!existing) store.create("days", { event_id: ev.id, day, kind });
          else if (existing.kind !== kind) store.update("days", existing.id, { kind });
        }
        return ev;
      });
      if (onSaved) onSaved(saved);
    },
    actions: event ? [{
      label: "Delete event",
      kind: "danger",
      confirm: "Click again: delete everything",
      onClick() {
        const removed = store.remove("events", event.id);
        if (onSaved) onSaved(null, removed);
      },
    }] : [],
  });
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b) - Date.parse(a)) / 86400000);
}
