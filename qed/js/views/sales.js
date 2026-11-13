// sales.js: Sales (#/sales/<tab>), your sales leads.
//
// Leads are projects of type "sales" (they only use Sales status: Lead,
// Improvements, Confirmed, Declined; a confirmed lead simply stays a lead).
// Tabs: Open · To reach out · Confirmed · Declined · All (SALES_TABS in
// rules.js). Newest first; "To reach out" soonest first.
// Reach out date = created + 1 year, or a date you pick (tap it on the row):
// highlighted once it has come. "+ Add to list" (To reach out tab) puts any
// name on the list, an existing lead or a new one; "Reached out" moves the
// next reach-out to a year later.
// Sales status changes in place (a menu on the row); the name opens the lead.

import { listProjects, updateProject, createProject, listOpenTasksOf, createTask, listMeetingNames } from "../storage.js";
import { openTaskSheet } from "./taskSheet.js";
import { rolledHtml } from "./taskList.js";
import { SALES_TABS, SALES_STATUSES, labelOf, reachOutDate, oneYearAfter } from "../rules.js";
import { openDialog } from "../utils/dialog.js";
import { openProjectForm } from "./projectForm.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon, showActiveTab } from "../utils/html.js";
import { brusselsToday, brusselsDayOf, formatDay, formatRange, friendlyDay, addDays } from "../utils/dates.js";

