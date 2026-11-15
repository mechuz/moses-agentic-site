/* Planet Stella studio dashboard: /admin/ */
(function () {
  "use strict";
  var app = document.getElementById("admin");
  var ME = null, TAB = "schedule";
  var LABEL = { confirmed: "Confirmed", pending: "Request", cancelled: "Cancelled", completed: "Completed", no_show: "No-show" };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function api(path, method, data) {
    return fetch(path, { method: method || "GET", headers: data ? { "Content-Type": "application/json" } : {}, body: data ? JSON.stringify(data) : undefined, credentials: "same-origin" })
      .then(function (r) { return r.json().catch(function () { return { ok: false, error: "Unexpected response" }; }).then(function (d) { d.code = r.status; if (r.status === 401 && path !== "/api/admin/login") login(); return d; }); })
      .catch(function () { return { ok: false, error: "Couldn't connect. Check your internet and try again." }; });
  }
  function toast(msg) { var t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status"); t.textContent = msg; document.body.appendChild(t); setTimeout(function () { t.remove(); }, 2600); }
  var pad = function (n) { return String(n).padStart(2, "0"); };
  function today() { return ME ? ME.now.slice(0, 10) : new Date().toISOString().slice(0, 10); }
  function addDays(d, n) { return new Date(Date.parse(d + "T00:00:00Z") + n * 864e5).toISOString().slice(0, 10); }
  function tl(t) { var h = +t.slice(0, 2); return (h % 12 || 12) + ":" + t.slice(3, 5) + (h < 12 ? " am" : " pm"); }
  function dl(d) { return new Date(d + "T00:00:00Z").toLocaleDateString("en-US", { timeZone: "UTC", weekday: "long", month: "short", day: "numeric" }); }
  function dur(m) { var h = Math.floor(m / 60), r = m % 60; return [h ? h + "h" : "", r ? r + "m" : ""].join(" ").trim(); }

  // ---------- login ----------
  function login() {
    app.innerHTML = '<form class="panel login" id="lg"><h1 style="font-size:1.8rem;margin-bottom:6px">Studio dashboard</h1><p style="color:var(--ink-soft);margin-bottom:20px">Sign in to manage bookings.</p>' +
      '<div class="field"><label for="lg-pw">Password</label><input id="lg-pw" type="password" autocomplete="current-password" required></div>' +
      '<p class="bk-error" id="lg-err" hidden></p><button class="btn btn-glow" style="margin-top:18px;width:100%;justify-content:center">Sign in</button></form>';
    document.getElementById("lg-pw").focus();
    document.getElementById("lg").addEventListener("submit", function (e) {
      e.preventDefault();
      api("/api/admin/login", "POST", { password: document.getElementById("lg-pw").value }).then(function (d) {
        if (d.ok) boot(); else { var er = document.getElementById("lg-err"); er.hidden = false; er.textContent = d.error; }
      });
    });
  }

  function boot() {
    api("/api/admin/me").then(function (d) {
      if (d.ok) { ME = d; shell(); }
      else if (d.code !== 401) app.innerHTML = '<div class="panel login"><h1 style="font-size:1.6rem">Dashboard unavailable</h1><p>' + esc(d.error) + "</p></div>";
    });
  }

  var TABS = [["schedule", "Schedule"], ["new", "New booking"], ["timeoff", "Time off"], ["clients", "Clients"], ["list", "Email list"], ["insights", "Insights"], ["settings", "Settings"]];
  function shell() {
    app.innerHTML = '<div class="admin-top"><h1>Planet Stella · Studio</h1><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="mini" href="/" target="_blank">View site</a><button class="mini" id="lo">Sign out</button></div></div>' +
      '<div class="tabs" role="tablist">' + TABS.map(function (t) { return '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (t[0] === TAB) + '">' + t[1] + "</button>"; }).join("") + "</div><div id='view'></div>";
    document.getElementById("lo").addEventListener("click", function () { api("/api/admin/logout", "POST").then(login); });
    app.querySelector(".tabs").addEventListener("click", function (e) { var b = e.target.closest("[data-tab]"); if (!b) return; TAB = b.dataset.tab; shell(); });
    ({ schedule: schedule, new: newBooking, timeoff: timeOff, clients: clients, list: emailList, insights: insights, settings: settings })[TAB]();
  }
  var view = function () { return document.getElementById("view"); };

  // ---------- schedule ----------
  var range = null;
  function schedule() {
    range = range || { from: today(), to: addDays(today(), 14), showCancelled: false };
    view().innerHTML = '<div class="panel"><div class="row-tools">' +
      '<div class="field"><label for="sc-from">From</label><input type="date" id="sc-from" value="' + range.from + '"></div>' +
      '<div class="field"><label for="sc-to">To</label><input type="date" id="sc-to" value="' + range.to + '"></div>' +
      '<button class="mini" data-q="0">Today</button><button class="mini" data-q="7">Next 7 days</button><button class="mini" data-q="30">Next 30 days</button><button class="mini" data-q="-30">Past 30 days</button>' +
      '<label class="check" style="margin-left:auto"><input type="checkbox" id="sc-c"' + (range.showCancelled ? " checked" : "") + "> Show cancelled</label></div><div id='sc-list'><p>Loading...</p></div></div>";
    var from = document.getElementById("sc-from"), to = document.getElementById("sc-to");
    from.onchange = to.onchange = function () { range.from = from.value; range.to = to.value; loadSchedule(); };
    document.getElementById("sc-c").onchange = function (e) { range.showCancelled = e.target.checked; loadSchedule(); };
    view().querySelectorAll("[data-q]").forEach(function (b) { b.onclick = function () { var n = +b.dataset.q; range.from = n < 0 ? addDays(today(), n) : today(); range.to = n < 0 ? today() : addDays(today(), n); from.value = range.from; to.value = range.to; loadSchedule(); }; });
    loadSchedule();
  }
  function loadSchedule() {
    api("/api/admin/bookings?from=" + range.from + "&to=" + range.to).then(function (d) {
      var box = document.getElementById("sc-list"); if (!box) return;
      if (!d.ok) { box.innerHTML = "<p class='bk-error'>" + esc(d.error) + "</p>"; return; }
      var items = d.bookings.filter(function (b) { return range.showCancelled || b.status !== "cancelled"; }).map(function (b) { return { kind: "b", at: b.start_local, b: b }; })
        .concat(d.blocks.map(function (k) { return { kind: "k", at: k.start_local < range.from + "T00:00" ? range.from + "T00:00" : k.start_local, k: k }; }))
        .sort(function (a, b) { return a.at < b.at ? -1 : 1; });
      if (!items.length) { box.innerHTML = "<p style='color:var(--ink-soft)'>Nothing booked in this range yet.</p>"; return; }
      var html = "", day = "";
      items.forEach(function (it) {
        var d0 = it.at.slice(0, 10);
        if (d0 !== day) { html += (day ? "</div>" : "") + '<div class="day-group"><h3>' + dl(d0) + "</h3>"; day = d0; }
        if (it.kind === "k") {
          var k = it.k, allDay = k.start_local.slice(11) === "00:00" && k.end_local.slice(11) === "00:00";
          html += '<div class="appt block"><div class="t">' + (allDay ? "All day" : tl(k.start_local.slice(11)) + "<small>to " + tl(k.end_local.slice(11)) + "</small>") + '</div><div class="who"><b>Time off</b><div>' + esc(k.reason || "Blocked") + (allDay && k.end_local.slice(0, 10) !== addDays(k.start_local.slice(0, 10), 1) ? " · until " + dl(addDays(k.end_local.slice(0, 10), -1)) : "") + '</div></div><div class="acts"><button class="mini warn" data-unblock="' + k.id + '">Remove</button></div></div>';
          return;
        }
        var b = it.b;
        html += '<div class="appt" data-id="' + b.id + '"><div class="t">' + tl(b.start_local.slice(11)) + "<small>" + dur(b.duration) + "</small></div>" +
          '<div class="who"><b>' + esc(b.name) + '</b><span class="pill ' + b.status + '">' + LABEL[b.status] + "</span>" + (b.first_visit ? '<span class="pill pending">New client</span>' : "") +
          "<div>" + esc(b.service_name) + " · " + esc(b.ref) + "</div>" +
          "<div>" + [b.phone ? '<a href="tel:' + esc(b.phone) + '">' + esc(b.phone) + "</a>" : "", b.email ? '<a href="mailto:' + esc(b.email) + '">' + esc(b.email) + "</a>" : ""].filter(Boolean).join(" · ") + "</div>" +
          ((b.heard_about || b.utm_source || b.promo_code) ? "<div>" + [b.heard_about && "Found us: " + esc(b.heard_about), b.utm_source && "Source: " + esc(b.utm_source), b.promo_code && "Code: " + esc(b.promo_code)].filter(Boolean).join(" · ") + "</div>" : "") +
          (b.notes ? '<div class="note">' + esc(b.notes) + "</div>" : "") + "</div>" +
          '<div class="acts">' +
          (b.status === "pending" ? '<button class="mini" data-st="confirmed">Confirm</button>' : "") +
          (b.status === "confirmed" ? '<button class="mini" data-st="completed">Done</button><button class="mini" data-st="no_show">No-show</button>' : "") +
          (b.status !== "cancelled" ? '<button class="mini" data-move>Move</button><button class="mini warn" data-st="cancelled">Cancel</button>' : '<button class="mini" data-st="confirmed">Restore</button>') +
          "</div></div>";
      });
      box.innerHTML = html + "</div>";
    });
  }
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t.dataset && t.dataset.unblock) { api("/api/admin/blocks/" + t.dataset.unblock, "DELETE").then(function () { toast("Time off removed"); loadSchedule(); }); return; }
    var row = t.closest && t.closest(".appt[data-id]"); if (!row) return;
    var id = row.dataset.id;
    if (t.dataset.st) {
      var st = t.dataset.st, notify = false;
      if (st === "cancelled" || (st === "confirmed" && /Confirm/.test(t.textContent))) {
        var acts = t.parentNode;
        acts.innerHTML = '<span style="font-size:.85rem;font-weight:700">' + (st === "cancelled" ? "Cancel this booking?" : "Confirm this request?") + '</span><button class="mini" data-go="1">Yes + email client</button><button class="mini" data-go="0">Yes, no email</button><button class="mini" data-back>Back</button>';
        acts.querySelector("[data-back]").onclick = loadSchedule;
        acts.querySelectorAll("[data-go]").forEach(function (g) { g.onclick = function () { setStatus(id, st, g.dataset.go === "1"); }; });
        return;
      }
      setStatus(id, st, notify);
    }
    if (t.hasAttribute && t.hasAttribute("data-move")) {
      var a = t.parentNode;
      a.innerHTML = '<input type="date" class="mv-d" style="font:inherit;padding:6px;border-radius:10px;border:1.5px solid var(--line)"><input type="time" step="900" class="mv-t" style="font:inherit;padding:6px;border-radius:10px;border:1.5px solid var(--line)"><label class="check" style="font-size:.8rem"><input type="checkbox" class="mv-n" checked> Email client</label><button class="mini" data-save>Save</button><button class="mini" data-back>Back</button>';
      a.querySelector("[data-back]").onclick = loadSchedule;
      a.querySelector("[data-save]").onclick = function () {
        var d = a.querySelector(".mv-d").value, tm = a.querySelector(".mv-t").value;
        if (!d || !tm) { toast("Pick a new date and time"); return; }
        api("/api/admin/bookings/" + id, "PATCH", { date: d, time: tm, notify: a.querySelector(".mv-n").checked }).then(function (r) { toast(r.ok ? "Appointment moved" : r.error); if (r.ok) loadSchedule(); });
      };
    }
  });
  function setStatus(id, st, notify) {
    api("/api/admin/bookings/" + id, "PATCH", { status: st, notify: notify }).then(function (r) { toast(r.ok ? "Marked " + LABEL[st].toLowerCase() : r.error); loadSchedule(); });
  }

  // ---------- new booking ----------
  function newBooking() {
    view().innerHTML = '<form class="panel" id="nb"><h2>Add a booking</h2><p style="color:var(--ink-soft);margin:-8px 0 18px">For phone, text and in-person bookings. Studio hours don\'t apply here, so you can book anytime.</p><div class="fgrid">' +
      '<div class="field"><label for="nb-s">Service</label><select id="nb-s">' + ME.services.map(function (s) { return '<option value="' + s.id + '" data-d="' + s.duration + '">' + esc(s.name) + " (" + dur(s.duration) + ")</option>"; }).join("") + "</select></div>" +
      '<div class="field"><label for="nb-du">Length (minutes)</label><input id="nb-du" type="number" min="5" max="600" step="5" value="' + ME.services[0].duration + '"></div>' +
      '<div class="field"><label for="nb-d">Date</label><input id="nb-d" type="date" required value="' + today() + '"></div>' +
      '<div class="field"><label for="nb-t">Time</label><input id="nb-t" type="time" step="900" required></div>' +
      '<div class="field"><label for="nb-n">Client name</label><input id="nb-n" required></div>' +
      '<div class="field"><label for="nb-p">Phone</label><input id="nb-p" type="tel"></div>' +
      '<div class="field full"><label for="nb-e">Email (for confirmation &amp; reminders)</label><input id="nb-e" type="email"></div>' +
      '<div class="field full"><label for="nb-no">Notes</label><textarea id="nb-no"></textarea></div>' +
      '<label class="check"><input type="checkbox" id="nb-f"> First visit</label><label class="check"><input type="checkbox" id="nb-m" checked> Email the client a confirmation</label>' +
      '<label class="check"><input type="checkbox" id="nb-o"> Allow overlap with other bookings</label></div>' +
      '<div class="form-foot"><span></span><button class="btn btn-glow">Add booking</button></div></form>';
    var s = document.getElementById("nb-s");
    s.onchange = function () { document.getElementById("nb-du").value = s.selectedOptions[0].dataset.d; };
    document.getElementById("nb").addEventListener("submit", function (e) {
      e.preventDefault();
      var g = function (id) { return document.getElementById(id); };
      api("/api/admin/bookings", "POST", { service: s.value, duration: +g("nb-du").value, date: g("nb-d").value, time: g("nb-t").value, name: g("nb-n").value, phone: g("nb-p").value, email: g("nb-e").value, notes: g("nb-no").value, firstVisit: g("nb-f").checked, notify: g("nb-m").checked, force: g("nb-o").checked })
        .then(function (r) { if (r.ok) { toast("Booked · " + r.ref); range = { from: g("nb-d").value, to: addDays(g("nb-d").value, 7) }; TAB = "schedule"; shell(); } else toast(r.error); });
    });
  }

  // ---------- time off ----------
  function timeOff() {
    view().innerHTML = '<form class="panel" id="to"><h2>Block time off</h2><p style="color:var(--ink-soft);margin:-8px 0 18px">Vacations, holidays, personal appointments. Clients can\'t book over blocked time. Leave the times empty to block whole days.</p><div class="fgrid">' +
      '<div class="field"><label for="to-d">From date</label><input type="date" id="to-d" required value="' + today() + '"></div>' +
      '<div class="field"><label for="to-ed">To date (optional)</label><input type="date" id="to-ed"></div>' +
      '<div class="field"><label for="to-s">Start time (optional)</label><input type="time" id="to-s" step="900"></div>' +
      '<div class="field"><label for="to-e">End time (optional)</label><input type="time" id="to-e" step="900"></div>' +
      '<div class="field full"><label for="to-r">Reason (only you see this)</label><input id="to-r" placeholder="Vacation, doctor, education class..."></div></div>' +
      '<div class="form-foot"><span></span><button class="btn btn-glow">Block this time</button></div></form>';
    document.getElementById("to").addEventListener("submit", function (e) {
      e.preventDefault();
      var g = function (id) { return document.getElementById(id).value; };
      api("/api/admin/blocks", "POST", { date: g("to-d"), endDate: g("to-ed"), start: g("to-s"), end: g("to-e"), reason: g("to-r") }).then(function (r) { if (r.ok) { toast("Time blocked"); range = { from: g("to-d"), to: addDays(g("to-ed") || g("to-d"), 7) }; TAB = "schedule"; shell(); } else toast(r.error); });
    });
  }

  // ---------- clients / list ----------
  function table(rows, cols) {
    if (!rows.length) return "<p style='color:var(--ink-soft)'>Nothing here yet.</p>";
    return '<div class="table-wrap"><table class="data"><thead><tr>' + cols.map(function (c) { return "<th>" + c[1] + "</th>"; }).join("") + "</tr></thead><tbody>" +
      rows.map(function (r) { return "<tr>" + cols.map(function (c) { return "<td>" + esc(c[2] ? c[2](r[c[0]], r) : r[c[0]]) + "</td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div>";
  }
  function clients() {
    view().innerHTML = '<div class="panel"><div class="row-tools"><h2 style="margin:0">Clients</h2><input id="cl-q" placeholder="Search name, email, phone" style="margin-left:auto;font:inherit;padding:.6em 1em;border-radius:999px;border:1.5px solid var(--line);min-width:0"><a class="mini" href="/api/admin/clients?format=csv">Download CSV</a></div><div id="cl-t">Loading...</div></div>';
    api("/api/admin/clients").then(function (d) {
      var all = d.clients || [];
      var cols = [["name", "Name"], ["email", "Email"], ["phone", "Phone"], ["visits", "Visits"], ["no_shows", "No-shows"], ["cancellations", "Cancels"], ["last_booking", "Last booked", function (v) { return v ? v.slice(0, 10) : ""; }], ["marketing_ok", "Opted in", function (v) { return v ? "Yes" : ""; }]];
      var draw = function (q) { document.getElementById("cl-t").innerHTML = table(all.filter(function (c) { return !q || (c.name + c.email + c.phone).toLowerCase().indexOf(q) > -1; }), cols); };
      draw(""); document.getElementById("cl-q").oninput = function (e) { draw(e.target.value.toLowerCase()); };
    });
  }
  function emailList() {
    view().innerHTML = '<div class="panel"><div class="row-tools"><h2 style="margin:0">Email list</h2><a class="mini" style="margin-left:auto" href="/api/admin/subscribers?format=csv">Download CSV</a></div><p style="color:var(--ink-soft);margin-bottom:16px">People who joined from the website or opted in while booking. Import the CSV into Mailchimp, Klaviyo or Flodesk to send newsletters and last-minute openings.</p><div id="el-t">Loading...</div></div>';
    api("/api/admin/subscribers").then(function (d) { document.getElementById("el-t").innerHTML = table(d.subscribers || [], [["email", "Email"], ["name", "Name"], ["source", "Joined from"], ["utm_source", "Traffic source"], ["created_at", "Date", function (v) { return (v || "").slice(0, 10); }]]); });
  }

  // ---------- insights ----------
  function bars(list) {
    if (!list.length) return "<p style='color:var(--ink-soft)'>No data yet.</p>";
    var max = Math.max.apply(null, list.map(function (x) { return x.n; }));
    return '<div class="bars">' + list.map(function (x) { return '<div class="bar"><span>' + esc(x.k) + '</span><i style="width:' + Math.max(4, x.n / max * 100) + '%"></i><em>' + x.n + "</em></div>"; }).join("") + "</div>";
  }
  function insights() {
    view().innerHTML = "<p>Loading...</p>";
    api("/api/admin/stats").then(function (d) {
      if (!d.ok) return;
      var st = {}; d.byStatus.forEach(function (x) { st[x.status] = x.n; });
      view().innerHTML = '<div class="stats">' +
        [[d.upcoming, "Upcoming appointments"], [(st.confirmed || 0) + (st.completed || 0), "Booked, last 90 days"], [st.cancelled || 0, "Cancelled, 90 days"], [st.no_show || 0, "No-shows, 90 days"], [d.subscribers, "On the email list"]]
          .map(function (s) { return '<div class="stat"><b>' + s[0] + "</b><span>" + s[1] + "</span></div>"; }).join("") + "</div>" +
        '<div class="panel"><h2>Where online bookings come from</h2><p style="color:var(--ink-soft);margin:-8px 0 16px">Tracked automatically from links, ads and referrers. Add ?utm_source=instagram&amp;utm_campaign=spring to links you share.</p>' + bars(d.sources) + "</div>" +
        '<div class="panel"><h2>"How did you find us?"</h2>' + bars(d.heardAbout) + "</div>" +
        '<div class="panel"><h2>Most booked services</h2>' + bars(d.services) + "</div>";
    });
  }

  // ---------- settings ----------
  function settings() {
    view().innerHTML = '<div class="panel"><h2>Sync bookings to your phone calendar</h2>' +
      (ME.calendarFeed ? '<p style="margin-bottom:12px">Subscribe to this private link in Apple Calendar (Settings → Calendar → Accounts → Add Subscribed Calendar) or Google Calendar (Other calendars → From URL). New bookings appear automatically.</p><code class="code" id="cf">' + esc(ME.calendarFeed) + '</code><div style="margin-top:12px"><button class="mini" id="cf-copy">Copy link</button></div><p style="color:var(--ink-soft);margin-top:10px;font-size:.88rem">Keep this link private. Anyone with it can see your client list.</p>'
        : '<p>Set the <b>CALENDAR_KEY</b> secret to turn on your private calendar feed. See the README.</p>') + "</div>" +
      '<div class="panel"><h2>Email</h2><p>' + (ME.emailEnabled ? "✅ Confirmation, reminder and thank-you emails are on." : "⚠️ Emails are off. Add a RESEND_API_KEY secret to send confirmations and reminders.") + '</p><div style="margin-top:12px"><button class="mini" id="run">Send due reminders now</button></div></div>' +
      '<div class="panel"><h2>Export everything</h2><p style="margin-bottom:12px">Your data is yours. Download it any time.</p><div style="display:flex;gap:8px;flex-wrap:wrap"><a class="mini" href="/api/admin/export">All bookings (CSV)</a><a class="mini" href="/api/admin/clients?format=csv">Clients (CSV)</a><a class="mini" href="/api/admin/subscribers?format=csv">Email list (CSV)</a></div></div>' +
      '<div class="panel"><h2>Hours, services &amp; prices</h2><p>These live in <b>config.json</b> in the website code, alongside the booking rules. Change them there and redeploy, and the website, booking calendar and Google listing data all update together. Studio timezone: <b>' + esc(ME.timezone) + "</b>.</p></div>";
    var c = document.getElementById("cf-copy");
    if (c) c.onclick = function () { navigator.clipboard.writeText(ME.calendarFeed).then(function () { toast("Link copied"); }, function () { toast("Select the link and copy it"); }); };
    document.getElementById("run").onclick = function () { api("/api/admin/run-scheduled", "POST").then(function (r) { toast(r.ok ? "Sent " + r.reminders + " reminders, " + r.followups + " thank-yous" : r.error); }); };
  }

  boot();
})();
