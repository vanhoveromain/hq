// bridge.js: gives the page the `window.claude.use(...)` it was built for.
//
// The schedule page (index.html) was a Claude artifact: it reads and writes
// through window.claude.use('db') and window.claude.use('user'). This file
// defines that object; the real work happens in data.js (Supabase, QED
// project). Loaded as a plain script BEFORE the page's own script, because
// the page looks for window.claude as soon as it starts.

(function () {
  let ready = null;
  const connect = () => ready || (ready = import("./data.js").then((m) => m.connect()));

  window.claude = {
    use(name) {
      if (name === "db") return connect().then((c) => c.db);
      if (name === "user") return connect().then((c) => c.user);
      return Promise.reject(new Error("Unknown: " + name));
    },
  };
})();
