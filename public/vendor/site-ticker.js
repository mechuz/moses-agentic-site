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

/* Site-wide news strip: technology headlines running along the bottom of the page (styles in site-ticker.css).
   The whole strip is one link to the newswire's all-technology page. It reads /newswire/latest.json, a small file
   written with the newswire: [headline, source] pairs from across the technology sector. Everything is written with
   textContent. Not built on the newswire pages themselves. */
(function () {
  "use strict";
  if (/^\/newswire(\/|$)/.test(location.pathname) || document.getElementById("site-news") || !document.body) return;
  var root = document.documentElement;
  var CTA = "Click here for the latest tech news";
  var a = document.createElement("a");
  a.className = "site-news"; a.id = "site-news"; a.href = "/newswire/technology/";
  a.setAttribute("aria-label", CTA);
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  var tag = el("span", "sn-tag"); tag.setAttribute("aria-hidden", "true");
  tag.appendChild(el("i")); tag.appendChild(el("span", "sn-long", "Latest tech news")); tag.appendChild(el("span", "sn-short", "Tech news"));
  var run = el("span", "sn-run"); run.setAttribute("aria-hidden", "true");
  var line = el("span", "", CTA); run.appendChild(line);
  var more = el("span", "sn-more"); more.setAttribute("aria-hidden", "true");
  more.appendChild(el("span", "sn-long", CTA)); more.appendChild(el("b", "", "→"));
  a.appendChild(tag); a.appendChild(run); a.appendChild(more);

  /* on pages with the bottom menu, the strip sits right above it */
  var dock = null, ro = null;
  function place() {
    var h = dock && dock.isConnected && getComputedStyle(dock).display !== "none" ? dock.offsetHeight : 0;
    a.style.bottom = h + "px";
    a.classList.toggle("on-dock", h > 0);
    /* reserve room under the page: the strip, plus anything the page was short for its menu */
    var pad = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
    root.style.setProperty("--newsroom", Math.ceil(a.offsetHeight + Math.max(0, h - pad)) + "px");
  }
  function findDock() {
    var d = document.getElementById("v2dock");
    if (!d || d === dock) return;
    dock = d;
    if (window.ResizeObserver) { if (ro) ro.disconnect(); ro = new ResizeObserver(place); ro.observe(dock); }
    place();
  }

  function fill(items) {
    var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (calm) items = items.slice(0, 1);
    function seq() {
      items.forEach(function (x, i) {
        line.appendChild(el("b", "", String(x[1])));
        line.appendChild(document.createTextNode(String(x[0])));
        line.appendChild(el("i", "", "•"));
        if (!calm && (i % 5 === 4 || i === items.length - 1)) { line.appendChild(el("em", "", CTA + " →")); line.appendChild(el("i", "", "•")); }
      });
    }
    line.textContent = "";
    seq();
    if (calm) return;
    seq();   /* twice, so the loop has no seam */
    requestAnimationFrame(function () {
      run.style.setProperty("--crawl", Math.max(40, Math.round(line.scrollWidth / 2 / 52)) + "s");
      run.classList.add("go");
    });
  }

  document.body.appendChild(a);
  root.classList.add("has-news");
  findDock(); place();
  if (window.MutationObserver) new MutationObserver(findDock).observe(document.body, { childList: true });
  window.addEventListener("resize", place);
  window.addEventListener("load", function () { findDock(); place(); });
  if (window.v2Fit) window.v2Fit();
  var vv = window.visualViewport;
  if (vv) vv.addEventListener("resize", function () { root.classList.toggle("sn-zoom", vv.scale > 1.02); });

  fetch("/newswire/latest.json").then(function (r) { return r.ok ? r.json() : null; }).then(function (d) {
    var items = d && Array.isArray(d.items) ? d.items.filter(function (x) { return Array.isArray(x) && x[0] && x[1]; }).slice(0, 16) : [];
    if (items.length) fill(items);
  }).catch(function () {});
})();

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
    var cap = el("div", "sc-cap"); cap.appendChild(document.createTextNode("Technology sector")); cap.appendChild(el("span", "", "5 years"));
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
    /* wide screens: the corner of the hero; otherwise a card right under the first screen */
    var want = window.innerWidth >= 1264 ? "corner" : "below";
    var inPlace = card && card.isConnected && mode === want && (want === "corner" ? card.parentNode === hero : card.previousElementSibling === hero);
    if (inPlace) return;
    if (!card) build();
    mode = want;
    card.className = "site-chart " + want;
    if (want === "corner") hero.appendChild(card); else hero.parentNode.insertBefore(card, hero.nextSibling);
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
