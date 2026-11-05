// switcher.js: the HQ switcher, shared by every HQ (guidelines §08: a shared
// top bar with the current product identity and an HQ switcher).
//
// Served from https://ownhq.app/switcher.js. Usage, in the page's top bar:
//   <hq-switcher current="sport"></hq-switcher>
//   <script type="module" src="https://ownhq.app/switcher.js"></script>
// It shows the current HQ (symbol + name). Tapping it opens a menu with the
// HQ portal and every HQ you can open. Keyboard: Enter / Space / ↓ opens,
// ↑ ↓ Home End move, Esc closes.
//
// Colours come from the page's HQ tokens (hq-tokens.css), with fallbacks.
// Access: every HQ listed below is open to the one user today. When HQs get
// per-account access, filter SPACES by what the logged-in account may open
// (guidelines §08: the switcher respects account permissions).

const SYMBOLS = {
  // Product symbols from brand/logos/ (guidelines-v1.0/02_Logos/Products), unchanged.
  sport: `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" rx="8" fill="#75638F"/><g fill="#FFFFFF"><path d="M50 14A36 36 0 0 1 86 50H72A22 22 0 0 0 50 28Z"/><path d="M86 50A36 36 0 0 1 50 86V72A22 22 0 0 0 72 50Z"/><path d="M50 86A36 36 0 0 1 14 50H28A22 22 0 0 0 50 72Z"/><path d="M14 50A36 36 0 0 1 50 14V28A22 22 0 0 0 28 50Z"/><circle cx="50" cy="50" r="9"/></g></svg>`,
  qed: `<svg viewBox="0 0 100 100" aria-hidden="true" focusable="false"><rect width="100" height="100" rx="8" fill="#547B91"/><g fill="#FFFFFF"><path d="M48 46L34 32L40 26L54 40Z"/><path d="M54 44L70 29L76 35L60 50Z"/><path d="M50 58L50 75L59 75L59 58Z"/><rect x="17" y="14" width="25" height="25" rx="5"/><rect x="65" y="14" width="25" height="25" rx="5"/><rect x="42" y="69" width="25" height="22" rx="5"/><path d="M54 34L70 50L54 66L38 50Z"/></g></svg>`,
  // Parent HQ mark (provisional redraw, brand/export.mjs), in the text colour.
  hq: `<svg viewBox="4.6 10.2 82.5 80" aria-hidden="true" focusable="false"><g fill="currentColor" transform="translate(.6 .7)"><path d="M59 12.42A40 40 0 0 0 20 81.5L20 70.67A32 32 0 0 1 59 21.23Z"/><path d="M68 17.5A40 40 0 0 1 78.95 68.95L73.01 63.01A32 32 0 0 0 68 28.33Z"/><path d="M29 86.58A40 40 0 0 0 73.5 76.5L67.84 70.84A32 32 0 0 1 29 77.77Z"/><path d="M67.84 70.84L86.5 89.5L75.5 89.5L62.34 76.34Z"/><path d="M29 32L37 28L37 85L29 85Z"/><path d="M51 15L59 15L59 67L51 71Z"/><path d="M36.5 46H51.5V53H36.5Z"/></g></svg>`,
};

const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(window.location.hostname);

// The HQ portal first, then each HQ. Work HQ and Personal HQ are planned: they
// join this list when they exist (guidelines §02: no invented URLs).
const SPACES = [
  { id: "hq", name: "All HQs", url: ON_OWNHQ ? "https://ownhq.app/" : "/_hq/" },
  { id: "qed", name: "QED HQ", url: "https://qed.ownhq.app/" },
  { id: "sport", name: "Sport HQ", url: ON_OWNHQ ? "https://sport.ownhq.app/" : "/" },
];

