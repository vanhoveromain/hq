// ros.js: an event's run of show (tab "Run of show"), one day at a time.
//   #/event/<id>/ros/<day id>
//
// One screen for building it and for running it on site:
//   - Day tabs: Setup · Day 1 · Day 2 · Teardown.
//   - On the day itself (Brussels time), or with "Preview live" at a chosen
//     time: big NOW and NEXT cards on top (what's on stage, what you have to
//     do, what comes next and in how long), a "now" line in the timeline, the
//     screen stays on (Wake Lock), refresh every 30 s.
//   - Timeline: programme lines (on stage, never ticked, shaded) and tasks
//     (ticked). Unticked tasks past their time are red.
//   - Tap a line = edit / move to another day / delete (Undo). Quick add at the
//     bottom (Enter adds, the field stays ready for the next one). "Paste lines"
//     turns a pasted list (from the programme, Excel, Word) into lines.
//     "Import from link" reads a programme page / PDF (views/importProgramme.js).
//   - Filters: kind, owner, room. "Live view" hides everything else (iPad).

import * as store from "../storage.js";
import { escapeHtml, icon } from "../utils/html.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { brusselsToday, formatDay } from "../utils/dates.js";
import { openImport } from "./importProgramme.js";
import { OWNERS, DEFAULT_OWNER, orderedDays, hhmm, brusselsNow, minutesBetween, sortLines, programmeEnd, parsePastedLines } from "../rules.js";

const ui = { kind: "all", owner: "", room: "", previewAt: null, scrolledFor: null, quickKind: "task" };
let clock = null;
let wakeLock = null;

export function leave() {
  clearInterval(clock);
  clock = null;
  releaseWakeLock();
  document.body.classList.remove("is-live");
}

