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
    g.innerHTML = '<style>#prGate{position:fixed;inset:0;z-index:9999;background:#fff;display:grid;place-items:center;padding:24px;font-family:Inter,-apple-system,BlinkMacSystemFont,Helvetica,Arial,sans-serif;color:#1D1D1F;visibility:visible;letter-spacing:-.011em}' +
      '#prGate form{display:grid;gap:16px;width:min(380px,100%);text-align:center;justify-items:center}' +
      '#prGate img{width:180px;height:auto;margin-bottom:18px}#prGate h1{font-size:2rem;font-weight:600;letter-spacing:-.03em;line-height:1.1;margin:0}#prGate p{margin:0;color:#6E6E73;font-size:1rem;line-height:1.45}' +
      '#prGate input{width:100%;box-sizing:border-box;padding:15px 18px;border:1px solid #D2D2D7;border-radius:12px;background:#fff;color:#1D1D1F;font:inherit;font-size:1.05rem;text-align:center;margin-top:8px}' +
      '#prGate input:focus{outline:none;border-color:#0B57D0;box-shadow:0 0 0 4px rgba(11,87,208,.14)}' +
      '#prGate button{width:100%;padding:15px;border:0;border-radius:980px;background:#1D1D1F;color:#fff;font-weight:500;font-size:1.05rem;cursor:pointer}#prGate button:focus-visible{outline:2px solid #C99206;outline-offset:3px}' +
      '#prGate .err{color:#B42318;font-size:.9rem;min-height:1.2em}#prGate small{color:#86868B;font-size:.8rem}</style>' +
      '<form><img src="img/logo.png" alt="Power Rentals"><h1>Your new website.</h1><p>A private preview prepared for Power Rentals by Moses Agentic.</p>' +
      '<label class="sr" for="prCode" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)">Passcode</label><input type="password" id="prCode" placeholder="Passcode" autocomplete="off" autofocus><div class="err" id="prErr" role="alert"></div><button type="submit">Enter</button>' +
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
