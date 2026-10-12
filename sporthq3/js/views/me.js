// "Me" screen: who is logged in, set a password, sign out.
// Later: body & goals, shoes, training blocks, export.

import { signOut, setPassword } from "../storage.js";

const MIN_PASSWORD_LENGTH = 12;

export function render(container, { user }) {
  container.innerHTML = `
    <nav class="card menu" aria-label="More">
      <a href="#/shoes">👟 Shoes <span aria-hidden="true">›</span></a>
    </nav>

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

    <section class="card placeholder">
      <p>Training blocks and body &amp; goals will live here too (steps 10 and 11).</p>
    </section>
  `;

  // textContent / .value (not innerHTML) so an email can never be read as HTML code.
  container.querySelector(".email").textContent = user.email;
  container.querySelector('input[name="username"]').value = user.email;

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
