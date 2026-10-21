// Week templates (opened from the Plan tab): your saved weeks.
//   #/weektemplates -> the list, with what's on each day
//
// Templates are made in the planner ("📋 Templates" -> "Save this week as a
// template"). To change one: apply it to a week, adjust the week, then save
// it again with the same name. Here you can look, rename and delete.

import { listWeekTemplates, renameWeekTemplate, deleteWeekTemplate } from "../storage.js?v=202610211529";
import { sportIcon, sessionTypeLabel } from "../rules.js?v=202610211529";
import { escapeHtml } from "../utils/format.js?v=202610211529";
import { openSheet } from "../utils/sheet.js?v=202610211529";
import { showToast } from "../utils/toast.js?v=202610211529";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

export function render(container) {
  container.innerHTML = `
    <a href="#/planner" class="back-link">‹ Plan</a>
    <div id="templates-list"><p class="muted">Loading…</p></div>
  `;
  const listEl = container.querySelector("#templates-list");
  let templates = [];

  async function load() {
    try {
      templates = await listWeekTemplates();
      draw();
    } catch (error) {
      listEl.innerHTML = `<p class="status error"></p>`;
      listEl.querySelector(".status").textContent = "Could not load the templates: " + error.message;
    }
  }

  function draw() {
    if (!templates.length) {
      listEl.innerHTML = `<section class="card placeholder"><p>No week templates yet.</p>
        <p class="muted">Plan a week you like, then in the planner tap <strong>📋 Templates</strong>
        → <strong>Save this week as a template</strong>.</p></section>`;
      return;
    }
    listEl.innerHTML = templates.map((t) => `
      <section class="card week-template">
        <h2>${escapeHtml(t.name)}</h2>
        <ul class="template-days">${WEEKDAYS.map((label, i) => {
          const items = t.items.filter((item) => item.weekday === i + 1);
          return `<li><span class="template-day">${label}</span>
            <span>${items.length ? items.map(itemHtml).join("<br>") : `<span class="muted">Rest</span>`}</span></li>`;
        }).join("")}</ul>
        <div class="form-actions">
          <button type="button" class="button" data-rename="${t.id}">Rename</button>
          <button type="button" class="button danger" data-delete="${t.id}">Delete</button>
        </div>
      </section>`).join("");
  }

  listEl.addEventListener("click", async (event) => {
    const renameButton = event.target.closest("[data-rename]");
    const deleteButton = event.target.closest("[data-delete]");
    const button = renameButton || deleteButton;
    if (!button) return;
    const template = templates.find((t) => t.id === (button.dataset.rename || button.dataset.delete));
    if (!template) return;
    try {
      if (renameButton) {
        const name = await askName(template.name);
        if (!name || name === template.name) return;
        await renameWeekTemplate(template.id, name);
      } else {
        if (!window.confirm(`Delete the template "${template.name}"? Weeks already planned with it stay as they are.`)) return;
        await deleteWeekTemplate(template.id);
        showToast(`Deleted "${template.name}"`);
      }
      await load();
    } catch (error) {
      showToast("Something went wrong: " + error.message);
    }
  });

  load();
}

// One line in a day: recipe name, or "just a sport" (type or sport name).
function itemHtml(item) {
  const sport = item.sport || (item.template && item.template.sport);
  const name = item.template ? item.template.name : sessionTypeLabel(sport, item.session_type);
  return `${sportIcon(sport)} ${escapeHtml(name)}`;
}

function askName(current) {
  return openSheet({
    title: "Rename template",
    html: `
      <label for="rename-input" class="sheet-subtitle">Name</label>
      <input id="rename-input" type="text" maxlength="60" value="${escapeHtml(current)}">
      <button type="button" class="button primary" id="rename-go">Save</button>`,
    onReady: (dialog, close) => {
      const input = dialog.querySelector("#rename-input");
      const go = () => { if (input.value.trim()) close(input.value.trim()); };
      dialog.querySelector("#rename-go").addEventListener("click", go);
      input.addEventListener("keydown", (event) => { if (event.key === "Enter") { event.preventDefault(); go(); } });
      input.select();
    },
  });
}
