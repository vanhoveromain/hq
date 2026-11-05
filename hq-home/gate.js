// gate.js: puts a static hq page behind the shared hq login.
//
// Add these two lines to the page's <head>:
//   <style id="hq-gate">html{visibility:hidden}</style>
//   <script type="module" src="https://ownhq.app/gate.js"></script>
//
// The page stays hidden until we know you're logged in. Not logged in: off to
// the hq login page (ownhq.app) and back afterwards. Logged out later (here or
// on another hq site): back to the login page.
//
// Note: this hides the page, it does not protect the file. Anyone who fetches
// the file directly can still read it. Don't rely on it for secrets.
//
// Opened anywhere else than an ownhq.app site (a downloaded copy, a local
// preview): no login check, the page simply shows.

const ON_OWNHQ = /(^|\.)ownhq\.app$/.test(window.location.hostname);

function reveal() {
  const gate = document.getElementById("hq-gate");
  if (gate) gate.remove();
}

if (!ON_OWNHQ) {
  reveal();
} else {
  try {
    // "./auth.js" = next to this file, so https://ownhq.app/auth.js
    const { requireLogin, onAuthChange, loginUrl } = await import("./auth.js");
    await requireLogin();
    reveal();
    onAuthChange((user) => {
      if (!user) window.location.replace(loginUrl(window.location.href));
    });
  } catch {
    // The login check couldn't load: send to the login page rather than show the page.
    window.location.replace("https://ownhq.app/?next=" + encodeURIComponent(window.location.href));
  }
}
