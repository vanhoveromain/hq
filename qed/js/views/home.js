// home.js: the QED HQ Home screen.
//
//   1. Projects: a gallery with tabs (All, Own-initiated, Bespoke, Non-event,
//      Followed up). "+ New" pre-fills the type of the tab you're on (it
//      replaces the Notion templates). Tap a card to open the project page.
//   2. Tools: the links panel, editable ("Edit": add, rename, reorder, remove).
//   3. Team: the onboarding plan.
//
// The tab lives in the address (#/home/bespoke), so Back and bookmarks work.

import { listProjects, listLinks, createLink, updateLink, deleteLink, reorderLinks } from "../storage.js";
import {
  HOME_TABS, PROJECT_TYPES, PROJECT_STATUSES, OWNERS, DEFAULT_OWNER,
  labelOf, isVisible, compareProjects,
} from "../rules.js";
import { openProjectForm } from "./projectForm.js";
import { openDialog } from "../utils/dialog.js";
import { showToast } from "../utils/toast.js";
import { escapeHtml, safeUrl, icon } from "../utils/html.js";
import { formatRange } from "../utils/dates.js";

// Remembered while the app is open (not saved): switches on Home.
let showArchived = false;
let ownerFilter = "all";   // Followed up tab: "all" or an owner value
let editingTools = false;

export async function render(el, { params }) {
  const tab = HOME_TABS.find((t) => t.id === params[0]) || HOME_TABS[0];

  el.innerHTML = `
    <section class="section">
      <div class="section-head">
        <h2 class="section-title">Projects</h2>
        <button type="button" class="btn small" id="new-project">${icon("plus")} New</button>
      </div>
      <nav class="tabs" aria-label="Project tabs">
        ${HOME_TABS.map((t) => `<a href="#/home/${t.id}" class="${t === tab ? "active" : ""}"${t === tab ? ' aria-current="page"' : ""}>${escapeHtml(t.label)}</a>`).join("")}
      </nav>
      <div class="filters">
        ${tab.byOwner ? ownerChips() : ""}
        <label class="switch"><input type="checkbox" id="show-archived"${showArchived ? " checked" : ""}> Show archived</label>
      </div>
      <div id="gallery"><p class="muted">Loading…</p></div>
    </section>

    <section class="section">
      <div class="section-head">
        <h2 class="section-title">Tools</h2>
        <button type="button" class="btn secondary small" id="edit-tools">${editingTools ? "Done" : "Edit"}</button>
      </div>
      <div id="tools"><p class="muted">Loading…</p></div>
    </section>

    <section class="section">
      <h2 class="section-title">Team</h2>
      <a class="btn secondary" href="onboarding/">${icon("calendar")} Open the onboarding plan</a>
    </section>
  `;

  const redraw = () => render(el, { params });

  el.querySelector("#new-project").addEventListener("click", () => {
    const defaults = { ...tab.newProject };
    if (tab.byOwner) defaults.owner = ownerFilter !== "all" ? ownerFilter : OWNERS.find((o) => o.value !== DEFAULT_OWNER).value;
    openProjectForm({ defaults, onChange: redraw });
  });
  el.querySelector("#show-archived").addEventListener("change", (event) => {
    showArchived = event.target.checked;
    redraw();
  });
  el.querySelectorAll("[data-owner]").forEach((chip) => {
    chip.addEventListener("click", () => {
      ownerFilter = chip.dataset.owner;
      redraw();
    });
  });
  el.querySelector("#edit-tools").addEventListener("click", () => {
    editingTools = !editingTools;
    redraw();
  });

  await Promise.all([
    drawGallery(el.querySelector("#gallery"), tab),
    drawTools(el.querySelector("#tools"), redraw),
  ]);
}


// ---------------------------------------------------------------------
// Projects gallery
// ---------------------------------------------------------------------

