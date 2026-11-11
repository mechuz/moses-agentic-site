/* Power Rentals demo · store and availability engine.

   Architecture (the same shape a production build would have):
     data.js     the fleet: categories, models, numbered units (SAMPLE)
     store       an event log. Every fact about a unit is an event:
                   rental     from a rental invoice, a website booking or a phone booking
                   service    a service hold
                   hold       a 30-minute hold while a customer books
                   pickup     a driver's pick-up ticket (the unit is back in the yard)
                   dropoff    a driver's drop-off ticket (the unit is on site)
                   fuel       a driver's fuel ticket (gallons delivered to a unit)
                   extend     a customer extends a rental (rental id, new end date)
                 Customer-side requests (no effect on availability until the office acts on them):
                   pickupRequest, fuelOrder (source 'Fuel monitoring' when booked by the tank board; filled: true once delivered),
                   demoPayment, coiUpload, serviceVisit. Office actions: billing, promise.
                 In production these arrive from the billing inbox and the accounting system.
                 In the demo they live in this browser (localStorage) and sync across open tabs,
                 so booking in one tab updates the office view in another.
     engine      pure functions that turn events into answers: what is in the yard,
                 what is free for a date range, when the next unit comes back, opening hours. */
window.PR = window.PR || {};
(function () {
  'use strict';
  const C = PR.config, D = PR.data;

  /* ---------- dates (local calendar days) ---------- */
  const DAY = 864e5;
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const today = () => startOfDay(new Date());
  const addDays = (d, n) => { const x = startOfDay(d); x.setDate(x.getDate() + n); return x; };
  const diffDays = (a, b) => Math.round((startOfDay(a) - startOfDay(b)) / DAY);
  const key = d => { const x = startOfDay(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
  const fromKey = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const fmt = {
    long: d => DOW[d.getDay()] + ', ' + MON[d.getMonth()] + ' ' + d.getDate(),
    short: d => DOW[d.getDay()].slice(0, 3) + ' ' + MON[d.getMonth()].slice(0, 3) + ' ' + d.getDate(),
    rel: d => { const n = diffDays(d, today()); if (n === 0) return 'today'; if (n === 1) return 'tomorrow'; if (n > 1 && n < 7) return DOW[d.getDay()]; return fmt.short(d); },
    money: n => '$' + Math.round(n).toLocaleString('en-US'),
    gal: n => (Math.round(n * 10) / 10).toLocaleString('en-US') + ' gal'
  };

  /* ---------- store: an event log in localStorage, synced across tabs ---------- */
  const listeners = new Set();
  function read() {
    try { const raw = localStorage.getItem(C.storageKey); return raw ? JSON.parse(raw) : []; } catch (e) { return memory; }
  }
  let memory = [];
  function write(list) {
    memory = list;
    try { localStorage.setItem(C.storageKey, JSON.stringify(list)); } catch (e) { /* private mode: keep in memory */ }
    listeners.forEach(fn => fn(list));
  }
  window.addEventListener('storage', e => { if (e.key === C.storageKey) listeners.forEach(fn => fn(read())); });
  const uid = p => p + '-' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);

  const store = {
    events: () => read(),
    add(ev) { const now = Date.now(); const list = read().filter(e => !(e.type === 'hold' && new Date(e.expires).getTime() < now)); ev.id = ev.id || uid(ev.type); ev.at = ev.at || new Date().toISOString(); list.push(ev); write(list); return ev; },
    update(id, patch) { write(read().map(e => e.id === id ? Object.assign({}, e, patch) : e)); },
    remove(id) { write(read().filter(e => e.id !== id)); },
    reset() { write([]); },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); }
  };

  /* ---------- SAMPLE baseline turned into dated events ---------- */
  function baseline() {
    const t = today(), ev = [];
    /* sample rentals never end on a day the office is closed */
    const openDay = d => { let x = d; while (!C.hours[x.getDay()]) x = addDays(x, 1); return x; };
    D.sample.rentals.forEach(([unit, s, e, cust, boro, source], i) =>
      ev.push({ id: 'base-r' + i, type: 'rental', unit, start: key(addDays(t, s)), end: key(e === 0 ? t : openDay(addDays(t, e))), customer: cust, borough: boro, source, sample: true }));
    D.sample.service.forEach(([unit, s, e, reason], i) =>
      ev.push({ id: 'base-s' + i, type: 'service', unit, start: key(addDays(t, s)), end: key(addDays(t, e)), reason, source: 'Service hold', sample: true }));
    return ev;
  }
  const allEvents = () => baseline().concat(store.events());

  /* ---------- hours and booking rules ---------- */
  const hoursOn = d => C.hours[d.getDay()];
  const hours = {
    on: hoursOn,
    isDeliveryDay: d => !!hoursOn(d),
    isToConfirm: d => d.getDay() === 0 && C.sundayToConfirm,
    windows: d => !hoursOn(d) ? [] : (d.getDay() === 5 ? C.deliveryWindows.friday : C.deliveryWindows.weekday),
    /* Friday from 1pm and all of Saturday: customers can look, but booking reopens when the office opens */
    bookingPaused(now = new Date()) { const w = now.getDay(); return w === 6 || (w === 5 && now.getHours() >= 13); },
    status(now = new Date()) {
      const h = hoursOn(now), hr = now.getHours() + now.getMinutes() / 60;
      if (h && hr >= h[0] && hr < h[1]) return { open: true, label: 'Open now', detail: 'until ' + clock(h[1]) };
      let d = startOfDay(now); if (h && hr < h[0]) return { open: false, label: 'Opens at ' + clock(h[0]), detail: 'today' };
      for (let i = 1; i < 8; i++) { d = addDays(now, i); const hh = hoursOn(d); if (hh) return { open: false, label: 'Closed now', detail: 'opens ' + DOW[d.getDay()] + ' ' + clock(hh[0]) }; }
      return { open: false, label: 'Closed now', detail: '' };
    },
    sameDayOpen(now = new Date()) { return !!hoursOn(now) && now.getHours() < C.sameDayCutoffHour && !hours.bookingPaused(now); }
  };
  function clock(h) { const ap = h >= 12 ? 'pm' : 'am', hh = h % 12 || 12; return hh + ap; }

  /* ---------- availability ---------- */
  const modelById = id => D.models.find(m => m.id === id);
  const unitsOf = modelId => D.units.filter(u => u.model === modelId);
  const catOf = modelId => modelById(modelId).cat;

  /* A unit's busy intervals, with pick-up tickets closing rentals early. Each interval: {from, to (inclusive), kind, ev} */
  function intervals(unitNo, events = allEvents()) {
    const now = new Date(), out = [];
    const pickups = events.filter(e => e.type === 'pickup' && e.unit === unitNo);
    events.forEach(e => {
      if (e.unit !== unitNo) return;
      if (e.type === 'rental' || e.type === 'service') {
        let to = fromKey(e.end);
        /* an extension (type 'extend', rental: id, end: key) moves the end date out */
        events.filter(x => x.type === 'extend' && x.rental === e.id).forEach(x => { const t = fromKey(x.end); if (t > to) to = t; });
        const p = pickups.find(p => p.rental === e.id || (!p.rental && fromKey(p.day) >= fromKey(e.start) && fromKey(p.day) <= to));
        if (p) to = addDays(fromKey(p.day), -1);   // back in the yard on the pick-up day
        if (to >= fromKey(e.start)) out.push({ from: fromKey(e.start), to, kind: e.type, ev: e, picked: !!p });
      }
      if (e.type === 'hold' && new Date(e.expires) > now) out.push({ from: fromKey(e.start), to: addDays(fromKey(e.start), e.days - 1), kind: 'hold', ev: e });
    });
    return out;
  }

  function statusOn(unitNo, day = today(), events = allEvents()) {
    const d = startOfDay(day);
    const iv = intervals(unitNo, events);
    const cur = iv.find(i => d >= i.from && d <= i.to);
    if (cur && cur.kind === 'service') return { state: 'service', label: 'In service', until: cur.to, source: 'Service hold', ev: cur.ev };
    if (cur && cur.kind === 'hold') return { state: 'held', label: 'Held', until: cur.to, source: 'Website hold', ev: cur.ev };
    if (cur && cur.kind === 'rental') {
      if (diffDays(cur.to, d) === 0 && hours.isDeliveryDay(d)) return { state: 'returning', label: 'Coming back today', until: cur.to, source: cur.ev.source, ev: cur.ev };
      return { state: 'out', label: 'On rent', until: cur.to, source: cur.ev.source, ev: cur.ev };
    }
    const lastPick = events.filter(e => e.type === 'pickup' && e.unit === unitNo).sort((a, b) => a.at < b.at ? 1 : -1)[0];
    return { state: 'yard', label: 'In the yard', source: lastPick ? 'Pick-up ticket' : 'Yard count', ev: lastPick || null };
  }

  /* Units of a model free for every day in [start, start+days) */
  function freeUnits(modelId, start, days, events = allEvents(), ignoreHoldId) {
    const s = startOfDay(start), e = addDays(s, days - 1);
    return unitsOf(modelId).filter(u => !intervals(u.no, events).some(i => !(i.ev && i.ev.id === ignoreHoldId) && i.from <= e && i.to >= s));
  }

  function nextBack(modelId, day = today(), events = allEvents()) {
    let best = null;
    unitsOf(modelId).forEach(u => intervals(u.no, events).forEach(i => {
      if (i.kind !== 'hold' && i.to >= startOfDay(day)) { let back = addDays(i.to, 1); while (!hours.isDeliveryDay(back)) back = addDays(back, 1); if (!best || back < best) best = back; }
    }));
    return best;
  }

  function modelSummary(modelId, day = today(), events = allEvents()) {
    const us = unitsOf(modelId), free = freeUnits(modelId, day, 1, events);
    const level = free.length === 0 ? 'out' : (free.length === 1 && us.length > 1 ? 'limited' : 'ok');
    return { total: us.length, free: free.length, level, nextBack: free.length < us.length ? nextBack(modelId, day, events) : null };
  }
  function categorySummary(catId, day = today(), events = allEvents()) {
    const ms = D.models.filter(m => m.cat === catId).map(m => modelSummary(m.id, day, events));
    const total = ms.reduce((a, m) => a + m.total, 0), free = ms.reduce((a, m) => a + m.free, 0);
    const backs = ms.map(m => m.nextBack).filter(Boolean).sort((a, b) => a - b);
    return { total, free, level: free === 0 ? 'out' : free <= Math.max(1, Math.floor(total / 4)) ? 'limited' : 'ok', nextBack: backs[0] || null };
  }

  /* For a booking calendar: free count when starting on each day of a month */
  function monthAvailability(modelId, year, month, days, events = allEvents()) {
    const out = [], first = new Date(year, month, 1), n = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= n; i++) {
      const d = new Date(year, month, i);
      const past = d < today();
      const free = past ? 0 : freeUnits(modelId, d, days, events).length;
      out.push({ day: d, past, delivery: hours.isDeliveryDay(d), confirm: hours.isToConfirm(d), free });
    }
    return { first, days: out };
  }

  /* First start date on or after `from` with a free unit, on a delivery day */
  function nearestStart(modelId, from, days, events = allEvents()) {
    for (let i = 0; i < 90; i++) { const d = addDays(from, i); if (hours.isDeliveryDay(d) && freeUnits(modelId, d, days, events).length) return d; }
    return null;
  }

  PR.store = store;
  PR.engine = {
    DAY, today, addDays, diffDays, key, fromKey, startOfDay, fmt, DOW, MON,
    events: allEvents, baseline, hours, clock,
    modelById, unitsOf, catOf, intervals, statusOn, freeUnits, nextBack, modelSummary, categorySummary, monthAvailability, nearestStart
  };
})();
