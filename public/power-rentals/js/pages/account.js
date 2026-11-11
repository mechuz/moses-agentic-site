/* My account: the customer portal, signed in as the SAMPLE customer "General contractor A".
   Every number on the page is derived from the event log (the engine's sample baseline plus PR.store)
   through PR.acct, so a pick-up, extension or fuel order made here shows in the office view in another tab,
   and a change made there repaints this page (PR.store.subscribe). */
(function () {
  'use strict';
  const { h, icon, toast } = PR.ui, E = PR.engine, A = PR.acct, D = PR.data;
  const { fmt, key, fromKey, addDays, diffDays, today } = E;
  const $ = id => document.getElementById(id);
  const TABS = ['rent', 'invoices', 'fuel', 'docs'];

  /* UI state that must survive a repaint (repaints happen on every store change, in this tab or another). */
  const state = {
    tab: 'rent',
    open: {},     // rental id -> 'pickup' | 'extend' | 'fuel': the action panel that is open
    pick: {},     // rental id + ':' + panel -> the day chosen in that panel's picker
    err: {},      // rental id -> an error to show in the open panel
    focus: null,  // element id to focus after the next paint
    allFuel: false // fuel log: show every delivery, not just the latest
  };
  const FUEL_ROWS = 8;

  const customer = D.customers.find(c => c.id === A.CUSTOMER);
  const catIcon = m => D.categories.find(c => c.id === m.cat).icon;
  const tomorrow = () => addDays(today(), 1);
  const long = k => fmt.long(fromKey(k));
  const byAt = (a, b) => (a.at < b.at ? -1 : 1);

  /* ---------- the account model for one paint ---------- */
  function compute() {
    const events = A.effectiveEvents(E.events());
    const mine = A.rentals(events);
    const t = today();
    const rentals = mine.map(r => Object.assign(r, { phase: phase(r, events), req: requests(r, events) }));
    const invoices = A.invoices(events, mine);
    return {
      events, rentals, invoices,
      fuel: A.fuelDeliveries(events, mine),
      certs: A.certificates(events),
      fuelOrders: events.filter(e => e.type === 'fuelOrder' && !e.filled && e.unit && e.day >= key(t) && mine.some(r => r.unit === e.unit)).sort((a, b) => (a.day < b.day ? -1 : 1))
    };
  }

  /* on (on site now), booked (arrives later), done (returned or picked up) */
  function phase(r, events) {
    const t = today();
    if (events.some(e => e.type === 'pickup' && e.rental === r.id)) return 'done';
    if (fromKey(r.start) > t) return 'booked';
    if (fromKey(r.end) < t) return 'done';
    return 'on';
  }

  /* The requests waiting on a rental: the latest pick-up request and the next fuel order for its unit. */
  function requests(r, events) {
    const t = key(today());
    return {
      pickup: events.filter(e => e.type === 'pickupRequest' && e.rental === r.id && e.day >= t).sort(byAt).pop() || null,
      fuel: events.filter(e => e.type === 'fuelOrder' && e.unit === r.unit && !e.filled && e.day >= t).sort((a, b) => (a.day < b.day ? -1 : 1))[0] || null
    };
  }

  /* The live status line for a rental card. */
  function status(r, events) {
    if (r.phase === 'booked') return { cls: 'info', label: 'Booked · arrives ' + fmt.rel(fromKey(r.start)) };
    if (r.phase === 'done') return { cls: '', label: 'Returned' };
    const st = E.statusOn(r.unit, today(), events);
    if (st.ev && st.ev.id === r.id) return { cls: st.state === 'returning' ? 'warn' : 'ok', label: st.label };
    return { cls: '', label: st.label };
  }

  /* The day the truck collects a rental: a requested pick-up, or the end date (moved to a delivery day). */
  const pickupDay = r => r.req.pickup ? fromKey(r.req.pickup.day) : A.firstDeliveryDay(fromKey(r.end));

  /* ---------- summary strip ---------- */
  function summary(m) {
    const on = m.rentals.filter(r => r.phase === 'on'), booked = m.rentals.filter(r => r.phase === 'booked');
    const next = on.concat(booked).map(r => ({ r, d: pickupDay(r) })).sort((a, b) => a.d - b.d)[0];
    const unpaid = m.invoices.filter(i => i.status !== 'paid');
    const overdue = unpaid.filter(i => i.status === 'overdue').length;
    const balance = unpaid.reduce((s, i) => s + i.total, 0);
    const gl = m.certs.list.find(c => c.soon);
    const tile = (tab, k, v, sub, tone) => h('li', h('button.sum' + (tone ? '.' + tone : ''), { type: 'button', onclick: () => selectTab(tab, true) },
      h('span.sum-k', k), h('b.sum-v', v), h('span.sum-sub', sub)));
    const strip = $('sumStrip'); strip.textContent = '';
    strip.append(
      tile('rent', 'Units on rent', String(on.length), booked.length ? booked.length + ' more booked' : on.length ? 'Across your sites' : 'Nothing on site'),
      tile('rent', 'Next pick-up', next ? cap(fmt.rel(next.d)) : 'None', next ? 'Unit ' + next.r.unit + (next.r.req.pickup ? ', you asked' : ', end of rental') : 'No units out'),
      tile('invoices', 'Open balance (sample)', A.money(balance), overdue ? overdue + ' overdue' : unpaid.length ? unpaid.length + ' open' : 'All paid', overdue ? 'bad' : ''),
      m.certs.upload
        ? tile('docs', 'Certificate of insurance', 'Under review', 'New one received', 'info')
        : tile('docs', 'Certificate of insurance', 'Expires ' + fmt.rel(gl.expires), 'General liability: upload a new one', 'warn'));
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

  /* ---------- tab: on rent ---------- */
  function rentPanel(m) {
    const p = $('panel-rent'); p.textContent = '';
    const live = m.rentals.filter(r => r.phase !== 'done'), done = m.rentals.filter(r => r.phase === 'done');
    p.append(h('div.panel-head', h('div', h('h2', 'On rent'), h('p.mute', 'Live status for every unit on your sites. Ask for a pick-up, extend, or order diesel right from the card.')),
      h('a.btn.btn-gold.btn-sm', { href: 'book.html' }, 'Book another unit')));
    if (!live.length) p.append(h('p.empty', 'Nothing on rent right now. ', h('a', { href: 'book.html' }, 'Book a unit'), '.'));
    p.append(h('div.rentgrid', live.map(r => rentalCard(r, m))));
    if (done.length) p.append(h('h3.subhead', 'Returned'), h('div.rentgrid', done.map(r => rentalCard(r, m))));
  }

  function rentalCard(r, m) {
    const st = status(r, m.events), open = state.open[r.id];
    const diesel = r.model.fuel === 'diesel', active = r.phase !== 'done';
    const actions = !active ? null : h('div.rent-actions',
      toggle(r, 'pickup', r.req.pickup ? 'Change pick-up' : 'Request pick-up', 'truck'),
      toggle(r, 'extend', 'Extend', 'clock'),
      diesel ? toggle(r, 'fuel', r.req.fuel ? 'Change fuel day' : 'Order fuel', 'fuel') : null);
    const panel = !active || !open ? null : open === 'pickup' ? pickupForm(r) : open === 'extend' ? extendForm(r, m.events) : fuelForm(r);
    return h('article.card.rent' + (open ? '.is-open' : ''), { 'aria-labelledby': 'rh-' + r.id },
      h('div.rent-head',
        h('span.rent-ico', icon(catIcon(r.model))),
        h('div.rent-title', h('h3#rh-' + r.id, 'Unit ' + r.unit), h('p', r.model.name)),
        h('span.badge.live' + (st.cls ? '.' + st.cls : ''), st.label)),
      h('dl.rent-meta',
        h('div', h('dt', 'Site'), h('dd', r.borough || 'Your site')),
        h('div', h('dt', 'Since'), h('dd', fmt.short(fromKey(r.start)))),
        h('div', h('dt', 'Until'), h('dd', fmt.short(fromKey(r.end)), r.originalEnd ? h('span.was', ' (was ' + fmt.short(fromKey(r.originalEnd)) + ')') : null)),
        h('div', h('dt', 'Booked by'), h('dd', r.customer === A.YOU ? 'Website booking' : r.source))),
      pending(r),
      actions, panel);
  }

  /* The requests waiting on this rental, each with a way to cancel it. */
  function pending(r) {
    const items = [];
    if (r.originalEnd) items.push(h('li', icon('clock'), h('span', h('b', 'Extended until ' + long(r.end)), ' · confirmed'), null));
    if (r.req.pickup) items.push(h('li', icon('truck'), h('span', h('b', 'Pick-up requested for ' + long(r.req.pickup.day)), ' · waiting for the office'),
      cancelBtn(r.req.pickup, 'Cancel pick-up request', 'Pick-up request cancelled')));
    if (r.req.fuel) items.push(h('li', icon('fuel'), h('span', h('b', 'Diesel top-up ' + (r.req.fuel.source === 'Fuel monitoring' ? 'booked by fuel monitoring' : 'ordered') + ' for ' + long(r.req.fuel.day)), ' · on the route'),
      r.req.fuel.source === 'Fuel monitoring' ? null : cancelBtn(r.req.fuel, 'Cancel fuel order', 'Fuel order cancelled')));
    if (!items.length) return null;
    return h('ul.pending#pend-' + r.id, { tabindex: '-1', 'aria-label': 'Requests for unit ' + r.unit }, items);
  }
  function cancelBtn(ev, label, done) {
    return h('button.linkish.small', { type: 'button', onclick: () => { PR.store.remove(ev.id); toast(done); } }, label);
  }

  /* A button that opens or closes one action panel on a card. */
  function toggle(r, kind, label, ico) {
    const on = state.open[r.id] === kind, id = 'tg-' + r.id + '-' + kind;
    return h('button.btn.btn-sm' + (on ? '.btn-dark' : '.btn-line') + '#' + id, {
      type: 'button', 'aria-expanded': String(on), 'aria-controls': 'pn-' + r.id,
      onclick: () => {
        state.open[r.id] = on ? null : kind; delete state.err[r.id];
        state.focus = on ? id : 'pn-' + r.id; paint();
      }
    }, icon(ico), label);
  }

  /* Shared shell for the three action panels: a form with a day picker, a hint and a submit button. */
  function panelForm(r, { kind, title, picker, hint, submit, onSubmit }) {
    const err = state.err[r.id];
    const form = h('form.rent-panel#pn-' + r.id, { 'aria-label': title + ', unit ' + r.unit, tabindex: '-1', novalidate: true },
      h('p.panel-title', title), picker, hint ? h('p.hint', hint) : null,
      err ? h('p.err', { role: 'alert' }, err) : null,
      h('div.panel-actions', submit, h('button.btn.btn-sm.btn-line', { type: 'button', onclick: () => { state.open[r.id] = null; state.focus = 'tg-' + r.id + '-' + kind; paint(); } }, 'Close')));
    form.addEventListener('submit', e => { e.preventDefault(); onSubmit(); });
    return form;
  }
  /* A picker wired to state, and a submit button whose label follows the chosen day. */
  function pickerWith(r, kind, opts, verb) {
    const pk = r.id + ':' + kind;
    const btn = h('button.btn.btn-gold.btn-sm', { type: 'submit' });
    const setLabel = k => { btn.textContent = k ? verb + ' ' + fmt.short(fromKey(k)) : 'Pick a day'; btn.disabled = !k; };
    const picker = A.dayPicker(Object.assign({}, opts, { name: kind + '-' + r.id, selected: state.pick[pk] || opts.selected, onChange: k => { state.pick[pk] = k; delete state.err[r.id]; setLabel(k); } }));
    setLabel(picker.value());
    return { picker, btn };
  }

  function pickupForm(r) {
    const from = tomorrow(), end = fromKey(r.end);
    const { picker, btn } = pickerWith(r, 'pickup', {
      legend: 'Pick-up day (delivery days only)', from, to: end > addDays(from, 13) ? end : addDays(from, 13),
      selected: r.req.pickup ? r.req.pickup.day : key(A.firstDeliveryDay(from))
    }, 'Request pick-up');
    return panelForm(r, {
      kind: 'pickup', title: 'Request pick-up', picker, submit: btn,
      hint: 'The truck comes on the day you pick. You get a text when the office confirms it.',
      onSubmit() {
        const day = picker.value();
        if (!day || !E.hours.isDeliveryDay(fromKey(day))) { state.err[r.id] = 'Pick a delivery day.'; paint(); return; }
        state.open[r.id] = null; state.focus = 'pend-' + r.id;
        if (r.req.pickup) PR.store.update(r.req.pickup.id, { day, at: new Date().toISOString() });
        else PR.store.add({ type: 'pickupRequest', unit: r.unit, rental: r.id, day, customer: A.CUSTOMER });
        toast('Pick-up requested for ' + long(day));
      }
    });
  }

  function extendForm(r, events) {
    const end = fromKey(r.end), latest = A.latestExtension(r, events);
    if (!latest) {
      return panelForm(r, {
        kind: 'extend', title: 'Extend rental', picker: h('p.err', { role: 'alert' }, 'Unit ' + r.unit + ' is booked right after this rental, so it cannot be extended online. Call the desk at ' + PR.config.business.phone + ' and we will find you another unit.'),
        submit: null, onSubmit() {}
      });
    }
    const limit = addDays(end, 60);
    const { picker, btn } = pickerWith(r, 'extend', {
      legend: 'New end date', from: addDays(end, 1), to: limit, isAllowed: d => key(d) <= latest,
      selected: key(addDays(end, 7)) <= latest ? key(addDays(end, 7)) : latest
    }, 'Extend until');
    return panelForm(r, {
      kind: 'extend', title: 'Extend rental', picker, submit: btn,
      hint: latest === key(limit) ? 'Unit ' + r.unit + ' is free for the next 60 days after ' + fmt.short(end) + '.' : 'Unit ' + r.unit + ' is free until ' + long(latest) + '. After that it is booked.',
      onSubmit() {
        const day = picker.value();
        // Check again against the latest events: another tab may have booked the unit since this panel opened.
        const fresh = A.rentals(A.effectiveEvents(E.events())).find(x => x.id === r.id);
        if (!day || !fresh || !A.canExtend(fresh, day, A.effectiveEvents(E.events()))) {
          state.err[r.id] = 'Unit ' + r.unit + ' is not free until ' + (day ? long(day) : 'then') + '. Pick an earlier day.'; paint(); return;
        }
        state.open[r.id] = null; state.focus = 'pend-' + r.id; delete state.pick[r.id + ':extend'];
        PR.store.add({ type: 'extend', unit: r.unit, rental: r.id, end: day, customer: A.CUSTOMER });
        toast('Extended until ' + long(day));
      }
    });
  }

  function fuelForm(r) {
    const from = tomorrow();
    const { picker, btn } = pickerWith(r, 'fuel', {
      legend: 'Delivery day (delivery days only)', from, to: addDays(from, 13),
      selected: r.req.fuel ? r.req.fuel.day : key(A.firstDeliveryDay(from))
    }, 'Order top-up for');
    return panelForm(r, {
      kind: 'fuel', title: 'Order fuel', picker, submit: btn,
      hint: 'We fill the tank to the top. Diesel delivery is free across the five boroughs, no minimum.',
      onSubmit() {
        const day = picker.value();
        if (!day || !E.hours.isDeliveryDay(fromKey(day))) { state.err[r.id] = 'Pick a delivery day.'; paint(); return; }
        state.open[r.id] = null; state.focus = 'pend-' + r.id;
        if (r.req.fuel) PR.store.update(r.req.fuel.id, { day, at: new Date().toISOString() });
        else PR.store.add({ type: 'fuelOrder', unit: r.unit, day, gallons: 'top up', rental: r.id, customer: A.CUSTOMER, source: 'Customer portal' });
        toast('Diesel top-up ordered for ' + long(day));
      }
    });
  }

  /* ---------- tab: invoices ---------- */
  const INV = { paid: ['ok', 'Paid'], open: ['info', 'Open'], overdue: ['bad', 'Overdue'], final: ['warn', 'Final'] };

  function invoicesPanel(m) {
    const p = $('panel-invoices'); p.textContent = '';
    p.append(h('div.panel-head', h('div', h('h2', 'Invoices ', h('span.badge.sample', 'Sample amounts')),
      h('p.mute', 'Billed ' + customer.cycle.toLowerCase() + ', ' + customer.terms + '. Rental days and diesel are lines on the same invoice. Every amount here is a sample, before tax; live invoices come from your rate card.'))));
    p.append(h('ul.invlist', m.invoices.map(inv => h('li', invoiceCard(inv)))));
  }

  function invoiceCard(inv) {
    const [cls, word] = INV[inv.status], t = today();
    const late = inv.status === 'overdue' ? diffDays(t, inv.due) : 0;
    return h('article.card.inv.' + inv.status, { 'aria-labelledby': 'ih-' + inv.id },
      h('div.inv-top',
        h('div', h('h3#ih-' + inv.id, { tabindex: '-1' }, 'Invoice ' + inv.no), h('p.small.mute', inv.kind === 'Final' ? 'Final invoice · unit ' + inv.rental.unit + ' returned' : 'Monthly invoice')),
        h('span.inv-badges', inv.kind === 'Final' && inv.status !== 'final' ? h('span.badge', 'Final') : null, h('span.badge.' + cls, word + (late ? ' · ' + late + (late === 1 ? ' day' : ' days') : '') + (inv.demoPaid ? ' (demo)' : '')))),
      h('div.inv-mid',
        h('dl.inv-meta',
          h('div', h('dt', 'Period'), h('dd', inv.periodLabel)),
          h('div', h('dt', 'Issued'), h('dd', fmt.short(inv.issuedDay))),
          h('div', h('dt', inv.status === 'paid' ? 'Was due' : 'Due'), h('dd', fmt.short(inv.due)))),
        h('p.inv-amt', h('span.sr', 'Total, sample: '), A.money(inv.total))),
      h('details.inv-lines',
        h('summary', inv.lines.length + ' lines'),
        h('div.tablewrap', h('table.data',
          h('caption.sr', 'Lines on invoice ' + inv.no + ', sample amounts'),
          h('thead', h('tr', h('th', { scope: 'col' }, 'Line'), h('th.r', { scope: 'col' }, 'Amount'))),
          h('tbody', inv.lines.map(l => h('tr' + (l.fuel ? '.fuelline' : ''), h('td', l.text), h('td.r', l.free ? 'Free' : A.money(l.amount))))),
          h('tfoot', h('tr', h('th', { scope: 'row' }, 'Total (sample)'), h('td.r', h('b', A.money(inv.total)))))))),
      inv.status === 'paid' ? null : h('div.inv-actions', h('button.btn.btn-gold.btn-sm', { type: 'button', onclick: () => payDialog(inv) }, 'Pay now')));
  }

  /* A demo confirmation only: nothing is charged and no payment details are asked for. */
  function payDialog(inv) {
    A.dialog({
      title: 'Pay invoice ' + inv.no,
      body: [
        h('p.dlg-amt', A.money(inv.total), h('span.badge.sample', 'Sample')),
        h('p', 'This is a demo. Nothing is charged and no card or bank details are asked for.'),
        h('p.mute.small', 'On the live portal this button opens a secure payment page, and the invoice shows as paid as soon as the payment clears.')
      ],
      label: 'Not now',
      actions: [{
        label: 'Confirm demo payment', primary: true,
        onClick() { state.focus = 'ih-' + inv.id; PR.store.add({ type: 'demoPayment', invoice: inv.id, customer: A.CUSTOMER }); toast('Demo payment recorded. Nothing was charged.'); }
      }]
    });
  }

  /* ---------- tab: fuel log ---------- */
  function fuelPanel(m) {
    const p = $('panel-fuel'); p.textContent = '';
    const t = today(), last30 = m.fuel.filter(f => diffDays(t, fromKey(f.day)) <= 30);
    p.append(h('div.panel-head', h('div', h('h2', 'Fuel log ', h('span.badge.sample', 'Sample')),
      h('p.mute', 'Every diesel delivery to your units, with the driver’s photo of the gauge. Diesel delivery is free across the five boroughs, no minimum.')),
      h('a.btn.btn-line.btn-sm', { href: 'fuel.html' }, 'How fuel monitoring works')));
    p.append(h('ul.fuelstats',
      h('li', h('b', String(last30.length)), h('span', 'deliveries in the last 30 days')),
      h('li', h('b', last30.reduce((s, f) => s + f.gallons, 0).toLocaleString('en-US')), h('span', 'gallons in the last 30 days')),
      h('li', h('b', String(m.fuelOrders.length)), h('span', m.fuelOrders.length === 1 ? 'top-up on the route' : 'top-ups on the route'))));
    if (m.fuelOrders.length) {
      p.append(h('h3.subhead', 'Coming up'), h('ul.upcoming', m.fuelOrders.map(o => h('li', icon('truck'),
        h('span', h('b', fmt.long(fromKey(o.day))), ' · unit ' + o.unit + ' · fill to the top', o.source === 'Fuel monitoring' ? ' · booked by fuel monitoring' : ''),
        h('span.badge.info', 'Scheduled')))));
    }
    p.append(h('h3.subhead', 'Delivered'));
    if (!m.fuel.length) { p.append(h('p.empty', 'No diesel deliveries yet.')); return; }
    p.append(h('div.tablewrap', h('table.data.fuellog',
      h('caption.sr', 'Diesel deliveries, newest first'),
      h('thead', h('tr', ['Date', 'Unit', 'Gallons', 'Driver', 'Photo'].map((c, i) => h('th' + (i === 2 ? '.r' : ''), { scope: 'col' }, c)))),
      h('tbody', m.fuel.slice(0, state.allFuel ? m.fuel.length : FUEL_ROWS).map((f, i) => h('tr', { id: i === FUEL_ROWS ? 'fuelMore' : null, tabindex: i === FUEL_ROWS ? '-1' : null },
        h('td', { 'data-l': 'Date' }, fmt.short(fromKey(f.day))),
        h('td', { 'data-l': 'Unit' }, 'Unit ' + f.unit, h('span.mute.small', ' ' + f.model.short)),
        h('td.r', { 'data-l': 'Gallons' }, String(f.gallons)),
        h('td', { 'data-l': 'Driver' }, f.driver),
        h('td', { 'data-l': 'Photo' }, h('button.photo', { type: 'button', onclick: () => photoDialog(f) }, icon('check'), 'Photo on file'))))))));
    if (m.fuel.length > FUEL_ROWS) p.append(h('button.btn.btn-line.btn-sm.morebtn', { type: 'button', 'aria-expanded': String(state.allFuel),
      onclick: () => { state.allFuel = !state.allFuel; state.focus = state.allFuel ? 'fuelMore' : null; paint(); } },
      state.allFuel ? 'Show the latest ' + FUEL_ROWS : 'Show all ' + m.fuel.length + ' deliveries'));
  }

  /* The gauge photo a driver takes after every delivery (drawn here; a real build shows the photo). */
  function photoDialog(f) {
    const pct = 88 + (f.unit * 7 + f.gallons) % 10;
    A.dialog({
      title: 'Gauge photo · unit ' + f.unit,
      body: [
        h('div.photo-mock', { role: 'img', 'aria-label': 'Sample drawing of a fuel gauge reading ' + pct + ' percent' },
          h('div.pm-dial', h('i', { style: '--p:' + pct })), h('span', pct + '% full')),
        h('p', f.driver + ' delivered ' + f.gallons + ' gallons on ' + fmt.long(fromKey(f.day)) + ' and photographed the gauge.'),
        h('p.small.mute', 'Sample. On the live portal this is the photo from the driver’s fuel ticket.')
      ]
    });
  }

  /* ---------- tab: documents ---------- */
  function docsPanel(m) {
    const p = $('panel-docs'); p.textContent = '';
    const t = today();
    p.append(h('div.panel-head', h('div', h('h2', 'Documents ', h('span.badge.sample', 'Sample')),
      h('p.mute', 'Rental agreements, your certificates of insurance, and the Fire Department notice for every fueled heater.'))));

    // certificates of insurance
    const up = m.certs.upload;
    p.append(h('h3.subhead', 'Certificates of insurance'), h('ul.doclist', m.certs.list.map(c => {
      const days = diffDays(c.expires, t);
      const replaced = c.soon && up;
      return h('li.doc' + (c.soon && !up ? '.soon' : ''),
        h('span.doc-ico', icon('doc')),
        h('div.doc-main', h('b', c.name), h('span.small.mute', 'Expires ' + fmt.long(c.expires)),
          replaced ? h('p.small.upmsg#coiMsg', { tabindex: '-1' }, icon('check'), 'New certificate received: ', h('b', up.name), '. The office checks it and updates the date.') : null),
        h('span.badge.' + (replaced ? 'info' : c.soon ? 'warn' : 'ok'), replaced ? 'Under review' : c.soon ? 'Expires in ' + days + ' days' : 'Valid'),
        c.soon ? h('div.upload',
          h('label.btn.btn-sm.btn-dark', { for: 'coiFile' }, icon('doc'), replaced ? 'Upload another' : 'Upload new certificate'),
          h('input.sr#coiFile', { type: 'file', accept: '.pdf,image/*', onchange: onUpload }),
          h('span.small.mute', 'Only the file name is read in this demo. Nothing leaves your browser.')) : null);
    })));

    // rental agreements
    const all = m.rentals.concat(A.pastRentals().map(r => Object.assign(r, { phase: 'done' })));
    p.append(h('h3.subhead', 'Rental agreements'), h('ul.doclist', all.map(r => h('li.doc',
      h('span.doc-ico', icon('doc')),
      h('div.doc-main', h('b', 'Unit ' + r.unit + ' · ' + r.model.name), h('span.small.mute', 'Signed ' + fmt.long(fromKey(r.start)) + ' · ' + (r.borough || 'your site'))),
      h(r.phase === 'done' ? 'span.badge' : 'span.badge.ok', r.phase === 'done' ? 'Closed' : r.phase === 'booked' ? 'Signed' : 'Active'),
      h('button.btn.btn-sm.btn-line', { type: 'button', onclick: () => agreementDialog(r) }, 'View')))));

    // Fire Department notices for fueled heaters still on site
    const heaters = m.rentals.filter(r => r.model.fuel === 'fueled' && r.phase !== 'done');
    p.append(h('h3.subhead', 'Fire Department heater supervision notices'));
    if (!heaters.length) p.append(h('p.empty', 'No fueled heaters on your sites.'));
    else p.append(h('ul.doclist', heaters.map(r => h('li.doc',
      h('span.doc-ico.fire', icon('heat')),
      h('div.doc-main', h('b', 'Unit ' + r.unit + ' · ' + r.model.name), h('span.small.mute', 'Keep this notice with the heater on site')),
      h('span.badge.warn', 'Required'),
      h('button.btn.btn-sm.btn-line', { type: 'button', onclick: () => noticeDialog(r) }, 'View notice')))));
  }

  function onUpload(e) {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    state.focus = 'coiMsg';
    PR.store.add({ type: 'coiUpload', customer: A.CUSTOMER, name: f.name });   // the file name only
    toast('Certificate received: ' + f.name);
  }

  const dl = rows => h('dl.dlg-dl', rows.map(([k, v]) => h('div', h('dt', k), h('dd', v))));
  function agreementDialog(r) {
    A.dialog({
      title: 'Rental agreement · unit ' + r.unit,
      body: [
        dl([['Customer', customer.name], ['Equipment', r.model.name], ['Unit', String(r.unit)], ['Site', r.borough || 'Your site'],
          ['Start', fmt.long(fromKey(r.start))], ['End', fmt.long(fromKey(r.end)) + (r.originalEnd ? ' (extended)' : '')],
          ['Billing', customer.cycle + ', ' + customer.terms], ['Signed', 'By text, ' + fmt.long(fromKey(r.start))]]),
        h('p.small.mute', 'Sample. On the live portal this opens the signed agreement.')
      ]
    });
  }
  function noticeDialog(r) {
    A.dialog({
      title: 'Fire Department heater supervision notice',
      body: [
        h('p', h('b', 'Unit ' + r.unit + ' · ' + r.model.name), ' · ' + (r.borough || 'your site')),
        h('p', 'Fueled heaters on construction sites must be supervised under Fire Department rules.'),
        h('ul.dlg-list',
          h('li', 'Keep this notice with the heater while it is on site.'),
          h('li', 'A person responsible for the heater stays on site while it runs.'),
          h('li', 'Call the desk at ' + PR.config.business.phone + ' if the heater needs service.')),
        h('p.small.mute', 'Sample notice. Power Rentals supplies the official wording.')
      ]
    });
  }

  /* ---------- tabs (WAI-ARIA tabs pattern: arrows, Home and End move between tabs) ---------- */
  function selectTab(name, focus) {
    if (!TABS.includes(name)) name = 'rent';
    state.tab = name;
    TABS.forEach(t => {
      const tab = $('tab-' + t), on = t === name;
      tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
      $('panel-' + t).hidden = !on;
    });
    if (focus) $('tab-' + name).focus();
    if (location.hash.slice(1) !== name) history.replaceState(null, '', location.pathname + location.search + '#' + name);
  }
  function wireTabs() {
    TABS.forEach(t => $('tab-' + t).addEventListener('click', () => selectTab(t)));
    $('acctTabs').addEventListener('keydown', e => {
      const i = TABS.indexOf(state.tab);
      const to = { ArrowRight: (i + 1) % TABS.length, ArrowLeft: (i + TABS.length - 1) % TABS.length, Home: 0, End: TABS.length - 1 }[e.key];
      if (to === undefined) return;
      e.preventDefault(); selectTab(TABS[to], true);
    });
    window.addEventListener('hashchange', () => selectTab(location.hash.slice(1)));
  }

  /* ---------- paint ---------- */
  function paint() {
    const m = compute();
    $('acctTerms').textContent = 'Billed ' + customer.cycle.toLowerCase() + ' · ' + customer.terms;
    summary(m);
    rentPanel(m); invoicesPanel(m); fuelPanel(m); docsPanel(m);
    $('cnt-rent').textContent = String(m.rentals.filter(r => r.phase === 'on').length);
    $('cnt-invoices').textContent = String(m.invoices.filter(i => i.status !== 'paid').length);
    $('cnt-fuel').textContent = String(m.fuel.length);
    const docs = $('cnt-docs'); docs.textContent = '';
    if (!m.certs.upload) docs.append(h('span', { 'aria-hidden': 'true' }, '!'), h('span.sr', 'needs attention'));
    if (state.focus) {
      const id = state.focus; state.focus = null;
      const go = () => { const el = $(id); if (el) (el.matches('form') ? (el.querySelector('input:checked:not(:disabled)') || el) : el).focus(); };
      // while a modal is open the page is inert: move focus once it has closed
      const open = document.querySelector('dialog[open]');
      if (open) open.addEventListener('close', () => setTimeout(go), { once: true }); else go();
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    wireTabs();
    paint();
    selectTab(location.hash.slice(1) || 'rent');
    PR.store.subscribe(paint);
  });
})();
