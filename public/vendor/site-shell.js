/* Moses Agentic: the front page's behaviour on the pages the site's scripts generate (styles in site-shell.css).
   - the header is see-through over the hero and turns white once the page scrolls (as on the front page);
   - the hero's moving dots: the same drawing as the front page's (field() in the front page script);
   - the globe opens a small language menu; the articles are in English, the other languages open the front page. */
(function () {
  "use strict";
  var root = document.documentElement;

  /* header: white once the page has scrolled */
  function scrolled() { root.classList.toggle("ms-scrolled", (window.scrollY || root.scrollTop || 0) > 12); }
  scrolled();
  window.addEventListener("scroll", scrolled, { passive: true });

  /* language menu */
  document.addEventListener("click", function (e) {
    var g = e.target.closest ? e.target.closest("[data-ms-langs]") : null, menu = document.getElementById("ms-langmenu");
    if (!menu) return;
    if (g) { e.preventDefault(); var open = menu.hidden; menu.hidden = !open; g.setAttribute("aria-expanded", String(open)); return; }
    if (!menu.hidden && !e.target.closest(".ms-langs")) { menu.hidden = true; var b = document.querySelector("[data-ms-langs]"); if (b) b.setAttribute("aria-expanded", "false"); }
  });
  document.addEventListener("keydown", function (e) {
    var menu = document.getElementById("ms-langmenu");
    if (e.key === "Escape" && menu && !menu.hidden) { menu.hidden = true; var b = document.querySelector("[data-ms-langs]"); if (b) { b.setAttribute("aria-expanded", "false"); b.focus(); } }
  });

  /* the moving dots */
  function field() {
    var cv = document.querySelector(".ms-fx");
    if (!cv || !cv.getContext) return;
    var box = cv.parentElement, ctx = cv.getContext("2d");
    var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    var vv = window.visualViewport, zoomed = function () { return !!vv && vv.scale > 1.02; };
    var W = 0, H = 0, dots = [], mx = -9999, my = -9999, raf = 0;
    var COL = ["#1F6FFF", "#1F6FFF", "#4DB8FF", "#B4E61D"];
    /* the canvas is re-made only when the hero really changes size (an iPhone reports a "resize" as its toolbar slides) */
    function size() {
      var w = box.clientWidth, h = box.clientHeight;
      if (!w || !h || (w === W && h === H)) return false;
      W = w; H = h;
      var dpr = Math.min(2, window.devicePixelRatio || 1);
      if (W * H * dpr * dpr > 2.4e6) dpr = Math.max(1, Math.sqrt(2.4e6 / (W * H)));
      cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(150, Math.max(46, W * H / 9500)));
      dots = [];
      for (var i = 0; i < n; i++) dots.push({ x: Math.random() * W, y: Math.random() * H, vx: (Math.random() - .5) * .35, vy: (Math.random() - .5) * .35, r: 1.6 + Math.random() * 3.2, c: COL[i % COL.length] });
      return true;
    }
    function running() { return !calm && cv.isConnected && !document.hidden && !zoomed(); }
    function draw() {
      ctx.clearRect(0, 0, W, H);
      var i, j, d;
      for (i = 0; i < dots.length; i++) {
        d = dots[i];
        var dx = mx - d.x, dy = my - d.y, q = dx * dx + dy * dy;
        if (q < 200 * 200 && q > 1) { var f = .0009 * (1 - Math.sqrt(q) / 200) * 60; d.vx += dx / Math.sqrt(q) * f * .05; d.vy += dy / Math.sqrt(q) * f * .05; }
        d.vx *= .985; d.vy *= .985; d.vx += (Math.random() - .5) * .012; d.vy += (Math.random() - .5) * .012;
        d.x += d.vx; d.y += d.vy;
        if (d.x < -20) d.x = W + 20; else if (d.x > W + 20) d.x = -20;
        if (d.y < -20) d.y = H + 20; else if (d.y > H + 20) d.y = -20;
      }
      ctx.lineWidth = 1;
      for (i = 0; i < dots.length; i++) for (j = i + 1; j < dots.length; j++) {
        var a = dots[i], b = dots[j], ex = a.x - b.x, ey = a.y - b.y, s = ex * ex + ey * ey;
        if (s < 120 * 120) { ctx.strokeStyle = "rgba(31,111,255," + (.16 * (1 - Math.sqrt(s) / 120)).toFixed(3) + ")"; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }
      }
      for (i = 0; i < dots.length; i++) { d = dots[i]; ctx.globalAlpha = .75; ctx.fillStyle = d.c; ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill(); }
      ctx.globalAlpha = 1;
      raf = running() ? requestAnimationFrame(draw) : 0;
    }
    function wake() { if (!raf && running()) draw(); }
    size(); draw();
    function refit() { if (!zoomed() && size() && !raf) draw(); }
    if (window.ResizeObserver) new ResizeObserver(refit).observe(box);
    else { var t = 0; window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(refit, 180); }); }
    document.addEventListener("visibilitychange", wake);
    if (vv) vv.addEventListener("resize", function () { root.classList.toggle("ms-zoom", zoomed()); wake(); });
    box.addEventListener("pointermove", function (e) { var r = box.getBoundingClientRect(); mx = e.clientX - r.left; my = e.clientY - r.top; box.style.setProperty("--mx", mx + "px"); box.style.setProperty("--my", my + "px"); });
    box.addEventListener("pointerleave", function () { mx = my = -9999; });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", field); else field();
})();
