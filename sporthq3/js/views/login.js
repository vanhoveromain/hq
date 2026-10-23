// Login screen: email + password, or (backup) a magic link by email.
//
// Why both? On iPhone, a home-screen app keeps its login separate from
// Safari, and email links always open in Safari. So inside the home-screen
// app, the password is the way in. The link is handy the first time
// (before you've set a password) or if you forget it.

import { sendMagicLink, signInWithPassword } from "../storage.js?v=202610231428";

const EMAIL_KEY = "sporthq3.lastEmail"; // remembered on this device only
const COOLDOWN_SECONDS = 60;            // Supabase allows ~1 email per minute

export function render(container, { message = "" } = {}) {
  container.innerHTML = `
    <section class="card login">
      <h2>Welcome back</h2>
      <form id="login-form" novalidate>
        <label for="email">Email</label>
        <!-- autocomplete="username" + "current-password" let the iPhone/Mac
             password manager fill both boxes in -->
        <input id="email" name="email" type="email" autocomplete="username"
               inputmode="email" required placeholder="you@example.com">
        <label for="password">Password</label>
        <input id="password" name="password" type="password" autocomplete="current-password">
        <button type="submit" class="button primary">Log in</button>
      </form>
      <p id="login-status" class="status" role="status"></p>

      <div class="login-alt">
        <p class="muted">No password yet, or forgot it?</p>
        <button id="send-link" type="button" class="button">Email me a login link instead</button>
      </div>
    </section>
  `;

  const loginForm = container.querySelector("#login-form");
  const emailInput = container.querySelector("#email");
  const passwordInput = container.querySelector("#password");
  const loginButton = loginForm.querySelector("button");
  const linkButton = container.querySelector("#send-link");
  const status = container.querySelector("#login-status");

  emailInput.value = readSavedEmail();
  if (message) showStatus(status, message, "error");

  // Log in with password.
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // stop the browser from reloading the page

    const email = readEmail(emailInput, status);
    if (!email) return;
    if (!passwordInput.value) {
      showStatus(status, "Please type your password, or use the login link below.", "error");
      return;
    }

    loginButton.disabled = true;
    showStatus(status, "Logging in…", "");
    try {
      await signInWithPassword(email, passwordInput.value);
      saveEmail(email);
      // main.js now hears "logged in" and replaces this screen.
    } catch (error) {
      showStatus(status, friendlyError(error), "error");
      loginButton.disabled = false;
    }
  });

  // Backup: send a magic link.
  linkButton.addEventListener("click", async () => {
    const email = readEmail(emailInput, status);
    if (!email) return;

    linkButton.disabled = true;
    showStatus(status, "Sending…", "");
    try {
      await sendMagicLink(email);
      saveEmail(email);
      showStatus(status,
        "Check your inbox. The link opens in your browser (Safari on iPhone), not in the home-screen app.", "ok");
      startCooldown(linkButton);
    } catch (error) {
      showStatus(status, friendlyError(error), "error");
      linkButton.disabled = false;
    }
  });
}

function readEmail(input, status) {
  const email = input.value.trim();
  if (!email || !input.checkValidity()) {
    showStatus(status, "Please enter a valid email address.", "error");
    return null;
  }
  return email;
}

function showStatus(element, text, kind) {
  element.textContent = text;
  element.className = "status " + kind;
}

// Supabase's error messages are technical; translate the common ones.
function friendlyError(error) {
  const text = (error.message || "").toLowerCase();
  if (text.includes("invalid login credentials")) {
    return "Wrong email or password. (No password set yet? Use the login link below.)";
  }
  if (text.includes("signups not allowed")) {
    return "This email has no account. Use the email you created in Supabase.";
  }
  if (text.includes("rate limit") || error.status === 429) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return "Something went wrong: " + error.message;
}

// Keeps a button disabled for a minute and shows a countdown on it.
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
