/* Product page · a buy box in the spirit of the best online stores: size, start, length, borough, then
   "Rent now" (straight to checkout) or "Add to order". Availability is checked live against the engine. */
(function () {
  'use strict';
  const { h, toast, availLine } = PR.ui, E = PR.engine, D = PR.data, C = PR.config;
  const LENGTHS = [[1, 'A day'], [7, 'A week'], [28, 'Four weeks'], [56, 'Longer']];
  const ALSO = { gen: ['spider', 'db400', 'ltd'], heat: ['ltd', 'g20', 'volt18'], cool: ['g50s', 'spider', 'dehu'], light: ['g20', 'spider', 'c400'], dist: ['g175', 'g115', 'ltd'], lift: ['tele', 'ltd', 'g20'] };
  const q = new URLSearchParams(location.search);
  const state = { model: D.models.find(m => m.id === q.get('model')) ? q.get('model') : 'g175', start: null, days: +(q.get('len') || 7), boro: 'Brooklyn' };
  const $ = id => document.getElementById(id);

  /* sensible default start: today if same-day is open, otherwise the next open day */
  function defaultStart() {
    if (q.get('start')) return E.fromKey(q.get('start'));
    if (E.hours.sameDayOpen()) return E.today();
    let d = E.addDays(E.today(), 1); while (!E.hours.isDeliveryDay(d)) d = E.addDays(d, 1); return d;
  }
  const nextMonday = () => { let d = E.addDays(E.today(), 1); while (d.getDay() !== 1) d = E.addDays(d, 1); return d; };

  function model() { return E.modelById(state.model); }

  function paintStatic() {
    const m = model(), c = D.categories.find(x => x.id === m.cat);
    document.title = m.name + ' · Rent · Power Rentals';
    $('crumbCat').textContent = c.name; $('crumbCat').href = 'equipment.html#' + c.id;
    $('catName').textContent = c.name; $('name').textContent = m.name;
    const shot = $('shot'); shot.className = 'shot ' + (m.imgKind || 'photo'); shot.textContent = '';
    if (m.img) shot.appendChild(h('img', { src: m.img, alt: m.name })); else shot.appendChild(h('span', 'Photo to come'));
    $('fuelRow').hidden = m.fuel !== 'diesel'; $('heatNote').hidden = m.fuel !== 'fueled';
    const sizes = $('sizes'); sizes.textContent = '';
    D.models.filter(x => x.cat === m.cat).forEach(x => {
      const s = E.modelSummary(x.id);
      sizes.appendChild(h('button.size', { type: 'button', 'aria-pressed': String(x.id === m.id), onclick: () => { state.model = x.id; history.replaceState(null, '', '?model=' + x.id); paintStatic(); paintLive(); } },
        h('b', x.short), h('small', s.free ? s.free + ' free today' : 'Out today')));
    });
    const also = $('also'); also.textContent = '';
    (ALSO[m.cat] || []).map(id => E.modelById(id)).filter(Boolean).forEach(x => also.appendChild(h('a.also-card', { href: 'product.html?model=' + x.id },
      h('div.shot.' + (x.imgKind || 'photo'), x.img ? h('img', { src: x.img, alt: '', loading: 'lazy' }) : h('span', 'Photo to come')),
      h('b', x.name), availLine(E.modelSummary(x.id)))));
  }

  function paintQuick() {
    const box = $('quick'); box.textContent = '';
    const opts = [];
    if (E.hours.sameDayOpen()) opts.push(['Today', E.today()]);
    let t = E.addDays(E.today(), 1); while (!E.hours.isDeliveryDay(t)) t = E.addDays(t, 1);
    opts.push([E.diffDays(t, E.today()) === 1 ? 'Tomorrow' : E.DOW[t.getDay()], t]);
    const mon = nextMonday(); if (E.key(mon) !== E.key(t)) opts.push(['Next Monday', mon]);
    opts.forEach(([label, d]) => box.appendChild(h('button.chip', { type: 'button', 'aria-pressed': String(E.key(d) === E.key(state.start)), onclick: () => { state.start = d; $('start').value = E.key(d); paintQuick(); paintLive(); } }, label, h('small', ' ' + E.fmt.short(d)))));
  }

  /* live check: is a unit free for these dates on an open day? */
  function check() {
    const m = model(), d = state.start;
    if (!d) return { ok: false, msg: 'Pick a start date.' };
    if (d < E.today()) return { ok: false, msg: 'That date has passed.' };
    if (E.hours.isToConfirm(d)) return { ok: false, msg: 'Sunday deliveries are to be confirmed. Pick Monday to Friday.' };
    if (!E.hours.isDeliveryDay(d)) return { ok: false, msg: 'We deliver Monday to Friday. Pick another day.' };
    if (E.key(d) === E.key(E.today()) && !E.hours.sameDayOpen()) return { ok: false, msg: 'Same-day delivery closes at 10am. Pick tomorrow or later.' };
    const free = E.freeUnits(m.id, d, state.days);
    if (!free.length) { const n = E.nearestStart(m.id, E.addDays(d, 1), state.days); return { ok: false, msg: 'Booked out for those dates.', nearest: n }; }
    const end = E.addDays(d, state.days - 1);
    return { ok: true, unit: free[0].no, msg: free.length === 1 ? 'The last one: unit ' + free[0].no + ' is free ' + E.fmt.short(d) + ' to ' + E.fmt.short(end) + '.' : free.length + ' free for ' + E.fmt.short(d) + ' to ' + E.fmt.short(end) + '. Unit ' + free[0].no + ' will be held for you.' };
  }

  function paintLive() {
    const m = model();
    $('availNow').textContent = ''; $('availNow').appendChild(availLine(E.modelSummary(m.id)));
    const lens = $('len'); lens.textContent = '';
    LENGTHS.forEach(([n, label]) => lens.appendChild(h('button.segbtn', { type: 'button', role: 'radio', 'aria-checked': String(state.days === n), onclick: () => { state.days = n; paintLive(); } }, label)));
    const r = check(), box = $('check'); box.textContent = ''; box.className = 'check ' + (r.ok ? 'ok' : 'bad');
    box.appendChild(h('span', r.msg));
    if (r.nearest) box.appendChild(h('button.linkish', { type: 'button', onclick: () => { state.start = r.nearest; $('start').value = E.key(r.nearest); paintQuick(); paintLive(); } }, ' Use ' + E.fmt.short(r.nearest)));
    $('rentNow').disabled = !r.ok; $('addOrder').disabled = !r.ok;
    const units = $('units'); units.textContent = '';
    E.unitsOf(m.id).forEach(u => { const s = E.statusOn(u.no);
      units.appendChild(h('li', h('b', 'Unit ' + u.no), h('span.ust.' + s.state, s.label + (s.until && s.state !== 'yard' ? ' until ' + E.fmt.short(s.until) : '')), h('small', s.source || ''))); });
  }

  function item() { return { model: state.model, start: E.key(state.start), days: state.days, borough: state.boro, fuel: model().fuel === 'diesel' && $('fuel').checked }; }

  document.addEventListener('DOMContentLoaded', () => {
    state.start = defaultStart();
    const st = $('start'); st.min = E.key(E.today()); st.value = E.key(state.start);
    st.addEventListener('change', () => { if (st.value) { state.start = E.fromKey(st.value); paintQuick(); paintLive(); } });
    const b = $('boro'); C.business.boroughs.forEach(x => b.appendChild(h('option', { value: x, selected: x === state.boro }, x)));
    b.addEventListener('change', () => { state.boro = b.value; });
    $('buy').addEventListener('submit', e => { e.preventDefault(); if (!check().ok) return; PR.cart.add(item()); location.href = 'checkout.html'; });
    $('addOrder').addEventListener('click', () => { if (!check().ok) return; PR.cart.add(item()); toast(model().name + ' added to your order'); });
    paintStatic(); paintQuick(); paintLive();
    PR.store.subscribe(() => { paintStatic(); paintLive(); });
  });
})();
