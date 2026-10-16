// Shoes screen (opened from the Me tab).
//   #/shoes        -> list of pairs with their km
//   #/shoes/new    -> form for a new pair
//   #/shoes/<id>   -> form to edit that pair

import { listShoes, getShoe, saveShoe, deleteShoe, getShoeDistances } from "../storage.js?v=202610161549";
import { SHOE_RULES, SHOE_SURFACES, shoeStatus } from "../rules.js?v=202610161549";
import { formatDayLabel } from "../utils/dates.js?v=202610161549";
import { escapeHtml } from "../utils/format.js?v=202610161549";

export function render(container, { params = [] } = {}) {
  if (params[0] === "new") return renderForm(container, null);
  if (params[0]) return renderForm(container, params[0]);
  renderList(container);
}


// ---------- The list ----------

async function renderList(container) {
  container.innerHTML = `
    <div class="wide-page">
    <a href="#/me" class="back-link">‹ Me</a>
    <a href="#/shoes/new" class="button primary add-button">+ Add a pair</a>
    <div id="shoe-list"><p class="muted">Loading…</p></div>
    </div>
  `;
  const listEl = container.querySelector("#shoe-list");

  try {
    // Ask for both at the same time instead of one after the other.
    const [shoes, distances] = await Promise.all([listShoes(), getShoeDistances()]);
    const active = shoes.filter((shoe) => !shoe.retired);
    const retired = shoes.filter((shoe) => shoe.retired);
    const card = (shoe) => shoeCardHtml(shoe, distances[shoe.id] || { km: 0, runs: 0 });

    listEl.innerHTML = `
      ${active.length
        ? `<div class="card-grid">${active.map(card).join("")}</div>`
        : `<section class="card placeholder"><p>No shoes in use. Tap <strong>+ Add a pair</strong>.</p></section>`}
      ${retired.length ? `
        <details class="retired">
          <summary>Retired (${retired.length})</summary>
          <div class="card-grid">${retired.map(card).join("")}</div>
        </details>` : ""}
      <p class="hint">Warning from ${SHOE_RULES.warnKm} km, replace at ${SHOE_RULES.replaceKm} km.</p>
    `;
  } catch (error) {
    listEl.innerHTML = `<p class="status error"></p>`;
    listEl.querySelector(".status").textContent = "Could not load shoes: " + error.message;
  }
}

function shoeCardHtml(shoe, { km, runs }) {
  const status = shoe.retired ? "retired" : shoeStatus(km);
  // How full the bar is: 0% at 0 km, 100% at the replace distance (never more).
  const percent = Math.min(100, Math.round((km / SHOE_RULES.replaceKm) * 100));
  const message = {
    ok: "",
    warn: `Getting worn: ${Math.max(0, Math.round(SHOE_RULES.replaceKm - km))} km left`,
    replace: "Time for a new pair",
    retired: "",
  }[status];
  const surface = SHOE_SURFACES[shoe.surface];

  return `
    <a class="card shoe-card status-${status}" href="#/shoes/${encodeURIComponent(shoe.id)}">
      <span class="shoe-top">
        <strong>${escapeHtml(shoe.name)}</strong>
        ${surface ? `<span class="chip">${surface.label}</span>` : ""}
      </span>
      <span class="shoe-km"><strong>${km.toFixed(1)} km</strong>
        <span class="muted">· ${runs} run${runs === 1 ? "" : "s"}</span></span>
      <span class="bar" role="img" aria-label="${percent}% of ${SHOE_RULES.replaceKm} km">
        <span class="bar-fill" style="width: ${percent}%"></span>
      </span>
      ${message ? `<span class="shoe-message">${message}</span>` : ""}
      ${shoe.purchase_date ? `<span class="muted small">Bought ${formatDayLabel(shoe.purchase_date)}</span>` : ""}
    </a>
  `;
}


// ---------- The add / edit form ----------

async function renderForm(container, shoeId) {
  let shoe = null;
  if (shoeId) {
    container.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      shoe = await getShoe(shoeId);
    } catch (error) {
      container.innerHTML = `<p class="status error"></p>`;
      container.querySelector(".status").textContent = "Could not load: " + error.message;
      return;
    }
    if (!shoe) {
      container.innerHTML = `<section class="card"><p>This pair doesn't exist (any more).</p>
        <a class="button" href="#/shoes">Back to shoes</a></section>`;
      return;
    }
  }
  const isEdit = Boolean(shoe);
  const s = shoe || { surface: "road", retired: false };

  container.innerHTML = `
    <form id="shoe-form" class="card form" novalidate>
      <h2>${isEdit ? "Edit pair" : "New pair"}</h2>

      <label for="s-name">Name</label>
      <input id="s-name" name="name" type="text" required autocomplete="off"
             placeholder="e.g. ON CloudCore 3" value="${escapeHtml(s.name || "")}">

      <label for="s-surface">Type</label>
      <select id="s-surface" name="surface">
        ${Object.entries(SHOE_SURFACES).map(([key, surface]) =>
          `<option value="${key}" ${s.surface === key ? "selected" : ""}>${surface.label}</option>`).join("")}
      </select>

      <label for="s-date">Purchase date</label>
      <input id="s-date" name="purchase_date" type="date" value="${escapeHtml(s.purchase_date || "")}">

      <label for="s-notes">Notes</label>
      <textarea id="s-notes" name="notes" rows="2">${escapeHtml(s.notes || "")}</textarea>

      <label class="checkbox">
        <input type="checkbox" name="retired" ${s.retired ? "checked" : ""}>
        Retired (no longer used; hidden from the run form)
      </label>

      <p id="shoe-status" class="status" role="status"></p>

      <div class="form-actions">
        <button type="submit" class="button primary">${isEdit ? "Save changes" : "Save pair"}</button>
        <a href="#/shoes" class="button">Cancel</a>
        ${isEdit ? `<button type="button" id="delete" class="button danger">Delete</button>` : ""}
      </div>
    </form>
  `;

  const form = container.querySelector("#shoe-form");
  const status = form.querySelector("#shoe-status");

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = form.elements.name.value.trim();
    if (!name) {
      showStatus(status, "Please give the pair a name.", "error");
      return;
    }
    const values = {
      name,
      surface: form.elements.surface.value || null,
      purchase_date: form.elements.purchase_date.value || null,
      notes: form.elements.notes.value.trim() || null,
      retired: form.elements.retired.checked,
    };
    if (isEdit) values.id = shoe.id;

    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;
    showStatus(status, "Saving…", "");
    try {
      await saveShoe(values);
      window.location.hash = "#/shoes";
    } catch (error) {
      showStatus(status, "Could not save: " + error.message, "error");
      button.disabled = false;
    }
  });

  const deleteButton = form.querySelector("#delete");
  if (deleteButton) {
    deleteButton.addEventListener("click", async () => {
      const question = "Delete this pair? Its runs stay in the log but won't be linked to a shoe any more.\n\n" +
        "Tip: if you just stopped using it, tick \"Retired\" instead.";
      if (!window.confirm(question)) return;
      try {
        await deleteShoe(shoe.id);
        window.location.hash = "#/shoes";
      } catch (error) {
        showStatus(status, "Could not delete: " + error.message, "error");
      }
    });
  }
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}
