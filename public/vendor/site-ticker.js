/* Site-wide technology stock ticker. The band (#site-ticker) is already in the page; this fills it shortly after the
   page has loaded, so it never slows the first paint. If the quotes never arrive (blocked, offline), the band is
   taken away again and the page closes up. */
(function () {
  "use strict";
  var band = document.getElementById("site-ticker");
  if (!band || band.getAttribute("data-on")) return;
  band.setAttribute("data-on", "1");
  function off() { document.documentElement.classList.remove("has-ticker"); if (window.v2Fit) window.v2Fit(); }
  function mount() { window.MosesTicker.mount(band, { onFail: off }); }
  function go() {
    if (window.MosesTicker) return mount();
    var s = document.createElement("script");
    s.src = "/vendor/tech-ticker.js"; s.onload = mount; s.onerror = off;
    document.head.appendChild(s);
  }
  function soon() { setTimeout(go, 600); }
  if (document.readyState === "complete") soon(); else window.addEventListener("load", soon);
})();

/* The news strip that ran along the bottom of every page was removed on November 23, 2026 (ownership): the
   newswire is its own page now, reached from the footer link "Tech Newswire" (/newswire/). */

/* Home page: a small window with the technology sector's chart for the last five years (styles in site-ticker.css).
   It lives in the home hero (#v2-top). The page re-makes the hero when the language changes, so the window is put
   back whenever it goes missing. Nothing loads until the page has loaded. */
(function () {
  "use strict";
  var home = document.getElementById("v2home");
  if (!home) return;
  var card = null, box = null, mode = "", timer = 0;
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function build() {
    card = el("aside", "site-chart"); card.id = "site-chart";
    card.setAttribute("aria-label", "Technology sector, last five years");
    var cap = el("div", "sc-cap"); cap.appendChild(document.createTextNode("Tech sector")); cap.appendChild(el("span", "", "5 yrs"));
    box = el("div", "sc-box");
    card.appendChild(cap); card.appendChild(box);
  }
  function draw() {
    if (!window.MosesTicker || !window.MosesTicker.chart) return;
    window.MosesTicker.chart(box, { symbol: "AMEX:XLK", range: "60M", onFail: function () { if (card && card.parentNode) card.parentNode.removeChild(card); } });
  }
  function place() {
    var hero = document.getElementById("v2-top");
    if (!hero) return;
    /* a tiny window in the corner of the hero on wide screens only (ownership, November 23, 2026);
       on narrower screens it is left out, never a card of its own */
    if (window.innerWidth < 1264) { if (card && card.parentNode) card.parentNode.removeChild(card); mode = ""; return; }
    if (card && card.isConnected && card.parentNode === hero) return;
    if (!card) build();
    mode = "corner";
    card.className = "site-chart corner";
    hero.appendChild(card);
    draw();   /* a frame reloads when it is moved, so draw again */
  }
  function start() {
    function go() { place(); }
    if (window.MosesTicker && window.MosesTicker.chart) go();
    else { var s = document.createElement("script"); s.src = "/vendor/tech-ticker.js"; s.onload = go; document.head.appendChild(s); }
    if (window.MutationObserver) new MutationObserver(function () { clearTimeout(timer); timer = setTimeout(place, 60); }).observe(home, { childList: true });
    window.addEventListener("resize", function () { clearTimeout(timer); timer = setTimeout(place, 200); });
  }
  function soon() { setTimeout(start, 900); }
  if (document.readyState === "complete") soon(); else window.addEventListener("load", soon);
})();
