// sales.js: Sales (#/sales/<tab>), your sales leads.
//
// Leads are projects of type "sales" (they only use Sales status: Lead,
// Improvements, Confirmed, Declined; a confirmed lead simply stays a lead).
// Tabs: Open · To reach out · Confirmed · Declined · All (SALES_TABS in
// rules.js). Newest first; "To reach out" soonest first.
// Reach out date = created + 1 year: highlighted once it has come.
// Sales status changes in place (a menu on the row); the name opens the lead.

import { listProjects, updateProject } from "../storage.js";
import { SALES_TABS, SALES_STATUSES, labelOf, reachOutDate } from "../rules.js";
import { openProjectForm } from "./projectForm.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, icon, showActiveTab } from "../utils/html.js";
import { brusselsToday, brusselsDayOf, formatDay, formatRange } from "../utils/dates.js";

export async function render(el, { params = [] } = {}) {
  const tab = SALES_TABS.find((t) => t.id === params[0]) || SALES_TABS[0];
  const today = brusselsToday();
  if (!el.querySelector(".sales")) el.innerHTML = `<p class="muted">Loading…</p>`;

  let leads;
  try {
    leads = (await listProjects()).filter((p) => p.type === "sales");
  } catch (error) {
    el.innerHTML = `<p class="error">Could not load your leads: ${escapeHtml(error.message)}</p>`;
    return;
  }
  for (const lead of leads) {
    lead.created_day = brusselsDayOf(lead.created_at);
    lead.reach_out = reachOutDate(lead.created_day);
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
        <button type="button" class="btn small" id="new-lead">${icon("plus")} New lead</button>
      </div>
      ${shown.length ? `
        <ul class="lead-list">
          <li class="lead-head" aria-hidden="true"><span>Lead</span><span>Event date</span><span>Sales status</span><span>Created</span><span>Reach out</span></li>
          ${shown.map((l) => leadRowHtml(l, today)).join("")}
        </ul>` : `<p class="empty">${tab.id === "reach-out" ? "No lead to reach out to again yet." : "No leads here."}</p>`}
    </div>`;
  showActiveTab(el);

  el.querySelector("#new-lead").addEventListener("click", () => {
    openProjectForm({ defaults: { type: "sales", status: null, sales_status: "lead" }, onChange: redraw });
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

function leadRowHtml(l, today) {
  const due = l.reach_out <= today;
  return `
    <li class="lead" data-lead="${l.id}">
      <a class="lead-name" href="#/project/${l.id}">${escapeHtml(l.name)}</a>
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
      <span class="lead-cell${due ? " reach-due" : ""}" data-label="Reach out">${due ? `${icon("bell")} ` : ""}${escapeHtml(formatDay(l.reach_out))}</span>
    </li>`;
}
