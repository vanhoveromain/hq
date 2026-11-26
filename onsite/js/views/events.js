// events.js: Home. Your events, coming up first (soonest on top), then past
// ones (most recent on top). "+ New event" opens the form.

import * as store from "../storage.js";
import { escapeHtml, icon } from "../utils/html.js";
import { formatRange, brusselsToday } from "../utils/dates.js";
import { eventSpan } from "../rules.js";
import { openEventForm } from "./eventForm.js";

export function render(el) {
  const today = brusselsToday();
  const events = store.list("events", (e) => !e.is_template).map((e) => {
    const span = eventSpan(store.list("days", (d) => d.event_id === e.id));
    return { ...e, ...span };
  });
  const upcoming = events.filter((e) => !e.end || e.end >= today)
    .sort((a, b) => (a.start || "9999").localeCompare(b.start || "9999"));
  const past = events.filter((e) => e.end && e.end < today)
    .sort((a, b) => b.start.localeCompare(a.start));

  const firstRun = !events.length && !store.hasEverSynced();

  el.innerHTML = `
    <div class="section-head">
      <h2 class="section-title">Coming up</h2>
      <button type="button" class="btn small" id="new-event">${icon("plus")} New event</button>
    </div>
    ${firstRun ? `<p class="empty">Loading your events…</p>`
      : upcoming.length ? `<ul class="cards">${upcoming.map((e) => cardHtml(e, today)).join("")}</ul>`
      : `<p class="empty">No event coming up. Create one with “New event”.</p>`}
    ${past.length ? `
      <details class="past">
        <summary class="section-title">Past events · ${past.length}</summary>
        <ul class="cards">${past.map((e) => cardHtml(e, today)).join("")}</ul>
      </details>` : ""}`;

  el.querySelector("#new-event").addEventListener("click", () => {
    openEventForm({ onSaved: (ev) => { if (ev) location.hash = `#/event/${ev.id}`; } });
  });
}

function cardHtml(e, today) {
  const live = e.start && e.start <= today && e.end >= today;
  const packCount = store.list("pack", (p) => p.event_id === e.id).length;
  const rosCount = store.list("ros", (r) => r.event_id === e.id).length;
  return `<li><a class="card${live ? " is-live" : ""}" href="#/event/${e.id}">
    ${live ? `<span class="pill live">On site now</span>` : ""}
    <span class="card-name">${escapeHtml(e.name)}</span>
    <span class="card-date">${escapeHtml(formatRange(e.start, e.end) || "No dates yet")}</span>
    ${e.venue ? `<span class="card-date">${escapeHtml(e.venue)}</span>` : ""}
    <span class="card-tags">
      <span class="pill">${rosCount} run-of-show line${rosCount === 1 ? "" : "s"}</span>
      <span class="pill">${packCount} item${packCount === 1 ? "" : "s"} to pack</span>
    </span>
  </a></li>`;
}
