// Settings (opened from the Me tab): account, password, JSON backup.

import { signOut, setPassword, exportAllData } from "../storage.js?v=202610142138";
import { todayISO, formatDayLabel } from "../utils/dates.js?v=202610142138";

const MIN_PASSWORD_LENGTH = 12;
const LAST_EXPORT_KEY = "sporthq3.lastExport"; // remembered on this device only

export function render(container, { user }) {
  container.innerHTML = `
    <a href="#/me" class="back-link">‹ Me</a>

    <section class="card">
      <h2>Account</h2>
      <p>Logged in as <strong class="email"></strong></p>
      <button id="sign-out" class="button">Sign out</button>
      <p id="me-status" class="status" role="status"></p>
    </section>

    <section class="card">
      <h2>Password</h2>
      <p class="muted">Needed to log in from the iPhone home-screen app.
        Let your iPhone or Mac suggest a strong one and save it.</p>
      <form id="password-form" novalidate>
        <!-- A hidden copy of your email tells the password manager which
             account this new password belongs to. -->
        <input type="email" name="username" autocomplete="username" class="visually-hidden" tabindex="-1" aria-hidden="true">
        <label for="new-password">New password</label>
        <input id="new-password" type="password" autocomplete="new-password" minlength="${MIN_PASSWORD_LENGTH}">
        <label for="confirm-password">Type it again</label>
        <input id="confirm-password" type="password" autocomplete="new-password">
        <button type="submit" class="button primary">Save password</button>
      </form>
      <p id="password-status" class="status" role="status"></p>
    </section>

    <section class="card">
      <h2>💾 Backup</h2>
      <p class="muted">Downloads everything you saved in the app as one file (JSON): activities, match cards,
        plan, catalogue, races, blocks, shoes, weight, PBs. Keep it somewhere safe (e.g. iCloud Drive).</p>
      <p id="last-export" class="small"></p>
      <button id="export" type="button" class="button primary">Export my data</button>
      <p id="export-status" class="status" role="status"></p>
    </section>
  `;

  // textContent / .value (not innerHTML) so an email can never be read as HTML code.
  container.querySelector(".email").textContent = user.email;
  container.querySelector('input[name="username"]').value = user.email;

  showLastExport(container.querySelector("#last-export"));
  container.querySelector("#export").addEventListener("click", () => runExport(container));

  container.querySelector("#sign-out").addEventListener("click", async () => {
    try {
      await signOut(); // main.js hears the logout and shows the login screen
    } catch (error) {
      showStatus(container.querySelector("#me-status"), "Could not sign out: " + error.message, "error");
    }
  });

  const form = container.querySelector("#password-form");
  const status = container.querySelector("#password-status");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const password = form.querySelector("#new-password").value;
    const confirm = form.querySelector("#confirm-password").value;

    if (password.length < MIN_PASSWORD_LENGTH) {
      showStatus(status, `Use at least ${MIN_PASSWORD_LENGTH} characters.`, "error");
      return;
    }
    if (password !== confirm) {
      showStatus(status, "The two passwords are different.", "error");
      return;
    }

    const button = form.querySelector("button");
    button.disabled = true;
    showStatus(status, "Saving…", "");
    try {
      await setPassword(password);
      form.reset();
      showStatus(status, "Password saved ✅ You can now log in with it, also from the home-screen app.", "ok");
    } catch (error) {
      showStatus(status, friendlyPasswordError(error), "error");
    }
    button.disabled = false;
  });
}

function friendlyPasswordError(error) {
  const text = (error.message || "").toLowerCase();
  if (text.includes("reauthenticat") || text.includes("recent")) {
    return "For safety, Supabase wants a fresh login first. Sign out, log in again with the link, then set the password.";
  }
  if (text.includes("same") && text.includes("password")) {
    return "That's already your password. Choose a new one.";
  }
  if (text.includes("weak") || text.includes("characters")) {
    return "Supabase finds this password too weak: " + error.message;
  }
  return "Could not save the password: " + error.message;
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}


// ---------- Backup ----------

function showLastExport(el) {
  let last = null;
  try { last = localStorage.getItem(LAST_EXPORT_KEY); } catch { /* not important */ }
  if (!last) {
    el.textContent = "No export yet on this device.";
    return;
  }
  const days = Math.round((Date.parse(todayISO()) - Date.parse(last)) / 86400000);
  el.textContent = `Last export: ${days === 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`} (${formatDayLabel(last)}).`;
  if (days > 30) el.textContent += " Time for a new one!";
}

async function runExport(container) {
  const button = container.querySelector("#export");
  const status = container.querySelector("#export-status");
  button.disabled = true;
  showStatus(status, "Collecting your data…", "");
  try {
    const tables = await exportAllData();
    const backup = {
      app: "SportHQ3",
      exported_at: new Date().toISOString(),
      counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
      tables,
    };
    // Make a file in memory (a "Blob") and click a hidden download link to it.
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `sporthq3-backup-${todayISO()}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);

    try { localStorage.setItem(LAST_EXPORT_KEY, todayISO()); } catch { /* not important */ }
    showLastExport(container.querySelector("#last-export"));
    const total = Object.values(backup.counts).reduce((a, b) => a + b, 0);
    showStatus(status, `Done: ${total} rows in ${link.download}`, "ok");
  } catch (error) {
    showStatus(status, "Could not export: " + error.message, "error");
  } finally {
    button.disabled = false;
  }
}
