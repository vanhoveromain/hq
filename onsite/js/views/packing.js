// packing.js: an event's packing list (tab "Packing list" on the event page).
//
//   - Items grouped by category (= the box they go in), in packing order.
//   - Two ticks per item: Packed (at the office) and Back (returned after the
//     event, so nothing stays at the venue).
//   - Filters: All · To pack · Not back yet.
//   - Add: from the master material list (pick several), or one item typed for
//     this event (optionally also added to the master list).
//   - Tap an item's name: edit / delete (with Undo).
//
// An event's items are copies: changing the master list later doesn't change
// an event that already has its list, and the other way round.

import * as store from "../storage.js";
import { escapeHtml, icon } from "../utils/html.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { categoryOrder, nextPosition } from "../rules.js";

let filter = "all"; // kept while the app is open

export function render(el, event) {
  const items = store.list("pack", (p) => p.event_id === event.id);
  const materials = store.list("materials", (m) => !m.archived_at);

  if (!items.length) {
    el.innerHTML = `
      <div class="empty pack-empty">
        <p>No packing list yet for this event.</p>
        ${materials.length ? `
          <div class="btn-row">
            <button type="button" class="btn" data-add-all>${icon("plus")} Add the whole material list (${materials.length})</button>
            <button type="button" class="btn secondary" data-pick>Pick from the material list</button>
            <button type="button" class="btn secondary" data-new>Type an item</button>
          </div>` : `
          <p class="muted">Your material list is empty. <a href="#/materials">Open the material list</a> to load QED's standard list first.</p>
          <div class="btn-row"><button type="button" class="btn secondary" data-new>Type an item</button></div>`}
      </div>`;
    wire(el, event, items, materials);
    return;
  }

  const packed = items.filter((i) => i.packed_at).length;
  const back = items.filter((i) => i.returned_at).length;
  const shown = items.filter((i) => filter === "all" || (filter === "pack" ? !i.packed_at : !i.returned_at));
  const groups = groupByCategory(shown, materials);

  el.innerHTML = `
    <div class="pack-summary">
      <div class="meter"><span>Packed</span><strong>${packed} / ${items.length}</strong><i style="--p:${pct(packed, items.length)}"></i></div>
      <div class="meter"><span>Back at the office</span><strong>${back} / ${items.length}</strong><i style="--p:${pct(back, items.length)}"></i></div>
    </div>
    <div class="pack-toolbar">
      <div class="chips" role="group" aria-label="Show">
        ${[["all", "All"], ["pack", `To pack · ${items.length - packed}`], ["back", `Not back yet · ${items.length - back}`]].map(([v, l]) =>
          `<button type="button" class="chip${filter === v ? " active" : ""}" data-filter="${v}">${escapeHtml(l)}</button>`).join("")}
      </div>
      <div class="btn-row">
        <button type="button" class="btn secondary small" data-pick>${icon("plus")} From material list</button>
        <button type="button" class="btn secondary small" data-new>${icon("plus")} Item</button>
      </div>
    </div>
    ${groups.length ? groups.map(([category, rows]) => `
      <section class="pack-group">
        <header class="pack-head">
          <h3>${escapeHtml(category)}</h3>
          <span class="muted small">${rows.filter((r) => r.packed_at).length}/${rows.length}</span>
          <span class="pack-col">Packed</span><span class="pack-col">Back</span>
        </header>
        <ul class="pack-list">${rows.map(rowHtml).join("")}</ul>
      </section>`).join("")
      : `<p class="empty">${filter === "pack" ? "Everything is packed." : "Everything is back."}</p>`}`;
  wire(el, event, items, materials);
}

function rowHtml(item) {
  return `<li class="pack-row${item.packed_at ? " is-packed" : ""}${item.returned_at ? " is-back" : ""}">
    <button type="button" class="pack-name" data-edit="${item.id}">
      <span>${escapeHtml(item.name)}${item.qty ? ` <b class="qty">×${item.qty}</b>` : ""}</span>
      ${item.note ? `<small>${escapeHtml(item.note)}</small>` : ""}
    </button>
    <button type="button" class="tick" data-tick="${item.id}" data-field="packed_at" aria-pressed="${Boolean(item.packed_at)}" aria-label="Packed: ${escapeHtml(item.name)}">${icon("check")}</button>
    <button type="button" class="tick back" data-tick="${item.id}" data-field="returned_at" aria-pressed="${Boolean(item.returned_at)}" aria-label="Back at the office: ${escapeHtml(item.name)}">${icon("check")}</button>
  </li>`;
}

function wire(el, event, items, materials) {
  el.onclick = (e) => {
    const t = e.target.closest("button");
    if (!t) return;
    if (t.dataset.filter) { filter = t.dataset.filter; render(el, event); return; }
    if (t.dataset.tick) {
      const item = store.get("pack", t.dataset.tick);
      const field = t.dataset.field;
      store.update("pack", item.id, { [field]: item[field] ? null : new Date().toISOString() });
      render(el, event);
      return;
    }
    if (t.dataset.edit) return openItemForm(event, store.get("pack", t.dataset.edit), () => render(el, event));
    if ("new" in t.dataset) return openItemForm(event, null, () => render(el, event));
    if ("pick" in t.dataset) return openPicker(event, () => render(el, event));
    if ("addAll" in t.dataset) {
      const added = addMaterials(event, materials);
      showToast(`${added.length} items added`, { actionLabel: "Undo", onAction: () => store.batch(() => added.forEach((r) => store.remove("pack", r.id))) });
      render(el, event);
    }
  };
}

