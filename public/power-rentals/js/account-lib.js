/* Power Rentals demo · shared helpers for the customer pages (account, fuel, service).

   Two parts:
     1. UI helpers used by more than one page: delivery-day lists, a borough select,
        a modal dialog, and a week-strip day picker that only lets you pick delivery days.
     2. The SAMPLE account model for "General contractor A": rentals with extensions applied,
        past rentals, fuel deliveries, invoices and certificates. Everything here is derived
        from the engine's events plus a few fixed SAMPLE facts, so the pages stay consistent
        with each other and with the office view. Amounts are SAMPLE amounts, not a rate card.

   Store event types this file reads (written by the customer pages):
     extend         {unit, rental, end}           a rental's new end date
     pickupRequest  {unit, rental, day}           a customer asks for a pick-up on a delivery day
     fuelOrder      {unit?, day, gallons, ...}    a diesel top-up or delivery order
     demoPayment    {invoice}                     a "Pay now" confirmation (no money moves)
     coiUpload      {customer, name}              a new certificate of insurance (file name only)
     serviceVisit   {date, generator, ...}        a booked service visit on a customer's own generator */
window.PR = window.PR || {};
(function () {
  'use strict';
  const E = PR.engine, D = PR.data, C = PR.config, { h } = PR.ui;
  const { addDays, diffDays, key, fromKey, today, fmt } = E;

  const CUSTOMER = 'gcA';
  const YOU = 'You (demo)';

  /* ---------- dates ---------- */

  /* The first `n` delivery days on or after `from`. */
  function nextDeliveryDays(from, n) {
    const out = [];
    for (let i = 0; out.length < n && i < 120; i++) { const d = addDays(from, i); if (E.hours.isDeliveryDay(d)) out.push(d); }
    return out;
  }
  const firstDeliveryDay = from => nextDeliveryDays(from, 1)[0];

  /* ---------- small UI pieces ---------- */

  /* <select> of the five boroughs, with a "Choose" placeholder. */
  function boroughSelect(id, value) {
    return h('select#' + id, { name: 'borough', required: true },
      h('option', { value: '' }, 'Choose a borough'),
      C.business.boroughs.map(b => h('option', { value: b, selected: b === value }, b)));
  }

  /* A modal built on the native <dialog>: focus is trapped, Escape closes, focus returns to the opener.
     actions: [{label, primary, onClick}] · onClick may return false to keep the dialog open. */
  function dialog({ title, body, actions = [], label = 'Close' }) {
    const opener = document.activeElement;
    const titleId = 'dlg-' + Math.random().toString(36).slice(2, 7);
    const dlg = h('dialog.prdlg', { 'aria-labelledby': titleId },
      h('div.prdlg-head', h('h2#' + titleId, title), h('button.prdlg-x', { type: 'button', 'aria-label': 'Close' }, '×')),
      h('div.prdlg-body', body),
      h('div.prdlg-actions',
        actions.map(a => h('button.btn.btn-sm' + (a.primary ? '.btn-gold' : '.btn-line'), { type: 'button', onclick: () => { if (a.onClick && a.onClick() === false) return; dlg.close(); } }, a.label)),
        h('button.btn.btn-sm.btn-line', { type: 'button', onclick: () => dlg.close() }, label)));
    dlg.querySelector('.prdlg-x').addEventListener('click', () => dlg.close());
    dlg.addEventListener('click', e => { if (e.target === dlg) dlg.close(); });   // click on the backdrop
    dlg.addEventListener('close', () => { dlg.remove(); if (opener && opener.isConnected) opener.focus(); });
    document.body.appendChild(dlg);
    dlg.showModal();
    return dlg;
  }

  /* Week-strip day picker: a radio group of 7 days at a time, with only allowed days enabled.
     opts: {name, legend, from, to, selected (key), isAllowed(date), onChange(key)}
     Returns the <fieldset>; read the value with picker.value(). */
  function dayPicker(opts) {
    const allowed = opts.isAllowed || E.hours.isDeliveryDay;
    const from = E.startOfDay(opts.from), to = E.startOfDay(opts.to);
    const okDay = k => { const d = fromKey(k); return d >= from && d <= to && allowed(d); };
    let value = opts.selected && okDay(opts.selected) ? opts.selected : null;
    let page = value ? Math.max(0, Math.floor(diffDays(fromKey(value), from) / 7)) : 0;
    const pages = Math.floor(diffDays(to, from) / 7) + 1;
    const labelEl = h('span.dp-range', { 'aria-live': 'polite' });
    const prev = h('button.dp-btn', { type: 'button', 'aria-label': 'Earlier days' }, '‹');
    const next = h('button.dp-btn', { type: 'button', 'aria-label': 'Later days' }, '›');
    const grid = h('div.dp-days');
    const fs = h('fieldset.daypick', h('legend', opts.legend), h('div.dp-nav', prev, labelEl, next), grid);

    function paint() {
      const start = addDays(from, page * 7), end = addDays(start, 6);
      labelEl.textContent = fmt.short(start).slice(4) + ' to ' + fmt.short(end > to ? to : end).slice(4);
      prev.disabled = page === 0; next.disabled = page >= pages - 1;
      grid.textContent = '';
      for (let i = 0; i < 7; i++) {
        const d = addDays(start, i), k = key(d);
        const ok = d <= to && allowed(d);
        const id = opts.name + '-' + k;
        const input = h('input.sr', { type: 'radio', name: opts.name, id, value: k, disabled: !ok, checked: k === value });
        input.addEventListener('change', () => { value = k; if (opts.onChange) opts.onChange(k); });
        grid.appendChild(h('label.dp-day' + (ok ? '' : '.off'), { for: id },
          input, h('span.dp-dow', E.DOW[d.getDay()].slice(0, 3)), h('b', String(d.getDate())),
          h('span.sr', ' ' + fmt.long(d) + (ok ? '' : ', not available'))));
      }
    }
    prev.addEventListener('click', () => { page = Math.max(0, page - 1); paint(); });
    next.addEventListener('click', () => { page = Math.min(pages - 1, page + 1); paint(); });
    fs.value = () => value;
    paint();
    return fs;
  }

  /* ---------- SAMPLE facts used only to fill the demo ---------- */

  /* SAMPLE day amounts by model, used only to fill invoice lines. Not Power Rentals prices. */
  const SAMPLE_DAY = { g20: 85, g50s: 140, g115: 230, g175: 300, g310: 480, g700: 900, hyb70: 260, c200: 95, c400: 140, val6: 120, volt18: 60, ac5: 150, ac12: 300, dehu: 70, ltd: 75, lte: 65, spider: 25, db400: 60, fl5: 140, fl10: 210, tele: 260 };
  const SAMPLE_GALLON = 4.95;
  /* SAMPLE tank sizes (gallons) and burn at a typical load (gallons an hour), for gauges and fuel tickets. */
  const TANK = { g20: 60, g50s: 100, g115: 200, g175: 300, g310: 500, g700: 1000, hyb70: 150, ltd: 30, fl10: 25 };
  const BURN = { g20: 1.1, g50s: 2.4, g115: 4.6, g175: 6.8, g310: 11.5, g700: 24, hyb70: 1.6, ltd: 0.4, fl10: 1.5 };

  /* SAMPLE past rentals for General contractor A, so invoices and documents have history. Offsets in days. */
  const PAST = [
    { id: 'past-1', model: 'g115', k: 1, start: -70, end: -36, borough: 'Brooklyn' },
    { id: 'past-2', model: 'ltd', k: 1, start: -50, end: -8, borough: 'Brooklyn' }
  ];

  /* SAMPLE billing periods (General contractor A is billed monthly, Net 30). Offsets in days. */
  const PERIODS = [
    { id: 'p2', from: -88, to: -61, issued: -60, paid: true },
    { id: 'p1', from: -60, to: -33, issued: -32 },
    { id: 'p0', from: -32, to: -5, issued: -4 }
  ];

  /* ---------- the account model ---------- */
  const model = r => E.modelById(D.units.find(u => u.no === r.unit).model);
  const isMine = e => e.customer === CUSTOMER || e.customer === YOU;

  /* All events, with 'extend' events applied to the rentals they extend. */
  function effectiveEvents(events = E.events()) {
    const latest = {};
    events.forEach(e => { if (e.type === 'extend' && (!latest[e.rental] || e.end > latest[e.rental].end)) latest[e.rental] = e; });
    return events.map(e => (e.type === 'rental' && latest[e.id] && latest[e.id].end > e.end)
      ? Object.assign({}, e, { end: latest[e.id].end, originalEnd: e.end }) : e);
  }

  /* This account's rentals (sample invoices plus "You (demo)" website bookings), newest start first. */
  function rentals(events) {
    return events.filter(e => e.type === 'rental' && isMine(e))
      .map(r => Object.assign({}, r, { model: model(r) }))
      .sort((a, b) => a.start < b.start ? 1 : -1);
  }

  /* Past SAMPLE rentals as dated objects. */
  function pastRentals() {
    const t = today();
    return PAST.map(p => {
      const unit = E.unitsOf(p.model)[p.k].no;
      return { id: p.id, unit, start: key(addDays(t, p.start)), end: key(addDays(t, p.end)), borough: p.borough, customer: CUSTOMER, source: 'Rental invoice', model: E.modelById(p.model), past: true };
    });
  }

  /* Can this rental run until newEnd? The unit must be free every day after its current end. */
  function canExtend(rental, newEndKey, events) {
    const days = diffDays(fromKey(newEndKey), fromKey(rental.end));
    if (days <= 0) return false;
    return E.freeUnits(rental.model.id, addDays(fromKey(rental.end), 1), days, events).some(u => u.no === rental.unit);
  }
  /* The last day this rental could be extended to, looking up to `limit` days ahead (null if not at all). */
  function latestExtension(rental, events, limit = 60) {
    let best = null;
    for (let n = 1; n <= limit; n++) { const k = key(addDays(fromKey(rental.end), n)); if (canExtend(rental, k, events)) best = k; else break; }
    return best;
  }

  /* SAMPLE diesel deliveries to this account's diesel units, plus real driver fuel tickets from the store. */
  function fuelDeliveries(events, mine) {
    const t = today(), out = [];
    mine.concat(pastRentals()).filter(r => r.model.fuel === 'diesel').forEach(r => {
      const tank = TANK[r.model.id] || 50, every = r.model.id === 'g115' ? 2 : r.model.id === 'ltd' ? 6 : 4;
      const last = Math.min(diffDays(fromKey(r.end), t), -1);
      let i = 0;
      for (let off = diffDays(fromKey(r.start), t) + every; off <= last; off += every, i++) {
        const d = firstDeliveryDay(addDays(t, off));
        if (diffDays(d, t) > last) break;
        const share = 0.5 + ((r.unit * 37 + i * 53) % 26) / 100;           // 50% to 75% of the tank
        out.push({ day: key(d), unit: r.unit, model: r.model, gallons: Math.round(tank * share), driver: 'Driver ' + (1 + (r.unit + i) % 3), photo: true, sample: true });
      }
    });
    const units = new Set(mine.map(r => r.unit));
    events.filter(e => e.type === 'fuel' && units.has(e.unit)).forEach(e => {
      const r = mine.find(x => x.unit === e.unit);
      out.push({ day: e.day || key(new Date(e.at)), unit: e.unit, model: r.model, gallons: Math.round(e.gallons || 0), driver: e.driver || 'Driver 2', photo: true, ticket: true });
    });
    return out.sort((a, b) => a.day < b.day ? 1 : -1);
  }

  /* SAMPLE invoices consistent with the rentals and fuel above. Status: paid, open, overdue or final. */
  function invoices(events, mine) {
    const t = today();
    const current = mine.filter(r => r.customer === CUSTOMER && r.sample);
    const past = pastRentals();
    const fuel = fuelDeliveries(events, mine);
    const paidDemo = new Set(events.filter(e => e.type === 'demoPayment').map(e => e.invoice));
    const overlap = (r, a, b) => {
      const s = Math.max(diffDays(fromKey(r.start), t), a), e = Math.min(diffDays(fromKey(r.end), t), b);
      return e >= s ? { s, e, n: e - s + 1 } : null;
    };
    const dayLabel = off => fmt.short(addDays(t, off)).slice(4);
    function lines(rs, a, b) {
      const out = [];
      rs.forEach(r => {
        const o = overlap(r, a, b); if (!o) return;
        out.push({ text: 'Unit ' + r.unit + ', ' + r.model.name + ', ' + dayLabel(o.s) + ' to ' + dayLabel(o.e) + ' (' + o.n + (o.n === 1 ? ' day)' : ' days)'), amount: o.n * (SAMPLE_DAY[r.model.id] || 50) });
        const f = fuel.filter(x => x.unit === r.unit && !x.ticket && diffDays(fromKey(x.day), t) >= o.s && diffDays(fromKey(x.day), t) <= o.e);
        if (f.length) {
          const gal = f.reduce((s, x) => s + x.gallons, 0);
          out.push({ text: 'Diesel for unit ' + r.unit + ': ' + f.length + (f.length === 1 ? ' delivery, ' : ' deliveries, ') + gal + ' gallons', amount: gal * SAMPLE_GALLON, fuel: true });
          out.push({ text: 'Diesel delivery to unit ' + r.unit, amount: 0, free: true });
        }
      });
      return out;
    }
    const list = [];
    PERIODS.forEach(p => {
      // past rentals are billed in periods until the one their final invoice covers
      const rs = current.concat(past.filter(r => diffDays(fromKey(r.end), t) > p.to));
      const ls = lines(rs, p.from, p.to);
      if (ls.length) list.push({ id: 'inv-' + p.id, kind: 'Monthly', period: [p.from, p.to], issued: p.issued, paid: !!p.paid, lines: ls });
    });
    past.forEach((r, i) => {
      const end = diffDays(fromKey(r.end), t), p = PERIODS.find(x => end >= x.from && end <= x.to) || PERIODS[0];
      list.push({ id: 'inv-final-' + r.id, kind: 'Final', period: [p.from, end], issued: end + 1, paid: i === 0, lines: lines([r], p.from, end), rental: r });
    });
    list.sort((a, b) => a.issued - b.issued).forEach((inv, i) => {
      inv.no = 'Sample ' + (4101 + i);
      inv.total = inv.lines.reduce((s, l) => s + l.amount, 0);
      inv.issuedDay = addDays(t, inv.issued);
      inv.due = addDays(t, inv.issued + 30);                      // Net 30
      inv.periodLabel = dayLabel(inv.period[0]) + ' to ' + dayLabel(inv.period[1]);
      inv.demoPaid = paidDemo.has(inv.id);
      inv.status = inv.paid || inv.demoPaid ? 'paid' : inv.due < t ? 'overdue' : inv.kind === 'Final' ? 'final' : 'open';
    });
    return list.reverse();
  }

  /* SAMPLE certificates of insurance on file, with any uploaded replacement. */
  function certificates(events) {
    const t = today();
    const up = events.filter(e => e.type === 'coiUpload' && e.customer === CUSTOMER).sort((a, b) => a.at < b.at ? 1 : -1)[0] || null;
    return {
      upload: up,
      list: [
        { id: 'gl', name: 'General liability', expires: addDays(t, 12), soon: true },
        { id: 'auto', name: 'Commercial auto', expires: addDays(t, 213) },
        { id: 'wc', name: 'Workers’ compensation', expires: addDays(t, 150) }
      ]
    };
  }

  PR.acct = {
    CUSTOMER, YOU, TANK, BURN,
    nextDeliveryDays, firstDeliveryDay, boroughSelect, dialog, dayPicker,
    effectiveEvents, rentals, pastRentals, canExtend, latestExtension, fuelDeliveries, invoices, certificates,
    money: n => '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  };
})();
