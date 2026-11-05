// home.js: the ownhq.app page. Log in here once, then open any hq.
//
// Arriving with ?next=https://sport.ownhq.app/… means another hq sent you
// here to log in: once you are logged in, you go straight back there.

import {
  getUser, onAuthChange, signInWithPassword, sendMagicLink, signOut,
  safeNext, loginErrorFromUrl,
} from "./auth.js";

const EMAIL_KEY = "hq.lastEmail"; // remembered on this device only
const COOLDOWN_SECONDS = 60;      // Supabase allows ~1 email per minute

const next = safeNext(new URLSearchParams(window.location.search).get("next"));
const root = document.documentElement;
const form = document.getElementById("login-form");
const emailInput = document.getElementById("email");
const passwordInput = document.getElementById("password");
const loginButton = form.querySelector('button[type="submit"]');
const linkButton = document.getElementById("send-link");
const status = document.getElementById("login-status");

function show(user) {
  if (user && next) {
    window.location.replace(next); // back to the hq that sent you here
    return;
  }
  root.dataset.auth = user ? "in" : "out";
  if (user) greet(user);
}

// Logged-in header: today's date, a greeting for the time of day, and who
// is logged in (top bar).
function greet(user) {
  const now = new Date();
  const hour = now.getHours();
  const part = hour < 5 ? "evening" : hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  document.getElementById("greeting").textContent = `Good ${part}`;
  document.getElementById("today").textContent = now.toLocaleDateString("en-GB", {
    weekday: "long", day: "numeric", month: "long",
  });
  document.getElementById("who").textContent = user.email || "";
}

async function start() {
  emailInput.value = readSavedEmail();
  const reason = loginErrorFromUrl();
  if (reason) showStatus(reason + ". Please ask for a new link.", "error");

  let user = null;
  try {
    user = await getUser();
  } catch (error) {
    showStatus("Could not check your login: " + error.message, "error");
  }
  show(user);
  onAuthChange(show);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = readEmail();
  if (!email) return;
  if (!passwordInput.value) {
    showStatus("Please type your password, or use the login link below.", "error");
    return;
  }
  loginButton.disabled = true;
  showStatus("Logging in…", "");
  try {
    await signInWithPassword(email, passwordInput.value);
    saveEmail(email);
    passwordInput.value = "";
    showStatus("", "");
    // onAuthChange now shows the cards (or sends you back to ?next=).
  } catch (error) {
    showStatus(friendlyError(error), "error");
  }
  loginButton.disabled = false;
});

linkButton.addEventListener("click", async () => {
  const email = readEmail();
  if (!email) return;
  linkButton.disabled = true;
  showStatus("Sending…", "");
  try {
    await sendMagicLink(email);
    saveEmail(email);
    showStatus("Check your inbox. The link opens in your browser (Safari on iPhone), not in a home-screen app.", "ok");
    startCooldown(linkButton);
  } catch (error) {
    showStatus(friendlyError(error), "error");
    linkButton.disabled = false;
  }
});

const logoutButton = document.getElementById("logout");
logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await signOut();
  } catch {
    // Even if the server can't be reached, the local session is cleared.
  }
  logoutButton.disabled = false;
  show(null);
});

function readEmail() {
  const email = emailInput.value.trim();
  if (!email || !emailInput.checkValidity()) {
    showStatus("Please enter a valid email address.", "error");
    return null;
  }
  return email;
}

function showStatus(text, kind) {
  status.textContent = text;
  status.className = "status " + kind;
}

// Supabase's error messages are technical; translate the common ones.
function friendlyError(error) {
  const text = (error.message || "").toLowerCase();
  if (text.includes("invalid login credentials")) {
    return "Wrong email or password. (No password set yet? Use the login link below.)";
  }
  if (text.includes("signups not allowed")) {
    return "This email has no account.";
  }
  if (text.includes("rate limit") || error.status === 429) {
    return "Too many attempts. Wait a few minutes and try again.";
  }
  return "Something went wrong: " + error.message;
}

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

// localStorage can be blocked (private browsing): never let it crash the page.
function readSavedEmail() {
  try { return localStorage.getItem(EMAIL_KEY) || ""; } catch { return ""; }
}
function saveEmail(email) {
  try { localStorage.setItem(EMAIL_KEY, email); } catch { /* not important */ }
}

start();
