/* Planet Stella booking widget. Config comes from window.PS_BOOKING (written at build time). */
(function () {
  "use strict";
  var root = document.getElementById("booker");
  if (!root || !window.PS_BOOKING) return;
  var CFG = window.PS_BOOKING, TZ = CFG.timezone;
  var SERVICES = CFG.services;
  var byId = {}; SERVICES.forEach(function (s) { byId[s.id] = s; });

  // ---------- helpers ----------
  function el(tag, attrs, kids) {
    var n = document.createElement(tag);
    for (var k in attrs || {}) {
      if (k === "class") n.className = attrs[k];
      else if (k === "text") n.textContent = attrs[k];
      else if (k === "html") n.innerHTML = attrs[k];
      else if (k.slice(0, 2) === "on") n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k] === true ? "" : attrs[k]);
    }
    (kids || []).forEach(function (c) { if (c) n.appendChild(typeof c === "string" ? document.createTextNode(c) : c); });
    return n;
  }
  var pad = function (n) { return String(n).padStart(2, "0"); };
  function todayLocal() { return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date()); }
  function addMonths(m, n) { var y = +m.slice(0, 4), mo = +m.slice(5, 7) - 1 + n; y += Math.floor(mo / 12); mo = ((mo % 12) + 12) % 12; return y + "-" + pad(mo + 1); }
  function monthLabel(m) { return new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7) - 1, 1)).toLocaleDateString("en-US", { timeZone: "UTC", month: "long", year: "numeric" }); }
  function dateLabel(d) { return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "long", day: "numeric" }); }
  function timeLabel(t) { var h = +t.slice(0, 2), m = t.slice(3, 5); return (h % 12 || 12) + ":" + m + " " + (h < 12 ? "AM" : "PM"); }
  function durLabel(m) { var h = Math.floor(m / 60), r = m % 60; return [h ? h + " hr" : "", r ? r + " min" : ""].filter(Boolean).join(" "); }
  function priceLabel(s) { return s.price || "Priced at consultation"; }
  function track(n, p) { if (window.psTrack) window.psTrack(n, p); }

  // ---------- API (with an offline demo for previews) ----------
  function api(path, opts) {
    if (window.PS_DEMO) return demoApi(path, opts);
    return fetch(path, opts).then(function (r) {
      return r.json().catch(function () { return { ok: false, error: "Unexpected response." }; }).then(function (d) { d.status_code = r.status; return d; });
    }).catch(function () { return { ok: false, error: "We couldn't reach the booking system. Check your connection and try again, or email " + CFG.email + "." }; });
  }
  function demoApi(path, opts) {
    var u = new URL(path, "https://x"), svc = byId[u.searchParams.get("service")] || {};
    var dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
    function slots(d) {
      var h = CFG.hours[dayKeys[new Date(d + "T00:00:00Z").getUTCDay()]];
      if (!h || d <= todayLocal()) return [];
      var out = [], s = +h[0].slice(0, 2) * 60 + +h[0].slice(3), e = +h[1].slice(0, 2) * 60 + +h[1].slice(3), seed = +d.replace(/-/g, "") % 7;
      for (var t = s; t + (svc.duration || 60) <= e; t += 15) if ((t / 15 + seed) % 5 !== 0 && (t / 15 + seed) % 7 !== 1) out.push(pad(Math.floor(t / 60)) + ":" + pad(t % 60));
      return out;
    }
    return new Promise(function (res) {
      setTimeout(function () {
        if (u.pathname === "/api/availability" && u.searchParams.get("month")) {
          var m = u.searchParams.get("month"), days = {}, n = new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
          for (var i = 1; i <= n; i++) { var d = m + "-" + pad(i); days[d] = slots(d).length; }
          res({ ok: true, days: days });
        } else if (u.pathname === "/api/availability") res({ ok: true, slots: slots(u.searchParams.get("date")) });
        else if (u.pathname === "/api/bookings") {
          var b = JSON.parse(opts.body);
          res({ ok: true, demo: true, ref: "PS-DEMO1", status: "confirmed", service: byId[b.service].name, date: dateLabel(b.date), time: timeLabel(b.time), google: "#", manage: "#" });
        } else res({ ok: false, error: "Demo" });
      }, 250);
    });
  }

  // ---------- state ----------
  var today = todayLocal(), thisMonth = today.slice(0, 7);
  var lastMonth = addMonths(thisMonth, Math.ceil(CFG.maxAdvanceDays / 30));
  var params = new URLSearchParams(location.search);
  var S = { step: 1, service: byId[params.get("service") || root.dataset.service] || null, month: thisMonth, days: {}, date: null, time: null, slots: [], busy: false };
  if (S.service) S.step = 2;

  // ---------- layout ----------
  root.innerHTML = "";
  if (window.PS_DEMO) root.appendChild(el("p", { class: "demo-flag", text: "Preview mode: this calendar shows sample availability and nothing is saved. Live bookings work once the site is deployed." }));
  var grid = el("div", { class: "booker" });
  var steps = el("div", { class: "bk-steps" });
  var summary = el("aside", { class: "bk-summary", "aria-label": "Your appointment" });
  grid.appendChild(steps); grid.appendChild(summary); root.appendChild(grid);

  function stepShell(n, title, picked, onChange) {
    var state = S.step === n ? "active" : S.step > n ? "done" : "locked";
    var head = el("div", { class: "bk-head" }, [
      el("h3", {}, [el("span", { class: "bk-num", text: state === "done" ? "✓" : String(n) }), title]),
      state === "done" ? el("button", { class: "bk-change", type: "button", text: "Change", onclick: onChange }) : null
    ]);
    var sec = el("section", { class: "bk-step " + state, "aria-current": state === "active" ? "step" : false }, [head]);
    if (state === "done" && picked) sec.appendChild(el("p", { class: "bk-picked", text: picked }));
    var body = el("div", { class: "bk-body" }); sec.appendChild(body);
    return { sec: sec, body: body, active: state === "active" };
  }

  function render() {
    steps.innerHTML = "";
    // 1. Service
    var s1 = stepShell(1, "Choose your service", S.service && S.service.name + " · " + durLabel(S.service.duration), function () { S.step = 1; render(); });
    if (s1.active) {
      var cats = CFG.categories || [];
      if (!S.cat) S.cat = (S.service && S.service.category) || cats[0];
      if (cats.length > 1) {
        s1.body.appendChild(el("div", { class: "svc-cats", role: "group", "aria-label": "Service categories" }, cats.map(function (c) {
          return el("button", { type: "button", class: "chip tab", "aria-pressed": S.cat === c ? "true" : "false", "aria-selected": S.cat === c ? "true" : "false", text: c, onclick: function () { S.cat = c; render.moved = false; render(); } });
        })));
      }
      var pick = el("div", { class: "svc-pick", role: "group", "aria-label": "Services" });
      SERVICES.filter(function (s) { return !cats.length || s.category === S.cat; }).forEach(function (s) {
        pick.appendChild(el("button", { type: "button", class: "svc-opt", "aria-pressed": S.service && S.service.id === s.id ? "true" : "false", onclick: function () {
          var changed = !S.service || S.service.id !== s.id;
          S.service = s; if (changed) { S.date = null; S.time = null; S.days = {}; }
          S.step = 2; track("booking_start", { service: s.name }); render(); loadMonth(S.month, true);
        } }, [el("b", { text: s.name }), el("span", { text: priceLabel(s) + " · about " + durLabel(s.duration) })]));
      });
      s1.body.appendChild(pick);
    }
    steps.appendChild(s1.sec);

    // 2. Date
    var s2 = stepShell(2, "Pick a day", S.date && dateLabel(S.date), function () { S.step = 2; S.time = null; render(); loadMonth(S.month); });
    if (s2.active) s2.body.appendChild(calendar());
    steps.appendChild(s2.sec);

    // 3. Time
    var s3 = stepShell(3, "Pick a time", S.time && timeLabel(S.time), function () { S.step = 3; render(); });
    if (s3.active) s3.body.appendChild(timeSlots());
    steps.appendChild(s3.sec);

    // 4. Details
    var s4 = stepShell(4, "Your details", null, null);
    if (s4.active) s4.body.appendChild(detailsForm());
    steps.appendChild(s4.sec);

    renderSummary();
    var act = steps.querySelector(".bk-step.active");
    if (act && render.moved) { var top = act.getBoundingClientRect().top; if (top < 70 || top > window.innerHeight * .6) act.scrollIntoView({ behavior: "smooth", block: "start" }); }
    render.moved = true;
  }

  function renderSummary() {
    summary.innerHTML = "";
    var s = S.service;
    var rows = [["Service", s ? s.name : "Not chosen"], ["Time in chair", s ? durLabel(s.duration) : "-"], ["Price", s ? priceLabel(s) : "-"], ["Date", S.date ? dateLabel(S.date) : "-"], ["Time", S.time ? timeLabel(S.time) : "-"]];
    summary.appendChild(el("h3", { text: "Your appointment" }));
    summary.appendChild(el("dl", {}, rows.map(function (r) { return el("div", {}, [el("dt", { text: r[0] }), el("dd", { text: r[1] })]); })));
    summary.appendChild(el("p", {}, [CFG.policyShort + " ", el("a", { class: "policy-link", href: (window.PS_BASE || "") + "/policies/", text: "Booking policy" })]));
  }

  // ---------- calendar ----------
  var calBox;
  function calendar() {
    calBox = el("div", { class: S.busy ? "cal-loading" : "" });
    var top = el("div", { class: "cal-top" }, [
      el("strong", { text: monthLabel(S.month), "aria-live": "polite" }),
      el("div", { class: "cal-nav" }, [
        el("button", { type: "button", "aria-label": "Previous month", disabled: S.month <= thisMonth, onclick: function () { loadMonth(addMonths(S.month, -1)); }, text: "‹" }),
        el("button", { type: "button", "aria-label": "Next month", disabled: S.month >= lastMonth, onclick: function () { loadMonth(addMonths(S.month, 1)); }, text: "›" })
      ])
    ]);
    calBox.appendChild(top);
    var g = el("div", { class: "cal", role: "grid", "aria-label": "Available days" });
    ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].forEach(function (d) { g.appendChild(el("div", { class: "dow", text: d.toUpperCase().slice(0, 2), "aria-hidden": "true" })); });
    var first = new Date(S.month + "-01T00:00:00Z").getUTCDay();
    for (var i = 0; i < first; i++) g.appendChild(el("span", { "aria-hidden": "true" }));
    var n = new Date(Date.UTC(+S.month.slice(0, 4), +S.month.slice(5, 7), 0)).getUTCDate(), any = false;
    for (var day = 1; day <= n; day++) {
      (function (d) {
        var count = S.days[d] || 0; if (count) any = true;
        g.appendChild(el("button", {
          type: "button", class: (count ? "open" : "") + (d === today ? " today" : ""), disabled: !count, "aria-pressed": S.date === d ? "true" : "false",
          "aria-label": dateLabel(d) + (count ? ", " + count + " times available" : ", unavailable"), text: String(+d.slice(8)),
          onclick: function () { S.date = d; S.time = null; S.step = 3; S.slots = null; render(); loadSlots(); }
        }));
      })(S.month + "-" + pad(day));
    }
    calBox.appendChild(g);
    if (!S.busy) calBox.appendChild(el("p", { class: "cal-note", text: any ? "Days with a dot have openings. Times are shown in the studio's local time." : "No openings this month. Try the next month, or join the list to hear about new openings first." }));
    return calBox;
  }

  function loadMonth(m, autoAdvance) {
    if (!S.service) return;
    S.month = m; S.busy = true; render.moved = false; render();
    api("/api/availability?service=" + encodeURIComponent(S.service.id) + "&month=" + m).then(function (d) {
      S.busy = false;
      if (!d.ok) { S.days = {}; render(); showErr(steps.querySelector(".bk-step.active .bk-body"), d.error); return; }
      S.days = d.days || {};
      var has = Object.keys(S.days).some(function (k) { return S.days[k] > 0; });
      if (!has && autoAdvance && m < lastMonth && autoAdvance < 4) return loadMonth(addMonths(m, 1), (autoAdvance === true ? 1 : autoAdvance) + 1);
      render.moved = false; render();
    });
  }

  // ---------- times ----------
  function timeSlots() {
    var box = el("div");
    if (S.slots === null) { box.appendChild(el("p", { class: "cal-note", text: "Loading times..." })); return box; }
    if (!S.slots.length) { box.appendChild(el("p", { class: "cal-note", text: "That day just filled up. Please choose another day." })); return box; }
    var groups = [["Morning", function (t) { return t < "12:00"; }], ["Afternoon", function (t) { return t >= "12:00" && t < "17:00"; }], ["Evening", function (t) { return t >= "17:00"; }]];
    groups.forEach(function (g) {
      var list = S.slots.filter(g[1]); if (!list.length) return;
      box.appendChild(el("div", { class: "slot-group" }, [el("h4", { text: g[0] }), el("div", { class: "slots" }, list.map(function (t) {
        return el("button", { type: "button", "aria-pressed": S.time === t ? "true" : "false", text: timeLabel(t), onclick: function () { S.time = t; S.step = 4; track("booking_time_selected", { service: S.service.name }); render(); } });
      }))]));
    });
    if (S.err) { showErr(box, S.err); S.err = null; }
    return box;
  }
  function loadSlots() {
    api("/api/availability?service=" + encodeURIComponent(S.service.id) + "&date=" + S.date).then(function (d) {
      S.slots = d.ok ? d.slots : []; render.moved = false; render();
    });
  }

  // ---------- details ----------
  var draft = {};
  function field(id, label, input, full) { return el("div", { class: "field" + (full ? " full" : "") }, [el("label", { for: id, text: label }), input]); }
  function detailsForm() {
    var f = el("form", { class: "bk-form", novalidate: true });
    var hear = el("select", { id: "bk-hear", name: "heardAbout" }, [el("option", { value: "", text: "Choose one (optional)" })].concat(CFG.hearAbout.map(function (o) { return el("option", { value: o, text: o }); })));
    f.appendChild(el("div", { class: "fgrid" }, [
      field("bk-name", "Full name", el("input", { id: "bk-name", name: "name", autocomplete: "name", required: true, maxlength: 100 })),
      field("bk-email", "Email", el("input", { id: "bk-email", name: "email", type: "email", autocomplete: "email", required: true, maxlength: 254 })),
      field("bk-phone", "Mobile phone", el("input", { id: "bk-phone", name: "phone", type: "tel", autocomplete: "tel", maxlength: 30 })),
      field("bk-hear", "How did you find us?", hear),
      field("bk-notes", "Tell Stella about your hair", el("textarea", { id: "bk-notes", name: "notes", maxlength: 2000, placeholder: "Current color and length, what you'd love to change, inspiration links..." }), true),
      field("bk-promo", "Promo or referral code", el("input", { id: "bk-promo", name: "promo", maxlength: 40, autocomplete: "off" })),
      el("div", { class: "field", style: "justify-content:end" }, [el("label", { class: "check", for: "bk-first" }, [el("input", { type: "checkbox", id: "bk-first", name: "firstVisit" }), "This is my first visit"])]),
      el("div", { class: "field full" }, [
        el("label", { class: "check", for: "bk-mkt" }, [el("input", { type: "checkbox", id: "bk-mkt", name: "marketingOk" }), "Send me last-minute openings and studio news (unsubscribe anytime)"]),
      ]),
      el("div", { class: "field full" }, [
        el("label", { class: "check", for: "bk-policy" }, [el("input", { type: "checkbox", id: "bk-policy", name: "policyOk", required: true }), el("span", {}, ["I agree to the ", el("a", { href: (window.PS_BASE || "") + "/policies/", target: "_blank", text: "booking & cancellation policy" })])])
      ])
    ]));
    f.appendChild(el("div", { class: "hp", "aria-hidden": "true" }, [el("label", { for: "bk-company", text: "Company" }), el("input", { id: "bk-company", name: "company", tabindex: "-1", autocomplete: "off" })]));
    var ts = null;
    if (CFG.turnstileSiteKey) { ts = el("div", { class: "cf-turnstile", "data-sitekey": CFG.turnstileSiteKey, style: "margin-top:18px" }); f.appendChild(ts); loadTurnstile(); }
    var submit = el("button", { class: "btn btn-glow", type: "submit" }, ["Confirm booking ", el("span", { "aria-hidden": "true", text: "→" })]);
    f.appendChild(el("div", { class: "form-foot" }, [el("small", { text: "You'll get an instant confirmation email with a calendar invite and a link to manage your booking." }), submit]));

    // keep typed details if the person goes back a step
    Object.keys(draft).forEach(function (k) { var i = f.elements[k]; if (i) i.type === "checkbox" ? (i.checked = draft[k]) : (i.value = draft[k]); });
    f.addEventListener("input", function (e) { var t = e.target; if (t.name) draft[t.name] = t.type === "checkbox" ? t.checked : t.value; });

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var old = f.querySelector(".bk-error"); if (old) old.remove();
      var v = function (n) { return (f.elements[n].value || "").trim(); };
      var problem = v("name").length < 2 ? ["bk-name", "Please enter your name."]
        : !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v("email")) ? ["bk-email", "Please enter a valid email so we can send your confirmation."]
        : !f.elements.policyOk.checked ? ["bk-policy", "Please agree to the booking policy to continue."] : null;
      if (problem) { showErr(f, problem[1]); document.getElementById(problem[0]).focus(); return; }
      submit.disabled = true; submit.firstChild.textContent = "Booking... ";
      var a = window.psAttribution ? window.psAttribution() : { utm: {} };
      var tsInput = f.querySelector('[name="cf-turnstile-response"]');
      api("/api/bookings", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        service: S.service.id, date: S.date, time: S.time, name: v("name"), email: v("email"), phone: v("phone"), notes: v("notes"),
        promo: v("promo"), heardAbout: v("heardAbout"), firstVisit: f.elements.firstVisit.checked, marketingOk: f.elements.marketingOk.checked,
        policyOk: true, company: f.elements.company.value, utm: a.utm, referrer: a.referrer, landing: a.landing, turnstile: tsInput ? tsInput.value : ""
      }) }).then(function (d) {
        submit.disabled = false; submit.firstChild.textContent = "Confirm booking ";
        if (d.ok) return done(d);
        if (d.status_code === 409) { S.step = 3; S.time = null; S.slots = null; S.err = d.error; render(); loadSlots(); return; }
        showErr(f, d.error || "Something went wrong. Please try again.");
        if (window.turnstile) try { window.turnstile.reset(); } catch (x) {}
      });
    });
    return f;
  }
  function loadTurnstile() {
    if (document.getElementById("cf-ts")) { if (window.turnstile) setTimeout(function () { try { window.turnstile.render(".cf-turnstile"); } catch (e) {} }, 0); return; }
    var s = document.createElement("script"); s.id = "cf-ts"; s.async = true; s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js"; document.head.appendChild(s);
  }
  function showErr(box, msg) { if (!box) return; box.appendChild(el("p", { class: "bk-error", role: "alert", text: msg })); }

  // ---------- confirmation ----------
  function done(d) {
    track("booking_complete", { service: d.service, value: 0, currency: "USD" });
    root.innerHTML = "";
    var pending = d.status === "pending";
    var box = el("div", { class: "bk-done", tabindex: "-1" }, [
      window.PS_DEMO ? el("p", { class: "demo-flag", text: "Preview mode: this is what clients see after booking. Nothing was saved." }) : null,
      el("div", { class: "badge", "aria-hidden": "true", text: "✦" }),
      el("h2", { text: pending ? "Request received!" : "You're booked!" }),
      el("span", { class: "ref", text: d.ref }),
      el("p", { class: "when", text: d.service + " · " + d.date + " at " + d.time }),
      el("p", { class: "muted", text: pending ? "Stella will confirm your time shortly. Watch your inbox." : "A confirmation is on its way to your inbox with a calendar invite and a link to change or cancel." }),
      el("div", { class: "bk-actions" }, [
        el("a", { class: "btn btn-glow", href: d.google, target: "_blank", rel: "noopener", text: "Add to Google Calendar" }),
        d.token ? el("a", { class: "btn btn-line", href: "/api/bookings/" + d.token + "/ics", text: "Apple / Outlook calendar" }) : null,
        el("a", { class: "btn btn-line", href: d.manage, text: "Manage booking" })
      ]),
      CFG.instagram ? el("p", { class: "muted", style: "margin-top:26px" }, ["While you wait, get inspired on Instagram: ", el("a", { href: "https://instagram.com/" + CFG.instagram, target: "_blank", rel: "noopener", text: "@" + CFG.instagram })]) : null
    ]);
    root.appendChild(box);
    box.scrollIntoView({ behavior: "smooth", block: "start" }); box.focus({ preventScroll: true });
  }

  render();
  if (S.service) loadMonth(S.month, true);
})();
