/* Service plans for generators customers own.
   Plans are proposals: the visit count and contents are for Power Rentals to set, and the price is
   always "From your rate card". Booking a visit offers two dates from the next delivery days (the
   engine's posted hours), the customer picks one, and the confirmation shows what the visit report
   will look like. A booked visit is a 'serviceVisit' store event, so the office view can list it. */
(function () {
  'use strict';
  const { h, icon, toast } = PR.ui, E = PR.engine, A = PR.acct;
  const { fmt, key, fromKey, addDays, today } = E;
  const $ = id => document.getElementById(id);

  /* ---------- plans (proposed contents, no prices) ---------- */
  const FEATURES = [
    ['visits', 'Scheduled maintenance'],
    ['reminder', 'A reminder with two dates before every visit'],
    ['report', 'A visit report after every visit'],
    ['loadtest', 'A load test at every visit'],
    ['rental', 'A rental unit while yours is in the shop']
  ];
  const PLANS = [
    { id: 'basic', name: 'Basic', fit: 'For a standby generator that rarely runs.',
      has: { visits: 'One visit a year', reminder: true, report: true, loadtest: false, rental: 'When one is in the yard' } },
    { id: 'standard', name: 'Standard', fit: 'For a generator that backs up a building or a business.',
      has: { visits: 'Two visits a year', reminder: true, report: true, loadtest: true, rental: true } },
    { id: 'priority', name: 'Priority', fit: 'For a generator that cannot go down.',
      has: { visits: 'Four visits a year', reminder: true, report: true, loadtest: true, rental: 'Yes, first in line' } }
  ];

  function renderPlans() {
    const grid = $('plans-grid');
    PLANS.forEach(p => grid.appendChild(h('article.card.plan' + (p.id === 'standard' ? '.plan-mid' : ''), { 'aria-labelledby': 'pl-' + p.id },
      h('div.plan-top', h('span.plan-ico', icon('wrench')), h('h3#pl-' + p.id, p.name)),
      h('p.mute', p.fit),
      h('p.plan-price', h('span.small.mute', 'Price'), h('span.fill', 'From your rate card')),
      h('ul.plan-feats', FEATURES.map(([k, label]) => {
        const v = p.has[k];
        return h('li' + (v ? '' : '.no'), icon(v ? 'check' : 'arrow'), h('span', h('b', label), typeof v === 'string' ? h('span.small.mute', v) : null, v ? null : h('span.small.mute', 'Not included')));
      })),
      h('button.btn' + (p.id === 'standard' ? '.btn-gold' : '.btn-line'), { type: 'button', onclick: () => choosePlan(p.id) }, 'Book a visit on ' + p.name))));
  }

  /* "Book a visit on Standard": preselect the plan and move to the form. */
  function choosePlan(id) {
    $('sPlan').value = id;
    $('book').scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    $('sGen').focus({ preventScroll: true });
    toast(PLANS.find(p => p.id === id).name + ' plan selected');
  }

  /* ---------- booking ---------- */
  /* Two offered dates: the 1st and 3rd delivery days starting two days out, so the customer gets a real choice. */
  function offeredDates() {
    const days = A.nextDeliveryDays(addDays(today(), 2), 3);
    return [days[0], days[2]];
  }

  function setErr(id, msg) {
    const input = $(id), out = $(id + '-err');
    if (out) out.textContent = msg || '';
    if (input) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    return !msg;
  }

  function details() {
    return { plan: $('sPlan').value, generator: $('sGen').value.trim(), address: $('sAddr').value.trim(), borough: $('sBoro').value };
  }

  function wireForm() {
    $('sBoroMount').replaceWith(A.boroughSelect('sBoro'));
    $('sBoro').setAttribute('aria-describedby', 'sBoro-err');
    PLANS.forEach(p => $('sPlan').appendChild(h('option', { value: p.id }, p.name)));
    ['sGen', 'sAddr'].forEach(id => $(id).addEventListener('input', () => setErr(id, '')));
    $('sBoro').addEventListener('change', () => setErr('sBoro', ''));

    // step 1: check the details, then offer two dates
    $('svcForm').addEventListener('submit', e => {
      e.preventDefault();
      const d = details();
      const ok = [
        setErr('sGen', d.generator.length < 2 ? 'Enter the generator size or model.' : ''),
        setErr('sAddr', d.address.length < 5 ? 'Enter the address where the generator is.' : ''),
        setErr('sBoro', d.borough ? '' : 'Choose a borough.')
      ];
      if (ok.includes(false)) { document.querySelector('#svcForm [aria-invalid="true"]').focus(); return; }
      offer();
    });
    // step 2: confirm the picked date
    $('sConfirm').addEventListener('click', confirmVisit);
  }

  function offer() {
    const opts = $('sDateOpts'); opts.textContent = '';
    offeredDates().forEach((d, i) => opts.appendChild(h('label.offer-opt', { for: 'sDate' + i },
      h('input#sDate' + i, { type: 'radio', name: 'visitDate', value: key(d), checked: i === 0, onchange: () => { $('sDate-err').textContent = ''; } }),
      h('span.oo-dow', E.DOW[d.getDay()]),
      h('b', E.MON[d.getMonth()] + ' ' + d.getDate()),
      h('span.small.mute', i === 0 ? 'Soonest' : 'Later option'))));
    const fs = $('sDates'); fs.hidden = false;
    $('sOffer').textContent = 'Update details';
    $('sOffer').classList.replace('btn-dark', 'btn-line');
    fs.focus();
  }

  function confirmVisit() {
    const picked = document.querySelector('input[name="visitDate"]:checked');
    if (!picked) { $('sDate-err').textContent = 'Pick one of the two dates.'; return; }
    const d = details();
    const ev = PR.store.add({ type: 'serviceVisit', date: picked.value, offered: offeredDates().map(key), plan: d.plan || 'not chosen', generator: d.generator, address: d.address, borough: d.borough, customer: A.YOU });
    const date = fromKey(ev.date), plan = PLANS.find(p => p.id === d.plan);
    const done = $('sDone'); done.textContent = '';
    done.append(
      h('p.done-ico', icon('check')),
      h('h3', 'Service visit booked for ' + fmt.long(date)),
      h('dl.done-dl',
        h('div', h('dt', 'Generator'), h('dd', d.generator)),
        h('div', h('dt', 'Plan'), h('dd', plan ? plan.name : 'Not chosen yet')),
        h('div', h('dt', 'Where'), h('dd', d.address + ', ' + d.borough)),
        h('div', h('dt', 'Price'), h('dd', h('span.fill', 'From your rate card')))),
      h('p.mute', 'You get a text the day before with the time window. After the visit, your report looks like this:'),
      report({ date, generator: d.generator, borough: d.borough, compact: true }),
      h('button.btn.btn-line.btn-sm', { type: 'button', onclick: resetForm }, 'Book another visit'));
    $('svcForm').hidden = true; done.hidden = false; done.focus();
    toast('Service visit booked for ' + fmt.long(date));
  }

  function resetForm() {
    $('svcForm').reset(); $('svcForm').hidden = false; $('sDone').hidden = true; $('sDates').hidden = true;
    $('sOffer').textContent = 'Show me two dates'; $('sOffer').classList.replace('btn-line', 'btn-dark');
    $('sGen').focus();
  }

  /* ---------- the SAMPLE visit report ---------- */
  const CHECKS = [
    ['Battery and charger', 'ok', 'Tested, terminals cleaned'],
    ['Coolant level and hoses', 'ok', 'Topped up'],
    ['Belts', 'watch', 'Fan belt worn. Replace at next visit'],
    ['Fuel tank and lines', 'ok', 'No leaks. Water drained from the separator'],
    ['Transfer switch', 'ok', 'Switched over and back'],
    ['Exhaust and enclosure', 'ok', 'Clear']
  ];
  const FILTERS = [['Engine oil', 'Changed'], ['Oil filter', 'Replaced'], ['Fuel filters', 'Replaced'], ['Air filter', 'Cleaned']];

  /* report({date, generator, borough, compact}) → a report card. Every value is a SAMPLE. */
  function report({ date, generator, borough, compact }) {
    const next = addDays(date, 182);
    return h('article.report' + (compact ? '.compact' : ''), { 'aria-label': 'Sample visit report' },
      h('header.rp-head',
        h('div', h('p.rp-kicker', 'Visit report'), h('h3', generator), h('p.small', borough + ' · ' + fmt.long(date) + ' · Technician 1')),
        h('span.badge.sample', 'Sample')),
      h('div.rp-grid',
        h('section.rp-box.rp-checks', h('h4', 'Checklist'), h('ul', CHECKS.map(([k, s, note]) =>
          h('li.' + s, h('span.rp-dot', { 'aria-hidden': 'true' }), h('span', h('b', k), h('span.small.mute', note)), h('span.sr', s === 'ok' ? 'passed' : 'needs attention'))))),
        h('section.rp-box', h('h4', 'Hours meter'), h('p.rp-big', '1,284'), h('p.small.mute', 'hours · 212 since the last visit')),
        h('section.rp-box', h('h4', 'Oil and filters'), h('dl.rp-dl', FILTERS.map(([k, v]) => h('div', h('dt', k), h('dd', v))))),
        h('section.rp-box.rp-load', h('h4', 'Load test'),
          h('div.rp-bars', { role: 'img', 'aria-label': 'Ran at 25, 50 and 75 percent load, ten minutes each. Voltage and frequency held steady.' },
            [25, 50, 75].map(p => h('span', { style: '--h:' + p + '%' }, h('i'), h('small', p + '%')))),
          h('p.small', h('b', 'Passed.'), ' Ten minutes at each step. Voltage and frequency held steady.')),
        h('section.rp-box.rp-next', h('h4', 'Next due'), h('p.rp-big', fmt.short(next)), h('p.small.mute', 'You get two dates to pick from before then.'))));
  }

  /* ---------- start ---------- */
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-icon]').forEach(el => el.appendChild(icon(el.dataset.icon)));
    renderPlans();
    wireForm();
    let last = addDays(today(), -3);                    // the last visit fell on a delivery day
    while (!E.hours.isDeliveryDay(last)) last = addDays(last, -1);
    $('reportMount').appendChild(report({ date: last, generator: 'Customer-owned 150 kilovolt-ampere diesel generator', borough: 'Brooklyn' }));
  });
})();
