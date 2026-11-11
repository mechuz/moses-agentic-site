/* Power Rentals demo · helpers shared by the equipment catalog and the booking flow.
   Keeps the safety and fuel wording, unit status wording and rental lengths in one place,
   so the catalog, the booking flow and any later page say exactly the same thing.
   Load after ui.js. */
window.PR = window.PR || {};
(function () {
  'use strict';
  const E = PR.engine, { h, icon } = PR.ui;

  /* ---------- fixed copy ---------- */
  const COPY = {
    fdny: 'Heaters used on construction sites must be supervised by a Fire Department certificate holder.',
    diesel: 'Fuel monitoring comes with this unit. We see the tank level and bring diesel before it runs low. Diesel delivery is free.',
    rate: 'From your rate card'
  };

  /* Rental lengths offered on the booking page (days). "Longer" books eight weeks; the desk adjusts the end date. */
  const LENGTHS = [
    { id: 'day',   label: 'A day',      days: 1 },
    { id: 'week',  label: 'A week',     days: 7 },
    { id: 'month', label: 'Four weeks', days: 28 },
    { id: 'long',  label: 'Longer',     days: 56, hint: '8 weeks to start' }
  ];

  const FUEL_LABEL = { diesel: 'Diesel', fueled: 'Diesel-fired', electric: 'Electric' };

  /* ---------- small builders ---------- */
  /* A note box for a model: the Fire Department notice for fueled heaters, fuel monitoring for diesel units. */
  function fuelNote(model, opts = {}) {
    if (model.fuel === 'fueled') return h('p.note.note-warn', { role: opts.role || null }, icon('heat'), h('span', COPY.fdny));
    if (model.fuel === 'diesel') return h('p.note.note-info', icon('fuel'), h('span', COPY.diesel));
    return null;
  }

  /* The dashed "fill" box that marks a value Power Rentals must supply. */
  const fill = (text = COPY.rate) => h('span.fill', text);

  /* Plain wording for one unit on one day, from PR.engine.statusOn(). Returns {state, text, source}. */
  function unitStatus(unitNo, day, events) {
    const d = E.startOfDay(day || E.today()), isToday = E.diffDays(d, E.today()) === 0;
    const st = E.statusOn(unitNo, d, events);
    let text;
    switch (st.state) {
      case 'out':       text = 'On rent until ' + E.fmt.short(st.until); break;
      case 'returning': text = isToday ? 'Coming back today' : 'Coming back ' + E.fmt.short(d); break;
      case 'service':   text = 'In service until ' + E.fmt.short(st.until); break;
      case 'held':      text = 'Held for a booking'; break;
      default:          text = isToday ? 'In the yard' : 'Free that day';
    }
    return { state: st.state, text, source: st.source };
  }

  /* A short, readable reservation number from a store event id, for example PR-1116-K4Q. */
  function reservationNo(ev) {
    const d = E.fromKey(ev.start);
    const tail = String(ev.id || '').replace(/[^a-z0-9]/gi, '').slice(-3).toUpperCase();
    return 'PR-' + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '-' + tail;
  }

  /* Next Monday after today (never today), the default start for a booking. */
  function nextMonday() {
    const t = E.today(), add = ((8 - t.getDay()) % 7) || 7;
    return E.addDays(t, add);
  }

  /* Read a YYYY-MM-DD string safely; null when malformed. */
  function parseKey(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return null;
    const d = E.fromKey(k);
    return isNaN(d) ? null : d;
  }

  PR.bookingLib = { COPY, LENGTHS, FUEL_LABEL, fuelNote, fill, unitStatus, reservationNo, nextMonday, parseKey };
})();
