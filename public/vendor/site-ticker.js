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
