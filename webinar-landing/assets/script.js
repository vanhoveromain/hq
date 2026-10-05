/* QED Webinars — interactions (shared by landing page and brand guidelines) */
(function () {
  "use strict";

  // TODO: confirm the inbox that should receive webinar requests.
  var CONTACT_EMAIL = "info@qed.eu";

  document.documentElement.classList.remove("no-js");
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- Toast ---------- */
  var toastEl = $("#toast"), toastTimer;
  function toast(html) {
    if (!toastEl) return;
    toastEl.innerHTML = html;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove("is-visible"); }, 2400);
  }

  /* ---------- Sticky header + mobile nav ---------- */
  var header = $(".site-header");
  var onScroll = function () { if (header) header.classList.toggle("is-scrolled", window.scrollY > 8); };
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var toggle = $(".nav__toggle"), menu = $("#nav-menu");
  function setMenu(open) {
    if (!toggle) return;
    toggle.setAttribute("aria-expanded", String(open));
    toggle.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    menu.classList.toggle("is-open", open);
  }
  if (toggle) {
    toggle.addEventListener("click", function () { setMenu(toggle.getAttribute("aria-expanded") !== "true"); });
    $$("a", menu).forEach(function (a) { a.addEventListener("click", function () { setMenu(false); }); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") setMenu(false); });
  }

  /* ---------- Active nav link on scroll ---------- */
  var navLinks = $$('.nav__links a[href^="#"]:not(.btn)');
  if ("IntersectionObserver" in window && navLinks.length) {
    var map = {};
    navLinks.forEach(function (a) { map[a.getAttribute("href").slice(1)] = a; });
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting && map[en.target.id]) {
          navLinks.forEach(function (a) { a.classList.remove("is-active"); });
          map[en.target.id].classList.add("is-active");
        }
      });
    }, { rootMargin: "-45% 0px -50% 0px" });
    Object.keys(map).forEach(function (id) { var s = document.getElementById(id); if (s) spy.observe(s); });
  }

  /* ---------- Reveal on scroll ---------- */
  var reveals = $$(".reveal");
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) { en.target.classList.add("is-visible"); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    reveals.forEach(function (el, i) { el.style.transitionDelay = (i % 4) * 60 + "ms"; io.observe(el); });
  } else {
    reveals.forEach(function (el) { el.classList.add("is-visible"); });
  }

  /* ---------- Hero studio mock ---------- */
  var clock = $("#studio-clock"), qa = $("#qa-count");
  if (clock) {
    var start = Date.now(), q = 0;
    var pad = function (n) { return String(n).padStart(2, "0"); };
    setInterval(function () {
      var s = Math.floor((Date.now() - start) / 1000);
      clock.textContent = pad(Math.floor(s / 3600)) + ":" + pad(Math.floor(s / 60) % 60) + ":" + pad(s % 60);
      if (qa && Math.random() > 0.55) qa.textContent = String(++q);
    }, 1000);
    setTimeout(function () { $$(".poll-bar i").forEach(function (b) { b.style.width = b.dataset.w; }); }, 600);
  }

  /* ---------- Tabs (WAI-ARIA pattern) ---------- */
  $$('[role="tablist"]').forEach(function (list) {
    var tabs = $$('[role="tab"]', list);
    function select(tab) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        document.getElementById(t.getAttribute("aria-controls")).hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.addEventListener("click", function () { select(t); });
      t.addEventListener("keydown", function (e) {
        var n = null;
        if (e.key === "ArrowRight") n = tabs[(i + 1) % tabs.length];
        if (e.key === "ArrowLeft") n = tabs[(i - 1 + tabs.length) % tabs.length];
        if (e.key === "Home") n = tabs[0];
        if (e.key === "End") n = tabs[tabs.length - 1];
        if (n) { e.preventDefault(); select(n); n.focus(); }
      });
    });
  });

  /* ---------- FAQ accordion ---------- */
  $$(".faq__q").forEach(function (btn) {
    btn.addEventListener("click", function () {
      btn.setAttribute("aria-expanded", String(btn.getAttribute("aria-expanded") !== "true"));
    });
  });

  /* ---------- Webinar builder ---------- */
  var builder = $("#builder-form");
  var PRESETS = {
    live: { format: "f-live", services: ["s-coord", "s-speakers", "s-platform", "s-engage", "s-reg"] },
    hybrid: { format: "f-hybrid", services: ["s-coord", "s-venue", "s-speakers", "s-av", "s-engage", "s-reg", "s-hosts"] },
    studio: { format: "f-studio", services: ["s-coord", "s-studio", "s-av", "s-brand", "s-video"] },
    demand: { format: "f-demand", services: ["s-video", "s-report", "s-marketing"] }
  };

  function getSelection() {
    if (!builder) return null;
    var fmt = $('input[name="format"]:checked', builder);
    var services = $$('input[type="checkbox"]:checked', builder).map(function (i) { return { name: i.value, cat: i.dataset.cat }; });
    return { format: fmt ? fmt.value : "", services: services };
  }

  function renderSummary() {
    var sel = getSelection(); if (!sel) return;
    var total = $$('input[type="checkbox"]', builder).length;
    var list = $("#summary-list");
    $("#summary-format").textContent = sel.format;
    list.innerHTML = "";
    sel.services.forEach(function (s) {
      var li = document.createElement("li");
      var a = document.createElement("span"); a.textContent = s.name;
      var b = document.createElement("span"); b.textContent = s.cat;
      li.appendChild(a); li.appendChild(b); list.appendChild(li);
    });
    var n = sel.services.length;
    $("#summary-empty").hidden = n > 0;
    $("#summary-meter").style.width = Math.round((n / total) * 100) + "%";
    $("#summary-label").textContent = n === 0 ? "Select the services you need"
      : n === total ? "Full service — we handle everything"
      : n + " service" + (n > 1 ? "s" : "") + " selected";
  }

  if (builder) {
    builder.addEventListener("change", renderSummary);
    renderSummary();

    $$("[data-preset]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var p = PRESETS[btn.dataset.preset]; if (!p) return;
        document.getElementById(p.format).checked = true;
        $$('input[type="checkbox"]', builder).forEach(function (i) { i.checked = p.services.indexOf(i.id) > -1; });
        renderSummary();
        toast("Preset loaded — <b>adjust it as you like</b>");
      });
    });

    var cta = $("#summary-cta");
    if (cta) cta.addEventListener("click", function () {
      var msg = $("#c-msg");
      var sel = getSelection();
      if (msg && sel) {
        var lines = ["Format: " + sel.format];
        if (sel.services.length) lines.push("Services: " + sel.services.map(function (s) { return s.name; }).join(", "));
        msg.value = lines.join("\n") + (msg.value ? "\n\n" + msg.value : "\n\n");
      }
      setTimeout(function () { var n = $("#c-name"); if (n) n.focus({ preventScroll: true }); }, 500);
    });
  }

  /* ---------- Contact form → prepared email ---------- */
  var mailLink = $("#contact-email");
  if (mailLink) { mailLink.href = "mailto:" + CONTACT_EMAIL; mailLink.textContent = CONTACT_EMAIL; }

  var form = $("#contact-form");
  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var ok = true;
      $$("[required]", form).forEach(function (input) {
        var valid = input.value.trim() !== "" && (input.type !== "email" || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value));
        input.closest(".field").classList.toggle("is-invalid", !valid);
        if (!valid && ok) { input.focus(); ok = false; }
      });
      if (!ok) return;

      var d = new FormData(form);
      var body = [
        "Name: " + d.get("name"),
        "Organisation: " + (d.get("organisation") || "-"),
        "Email: " + d.get("email"),
        "Planned date: " + (d.get("date") || "-"),
        "Expected audience: " + (d.get("audience") || "-"),
        "",
        d.get("message") || ""
      ].join("\n");
      var subject = "Webinar request — " + (d.get("organisation") || d.get("name"));
      window.location.href = "mailto:" + CONTACT_EMAIL + "?subject=" + encodeURIComponent(subject) + "&body=" + encodeURIComponent(body);
      $("#form-status").textContent = "Thank you! Your email app should open with your request ready to send.";
    });
    $$("input, select", form).forEach(function (i) {
      i.addEventListener("input", function () { i.closest(".field").classList.remove("is-invalid"); });
    });
  }

  /* ---------- Brand guidelines: copy-to-clipboard ---------- */
  $$("[data-copy]").forEach(function (el) {
    el.addEventListener("click", function () {
      var val = el.dataset.copy;
      var done = function () { toast("Copied <b>" + val + "</b>"); };
      if (navigator.clipboard) navigator.clipboard.writeText(val).then(done, done);
      else done();
    });
  });

  /* ---------- Brand guidelines: contrast checker ---------- */
  var fgSel = $("#cc-fg"), bgSel = $("#cc-bg");
  if (fgSel && bgSel) {
    var lum = function (hex) {
      var c = hex.replace("#", "").match(/.{2}/g).map(function (x) {
        var v = parseInt(x, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
    };
    var ratio = function (a, b) { var l1 = lum(a), l2 = lum(b); return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05); };
    var update = function () {
      var fg = fgSel.value, bg = bgSel.value, r = ratio(fg, bg);
      var prev = $("#cc-preview");
      prev.style.color = fg; prev.style.background = bg;
      $("#cc-ratio").textContent = r.toFixed(2) + ":1";
      var set = function (id, pass) { var el = $(id); el.textContent = pass ? "Pass" : "Fail"; el.className = "badge " + (pass ? "badge--pass" : "badge--fail"); };
      set("#cc-aa", r >= 4.5); set("#cc-aa-large", r >= 3); set("#cc-aaa", r >= 7);
    };
    fgSel.addEventListener("change", update); bgSel.addEventListener("change", update); update();
  }

  /* ---------- Brand guidelines: live type tester ---------- */
  var tester = $("#type-input");
  if (tester) {
    tester.addEventListener("input", function () {
      var t = tester.value.trim() || "Webinars that stand out";
      $$("[data-type-sample]").forEach(function (el) { el.textContent = t; });
    });
  }
})();
