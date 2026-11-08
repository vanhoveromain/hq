// unlock.js: shown when you're logged in to hq but not to QED HQ's own
// database. Happens after a magic-link login (no password to pass on), or if
// the QED session expired. One password, once, and you're in.

import { unlock } from "../storage.js";
import { escapeHtml, icon } from "../utils/html.js";

export function render(el, { user, onUnlocked }) {
  el.innerHTML = `
    <section class="unlock">
      <span class="unlock-icon">${icon("lock")}</span>
      <h1>Unlock QED HQ</h1>
      <p class="muted">QED HQ keeps its data in its own secure space. Enter your hq password once to open it.</p>
      <form id="unlock-form" class="form" novalidate>
        <label class="field">
          <span>Email</span>
          <input type="email" value="${escapeHtml(user.email)}" autocomplete="username" readonly>
        </label>
        <label class="field">
          <span>Password</span>
          <input id="unlock-password" type="password" autocomplete="current-password" required>
        </label>
        <button type="submit" class="btn">Unlock</button>
        <p id="unlock-status" class="status" role="status"></p>
      </form>
    </section>
  `;

  const form = el.querySelector("#unlock-form");
  const password = el.querySelector("#unlock-password");
  const status = el.querySelector("#unlock-status");
  const button = form.querySelector("button");
  password.focus();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!password.value) {
      showStatus("Please type your password.", "error");
      return;
    }
    button.disabled = true;
    showStatus("Unlocking…", "");
    try {
      await unlock(user.email, password.value);
      password.value = "";
      onUnlocked();
    } catch (error) {
      showStatus(friendlyError(error), "error");
      button.disabled = false;
    }
  });

  function showStatus(text, kind) {
    status.textContent = text;
    status.className = "status " + kind;
  }
}

function friendlyError(error) {
  const text = (error.message || "").toLowerCase();
  if (text.includes("invalid login credentials")) {
    return "Wrong password, or no QED HQ account for this email yet.";
  }
  if (text.includes("rate limit") || error.status === 429) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return "Something went wrong: " + error.message;
}
