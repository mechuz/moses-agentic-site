/* Checkout · one page, three sections, one button. The account's site, payment and insurance certificate are on file
   (SAMPLE account: General contractor A). Each item's unit is held while the customer checks out; placing the order turns
   the holds into rentals (source 'Website booking') that the office view and every other page see at once. */
(function () {
  'use strict';
  const { h, toast } = PR.ui, E = PR.engine, C = PR.config;
  const $ = id => document.getElementById(id);
  const ACCOUNT = {
    name: 'General contractor A', sample: true,
    address: 'Sample job site, Atlantic Avenue', borough: 'Brooklyn', contact: '(917) 555-0142',
    coiUntil: E.addDays(E.today(), 41)
  };
  const PAY = [
    ['terms', 'Your account', 'Net 30 terms · invoiced weekly with the fuel added'],
    ['card', 'Card ending 4242', 'Charged when the unit is delivered'],
    ['cod', 'Pay on delivery', 'Card or check to the driver']
  ];
  const state = { pay: 'terms', addr: Object.assign({}, ACCOUNT), holds: {} };

  /* ---------- holds: one per cart item, refreshed when the cart or the yard changes ---------- */
  function placeHolds() {
    const items = PR.cart.items(), expires = new Date(Date.now() + C.holdMinutes * 60000).toISOString();
    items.forEach(it => {
      const existing = state.holds[it.id];
      if (existing && PR.store.events().some(e => e.id === existing.id)) return;
      const free = E.freeUnits(it.model, E.fromKey(it.start), it.days);
      if (!free.length) { state.holds[it.id] = null; return; }
      state.holds[it.id] = PR.store.add({ type: 'hold', unit: free[0].no, model: it.model, start: it.start, days: it.days, expires });
    });
  }
  function releaseHolds() { Object.values(state.holds).forEach(hd => hd && PR.store.remove(hd.id)); state.holds = {}; }
  window.addEventListener('pagehide', () => { if (!placed) releaseHolds(); });

  let placed = false, timer;
  function countdown() {
    clearInterval(timer);
    const first = Object.values(state.holds).find(Boolean);
    if (!first) { $('holdLine').textContent = ''; return; }
    const tick = () => { const ms = new Date(first.expires) - Date.now(); if (ms <= 0) { $('holdLine').textContent = 'Your hold ran out. Reload to hold the units again.'; clearInterval(timer); return; }
      const m = Math.floor(ms / 60000), s = Math.floor(ms / 1000) % 60; $('holdLine').textContent = 'Your units are held for ' + m + ':' + String(s).padStart(2, '0') + '.'; };
    tick(); timer = setInterval(tick, 1000);
  }

  /* ---------- paint ---------- */
  function paintAddr() {
    const v = $('addrView'); v.textContent = '';
    v.append(h('p.big', ACCOUNT.name, ' ', h('span.badge.sample', 'Sample account')), h('p', state.addr.address + ', ' + state.addr.borough), h('p.mute', 'On-site contact ' + state.addr.contact));
  }
  function paintPay() {
    const p = $('pay'); p.textContent = '';
    PAY.forEach(([id, title, sub]) => p.appendChild(h('label.payopt', { 'data-on': String(state.pay === id) },
      h('input', { type: 'radio', name: 'pay', value: id, checked: state.pay === id, onchange: () => { state.pay = id; paintPay(); } }),
      h('span', h('b', title), h('small', sub)))));
  }
  function paintItems() {
    const items = PR.cart.items(), box = $('items'); box.textContent = '';
    items.forEach(it => {
      const m = E.modelById(it.model), start = E.fromKey(it.start), end = E.addDays(start, it.days - 1), hold = state.holds[it.id];
      const wins = E.hours.windows(start);
      if (!it.window && wins.length) it.window = wins[0];
      box.appendChild(h('article.item',
        h('div.shot.' + (m.imgKind || 'photo'), m.img ? h('img', { src: m.img, alt: '' }) : null),
        h('div.item-body',
          h('b', m.name),
          h('p', 'Delivered ' + E.fmt.long(start) + (it.days > 1 ? ', back ' + E.fmt.short(E.addDays(end, 1)) : '') + ' · ' + (it.borough || state.addr.borough)),
          hold ? h('p.ok', 'Unit ' + hold.unit + ' is held for you') : h('p.bad', 'No unit is free for these dates. Remove it or change the date.'),
          it.fuel ? h('p.mute', 'Fuel monitoring and diesel delivery included') : null,
          h('div.item-row',
            h('label', { for: 'w-' + it.id }, 'Delivery window'),
            h('select', { id: 'w-' + it.id, onchange: e => PR.cart.update(it.id, { window: e.target.value }) }, wins.map(w => h('option', { value: w, selected: w === it.window }, w))),
            h('button.linkish', { type: 'button', onclick: () => { if (hold) PR.store.remove(hold.id); delete state.holds[it.id]; PR.cart.remove(it.id); } }, 'Remove'))),
        h('div.item-price', h('span.fill', 'Your rate'))));
    });
    const days = Math.max(0, E.diffDays(ACCOUNT.coiUntil, E.today()));
    $('coi').textContent = ''; $('coi').append(h('b', 'Certificate of insurance on file'), ' · valid until ' + E.fmt.short(ACCOUNT.coiUntil) + (days < 45 ? ' (' + days + ' days left)' : ''));
  }
  function paintSummary() {
    const items = PR.cart.items(), dl = $('sum'); dl.textContent = '';
    const row = (k, v) => { dl.append(h('dt', k), h('dd', v)); };
    row('Items (' + items.length + ')', h('span.fill', 'from your rate card'));
    row('Delivery and pick-up', h('span.fill', 'confirm'));
    if (items.some(i => i.fuel)) row('Diesel delivery', 'Free');
    row('Payment', PAY.find(p => p[0] === state.pay)[1]);
    const paused = E.hours.bookingPaused(), anyMissing = items.some(i => !state.holds[i.id]);
    const btn = $('place');
    btn.disabled = paused || anyMissing || !items.length;
    btn.textContent = paused ? 'Ordering reopens when the office opens' : 'Place your order';
  }
  function paint() {
    const items = PR.cart.items();
    if (placed) return;
    $('empty').hidden = items.length > 0; $('co').hidden = !items.length; document.querySelector('.co-head').hidden = !items.length;
    if (!items.length) { releaseHolds(); return; }
    if (!E.hours.bookingPaused()) placeHolds();
    paintAddr(); paintPay(); paintItems(); paintSummary(); countdown();
  }

  /* ---------- place the order ---------- */
  function place() {
    const items = PR.cart.items(); if (!items.length || E.hours.bookingPaused()) return;
    const ref = 'PR-' + String(new Date().getMonth() + 1).padStart(2, '0') + String(new Date().getDate()).padStart(2, '0') + '-' + Math.random().toString(36).slice(2, 5).toUpperCase();
    const lines = [];
    items.forEach(it => {
      const hold = state.holds[it.id]; if (!hold) return;
      const start = E.fromKey(it.start), end = E.addDays(start, it.days - 1);
      PR.store.remove(hold.id);
      PR.store.add({ type: 'rental', unit: hold.unit, model: it.model, start: it.start, end: E.key(end), days: it.days, customer: 'You (demo)', borough: it.borough || state.addr.borough, address: state.addr.address, window: it.window, fuel: !!it.fuel, payment: state.pay, ref, source: 'Website booking' });
      lines.push(h('li', h('b', E.modelById(it.model).name + ' · unit ' + hold.unit), h('span', E.fmt.long(start) + ', ' + (it.window || '') + ' · ' + (it.borough || state.addr.borough))));
    });
    placed = true; state.holds = {}; clearInterval(timer); PR.cart.clear();
    $('co').hidden = true; document.querySelector('.co-head').hidden = true;
    $('doneText').textContent = 'Reservation ' + ref + '. A text confirmation and the rental agreement to sign are on the way to ' + state.addr.contact + '.';
    const ul = $('doneList'); ul.textContent = ''; lines.forEach(l => ul.appendChild(l));
    $('done').hidden = false; $('done').focus();
    toast('Order placed: ' + ref);
  }

  document.addEventListener('DOMContentLoaded', () => {
    const b = $('a2'); C.business.boroughs.forEach(x => b.appendChild(h('option', { value: x }, x)));
    $('chgAddr').addEventListener('click', () => { const f = $('addrForm'); f.hidden = !f.hidden; if (!f.hidden) { $('a1').value = state.addr.address; $('a2').value = state.addr.borough; $('a3').value = state.addr.contact; $('a1').focus(); } });
    $('saveAddr').addEventListener('click', () => {
      const a = $('a1').value.trim(); if (!a) { $('a1').focus(); toast('Add the site address'); return; }
      state.addr = { address: a, borough: $('a2').value, contact: $('a3').value.trim() || state.addr.contact }; $('addrForm').hidden = true; paint();
    });
    $('place').addEventListener('click', place);
    paint();
    PR.cart.subscribe(paint);
    PR.store.subscribe(() => { if (!placed) { paintItems(); paintSummary(); } });
  });
})();