function ownerChips() {
  const owners = [{ value: "all", label: "All" }, ...OWNERS.filter((o) => o.value !== DEFAULT_OWNER)];
  return `<div class="chips" role="group" aria-label="Owner">${owners.map((o) =>
    `<button type="button" class="chip${o.value === ownerFilter ? " active" : ""}" data-owner="${o.value}" aria-pressed="${o.value === ownerFilter}">${escapeHtml(o.label)}</button>`,
  ).join("")}</div>`;
}

async function drawGallery(galleryEl, tab) {
  let projects;
  try {
    projects = await listProjects();
  } catch (error) {
    galleryEl.innerHTML = `<p class="error">Could not load the projects: ${escapeHtml(error.message)}</p>`;
    return;
  }

  const shown = projects
    .filter((p) => tab.filter(p) && isVisible(p, showArchived))
    .filter((p) => !tab.byOwner || ownerFilter === "all" || p.owner === ownerFilter)
    .sort((a, b) => compareProjects(a, b, tab.sort));

  if (!shown.length) {
    galleryEl.innerHTML = `<p class="empty">No projects here yet. Use <strong>New</strong> to add one.</p>`;
    return;
  }

  galleryEl.innerHTML = `<ul class="cards">${shown.map((p) => cardHtml(p, tab)).join("")}</ul>`;
  galleryEl.querySelectorAll("[data-project]").forEach((card) => {
    card.addEventListener("click", () => {
      window.location.hash = `#/project/${card.dataset.project}`;
    });
  });
}

function cardHtml(p, tab) {
  const dates = formatRange(p.date_start, p.date_end);
  const tags = [];
  if (p.status) tags.push(`<span class="pill status-${p.status}">${escapeHtml(labelOf(PROJECT_STATUSES, p.status))}</span>`);
  if (tab.id === "all") tags.push(`<span class="pill">${escapeHtml(labelOf(PROJECT_TYPES, p.type))}</span>`);
  if (p.owner !== DEFAULT_OWNER) tags.push(`<span class="pill owner">${escapeHtml(labelOf(OWNERS, p.owner) || p.owner)}</span>`);
  return `
    <li><button type="button" class="card${p.status === "archived" ? " is-archived" : ""}" data-project="${p.id}">
      <span class="card-name">${escapeHtml(p.name)}</span>
      <span class="card-date">${dates ? escapeHtml(dates) : "No date yet"}</span>
      <span class="card-tags">${tags.join("")}</span>
    </button></li>`;
}


// ---------------------------------------------------------------------
// Tools panel
// ---------------------------------------------------------------------

async function drawTools(toolsEl, redraw) {
  let links;
  try {
    links = await listLinks();
  } catch (error) {
    toolsEl.innerHTML = `<p class="error">Could not load the links: ${escapeHtml(error.message)}</p>`;
    return;
  }

  if (!editingTools) {
    toolsEl.innerHTML = links.length ? tilesHtml(links) : `<p class="empty">No links yet. Use <strong>Edit</strong> to add one.</p>`;
    wireAppIcons(toolsEl);
    return;
  }

  toolsEl.innerHTML = `
    <ul class="edit-list">
      ${links.map((link, i) => `
        <li data-link="${link.id}">
          <span class="edit-text"><strong>${escapeHtml(link.label)}</strong><span class="muted">${escapeHtml(link.url)}</span></span>
          <span class="edit-actions">
            <button type="button" class="icon-btn" data-move="-1" aria-label="Move ${escapeHtml(link.label)} up"${i === 0 ? " disabled" : ""}>${icon("up")}</button>
            <button type="button" class="icon-btn" data-move="1" aria-label="Move ${escapeHtml(link.label)} down"${i === links.length - 1 ? " disabled" : ""}>${icon("down")}</button>
            <button type="button" class="icon-btn" data-edit aria-label="Edit ${escapeHtml(link.label)}">${icon("pencil")}</button>
          </span>
        </li>`).join("")}
    </ul>
    <button type="button" class="btn secondary" id="add-link">${icon("plus")} Add link</button>`;

  toolsEl.querySelector("#add-link").addEventListener("click", () => {
    openLinkForm({ link: null, nextOrder: links.length + 1, onChange: redraw });
  });
  toolsEl.querySelectorAll("[data-link]").forEach((row) => {
    const link = links.find((l) => l.id === row.dataset.link);
    row.querySelector("[data-edit]").addEventListener("click", () => {
      openLinkForm({ link, onChange: redraw });
    });
    row.querySelectorAll("[data-move]").forEach((button) => {
      button.addEventListener("click", async () => {
        const ids = links.map((l) => l.id);
        const from = ids.indexOf(link.id);
        const to = from + Number(button.dataset.move);
        [ids[from], ids[to]] = [ids[to], ids[from]];
        try {
          await reorderLinks(ids);
        } catch (error) {
          showToast("Could not move the link: " + error.message);
        }
        redraw();
      });
    });
  });
}

