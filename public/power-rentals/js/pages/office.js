/* Office view: yard board, availability timeline, billing brief, receivables watch and live feed.
   Renders the engine (js/engine.js) and the office model (js/office-lib.js).
   Every panel repaints whenever the event log changes, in this tab or in another open tab. */
(function () {
  'use strict';
  const { $, h, toast } = PR.ui, E = PR.engine, D = PR.data, O = PR.office, C = PR.config;
  const money = E.fmt.money;

  /* View state that is not part of the event log. */
  const state = { yardCat: 'all', tlCat: 'all', search: '', flashUnit: null, drafts: {} };

  const STATE_BADGE = { yard: 'ok', out: 'info', returning: 'warn', service: 'bad', held: 'gold' };
  const TILES = [['yard', 'In the yard'], ['out', 'On rent'], ['returning', 'Coming back today'], ['service', 'In service']];

  /* ---------- small helpers ---------- */
  const badge = (tone, text) => h('span.badge' + (tone ? '.' + tone : ''), text);
  const clockOf = d => { const hr = d.getHours(), m = String(d.getMinutes()).padStart(2, '0'); return (hr % 12 || 12) + ':' + m + (hr >= 12 ? 'pm' : 'am'); };
  const plural = (n, one, many) => n + ' ' + (n === 1 ? one : many || one + 's');
  const inCat = (cat, unitNo) => cat === 'all' || E.catOf(O.unitOf(unitNo).model) === cat;
  function table(cls, heads, rows, caption) {
    return h('div.tablewrap', h('table.data.of-table' + (cls ? '.' + cls : ''),
      caption ? h('caption.sr', caption) : null,
      h('thead', h('tr', heads.map(t => Array.isArray(t) ? h('th', { scope: 'col', class: t[1] }, t[0]) : h('th', { scope: 'col' }, t)))),
      h('tbody', rows)));
  }

  /* ---------- tabs: an accessible tablist with a hash per tab ---------- */
  const TABS = ['yard', 'timeline', 'billing', 'receivables', 'feed'];
  const tabFromHash = () => { const id = location.hash.slice(1); return TABS.includes(id) ? id : 'yard'; };
  function selectTab(id, opts = {}) {
    TABS.forEach(t => {
      const on = t === id, tab = $('#tab-' + t);
      tab.setAttribute('aria-selected', String(on)); tab.tabIndex = on ? 0 : -1;
      $('#panel-' + t).hidden = !on;
    });
    /* Keep the selected tab visible in the strip, which scrolls sideways on a phone. */
    const strip = $('.of-tabs'), sel = $('#tab-' + id);
    if (sel.offsetLeft < strip.scrollLeft || sel.offsetLeft + sel.offsetWidth > strip.scrollLeft + strip.clientWidth) strip.scrollLeft = sel.offsetLeft - 16;
    if (opts.focus) sel.focus();
    if (opts.push && location.hash !== '#' + id) history.pushState(null, '', '#' + id);
    hideTip();
  }
  function initTabs() {
    TABS.forEach((t, i) => {
      const tab = $('#tab-' + t);
      tab.addEventListener('click', () => selectTab(t, { push: true }));
      tab.addEventListener('keydown', e => {
        const n = TABS.length;
        const j = { ArrowRight: (i + 1) % n, ArrowLeft: (i - 1 + n) % n, Home: 0, End: n - 1 }[e.key];
        if (j === undefined) return;
        e.preventDefault(); selectTab(TABS[j], { focus: true, push: true });
      });
    });
    window.addEventListener('hashchange', () => selectTab(tabFromHash()));
    window.addEventListener('popstate', () => selectTab(tabFromHash()));
    selectTab(tabFromHash());
  }

  /* ---------- category chips (built once, pressed state updated in place) ---------- */
  function initChips(mount, key) {
    [['all', 'All']].concat(D.categories.map(c => [c.id, c.name])).forEach(([id, name]) =>
      mount.appendChild(h('button.chip', { type: 'button', 'data-cat': id, 'aria-pressed': String(state[key] === id), onclick: () => {
        state[key] = id;
        mount.querySelectorAll('.chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === id)));
        paint();
      } }, name)));
  }

  /* ============ a. Yard board ============ */
  function yardRows(ev) {
    return D.units.map(u => {
      const m = E.modelById(u.model), st = E.statusOn(u.no, E.today(), ev), e = st.ev;
      const onRent = st.state === 'out' || st.state === 'returning';
      const where = onRent ? (e.borough || e.site || 'On site')
        : st.state === 'service' ? 'Yard, service bay' : st.state === 'held' ? 'Yard, held online' : 'Yard';
      return { no: u.no, m, st, where, until: st.until || null,
        cust: onRent || st.state === 'held' ? O.customerName(e.customer) : '', source: O.statusSource(st) };
    });
  }
  function paintYard(ev) {
    const rows = yardRows(ev);
    const tiles = $('#yardTiles'); tiles.textContent = '';
    /* Apple-style figures: a big number over a small label with a status dot, split by hairlines. */
    TILES.forEach(([s, label]) => tiles.appendChild(h('div.of-tile.t-' + s,
      h('b', String(rows.filter(r => r.st.state === s).length)), h('span', h('i', { 'aria-hidden': 'true' }), label))));
    const held = rows.filter(r => r.st.state === 'held').length;
    tiles.appendChild(h('p.of-tilenote.small.mute', plural(rows.length, 'unit') + ' in the fleet' + (held ? ' · ' + held + ' held online right now' : '')));

    const q = state.search.trim().toLowerCase();
    const shown = rows.filter(r => inCat(state.yardCat, r.no) && (!q ||
      ['unit ' + r.no, '#' + r.no, r.m.name, r.m.short, r.cust, r.where, r.st.label, r.source].join(' ').toLowerCase().includes(q)));
    const body = $('#yardBody'); body.textContent = '';
    shown.forEach(r => body.appendChild(h('tr', { 'data-unit': r.no, class: state.flashUnit === r.no ? 'flash' : null },
      h('td', h('b', String(r.no))),
      h('td', r.m.name),
      h('td', { 'data-state': r.st.state }, badge(STATE_BADGE[r.st.state], r.st.label)),
      h('td', r.where),
      h('td.nowrap', r.until ? E.fmt.short(r.until) : ''),
      h('td', r.cust),
      h('td', h('span.of-src', r.source)))));
    if (!shown.length) body.appendChild(h('tr', h('td', { colspan: 7, class: 'mute' }, 'No units match that search.')));
    $('#yardCount').textContent = plural(shown.length, 'unit') + ' shown';
  }

  /* ============ b. Availability timeline ============ */
  const DAYS = 21;
  function barKind(iv) {
    if (iv.kind === 'service') return 'k-service';
    if (iv.kind === 'hold') return 'k-hold';
    const s = O.sourceLabel(iv.ev.source);
    return s === 'Phone booking' ? 'k-phone' : s === 'Website booking' ? 'k-web' : 'k-invoice';
  }
  function barText(no, iv) {
    const e = iv.ev, span = E.fmt.short(iv.from) + ' to ' + E.fmt.short(iv.to);
    const what = iv.kind === 'service' ? 'Service hold: ' + (e.reason || 'service')
      : iv.kind === 'hold' ? 'Website hold: held while a customer books'
      : 'On rent: ' + O.customerName(e.customer) + (e.borough ? ', ' + e.borough : '');
    const src = iv.kind === 'rental' ? O.sourceLabel(e.source) : iv.kind === 'hold' ? 'Website booking' : 'Service hold';
    return [O.unitLabel(no), what, span, 'Source: ' + src].concat(iv.picked ? ['Ended early by a ' + (pickupFor(e) && pickupFor(e).final ? 'final invoice' : 'pick-up ticket')] : []);
  }
  let pickupIndex = [];
  const pickupFor = e => pickupIndex.find(p => p.rental === e.id);

  function paintTimeline(ev) {
    pickupIndex = ev.filter(e => e.type === 'pickup');
    const t0 = E.today(), tl = $('#timeline'); tl.textContent = '';
    const days = Array.from({ length: DAYS }, (_, i) => E.addDays(t0, i));
    const dayCls = (d, i) => (d.getDay() === 6 ? 'sat ' : '') + (i === 0 ? 'today' : '');
    tl.appendChild(h('div.tl-row.tl-head', h('div.tl-label', 'Unit'),
      days.map((d, i) => h('div.tl-day', { class: dayCls(d, i), style: 'grid-column:' + (i + 2) },
        h('span', E.DOW[d.getDay()].slice(0, 3)), h('b', String(d.getDate())), d.getDay() === 6 ? h('small', 'Closed') : null))));
    D.units.filter(u => inCat(state.tlCat, u.no)).forEach(u => {
      const m = E.modelById(u.model);
      const row = h('div.tl-row', { 'data-unit': u.no, class: state.flashUnit === u.no ? 'flash' : null },
        h('div.tl-label', { title: m.name }, h('b', String(u.no)), h('span', m.short)));
      days.forEach((d, i) => row.appendChild(h('div.tl-cell', { class: dayCls(d, i), style: 'grid-column:' + (i + 2) })));
      E.intervals(u.no, ev).forEach(iv => {
        const s = Math.max(0, E.diffDays(iv.from, t0)), last = E.diffDays(iv.to, t0), e = Math.min(DAYS - 1, last);
        if (last < 0 || s > DAYS - 1 || e < s) return;
        const lines = barText(u.no, iv);
        const label = iv.kind === 'service' ? (iv.ev.reason || 'Service') : iv.kind === 'hold' ? 'Held' : O.customerName(iv.ev.customer);
        row.appendChild(h('button.tl-bar', {
          type: 'button', class: barKind(iv) + (iv.from < t0 ? ' cont-l' : '') + (last > DAYS - 1 ? ' cont-r' : ''),
          style: 'grid-column:' + (s + 2) + ' / ' + (e + 3), 'aria-label': lines.join('. '), 'data-tip': JSON.stringify(lines)
        }, h('span', label)));
      });
      tl.appendChild(row);
    });
  }

  /* One tooltip for every bar, shown on hover and on keyboard focus. */
  function showTip(bar) {
    const tip = $('#tlTip'), lines = JSON.parse(bar.dataset.tip);
    tip.textContent = '';
    tip.append(h('b', lines[0]), ...lines.slice(1).map(l => h('span', l)));
    tip.hidden = false;
    const r = bar.getBoundingClientRect(), w = tip.offsetWidth, th = tip.offsetHeight;
    const left = Math.max(8, Math.min(r.left, window.innerWidth - w - 8));
    const below = r.bottom + 8 + th < window.innerHeight;
    tip.style.left = left + 'px';
    tip.style.top = (below ? r.bottom + 6 : r.top - th - 6) + 'px';
  }
  function hideTip() { const tip = $('#tlTip'); if (tip) tip.hidden = true; }
  function initTimeline() {
    const tl = $('#timeline');
    const bar = e => e.target.closest && e.target.closest('.tl-bar');
    tl.addEventListener('mouseover', e => { const b = bar(e); if (b) showTip(b); });
    tl.addEventListener('mouseout', e => { if (bar(e)) hideTip(); });
    tl.addEventListener('focusin', e => { const b = bar(e); if (b) showTip(b); });
    tl.addEventListener('focusout', hideTip);
    tl.addEventListener('click', e => { const b = bar(e); if (b) showTip(b); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTip(); });
    window.addEventListener('scroll', hideTip, { passive: true });
    $('#tlWrap').addEventListener('scroll', hideTip, { passive: true });
  }

  /* ============ c. Billing brief ============ */
  /* Approve one group: a billing event in the log, and a toast that says what would happen in the real build. */
  function approve(group, label, keys) {
    if (!keys.length) return;
    PR.store.add({ type: 'billing', action: 'post', group, label, keys });
    toast('Approved: ' + plural(keys.length, label) + ' would post to the accounting system now. Nothing leaves this preview.');
  }
  function groupCard(opts) {
    const last = O.lastPost(E.events(), opts.id);
    return h('section.card.of-group', { 'aria-labelledby': 'g-' + opts.id },
      h('div.of-ghead', h('div', h('h3', { id: 'g-' + opts.id }, opts.title), h('p.mute.small', opts.sub)), opts.badge),
      opts.body,
      h('div.of-gfoot',
        h('span.small.mute', last ? 'Last approved ' + clockOf(new Date(last.at)) + ': ' + plural((last.keys || []).length, opts.unit) + '.' : 'Not approved yet today.'),
        h('button.btn.btn-dark.btn-sm', { type: 'button', disabled: !opts.keys.length, onclick: () => approve(opts.id, opts.unit, opts.keys) },
          opts.keys.length ? 'Approve and post ' + plural(opts.keys.length, opts.unit) : 'Nothing to post')));
  }

  function paintBilling(ev) {
    const mount = $('#billing'); mount.textContent = '';

    /* Fuel delivered, not billed yet */
    const fuel = O.fuelTickets(ev), unbilled = fuel.filter(f => !f.billed);
    const fuelRow = f => h('tr', { class: f.fresh && !f.billed ? 'flash' : null },
      h('td.nowrap', f.ticket), h('td.nowrap', E.fmt.short(f.day)), h('td', O.unitLabel(f.unit)), h('td', O.customerName(f.customer)),
      h('td.r.nowrap', E.fmt.gal(f.gallons)),
      h('td.nowrap', f.photo ? badge('ok', 'Photo matched') : badge('warn', 'Check the photo')),
      h('td', f.billed ? badge('ok', 'Billed') : badge('warn', 'Not billed')));
    const fuelHeads = ['Ticket', 'Date', 'Unit', 'Customer', ['Gallons', 'r'], 'Photo', 'Status'];
    const billed = fuel.filter(f => f.billed);
    /* Unbilled tickets up front; billed ones stay one click away, so the photo check is still visible. */
    const keepOpen = $('#fuelBilled') && $('#fuelBilled').open;
    mount.appendChild(groupCard({
      id: 'fuel', title: 'Fuel delivered, not billed yet', unit: 'fuel line', keys: unbilled.map(f => f.id),
      sub: 'Every fuel ticket from the drivers, matched to its rental. The gauge photo is checked against the gallons on the ticket.',
      badge: unbilled.length ? badge('warn', unbilled.length + ' to bill') : badge('ok', 'All billed'),
      body: h('div.of-stack',
        unbilled.length ? table('', fuelHeads, unbilled.map(fuelRow), 'Fuel tickets not billed yet') : h('p.of-empty.mute', 'Every fuel ticket is billed.'),
        billed.length ? h('details.of-more#fuelBilled', { open: keepOpen },
          h('summary', 'Already billed (' + billed.length + ')'), table('', fuelHeads, billed.map(fuelRow), 'Fuel tickets already billed')) : null)
    }));

    /* Weekly, biweekly and monthly charges */
    const ch = O.charges(ev), ready = ch.filter(c => !c.missing && !c.posted), missing = ch.filter(c => c.missing);
    mount.appendChild(groupCard({
      id: 'charges', title: 'Weekly, every two weeks and monthly charges', unit: 'charge', keys: ready.map(c => c.key),
      sub: 'Each customer on a billing cycle: ready to bill, or missing something first.',
      badge: missing.length ? badge('bad', missing.length + ' missing') : badge('ok', 'All ready'),
      body: table('', ['Customer', 'Cycle', 'Period', ['Units on rent', 'r'], ['Amount', 'r'], 'Status'], ch.map(c => h('tr',
        h('td', c.name), h('td', c.cycle), h('td', c.period), h('td.r', String(c.units)), h('td.r', money(c.amount)),
        h('td', c.posted ? badge('ok', 'Posted') : c.missing
          ? h('div.of-miss', badge('bad', 'Missing'), h('span.small', c.missing), h('a.small', { href: '#feed' }, 'Send the drop-off ticket from the live feed'))
          : badge('info', 'Ready')))), 'Recurring charges')
    }));

    /* Monthly rental invoices: do they carry all their fuel? */
    const mi = O.monthlyInvoices(ev), miReady = mi.filter(m => !m.missing && !m.posted);
    mount.appendChild(groupCard({
      id: 'monthly', title: 'Monthly rental invoices: is all the fuel on them?', unit: 'invoice', keys: miReady.map(m => m.key),
      sub: 'Each monthly invoice checked against the fuel tickets for that customer this month.',
      badge: mi.some(m => m.missing) ? badge('bad', plural(mi.filter(m => m.missing).length, 'invoice') + ' missing fuel') : badge('ok', 'All fuel on'),
      body: table('', ['Invoice', 'Customer', ['Rent', 'r'], ['Fuel tickets', 'r'], ['Fuel lines', 'r'], 'Status'], mi.map(m => h('tr',
        h('td.nowrap', m.invoice), h('td', m.name), h('td.r', money(m.rent)), h('td.r', String(m.tickets)), h('td.r', String(m.lines)),
        h('td', m.posted ? badge('ok', 'Posted') : m.missing
          ? h('div.of-miss', badge('bad', 'Missing ' + plural(m.missing, 'fuel line')),
            h('button.btn.btn-line.btn-sm', { type: 'button', onclick: () => {
              PR.store.add({ type: 'billing', action: 'addfuel', key: m.key, label: m.invoice });
              toast(plural(m.missing, 'fuel line') + ' added to ' + m.invoice + '. It is ready for approval.');
            } }, 'Add fuel lines'))
          : badge('info', 'Complete')))), 'Monthly invoices')
    }));

    /* Add-ons caught from email replies */
    const ao = O.addOns(ev), aoReady = ao.filter(a => !a.posted);
    mount.appendChild(groupCard({
      id: 'addons', title: 'Add-ons caught from email replies', unit: 'add-on', keys: aoReady.map(a => a.key),
      sub: 'Customers reply to a delivery confirmation asking for more. The agent reads the reply and drafts the lines.',
      badge: aoReady.length ? badge('warn', aoReady.length + ' to add') : badge('ok', 'All added'),
      body: h('ul.of-addons', ao.map(a => h('li',
        h('div.of-aohead', h('span', h('b', a.name), ' replied to the delivery confirmation for ' + (a.unit ? O.unitLabel(a.unit) : 'a delivery'))),
        h('blockquote', a.reply),
        h('div.of-aolines', a.lines.map(l => h('span.of-line', l.qty + ' × ' + l.item + (l.free !== undefined ? ' · ' + l.free + ' free in the yard' : '')))),
        a.posted ? badge('ok', 'Added to the invoice') : badge('warn', 'Not on an invoice yet'))))
    }));

    $('#cntBilling').textContent = String(unbilled.length + ready.length + miReady.length + aoReady.length);
  }

  /* ============ d. Receivables watch ============ */
  function draftFor(r) {
    const amt = money(r.amount), phone = C.business.phone;
    const open = 'Hello,\n\n';
    const close = '\n\nIf this is already paid, please let us know and we will update our records. You can reply here or call ' + phone + '.\n\nThank you,\nPower Rentals billing';
    const body = {
      final: 'Thank you for renting from Power Rentals. Invoice ' + r.invoice + ' for ' + amt + ' is marked final: the rental is complete and the equipment is back with us. The balance is still open. Could you tell us when we can expect payment?',
      event: 'Thank you for choosing Power Rentals for your event. Invoice ' + r.invoice + ' for ' + amt + ' was due on delivery and is still open. Could you arrange payment this week?',
      schedule: 'We are writing about invoice ' + r.invoice + ' for ' + amt + '. ' + r.detail + ' Could you send the next payment, or call us to set a new date?',
      promise: r.promise ? 'On our last call we noted a payment of ' + money(r.promise.amount) + ' by ' + E.fmt.long(r.promise.date) + ' toward invoice ' + r.invoice + '. We have not received it yet. Could you let us know when it will be sent?' : ''
    }[r.flag] || '';
    return { subject: 'Invoice ' + r.invoice + ': payment reminder', body: open + body + close };
  }
  function openDraft(r) {
    const d = state.drafts[r.id] || draftFor(r), dlg = $('#dlgDraft');
    $('#dlgDraftFor').textContent = r.name + ' · ' + r.invoice + ' · ' + money(r.amount) + ' · sample';
    $('#draftSubject').value = d.subject; $('#draftBody').value = d.body;
    dlg.dataset.item = r.id; dlg.showModal(); $('#draftBody').focus();
  }
  function openPromise(r) {
    const dlg = $('#dlgPromise');
    $('#dlgPromiseFor').textContent = r.name + ' · ' + r.invoice + ' · ' + money(r.amount) + ' open';
    $('#promiseDate').value = E.key(E.addDays(E.today(), 7)); $('#promiseAmount').value = String(r.amount);
    dlg.dataset.item = r.id; dlg.dataset.customer = r.customer; dlg.showModal();
  }
  function initDialogs() {
    $('#dlgDraft form').addEventListener('submit', e => {
      if (!e.submitter || e.submitter.value !== 'save') return;
      state.drafts[$('#dlgDraft').dataset.item] = { subject: $('#draftSubject').value, body: $('#draftBody').value };
      toast('Draft saved. In the real build it waits for billing to approve and send.');
    });
    $('#promiseForm').addEventListener('submit', e => {
      if (!e.submitter || e.submitter.value !== 'save') return;
      const dlg = $('#dlgPromise'), date = $('#promiseDate').value, amount = Math.round(+$('#promiseAmount').value);
      PR.store.add({ type: 'promise', item: dlg.dataset.item, customer: dlg.dataset.customer, date, amount });
      const past = E.fromKey(date) < E.today();
      toast(past ? 'Promise logged with a past date: it now shows as a broken promise.' : 'Promise logged: ' + money(amount) + ' by ' + E.fmt.short(E.fromKey(date)) + '.');
    });
  }

  let rowsById = {};
  function paintReceivables(ev) {
    const { flags, rows } = O.receivables(ev);
    rowsById = Object.fromEntries(rows.map(r => [r.id, r]));
    const mount = $('#flags'); mount.textContent = '';
    flags.forEach(f => mount.appendChild(h('section.card.of-group.of-flag.f-' + f.id, { 'aria-labelledby': 'f-' + f.id },
      h('div.of-ghead', h('div', h('h3', { id: 'f-' + f.id }, f.title), h('p.mute.small', f.why)),
        h('div.of-ftot', h('b', money(f.total)), h('span.small.mute', plural(f.items.length, 'invoice')))),
      f.items.length ? table('', ['Customer', 'Invoice', ['Amount', 'r'], ['Age', 'r'], 'Why it is flagged', 'Promise', 'Actions'], f.items.map(r => h('tr', { class: r.fresh ? 'flash' : null },
        h('td', h('b', r.name)), h('td.nowrap', r.invoice), h('td.r', money(r.amount)), h('td.r.nowrap', plural(r.age, 'day')),
        h('td', r.detail),
        h('td', r.promise ? h('span', { class: r.broken ? 'of-bad' : 'of-ok' }, money(r.promise.amount) + ' by ' + E.fmt.short(r.promise.date) + (r.broken ? ', not received' : '')) : h('span.mute', 'None')),
        h('td', h('div.of-acts',
          h('button.btn.btn-line.btn-sm', { type: 'button', 'data-act': 'draft', 'data-item': r.id }, 'Draft reminder'),
          h('button.btn.btn-line.btn-sm', { type: 'button', 'data-act': 'promise', 'data-item': r.id }, 'Log a promise'))))), f.title)
        : h('p.of-empty.mute', 'Nothing here right now.'))));

    const ag = O.aging(ev), am = $('#aging'); am.textContent = '';
    am.appendChild(h('div.of-phead', h('div', h('h3', 'The way the accounting report shows it today'),
      h('p.mute.small', 'The same balances, by age only. It says how old a balance is, not why it is late or what to do next.'))));
    am.appendChild(table('of-agetable', ['Customer'].concat(ag.buckets.map(b => [b + ' days', 'r'])).concat([['Total', 'r']]),
      ag.list.map(c => h('tr', h('td', c.name), c.b.map(n => h('td.r', n ? money(n) : '')), h('td.r', h('b', money(c.total)))))
        .concat([h('tr.of-total', h('td', h('b', 'Total')), ag.totals.map(n => h('td.r', h('b', money(n)))), h('td.r', h('b', money(ag.total))))]),
      'Accounts receivable aging'));
    $('#cntAr').textContent = String(flags.reduce((a, f) => a + f.items.length, 0));
  }

  /* ============ e. Live feed ============ */
  const sel = {};   // the simulator's select boxes, refreshed on every paint
  function fillSelect(el, options, empty) {
    const keep = el.value; el.textContent = '';
    if (!options.length) { el.appendChild(h('option', { value: '' }, empty)); el.disabled = true; return; }
    el.disabled = false;
    options.forEach(o => o.group
      ? el.appendChild(h('optgroup', { label: o.group }, o.items.map(i => h('option', { value: i.value }, i.text))))
      : el.appendChild(h('option', { value: o.value }, o.text)));
    if ([...el.options].some(o => o.value === keep)) el.value = keep;
  }
  const onRent = ev => D.units.map(u => ({ u, r: O.currentRental(u.no, ev) })).filter(x => x.r);
  const rentOpt = x => ({ value: String(x.u.no), text: O.unitLabel(x.u.no) + ' · ' + O.customerName(x.r.customer) });

  /* One simulator: a small form shown under the "Simulate" button bar. Only the chosen one is visible. */
  function simCard(id, title, from, fields, button, run) {
    const form = h('form.of-sim', { id: 'sim-' + id, 'aria-labelledby': 'simh-' + id },
      h('div.of-simtitle', h('h3', { id: 'simh-' + id }, title), h('p.of-from', 'From: ' + from)),
      h('div.of-simfields', fields, h('button.btn.btn-dark', { type: 'submit' }, button)));
    form.addEventListener('submit', e => { e.preventDefault(); run(form); });
    return form;
  }
  /* The button bar above the simulators: pressing one shows its form and hides the others. */
  const SIM_TABS = [['pickup', 'Pick-up ticket'], ['dropoff', 'Drop-off ticket'], ['fuel', 'Fuel ticket'], ['phone', 'Phone booking'], ['service', 'Service hold'], ['final', 'Final invoice']];
  function showSim(id) {
    SIM_TABS.forEach(([k]) => {
      const on = k === id;
      $('#sim-' + k).hidden = !on;
      $('#simBtns [data-sim="' + k + '"]').setAttribute('aria-pressed', String(on));
    });
  }
  function initSimBar() {
    const bar = $('#simBtns');
    SIM_TABS.forEach(([k, label]) => bar.appendChild(h('button.of-simbtn', { type: 'button', 'data-sim': k, 'aria-pressed': 'false', 'aria-controls': 'sim-' + k, onclick: () => showSim(k) }, label)));
    showSim('pickup');
  }
  const field = (id, label, control) => h('div.field', h('label', { for: id }, label), control);
  const unitNo = id => +sel[id].value;
  const todayKey = () => E.key(E.today());

  /* Record an event, mark its unit so the yard board and timeline flash it, and say what changed. */
  function record(ev, message) {
    state.flashUnit = ev.unit || null;
    PR.store.add(ev);
    toast(message);
    clearTimeout(record.t); record.t = setTimeout(() => { state.flashUnit = null; }, 2500);
  }

  function initSims() {
    const mount = $('#sims');
    ['pick', 'drop', 'fuel', 'final', 'svc', 'phModel', 'phCust', 'phBoro'].forEach(k => { sel[k] = h('select', { id: 'sel-' + k }); });

    mount.appendChild(simCard('pickup', 'Driver pick-up ticket arrives', 'Billing inbox: driver ticket',
      [field('sel-pick', 'Unit on rent', sel.pick)], 'Send pick-up ticket', () => {
        const no = unitNo('pick'), r = O.currentRental(no, E.events()); if (!r) return;
        record({ type: 'pickup', unit: no, day: todayKey(), rental: r.id }, O.unitLabel(no) + ' is back in the yard. The website shows it as free.');
      }));
    mount.appendChild(simCard('dropoff', 'Drop-off ticket', 'Billing inbox: driver ticket',
      [field('sel-drop', 'Unit delivered', sel.drop)], 'Send drop-off ticket', () => {
        const no = unitNo('drop'), r = O.currentRental(no, E.events()); if (!r) return;
        record({ type: 'dropoff', unit: no, day: todayKey(), rental: r.id }, 'Drop-off ticket for ' + O.unitLabel(no) + ': on site, the charge can start.');
      }));
    const gal = h('input', { id: 'sim-gal', type: 'number', min: 1, max: 500, step: 1, value: 40, inputmode: 'numeric' });
    mount.appendChild(simCard('fuel', 'Fuel ticket', 'Billing inbox: driver ticket',
      [field('sel-fuel', 'Unit fueled', sel.fuel), field('sim-gal', 'Gallons (sample)', gal)], 'Send fuel ticket', () => {
        const no = unitNo('fuel'), r = O.currentRental(no, E.events()), g = Math.max(1, Math.min(500, +gal.value || 0)); if (!r) return;
        record({ type: 'fuel', unit: no, day: todayKey(), gallons: g, rental: r.id, customer: r.customer }, 'Fuel ticket for ' + O.unitLabel(no) + ' added to the billing brief, not billed yet.');
      }));
    const days = h('input', { id: 'sim-days', type: 'number', min: 1, max: 60, step: 1, value: 5, inputmode: 'numeric' });
    mount.appendChild(simCard('phone', 'Phone booking taken by the booking desk', 'Booking desk',
      [field('sel-phModel', 'Equipment', sel.phModel), field('sel-phCust', 'Customer (sample)', sel.phCust), field('sel-phBoro', 'Borough', sel.phBoro), field('sim-days', 'Days, starting today', days)],
      'Book it', () => {
        const ev = E.events(), n = Math.max(1, Math.min(60, Math.round(+days.value || 1))), model = sel.phModel.value;
        const free = E.freeUnits(model, E.today(), n, ev);
        if (!free.length) { const back = E.nextBack(model, E.today(), ev); toast('No ' + E.modelById(model).short + ' is free for those days' + (back ? '. Next one back ' + E.fmt.rel(back) + '.' : '.')); return; }
        record({ type: 'rental', unit: free[0].no, start: todayKey(), end: E.key(E.addDays(E.today(), n - 1)), customer: sel.phCust.value, borough: sel.phBoro.value, source: 'Phone booking' },
          'Booked ' + O.unitLabel(free[0].no) + ' for ' + plural(n, 'day') + '. The website now shows one fewer in the yard.');
      }));
    const reason = h('input', { id: 'sim-reason', value: 'Oil change and inspection', maxlength: 60 });
    const sdays = h('input', { id: 'sim-sdays', type: 'number', min: 1, max: 30, step: 1, value: 2, inputmode: 'numeric' });
    mount.appendChild(simCard('service', 'Unit goes into service', 'Yard: service hold',
      [field('sel-svc', 'Unit in the yard', sel.svc), field('sim-reason', 'Reason', reason), field('sim-sdays', 'Days', sdays)], 'Start service hold', () => {
        const no = unitNo('svc'), n = Math.max(1, Math.min(30, Math.round(+sdays.value || 1))); if (!no) return;
        record({ type: 'service', unit: no, start: todayKey(), end: E.key(E.addDays(E.today(), n - 1)), reason: reason.value.trim() || 'Service', source: 'Service hold' },
          O.unitLabel(no) + ' is in service. It cannot be booked until it is done.');
      }));
    mount.appendChild(simCard('final', 'Final invoice posted in the accounting system', 'Accounting system: invoice',
      [field('sel-final', 'Rental to close', sel.final)], 'Post final invoice', () => {
        const no = unitNo('final'), r = O.currentRental(no, E.events()); if (!r) return;
        const ran = Math.max(1, E.diffDays(E.today(), E.fromKey(r.start)) + 1);
        /* The engine reads any pick-up as "back in the yard"; final: true records that the invoice, not a driver, said so. */
        record({ type: 'pickup', unit: no, day: todayKey(), rental: r.id, final: true, customer: r.customer,
          invoice: 'Sample F-' + String(no).padStart(2, '0') + String(ran).padStart(2, '0'), amount: 140 * ran + 95 },
          'Final invoice posted: ' + O.unitLabel(no) + ' is back in the yard and the balance is on the receivables watch.');
      }));

    fillSelect(sel.phModel, D.categories.map(c => ({ group: c.name, items: D.models.filter(m => m.cat === c.id).map(m => ({ value: m.id, text: m.name })) })));
    fillSelect(sel.phCust, D.customers.map(c => ({ value: c.id, text: c.name })));
    fillSelect(sel.phBoro, C.business.boroughs.map(b => ({ value: b, text: b })));
    initSimBar();
  }

  function paintFeed(ev) {
    const rent = onRent(ev);
    fillSelect(sel.pick, rent.map(rentOpt), 'No units on rent');
    fillSelect(sel.drop, rent.map(rentOpt), 'No units on rent');
    fillSelect(sel.final, rent.map(rentOpt), 'No units on rent');
    fillSelect(sel.fuel, rent.filter(x => O.takesFuel(x.u.no)).map(rentOpt), 'No fueled units on rent');
    fillSelect(sel.svc, D.units.filter(u => E.statusOn(u.no, E.today(), ev).state === 'yard').map(u => ({ value: String(u.no), text: O.unitLabel(u.no) })), 'No units in the yard');

    const list = PR.store.events().slice().sort((a, b) => (a.at < b.at ? 1 : -1));
    const feed = $('#feed'); feed.textContent = '';
    const t = E.today();
    list.slice(0, 60).forEach((e, i) => {
      const d = O.describe(e), at = new Date(e.at);
      feed.appendChild(h('li', { class: i === 0 ? 'newest' : null },
        h('time', { datetime: e.at }, clockOf(at), E.diffDays(at, t) !== 0 ? h('small', E.fmt.short(at)) : null),
        h('div', h('span.badge.' + (d.tone || 'plain'), d.source), h('b', d.title), h('span.small.mute', d.detail))));
    });
    if (!list.length) feed.appendChild(h('li.of-empty', h('div', h('b', 'No events yet.'), h('span.small.mute', 'Use the buttons to send a ticket, take a booking or post an invoice. Website bookings appear here too.'))));
    $('#feedNote').textContent = list.length ? plural(list.length, 'event') + ' since the demo was reset' : '';
    $('#cntFeed').textContent = list.length ? String(list.length) : '';
  }

  /* ---------- paint everything from one read of the event log ---------- */
  function paint() {
    const ev = E.events();
    paintYard(ev); paintTimeline(ev); paintBilling(ev); paintReceivables(ev); paintFeed(ev);
    $('#ofToday').textContent = E.fmt.long(E.today()) + ' · ' + plural(D.units.length, 'unit');
  }

  document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initChips($('#yardChips'), 'yardCat');
    initChips($('#tlChips'), 'tlCat');
    $('#yardSearch').addEventListener('input', e => { state.search = e.target.value; paintYard(E.events()); });
    initTimeline(); initDialogs(); initSims();
    /* Receivables buttons are re-rendered on every paint, so listen once on the panel. */
    $('#flags').addEventListener('click', e => {
      const b = e.target.closest('button[data-act]'); if (!b) return;
      const r = rowsById[b.dataset.item]; if (!r) return;
      if (b.dataset.act === 'draft') openDraft(r); else openPromise(r);
    });
    paint();
    PR.store.subscribe(paint);
    setInterval(paint, 60000);   // website holds expire after a few minutes
  });
})();
