// Login screen: type your email, get an email with a magic link AND a code.
// Either click the link, or type the code here (best for the home-screen app).

import { sendMagicLink, verifyEmailCode } from "../storage.js";

const EMAIL_KEY = "sporthq3.lastEmail"; // remembered on this device only
const COOLDOWN_SECONDS = 60;            // Supabase allows ~1 email per minute

export function render(container, { message = "" } = {}) {
  container.innerHTML = `
    <section class="card login">
      <h2>Welcome back</h2>
      <p class="muted">Enter your email. We'll send you a login link and a code. No password needed.</p>
      <form id="login-form" novalidate>
        <label for="email">Email</label>
        <input id="email" name="email" type="email" autocomplete="email"
               inputmode="email" required placeholder="you@example.com">
        <button type="submit" class="button primary">Send me a login email</button>
      </form>
      <p id="login-status" class="status" role="status"></p>

      <form id="code-form" class="code-form" novalidate hidden>
        <label for="code">Code from the email</label>
        <!-- autocomplete="one-time-code" lets the iPhone suggest the code from Mail -->
        <input id="code" name="code" type="text" inputmode="numeric" autocomplete="one-time-code"
               pattern="[0-9]*" maxlength="10" placeholder="123456">
        <button type="submit" class="button primary">Log in with code</button>
      </form>
      <button id="show-code" type="button" class="link-button">I already have a code</button>
    </section>
  `;

  const loginForm = container.querySelector("#login-form");
  const emailInput = container.querySelector("#email");
  const sendButton = loginForm.querySelector("button");
  const codeForm = container.querySelector("#code-form");
  const codeInput = container.querySelector("#code");
  const showCodeButton = container.querySelector("#show-code");
  const status = container.querySelector("#login-status");

  emailInput.value = readSavedEmail();
  if (message) showStatus(status, message, "error");

  function revealCodeForm() {
    codeForm.hidden = false;
    showCodeButton.hidden = true;
  }
  showCodeButton.addEventListener("click", () => {
    revealCodeForm();
    codeInput.focus();
  });

  // Step 1: send the email.
  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault(); // stop the browser from reloading the page

    const email = readEmail(emailInput, status);
    if (!email) return;

    sendButton.disabled = true;
    showStatus(status, "Sending…", "");
    try {
      await sendMagicLink(email);
      saveEmail(email);
      showStatus(status, "Check your inbox ✉️ Type the code below, or open the link on this device.", "ok");
      revealCodeForm();
      startCooldown(sendButton);
    } catch (error) {
      showStatus(status, friendlyError(error), "error");
      sendButton.disabled = false;
    }
  });

  // Step 2 (optional): log in with the code instead of the link.
  codeForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = readEmail(emailInput, status);
    if (!email) return;

    const code = codeInput.value.replace(/\s/g, ""); // "123 456" -> "123456"
    if (!/^\d{6,10}$/.test(code)) {
      showStatus(status, "The code is the number in the email (usually 6 digits).", "error");
      return;
    }

    const codeButton = codeForm.querySelector("button");
    codeButton.disabled = true;
    showStatus(status, "Checking the code…", "");
    try {
      await verifyEmailCode(email, code);
      saveEmail(email);
      // main.js now hears "logged in" and replaces this screen.
    } catch (error) {
      showStatus(status, friendlyError(error), "error");
      codeButton.disabled = false;
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
  if (text.includes("signups not allowed")) {
    return "This email has no account. Use the email you created in Supabase.";
  }
  if (text.includes("rate limit") || error.status === 429) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  if (text.includes("expired") || text.includes("invalid")) {
    return "That code is wrong or has expired. Check the latest email, or ask for a new one.";
  }
  return "Something went wrong: " + error.message;
}

// Keeps the send button disabled for a minute and shows a countdown on it.
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
