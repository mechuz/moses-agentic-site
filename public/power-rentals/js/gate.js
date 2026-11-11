/* Passcode gate for the Power Rentals preview. Client-side only: it keeps casual visitors out, it is not security
   (the files are public). Unlock with the passcode, or open any page once with ?key=PASSCODE.
   To change the passcode, put the SHA-256 hex of the new code (lowercase) in HASH: echo -n "newcode" | sha256sum */
(function () {
  var HASH = '9ddcfbacecf591a1a7c90e499585937b10983a7131208af1efff65b56e295bb1';
  var KEY = 'pr_unlocked';
  try { if (sessionStorage.getItem(KEY) === '1') return; } catch (e) {}
  var html = document.documentElement; html.style.visibility = 'hidden';
  function sha(s) { return crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)).then(function (b) { return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join(''); }); }
  function unlock() { try { sessionStorage.setItem(KEY, '1'); } catch (e) {} var g = document.getElementById('prGate'); if (g) g.remove(); html.style.visibility = ''; }
  function show() {
    var g = document.createElement('div'); g.id = 'prGate';
    g.innerHTML = '<style>#prGate{position:fixed;inset:0;z-index:9999;background:#0B0B0B;display:grid;place-items:center;padding:16px;font-family:Inter,Arial,sans-serif;color:#F2F2F2;visibility:visible}' +
      '#prGate::before{content:"";position:absolute;inset:0 0 auto;height:10px;background:repeating-linear-gradient(-45deg,#FCB810 0 14px,#0B0B0B 14px 28px)}' +
      '#prGate form{display:grid;gap:14px;width:min(400px,100%);padding:32px;border:1px solid #2A2A2A;border-radius:18px;background:#151515}' +
      '#prGate img{width:200px;height:auto}#prGate h1{font-family:Poppins,Arial,sans-serif;font-size:1.15rem;margin:6px 0 0}#prGate p{margin:0;color:#B8B8B8;font-size:.92rem;line-height:1.45}' +
      '#prGate label{font-size:.8rem;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#FCB810}' +
      '#prGate input{padding:14px 16px;border:1px solid #333;border-radius:12px;background:#0B0B0B;color:#F2F2F2;font:inherit;font-size:1rem}' +
      '#prGate input:focus,#prGate button:focus{outline:3px solid #FCB810;outline-offset:2px}' +
      '#prGate button{padding:15px;border:0;border-radius:12px;background:#FCB810;color:#121212;font-weight:800;font-size:1rem;cursor:pointer}' +
      '#prGate .err{color:#FFB4A8;font-weight:600;min-height:1.2em;font-size:.88rem}#prGate small{color:#8C8C8C;font-size:.78rem}</style>' +
      '<form><img src="img/logo.png" alt="Power Rentals"><h1>Your new website: private preview</h1><p>Prepared for Power Rentals by Moses Agentic. Enter the passcode you were given.</p>' +
      '<label for="prCode">Passcode</label><input type="password" id="prCode" autocomplete="off" autofocus><div class="err" id="prErr" role="alert"></div><button type="submit">Enter the preview</button>' +
      '<small>Sample data throughout. Nothing you enter is sent anywhere.</small></form>';
    html.style.visibility = ''; document.body.appendChild(g);
    g.querySelector('form').addEventListener('submit', function (e) {
      e.preventDefault();
      var v = document.getElementById('prCode').value.trim().toLowerCase();
      sha(v).then(function (h) { if (h === HASH) unlock(); else document.getElementById('prErr').textContent = 'That passcode did not match. Try again.'; });
    });
  }
  var m = location.search.match(/[?&]key=([^&]+)/);
  function start() { if (m) { sha(decodeURIComponent(m[1]).trim().toLowerCase()).then(function (h) { if (h === HASH) { unlock(); var q = location.search.replace(/([?&])key=[^&]*&?/, '$1').replace(/[?&]$/, ''); history.replaceState(null, '', location.pathname + q + location.hash); } else show(); }); } else show(); }
  if (document.body) start(); else document.addEventListener('DOMContentLoaded', start);
})();