export async function render(el, { params = [] } = {}) {
  const tab = SALES_TABS.find((t) => t.id === params[0]) || SALES_TABS[0];
  const today = brusselsToday();
  if (!el.querySelector(".sales")) el.innerHTML = `<p class="muted">Loading…</p>`;

  let leads;
  let openTasks;
  let meetingNames = [];
  try {
    leads = (await listProjects()).filter((p) => p.type === "sales");
    [openTasks, meetingNames] = await Promise.all([
      listOpenTasksOf(leads.map((l) => l.id)),
      listMeetingNames().catch(() => []),
    ]);
  } catch (error) {
    el.innerHTML = `<p class="error">Could not load your leads: ${escapeHtml(error.message)}</p>`;
    return;
  }
  for (const lead of leads) {
    lead.created_day = brusselsDayOf(lead.created_at);
    lead.reach_out = reachOutDate(lead.created_day, lead.reach_out_on);
    // Next step (UX review #16) = the lead's first open task: earliest due
    // date, undated last. It's a normal task, so it's in Priorities too.
    lead.next = openTasks
      .filter((t) => t.project_id === lead.id)
      .sort((a, b) => (a.due_date || "9999").localeCompare(b.due_date || "9999"))[0] || null;
  }
  const redraw = () => render(el, { params });
  const counts = Object.fromEntries(SALES_TABS.map((t) => [t.id, leads.filter((l) => t.filter(l, today)).length]));
  const shown = leads
    .filter((l) => tab.filter(l, today))
    .sort(tab.id === "reach-out"
      ? (a, b) => a.reach_out.localeCompare(b.reach_out)
      : (a, b) => b.created_at.localeCompare(a.created_at));

  document.title = "Sales · QED HQ";
  el.innerHTML = `
    <div class="sales">
      <div class="section-head">
        <nav class="tabs sales-tabs" aria-label="Lead tabs">
          ${SALES_TABS.map((t) => `<a href="#/sales/${t.id}" class="${t === tab ? "active" : ""}"${t === tab ? ' aria-current="page"' : ""}>${escapeHtml(t.label)} <span class="count">${counts[t.id]}</span></a>`).join("")}
        </nav>
        <span class="sales-actions">
          ${tab.id === "reach-out" ? `<button type="button" class="btn secondary small" id="add-reach">${icon("plus")} Add to list</button>` : ""}
          <button type="button" class="btn small" id="new-lead">${icon("plus")} New lead</button>
        </span>
      </div>
      ${shown.length ? `
        <ul class="lead-list">
          <li class="lead-head" aria-hidden="true"><span>Lead</span><span>Next step</span><span>Event date</span><span>Sales status</span><span>Created</span><span>Reach out</span></li>
          ${shown.map((l) => leadRowHtml(l, today, tab.id === "reach-out")).join("")}
        </ul>` : `<p class="empty">${tab.id === "reach-out" ? "No lead to reach out to again yet." : "No leads here."}</p>`}
    </div>`;
  showActiveTab(el);

  const newLead = el.querySelector("#new-lead");
  if (newLead) {
    newLead.addEventListener("click", () => {
      openProjectForm({ defaults: { type: "sales", status: null, sales_status: "lead" }, onChange: redraw });
    });
  }
  const addReach = el.querySelector("#add-reach");
  if (addReach) addReach.addEventListener("click", () => openAddToList(leads, today, redraw));

  // Next step: tap it to open the task; "+ Next step" adds one.
  el.querySelectorAll("[data-next]").forEach((button) => {
    button.addEventListener("click", () => {
      const lead = leads.find((l) => l.id === button.closest("[data-lead]").dataset.lead);
      if (lead.next) openTaskSheet(lead.next, { onChange: redraw, meetingNames });
      else openNextStep(lead, today, redraw);
    });
  });

  // Reach out date: tap it to pick another day; empty = automatic again.
  el.querySelectorAll("[data-lead] .reach-chip").forEach((chip) => {
    const input = chip.querySelector("input");
    chip.addEventListener("click", (event) => {
      if (event.target === input) return;
      event.preventDefault();
      try { input.showPicker(); } catch { input.focus(); }
    });
    input.addEventListener("change", () => {
      const lead = leads.find((l) => l.id === chip.closest("[data-lead]").dataset.lead);
      setReachOut(lead, input.value || null, redraw);
    });
  });

  // "Reached out": the next reach-out is a year from today.
  el.querySelectorAll("[data-reached]").forEach((button) => {
    button.addEventListener("click", () => {
      const lead = leads.find((l) => l.id === button.closest("[data-lead]").dataset.lead);
      setReachOut(lead, oneYearAfter(today), redraw, `Next reach-out for "${lead.name}": ${formatDay(oneYearAfter(today))}`);
    });
  });

  // Sales status, changed in place.
  el.querySelectorAll("[data-lead] select").forEach((select) => {
    select.addEventListener("change", async () => {
      const lead = leads.find((l) => l.id === select.closest("[data-lead]").dataset.lead);
      const before = lead.sales_status;
      const value = select.value || null;
      try {
        await updateProject(lead.id, { sales_status: value });
      } catch (error) {
        showToast("Could not save: " + error.message);
        select.value = before || "";
        return;
      }
      showToast(`"${lead.name}": ${value ? labelOf(SALES_STATUSES, value) : "no status"}`, {
        actionLabel: "Undo",
        onAction: async () => { await updateProject(lead.id, { sales_status: before }); redraw(); },
      });
      redraw();
    });
  });
}

async function setReachOut(lead, value, redraw, message) {
  const before = lead.reach_out_on;
  try {
    await updateProject(lead.id, { reach_out_on: value });
  } catch (error) {
    showToast("Could not save: " + error.message);
    return;
  }
  showToast(message || (value ? `Reach out to "${lead.name}" on ${formatDay(value)}` : `"${lead.name}": reach-out date back to automatic`), {
    actionLabel: "Undo",
    onAction: async () => { await updateProject(lead.id, { reach_out_on: before }); redraw(); },
  });
  redraw();
}

// "+ Add to list": a name (an existing lead, or a new one) and a day.
function openAddToList(leads, today, redraw) {
  openDialog({
    title: "Add to the reach-out list",
    submitLabel: "Add",
    body: `
      <label class="field"><span>Organisation or lead</span>
        <input name="name" required maxlength="200" list="lead-names" placeholder="Type a name, or pick an existing lead">
        <datalist id="lead-names">${leads.map((l) => `<option value="${escapeHtml(l.name)}"></option>`).join("")}</datalist></label>
      <label class="field"><span>Reach out on</span>
        <input name="day" type="date" value="${today}"></label>
      <p class="muted field-note">An existing lead gets this date. A new name becomes a new lead (status Lead).</p>`,
    async onSubmit(form) {
      const name = form.elements.name.value.trim();
      const day = form.elements.day.value || today;
      if (!name) throw new Error("Please type a name.");
      const existing = leads.find((l) => l.name.trim().toLowerCase() === name.toLowerCase());
      if (existing) {
        await updateProject(existing.id, { reach_out_on: day });
        showToast(`"${existing.name}" added to the reach-out list.`);
      } else {
        await createProject({ name, type: "sales", status: null, sales_status: "lead", reach_out_on: day });
        showToast(`"${name}" added as a new lead.`);
      }
      redraw();
    },
  });
}

