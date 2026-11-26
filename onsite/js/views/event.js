// event.js: one event. Header (name, dates, venue, Edit) and two tabs:
//   #/event/<id>/ros    Run of show (per day)      -> build step 4
//   #/event/<id>/pack   Packing list               -> build step 3

import * as store from "../storage.js";
import { escapeHtml, icon } from "../utils/html.js";
import { formatRange } from "../utils/dates.js";
import { eventSpan, orderedDays } from "../rules.js";
import { openEventForm } from "./eventForm.js";
import { showToast } from "../utils/toast.js";

export function render(el, { params }) {
  const [id, tab = "ros"] = params;
  const event = store.get("events", id);
  if (!event) {
    el.innerHTML = store.hasEverSynced()
      ? `<p class="empty">This event doesn't exist (anymore). <a href="#/events">Back to events</a></p>`
      : `<p class="empty">Loading…</p>`;
    return;
  }
  const days = orderedDays(store.list("days", (d) => d.event_id === id));
  const span = eventSpan(days);

  el.innerHTML = `
    <header class="event-head">
      <a class="back" href="#/events">${icon("back")} Events</a>
      <div class="event-title-row">
        <h1 class="event-title">${escapeHtml(event.name)}</h1>
        <button type="button" class="btn secondary small" id="edit-event">${icon("pencil")} Edit</button>
      </div>
      <p class="muted event-meta">${escapeHtml([formatRange(span.start, span.end), event.venue, event.address].filter(Boolean).join(" · "))}</p>
      ${event.notes ? `<p class="event-notes">${escapeHtml(event.notes)}</p>` : ""}
    </header>
    <nav class="tabs" aria-label="Event">
      <a href="#/event/${id}/ros" class="${tab === "ros" ? "active" : ""}">Run of show</a>
      <a href="#/event/${id}/pack" class="${tab === "pack" ? "active" : ""}">Packing list</a>
    </nav>
    <div id="event-body"></div>`;

  const body = el.querySelector("#event-body");
  if (tab === "pack") {
    body.innerHTML = `<p class="placeholder">Packing list: coming in build step 3.</p>`;
  } else {
    body.innerHTML = `
      <p class="placeholder">Run of show: coming in build step 4.</p>
      <p class="muted small">Days: ${days.map((d) => `${escapeHtml(d.tabLabel)} (${escapeHtml(d.day)})`).join(" · ") || "none"}</p>`;
  }

  el.querySelector("#edit-event").addEventListener("click", () => {
    openEventForm({
      event,
      onSaved(saved, removed) {
        if (saved) return;
        location.hash = "#/events";
        showToast(`“${event.name}” deleted`, { actionLabel: "Undo", onAction: () => store.restore(removed) });
      },
    });
  });
}
