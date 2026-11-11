/* Equipment catalog.
   Builds one section per category and one card per model, once. After that, paint() only updates the
   live parts (availability lines, unit lists, what is shown) in place, so keyboard focus and open
   unit lists survive repaints. paint() runs on filter changes, on every store change (including
   bookings made in another tab) and once a minute so expired holds drop off. */
(function () {
  'use strict';
  const { h, icon, availLine, $ } = PR.ui, E = PR.engine, D = PR.data, L = PR.bookingLib;

  /* ---------- state ---------- */
  const state = { cat: 'all', date: E.today(), only: false };
  const cards = new Map();      // model id -> { el, avail, when, units, toggle, book, model }
  const sections = new Map();   // category id -> { el, avail, when }

  const isToday = d => E.diffDays(d, E.today()) === 0;
  const dayLabel = d => isToday(d) ? 'Today' : 'On ' + E.fmt.long(d);

  /* ---------- filter bar ---------- */
  function buildChips() {
    const wrap = $('#catChips');
    const opts = [{ id: 'all', name: 'All equipment' }].concat(D.categories);
    opts.forEach(c => wrap.appendChild(h('button.chip', {
      type: 'button', 'data-cat': c.id, 'aria-pressed': String(c.id === state.cat),
      onclick: () => setCategory(c.id)
    }, c.name)));
  }

  function setCategory(id) {
    state.cat = id;
    document.querySelectorAll('#catChips .chip').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === id)));
    paint();
    const top = $('#catalog').getBoundingClientRect().top;
    if (top < 0) $('#catalog').scrollIntoView({ block: 'start', behavior: smooth() });
  }

  function bindFilters() {
    const date = $('#fDate'), only = $('#fOnly');
    date.min = E.key(E.today());
    date.value = E.key(state.date);
    date.addEventListener('change', () => {
      const d = L.parseKey(date.value);
      state.date = d && d >= E.today() ? d : E.today();
      if (!d || d < E.today()) date.value = E.key(state.date);
      paint();
    });
    only.addEventListener('change', () => { state.only = only.checked; paint(); });
    $('#filters').addEventListener('submit', e => e.preventDefault());
    $('#eqClear').addEventListener('click', () => { only.checked = false; state.only = false; setCategory('all'); });
  }

  /* ---------- catalog (built once) ---------- */
  function buildCatalog() {
    const root = $('#catalog');
    D.categories.forEach(c => {
      const when = h('span.when'), avail = h('span.cat-avail');
      const grid = h('div.model-grid');
      const el = h('section.cat-sec#' + c.id, { 'aria-labelledby': 'h-' + c.id },
        h('div.cat-head',
          h('div.cat-title', h('span.cat-ico', icon(c.icon)), h('div', h('h2#h-' + c.id, c.name), h('p.mute', c.blurb))),
          h('div.cat-side', h('p.cat-live', when, avail), h('a.btn.btn-dark.btn-sm', { href: 'book.html?cat=' + c.id }, 'Book ' + c.name.toLowerCase()))),
        grid);
      D.models.filter(m => m.cat === c.id).forEach(m => grid.appendChild(buildCard(m, c)));
      sections.set(c.id, { el, avail, when });
      root.appendChild(el);
    });
  }

  function buildCard(m, c) {
    const unitsId = 'u-' + m.id;
    const when = h('p.m-when'), avail = h('div.m-avail');
    const units = h('div.m-units#' + unitsId, { hidden: true });
    const toggle = h('button.btn.btn-line.btn-sm.m-toggle', { type: 'button', 'aria-expanded': 'false', 'aria-controls': unitsId },
      h('span', 'See units'), icon('arrow', 'ico chev'));
    toggle.addEventListener('click', () => {
      const openNow = units.hidden;
      units.hidden = !openNow;
      toggle.setAttribute('aria-expanded', String(openNow));
      toggle.firstChild.textContent = openNow ? 'Hide units' : 'See units';
    });
    const book = h('a.btn.btn-gold.btn-sm', { href: 'book.html?model=' + m.id, 'aria-label': 'Book the ' + m.name }, 'Book');

    const specs = [];
    if (L.FUEL_LABEL[m.fuel]) specs.push(['Fuel', L.FUEL_LABEL[m.fuel]]);
    if (m.fuel === 'diesel') specs.push(['Fuel monitoring', 'Included']);
    specs.push(['Fleet', m.units + (m.units === 1 ? ' numbered unit' : ' numbered units')]);
    specs.push(['Delivery', 'All five boroughs']);

    const el = h('article.card.model', { 'data-model': m.id, 'aria-labelledby': 'mn-' + m.id },
      h('div.m-top', h('span.m-ico', icon(c.icon)), h('h3#mn-' + m.id, m.name)),
      h('dl.m-specs', specs.map(([k, v]) => h('div', h('dt', k), h('dd', v)))),
      h('div.m-live', when, avail),
      L.fuelNote(m),
      h('p.m-price', h('span.mute', 'Price: '), L.fill('from your rate card')),
      h('div.m-actions', book, toggle),
      units);
    cards.set(m.id, { el, avail, when, units, book, model: m });
    return el;
  }

  /* ---------- live paint ---------- */
  function unitList(m, ev) {
    const list = h('ul.u-list');
    E.unitsOf(m.id).forEach(u => {
      const st = L.unitStatus(u.no, state.date, ev);
      list.appendChild(h('li.u-row',
        h('b.u-no', 'Unit ' + u.no),
        h('span.u-st.' + st.state, h('i', { 'aria-hidden': 'true' }), st.text),
        h('span.u-src', 'Source: ' + st.source)));
    });
    return [h('p.u-head', h('span', 'Unit status ' + (isToday(state.date) ? 'today' : 'on ' + E.fmt.short(state.date))), h('span.badge.sample', 'Sample')), list];
  }

  function paint() {
    const ev = E.events(), day = state.date;
    let shownModels = 0, freeUnits = 0, totalUnits = 0;

    cards.forEach(card => {
      const m = card.model, sum = E.modelSummary(m.id, day, ev);
      card.when.textContent = dayLabel(day);
      card.avail.replaceChildren(availLine(sum));
      card.units.replaceChildren(...unitList(m, ev));
      card.book.href = 'book.html?model=' + m.id + (isToday(day) ? '' : '&start=' + E.key(day));
      const show = (state.cat === 'all' || state.cat === m.cat) && (!state.only || sum.free > 0);
      card.el.hidden = !show;
      card.el.classList.toggle('is-out', sum.free === 0);
      if (show) { shownModels++; freeUnits += sum.free; totalUnits += sum.total; }
    });

    sections.forEach((s, id) => {
      const anyShown = Array.from(s.el.querySelectorAll('.model')).some(c => !c.hidden);
      s.el.hidden = !anyShown;
      s.when.textContent = dayLabel(day) + ': ';
      s.avail.replaceChildren(availLine(E.categorySummary(id, day, ev)));
    });

    $('#eqEmpty').hidden = shownModels > 0;
    const where = state.cat === 'all' ? '' : ' in ' + D.categories.find(c => c.id === state.cat).name.toLowerCase();
    $('#fCount').textContent = shownModels
      ? 'Showing ' + shownModels + (shownModels === 1 ? ' model' : ' models') + where + ' · ' + freeUnits + ' of ' + totalUnits + ' units free ' + (isToday(day) ? 'today' : 'on ' + E.fmt.long(day))
      : 'No models match these filters.';
    paintStats(ev);
  }

  /* Hero counters: always about today, whatever the filter says. */
  function paintStats(ev) {
    let yard = 0, back = 0;
    D.units.forEach(u => { const s = E.statusOn(u.no, E.today(), ev).state; if (s === 'yard') yard++; if (s === 'returning') back++; });
    $('#stYard').textContent = yard;
    $('#stBack').textContent = back;
    $('#stTotal').textContent = D.units.length;
  }

  /* ---------- anchors (index.html links to equipment.html#gen) ---------- */
  const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  function goToHash() {
    const id = location.hash.slice(1);
    if (!sections.has(id)) return;
    const el = sections.get(id).el;
    if (el.hidden) { state.only = false; $('#fOnly').checked = false; setCategory('all'); }
    el.scrollIntoView({ block: 'start' });
    const head = el.querySelector('h2'); head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true });
  }

  /* Keep --fbh equal to the sticky filter bar height so anchors land below it. */
  function trackFilterHeight() {
    const bar = $('#filters'), set = () => document.documentElement.style.setProperty('--fbh', bar.offsetHeight + 'px');
    set();
    if ('ResizeObserver' in window) new ResizeObserver(set).observe(bar); else window.addEventListener('resize', set);
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildChips(); buildCatalog(); bindFilters(); paint(); trackFilterHeight();
    PR.store.subscribe(paint);
    setInterval(paint, 60000);
    window.addEventListener('hashchange', goToHash);
    if (location.hash) requestAnimationFrame(goToHash);
  });
})();
