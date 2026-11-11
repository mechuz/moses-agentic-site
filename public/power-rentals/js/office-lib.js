/* Power Rentals demo · office model.
   The data behind the office view, with no DOM code: office.js renders it.

   Everything here is derived from two places:
     1. the engine's SAMPLE baseline (units, rentals and service holds from data.js), and
     2. the event log (PR.store), where the live feed simulator, the booking page and the
        office actions add events. Because the event log syncs across tabs, so does this model.

   Event types this file reads or writes, beyond the engine's own:
     fuel      { unit, day, gallons, rental, customer }        a driver's fuel ticket
     dropoff   { unit, day, rental }                            a driver's drop-off ticket
     pickup    { unit, day, rental, final, invoice, amount }    final: true when it came from a final invoice
     billing   { action: 'post' | 'addfuel', group, keys }      billing approved a group, or added fuel lines
     promise   { item, customer, date, amount }                 a payment promise logged against a receivable

   Amounts, gallons, invoice numbers and replies are SAMPLE values for the demo. */
window.PR = window.PR || {};
(function () {
  'use strict';
  const E = PR.engine, D = PR.data;

  /* ---------- lookups and labels ---------- */
  const unitOf = no => D.units.find(u => u.no === no) || null;
  const modelOfUnit = no => { const u = unitOf(no); return u ? E.modelById(u.model) : null; };
  const unitLabel = no => { const m = modelOfUnit(no); return 'Unit ' + no + (m ? ' · ' + m.short : ''); };
  const customerOf = id => D.customers.find(c => c.id === id) || null;
  /* Website bookings may carry a typed name instead of a sample role id. */
  const customerName = id => { const c = customerOf(id); return c ? c.name : (id ? String(id) : 'Website customer'); };
  const takesFuel = no => { const m = modelOfUnit(no); return !!m && (m.fuel === 'diesel' || m.fuel === 'fueled'); };

  /* data.js uses 'Booking' for a booking made online. */
  const SOURCE_LABEL = { Booking: 'Website booking' };
  const sourceLabel = s => SOURCE_LABEL[s] || s || 'Yard count';

  /* Where a unit's current status comes from, as the yard board shows it. */
  function statusSource(st) {
    if (st.state === 'yard') return st.ev && st.ev.final ? 'Final invoice' : st.ev ? 'Pick-up ticket' : 'Yard count';
    return sourceLabel(st.source);
  }

  /* Small deterministic number from a seed, so sample values stay put between visits. */
  const seeded = (a, b) => ((a * 9301 + b * 49297) % 233280) / 233280;
  const live = events => events.filter(e => !e.sample);
  const latest = list => list.slice().sort((a, b) => (a.at < b.at ? 1 : -1))[0] || null;

  /* ---------- billing state from the event log ---------- */
  function postedKeys(events) {
    const s = new Set();
    events.forEach(e => { if (e.type === 'billing' && e.action === 'post') (e.keys || []).forEach(k => s.add(k)); });
    return s;
  }
  function fuelAdded(events) {
    return new Set(events.filter(e => e.type === 'billing' && e.action === 'addfuel').map(e => e.key));
  }
  function lastPost(events, group) {
    return latest(events.filter(e => e.type === 'billing' && e.action === 'post' && e.group === group));
  }

  /* The rental a unit is on today, from the full event list (baseline plus live). */
  function currentRental(no, events) {
    const st = E.statusOn(no, E.today(), events);
    return (st.state === 'out' || st.state === 'returning') ? st.ev : null;
  }

  /* ---------- fuel tickets ----------
     SAMPLE tickets for the diesel units the baseline has on rent today, plus every fuel ticket in the event log.
     Older sample tickets are already billed; the last few days are not. */
  function fuelTickets(events) {
    const t = E.today(), out = [];
    E.baseline().filter(r => r.type === 'rental' && modelOfUnit(r.unit).fuel === 'diesel' &&
      E.fromKey(r.start) <= t && E.fromKey(r.end) >= t).forEach(r => {
      const running = E.diffDays(t, E.fromKey(r.start));
      const n = Math.min(3, 1 + Math.floor(running / 5));
      for (let k = 0; k < n; k++) {
        const ago = Math.min(running, 1 + k * 4 + (r.unit % 3));
        out.push({
          id: 'ft-' + r.unit + '-' + k, ticket: 'Sample ' + (4100 + r.unit * 3 + k), unit: r.unit, rental: r.id, customer: r.customer,
          day: E.addDays(t, -ago), gallons: 25 + Math.round(seeded(r.unit, k) * 140) / 2,
          photo: (r.unit + k) % 7 !== 3, billedBefore: ago >= 4, sample: true
        });
      }
    });
    live(events).filter(e => e.type === 'fuel').forEach(e => {
      const r = events.find(x => x.id === e.rental);
      out.push({ id: e.id, ticket: 'New ticket', unit: e.unit, rental: e.rental, customer: e.customer || (r && r.customer),
        day: E.fromKey(e.day), gallons: +e.gallons || 0, photo: e.photo !== false, billedBefore: false, fresh: true });
    });
    const posted = postedKeys(events);
    out.forEach(f => { f.billed = f.billedBefore || posted.has(f.id); });
    return out.sort((a, b) => b.day - a.day || a.unit - b.unit);
  }

  /* ---------- recurring charges (weekly, every two weeks, monthly) ---------- */
  const CHARGES = [
    { key: 'ch-gcD', customer: 'gcD', amount: 1850 },
    { key: 'ch-pmB', customer: 'pmB', amount: 2400 },
    { key: 'ch-gcA', customer: 'gcA', amount: 5300 },
    { key: 'ch-citE', customer: 'citE', amount: 9650 },
    { key: 'ch-gcG', customer: 'gcG', amount: 4400 }
  ];
  /* The weekly customer's forklift has no drop-off ticket yet, so its charge cannot start.
     A drop-off ticket for that rental (from the live feed) clears it. */
  function missingTicketRental() {
    return E.baseline().find(r => r.type === 'rental' && r.customer === 'gcD' && modelOfUnit(r.unit).id === 'fl5') || null;
  }
  function charges(events) {
    const t = E.today(), posted = postedKeys(events), gap = missingTicketRental();
    const period = { Weekly: 'This week', Biweekly: 'These two weeks', Monthly: E.MON[t.getMonth()] };
    return CHARGES.map(c => {
      const cust = customerOf(c.customer);
      const onRent = D.units.filter(u => { const r = currentRental(u.no, events); return r && r.customer === c.customer; });
      let missing = null;
      if (gap && c.customer === gap.customer && !events.some(e => e.type === 'dropoff' && (e.rental === gap.id || (!e.rental && e.unit === gap.unit))))
        missing = 'No drop-off ticket for ' + unitLabel(gap.unit) + '. The charge start date is not confirmed.';
      return Object.assign({}, c, {
        name: cust.name, cycle: cust.cycle === 'Biweekly' ? 'Every two weeks' : cust.cycle, period: period[cust.cycle] || 'This period',
        units: onRent.length, missing, missingUnit: missing ? gap.unit : null, posted: posted.has(c.key)
      });
    });
  }

  /* ---------- monthly rental invoices: does each carry all its fuel? ---------- */
  const MONTHLY = [
    { key: 'mi-gcA', customer: 'gcA', invoice: 'Sample M-0311', rent: 5300, missing: 2 },
    { key: 'mi-citE', customer: 'citE', invoice: 'Sample M-0312', rent: 9650, missing: 0 },
    { key: 'mi-gcG', customer: 'gcG', invoice: 'Sample M-0313', rent: 4400, missing: 1 }
  ];
  function monthlyInvoices(events) {
    const tickets = fuelTickets(events), posted = postedKeys(events), added = fuelAdded(events);
    return MONTHLY.map(m => {
      const mine = tickets.filter(f => f.customer === m.customer);
      const missing = added.has(m.key) ? 0 : Math.min(m.missing, mine.length);
      return Object.assign({}, m, { name: customerName(m.customer), tickets: mine.length, lines: mine.length - missing, missing, posted: posted.has(m.key) });
    });
  }

  /* ---------- add-ons caught from email replies ---------- */
  function addOns(events) {
    const posted = postedKeys(events), base = E.baseline();
    const deliveryOf = (cust, modelId) => base.find(r => r.type === 'rental' && r.customer === cust && modelOfUnit(r.unit).id === modelId);
    const list = [
      { key: 'ao-1', customer: 'gcA', on: deliveryOf('gcA', 'c400'), reply: 'Can you add 1 telehandler and 1 fuel can on the next run?',
        lines: [{ item: 'Telehandler', qty: 1, model: 'tele' }, { item: 'Fuel can', qty: 1 }] },
      { key: 'ao-2', customer: 'pmB', on: deliveryOf('pmB', 'hyb70'), reply: 'Please leave a spider box with the generator too.',
        lines: [{ item: 'Spider box', qty: 1, model: 'spider' }] }
    ];
    return list.map(a => Object.assign(a, {
      name: customerName(a.customer), unit: a.on ? a.on.unit : null, posted: posted.has(a.key),
      lines: a.lines.map(l => Object.assign({}, l, l.model ? { free: E.freeUnits(l.model, E.today(), 1, events).length } : {}))
    }));
  }

  /* ---------- receivables: why each balance is late, not just how old ---------- */
  const FLAGS = [
    { id: 'final', title: 'Finished rental, still owed', why: 'The invoice says final: the equipment is back, the balance is not.' },
    { id: 'event', title: 'Event done, not paid', why: 'The event is over and the terms were payment on delivery.' },
    { id: 'schedule', title: 'Behind agreed schedule', why: 'The customer agreed to a payment schedule and has missed it.' },
    { id: 'promise', title: 'Promise broken', why: 'A promised payment date has passed with nothing received.' }
  ];
  /* SAMPLE open invoices. age = days since the invoice date. base = the flag before any promise. */
  const OPEN = [
    { id: 'ar-1', customer: 'gcD', invoice: 'Sample 1018', amount: 4860, age: 38, base: 'final', detail: 'Marked final 38 days ago.' },
    { id: 'ar-2', customer: 'citE', invoice: 'Sample 0988', amount: 12400, age: 64, base: 'final', detail: 'Marked final 64 days ago.' },
    { id: 'ar-3', customer: 'gcG', invoice: 'Sample 0941', amount: 1150, age: 97, base: 'final', detail: 'Marked final 97 days ago.' },
    { id: 'ar-4', customer: 'evC', invoice: 'Sample 1062', amount: 2150, age: 12, base: 'event', detail: 'Event finished 12 days ago. Terms: paid on delivery.' },
    { id: 'ar-5', customer: 'pmB', invoice: 'Sample 1031', amount: 3600, age: 37, base: 'schedule', detail: 'Agreed: a payment every two weeks. Last payment 37 days ago, so 2 payments are missed.' },
    { id: 'ar-6', customer: 'gcA', invoice: 'Sample 1004', amount: 8200, age: 47, base: 'schedule', detail: 'Terms are net 30. The invoice is 17 days past its due date.',
      samplePromise: { amount: 5000, daysAgo: 6 } },
    { id: 'ar-7', customer: 'gcG', invoice: 'Sample 1077', amount: 6900, age: 18, base: null, detail: 'Within terms.' },
    { id: 'ar-8', customer: 'rsF', invoice: 'Sample 1089', amount: 640, age: 4, base: null, detail: 'Card on file. Within terms.' }
  ];

  function openItems(events) {
    const t = E.today();
    const rows = OPEN.map(o => Object.assign({}, o));
    /* A final invoice posted from the live feed is a finished rental with money owed. */
    live(events).filter(e => e.type === 'pickup' && e.final).forEach(e => rows.push({
      id: e.id, customer: e.customer, invoice: e.invoice || 'New invoice', amount: +e.amount || 0,
      age: Math.max(0, E.diffDays(t, new Date(e.at))), base: 'final', detail: 'Marked final today in the accounting system. ' + unitLabel(e.unit) + ' is back.', fresh: true
    }));
    const promises = live(events).filter(e => e.type === 'promise');
    rows.forEach(r => {
      const mine = latest(promises.filter(p => p.item === r.id));
      if (mine) r.promise = { date: E.fromKey(mine.date), amount: +mine.amount || 0, logged: true };
      else if (r.samplePromise) r.promise = { date: E.addDays(t, -r.samplePromise.daysAgo), amount: r.samplePromise.amount, logged: false };
      r.broken = !!r.promise && r.promise.date < t;   // the date has passed and the item is still open
      r.flag = r.broken ? 'promise' : r.base;
      r.name = customerName(r.customer);
    });
    return rows;
  }

  function receivables(events) {
    const rows = openItems(events);
    const flags = FLAGS.map(f => {
      const items = rows.filter(r => r.flag === f.id);
      return Object.assign({}, f, { items, total: items.reduce((a, r) => a + r.amount, 0) });
    });
    return { flags, rows };
  }

  /* The plain aging report: the same open items, bucketed by age only. */
  const BUCKETS = [['1 to 30', 0, 30], ['31 to 60', 31, 60], ['61 to 90', 61, 90], ['Over 90', 91, Infinity]];
  function aging(events) {
    const rows = openItems(events), byCust = new Map();
    rows.forEach(r => {
      if (!byCust.has(r.customer)) byCust.set(r.customer, { name: r.name, b: [0, 0, 0, 0], total: 0 });
      const c = byCust.get(r.customer), i = BUCKETS.findIndex(([, lo, hi]) => r.age >= lo && r.age <= hi);
      c.b[i] += r.amount; c.total += r.amount;
    });
    const list = Array.from(byCust.values()).sort((a, b) => b.total - a.total);
    const totals = [0, 1, 2, 3].map(i => list.reduce((a, c) => a + c.b[i], 0));
    return { buckets: BUCKETS.map(b => b[0]), list, totals, total: totals.reduce((a, n) => a + n, 0) };
  }

  /* ---------- how each event reads in the live feed ---------- */
  function describe(e) {
    const u = e.unit ? unitLabel(e.unit) : '';
    switch (e.type) {
      case 'pickup':
        return e.final
          ? { source: 'Accounting system: invoice', tone: 'info', title: 'Final invoice posted: ' + u, detail: customerName(e.customer) + ' · ' + (e.invoice || '') + ' · the unit counts as back in the yard' }
          : { source: 'Billing inbox: driver ticket', tone: 'ok', title: 'Pick-up ticket: ' + u, detail: 'Back in the yard today. The website shows it as free.' };
      case 'dropoff':
        return { source: 'Billing inbox: driver ticket', tone: 'ok', title: 'Drop-off ticket: ' + u, detail: 'On site. The rental charge can start.' };
      case 'fuel':
        return { source: 'Billing inbox: driver ticket', tone: 'warn', title: 'Fuel ticket: ' + u, detail: E.fmt.gal(+e.gallons || 0) + ' delivered. Added to the billing brief.' };
      case 'rental': {
        const span = E.fmt.short(E.fromKey(e.start)) + ' to ' + E.fmt.short(E.fromKey(e.end));
        const web = /website/i.test(e.source || '') || e.source === 'Booking';
        return { source: web ? 'Website booking' : e.source === 'Phone booking' ? 'Booking desk' : sourceLabel(e.source), tone: web ? 'gold' : 'info',
          title: (web ? 'Website booking: ' : 'Phone booking: ') + u, detail: customerName(e.customer) + ' · ' + span + (e.borough ? ' · ' + e.borough : '') };
      }
      case 'hold':
        return { source: 'Website booking', tone: 'gold', title: 'Unit held online: ' + u, detail: 'Held while a customer finishes booking.' };
      case 'service':
        return { source: 'Yard: service hold', tone: 'bad', title: 'Into service: ' + u, detail: (e.reason || 'Service') + ' · until ' + E.fmt.short(E.fromKey(e.end)) };
      case 'billing':
        return { source: 'Billing brief', tone: 'ok', title: e.action === 'addfuel' ? 'Fuel lines added to ' + (e.label || 'a monthly invoice') : 'Approved: ' + (e.label || e.group),
          detail: e.action === 'addfuel' ? 'Ready for approval.' : (e.keys || []).length + ' item(s) would post to the accounting system.' };
      case 'promise':
        return { source: 'Collections', tone: 'info', title: 'Promise logged: ' + customerName(e.customer), detail: E.fmt.money(+e.amount || 0) + ' by ' + E.fmt.short(E.fromKey(e.date)) };
      default:
        return { source: 'Website', tone: '', title: 'Website activity: ' + String(e.type || 'event'), detail: u };
    }
  }

  PR.office = {
    unitOf, modelOfUnit, unitLabel, customerOf, customerName, takesFuel, sourceLabel, statusSource, currentRental,
    fuelTickets, charges, monthlyInvoices, addOns, receivables, aging, describe, lastPost, FLAGS
  };
})();
