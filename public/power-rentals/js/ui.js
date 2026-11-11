/* Power Rentals demo · shared page shell and helpers.
   Every page has <div id="pr-shell-top"></div> at the top of <body> and <div id="pr-shell-bottom"></div> at the end;
   this file fills them with the preview bar, header and footer so navigation lives in one place. */
window.PR = window.PR || {};
(function () {
  'use strict';
  const C = PR.config, E = PR.engine;

  const NAV = [
    ['equipment.html', 'Equipment'],
    ['fuel.html', 'Fuel'],
    ['service.html', 'Service plans'],
    ['account.html', 'Account']
  ];

  /* ---------- tiny DOM helpers ---------- */
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
  /* h('div.card#x', {attrs}, children...) */
  function h(tag, attrs, ...kids) {
    tag = tag.replace(/[.#]+$/, '');   // tolerate a trailing '.' from 'span.badge.' + ''
    const m = tag.match(/^([a-z0-9]+)((?:[.#][\w-]+)*)$/i);
    const el = document.createElement(m ? m[1] : 'div');
    if (m && m[2]) m[2].replace(/([.#])([\w-]+)/g, (_, t, v) => { if (t === '.') el.classList.add(v); else el.id = v; });
    if (attrs && (typeof attrs !== 'object' || attrs.nodeType || Array.isArray(attrs))) { kids.unshift(attrs); attrs = null; }
    if (attrs) Object.entries(attrs).forEach(([k, v]) => {
      if (v == null || v === false) return;
      if (k === 'class') el.className += ' ' + v;
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else el.setAttribute(k, v === true ? '' : v);
    });
    kids.flat(Infinity).forEach(k => { if (k == null || k === false) return; el.appendChild(k.nodeType ? k : document.createTextNode(String(k))); });
    return el;
  }

  /* ---------- icons (inline SVG, stroke = currentColor) ---------- */
  const ICON = {
    gen: '<path d="M3 8h13v9H3z"/><path d="M16 11h3l2 2v4h-5"/><circle cx="7" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/><path d="M9.5 9.5 8 12.5h3L9.5 15.5"/>',
    heat: '<path d="M12 3c2 3 5 5 5 9a5 5 0 0 1-10 0c0-2 1-3.5 2-4.5.5 1.5 1.5 2.5 3 2.5-1.5-2.5-1-5 0-7z"/>',
    cool: '<path d="M12 2v20M4.9 6.5l14.2 11M4.9 17.5l14.2-11"/><path d="m9 4 3 2 3-2M9 20l3-2 3 2"/>',
    light: '<path d="M12 22V10"/><path d="M8 22h8"/><rect x="6" y="3" width="12" height="7" rx="1"/><path d="M8 6.5h8"/>',
    dist: '<rect x="5" y="3" width="14" height="18" rx="2"/><circle cx="10" cy="9" r="1.5"/><circle cx="14" cy="9" r="1.5"/><circle cx="10" cy="15" r="1.5"/><circle cx="14" cy="15" r="1.5"/>',
    lift: '<path d="M4 4v14h8"/><path d="M4 12h6l3 6"/><circle cx="7" cy="19" r="1.6"/><circle cx="15" cy="19" r="1.6"/><path d="M18 4v14M18 14h3"/>',
    fuel: '<path d="M4 21V5a2 2 0 0 1 2-2h7a2 2 0 0 1 2 2v16"/><path d="M3 21h13M7 7h5"/><path d="M15 9h2a2 2 0 0 1 2 2v6a1.5 1.5 0 0 0 3 0V8l-3-3"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>',
    check: '<path d="m5 12 5 5 9-10"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    truck: '<path d="M3 6h11v10H3zM14 9h4l3 3v4h-7"/><circle cx="7" cy="18" r="1.8"/><circle cx="17" cy="18" r="1.8"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    wrench: '<path d="M14.7 6.3a4 4 0 0 0 5 5L13 18l-3 3-3-3 3-3 6.7-6.7a4 4 0 0 0-2-3z"/>',
    chat: '<path d="M4 5h16v11H8l-4 4z"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
    bag: '<path d="M5 8h14l-1.2 12H6.2z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/>'
  };
  const icon = (name, cls = 'ico') => { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls); s.innerHTML = ICON[name] || ''; return s; };

  /* ---------- toast ---------- */
  let toastEl;
  function toast(msg) {
    if (!toastEl) { toastEl = h('div.toast', { role: 'status', 'aria-live': 'polite' }); document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add('show');
    clearTimeout(toastEl._t); toastEl._t = setTimeout(() => toastEl.classList.remove('show'), 3200);
  }

  /* ---------- status dot for a summary level ---------- */
  function availLine(sum) {
    const word = sum.level === 'out' ? 'All out' : sum.level === 'limited' ? 'Limited' : 'Available';
    const back = sum.nextBack ? ' · next one back ' + E.fmt.rel(sum.nextBack) : '';
    return h('span.avail.' + sum.level, h('i'), h('b', word), ' ', sum.free + ' of ' + sum.total + ' in the yard' + back);
  }

  /* ---------- shell ---------- */
  function page() { const p = location.pathname.split('/').pop(); return p === '' ? 'index.html' : p; }

  function renderTop() {
    const mount = $('#pr-shell-top'); if (!mount) return;
    const here = page();
    const bar = h('div.previewbar', h('div.wrap',
      h('span', h('b', 'Private preview'), ' · Prepared for Power Rentals by Moses Agentic · sample units and dates'),
      h('span.pb-actions',
        h('a', { href: 'office.html' }, 'Office view'),
        h('a', { href: 'build.html' }, 'How it is built and what it costs'),
        h('button', { type: 'button', class: 'linkish', onclick: () => { PR.store.reset(); toast('Demo reset: sample data restored'); } }, 'Reset demo'))));
    const st = h('span.status', { 'aria-live': 'polite' });
    /* the order (cart) link with a live count */
    const orderLink = h('a.orderlink', { href: 'checkout.html', 'aria-current': here === 'checkout.html' ? 'page' : null });
    const paintOrder = () => { const n = PR.cart ? PR.cart.count() : 0; orderLink.textContent = ''; orderLink.append(icon('bag'), h('span', 'Order')); if (n) orderLink.append(h('b.count', String(n))); orderLink.setAttribute('aria-label', 'Your order, ' + n + (n === 1 ? ' item' : ' items')); };
    paintOrder(); if (PR.cart) PR.cart.subscribe(paintOrder);
    const menuBtn = h('button.menu-btn', { type: 'button', 'aria-expanded': 'false', 'aria-controls': 'mnav' }, icon('menu'), h('span.sr', 'Menu'));
    const mnav = h('nav.mnav#mnav', { hidden: true, 'aria-label': 'Mobile' }, NAV.map(([href, t]) => h('a', { href, 'aria-current': href === here ? 'page' : null }, t)),
      h('a', { href: 'checkout.html' }, 'Your order'), h('a', { href: 'office.html' }, 'Office view'),
      h('a.call', { href: C.business.phoneHref }, 'Call or WhatsApp ' + C.business.phone));
    menuBtn.addEventListener('click', () => { const open = mnav.hidden; mnav.hidden = !open; menuBtn.setAttribute('aria-expanded', String(open)); });
    const header = h('header.site', h('div.wrap.nav',
      h('a.brand', { href: 'index.html', 'aria-label': 'Power Rentals home' }, h('img', { src: 'img/logo.png', alt: 'Power Rentals', width: 200, height: 55 })),
      h('nav.links', { 'aria-label': 'Site' }, NAV.map(([href, t]) => h('a', { href, 'aria-current': href === here ? 'page' : null }, t))),
      h('div.right', st, orderLink, h('a.btn.btn-gold', { href: 'equipment.html' }, 'Rent now'), menuBtn)), mnav);
    const emerg = h('div.emerg', h('div.wrap', h('span', 'Power out or heat down?'), h('a', { href: C.business.phoneHref }, 'Call or WhatsApp ' + C.business.phone)));
    mount.replaceWith(bar, emerg, header);
    const paint = () => { const s = E.hours.status(); st.className = 'status ' + (s.open ? 'open' : 'closed'); st.textContent = ''; st.append(h('i'), h('b', s.label), ' ' + s.detail); };
    paint(); setInterval(paint, 60000);
  }

  function renderBottom() {
    const mount = $('#pr-shell-bottom'); if (!mount) return;
    const H = C.hours;
    const footer = h('footer.site', h('div.wrap.fgrid',
      h('div', h('img', { src: 'img/logo.png', alt: 'Power Rentals', width: 180, height: 50 }),
        h('p', 'Generators, heat, cooling, light and lifts for New York job sites, buildings and events. Brooklyn, since ' + C.business.since + '.')),
      h('div', h('h4', 'Call or WhatsApp'), h('p', h('a', { href: C.business.phoneHref }, C.business.phone)), h('h4', 'Mailing address'), h('p', C.business.mailing)),
      h('div', h('h4', 'Hours'), h('p', 'Monday to Thursday, ' + E.clock(H[1][0]) + ' to ' + E.clock(H[1][1])), h('p', 'Friday, ' + E.clock(H[5][0]) + ' to ' + E.clock(H[5][1])), h('p', 'Saturday, closed'), h('p', 'Sunday, ', h('span.fill', 'confirm'))),
      h('div', h('h4', 'Rent'), NAV.map(([href, t]) => h('p', h('a', { href }, t))), h('p', h('a', { href: 'office.html' }, 'Office view')))),
      h('div.wrap.legal', h('span', 'Concept website prepared by Moses Agentic for Power Rentals. Sample data; not a live store.'), h('span.legal-links', h('a', { href: 'credits.html' }, 'Photo credits'), h('a', { href: 'build.html' }, 'How this was built'))));
    mount.replaceWith(footer);
  }

  document.addEventListener('DOMContentLoaded', () => { renderTop(); renderBottom(); });

  PR.ui = { $, $$, h, icon, toast, availLine, page };
})();
