/* Client "manage my booking" page: /manage/?t=TOKEN */
(function () {
  "use strict";
  var box = document.getElementById("manage");
  if (!box) return;
  var token = new URLSearchParams(location.search).get("t") || "";
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  var LABEL = { confirmed: "Confirmed", pending: "Awaiting confirmation", cancelled: "Cancelled", completed: "Completed", no_show: "Missed" };

  function show(d) {
    var active = d.status === "confirmed" || d.status === "pending";
    box.innerHTML =
      '<div class="bk-done">' +
      '<div class="badge" aria-hidden="true">' + (d.status === "cancelled" ? "×" : "✦") + "</div>" +
      "<h2>" + (d.status === "cancelled" ? "This booking is cancelled" : d.past ? "Thanks for visiting, " + esc(d.name) + "!" : "See you soon, " + esc(d.name) + "!") + "</h2>" +
      '<span class="ref">' + esc(d.ref) + " · " + esc(LABEL[d.status] || d.status) + "</span>" +
      '<p class="when">' + esc(d.service) + " · " + esc(d.date) + " at " + esc(d.time) + "</p>" +
      '<div class="bk-actions" id="mg-actions"></div>' +
      '<p class="muted" id="mg-note"></p>' +
      "</div>";
    var acts = document.getElementById("mg-actions"), note = document.getElementById("mg-note");
    if (active && !d.past) {
      acts.innerHTML = '<a class="btn btn-glow" target="_blank" rel="noopener" href="' + esc(d.google) + '">Add to Google Calendar</a>' +
        '<a class="btn btn-line" href="/api/bookings/' + encodeURIComponent(token) + '/ics">Apple / Outlook calendar</a>';
      if (d.canCancel) {
        var c = document.createElement("button"); c.className = "btn btn-line"; c.type = "button"; c.textContent = "Cancel appointment";
        c.addEventListener("click", function () { confirmCancel(c, d); });
        acts.appendChild(c);
        note.textContent = "Need a different time? Cancel here and book a new slot, or contact us. " + d.policy;
      } else {
        note.innerHTML = "Online changes close " + d.cancelNoticeHours + " hours before your appointment. Please contact us directly: <a href=\"mailto:" + esc(window.PS_EMAIL) + '">' + esc(window.PS_EMAIL) + "</a>";
      }
    } else {
      acts.innerHTML = '<a class="btn btn-glow" href="/book/?service=' + encodeURIComponent(d.serviceId) + '">Book again</a>' +
        (d.past && d.reviewUrl ? '<a class="btn btn-line" target="_blank" rel="noopener" href="' + esc(d.reviewUrl) + '">Leave a Google review</a>' : "");
    }
  }

  function confirmCancel(btn, d) {
    var acts = btn.parentNode;
    acts.innerHTML = "";
    var p = document.createElement("p"); p.className = "muted"; p.style.flexBasis = "100%"; p.textContent = "Cancel your " + d.service + " on " + d.date + " at " + d.time + "?";
    var yes = document.createElement("button"); yes.className = "btn btn-glow"; yes.type = "button"; yes.textContent = "Yes, cancel it";
    var no = document.createElement("button"); no.className = "btn btn-line"; no.type = "button"; no.textContent = "Keep my appointment";
    no.addEventListener("click", function () { show(d); });
    yes.addEventListener("click", function () {
      yes.disabled = true; yes.textContent = "Cancelling...";
      fetch("/api/bookings/" + encodeURIComponent(token) + "/cancel", { method: "POST" }).then(function (r) { return r.json(); }).then(function (x) {
        if (x.ok) { show(x); if (window.psTrack) window.psTrack("booking_cancel", { service: x.service }); }
        else { yes.disabled = false; yes.textContent = "Yes, cancel it"; p.textContent = x.error; }
      }).catch(function () { yes.disabled = false; yes.textContent = "Yes, cancel it"; p.textContent = "We couldn't connect. Please try again."; });
    });
    acts.appendChild(p); acts.appendChild(yes); acts.appendChild(no);
  }

  if (!token) { box.innerHTML = '<div class="bk-done"><h2>Find your booking</h2><p class="muted">Open the "Manage booking" link in your confirmation email to view, add to calendar or cancel your appointment.</p><div class="bk-actions"><a class="btn btn-glow" href="/book/">Book an appointment</a></div></div>'; return; }
  fetch("/api/bookings/" + encodeURIComponent(token)).then(function (r) { return r.json(); }).then(function (d) {
    if (d.ok) show(d);
    else box.innerHTML = '<div class="bk-done"><h2>We couldn\'t find that booking</h2><p class="muted">Check the link in your confirmation email, or contact us and we\'ll sort it out.</p><div class="bk-actions"><a class="btn btn-glow" href="/book/">Book an appointment</a></div></div>';
  }).catch(function () { box.innerHTML = '<div class="bk-done"><h2>Connection problem</h2><p class="muted">Please refresh the page to try again.</p></div>'; });
})();
