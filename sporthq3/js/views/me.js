// "Me" screen: who is logged in + sign out.
// Later: body & goals, shoes, training blocks, export.

import { signOut } from "../storage.js";

export function render(container, { user }) {
  container.innerHTML = `
    <section class="card">
      <h2>Account</h2>
      <p>Logged in as <strong class="email"></strong></p>
      <button id="sign-out" class="button">Sign out</button>
      <p id="me-status" class="status" role="status"></p>
    </section>
    <section class="card placeholder">
      <p>Body &amp; goals, shoes and training blocks will live here (steps 4, 8, 9).</p>
    </section>
  `;

  // textContent (not innerHTML) so an email can never be read as HTML code.
  container.querySelector(".email").textContent = user.email;

  container.querySelector("#sign-out").addEventListener("click", async () => {
    try {
      await signOut(); // main.js hears the logout and shows the login screen
    } catch (error) {
      const status = container.querySelector("#me-status");
      status.textContent = "Could not sign out: " + error.message;
      status.className = "status error";
    }
  });
}
