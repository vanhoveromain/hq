// colResize.js: task-list columns you can widen or narrow on a laptop
// (Romain, 2026-11-15). Drag the thin handle on the right of a column title;
// double-click it to put that column back to its normal width. Widths are
// remembered on this device (localStorage "qedhq.cols") and apply to every
// task list (Priorities, project page, routines). Phones and narrow windows
// use stacked rows, so nothing changes there.
//
// How: each column's width is a CSS variable on <html> (--w-task, --w-due…);
// css/app.css builds --task-cols from them, with the normal width as fallback.

const KEY = "qedhq.cols";
// Smallest width per column (px), so a column never disappears.
export const RESIZABLE = { task: 140, project: 90, due: 64, period: 50, priority: 64, scope: 140, status: 90 };

function load() {
  try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; }
}
function save(widths) {
  try { localStorage.setItem(KEY, JSON.stringify(widths)); } catch { /* private mode: this visit only */ }
}
function apply(widths) {
  const root = document.documentElement.style;
  for (const col of Object.keys(RESIZABLE)) {
    if (widths[col]) root.setProperty(`--w-${col}`, `${widths[col]}px`);
    else root.removeProperty(`--w-${col}`);
  }
}

// A handle for a column title (taskListInnerHtml).
export const handleHtml = (col) =>
  `<span class="col-resize" data-resize="${col}" title="Drag to resize · double-click to reset" aria-hidden="true"></span>`;

// Once, from main.js: saved widths + one listener for every handle.
export function wireColumnResize() {
  const widths = load();
  apply(widths);

  document.addEventListener("pointerdown", (event) => {
    const handle = event.target.closest("[data-resize]");
    if (!handle || event.button !== 0) return;
    event.preventDefault();
    const col = handle.dataset.resize;
    const startX = event.clientX;
    const startW = handle.parentElement.getBoundingClientRect().width;
    document.body.classList.add("is-resizing");
    const move = (e) => {
      widths[col] = Math.round(Math.max(RESIZABLE[col], startW + e.clientX - startX));
      apply(widths);
    };
    const up = () => {
      document.removeEventListener("pointermove", move);
      document.removeEventListener("pointerup", up);
      document.body.classList.remove("is-resizing");
      save(widths);
    };
    document.addEventListener("pointermove", move);
    document.addEventListener("pointerup", up);
  });

  document.addEventListener("dblclick", (event) => {
    const handle = event.target.closest("[data-resize]");
    if (!handle) return;
    delete widths[handle.dataset.resize];
    apply(widths);
    save(widths);
  });
}
