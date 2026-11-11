/* Fuel delivery and monitoring.
   Three parts:
     1. A live SAMPLE monitoring board: four diesel generators the engine says are on rent right now,
        each with a tank gauge, hours left at the current burn and a status. "Simulate a day" burns a day
        of diesel, delivers top-ups that are due, and books new ones (a 'fuelOrder' store event) for any tank
        that would drop below 30% before the next delivery day. Bookings show in the account page and office view.
     2. The texts a customer would get, as a feed.
     3. A diesel delivery order form that respects the posted hours (at least a day ahead, on a delivery day). */
(function () {
  'use strict';
  const { h, icon, toast } = PR.ui, E = PR.engine, A = PR.acct, D = PR.data;
  const { fmt, key, fromKey, addDays, diffDays, today } = E;
  const $ = id => document.getElementById(id);
  const LINE = 0.30;                                   // book a top-up below this level
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- 1. the monitoring board ---------- */

  /* SAMPLE starting levels and running hours a day, one per board slot. */
  const START = [{ level: 0.72, hours: 10 }, { level: 0.46, hours: 8 }, { level: 0.88, hours: 12 }, { level: 0.41, hours: 16 }];
  const board = { day: 0, tanks: [], texts: [] };

  /* Four diesel generators on rent today, straight from the engine. */
  function pickUnits() {
    const events = E.events(), t = today();
    return D.units.filter(u => { const m = E.modelById(u.model); return m.cat === 'gen' && m.fuel === 'diesel'; })
      .map(u => ({ u, st: E.statusOn(u.no, t, events) }))
      .filter(x => x.st.state === 'out')
      .slice(0, 4)
      .map((x, i) => {
        const m = E.modelById(x.u.model), cust = D.customers.find(c => c.id === x.st.ev.customer);
        return { unit: x.u.no, model: m, tank: A.TANK[m.id], burn: A.BURN[m.id], borough: x.st.ev.borough, customer: cust ? cust.name : 'Customer', level: START[i].level, hoursPerDay: START[i].hours };
      });
  }
  const drainPerDay = t => (t.burn * t.hoursPerDay) / t.tank;
  const simDate = () => addDays(today(), board.day);
  /* The open top-up for a unit, if any (from this page, the account page or the office). */
  const openOrder = unit => E.events().filter(e => e.type === 'fuelOrder' && e.unit === unit && !e.filled).sort((a, b) => (a.day < b.day ? -1 : 1))[0] || null;

  function tankCard(t, i) {
    const order = openOrder(t.unit), pct = Math.round(t.level * 100), low = t.level < LINE;
    const gal = t.level * t.tank, hoursLeft = Math.floor(gal / t.burn);
    return h('article.card.tank-card' + (order ? '.booked' : '') + (low ? '.low' : ''), { 'aria-labelledby': 'tk-' + i },
      h('div.tk-head', h('div', h('h3#tk-' + i, 'Unit ' + t.unit), h('p.small.mute', t.model.short + ' generator')),
        h('span.badge.' + (order ? 'warn' : 'ok'), order ? 'Top-up booked' : 'OK')),
      h('div.tk-body',
        h('div.gauge', { role: 'meter', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(pct), 'aria-label': 'Unit ' + t.unit + ' tank level', 'aria-valuetext': pct + ' percent' },
          h('div.gauge-fill', { style: 'height:' + pct + '%' }, h('span.gauge-wave')),
          h('div.gauge-line', { title: 'Top-up line, 30 percent' }), h('span.gauge-pct', pct + '%')),
        h('dl.tk-stats',
          h('div', h('dt', 'In the tank'), h('dd', Math.round(gal) + ' of ' + t.tank + ' gallons')),
          h('div', h('dt', 'Time left'), h('dd', 'About ' + hoursLeft + ' hours')),
          h('div', h('dt', 'Burn'), h('dd', t.burn + ' gallons an hour, ' + t.hoursPerDay + ' hours a day')),
          h('div', h('dt', 'Site'), h('dd', t.borough + ' · ' + t.customer)))),
      h('p.tk-foot', order ? [icon('truck'), 'Truck booked for ' + fmt.long(fromKey(order.day))] : [icon('check'), 'Above the top-up line for the next delivery day']));
  }

  function paintBoard() {
    const wrap = $('tanks'); wrap.textContent = '';
    if (!board.tanks.length) { wrap.append(h('p.mute', 'No diesel generators are on rent in the sample right now.')); return; }
    board.tanks.forEach((t, i) => wrap.append(tankCard(t, i)));
    $('simDay').textContent = board.day === 0 ? 'Sample day: today, ' + fmt.long(today()) : 'Sample day ' + board.day + ': ' + fmt.long(simDate());
    paintTexts();
  }

  /* Animate the gauges to their new heights (the CSS transition does the motion; reduced motion skips it). */
  function animateTo(before) {
    paintBoard();
    if (reduceMotion()) return;
    document.querySelectorAll('#tanks .gauge-fill').forEach((el, i) => {
      if (before[i] == null) return;
      const target = el.style.height; el.style.transition = 'none'; el.style.height = Math.round(before[i] * 100) + '%';
      void el.offsetHeight;                              // commit the old height so the transition runs
      el.style.transition = ''; el.style.height = target;
    });
  }

  /* One simulated day: deliver what is due, burn a day of diesel, book top-ups that are needed. */
  function simulateDay() {
    const before = board.tanks.map(t => t.level);
    board.day += 1;
    const date = simDate(), dk = key(date), notes = [];
    board.tanks.forEach(t => {
      // 1. deliveries due on or before this day
      const order = openOrder(t.unit);
      if (order && order.day <= dk) {
        const gallons = Math.round((0.97 - t.level) * t.tank);
        t.level = 0.97;
        PR.store.update(order.id, { filled: true });
        PR.store.add({ type: 'fuel', unit: t.unit, gallons, day: dk, driver: 'Driver ' + (1 + t.unit % 3), source: 'Driver fuel ticket', sim: true });
        notes.push(text(t, 'Delivered ' + gallons + ' gallons to unit ' + t.unit + ' today. The tank is at 97%. A photo of the gauge is on your fuel log.'));
      }
      // 2. burn a day
      t.level = Math.max(0.02, t.level - drainPerDay(t));
      // 3. book a top-up if the tank would cross the line before the delivery day after next
      if (!openOrder(t.unit)) {
        const [next, after] = A.nextDeliveryDays(addDays(date, 1), 2);
        const projected = t.level - drainPerDay(t) * diffDays(after, date);
        if (t.level < LINE || projected < LINE) {
          PR.store.add({ type: 'fuelOrder', unit: t.unit, day: key(next), gallons: 'top up', source: 'Fuel monitoring', sim: true });
          notes.push(text(t, 'Unit ' + t.unit + ' at your ' + t.borough + ' site is at ' + Math.round(t.level * 100) + '%. A diesel top-up is booked for ' + fmt.long(next) + '. No need to call.'));
        }
      }
    });
    board.texts = notes.concat(board.texts).slice(0, 6);
    animateTo(before);
    toast(notes.length ? 'Day ' + board.day + ': ' + notes.length + (notes.length === 1 ? ' text sent' : ' texts sent') : 'Day ' + board.day + ': every tank is above the line');
  }
  const text = (t, body) => ({ to: t.customer, unit: t.unit, day: simDate(), body });

  function paintTexts() {
    const ul = $('texts'); ul.textContent = '';
    if (!board.texts.length) { ul.append(h('li.texts-empty', 'No texts yet. Simulate a day.')); return; }
    board.texts.forEach(m => ul.append(h('li.sms', h('p.sms-to', 'To ' + m.to + ' · ' + fmt.short(m.day)), h('p.sms-body', m.body))));
  }

  /* Back to today: starting levels, and the orders and tickets the simulation made are removed. */
  function resetBoard() {
    board.day = 0; board.texts = [];
    board.tanks.forEach((t, i) => { t.level = START[i].level; });
    PR.store.events().filter(e => e.sim).forEach(e => PR.store.remove(e.id));
    paintBoard(); toast('Board reset to today');
  }

  /* ---------- 3. the order form ---------- */
  const tomorrow = () => addDays(today(), 1);

  function setErr(id, msg) {
    const input = $(id), out = $(id + '-err');
    if (out) out.textContent = msg || '';
    if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    return !msg;
  }

  /* The date must be at least one day ahead and on a delivery day. */
  function dateError(v) {
    if (!v) return 'Pick a delivery date.';
    const d = fromKey(v);
    if (d < tomorrow()) return 'Pick a date at least one day ahead. The first one is ' + fmt.long(A.firstDeliveryDay(tomorrow())) + '.';
    if (!E.hours.isDeliveryDay(d)) return 'We do not deliver on ' + fmt.long(d) + '. The next delivery day is ' + fmt.long(A.firstDeliveryDay(d)) + '.';
    return '';
  }

  /* While booking is paused the form stays usable, but the button waits for the office to open. */
  function paintSubmit() {
    const btn = $('fSubmit'), paused = E.hours.bookingPaused();
    btn.disabled = paused;
    btn.textContent = paused ? 'Orders reopen when the office opens' : 'Order diesel';
  }

  function wireForm() {
    $('fBoroMount').replaceWith(A.boroughSelect('fBoro'));
    $('fBoro').setAttribute('aria-describedby', 'fBoro-err');
    const first = A.firstDeliveryDay(tomorrow());
    $('fDate').min = key(tomorrow());
    $('fDate').max = key(addDays(today(), 90));
    $('fDate').value = key(first);
    $('fDate-hint').textContent = 'At least one day ahead, on a delivery day. The next one is ' + fmt.long(first) + '.';

    const galRow = $('galRow');
    document.querySelectorAll('input[name="amount"]').forEach(r => r.addEventListener('change', () => {
      galRow.hidden = !$('fGalOpt').checked;
      if (!galRow.hidden) $('fGal').focus(); else setErr('fGal', '');
    }));
    $('fDate').addEventListener('change', () => setErr('fDate', dateError($('fDate').value)));
    $('fAddr').addEventListener('input', () => setErr('fAddr', ''));
    $('fBoro').addEventListener('change', () => setErr('fBoro', ''));

    $('fuelForm').addEventListener('submit', e => {
      e.preventDefault();
      if (E.hours.bookingPaused()) { paintSubmit(); return; }
      const addr = $('fAddr').value.trim(), boro = $('fBoro').value, date = $('fDate').value;
      const fill = $('fFill').checked, gal = parseInt($('fGal').value, 10);
      const ok = [
        setErr('fAddr', addr.length < 5 ? 'Enter the site address.' : ''),
        setErr('fBoro', boro ? '' : 'Choose a borough.'),
        setErr('fGal', !fill && !(gal >= 1 && gal <= 5000) ? 'Enter the gallons, 1 or more.' : ''),
        setErr('fDate', dateError(date))
      ];
      if (ok.includes(false)) { document.querySelector('#fuelForm [aria-invalid="true"]').focus(); return; }
      const ev = PR.store.add({ type: 'fuelOrder', day: date, gallons: fill ? 'fill the tank' : gal, address: addr, borough: boro, note: $('fNote').value.trim(), customer: A.YOU, source: 'Website' });
      showDone(ev);
    });
  }

  function showDone(ev) {
    const done = $('fDone'); done.textContent = '';
    done.append(
      h('p.done-ico', icon('check')),
      h('h3', 'Diesel order received'),
      h('dl.done-dl',
        h('div', h('dt', 'Amount'), h('dd', ev.gallons === 'fill the tank' ? 'Fill the tank' : ev.gallons + ' gallons')),
        h('div', h('dt', 'Delivery day'), h('dd', fmt.long(fromKey(ev.day)))),
        h('div', h('dt', 'Site'), h('dd', ev.address + ', ' + ev.borough)),
        h('div', h('dt', 'Delivery'), h('dd', 'Free'))),
      h('p.mute', 'It is on the route for that day. You get a text when the truck is on the way, and the gallons and a gauge photo after.'),
      h('button.btn.btn-line.btn-sm', { type: 'button', onclick: () => { done.hidden = true; $('fuelForm').hidden = false; $('fuelForm').reset(); wireDefaults(); $('fAddr').focus(); } }, 'Order more diesel'));
    $('fuelForm').hidden = true; done.hidden = false; done.focus();
    toast('Diesel ordered for ' + fmt.long(fromKey(ev.day)));
  }
  function wireDefaults() { $('galRow').hidden = true; $('fDate').value = key(A.firstDeliveryDay(tomorrow())); ['fAddr', 'fBoro', 'fGal', 'fDate'].forEach(id => setErr(id, '')); }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-icon]').forEach(el => el.appendChild(icon(el.dataset.icon)));
    board.tanks = pickUnits();
    paintBoard();
    $('simBtn').addEventListener('click', simulateDay);
    $('simReset').addEventListener('click', resetBoard);
    wireForm(); paintSubmit();
    setInterval(paintSubmit, 60000);
    PR.store.subscribe(paintBoard);     // a top-up booked in another tab shows here at once
  });
})();