export function render(el, event, dayParam) {
  const days = orderedDays(store.list("days", (d) => d.event_id === event.id));
  if (!days.length) {
    el.innerHTML = `<p class="empty">This event has no days yet. Use “Edit” to set its dates.</p>`;
    return;
  }
  const today = brusselsToday();
  const day = days.find((d) => d.id === dayParam)
    || days.find((d) => d.day === today)
    || days.find((d) => d.day > today)
    || days[0];
  const isToday = day.day === today;
  const live = isToday || Boolean(ui.previewAt);
  const now = ui.previewAt || brusselsNow();

  const all = sortLines(store.list("ros", (r) => r.day_id === day.id));
  const lines = all.filter((r) =>
    (ui.kind === "all" || r.kind === ui.kind)
    && (!ui.owner || r.owner === ui.owner)
    && (!ui.room || r.room === ui.room));
  const owners = [...new Set(all.map((r) => r.owner).filter(Boolean))];
  const rooms = [...new Set([...(event.rooms || []), ...all.map((r) => r.room).filter(Boolean)])];
  const tasks = all.filter((r) => r.kind === "task");
  const done = tasks.filter((r) => r.done_at).length;

  el.innerHTML = `
    <div class="ros-bar">
      <nav class="day-tabs" aria-label="Days">
        ${days.map((d) => `<a href="#/event/${event.id}/ros/${d.id}" class="${d.id === day.id ? "active" : ""}">
          <b>${escapeHtml(d.tabLabel)}</b><small>${escapeHtml(shortDay(d.day))}${d.day === today ? " · today" : ""}</small></a>`).join("")}
      </nav>
      <div class="btn-row">
        ${isToday ? "" : `<button type="button" class="btn secondary small" data-preview>${ui.previewAt ? `Preview ${ui.previewAt} · stop` : "Preview live"}</button>`}
        <button type="button" class="btn small" data-live>${document.body.classList.contains("is-live") ? "Exit live view" : "Live view"}</button>
      </div>
    </div>
    ${ui.previewAt && !isToday ? `<p class="preview-note">Preview: ${escapeHtml(day.tabLabel)} at ${escapeHtml(ui.previewAt)} — <button type="button" class="linklike" data-preview-time>change time</button></p>` : ""}
    ${live ? liveCardsHtml(all, now) : ""}
    <div class="ros-tools">
      <div class="chips" role="group" aria-label="Show">
        ${[["all", "All"], ["task", `Tasks · ${done}/${tasks.length}`], ["programme", "Programme"]].map(([v, l]) =>
          `<button type="button" class="chip${ui.kind === v ? " active" : ""}" data-kind="${v}">${escapeHtml(l)}</button>`).join("")}
        ${owners.length ? `<select class="chip-select" data-filter-owner aria-label="Owner"><option value="">Everyone</option>${owners.map((o) => `<option ${o === ui.owner ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select>` : ""}
        ${rooms.length ? `<select class="chip-select" data-filter-room aria-label="Room"><option value="">All rooms</option>${rooms.map((r) => `<option ${r === ui.room ? "selected" : ""}>${escapeHtml(r)}</option>`).join("")}</select>` : ""}
      </div>
      <div class="btn-row">
        <button type="button" class="btn secondary small" data-import>Import from link</button>
        <button type="button" class="btn secondary small" data-paste>Paste lines</button>
      </div>
    </div>
    <ol class="timeline">
      ${timelineHtml(lines, live ? now : null)}
    </ol>
    ${all.length && !lines.length ? `<p class="empty">Nothing matches these filters.</p>` : ""}
    ${all.length ? "" : `<p class="empty">No lines yet for ${escapeHtml(day.tabLabel)}. Import the programme from its link, add lines below, or use “Paste lines”.</p>`}
    <form class="quick-add" autocomplete="off">
      <div class="seg" role="group" aria-label="Kind">
        <button type="button" data-qkind="task" aria-pressed="${ui.quickKind === "task"}">Task</button>
        <button type="button" data-qkind="programme" aria-pressed="${ui.quickKind === "programme"}">Programme</button>
      </div>
      <input name="start" type="time" required aria-label="Start" value="${escapeHtml(suggestTime(all))}">
      <input name="end" type="time" aria-label="End (optional)">
      <input name="title" required maxlength="300" placeholder="${ui.quickKind === "task" ? "Task, e.g. Mic check plenary" : "Session, e.g. Keynote"}" aria-label="Title">
      <button type="submit" class="btn">${icon("plus")} Add</button>
    </form>`;

  wire(el, event, day, all);

  // On the day: scroll to "now" once per day opened.
  if (live && ui.scrolledFor !== day.id) {
    ui.scrolledFor = day.id;
    const marker = el.querySelector(".now-line") || el.querySelector(".live-cards");
    if (marker && !el.querySelector(".live-cards")) marker.scrollIntoView({ block: "center" });
  }

  clearInterval(clock);
  clock = live ? setInterval(() => {
    const typing = document.activeElement && el.contains(document.activeElement) && document.activeElement.matches("input, textarea, select");
    if (!typing && !document.querySelector("dialog[open]") && el.isConnected) render(el, event, day.id);
  }, 30000) : null;
  if (live) requestWakeLock(); else releaseWakeLock();
}


// ---------------------------------------------------------------------
// NOW / NEXT
// ---------------------------------------------------------------------

function liveCardsHtml(all, now) {
  const programme = all.filter((r) => r.kind === "programme");
  const onStage = programme.filter((p) => hhmm(p.start_time) <= now && now < programmeEnd(p, programme));
  const toDo = all.filter((r) => r.kind === "task" && !r.done_at && hhmm(r.start_time) <= now);
  const upcoming = all.filter((r) => hhmm(r.start_time) > now && !(r.kind === "task" && r.done_at)).slice(0, 4);

  return `<div class="live-cards">
    <section class="live-card now">
      <header><span class="live-label">Now</span><span class="live-clock">${escapeHtml(now)}</span></header>
      ${onStage.length ? onStage.map((p) => `
        <div class="stage">
          <span class="stage-title">${escapeHtml(p.title)}</span>
          <span class="muted">${escapeHtml([p.room, `until ${programmeEnd(p, programme)}`].filter(Boolean).join(" · "))}</span>
        </div>`).join("") : `<p class="muted">Nothing on stage.</p>`}
      ${toDo.length ? `<h4>To do now · ${toDo.length}</h4><ul class="live-tasks">${toDo.slice(0, 5).map((t) => liveTaskHtml(t, now)).join("")}</ul>
        ${toDo.length > 5 ? `<p class="muted small">+ ${toDo.length - 5} more in the timeline</p>` : ""}`
        : `<p class="all-clear">${icon("check")} Nothing waiting</p>`}
    </section>
    <section class="live-card next">
      <header><span class="live-label">Next</span></header>
      ${upcoming.length ? `<ul class="live-next">${upcoming.map((r) => `
        <li class="${r.kind}">
          <span class="in">${escapeHtml(inMinutes(now, hhmm(r.start_time)))}</span>
          <span class="next-text"><b>${escapeHtml(r.title)}</b>
            <small>${escapeHtml([timeRange(r), r.kind === "task" ? r.owner : null, r.room].filter(Boolean).join(" · "))}</small></span>
          ${r.kind === "task" ? tickHtml(r) : ""}
        </li>`).join("")}</ul>` : `<p class="muted">Nothing more today.</p>`}
    </section>
  </div>`;
}

function liveTaskHtml(t, now) {
  const late = isLate(t, now);
  return `<li class="${late ? "is-late" : ""}">
    ${tickHtml(t)}
    <button type="button" class="line-open" data-edit="${t.id}">
      <b>${escapeHtml(t.title)}</b>
      <small>${escapeHtml([timeRange(t), t.owner, t.room].filter(Boolean).join(" · "))}${late ? " · late" : ""}</small>
    </button>
  </li>`;
}


// ---------------------------------------------------------------------
// Timeline
// ---------------------------------------------------------------------

function timelineHtml(lines, now) {
  let markerDone = !now;
  const out = [];
  for (const r of lines) {
    if (!markerDone && hhmm(r.start_time) > now) {
      out.push(`<li class="now-line"><span>${escapeHtml(now)}</span></li>`);
      markerDone = true;
    }
    const late = now && r.kind === "task" && isLate(r, now);
    out.push(`<li class="line ${r.kind}${r.done_at ? " is-done" : ""}${late ? " is-late" : ""}">
      <span class="line-time">${escapeHtml(hhmm(r.start_time))}${r.end_time ? `<small>${escapeHtml(hhmm(r.end_time))}</small>` : ""}</span>
      <button type="button" class="line-open" data-edit="${r.id}">
        <b>${escapeHtml(r.title)}</b>
        ${r.notes ? `<small class="line-notes">${escapeHtml(r.notes)}</small>` : ""}
        <span class="line-tags">
          ${r.kind === "programme" ? `<span class="pill">Programme</span>` : ""}
          ${r.owner ? `<span class="pill owner">${escapeHtml(r.owner)}</span>` : ""}
          ${r.room ? `<span class="pill">${escapeHtml(r.room)}</span>` : ""}
          ${late ? `<span class="pill late">Late</span>` : ""}
        </span>
      </button>
      ${r.kind === "task" ? tickHtml(r) : `<span class="tick-slot"></span>`}
    </li>`);
  }
  if (!markerDone && lines.length) out.push(`<li class="now-line"><span>${escapeHtml(now)}</span></li>`);
  return out.join("");
}

function tickHtml(r) {
  return `<button type="button" class="tick" data-tick="${r.id}" aria-pressed="${Boolean(r.done_at)}" aria-label="Done: ${escapeHtml(r.title)}">${icon("check")}</button>`;
}


// ---------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------

function wire(el, event, day, all) {
  const redraw = () => render(el, event, day.id);

  el.onclick = (e) => {
    const t = e.target.closest("button");
    if (!t || t.type === "submit") return;
    if (t.dataset.kind) { ui.kind = t.dataset.kind; return redraw(); }
    if (t.dataset.qkind) {
      // Switching Task / Programme keeps what was already typed.
      const f = el.querySelector(".quick-add");
      const typed = { start: f.start.value, end: f.end.value, title: f.title.value };
      ui.quickKind = t.dataset.qkind;
      redraw();
      const g = el.querySelector(".quick-add");
      Object.assign(g.start, { value: typed.start }); g.end.value = typed.end; g.title.value = typed.title;
      g.title.focus();
      return;
    }
    if (t.dataset.tick) {
      const line = store.get("ros", t.dataset.tick);
      const doneAt = line.done_at ? null : new Date().toISOString();
      store.update("ros", line.id, { done_at: doneAt });
      if (doneAt) showToast(`Done: ${line.title}`, { actionLabel: "Undo", onAction: () => { store.update("ros", line.id, { done_at: null }); redraw(); } });
      return redraw();
    }
    if (t.dataset.edit) return openLineForm(event, day, store.get("ros", t.dataset.edit), redraw);
    if ("paste" in t.dataset) return openPaste(event, day, redraw);
    if ("import" in t.dataset) return openImport(event, redraw);
    if ("live" in t.dataset) {
      document.body.classList.toggle("is-live");
      window.scrollTo(0, 0);
      return redraw();
    }
    if ("preview" in t.dataset) {
      if (ui.previewAt) { ui.previewAt = null; return redraw(); }
      return askPreviewTime(redraw);
    }
    if ("previewTime" in t.dataset) return askPreviewTime(redraw);
  };

  for (const [sel, key] of [["[data-filter-owner]", "owner"], ["[data-filter-room]", "room"]]) {
    const select = el.querySelector(sel);
    if (select) select.onchange = () => { ui[key] = select.value; redraw(); };
  }

  const form = el.querySelector(".quick-add");
  form.onsubmit = (e) => {
    e.preventDefault();
    const title = form.title.value.trim();
    const start = form.start.value;
    if (!start) return form.start.focus();
    if (!title) return form.title.focus();
    const kind = ui.quickKind;
    store.create("ros", {
      event_id: event.id, day_id: day.id, kind, title,
      start_time: start, end_time: form.end.value || null,
      owner: kind === "task" ? DEFAULT_OWNER : null,
      room: ui.room || null,
      position: all.filter((r) => hhmm(r.start_time) === start).length,
    });
    redraw();
    // Ready for the next line: same start time, title empty.
    const next = el.querySelector(".quick-add");
    next.start.value = start;
    next.title.focus();
  };
}

function askPreviewTime(redraw) {
  openDialog({
    title: "Preview the live view",
    submitLabel: "Preview",
    body: `<p class="muted small">See the Now / Next cards as they will look at this time on this day. Nothing is changed.</p>
      <label class="field"><span>Time</span><input name="at" type="time" required value="${escapeHtml(ui.previewAt || "09:15")}"></label>`,
    async onSubmit(form) {
      if (!form.at.value) throw new Error("Pick a time.");
      ui.previewAt = form.at.value;
      ui.scrolledFor = null;
      redraw();
    },
  });
}

function openLineForm(event, day, line, redraw) {
  const days = orderedDays(store.list("days", (d) => d.event_id === event.id));
  const rooms = [...new Set([...(event.rooms || []), line.room].filter(Boolean))];
  const owners = [...new Set([...OWNERS, line.owner].filter(Boolean))];
  openDialog({
    title: line.kind === "task" ? "Task" : "Programme line",
    body: `
      <div class="seg" role="radiogroup" aria-label="Kind">
        <label><input type="radio" name="kind" value="task" ${line.kind === "task" ? "checked" : ""}> Task (ticked)</label>
        <label><input type="radio" name="kind" value="programme" ${line.kind === "programme" ? "checked" : ""}> Programme (on stage)</label>
      </div>
      <label class="field"><span>Title</span><input name="title" required maxlength="300" value="${escapeHtml(line.title)}"></label>
      <div class="field-row">
        <label class="field"><span>Start</span><input name="start" type="time" required value="${escapeHtml(hhmm(line.start_time))}"></label>
        <label class="field"><span>End <small class="muted">(optional)</small></span><input name="end" type="time" value="${escapeHtml(hhmm(line.end_time))}"></label>
        <label class="field"><span>Day</span><select name="day">${days.map((d) => `<option value="${d.id}" ${d.id === line.day_id ? "selected" : ""}>${escapeHtml(d.tabLabel)} · ${escapeHtml(shortDay(d.day))}</option>`).join("")}</select></label>
      </div>
      <div class="field-row">
        <label class="field"><span>Owner</span><select name="owner"><option value="">—</option>${owners.map((o) => `<option ${o === line.owner ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}</select></label>
        <label class="field"><span>Room</span><select name="room"><option value="">—</option>${rooms.map((r) => `<option ${r === line.room ? "selected" : ""}>${escapeHtml(r)}</option>`).join("")}</select></label>
      </div>
      <label class="field"><span>Notes / contact</span><textarea name="notes" rows="3" maxlength="5000">${escapeHtml(line.notes)}</textarea></label>
      ${line.done_at ? `<p class="muted small">Ticked at ${escapeHtml(new Date(line.done_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" }))}.</p>` : ""}`,
    async onSubmit(form) {
      const title = form.title.value.trim();
      if (!title) throw new Error("Give the line a title.");
      if (!form.start.value) throw new Error("Pick a start time.");
      const kind = form.kind.value;
      store.update("ros", line.id, {
        kind, title, start_time: form.start.value, end_time: form.end.value || null,
        day_id: form.day.value, owner: form.owner.value || null, room: form.room.value || null,
        notes: form.notes.value.trim() || null,
        ...(kind === "programme" ? { done_at: null } : {}),
      });
      redraw();
    },
    actions: [{
      label: "Delete", kind: "danger", confirm: "Click again to delete",
      onClick() {
        const removed = store.remove("ros", line.id);
        showToast(`“${line.title}” deleted`, { actionLabel: "Undo", onAction: () => { store.restore(removed); redraw(); } });
        redraw();
      },
    }],
  });
}

function openPaste(event, day, redraw) {
  const rooms = event.rooms || [];
  const owners = OWNERS;
  openDialog({
    title: `Paste lines · ${day.tabLabel}`,
    submitLabel: "Add lines",
    body: `
      <p class="muted small">One line each: <code>09:00 - 09:20 Keynote</code> or <code>09:00 Open the doors</code>.
        From Excel: columns start · end · title · owner · room · notes. A line without a time is added to the notes of the line above.</p>
      <label class="field"><span>Lines</span><textarea name="text" rows="10" placeholder="09:00 - 09:20 Keynote&#10;09:20 - 10:05 Panel: MiCA is here"></textarea></label>
      <div class="field-row">
        <label class="field"><span>Add as</span><select name="kind"><option value="programme">Programme (on stage)</option><option value="task">Tasks (ticked)</option></select></label>
        <label class="field"><span>Room <small class="muted">(if not in the text)</small></span><select name="room"><option value="">—</option>${rooms.map((r) => `<option>${escapeHtml(r)}</option>`).join("")}</select></label>
        <label class="field"><span>Owner <small class="muted">(if not in the text)</small></span><select name="owner">${owners.map((o) => `<option ${o === DEFAULT_OWNER ? "selected" : ""}>${escapeHtml(o)}</option>`).join("")}<option value="">— nobody</option></select></label>
      </div>
      <p class="paste-preview muted small" aria-live="polite"></p>`,
    onOpen(form) {
      // Programme lines usually have no owner: switching the kind picks
      // "nobody" / you again (still changeable).
      form.kind.addEventListener("change", () => {
        form.owner.value = form.kind.value === "task" ? DEFAULT_OWNER : "";
      });
      form.owner.value = form.kind.value === "task" ? DEFAULT_OWNER : "";
      const preview = form.querySelector(".paste-preview");
      form.text.addEventListener("input", () => {
        const { lines, skipped } = parsePastedLines(form.text.value);
        preview.textContent = lines.length ? `${lines.length} line${lines.length > 1 ? "s" : ""} found${skipped.length ? ` · ${skipped.length} not understood (no time at the start)` : ""}.` : "";
      });
    },
    async onSubmit(form) {
      const { lines, skipped } = parsePastedLines(form.text.value);
      if (!lines.length) throw new Error(skipped.length ? `No time found at the start of the lines (e.g. “${skipped[0].slice(0, 40)}”).` : "Paste at least one line.");
      const kind = form.kind.value;
      store.batch(() => lines.forEach((l, i) => store.create("ros", {
        event_id: event.id, day_id: day.id, kind,
        start_time: l.start, end_time: l.end, title: l.title,
        owner: l.owner || form.owner.value || null,
        room: l.room || form.room.value || null,
        notes: l.notes, position: i,
      })));
      showToast(`${lines.length} lines added to ${day.tabLabel}`);
      redraw();
    },
  });
}


// ---------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------

function isLate(t, now) {
  if (t.done_at) return false;
  return t.end_time ? hhmm(t.end_time) <= now : hhmm(t.start_time) < now;
}
function timeRange(r) {
  return r.end_time ? `${hhmm(r.start_time)}–${hhmm(r.end_time)}` : hhmm(r.start_time);
}
function inMinutes(now, at) {
  const m = minutesBetween(now, at);
  if (m < 60) return `in ${m} min`;
  return `in ${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`;
}
function shortDay(day) {
  return formatDay(day).replace(/ \d{4}$/, "");
}
// Quick add's time: the last line's start (people add in order).
function suggestTime(all) {
  return all.length ? hhmm(all[all.length - 1].start_time) : "08:00";
}

async function requestWakeLock() {
  if (wakeLock || !("wakeLock" in navigator)) return;
  try {
    wakeLock = await navigator.wakeLock.request("screen");
    wakeLock.addEventListener("release", () => { wakeLock = null; });
  } catch { /* not allowed now (e.g. tab hidden): tried again on the next refresh */ }
}
function releaseWakeLock() {
  if (wakeLock) wakeLock.release().catch(() => {});
  wakeLock = null;
}
