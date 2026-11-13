// search.js: one search box for projects, sales leads and tasks
// (UX review #6, Romain 2026-11-13).
//
// Opens with Cmd/Ctrl + K, "/" (when you're not typing somewhere) or the
// magnifier in the top bar. Before you type: the last 5 things you opened
// (remembered on this device only). Arrows move, Enter opens, Esc closes.
// A project or lead opens its page; a task opens its sheet where you are.

import { listProjects, searchTasks, listMeetingNames, getTask } from "../storage.js";
import { PROJECT_STATUSES, SALES_STATUSES, labelOf } from "../rules.js";
import { openTaskSheet } from "./taskSheet.js";
import { escapeHtml, icon } from "../utils/html.js";
import { friendlyDay, brusselsToday, formatRange } from "../utils/dates.js";

// ---------------------------------------------------------------------
// Recently opened (this device): [{ kind: "project" | "task", id, label, sub }]
// ---------------------------------------------------------------------

const RECENT_KEY = "qedhq.recent";
const RECENT_MAX = 5;

function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(RECENT_KEY) || "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

// Called by the project page and the task sheet.
export function rememberOpened(item) {
  try {
    const list = readRecent().filter((r) => !(r.kind === item.kind && r.id === item.id));
    list.unshift({ kind: item.kind, id: item.id, label: item.label, sub: item.sub || "" });
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, RECENT_MAX)));
  } catch {
    // Private window / storage blocked: search still works, no recents.
  }
}

function forgetOpened(kind, id) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(readRecent().filter((r) => !(r.kind === kind && r.id === id))));
  } catch { /* nothing to do */ }
}


// ---------------------------------------------------------------------
// The search window
// ---------------------------------------------------------------------

let openNow = null; // the dialog on show (only one at a time)

