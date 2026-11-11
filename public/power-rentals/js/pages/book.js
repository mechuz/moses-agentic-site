/* Booking flow: four steps (equipment, dates, site and delivery, review and book) over the live store.

   How it fits together
     state        one object holds every choice; render functions read it, event handlers change it.
     availability always computed from PR.engine with this page's own hold left out (others()),
                  so our hold never blocks our own booking but does block everyone else's.
     hold         placed when the visitor reaches step 4, kept while nothing that matters changes,
                  released as soon as the equipment or the dates change, when it runs out, or on leaving.
     live         PR.store.subscribe() repaints availability when anything changes, in this tab or another
                  (an office tab marking a pick-up frees a unit here within a moment).
     paused       Friday from 1pm and Saturday (PR.engine.hours.bookingPaused): everything works except
                  the final button, which is disabled. No hold is placed while paused. */
(function () {
  'use strict';
  const { h, icon, availLine, $ } = PR.ui, E = PR.engine, D = PR.data, C = PR.config, L = PR.bookingLib;

  const STEPS = ['Equipment', 'Dates', 'Site and delivery', 'Review and book'];
  const MAX_MONTHS_AHEAD = 5;
  const FUEL_CHOICES = [
    { id: 'deliver', label: 'Watch the tank and deliver diesel before it runs low', tag: 'Free', saved: 'Fuel monitoring and diesel delivery' },
    { id: 'self',    label: 'Watch the tank; we will fuel it ourselves',             tag: '',     saved: 'Fuel monitoring only' }
  ];

  /* ---------- state ---------- */
  const fresh = () => ({
    step: 1, reached: 1,
    cat: 'gen', model: 'g175', start: L.nextMonday(), len: 'week',
    view: null, focusKey: null,
    address: '', borough: 'Brooklyn', window: '', contact: '', mobile: '', fuel: 'deliver', coi: '', fdny: false,
    hold: null, holdNote: '', booked: null
  });
  let state = fresh();

  const days = () => L.LENGTHS.find(l => l.id === state.len).days;
  const model = () => E.modelById(state.model);
  const endDate = () => E.addDays(state.start, days() - 1);
  const paused = () => E.hours.bookingPaused();
  const monthStart = d => new Date(d.getFullYear(), d.getMonth(), 1);
  const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, 1);
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many);

  /* Every event except this page's own hold. */
  function others() { const id = state.hold && state.hold.id; return E.events().filter(e => e.id !== id); }
  const freeForSelection = () => E.freeUnits(state.model, state.start, days(), others());
  function bestModelIn(catId) {
    const ms = D.models.filter(m => m.cat === catId), ev = others();
    return (ms.find(m => E.modelSummary(m.id, E.today(), ev).free > 0) || ms[0]).id;
  }

  /* ---------- URL parameters: ?cat=, ?model=, ?start=YYYY-MM-DD, ?len=day|week|month|long ----------
     Read when the script runs, before the passcode gate tidies the address bar. */
  (function readParams() {
    const q = new URLSearchParams(location.search);
    const m = E.modelById(q.get('model') || ''), cat = D.categories.find(c => c.id === q.get('cat'));
    if (m) { state.model = m.id; state.cat = m.cat; state.step = state.reached = 2; }
    else if (cat) { state.cat = cat.id; state.model = bestModelIn(cat.id); }
    const s = L.parseKey(q.get('start'));
    if (s && s >= E.today() && E.hours.isDeliveryDay(s)) state.start = s;
    if (L.LENGTHS.some(l => l.id === q.get('len'))) state.len = q.get('len');
  })();

  /* ---------- hold ---------- */
  const holdInStore = () => state.hold && PR.store.events().some(e => e.id === state.hold.id);
  const holdLive = () => holdInStore() && new Date(state.hold.expires) > new Date();
  const holdMatches = () => state.hold && state.hold.model === state.model && state.hold.start === E.key(state.start) && state.hold.days === days();

  function releaseHold(note) {
    if (!state.hold) return;
    const id = state.hold.id;
    state.hold = null; state.holdNote = note || '';
    PR.store.remove(id);
  }

  /* Place (or keep) a hold for the current selection. Returns true when a unit is held. */
  function ensureHold() {
    if (paused()) { releaseHold(); return false; }
    if (holdLive() && holdMatches()) return true;
    releaseHold();
    const free = freeForSelection();
    if (!free.length) { state.holdNote = 'taken'; return false; }
    state.holdNote = '';
    state.hold = PR.store.add({
      type: 'hold', unit: free[0].no, model: state.model, start: E.key(state.start), days: days(),
      expires: new Date(Date.now() + C.holdMinutes * 60000).toISOString()
    });
    return true;
  }

  /* Anything that changes what is held lets the old hold go straight away. */
  function selectionChanged() { if (state.hold) releaseHold(); }

  /* ---------- stepper and step switching ---------- */
  function renderStepper() {
    const ol = $('#stepper'); ol.textContent = '';
    STEPS.forEach((name, i) => {
      const n = i + 1, current = n === state.step && !state.booked, done = state.booked || (n < state.reached && n !== state.step);
      ol.appendChild(h('li', { class: (current ? 'current' : '') + (done ? ' done' : '') },
        h('button.st', {
          type: 'button', 'aria-current': current ? 'step' : null,
          disabled: n > state.reached || state.booked ? true : null,
          onclick: () => goTo(n)
        },
        h('span.st-n', { 'aria-hidden': 'true' }, done ? icon('check') : String(n)),
        h('span.st-t', h('span.sr', 'Step ' + n + ': '), name, done ? h('span.sr', ' (done)') : null))));
    });
  }

  function goTo(n) {
    if (state.booked) return;
    if (n > state.step) {
      for (let s = state.step; s < n; s++) {
        if (!validate(s)) { if (s !== state.step) show(s); return; }
      }
    }
    show(n);
  }

  function show(n) {
    clearSummary();
    state.step = n;
    state.reached = Math.max(state.reached, n);
    if (n === 4) ensureHold();
    renderAll();
    document.querySelectorAll('.step').forEach(s => { s.hidden = Number(s.dataset.step) !== n; });
    $('#stepLive').textContent = 'Step ' + n + ' of 4: ' + STEPS[n - 1];
    const head = $('#s' + n + '-h');
    const top = $('#stepper').getBoundingClientRect().top;
    if (top < 0 || top > innerHeight * 0.6) $('#stepper').scrollIntoView({ block: 'start', behavior: smooth() });
    head.focus({ preventScroll: true });
  }

  const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';

  /* ---------- step 1: equipment ---------- */
  function buildCatChips() {
    const wrap = $('#catChips'); wrap.textContent = '';
    D.categories.forEach(c => wrap.appendChild(h('button.chip', {
      type: 'button', 'aria-pressed': String(c.id === state.cat), 'data-cat': c.id,
      onclick: () => {
        if (state.cat === c.id) return;
        state.cat = c.id; state.model = bestModelIn(c.id); selectionChanged();
        buildCatChips(); buildModelOpts(); renderAll();
      }
    }, icon(c.icon, 'ico chip-ico'), c.name)));
  }

  function buildModelOpts() {
    const wrap = $('#modelOpts'); wrap.textContent = '';
    $('#modelLegend').textContent = D.categories.find(c => c.id === state.cat).name + ': size and model, with the count in the yard today';
    D.models.filter(m => m.cat === state.cat).forEach(m => {
      const id = 'm-' + m.id;
      const input = h('input', { type: 'radio', name: 'model', id, value: m.id, checked: m.id === state.model ? true : null });
      input.addEventListener('change', () => { state.model = m.id; state.focusKey = null; selectionChanged(); renderAll(); });
      wrap.appendChild(h('label.opt', { for: id }, input,
        h('span.opt-body',
          h('span.opt-radio', { 'aria-hidden': 'true' }),
          h('span.opt-main', h('b.opt-name', m.name), h('span.opt-avail', { 'data-model': m.id })),
          h('span.opt-tag', L.FUEL_LABEL[m.fuel] || ''))));
    });
    paintModelOpts();
  }

  /* Live counts only: leaves the radios (and focus) alone. */
  function paintModelOpts() {
    const ev = others();
    document.querySelectorAll('.opt-avail').forEach(el => {
      const sum = E.modelSummary(el.dataset.model, E.today(), ev);
      el.replaceChildren(availLine(sum));
    });
    $('#s1Note').replaceChildren(L.fuelNote(model()) || '');
  }

  /* ---------- step 2: dates ---------- */
  function buildLengths() {
    const wrap = $('#lenChips'); wrap.textContent = '';
    L.LENGTHS.forEach(l => {
      const id = 'len-' + l.id;
      const input = h('input', { type: 'radio', name: 'len', id, value: l.id, checked: l.id === state.len ? true : null });
      input.addEventListener('change', () => { state.len = l.id; selectionChanged(); renderAll(); });
      wrap.appendChild(h('label.rchip', { for: id }, input, h('span', l.label, l.hint ? h('small', l.hint) : null)));
    });
  }

  function dayInfo(info, total) {
    const d = info.day, fri = d.getDay() === 5;
    if (info.past) return { cls: 'past', lab: '', say: 'past', pick: false };
    if (!info.delivery) return info.confirm
      ? { cls: 'closed', lab: 'Confirm', say: 'delivery to confirm with the desk', pick: false }
      : { cls: 'closed', lab: 'Closed', say: 'closed, no delivery', pick: false };
    const n = info.free;
    const base = n === 0 ? { cls: 'out', lab: 'Booked', say: 'booked out for ' + plural(days(), 'day', 'days') }
      : n === 1 && total > 1 ? { cls: 'limited', lab: '1 left', say: '1 left for ' + plural(days(), 'day', 'days') }
      : { cls: 'ok', lab: n + ' free', say: n + ' free for ' + plural(days(), 'day', 'days') };
    if (fri) { base.lab = 'by 1pm'; base.say = 'delivery by 1pm, ' + base.say; }
    base.pick = true;
    return base;
  }

  function renderCalendar() {
    const wrap = $('#calendar'), hadFocus = wrap.contains(document.activeElement);
    const minView = monthStart(E.today()), maxView = addMonths(minView, MAX_MONTHS_AHEAD - 1);
    if (!state.view) state.view = monthStart(state.start);
    if (state.view < minView) state.view = minView;
    if (state.view > maxView) state.view = maxView;
    $('#calPrev').disabled = state.view <= minView;
    $('#calNext').disabled = state.view >= maxView;

    const ev = others(), total = E.unitsOf(state.model).length, len = days();
    const s = state.start, e = endDate();
    wrap.textContent = '';
    for (let i = 0; i < 2; i++) {
      const first = addMonths(state.view, i), ma = E.monthAvailability(state.model, first.getFullYear(), first.getMonth(), len, ev);
      const titleId = 'cal-t-' + i;
      const rows = []; let row = [];
      for (let b = 0; b < first.getDay(); b++) row.push(h('td.blank', { role: 'gridcell' }));
      ma.days.forEach(info => {
        const d = info.day, k = E.key(d), di = dayInfo(info, total);
        const sel = E.diffDays(d, s) === 0, inRange = d >= s && d <= e;
        const label = E.fmt.long(d) + ', ' + di.say + (sel ? ', chosen start' : '');
        const cell = info.past
          ? h('span.day.past', { 'aria-hidden': 'true' }, h('span.dn', String(d.getDate())))
          : h('button.day.' + di.cls, {
              type: 'button', tabindex: '-1', 'data-key': k, 'aria-label': label,
              'aria-disabled': di.pick ? null : 'true', 'aria-pressed': sel ? 'true' : 'false'
            }, h('span.dn', String(d.getDate())), h('span.dl', di.lab));
        row.push(h('td', { role: 'gridcell', class: (inRange ? 'inrange' : '') + (sel ? ' rs' : '') + (E.diffDays(d, e) === 0 ? ' re' : ''), 'aria-selected': sel ? 'true' : null }, cell));
        if (row.length === 7) { rows.push(h('tr', row)); row = []; }
      });
      if (row.length) { while (row.length < 7) row.push(h('td.blank', { role: 'gridcell' })); rows.push(h('tr', row)); }
      wrap.appendChild(h('div.cal-month',
        h('h3.cal-title#' + titleId, E.MON[first.getMonth()] + ' ' + first.getFullYear()),
        h('table.cal', { role: 'grid', 'aria-labelledby': titleId + ' calLabel' },
          h('thead', h('tr', E.DOW.map(n => h('th', { scope: 'col', abbr: n }, n.slice(0, 2))))),
          h('tbody', rows))));
    }
    setRoving(hadFocus);
  }

  /* One day button is tabbable at a time (roving tabindex). */
  function setRoving(focusIt) {
    const btns = Array.from(document.querySelectorAll('#calendar button.day'));
    if (!btns.length) return;
    const pick = btns.find(b => b.dataset.key === state.focusKey) || btns.find(b => b.dataset.key === E.key(state.start))
      || btns.find(b => !b.hasAttribute('aria-disabled')) || btns[0];
    btns.forEach(b => { b.tabIndex = b === pick ? 0 : -1; });
    state.focusKey = pick.dataset.key;
    if (focusIt) pick.focus();
  }

  function moveFocus(target) {
    const min = E.today(), max = E.addDays(addMonths(monthStart(min), MAX_MONTHS_AHEAD + 1), -1);
    if (target < min) target = min;
    if (target > max) target = max;
    const lastVisible = E.addDays(addMonths(state.view, 2), -1);
    if (target < state.view) state.view = monthStart(target);
    else if (target > lastVisible) state.view = addMonths(monthStart(target), -1);
    state.focusKey = E.key(target);
    renderCalendar();
    const btn = document.querySelector('#calendar button[data-key="' + state.focusKey + '"]');
    if (btn) btn.focus();
  }

  function onCalendarKey(e) {
    const btn = e.target.closest('button.day'); if (!btn) return;
    const d = E.fromKey(btn.dataset.key);
    const moves = {
      ArrowLeft: () => E.addDays(d, -1), ArrowRight: () => E.addDays(d, 1),
      ArrowUp: () => E.addDays(d, -7), ArrowDown: () => E.addDays(d, 7),
      Home: () => E.addDays(d, -d.getDay()), End: () => E.addDays(d, 6 - d.getDay()),
      PageUp: () => sameDayInMonth(d, -1), PageDown: () => sameDayInMonth(d, 1)
    };
    if (!moves[e.key]) return;
    e.preventDefault();
    moveFocus(moves[e.key]());
  }
  function sameDayInMonth(d, n) {
    const m = addMonths(monthStart(d), n), last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate();
    return new Date(m.getFullYear(), m.getMonth(), Math.min(d.getDate(), last));
  }

  function onCalendarClick(e) {
    const btn = e.target.closest('button.day'); if (!btn) return;
    const d = E.fromKey(btn.dataset.key);
    state.focusKey = btn.dataset.key;
    if (btn.getAttribute('aria-disabled') === 'true') {
      $('#rangeBox').replaceChildren(h('p.msg.msg-warn', icon('clock'),
        h('span', E.fmt.long(d) + (E.hours.isToConfirm(d) ? ' is not open for online booking yet. Call the desk to confirm a Sunday delivery.' : ' has no deliveries. Pick another day.'))));
      setRoving(true);
      return;
    }
    pickStart(d);
  }

  function pickStart(d) {
    state.start = d; state.focusKey = E.key(d);
    if (!E.hours.windows(d).includes(state.window)) state.window = '';
    selectionChanged();
    renderAll();
    const btn = document.querySelector('#calendar button[data-key="' + state.focusKey + '"]');
    if (btn) btn.focus();
  }

  function renderRange() {
    const box = $('#rangeBox'), m = model(), free = freeForSelection(), total = E.unitsOf(m.id).length;
    const range = h('p.range-dates', h('b', E.fmt.long(state.start)), ' to ', h('b', E.fmt.long(endDate())), h('span.mute', ' · ' + plural(days(), 'day', 'days')));
    if (free.length) {
      box.replaceChildren(range, h('p.msg.msg-ok', icon('check'),
        h('span', plural(free.length, 'unit', 'units') + ' of ' + total + ' free for these dates. We assign one and hold it when you reach the last step.')));
    } else {
      const near = E.nearestStart(m.id, state.start, days(), others());
      box.replaceChildren(range, h('div.msg.msg-bad', icon('clock'), h('div',
        h('p', h('b', 'Every unit is booked for part of the ' + plural(days(), 'day', 'days') + ' from ' + E.fmt.long(state.start) + '.')),
        near
          ? h('button.btn.btn-dark.btn-sm.near', { type: 'button', onclick: () => { state.view = null; pickStart(near); $('#stepLive').textContent = 'Start moved to ' + E.fmt.long(near) + '. A unit is free.'; } },
              'Start ' + E.fmt.long(near) + ' instead')
          : h('p', 'Nothing frees up in the next 90 days. Call the desk and we will find one.'))));
    }
    if (E.diffDays(state.start, E.today()) === 0) box.appendChild(sameDayNote());
  }

  function sameDayNote() {
    return E.hours.sameDayOpen()
      ? h('p.msg.msg-ok', icon('truck'), h('span', 'Same-day delivery: book before ' + E.clock(C.sameDayCutoffHour) + ' and it goes out today.'))
      : h('p.msg.msg-warn', icon('truck'), h('span', 'Same-day delivery is for orders placed by ' + E.clock(C.sameDayCutoffHour) + '. The desk will confirm your delivery time.'));
  }

  /* ---------- step 3: site and delivery ---------- */
  function buildBoroughs() {
    const sel = $('#fBoro');
    C.business.boroughs.forEach(b => sel.appendChild(h('option', { value: b }, b)));
    sel.value = state.borough;
  }

  function renderStep3() {
    const wins = E.hours.windows(state.start), wrap = $('#winChips');
    wrap.textContent = '';
    $('#fWin-legend').textContent = 'Delivery window on ' + E.fmt.long(state.start);
    wins.forEach((w, i) => {
      const id = 'win-' + i;
      const input = h('input', { type: 'radio', name: 'window', id, value: w, checked: w === state.window ? true : null });
      input.addEventListener('change', () => { state.window = w; setErr('fWin', ''); renderSide(); });
      wrap.appendChild(h('label.rchip', { for: id }, input, h('span', w)));
    });
    $('#sameDay').replaceChildren(E.diffDays(state.start, E.today()) === 0 ? sameDayNote() : '');
    renderFuelBox();
  }

  function renderFuelBox() {
    const m = model(), box = $('#fuelBox');
    if (m.fuel === 'diesel') {
      box.replaceChildren(h('fieldset.opts.fuel-set',
        h('legend.label', 'Fuel monitoring and diesel delivery'),
        h('p.small.mute', 'Fuel monitoring comes with every diesel unit: we see the tank level from the office.'),
        h('div.fuel-opts', FUEL_CHOICES.map(f => {
          const id = 'fuel-' + f.id;
          const input = h('input', { type: 'radio', name: 'fuel', id, value: f.id, checked: f.id === state.fuel ? true : null });
          input.addEventListener('change', () => { state.fuel = f.id; renderSide(); });
          return h('label.opt.opt-sm', { for: id }, input, h('span.opt-body', h('span.opt-radio', { 'aria-hidden': 'true' }), h('span.opt-main', h('b.opt-name', f.label)), f.tag ? h('span.opt-tag.free', f.tag) : h('span')));
        }))));
    } else if (m.fuel === 'fueled') {
      const cb = h('input#fFdny', { type: 'checkbox', checked: state.fdny ? true : null, 'aria-describedby': 'fFdny-err' });
      cb.addEventListener('change', () => { state.fdny = cb.checked; if (cb.checked) setErr('fFdny', ''); });
      box.replaceChildren(h('div.fdny', L.fuelNote(m, { role: 'note' }),
        h('div.check', cb, h('label', { for: 'fFdny' }, 'I have read this. If the heater is used on a construction site, a Fire Department certificate holder will supervise it.')),
        h('p.ferr#fFdny-err')));
    } else box.replaceChildren();
  }

  function bindStep3() {
    const bind = (id, key) => $('#' + id).addEventListener('input', e => { state[key] = e.target.value; setErr(id, ''); renderSide(); });
    bind('fAddr', 'address'); bind('fName', 'contact'); bind('fPhone', 'mobile');
    $('#fBoro').addEventListener('change', e => { state.borough = e.target.value; renderSide(); });
    $('#fCoi').addEventListener('change', e => {
      const f = e.target.files && e.target.files[0];
      state.coi = f ? f.name : '';
      $('#fCoi-hint').textContent = f ? 'Attached: ' + f.name + '. It stays in your browser; nothing is uploaded.' : 'Optional now. This preview reads only the file name; nothing is uploaded.';
    });
    $('#fillSample').addEventListener('click', () => {
      Object.assign(state, { address: '100 Sample Street (sample)', contact: 'Site lead (sample)', mobile: '(718) 555-0142' });
      if (!state.window) state.window = E.hours.windows(state.start)[0] || '';
      syncFields(); renderStep3(); renderSide();
      ['fAddr', 'fName', 'fPhone', 'fWin'].forEach(id => setErr(id, ''));
      $('#stepLive').textContent = 'Sample site details filled in.';
    });
  }

  function syncFields() {
    $('#fAddr').value = state.address; $('#fName').value = state.contact; $('#fPhone').value = state.mobile; $('#fBoro').value = state.borough;
  }

  /* ---------- validation ---------- */
  function setErr(id, msg) {
    const p = $('#' + id + '-err'), input = $('#' + id);
    if (p) p.textContent = msg || '';
    if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    if (id === 'fWin') $('#winChips').classList.toggle('invalid', !!msg);
  }
  const digits = s => (s || '').replace(/\D/g, '');

  function validate(step) {
    if (step === 1) return !!model();
    if (step === 2) {
      if (state.start < E.today() || !E.hours.isDeliveryDay(state.start)) { summary(['Pick a start date with deliveries.'], [['calendar', null]]); return false; }
      if (!freeForSelection().length) { summary(['No unit is free for these dates. Pick another start, or take the nearest date offered.'], [['calendar', null]]); return false; }
      return true;
    }
    if (step === 3) {
      const errs = [];
      const check = (id, ok, msg, focusId) => { setErr(id, ok ? '' : msg); if (!ok) errs.push([msg, focusId || id]); };
      check('fAddr', state.address.trim().length >= 5, 'Enter the street address where the unit goes.');
      check('fBoro', C.business.boroughs.includes(state.borough), 'Choose a borough.');
      check('fWin', E.hours.windows(state.start).includes(state.window), 'Choose a delivery window.', 'win-0');
      check('fName', state.contact.trim().length >= 2, 'Enter the name of the person who meets the truck.');
      const d = digits(state.mobile);
      check('fPhone', d.length === 10 || (d.length === 11 && d[0] === '1'), 'Enter a 10-digit mobile number, for example 718 555 0142.');
      if (model().fuel === 'fueled') check('fFdny', state.fdny, 'Confirm you have read the Fire Department note.');
      if (errs.length) { summary(errs.map(e => e[0]), errs.map(e => [e[1], e[0]])); return false; }
      return true;
    }
    return true;
  }

  function summary(msgs, targets) {
    const box = $('#errSummary');
    box.replaceChildren(h('p', h('b', msgs.length === 1 ? 'One thing to fix before you go on:' : msgs.length + ' things to fix before you go on:')),
      h('ul', targets.map(([id], i) => h('li', h('a', { href: '#' + id, onclick: ev => { ev.preventDefault(); const t = $('#' + id); if (t) { t.focus(); t.scrollIntoView({ block: 'center', behavior: smooth() }); } } }, msgs[i])))));
    box.hidden = false;
    box.focus();
  }
  function clearSummary() { const b = $('#errSummary'); b.hidden = true; b.textContent = ''; }

  /* ---------- step 4: review ---------- */
  const fuelSaved = () => model().fuel === 'diesel' ? FUEL_CHOICES.find(f => f.id === state.fuel).saved : (model().fuel === 'fueled' ? 'Fire Department supervision note confirmed' : 'Not needed');

  function renderReview() {
    const m = model(), rows = [
      [1, 'Equipment', [h('b', m.name), state.hold ? h('span.mute', ' · Unit ' + state.hold.unit) : null]],
      [2, 'Dates', [h('b', E.fmt.long(state.start)), ' to ', h('b', E.fmt.long(endDate())), h('span.mute', ' · ' + plural(days(), 'day', 'days'))]],
      [3, 'Delivery', [state.address || '–', ', ' + state.borough, h('br'), h('span.mute', state.window ? state.window + ' on ' + E.fmt.short(state.start) : 'No window chosen')]],
      [3, 'On-site contact', [state.contact || '–', state.mobile ? h('span.mute', ' · ', h('span.nowrap', state.mobile)) : null]],
      m.fuel !== 'none' && m.fuel !== 'electric' ? [3, 'Fuel', [fuelSaved()]] : null,
      [3, 'Certificate of insurance', [state.coi ? 'Attached: ' + state.coi : h('span.mute', 'Not attached. You can send it before delivery.')]]
    ].filter(Boolean);
    const diesel = m.fuel === 'diesel';
    $('#review').replaceChildren(
      h('dl.rv', rows.map(([step, k, v]) => h('div.rv-row', h('dt', k), h('dd', v),
        h('button.linkish.rv-edit', { type: 'button', onclick: () => show(step), 'aria-label': 'Change ' + k.toLowerCase() }, 'Change')))),
      h('div.costs',
        h('h3', 'Cost'),
        h('table.cost-t',
          h('tbody',
            h('tr', h('th', { scope: 'row' }, 'Rental, ' + plural(days(), 'day', 'days')), h('td', L.fill())),
            h('tr', h('th', { scope: 'row' }, 'Rental delivery and pick-up'), h('td', L.fill('confirm'))),
            diesel && state.fuel === 'deliver' ? h('tr', h('th', { scope: 'row' }, 'Diesel delivery'), h('td', h('b.free-t', 'Free'))) : null,
            h('tr.tot', h('th', { scope: 'row' }, 'Total'), h('td', L.fill())))),
        h('p.small.mute', 'Rates come from your rate card. Nothing is charged online; billing follows your account terms.')),
      L.fuelNote(m) || '');
  }

  function renderHold() {
    const box = $('#holdBox');
    if (paused()) {
      const st = E.hours.status();
      const when = (st.detail || '').replace(/^opens\s+/, '');
      box.replaceChildren(h('div.msg.msg-warn', icon('clock'), h('div',
        h('p', h('b', 'Booking reopens when the office opens' + (when ? ': ' + when : '') + '.')),
        h('p', 'Everything you entered stays on this page. Come back then and book in one tap, or call the desk.'))));
      return;
    }
    if (holdLive()) {
      box.replaceChildren(h('div.hold', h('div.hold-top', icon('clock'),
        h('p', h('b', 'Unit ' + state.hold.unit + ' is held for you'), h('span.mute', ' while you finish')),
        h('span.hold-time', { role: 'timer', 'aria-live': 'off', id: 'holdTime' }, '')),
        h('div.hold-bar', h('i#holdBar'))));
      tick();
      return;
    }
    const msg = state.holdNote === 'expired' ? 'Your hold ran out after ' + C.holdMinutes + ' minutes.'
      : state.holdNote === 'lost' ? 'Your hold was released.'
      : 'That unit was just taken.';
    const free = freeForSelection().length;
    box.replaceChildren(h('div.msg.msg-bad', icon('clock'), h('div',
      h('p', h('b', msg), free ? ' A unit is still free for these dates.' : ' Nothing is free for these dates now.'),
      free ? h('button.btn.btn-dark.btn-sm', { type: 'button', onclick: () => { ensureHold(); renderAll(); $('#stepLive').textContent = 'Unit held again.'; } }, 'Hold a unit again')
           : h('button.btn.btn-dark.btn-sm', { type: 'button', onclick: () => show(2) }, 'Pick other dates'))));
  }

  /* Countdown: updates the timer text and bar every second; releases the hold at zero. */
  let lastAnnounced = null;
  function tick() {
    if (!state.hold) return;
    const left = Math.max(0, new Date(state.hold.expires) - Date.now());
    if (left <= 0) { releaseHold('expired'); renderAll(); $('#stepLive').textContent = 'Your hold ran out.'; return; }
    const mm = Math.floor(left / 60000), ss = Math.floor(left / 1000) % 60, txt = mm + ':' + String(ss).padStart(2, '0');
    document.querySelectorAll('#holdTime, #sideHold').forEach(el => { el.textContent = txt; });
    const bar = $('#holdBar'); if (bar) bar.style.width = (left / (C.holdMinutes * 60000) * 100).toFixed(2) + '%';
    if ((mm === 5 || mm === 1) && ss === 0 && lastAnnounced !== mm) { lastAnnounced = mm; $('#stepLive').textContent = plural(mm, 'minute', 'minutes') + ' left on your hold.'; }
  }

  /* ---------- book now and confirmation ---------- */
  function book() {
    if (paused()) return;
    const m = model(), free = freeForSelection();
    let unit = holdLive() && holdMatches() && free.some(u => u.no === state.hold.unit) ? state.hold.unit : (free[0] && free[0].no);
    if (!unit) { state.holdNote = 'taken'; releaseHold('taken'); renderAll(); $('#holdBox').scrollIntoView({ block: 'center' }); return; }
    const id = 'rental-' + Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 5);
    const ref = L.reservationNo({ id, start: E.key(state.start) });
    const holdId = state.hold && state.hold.id;
    state.hold = null;
    const rental = PR.store.add({
      id, ref, type: 'rental', unit, model: m.id, start: E.key(state.start), end: E.key(endDate()), days: days(),
      customer: 'You (demo)', borough: state.borough, address: state.address.trim(), window: state.window,
      fuel: fuelSaved(), source: 'Website booking'
    });
    if (holdId) PR.store.remove(holdId);
    state.booked = rental;
    renderConfirm();
  }

  function renderConfirm() {
    const r = state.booked, m = model(), c = $('#confirm');
    const next = [
      ['chat', 'A text confirmation goes to ' + state.mobile + ' now.'],
      ['doc', 'Your rental agreement follows by text. Sign it on your phone before delivery.'],
      ['truck', 'Delivery on ' + E.fmt.long(state.start) + ', ' + state.window + ', to ' + state.address.trim() + ', ' + state.borough + '.']
    ];
    if (m.fuel === 'diesel') next.push(['fuel', state.fuel === 'deliver' ? 'Fuel monitoring starts with delivery. Diesel comes before the tank runs low, free.' : 'Fuel monitoring starts with delivery.']);
    c.replaceChildren(
      h('div.c-top', h('span.c-ico', icon('check')), h('div',
        h('p.eyebrow', 'Booked'),
        h('h2#c-h', { tabindex: '-1' }, 'Unit ' + r.unit + ' is yours.'),
        h('p.mute', m.name + ' · ' + E.fmt.short(state.start) + ' to ' + E.fmt.short(endDate())))),
      h('div.c-ref', h('span', 'Reservation number'), h('b', r.ref), h('span', 'Unit number'), h('b', 'Unit ' + r.unit)),
      h('h3', 'What happens next'),
      h('ol.c-next', next.map(([ic, t]) => h('li', icon(ic), h('span', t)))),
      h('div.c-actions',
        h('a.btn.btn-dark', { href: 'office.html' }, 'See it in the office view', icon('arrow')),
        h('button.btn.btn-line', { type: 'button', onclick: restart }, 'Make another booking')),
      h('p.small.mute', 'Preview: no text is sent and nothing is charged. The booking is saved in this browser, so the office view and the equipment page show it straight away.'));
    document.querySelectorAll('.step').forEach(s => { s.hidden = true; });
    $('#bkActions').hidden = true; c.hidden = false;
    renderStepper(); renderSide();
    $('#stepLive').textContent = 'Booked. Reservation ' + r.ref + ', unit ' + r.unit + '.';
    $('#stepper').scrollIntoView({ block: 'start', behavior: smooth() });
    $('#c-h').focus({ preventScroll: true });
  }

  function restart() {
    const keep = { borough: state.borough };
    state = Object.assign(fresh(), keep);
    $('#confirm').hidden = true; $('#bkActions').hidden = false;
    $('#fCoi').value = ''; $('#fCoi-hint').textContent = 'Optional now. This preview reads only the file name; nothing is uploaded.';
    syncFields(); buildCatChips(); buildModelOpts(); buildLengths();
    if (history.replaceState) history.replaceState(null, '', location.pathname);
    show(1);
  }

  /* ---------- sidebar summary ---------- */
  function renderSide() {
    const m = model(), total = E.unitsOf(m.id).length, free = state.booked ? null : freeForSelection().length;
    const level = free === 0 ? 'out' : free === 1 && total > 1 ? 'limited' : 'ok';
    const rows = [
      ['Equipment', [h('b', m.name),
        free === null ? h('span.avail.ok', h('i'), h('b', 'Booked'), ' Unit ' + state.booked.unit)
          : holdLive() ? h('span.avail.ok', h('i'), h('b', 'Held for you'), ' Unit ' + state.hold.unit)
          : h('span.avail.' + level, h('i'), h('b', free ? (level === 'limited' ? 'Limited' : 'Available') : 'All out'), ' ' + free + ' of ' + total + ' free for your dates')]],
      ['Dates', [h('b', E.fmt.short(state.start) + ' to ' + E.fmt.short(endDate())), h('span.mute', plural(days(), 'day', 'days'))]],
      ['Delivery', [h('b', state.borough), h('span.mute', state.window || (state.reached >= 3 ? 'Window not chosen yet' : 'Window in step 3'))]],
      ['Rate', [L.fill()]]
    ];
    const body = [h('dl.side-dl', rows.map(([k, v]) => h('div', h('dt', k), h('dd', v))))];
    if (state.booked) body.push(h('p.side-hold.ok', icon('check'), h('span', 'Reservation ', h('b', state.booked.ref))));
    else if (holdLive()) body.push(h('p.side-hold', icon('clock'), h('span', 'Unit ' + state.hold.unit + ' held · ', h('b#sideHold', ''), ' left')));
    else if (paused()) body.push(h('p.side-hold.warn', icon('clock'), h('span', 'Booking reopens when the office opens.')));
    else body.push(h('p.side-hold.idle', icon('clock'), h('span', 'A unit is held for ' + C.holdMinutes + ' minutes once you reach step 4.')));
    $('#sideBody').replaceChildren(...body);
    if (holdLive()) tick();
  }

  /* ---------- action bar ---------- */
  function renderActions() {
    const back = $('#btnBack'), next = $('#btnNext');
    back.hidden = state.step === 1;
    if (state.step < 4) {
      next.disabled = false;
      next.textContent = 'Next: ' + cap(STEPS[state.step].toLowerCase());
      next.append(icon('arrow'));
    } else if (paused()) {
      next.disabled = true; next.textContent = 'Booking reopens when the office opens';
    } else {
      next.disabled = false; next.textContent = 'Book now';
      next.prepend(icon('check'));
    }
  }

  /* ---------- paint everything for the current state ---------- */
  function renderAll() {
    renderStepper();
    paintModelOpts();
    if (state.step === 2) { renderCalendar(); renderRange(); }
    if (state.step === 3) renderStep3();
    if (state.step === 4) { renderHold(); renderReview(); }
    renderSide(); renderActions();
  }

  /* Store changes (this tab or another): repaint availability and check our hold still exists. */
  let queued = false;
  function onStore() {
    if (queued) return; queued = true;
    requestAnimationFrame(() => {
      queued = false;
      if (state.booked) { renderSide(); return; }
      if (state.hold && !holdInStore()) { state.hold = null; state.holdNote = 'lost'; }
      renderAll();
    });
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-icon]').forEach(el => el.appendChild(icon(el.dataset.icon)));
    buildCatChips(); buildModelOpts(); buildLengths(); buildBoroughs(); bindStep3(); syncFields();

    const cal = $('#calendar');
    cal.addEventListener('keydown', onCalendarKey);
    cal.addEventListener('click', onCalendarClick);
    cal.addEventListener('focusin', e => { const b = e.target.closest('button.day'); if (b) { state.focusKey = b.dataset.key; document.querySelectorAll('#calendar button.day').forEach(x => { x.tabIndex = x === b ? 0 : -1; }); } });
    $('#calPrev').addEventListener('click', () => { state.view = addMonths(state.view, -1); renderCalendar(); });
    $('#calNext').addEventListener('click', () => { state.view = addMonths(state.view, 1); renderCalendar(); });

    $('#btnBack').addEventListener('click', () => goTo(Math.max(1, state.step - 1)));
    $('#bookForm').addEventListener('submit', e => {
      e.preventDefault();
      if (state.booked) return;
      if (state.step < 4) goTo(state.step + 1); else book();
    });

    renderAll();
    document.querySelectorAll('.step').forEach(s => { s.hidden = Number(s.dataset.step) !== state.step; });

    PR.store.subscribe(onStore);
    setInterval(() => { if (state.hold) tick(); }, 1000);
    setInterval(onStore, 60000);   // hours, paused state and the "today" line move with the clock
    window.addEventListener('pagehide', () => { if (state.hold) releaseHold(); });
    window.addEventListener('pageshow', e => { if (e.persisted && state.step === 4 && !state.booked) { ensureHold(); renderAll(); } });
  });
})();
