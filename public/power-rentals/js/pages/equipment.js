/* Equipment · an Apple-store catalog.
   One section per category (ids gen, heat, cool, light, dist, lift, so equipment.html#heat still works),
   one product tile per model. Every rent action goes to the buy box: product.html?model=ID.
   The catalog is built once. After that paint() only updates the live parts in place (availability,
   unit lists, links, what is shown), so keyboard focus and open unit lists survive a repaint.
   paint() runs on filter changes, on every store change (including orders placed in another tab)
   and once a minute so expired holds drop off. */
(function () {
  'use strict';
  const { h, availLine, $ } = PR.ui, E = PR.engine, D = PR.data;

  /* Short names for the category control, so it fits on one line on a laptop. */
  const SHORT = { gen: 'Generators', heat: 'Heaters', cool: 'Cooling', light: 'Light towers', dist: 'Distribution', lift: 'Lifts' };

  /* ---------- state ---------- */
  const state = { cat: 'all', date: E.today(), only: false };
  const tiles = new Map();      // model id -> { el, avail, units, unitsBody, rent, link, model }
  const sections = new Map();   // category id -> { el, live }

  const isToday = d => E.diffDays(d, E.today()) === 0;
  const productHref = id => 'product.html?model=' + id + (isToday(state.date) ? '' : '&start=' + E.key(state.date));

  /* Read a YYYY-MM-DD string safely; null when malformed. */
  function parseKey(k) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(k || '')) return null;
    const d = E.fromKey(k);
    return isNaN(d) ? null : d;
  }

  /* Plain wording for one unit on the chosen day. */
  function unitStatus(unitNo, day, events) {
    const st = E.statusOn(unitNo, day, events), today = isToday(day);
    const text = {
      out: 'On rent until ' + (st.until ? E.fmt.short(st.until) : ''),
      returning: today ? 'Coming back today' : 'Coming back that day',
      service: 'In service until ' + (st.until ? E.fmt.short(st.until) : ''),
      held: 'Held for an order'
    }[st.state] || (today ? 'In the yard' : 'Free that day');
    return { state: st.state, text };
  }

  /* ---------- filter row ---------- */
  function buildSeg() {
    const seg = $('#catSeg');
    [{ id: 'all', name: 'All' }].concat(D.categories.map(c => ({ id: c.id, name: SHORT[c.id] || c.name }))).forEach(c =>
      seg.appendChild(h('button.seg-btn', { type: 'button', 'data-cat': c.id, 'aria-pressed': String(c.id === state.cat), onclick: () => setCategory(c.id) }, c.name)));
  }

  function setCategory(id) {
    state.cat = id;
    document.querySelectorAll('#catSeg .seg-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === id)));
    paint();
    /* if the visitor has scrolled into the catalog, bring the top of the results back into view */
    const top = $('#catalog').getBoundingClientRect().top - stickyOffset();
    if (top < 0) window.scrollTo({ top: window.scrollY + top - 8, behavior: smooth() });
  }

  function bindFilters() {
    const date = $('#fDate'), only = $('#fOnly');
    date.min = E.key(E.today());
    date.value = E.key(state.date);
    date.addEventListener('change', () => {
      const d = parseKey(date.value);
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
      const live = h('p.cat-live');
      const grid = h('div.ptiles');
      const el = h('section.cat-sec#' + c.id, { 'aria-labelledby': 'h-' + c.id },
        h('div.cat-head', h('h2#h-' + c.id, c.name + '.'), h('p.cat-blurb', c.blurb), live),
        grid);
      D.models.filter(m => m.cat === c.id).forEach(m => grid.appendChild(buildTile(m)));
      sections.set(c.id, { el, live });
      root.appendChild(el);
    });
  }

  function buildTile(m) {
    const unitsId = 'u-' + m.id;
    const link = h('a.ptile-link', { href: productHref(m.id) }, m.name);
    const rent = h('a.more', { href: productHref(m.id), 'aria-label': 'Rent the ' + m.name }, 'Rent');
    const unitsBody = h('div');
    const units = h('div.ptile-units#' + unitsId, { hidden: true }, unitsBody);
    const toggle = h('button.ulink', { type: 'button', 'aria-expanded': 'false', 'aria-controls': unitsId, 'aria-label': 'Units of the ' + m.name }, 'Units');
    toggle.addEventListener('click', () => {
      const open = units.hidden;
      units.hidden = !open;
      toggle.setAttribute('aria-expanded', String(open));
    });
    const avail = h('div.ptile-avail');
    const img = m.img
      ? h('div.shot.' + (m.imgKind || 'photo'), h('img', { src: m.img, alt: '', loading: 'lazy' }))
      : h('div.shot.none', 'Photo to come');
    const el = h('article.ptile', { 'data-model': m.id },
      img,
      h('div.ptile-body',
        h('h3', link),
        avail,
        h('p.ptile-price', h('span.fill', 'From your rate card')),
        h('div.ptile-links', rent, toggle),
        units));
    tiles.set(m.id, { el, avail, unitsBody, rent, link, model: m });
    return el;
  }

  /* ---------- live paint ---------- */
  function unitList(m, ev) {
    const day = state.date;
    return [
      h('p.u-head', 'Unit status ' + (isToday(day) ? 'today' : 'on ' + E.fmt.short(day))),
      h('ul.u-list', E.unitsOf(m.id).map(u => {
        const st = unitStatus(u.no, day, ev);
        return h('li', h('b', 'Unit ' + u.no), h('span.u-st.' + st.state, h('i', { 'aria-hidden': 'true' }), st.text));
      }))
    ];
  }

  function paint() {
    const ev = E.events(), day = state.date;
    let shown = 0, free = 0, total = 0;

    tiles.forEach(t => {
      const m = t.model, sum = E.modelSummary(m.id, day, ev);
      t.avail.replaceChildren(availLine(sum));
      t.unitsBody.replaceChildren(...unitList(m, ev));
      t.link.href = t.rent.href = productHref(m.id);
      const show = (state.cat === 'all' || state.cat === m.cat) && (!state.only || sum.free > 0);
      t.el.hidden = !show;
      if (show) { shown++; free += sum.free; total += sum.total; }
    });

    sections.forEach((s, id) => {
      s.el.hidden = !Array.from(s.el.querySelectorAll('.ptile')).some(x => !x.hidden);
      s.live.replaceChildren(isToday(day) ? '' : h('span.cat-day', 'On ' + E.fmt.long(day) + ': '), availLine(E.categorySummary(id, day, ev)));
    });

    $('#eqEmpty').hidden = shown > 0;
    $('#fCount').textContent = shown
      ? shown + (shown === 1 ? ' model' : ' models') + ' · ' + free + ' of ' + total + ' units free ' + (isToday(day) ? 'today' : 'on ' + E.fmt.long(day))
      : 'No models match these filters.';
    paintLede(ev);
  }

  /* The hero line is always about today, whatever the filters say. */
  function paintLede(ev) {
    let yard = 0;
    D.units.forEach(u => { if (E.statusOn(u.no, E.today(), ev).state === 'yard') yard++; });
    $('#eqLede').textContent = 'Every numbered unit, live from the yard. ' + yard + ' of ' + D.units.length + ' are in the yard today.';
  }

  /* ---------- sticky offsets and anchors (index.html links to equipment.html#gen) ---------- */
  const smooth = () => matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  const stickyOffset = () => { const hd = document.querySelector('header.site'); return (hd ? hd.offsetHeight : 0) + $('#filters').offsetHeight; };

  /* Keep --hdr and --fbh equal to the sticky header and filter row, so the filter row sits under the header
     and category anchors land below both. */
  function trackSticky() {
    const root = document.documentElement.style, bar = $('#filters'), hd = document.querySelector('header.site');
    const set = () => { root.setProperty('--hdr', (hd ? hd.offsetHeight : 0) + 'px'); root.setProperty('--fbh', bar.offsetHeight + 'px'); };
    set();
    if ('ResizeObserver' in window) { const ro = new ResizeObserver(set); ro.observe(bar); if (hd) ro.observe(hd); } else window.addEventListener('resize', set);
  }

  function goToHash() {
    const id = location.hash.slice(1);
    if (!sections.has(id)) return;
    const el = sections.get(id).el;
    if (el.hidden || state.cat !== 'all') { state.only = false; $('#fOnly').checked = false; state.cat = 'all'; document.querySelectorAll('#catSeg .seg-btn').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.cat === 'all'))); paint(); }
    el.scrollIntoView({ block: 'start' });
    const head = el.querySelector('h2'); head.setAttribute('tabindex', '-1'); head.focus({ preventScroll: true });
  }

  document.addEventListener('DOMContentLoaded', () => {
    buildSeg(); buildCatalog(); bindFilters(); paint(); trackSticky();
    PR.store.subscribe(paint);
    setInterval(paint, 60000);
    window.addEventListener('hashchange', goToHash);
    if (location.hash) requestAnimationFrame(goToHash);
  });
})();
