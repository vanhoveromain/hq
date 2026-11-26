// materials.js: QED's master material list (#/materials). What events pick
// their packing list from. Grouped by box / category, in packing order.
//   - Empty: "Load QED's standard list" (seed.js, from the 2025 to-bring list).
//   - Tap an item: edit / remove (with Undo). Changes apply to NEW packing
//     lists only; events that already have their list keep their copy.

import * as store from "../storage.js";
import { escapeHtml, icon } from "../utils/html.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { nextPosition } from "../rules.js";
import { STANDARD_MATERIALS } from "../seed.js";
import { groupByCategory } from "./packing.js";

export function render(el) {
  const materials = store.list("materials", (m) => !m.archived_at);

  if (!materials.length) {
    el.innerHTML = `
      <div class="empty pack-empty">
        <p>${store.hasEverSynced() ? "The material list is empty." : "Loading…"}</p>
        <div class="btn-row">
          <button type="button" class="btn" data-seed>Load QED's standard list (${STANDARD_MATERIALS.length} items)</button>
          <button type="button" class="btn secondary" data-new>${icon("plus")} Add an item</button>
        </div>
        <p class="muted small">The standard list comes from last year's to-bring list. You can change everything afterwards.</p>
      </div>`;
  } else {
    el.innerHTML = `
      <div class="section-head">
        <p class="muted small">${materials.length} items. Changes here apply to new packing lists; an event that already has its list keeps it.</p>
        <button type="button" class="btn small" data-new>${icon("plus")} Item</button>
      </div>
      ${groupByCategory(materials, materials).map(([category, rows]) => `
        <section class="pack-group">
          <header class="pack-head"><h3>${escapeHtml(category)}</h3><span class="muted small">${rows.length}</span></header>
          <ul class="pack-list">${rows.map((m) => `
            <li class="pack-row">
              <button type="button" class="pack-name" data-edit="${m.id}">
                <span>${escapeHtml(m.name)}${m.default_qty ? ` <b class="qty">×${m.default_qty}</b>` : ""}</span>
                ${m.note ? `<small>${escapeHtml(m.note)}</small>` : ""}
              </button>
            </li>`).join("")}</ul>
        </section>`).join("")}`;
  }

  el.onclick = (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if ("seed" in t.dataset) {
      store.batch(() => STANDARD_MATERIALS.forEach(([category, name, qty, note], i) =>
        store.create("materials", { category, name, default_qty: qty, note, position: (i + 1) * 100 })));
      render(el);
    } else if ("new" in t.dataset) {
      openForm(null, () => render(el));
    } else if (t.dataset.edit) {
      openForm(store.get("materials", t.dataset.edit), () => render(el));
    }
  };
}

function openForm(material, done) {
  const categories = [...new Set(store.list("materials").map((m) => m.category).filter(Boolean))];
  openDialog({
    title: material ? "Edit material" : "New material",
    submitLabel: material ? "Save" : "Add",
    body: `
      <label class="field"><span>Item</span><input name="name" required maxlength="200" value="${escapeHtml(material?.name)}"></label>
      <div class="field-row">
        <label class="field"><span>Box / category</span>
          <input name="category" list="mat-cats" maxlength="100" value="${escapeHtml(material?.category)}">
          <datalist id="mat-cats">${categories.map((c) => `<option value="${escapeHtml(c)}">`).join("")}</datalist></label>
        <label class="field"><span>Usual quantity</span><input name="qty" type="number" min="1" inputmode="numeric" value="${escapeHtml(material?.default_qty ?? "")}"></label>
      </div>
      <label class="field"><span>Note</span><input name="note" maxlength="1000" value="${escapeHtml(material?.note)}"></label>`,
    async onSubmit(form) {
      const name = form.name.value.trim();
      if (!name) throw new Error("Type the item's name.");
      const qty = form.qty.value ? Number(form.qty.value) : null;
      if (qty !== null && (!Number.isInteger(qty) || qty < 1)) throw new Error("Quantity: a whole number from 1, or empty.");
      const category = form.category.value.trim() || null;
      const fields = { name, category, default_qty: qty, note: form.note.value.trim() || null };
      if (material) {
        if (category !== material.category) fields.position = nextPosition(store.list("materials"), category);
        store.update("materials", material.id, fields);
      } else {
        store.create("materials", { ...fields, position: nextPosition(store.list("materials"), category) });
      }
      done();
    },
    actions: material ? [{
      label: "Remove", kind: "danger", confirm: "Click again to remove",
      onClick() {
        // Archived, not deleted: past packing lists keep their link.
        store.update("materials", material.id, { archived_at: new Date().toISOString() });
        showToast(`“${material.name}” removed from the list`, { actionLabel: "Undo",
          onAction: () => { store.update("materials", material.id, { archived_at: null }); done(); } });
        done();
      },
    }] : [],
  });
}
