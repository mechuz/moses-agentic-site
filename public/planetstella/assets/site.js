/* Planet Stella: shared site behaviour. */
(function () {
  "use strict";

  // ---------- Marketing attribution (first touch, kept 90 days) ----------
  var ATTR_KEY = "ps_attr";
  function readAttr() { try { var a = JSON.parse(localStorage.getItem(ATTR_KEY) || "null"); if (a && Date.now() - a.t < 90 * 864e5) return a; } catch (e) {} return null; }
  (function captureAttr() {
    var q = new URLSearchParams(location.search), utm = {};
    ["source", "medium", "campaign", "term", "content"].forEach(function (k) { var v = q.get("utm_" + k); if (v) utm[k] = v; });
    if (!utm.source && q.get("gclid")) { utm.source = "google"; utm.medium = "cpc"; }
    if (!utm.source && q.get("fbclid")) { utm.source = "facebook"; utm.medium = utm.medium || "social"; }
    if (!utm.source && q.get("ttclid")) { utm.source = "tiktok"; utm.medium = utm.medium || "social"; }
    var ref = document.referrer && document.referrer.indexOf(location.host) === -1 ? document.referrer : "";
    if (!utm.source && ref) {
      var h = ""; try { h = new URL(ref).hostname; } catch (e) {}
      if (/instagram/.test(h)) utm = { source: "instagram", medium: "social" };
      else if (/facebook|fb\.com/.test(h)) utm = { source: "facebook", medium: "social" };
      else if (/tiktok/.test(h)) utm = { source: "tiktok", medium: "social" };
      else if (/google\./.test(h)) utm = { source: "google", medium: "organic" };
      else if (/bing\.|duckduckgo|yahoo/.test(h)) utm = { source: h.split(".").slice(-2, -1)[0], medium: "organic" };
      else if (h) utm = { source: h, medium: "referral" };
    }
    var existing = readAttr();
    if (utm.source || !existing) {
      try { localStorage.setItem(ATTR_KEY, JSON.stringify({ t: Date.now(), utm: utm, referrer: ref, landing: location.pathname + location.search })); } catch (e) {}
    }
  })();
  window.psAttribution = function () { var a = readAttr() || {}; return { utm: a.utm || {}, referrer: a.referrer || document.referrer || "", landing: a.landing || location.pathname }; };

  // ---------- Analytics events (GA4, Meta, TikTok if configured) ----------
  window.psTrack = function (name, params) {
    params = params || {};
    try { if (window.gtag) window.gtag("event", name, params); } catch (e) {}
    var meta = { booking_complete: "Schedule", newsletter_signup: "Lead", booking_start: "InitiateCheckout", contact_click: "Contact" }[name];
    try { if (window.fbq) meta ? window.fbq("track", meta, params) : window.fbq("trackCustom", name, params); } catch (e) {}
    var tt = { booking_complete: "SubmitForm", newsletter_signup: "Subscribe", contact_click: "Contact" }[name];
    try { if (window.ttq && tt) window.ttq.track(tt, params); } catch (e) {}
    try { (window.dataLayer = window.dataLayer || []).push(Object.assign({ event: name }, params)); } catch (e) {}
  };
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a"); if (!a) return;
    var h = a.getAttribute("href") || "";
    if (/^tel:/.test(h)) psTrack("contact_click", { method: "call" });
    else if (/^sms:/.test(h)) psTrack("contact_click", { method: "text" });
    else if (/^mailto:/.test(h)) psTrack("contact_click", { method: "email" });
    else if (/instagram\.com|tiktok\.com|facebook\.com/.test(h)) psTrack("social_click", { network: h.split("/")[2] });
    else if (/maps\.|goo\.gl\/maps|maps\.app/.test(h)) psTrack("directions_click", {});
    else if (/\/book\/?/.test(h) && !/\/book\/?$/.test(location.pathname)) psTrack("book_cta_click", { location: a.dataset.cta || "link" });
  });

  // ---------- Mobile menu ----------
  var btn = document.getElementById("menu-btn"), nav = document.getElementById("nav");
  if (btn && nav) {
    btn.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      btn.setAttribute("aria-expanded", open); btn.textContent = open ? "Close" : "Menu";
    });
    nav.addEventListener("click", function (e) { if (e.target.tagName === "A") { nav.classList.remove("open"); btn.setAttribute("aria-expanded", false); btn.textContent = "Menu"; } });
  }
  var yr = document.getElementById("yr"); if (yr) yr.textContent = new Date().getFullYear();

  // ---------- Newsletter ----------
  document.querySelectorAll("form[data-subscribe]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var msg = f.querySelector(".news-msg"), email = f.querySelector('input[type=email]').value.trim(), hp = f.querySelector(".hp input");
      var a = window.psAttribution();
      msg.hidden = false;
      if (window.PS_DEMO) { msg.textContent = "Preview: email sign-ups switch on when the site launches."; return; }
      msg.textContent = "Joining...";
      fetch("/api/subscribe", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email: email, company: hp ? hp.value : "", source: f.dataset.subscribe, utm: a.utm }) })
        .then(function (r) { return r.json(); })
        .then(function (d) {
          if (d.ok) { msg.textContent = "You're on the list. Watch your inbox for openings and offers."; f.reset(); psTrack("newsletter_signup", { location: f.dataset.subscribe }); }
          else msg.textContent = d.error || "Something went wrong. Please try again.";
        })
        .catch(function () { msg.textContent = "We couldn't connect. Please try again in a moment."; });
    });
  });

  // ---------- Tabs (service menu) ----------
  document.querySelectorAll('[role="tablist"]').forEach(function (list) {
    var tabs = [].slice.call(list.querySelectorAll("[data-tab]"));
    function show(t) {
      tabs.forEach(function (x) {
        var on = x === t; x.setAttribute("aria-selected", on); x.tabIndex = on ? 0 : -1;
        var panel = document.getElementById(x.getAttribute("aria-controls")); if (panel) panel.hidden = !on;
      });
    }
    tabs.forEach(function (t, i) {
      t.tabIndex = t.getAttribute("aria-selected") === "true" ? 0 : -1;
      t.addEventListener("click", function () { show(t); psTrack("menu_tab", { category: t.textContent.replace(/\d+$/, "").trim() }); });
      t.addEventListener("keydown", function (e) {
        var n = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0; if (!n) return;
        e.preventDefault(); var nx = tabs[(i + n + tabs.length) % tabs.length]; show(nx); nx.focus();
      });
    });
  });

  // ---------- Gallery filter ----------
  document.querySelectorAll('[aria-label="Filter photos"]').forEach(function (group) {
    var sec = group.closest("section") || document; var grid = sec.querySelector("[data-filter-grid]"); if (!grid) return;
    group.addEventListener("click", function (e) {
      var b = e.target.closest("[data-filter]"); if (!b) return;
      group.querySelectorAll("[data-filter]").forEach(function (x) { x.setAttribute("aria-pressed", x === b); });
      var f = b.dataset.filter;
      grid.querySelectorAll(".work, .card-work").forEach(function (w) { w.hidden = f !== "all" && w.dataset.tag !== f; }); grid.scrollLeft = 0;
    });
  });

  var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------- Hero slideshow (Ken Burns) ----------
  document.querySelectorAll("[data-slides]").forEach(function (box) {
    var slides = [].slice.call(box.querySelectorAll(".slide")), dots = [].slice.call(box.querySelectorAll(".slide-ui button"));
    if (slides.length < 2) return;
    var i = 0, timer = null, DUR = 5500;
    function go(n) {
      slides[i].classList.remove("on"); slides[i].setAttribute("aria-hidden", "true"); if (dots[i]) dots[i].removeAttribute("aria-current");
      i = (n + slides.length) % slides.length;
      var s = slides[i], img = s.querySelector("img"); if (img && img.loading === "lazy") img.loading = "eager";
      s.classList.add("on"); s.setAttribute("aria-hidden", "false");
      if (dots[i]) { dots[i].setAttribute("aria-current", "true"); var c = dots[i].cloneNode(true); dots[i].replaceWith(c); dots[i] = c; c.addEventListener("click", dotClick(i)); }
    }
    function dotClick(n) { return function () { go(n); restart(); }; }
    function restart() { clearInterval(timer); if (!reduce) timer = setInterval(function () { go(i + 1); }, DUR); }
    dots.forEach(function (d, n) { d.addEventListener("click", dotClick(n)); });
    var nx = box.querySelector("[data-next]"), pv = box.querySelector("[data-prev]");
    if (nx) nx.addEventListener("click", function () { go(i + 1); restart(); });
    if (pv) pv.addEventListener("click", function () { go(i - 1); restart(); });
    box.addEventListener("mouseenter", function () { clearInterval(timer); });
    box.addEventListener("mouseleave", restart);
    var x0 = null;
    box.addEventListener("touchstart", function (e) { x0 = e.touches[0].clientX; }, { passive: true });
    box.addEventListener("touchend", function (e) { if (x0 === null) return; var dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) { go(i + (dx < 0 ? 1 : -1)); restart(); } x0 = null; });
    restart();
  });

  // ---------- Work carousel ----------
  document.querySelectorAll("[data-car]").forEach(function (car) {
    var track = car.querySelector(".car-track"), sec = car.closest("section");
    function step(dir) { var card = track.querySelector(".card-work:not([hidden])"); var w = card ? card.getBoundingClientRect().width + 18 : 320; track.scrollBy({ left: dir * w * (window.innerWidth > 900 ? 2 : 1), behavior: "smooth" }); }
    var n = sec.querySelector("[data-car-next]"), p = sec.querySelector("[data-car-prev]");
    if (n) n.addEventListener("click", function () { if (track.scrollLeft + track.clientWidth >= track.scrollWidth - 4) track.scrollTo({ left: 0, behavior: "smooth" }); else step(1); });
    if (p) p.addEventListener("click", function () { step(-1); });
  });

  // ---------- Zoom lens on hover ----------
  if (window.matchMedia && window.matchMedia("(hover: hover)").matches) {
    document.querySelectorAll(".lens").forEach(function (l) {
      var img = l.querySelector("img");
      l.addEventListener("mousemove", function (e) {
        var r = l.getBoundingClientRect();
        img.style.transformOrigin = ((e.clientX - r.left) / r.width * 100) + "% " + ((e.clientY - r.top) / r.height * 100) + "%";
        l.classList.add("zooming");
      });
      l.addEventListener("mouseleave", function () { l.classList.remove("zooming"); });
    });
  }

  // ---------- Scroll zoom into the hair ----------
  document.querySelectorAll("[data-zoom]").forEach(function (sec) {
    if (reduce) return;
    var img = sec.querySelector(".zoom-img"), copy = sec.querySelector(".zoom-copy"), calls = [].slice.call(sec.querySelectorAll(".callout"));
    var ticking = false;
    function update() {
      ticking = false;
      var r = sec.getBoundingClientRect(), total = r.height - window.innerHeight;
      var p = Math.min(1, Math.max(0, -r.top / (total || 1)));
      img.style.transform = "scale(" + (1 + p * 1.6).toFixed(3) + ")";
      if (copy) copy.style.opacity = String(Math.max(0, 1 - p * 3.2));
      calls.forEach(function (c) { c.classList.toggle("on", p >= parseFloat(c.dataset.at)); });
    }
    window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    window.addEventListener("resize", update);
    update();
  });

  // ---------- Photo lightbox ----------
  document.addEventListener("click", function (e) {
    var a = e.target.closest && e.target.closest("a[data-lightbox]");
    if (!a || !window.HTMLDialogElement) return;
    e.preventDefault();
    var d = document.getElementById("ps-lightbox");
    if (!d) {
      d = document.createElement("dialog"); d.id = "ps-lightbox"; d.className = "lightbox";
      d.innerHTML = '<button type="button" aria-label="Close">×</button><img alt=""><p></p>';
      d.querySelector("button").addEventListener("click", function () { d.close(); });
      d.addEventListener("click", function (ev) { if (ev.target === d) d.close(); });
      document.body.appendChild(d);
    }
    var img = d.querySelector("img"); img.src = a.getAttribute("href"); img.alt = (a.querySelector("img") || {}).alt || "";
    d.querySelector("p").textContent = a.dataset.caption || "";
    d.showModal();
    psTrack("gallery_view", { photo: a.dataset.caption || "" });
  });

  // ---------- Strand art ----------
  var PALETTES = {
    honey: { bg: ["#3b2416", "#c98b4a"], stops: ["#3a2416", "#8a5a2f", "#e2b26b", "#f7deaa"], hi: "#fff1cf" },
    copper: { bg: ["#4a160a", "#d9622b"], stops: ["#5a1d0c", "#b4441a", "#ec7a3a", "#ffb27a"], hi: "#ffd2a8" },
    platinum: { bg: ["#8d8a96", "#f1eff6"], stops: ["#6f6a78", "#c9c6d3", "#ecebf3", "#ffffff"], hi: "#ffffff" },
    espresso: { bg: ["#140b08", "#4a2d20"], stops: ["#120a07", "#2e1a12", "#5b3726", "#8a5a3e"], hi: "#c08a63" },
    rose: { bg: ["#5a2333", "#f2a0a6"], stops: ["#4c1d2a", "#b8566d", "#f0a0a8", "#ffd6d2"], hi: "#fff0ee" },
    glow: { bg: null, stops: ["#ffffff", "#ffe7b0", "#ffffff", "#ffd0e2"], hi: "#ffffff" }
  };
  function rng(seed) { return function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }; }
  function paint(cv) {
    var p = PALETTES[cv.dataset.strands]; if (!p) return;
    var r = cv.getBoundingClientRect(); if (!r.width) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    var ctx = cv.getContext("2d"), W = cv.width, H = cv.height, rand = rng(cv.dataset.strands.length * 977 + 13);
    if (p.bg) { var bg = ctx.createLinearGradient(0, 0, W, H); bg.addColorStop(0, p.bg[0]); bg.addColorStop(1, p.bg[1]); ctx.fillStyle = bg; ctx.fillRect(0, 0, W, H); }
    else ctx.clearRect(0, 0, W, H);
    var count = p.bg ? Math.round(150 + W / 6) : 90, grad = ctx.createLinearGradient(0, 0, 0, H);
    p.stops.forEach(function (c, i) { grad.addColorStop(i / (p.stops.length - 1), c); });
    for (var i = 0; i < count; i++) {
      var x0 = (rand() * 1.4 - .2) * W, amp = W * .22 * (.4 + rand() * .8), ph = rand() * Math.PI * 2;
      ctx.beginPath(); ctx.moveTo(x0, -10);
      ctx.bezierCurveTo(x0 + Math.sin(ph) * amp, H * .33, x0 + Math.sin(ph + 2.1) * amp * 1.2, H * .66, x0 + Math.sin(ph + 3.4) * amp * .7 + W * .08, H + 10);
      var hi = rand() < .12;
      ctx.strokeStyle = hi ? p.hi : grad; ctx.globalAlpha = hi ? .55 : (.35 + rand() * .6); ctx.lineWidth = (hi ? .8 : .7 + rand() * 2.4) * dpr; ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (p.bg) { var s = ctx.createLinearGradient(0, 0, W, 0); s.addColorStop(0, "rgba(255,255,255,0)"); s.addColorStop(.5, "rgba(255,255,255,.16)"); s.addColorStop(1, "rgba(255,255,255,0)"); ctx.fillStyle = s; ctx.fillRect(0, 0, W, H); }
  }
  var canvases = [].slice.call(document.querySelectorAll("canvas[data-strands]"));
  function paintAll() { canvases.forEach(paint); }
  if (canvases.length) {
    paintAll();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paintAll);
    var t; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(paintAll, 150); });
  }
})();
