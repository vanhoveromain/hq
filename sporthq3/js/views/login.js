// Login screen: type your email, get a magic link.

import { sendMagicLink } from "../storage.js";

const EMAIL_KEY = "sporthq3.lastEmail"; // remembered on this device only
const COOLDOWN_SECONDS = 60;            // Supabase allows ~1 link per minute

export function render(container, { message = "" } = {}) {
  container.innerHTML = `
    <section class="card login">
      <h2>Welcome back</h2>
      <p class="muted">Enter your email and we'll send you a login link. No password needed.</p>
      <form id="login-form" novalidate>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email"
               inputmode="email" required placeholder="you@example.com">
        <button type="submit" class="button primary">Send me a magic link</button>
      </form>
      <p id="login-status" class="status" role="status"></p>
    </section>
  `;

  const form = container.querySelector("#login-form");
  const input = container.querySelector("#email");
  const button = form.querySelector("button");
  const status = container.querySelector("#login-status");

  input.value = readSavedEmail();
  if (message) showStatus(status, message, "error");

  form.addEventListener("submit", async (event) => {
    event.preventDefault(); // stop the browser from reloading the page

    const email = input.value.trim();
    if (!input.checkValidity() || !email) {
      showStatus(status, "Please enter a valid email address.", "error");
      return;
    }

    button.disabled = true;
    showStatus(status, "Sending…", "");

    try {
      await sendMagicLink(email);
      saveEmail(email);
      showStatus(status,
        "Check your inbox ✉️ Open the link on this same device and browser.", "ok");
      startCooldown(button);
    } catch (error) {
      showStatus(status, friendlyError(error), "error");
      button.disabled = false;
    }
  });
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}

// Supabase's error messages are technical; translate the common ones.
function friendlyError(error) {
  const text = (error.message || "").toLowerCase();
  if (text.includes("signups not allowed")) {
    return "This email has no account. Use the email you created in Supabase.";
  }
  if (text.includes("rate limit") || error.status === 429) {
    return "Too many emails sent. Wait a few minutes and try again.";
  }
  return "Something went wrong: " + error.message;
}

// Keeps the button disabled for a minute and shows a countdown on it.
function startCooldown(button) {
  let secondsLeft = COOLDOWN_SECONDS;
  const originalText = button.textContent;
  const timer = setInterval(() => {
    secondsLeft -= 1;
    button.textContent = `Send again in ${secondsLeft}s`;
    if (secondsLeft <= 0) {
      clearInterval(timer);
      button.textContent = originalText;
      button.disabled = false;
    }
  }, 1000);
}

// localStorage can be blocked (private browsing), so never let it crash the page.
function readSavedEmail() {
  try { return localStorage.getItem(EMAIL_KEY) || ""; } catch { return ""; }
}
function saveEmail(email) {
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* not important */ }
}