const CSS = `
hq-switcher{position:relative;display:inline-flex;min-width:0}
.hqsw-btn{display:inline-flex;align-items:center;gap:10px;min-width:0;min-height:40px;margin:0 0 0 -6px;padding:4px 8px 4px 6px;border:0;border-radius:var(--hq-radius,8px);background:none;color:var(--hq-primary-text,#242424);font:600 16px/1.2 var(--hq-font,system-ui,sans-serif);letter-spacing:-.01em;cursor:pointer;transition:background-color var(--hq-ease,160ms ease)}
.hqsw-btn:hover{background:var(--hq-subtle,#F2F2F0)}
.hqsw-btn:focus-visible{outline:2px solid var(--hq-accent,#242424);outline-offset:2px}
.hqsw-btn .hqsw-sym{width:28px;height:28px;flex:none;display:block}
.hqsw-btn .hqsw-sym svg{width:100%;height:100%;display:block}
.hqsw-name{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.hqsw-caret{width:16px;height:16px;flex:none;color:var(--hq-secondary-text,#666);transition:transform var(--hq-ease,160ms ease)}
.hqsw-btn[aria-expanded="true"] .hqsw-caret{transform:rotate(180deg)}
.hqsw-menu{position:absolute;top:calc(100% + 6px);left:-6px;z-index:100;min-width:248px;padding:6px;margin:0;list-style:none;background:var(--hq-surface,#fff);border:1px solid var(--hq-border,#E5E5E3);border-radius:var(--hq-radius,8px);box-shadow:var(--hq-shadow-pop,0 8px 24px rgba(0,0,0,.12))}
.hqsw-menu[hidden]{display:none}
.hqsw-label{padding:6px 10px 4px;font:500 12px/1.4 var(--hq-font,system-ui,sans-serif);color:var(--hq-secondary-text,#666)}
.hqsw-item{display:flex;align-items:center;gap:12px;min-height:44px;padding:6px 10px;border-radius:var(--hq-radius-sm,6px);color:var(--hq-primary-text,#242424);text-decoration:none;font:500 14px/1.3 var(--hq-font,system-ui,sans-serif)}
.hqsw-item:hover,.hqsw-item:focus-visible{background:var(--hq-subtle,#F2F2F0);outline:none}
.hqsw-item:focus-visible{box-shadow:inset 0 0 0 2px var(--hq-accent,#242424)}
.hqsw-item .hqsw-sym{width:28px;height:28px;flex:none;display:grid;place-items:center}
.hqsw-item .hqsw-sym svg{width:28px;height:28px;display:block}
.hqsw-item .hqsw-sym.is-hq svg{width:22px;height:22px}
.hqsw-item .hqsw-check{margin-left:auto;width:16px;height:16px;color:var(--hq-accent-text,#242424)}
.hqsw-sep{height:1px;margin:6px 4px;background:var(--hq-border,#E5E5E3)}
@media (prefers-reduced-motion: reduce){.hqsw-btn,.hqsw-caret{transition:none}}
`;

const CARET = `<svg class="hqsw-caret" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
const CHECK = `<svg class="hqsw-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>`;

let count = 0;

class HqSwitcher extends HTMLElement {
  connectedCallback() {
    if (this.dataset.ready) return;
    this.dataset.ready = "1";
    if (!document.getElementById("hqsw-css")) {
      const style = document.createElement("style");
      style.id = "hqsw-css";
      style.textContent = CSS;
      document.head.append(style);
    }
    const current = SPACES.find((s) => s.id === this.getAttribute("current")) || SPACES[0];
    const label = current.id === "hq" ? "HQ" : current.name;
    const menuId = `hqsw-menu-${++count}`;

    const item = (s) => `<li role="none"><a role="menuitem" class="hqsw-item" href="${s.url}" ${s.id === current.id ? 'aria-current="page"' : ""}>
      <span class="hqsw-sym ${s.id === "hq" ? "is-hq" : ""}">${SYMBOLS[s.id]}</span>
      <span>${s.name}</span>${s.id === current.id ? CHECK : ""}</a></li>`;

    this.innerHTML = `<button type="button" class="hqsw-btn" aria-haspopup="menu" aria-expanded="false" aria-controls="${menuId}" aria-label="${label}, switch HQ">
        <span class="hqsw-sym">${SYMBOLS[current.id]}</span><span class="hqsw-name">${label}</span>${CARET}</button>
      <ul class="hqsw-menu" id="${menuId}" role="menu" aria-label="Switch HQ" hidden>
        ${item(SPACES[0])}<li role="separator" class="hqsw-sep"></li>
        <li role="presentation" class="hqsw-label">Your HQs</li>
        ${SPACES.slice(1).map(item).join("")}
      </ul>`;

    const button = this.querySelector(".hqsw-btn");
    const menu = this.querySelector(".hqsw-menu");
    const links = () => [...menu.querySelectorAll('[role="menuitem"]')];

    const open = (focusIndex = 0) => {
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      links()[focusIndex]?.focus();
    };
    const close = (refocus = true) => {
      if (menu.hidden) return;
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
      if (refocus) button.focus();
    };

    button.addEventListener("click", () => (menu.hidden ? open() : close()));
    button.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); open(0); }
      if (e.key === "ArrowUp") { e.preventDefault(); open(links().length - 1); }
    });
    menu.addEventListener("keydown", (e) => {
      const all = links();
      const i = all.indexOf(document.activeElement);
      if (e.key === "Escape") { e.preventDefault(); close(); }
      else if (e.key === "ArrowDown") { e.preventDefault(); all[(i + 1) % all.length].focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); all[(i - 1 + all.length) % all.length].focus(); }
      else if (e.key === "Home") { e.preventDefault(); all[0].focus(); }
      else if (e.key === "End") { e.preventDefault(); all[all.length - 1].focus(); }
      else if (e.key === "Tab") close(false);
    });
    document.addEventListener("click", (e) => { if (!this.contains(e.target)) close(false); });
  }
}

if (!customElements.get("hq-switcher")) customElements.define("hq-switcher", HqSwitcher);