export function openSearch() {
  if (openNow) {
    openNow.querySelector("input").focus();
    return;
  }
  const dialog = document.createElement("dialog");
  dialog.className = "dialog search";
  dialog.setAttribute("aria-label", "Search");
  dialog.innerHTML = `
    <div class="search-box">
      ${icon("search")}
      <input type="search" placeholder="Search projects, leads, tasks…" aria-label="Search" autocomplete="off" spellcheck="false">
      <button type="button" class="icon-btn" data-close aria-label="Close">${icon("close")}</button>
    </div>
    <div class="search-results" role="listbox" aria-label="Results"></div>`;
  document.body.append(dialog);
  openNow = dialog;

  const input = dialog.querySelector("input");
  const resultsEl = dialog.querySelector(".search-results");
  const today = brusselsToday();
  let items = [];      // what's on show, in order: { kind, id, label, sub, task? }
  let active = 0;      // the highlighted one
  let projects = null; // loaded once per opening
  let names = {};
  let run = 0;         // newest search wins (older answers are ignored)
  let timer = null;

  const close = () => dialog.close();
  dialog.addEventListener("close", () => { dialog.remove(); openNow = null; });
  dialog.querySelector("[data-close]").addEventListener("click", close);
  dialog.addEventListener("click", (event) => { if (event.target === dialog) close(); });

  const projectsReady = listProjects().then((list) => {
    projects = list;
    names = Object.fromEntries(list.map((p) => [p.id, p.name]));
  }).catch(() => { projects = []; });

  function draw(groups, emptyText) {
    items = groups.flatMap((g) => g.items);
    active = Math.min(active, Math.max(items.length - 1, 0));
    if (!items.length) {
      resultsEl.innerHTML = `<p class="search-empty">${escapeHtml(emptyText)}</p>`;
      return;
    }
    let i = 0;
    resultsEl.innerHTML = groups.filter((g) => g.items.length).map((g) => `
      <p class="search-group">${escapeHtml(g.title)}</p>
      ${g.items.map((item) => {
        const n = i++;
        return `<button type="button" class="search-item${n === active ? " is-active" : ""}${item.done ? " is-done" : ""}" role="option" aria-selected="${n === active}" data-i="${n}">
          ${icon(item.kind === "task" ? "check" : item.isLead ? "sales" : "home")}
          <span class="search-text"><span class="search-label">${escapeHtml(item.label)}</span>${item.sub ? `<span class="search-sub">${escapeHtml(item.sub)}</span>` : ""}</span>
        </button>`;
      }).join("")}`).join("");
  }

  function showRecent() {
    const recent = readRecent().map((r) => ({ ...r, isLead: r.sub === "Lead" }));
    draw([{ title: "Recently opened", items: recent }], "Type to search projects, leads and tasks.");
  }

  async function search(text) {
    const mine = ++run;
    const needle = text.toLowerCase();
    await projectsReady;
    let tasks = [];
    try {
      tasks = await searchTasks(text);
    } catch {
      tasks = [];
    }
    if (mine !== run) return; // a newer search is on its way

    const found = projects
      .filter((p) => p.name.toLowerCase().includes(needle))
      .sort((a, b) => (a.status === "archived") - (b.status === "archived")
        || a.name.toLowerCase().indexOf(needle) - b.name.toLowerCase().indexOf(needle)
        || a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
    const asItem = (p) => ({ kind: "project", id: p.id, label: p.name, sub: projectSub(p), isLead: p.type === "sales" });
    const groups = [
      { title: "Projects", items: found.filter((p) => p.type !== "sales").slice(0, 8).map(asItem) },
      { title: "Sales leads", items: found.filter((p) => p.type === "sales").slice(0, 8).map(asItem) },
      { title: "Tasks", items: tasks.map((t) => ({ kind: "task", id: t.id, label: t.title, sub: taskSub(t), done: t.done, task: t })) },
    ];
    active = 0;
    draw(groups, `Nothing found for "${text}".`);
  }

  function projectSub(p) {
    if (p.type === "sales") return ["Lead", labelOf(SALES_STATUSES, p.sales_status)].filter(Boolean).join(" · ");
    return [labelOf(PROJECT_STATUSES, p.status), formatRange(p.date_start, p.date_end)].filter(Boolean).join(" · ");
  }

  function taskSub(t) {
    const parts = [names[t.project_id] || "No project"];
    if (t.done) parts.push("Done");
    else parts.push(t.due_date ? friendlyDay(t.due_date, today) : "No date");
    return parts.join(" · ");
  }

  async function pick(item) {
    if (!item) return;
    close();
    if (item.kind === "project") {
      window.location.hash = `#/project/${item.id}`;
      return;
    }
    // A task: its sheet, over the screen you're on.
    let task = item.task;
    if (!task) {
      task = await getTask(item.id).catch(() => null);
      if (!task) {
        forgetOpened("task", item.id);
        return;
      }
    }
    const meetingNames = await listMeetingNames().catch(() => []);
    openTaskSheet(task, {
      meetingNames,
      onChange: () => window.dispatchEvent(new CustomEvent("qedhq:refresh")),
    });
  }

  function highlight(n) {
    if (!items.length) return;
    active = (n + items.length) % items.length;
    resultsEl.querySelectorAll(".search-item").forEach((el) => {
      const on = Number(el.dataset.i) === active;
      el.classList.toggle("is-active", on);
      el.setAttribute("aria-selected", on);
      if (on) el.scrollIntoView({ block: "nearest" });
    });
  }

  input.addEventListener("input", () => {
    clearTimeout(timer);
    const text = input.value.trim();
    if (!text) {
      run++;
      showRecent();
      return;
    }
    timer = setTimeout(() => search(text), 150);
  });
  input.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown") { event.preventDefault(); highlight(active + 1); }
    if (event.key === "ArrowUp") { event.preventDefault(); highlight(active - 1); }
    if (event.key === "Enter") { event.preventDefault(); pick(items[active]); }
  });
  resultsEl.addEventListener("click", (event) => {
    const button = event.target.closest("[data-i]");
    if (button) pick(items[Number(button.dataset.i)]);
  });

  showRecent();
  dialog.showModal();
  input.focus();
}
