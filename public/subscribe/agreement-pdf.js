/* Moses Agentic: the signed Subscription Agreement as a PDF on letterhead.

   ONE file, used in two places. Keep the two copies identical:
     1. the subscribe page (/subscribe/), for "Download your signed agreement";
     2. the website hook on Zapier (lib/agreement-pdf.ts), for the copy that is emailed and saved in Airtable.

   It needs pdf-lib (PDFDocument, StandardFonts, rgb) passed in as PDFLib, so it has no imports of its own.
     MosesAgreement.fields(record)        the signed record (plain text lines) -> the fields printed on page 1
     MosesAgreement.modelFromDom(el)      the agreement on the page -> a small block model (browser only)
     MosesAgreement.modelFromText(text)   plain agreement text -> the same model (fallback)
     MosesAgreement.build(PDFLib, f, model, logo)   -> Promise of a PDFDocument; call .save() or .saveAsBase64()
     MosesAgreement.fileName(business)    -> the PDF file name
*/
var MosesAgreement = (function () {
  var TZ = "America/New_York";

  /* ---------- the signed record -> fields ---------- */
  function fields(record) {
    var text = String(record || "").split(/\n\s*AGREEMENT TEXT \(/)[0];
    var lines = text.split(/\r?\n/), f = { items: [], keyTerms: [] }, signedLine = "";
    var map = { "Business": "business", "Name": "signer", "Email": "email", "Title": "title", "Monthly total": "monthly", "One-time": "oneTime",
      "Due at signing": "dueNow", "Due now": "dueNow", "Payment method": "payMethod", "Reference": "reference", "Initials": "initials", "Signed at": "signedAt", "Agreement version": "version",
      "Agreement text SHA-256": "sha", "Device": "device", "Terms and Conditions box": "tc" };
    lines.forEach(function (ln) {
      ln = ln.trim(); if (!ln) return;
      if (/^•\s*/.test(ln)) { f.items.push(ln.replace(/^•\s*/, "")); return; }
      var m = ln.match(/^Key term shown:\s*(.+)$/); if (m) { f.keyTerms.push(m[1]); return; }
      if (/^SIGNED ONLINE by /.test(ln)) { signedLine = ln; return; }
      m = ln.match(/^([A-Za-z0-9 -]{2,40}):\s*(.*)$/);
      if (m && map[m[1]] && f[map[m[1]]] === undefined) f[map[m[1]]] = m[2].trim();
    });
    ["business", "signer", "email", "title", "monthly", "oneTime", "dueNow", "payMethod", "reference", "initials", "signedAt", "version", "sha", "device", "tc"].forEach(function (k) { if (f[k] === undefined) f[k] = ""; });
    if (!f.title && signedLine && f.signer && f.business) {
      var mid = signedLine.slice(("SIGNED ONLINE by " + f.signer).length, Math.max(0, signedLine.length - (" for " + f.business).length));
      f.title = mid.replace(/^,\s*/, "").trim();
    }
    f.initialsNote = /\(/.test(f.initials) ? f.initials.replace(/^[^(]*\(/, "").replace(/\)\s*$/, "") : "";
    f.initials = f.initials.replace(/\s*\(.*$/, "").trim();
    if (f.reference === "-") f.reference = "";
    if (!f.dueNow) {
      var num = function (s) { var x = String(s || "").match(/\$([\d,]+(?:\.\d+)?)/); return x ? parseFloat(x[1].replace(/,/g, "")) : 0; };
      var due = num(f.monthly) + num(f.oneTime);
      if (due) f.dueNow = "$" + due.toLocaleString("en-US");
    }
    return f;
  }

  function when(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d.getTime())) return String(iso || "");
    try {
      return (new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "long", day: "numeric" }).format(d) + " at " +
        new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit", hour12: true }).format(d) + " Eastern Time").replace(/[\u202F\u00A0]/g, " ");
    } catch (e) { return d.toISOString(); }
  }

  function fileName(business) {
    var safe = String(business || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60);
    return "Moses-Agentic-Subscription-Agreement" + (safe ? "-" + safe : "") + ".pdf";
  }

  /* ---------- the agreement -> block model ----------
     h: heading, p: paragraph of runs (b = bold), table: rows of cells, box: a highlighted group of blocks */
  function tidy(runs) {
    var out = [];
    runs.forEach(function (r) {
      var x = String(r.x).replace(/[ \t\r\n ]+/g, " "); if (!x) return;
      var last = out[out.length - 1];
      if (last && !!last.b === !!r.b) last.x += x; else out.push({ x: x, b: r.b ? 1 : 0 });
    });
    if (out.length) { out[0].x = out[0].x.replace(/^ +/, ""); out[out.length - 1].x = out[out.length - 1].x.replace(/ +$/, ""); }
    return out.filter(function (r) { return r.x; });
  }
  function runsOf(node, bold, out) {
    for (var i = 0; i < node.childNodes.length; i++) {
      var c = node.childNodes[i];
      if (c.nodeType === 3) out.push({ x: c.nodeValue, b: bold });
      else if (c.nodeType === 1) runsOf(c, bold || /^(STRONG|B|TH)$/.test(c.tagName), out);
    }
    return out;
  }
  function modelFromDom(root) {
    var blocks = [];
    for (var i = 0; i < root.children.length; i++) {
      var el = root.children[i], tag = el.tagName, cls = " " + (el.className || "") + " ";
      if (/^H[1-6]$/.test(tag)) blocks.push({ t: "h", x: el.textContent.replace(/\s+/g, " ").trim() });
      else if (tag === "P") { var r = tidy(runsOf(el, cls.indexOf(" bt ") > -1, [])); if (r.length) blocks.push({ t: "p", r: r }); }
      else if (tag === "UL" || tag === "OL") { for (var j = 0; j < el.children.length; j++) { var lr = tidy(runsOf(el.children[j], false, [])); if (lr.length) blocks.push({ t: "p", r: lr, bullet: 1 }); } }
      else if (tag === "TABLE" || (tag === "DIV" && el.querySelector && el.querySelector(":scope > table"))) {
        var tb = tag === "TABLE" ? el : el.querySelector(":scope > table"), rows = [], trs = tb.querySelectorAll("tr");
        for (var a = 0; a < trs.length; a++) {
          var cells = [];
          for (var b = 0; b < trs[a].children.length; b++) { var td = trs[a].children[b]; cells.push({ r: tidy(runsOf(td, td.tagName === "TH", [])), h: td.tagName === "TH" ? 1 : 0, s: Math.max(1, parseInt(td.getAttribute("colspan") || "1", 10) || 1) }); }
          if (cells.length) rows.push(cells);
        }
        if (rows.length) blocks.push({ t: "table", rows: rows });
      }
      else if (tag === "DIV" && cls.indexOf(" box ") > -1) { var inner = modelFromDom(el); if (inner.length) blocks.push({ t: "box", c: inner }); }
      else if (tag === "DIV") blocks = blocks.concat(modelFromDom(el));
    }
    return blocks;
  }
  function modelFromText(text) {
    return String(text || "").split(/\r?\n/).map(function (ln) { return ln.replace(/\t+/g, "   ").trim(); }).filter(Boolean).map(function (ln) {
      return /^\d{1,2}\. \S/.test(ln) && ln.length < 70 ? { t: "h", x: ln } : { t: "p", r: [{ x: ln, b: 0 }] };
    });
  }

  /* ---------- the PDF ---------- */
  function build(PDFLib, f, model, logo) {
    var rgb = PDFLib.rgb, SF = PDFLib.StandardFonts;
    var C = { navy: rgb(11 / 255, 37 / 255, 69 / 255), ink: rgb(22 / 255, 38 / 255, 61 / 255), blue: rgb(31 / 255, 111 / 255, 255 / 255), slate: rgb(68 / 255, 84 / 255, 107 / 255),
      line: rgb(213 / 255, 226 / 255, 240 / 255), wash: rgb(244 / 255, 248 / 255, 253 / 255), lime: rgb(198 / 255, 244 / 255, 50 / 255), amber: rgb(255 / 255, 246 / 255, 224 / 255), amberLine: rgb(224 / 255, 181 / 255, 74 / 255), white: rgb(1, 1, 1) };
    var W = 612, H = 792, M = 54, CW = W - 2 * M, FLOOR = 66;

    return PDFLib.PDFDocument.create().then(function (pdf) {
      return Promise.all([pdf.embedFont(SF.Helvetica), pdf.embedFont(SF.HelveticaBold), pdf.embedFont(SF.HelveticaOblique), logo ? pdf.embedPng(logo) : Promise.resolve(null)]).then(function (res) {
        var R = res[0], B = res[1], I = res[2], LOGO = res[3];
        var okChars = {}; R.getCharacterSet().forEach(function (c) { okChars[c] = 1; });
        var SWAP = { "−": "-", "‐": "-", "‑": "-", "→": "->", "←": "<-", "≤": "<=", "≥": ">=", " ": " ", " ": " ", " ": " ", " ": " ", "✓": "x", "✔": "x", "\t": " ", "\n": " ", "\r": " " };
        function clean(s) {
          s = String(s === null || s === undefined ? "" : s); var out = "";
          for (var i = 0; i < s.length; i++) { var ch = s.charAt(i); if (SWAP[ch] !== undefined) ch = SWAP[ch]; for (var k = 0; k < ch.length; k++) { var cc = ch.charCodeAt(k); out += cc < 32 ? " " : (okChars[cc] ? ch.charAt(k) : "?"); } }
          return out;
        }
        /* width glyph by glyph: pdf-lib measures a whole string with kerning but draws it without, which closes up spaces */
        var wCache = {};
        function wOf(text, font, size) {
          var key = font.name, tab = wCache[key] || (wCache[key] = {}), w = 0;
          for (var i = 0; i < text.length; i++) { var ch = text.charAt(i); if (tab[ch] === undefined) tab[ch] = font.widthOfTextAtSize(ch, 1); w += tab[ch]; }
          return w * size;
        }

        var pages = [], page = null, y = 0;
        function newPage() {
          page = pdf.addPage(); page.setSize(W, H); pages.push(page);
          if (pages.length === 1) { y = H - 44; return; }
          var top = H - 40;
          if (LOGO) { var lw = 92, lh = lw * LOGO.height / LOGO.width; page.drawImage(LOGO, { x: M, y: top - lh, width: lw, height: lh }); }
          var lab = "Subscription Agreement  ·  signed copy";
          page.drawText(lab, { x: W - M - wOf(lab, R, 8), y: top - 12, size: 8, font: R, color: C.slate });
          page.drawRectangle({ x: M, y: top - 30, width: CW, height: 0.6, color: C.line });
          y = top - 50;
        }
        function need(h) { if (y - h < FLOOR && y < H - 120) newPage(); }

        /* wrap runs [{x, b}] into lines of segments that fit maxW */
        function wrap(runs, size, maxW, baseFont) {
          var lines = [], cur = [], curW = 0;
          function push() { lines.push({ segs: cur, w: curW }); cur = []; curW = 0; }
          runs.forEach(function (run) {
            var font = run.f || (run.b ? B : (baseFont || R)), words = clean(run.x).split(/( +)/);
            words.forEach(function (wd) {
              if (!wd) return;
              if (/^ +$/.test(wd)) { if (cur.length) { var sw = wOf(" ", font, size); cur.push({ x: " ", font: font, w: sw }); curW += sw; } return; }
              var ww = wOf(wd, font, size);
              if (curW + ww > maxW && cur.length) { while (cur.length && cur[cur.length - 1].x === " ") { curW -= cur.pop().w; } push(); }
              while (ww > maxW && wd.length > 1) {
                var n = wd.length; while (n > 1 && wOf(wd.slice(0, n), font, size) > maxW) n--;
                var part = wd.slice(0, n); cur.push({ x: part, font: font, w: wOf(part, font, size) }); curW = cur[0].w; push();
                wd = wd.slice(n); ww = wOf(wd, font, size);
              }
              cur.push({ x: wd, font: font, w: ww }); curW += ww;
            });
          });
          while (cur.length && cur[cur.length - 1].x === " ") { curW -= cur.pop().w; }
          if (cur.length) push();
          return lines;
        }
        function drawLine(ln, x, yy, size, color) { var cx = x; ln.segs.forEach(function (s) { if (s.x !== " ") page.drawText(s.x, { x: cx, y: yy, size: size, font: s.font, color: color }); cx += s.w; }); }
        /* a paragraph that may run across pages */
        function para(runs, o) {
          o = o || {}; var size = o.size || 9.3, lead = o.lead || size * 1.4, x = o.x === undefined ? M : o.x, maxW = o.w || (CW - (x - M)), color = o.color || C.ink;
          var lines = wrap(runs, size, maxW, o.font);
          lines.forEach(function (ln, i) { need(lead); if (o.bullet && i === 0) page.drawText("•", { x: x - 10, y: y - size, size: size, font: R, color: color }); drawLine(ln, x, y - size, size, color); y -= lead; });
          y -= o.after === undefined ? 5 : o.after;
        }
        function label(text) {
          need(34); y -= 8;
          page.drawText(clean(text).toUpperCase(), { x: M, y: y - 8, size: 8, font: B, color: C.blue });
          y -= 14; page.drawRectangle({ x: M, y: y, width: CW, height: 0.6, color: C.line }); y -= 10;
        }
        function row(name, runs, o) {
          o = o || {}; var size = o.size || 10, lead = size * 1.4, vx = M + 118, lines = wrap(runs, size, CW - 118, o.font);
          need(lead * Math.min(lines.length, 3));
          page.drawText(clean(name), { x: M, y: y - size, size: 9, font: R, color: C.slate });
          lines.forEach(function (ln) { need(lead); drawLine(ln, vx, y - size, size, o.color || C.navy); y -= lead; });
          y -= 4;
        }
        function heightOf(blocks, size, lead, maxW) {
          var h = 0; blocks.forEach(function (b) { if (b.t === "p") h += wrap(b.r, size, maxW).length * lead + 4; else if (b.t === "h") h += lead + 4; }); return h;
        }

        /* ----- page 1: letterhead ----- */
        newPage();
        var lh1 = 0;
        if (LOGO) { var lw1 = 172; lh1 = lw1 * LOGO.height / LOGO.width; page.drawImage(LOGO, { x: M, y: y - lh1, width: lw1, height: lh1 }); }
        else { page.drawText("Moses Agentic", { x: M, y: y - 22, size: 22, font: B, color: C.navy }); lh1 = 28; }
        var site = "mosesagentic.com", mail = "welcome@mosesagentic.com";
        page.drawText(site, { x: W - M - wOf(site, B, 9.5), y: y - 13, size: 9.5, font: B, color: C.navy });
        page.drawText(mail, { x: W - M - wOf(mail, R, 9), y: y - 26, size: 9, font: R, color: C.slate });
        y -= Math.max(lh1, 30) + 16;
        page.drawRectangle({ x: M, y: y, width: CW, height: 0.8, color: C.line });
        page.drawRectangle({ x: M, y: y - 1.1, width: 46, height: 3, color: C.lime });
        y -= 34;

        /* title and the signed badge */
        page.drawText("Subscription Agreement", { x: M, y: y - 22, size: 23, font: B, color: C.navy });
        var badge = "SIGNED COPY", bw = wOf(badge, B, 8) + 18;
        page.drawRectangle({ x: W - M - bw, y: y - 21, width: bw, height: 18, color: C.lime });
        page.drawText(badge, { x: W - M - bw + 9, y: y - 15.5, size: 8, font: B, color: C.navy });
        y -= 34;
        para([{ x: "Between Moses Agentic and " }, { x: f.business || "the client", b: 1 }, { x: ". Signed electronically on " + when(f.signedAt) + "." }], { size: 10.5, color: C.slate, after: 8 });

        label("Client");
        row("Business", [{ x: f.business || "-", b: 1 }]);
        row("Signed by", [{ x: (f.signer || "-") + (f.title ? ", " + f.title : "") }]);
        row("Email", [{ x: f.email || "-" }]);
        if (f.reference) row("Reference", [{ x: f.reference }]);

        label("Your plan");
        (f.items.length ? f.items : ["-"]).forEach(function (it) { para([{ x: it }], { size: 10, x: M + 12, bullet: 1, color: C.navy, after: 3 }); });
        y -= 4;
        row("Monthly total", [{ x: f.monthly || "-", b: 1 }]);
        row("One-time", [{ x: f.oneTime || "none" }]);
        if (f.dueNow) row("Due at signing", [{ x: f.dueNow, b: 1 }]);
        if (f.payMethod) row("Payment method", [{ x: f.payMethod }]);

        label("Electronic signature");
        need(86);
        var sx = M, ix = M + 330, sy = y - 26;
        page.drawText(clean(f.signer || ""), { x: sx, y: sy, size: 18, font: I, color: C.navy });
        page.drawText(clean(f.initials || ""), { x: ix, y: sy, size: 18, font: I, color: C.navy });
        page.drawRectangle({ x: sx, y: sy - 7, width: 300, height: 0.8, color: C.navy });
        page.drawRectangle({ x: ix, y: sy - 7, width: CW - 330, height: 0.8, color: C.navy });
        page.drawText("Typed name, adopted as the signature", { x: sx, y: sy - 19, size: 8, font: R, color: C.slate });
        page.drawText("Initials", { x: ix, y: sy - 19, size: 8, font: R, color: C.slate });
        y = sy - 34;
        row("Signed", [{ x: when(f.signedAt) }]);
        row("Terms and Conditions", [{ x: /tick/i.test(f.tc) || !f.tc ? "Read and agreed (box ticked), with consent to sign electronically" : f.tc }]);
        if (f.keyTerms.length) {
          row("Key terms", [{ x: "Initialed once" + (f.initialsNote ? " (" + f.initialsNote + ")" : "") + ":" }]);
          f.keyTerms.forEach(function (k) { para([{ x: k }], { size: 9.5, x: M + 130, w: CW - 130, bullet: 1, color: C.ink, after: 2 }); });
          y -= 4;
        }

        /* ----- the agreement itself ----- */
        newPage();
        page.drawText("Terms and Conditions", { x: M, y: y - 16, size: 17, font: B, color: C.navy }); y -= 26;
        para([{ x: "Subscription Agreement" + (f.version ? ", version " + f.version : "") + ". This is the text that was shown and agreed to at signing." }], { size: 9, color: C.slate, after: 10 });

        function drawBlocks(blocks) {
          blocks.forEach(function (b, bi) {
            if (b.t === "h") {
              var nx = blocks[bi + 1], keep = 46;
              if (nx && nx.t === "box") keep = 30 + heightOf(nx.c, 9.3, 9.3 * 1.4, CW - 16) + 18;
              else if (nx && nx.t === "table") keep = 110;
              need(keep); y -= 6; para([{ x: b.x, b: 1 }], { size: 10.5, color: C.navy, after: 3 });
            }
            else if (b.t === "p") para(b.r, { bullet: b.bullet, x: b.bullet ? M + 12 : M });
            else if (b.t === "box") {
              var pad = 8, size = 9.3, lead = size * 1.4, inner = CW - 2 * pad, bh = heightOf(b.c, size, lead, inner) + 2 * pad - 4;
              need(bh + 6);
              page.drawRectangle({ x: M, y: y - bh, width: CW, height: bh, color: C.amber, borderColor: C.amberLine, borderWidth: 0.7 });
              var by = y - pad;
              b.c.forEach(function (c) { if (c.t !== "p" && c.t !== "h") return; wrap(c.t === "h" ? [{ x: c.x, b: 1 }] : c.r, size, inner).forEach(function (ln) { drawLine(ln, M + pad, by - size, size, C.ink); by -= lead; }); by -= 4; });
              y -= bh + 9;
            }
            else if (b.t === "table") {
              var cols = 0; b.rows.forEach(function (r) { var n = 0; r.forEach(function (c) { n += c.s || 1; }); cols = Math.max(cols, n); });
              var widths = []; for (var i = 0; i < cols; i++) widths.push(cols === 4 ? [0.43, 0.19, 0.19, 0.19][i] * CW : CW / cols);
              var ts = 8.5, tl = ts * 1.36, cp = 5;
              b.rows.forEach(function (r) {
                var x = M, ci = 0, laid = r.map(function (c) { var w = 0; for (var k = 0; k < (c.s || 1) && ci < cols; k++) w += widths[ci++]; var o = { x: x, w: w, lines: wrap(c.r, ts, w - 2 * cp), h: c.h }; x += w; return o; });
                var rh = 0; laid.forEach(function (c) { rh = Math.max(rh, c.lines.length * tl + 2 * cp - 2); });
                need(rh);
                laid.forEach(function (c) {
                  page.drawRectangle({ x: c.x, y: y - rh, width: c.w, height: rh, color: c.h ? C.wash : C.white, borderColor: C.line, borderWidth: 0.6 });
                  var ty = y - cp; c.lines.forEach(function (ln) { drawLine(ln, c.x + cp, ty - ts + 1, ts, C.ink); ty -= tl; });
                });
                y -= rh;
              });
              y -= 9;
            }
          });
        }
        drawBlocks(model && model.length ? model : [{ t: "p", r: [{ x: "The agreement text was not received with this record." }] }]);

        /* the signature record closes the document, then the footer goes on every page */
        need(120); y -= 8;
        label("Signature record");
        row("Signed by", [{ x: (f.signer || "-") + (f.title ? ", " + f.title : "") + (f.business ? ", for " + f.business : "") }], { size: 8.5, color: C.slate });
        row("Signed", [{ x: when(f.signedAt) + (f.signedAt ? "  (UTC " + f.signedAt + ")" : "") }], { size: 8.5, color: C.slate });
        row("Agreement version", [{ x: f.version || "-" }], { size: 8.5, color: C.slate });
        if (f.sha) row("Text fingerprint", [{ x: "SHA-256 " + f.sha }], { size: 8.5, color: C.slate });
        if (f.device) row("Device", [{ x: f.device }], { size: 8.5, color: C.slate });

        pages.forEach(function (p, i) {
          p.drawRectangle({ x: M, y: 46, width: CW, height: 0.6, color: C.line });
          var left = clean("Moses Agentic  ·  Subscription Agreement" + (f.business ? "  ·  " + f.business : "")); while (wOf(left, R, 8) > CW - 80 && left.length > 10) left = left.slice(0, -2);
          var right = "Page " + (i + 1) + " of " + pages.length;
          p.drawText(left, { x: M, y: 33, size: 8, font: R, color: C.slate });
          p.drawText(right, { x: W - M - wOf(right, R, 8), y: 33, size: 8, font: R, color: C.slate });
        });

        pdf.setTitle(clean("Subscription Agreement, signed copy" + (f.business ? ": " + f.business : "")));
        pdf.setAuthor("Moses Agentic"); pdf.setCreator("Moses Agentic"); pdf.setProducer("Moses Agentic"); pdf.setSubject("Signed Subscription Agreement");
        var d = new Date(f.signedAt); if (f.signedAt && !isNaN(d.getTime())) { pdf.setCreationDate(d); pdf.setModificationDate(d); }
        return pdf;
      });
    });
  }

  return { fields: fields, when: when, fileName: fileName, modelFromDom: modelFromDom, modelFromText: modelFromText, build: build };
})();