// Copies master materials into the event (skips ones already there).
function addMaterials(event, materials) {
  const already = new Set(store.list("pack", (p) => p.event_id === event.id).map((p) => p.material_id));
  return store.batch(() => materials.filter((m) => !already.has(m.id)).map((m) => store.create("pack", {
    event_id: event.id, material_id: m.id, name: m.name, category: m.category,
    qty: m.default_qty, note: m.note, position: m.position,
  })));
}

function openPicker(event, done) {
  const materials = store.list("materials", (m) => !m.archived_at);
  if (!materials.length) {
    showToast("The material list is empty: open “Material list” to load it.");
    return;
  }
  const already = new Set(store.list("pack", (p) => p.event_id === event.id).map((p) => p.material_id));
  const groups = groupByCategory(materials, materials);
  openDialog({
    title: "Add from the material list",
    submitLabel: "Add selected",
    body: `
      <p class="muted small">Ticked = goes on this event's list. Greyed = already on it.</p>
      <label class="switch"><input type="checkbox" data-all> Select all</label>
      ${groups.map(([category, rows]) => `
        <fieldset class="pick-group"><legend>${escapeHtml(category)}</legend>
          ${rows.map((m) => `<label class="pick-row${already.has(m.id) ? " is-added" : ""}">
            <input type="checkbox" name="m" value="${m.id}" ${already.has(m.id) ? "checked disabled" : ""}>
            <span>${escapeHtml(m.name)}${m.default_qty ? ` ×${m.default_qty}` : ""}${m.note ? ` <small class="muted">· ${escapeHtml(m.note)}</small>` : ""}</span>
          </label>`).join("")}
        </fieldset>`).join("")}`,
    onOpen(form) {
      form.querySelector("[data-all]").addEventListener("change", (e) => {
        for (const box of form.querySelectorAll("input[name=m]:not(:disabled)")) box.checked = e.target.checked;
      });
    },
    async onSubmit(form) {
      const ids = new Set([...form.querySelectorAll("input[name=m]:checked:not(:disabled)")].map((b) => b.value));
      if (!ids.size) throw new Error("Tick at least one item.");
      const added = addMaterials(event, materials.filter((m) => ids.has(m.id)));
      showToast(`${added.length} item${added.length > 1 ? "s" : ""} added`);
      done();
    },
  });
}

function openItemForm(event, item, done) {
  const categories = [...new Set([
    ...store.list("pack", (p) => p.event_id === event.id).map((p) => p.category),
    ...store.list("materials").map((m) => m.category),
  ].filter(Boolean))];
  openDialog({
    title: item ? "Edit item" : "New item",
    submitLabel: item ? "Save" : "Add",
    body: `
      <label class="field"><span>Item</span><input name="name" required maxlength="200" value="${escapeHtml(item?.name)}"></label>
      <div class="field-row">
        <label class="field"><span>Box / category</span>
          <input name="category" list="pack-cats" maxlength="100" value="${escapeHtml(item?.category)}" placeholder="Box 2">
          <datalist id="pack-cats">${categories.map((c) => `<option value="${escapeHtml(c)}">`).join("")}</datalist></label>
        <label class="field"><span>Quantity</span><input name="qty" type="number" min="1" inputmode="numeric" value="${escapeHtml(item?.qty ?? "")}"></label>
      </div>
      <label class="field"><span>Note <small class="muted">(what it's for, where it goes…)</small></span>
        <input name="note" maxlength="1000" value="${escapeHtml(item?.note)}"></label>
      ${item ? "" : `<label class="switch"><input type="checkbox" name="master" checked> Also add to the material list (for next events)</label>`}`,
    async onSubmit(form) {
      const name = form.name.value.trim();
      if (!name) throw new Error("Type the item's name.");
      const qty = form.qty.value ? Number(form.qty.value) : null;
      if (qty !== null && (!Number.isInteger(qty) || qty < 1)) throw new Error("Quantity: a whole number from 1, or empty.");
      const fields = { name, category: form.category.value.trim() || null, qty, note: form.note.value.trim() || null };
      if (item) {
        store.update("pack", item.id, fields);
      } else {
        store.batch(() => {
          let materialId = null;
          if (form.master.checked) {
            const m = store.create("materials", { name, category: fields.category, default_qty: qty, note: fields.note,
              position: nextPosition(store.list("materials"), fields.category) });
            materialId = m.id;
          }
          store.create("pack", { ...fields, event_id: event.id, material_id: materialId,
            position: nextPosition(store.list("pack", (p) => p.event_id === event.id), fields.category) });
        });
      }
      done();
    },
    actions: item ? [{
      label: "Delete", kind: "danger", confirm: "Click again to delete",
      onClick() {
        const removed = store.remove("pack", item.id);
        showToast(`“${item.name}” removed`, { actionLabel: "Undo", onAction: () => { store.restore(removed); done(); } });
        done();
      },
    }] : [],
  });
}

// [[category, rows sorted], ...] in packing order.
export function groupByCategory(rows, materials) {
  const order = categoryOrder([...materials, ...rows]);
  const map = new Map();
  for (const r of [...rows].sort((a, b) => (a.position ?? 0) - (b.position ?? 0) || a.name.localeCompare(b.name))) {
    const key = r.category || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(r);
  }
  return [...map.entries()].sort((a, b) => (order.get(a[0]) ?? 1e9) - (order.get(b[0]) ?? 1e9) || a[0].localeCompare(b[0]));
}

function pct(n, total) {
  return total ? Math.round((n / total) * 100) + "%" : "0%";
}
