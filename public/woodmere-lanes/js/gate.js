/* Passcode gate for the demo. Client-side only: it keeps casual visitors out, it is not security.
   Unlock with the passcode, or by opening any page with ?key=PASSCODE once per browser.
   To change the passcode, replace HASH with the SHA-256 hex of the new code (see README). */
(function(){
  var HASH='4b5ac244256df750a7c9e53cea99dc85e8672cf7bef3d5d65b4b2033f5f74749';
  var KEY='wl_unlocked';
  try{ if(sessionStorage.getItem(KEY)==='1') return; }catch(e){}
  var html=document.documentElement; html.style.visibility='hidden';
  function sha(s){return crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)).then(function(b){return Array.from(new Uint8Array(b)).map(function(x){return x.toString(16).padStart(2,'0')}).join('')});}
  function unlock(){try{sessionStorage.setItem(KEY,'1');}catch(e){} var g=document.getElementById('wlGate'); if(g)g.remove(); html.style.visibility='';}
  function show(){
    var g=document.createElement('div'); g.id='wlGate';
    g.innerHTML='<style>#wlGate{position:fixed;inset:0;z-index:9999;background:#07070D;display:grid;place-items:center;font-family:Manrope,Arial,sans-serif;color:#F2F1F7;visibility:visible}#wlGate form{display:grid;gap:14px;width:min(380px,90vw);padding:32px;border:1px solid #262838;border-radius:20px;background:#13141F;box-shadow:0 0 40px rgba(255,46,209,.25)}#wlGate h1{font-family:Unbounded,Arial Black,sans-serif;font-size:1.1rem;letter-spacing:.06em;text-transform:uppercase;margin:0}#wlGate p{margin:0;color:#9A9BB0;font-size:.9rem}#wlGate input{padding:14px 16px;border:1px solid #262838;border-radius:12px;background:#0D0E18;color:#F2F1F7;font:inherit;font-size:1rem}#wlGate button{padding:16px;border:0;border-radius:999px;background:#FF2ED1;color:#07070D;font-weight:800;text-transform:uppercase;letter-spacing:.16em;font-size:.8rem;cursor:pointer}#wlGate .err{color:#FF2ED1;font-weight:700;min-height:1.2em;font-size:.85rem}</style>'+
      '<form><h1>Woodmere Lanes · Preview</h1><p>Private preview. Enter the passcode you were given.</p><input type="password" id="wlCode" placeholder="Passcode" autocomplete="off" autofocus><div class="err" id="wlErr"></div><button type="submit">Enter</button></form>';
    html.style.visibility=''; document.body.appendChild(g);
    document.querySelector('#wlGate form').addEventListener('submit',function(e){e.preventDefault();var v=document.getElementById('wlCode').value.trim().toLowerCase();sha(v).then(function(h){if(h===HASH)unlock();else{document.getElementById('wlErr').textContent='Not it. Try again.';}});});
  }
  var m=location.search.match(/[?&]key=([^&]+)/);
  function start(){ if(m){ sha(decodeURIComponent(m[1]).trim().toLowerCase()).then(function(h){ if(h===HASH){unlock(); history.replaceState(null,'',location.pathname+location.hash);} else show(); }); } else show(); }
  if(document.body) start(); else document.addEventListener('DOMContentLoaded',start);
})();