// Tools as small app icons (Romain, 2026-11-08): the site's own icon
// (favicon) when it has one, else the first letters of the name; the name
// underneath.
function tilesHtml(links) {
  const tiles = links.map((link) => {
    const url = safeUrl(link.url);
    if (!url) return "";
    const origin = new URL(url).origin;
    return `
      <li><a class="app" href="${escapeHtml(url)}" target="_blank" rel="noopener" title="${escapeHtml(link.label)}">
        <span class="app-icon">
          <span class="app-letters" aria-hidden="true">${escapeHtml(initials(link.label))}</span>
          <img src="${escapeHtml(origin)}/favicon.ico" alt="" loading="lazy" referrerpolicy="no-referrer">
        </span>
        <span class="app-name">${escapeHtml(link.label)}</span>
      </a></li>`;
  });
  return `<ul class="apps">${tiles.join("")}</ul>`;
}

// "Registration review" -> "RR", "Dropbox" -> "Dr"
function initials(label) {
  const words = label.trim().split(/\s+/).filter(Boolean);
  if (words.length >= 2) return (words[0][0] + words[1][0]).toUpperCase();
  return (words[0] || "?").slice(0, 2).replace(/^./, (c) => c.toUpperCase());
}

// A site without a favicon (or blocked): drop the broken image, the letters
// underneath show instead. Tiny icons (< 16 px) are dropped too.
function wireAppIcons(rootEl) {
  rootEl.querySelectorAll(".app-icon img").forEach((img) => {
    const drop = () => img.remove();
    img.addEventListener("error", drop);
    img.addEventListener("load", () => { if (img.naturalWidth < 16) drop(); });
  });
}

function openLinkForm({ link, nextOrder, onChange }) {
  const isNew = !link;
  openDialog({
    title: isNew ? "Add link" : "Edit link",
    submitLabel: isNew ? "Add" : "Save",
    actions: isNew ? [] : [{
      label: "Remove", kind: "danger", confirm: "Click again to remove",
      onClick: async () => {
        await deleteLink(link.id);
        showToast(`"${link.label}" removed.`, {
          actionLabel: "Undo",
          onAction: async () => {
            await createLink({ label: link.label, url: link.url, sort_order: link.sort_order });
            onChange();
          },
        });
        onChange();
      },
    }],
    body: `
      <label class="field"><span>Name</span>
        <input name="label" required maxlength="80" value="${escapeHtml(link?.label || "")}"></label>
      <label class="field"><span>Address</span>
        <input name="url" type="url" inputmode="url" required placeholder="https://…" value="${escapeHtml(link?.url || "")}"></label>`,
    async onSubmit(form) {
      const label = form.elements.label.value.trim();
      const url = form.elements.url.value.trim();
      if (!label) throw new Error("Please give the link a name.");
      if (!safeUrl(url)) throw new Error("The address must start with https://");
      if (isNew) await createLink({ label, url, sort_order: nextOrder });
      else await updateLink(link.id, { label, url });
      onChange();
    },
  });
}