// "+ Next step": a task on the lead (title + date, tomorrow by default).
function openNextStep(lead, today, redraw) {
  openDialog({
    title: `Next step: ${lead.name}`,
    submitLabel: "Add",
    body: `
      <label class="field"><span>What's next?</span>
        <input name="title" required maxlength="300" placeholder="e.g. Send the proposal"></label>
      <label class="field"><span>When</span>
        <input name="day" type="date" value="${addDays(today, 1)}"></label>
      <p class="muted field-note">It becomes a task on this lead, so it also shows in Priorities on that day.</p>`,
    async onSubmit(form) {
      const title = form.elements.title.value.trim();
      if (!title) throw new Error("Please say what the next step is.");
      await createTask({ title, project_id: lead.id, due_date: form.elements.day.value || null });
      showToast(`Next step for "${lead.name}" added.`);
      redraw();
    },
  });
}

function nextStepHtml(l, today) {
  if (!l.next) {
    return `<button type="button" class="next-step is-empty" data-next>${icon("plus")} Next step</button>`;
  }
  const t = l.next;
  const late = t.due_date && t.due_date <= today;
  return `<button type="button" class="next-step${late ? " is-due" : ""}" data-next title="Open the task">
      <span class="next-title">${escapeHtml(t.title)}</span>
      <span class="next-day">${t.due_date ? escapeHtml(friendlyDay(t.due_date, today)) : "No date"}${rolledHtml(t)}</span>
    </button>`;
}

function leadRowHtml(l, today, reachTab) {
  const due = l.reach_out <= today;
  return `
    <li class="lead" data-lead="${l.id}">
      <span class="lead-main">
        <a class="lead-name" href="#/project/${l.id}">${escapeHtml(l.name)}</a>
        ${l.contact_name ? `<span class="lead-contact">${escapeHtml(l.contact_name)}</span>` : ""}
      </span>
      <span class="lead-cell lead-next" data-label="Next step">${nextStepHtml(l, today)}</span>
      <span class="lead-cell" data-label="Event date">${escapeHtml(formatRange(l.date_start, l.date_end)) || '<span class="muted">—</span>'}</span>
      <span class="lead-cell" data-label="Sales status">
        <label class="tchip tchip-select sales-${l.sales_status || "none"}">
          <span class="sr-only">Sales status</span>
          <span aria-hidden="true">${escapeHtml(labelOf(SALES_STATUSES, l.sales_status) || "No status")}</span>
          <select>${l.sales_status ? "" : '<option value="" selected>No status</option>'}${SALES_STATUSES.map((s) =>
            `<option value="${s.value}"${s.value === l.sales_status ? " selected" : ""}>${escapeHtml(s.label)}</option>`).join("")}</select>
        </label>
      </span>
      <span class="lead-cell muted" data-label="Created">${escapeHtml(formatDay(l.created_day))}</span>
      <span class="lead-cell${due ? " reach-due" : ""}" data-label="Reach out">
        <label class="tchip tchip-date reach-chip${l.reach_out_on ? "" : " is-auto"}" title="${l.reach_out_on ? "Your date. Clear it to go back to automatic." : "Automatic: created + 1 year. Tap to pick another day."}">
          ${due ? icon("bell") : icon("calendar")}<span>${escapeHtml(formatDay(l.reach_out))}</span>
          <input type="date" value="${escapeHtml(l.reach_out_on || "")}" aria-label="Reach out on">
        </label>
        ${reachTab ? `<button type="button" class="btn secondary small reached" data-reached>${icon("check")} Reached out</button>` : ""}
      </span>
    </li>`;
}
