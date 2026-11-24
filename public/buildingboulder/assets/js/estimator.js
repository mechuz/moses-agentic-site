// Boulder Builders · cost estimator module
// A hard-cost range for a new apartment building in Brooklyn or Manhattan, from published New York cost data.
// Figures come from ../../cost-model.json through the #bbCost block (built by site-tools/build_html.py).
// Every figure, rule and worked example is written out for review in ESTIMATOR-REVIEW.md (client folder).
//
// The formula, in one line:
//   range per square foot = the building type's low / middle / high New York figure (July 2026 dollars)
//                           x (1 + 4.5%) ^ (years from July 2026 to a construction midpoint 12 months after this month)
//   total                 = gross square feet x each figure per square foot
// where gross square feet = apartments x average apartment size / 0.80 (or the gross square feet the visitor enters).
// Brooklyn and Manhattan use the same figures: the published data gives no difference between them.
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const root = $('#estimator'), dataEl = $('#bbCost');
  if (!root || !dataEl) return;
  const C = JSON.parse(dataEl.textContent), S = C.settings;
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static\b/.test(location.search);
  const TYPE_LABEL = { 'low-rise': 'Low-rise', 'mid-rise': 'Mid-rise', 'high-rise': 'High-rise' };
  const nf = new Intl.NumberFormat('en-US');

  /* ---------- the model ---------- */
  // escalation: whole months from the cost base month to the construction midpoint, at the model's yearly rate
  function escalation(today = new Date()) {
    const visit = today.getFullYear() * 12 + today.getMonth();            // months, January = 0
    const base = C.base.year * 12 + (C.base.month - 1);
    const months = Math.max(0, visit + S.midpoint_months_ahead - base);
    return { months, factor: Math.pow(1 + C.escalation_pct / 100, months / 12) };
  }
  const roundTo = (x, step) => Math.round(x / step) * step;
  function grossFromApartments(apts, size) { return roundTo(apts * size / S.net_to_gross, S.gsf_round_to); }
  function estimate({ type, gsf }, today) {
    const t = C.types[type], esc = escalation(today);
    const psf = { low: Math.round(t.low * esc.factor), mid: Math.round(t.mid * esc.factor), high: Math.round(t.high * esc.factor) };
    const total = k => roundTo(gsf * psf[k], S.total_round_to);
    return { psf, total: { low: total('low'), mid: total('mid'), high: total('high') }, gsf, esc };
  }
  window.__bbEstimate = { estimate, escalation, grossFromApartments };  // for review and checks

  /* ---------- inputs ---------- */
  const form = $('#estForm');
  const val = name => (form.querySelector(`input[name=${name}]:checked`) || {}).value;
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
  const fill = r => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min) * 100).toFixed(2) + '%');

  // The value each number box holds, at the box's own step. A slider can be coarser than its box (gross square feet:
  // the slider moves in 500s, the box takes any figure to the nearest 10), so the estimate reads these, not the sliders.
  const cur = {};
  // A typed figure outside the range is set to the nearest end, and the line under the inputs says so.
  const LIMIT = {
    eApts: { unit: ' apartments', hi: 'the most this estimate covers', lo: 'the fewest this estimate covers' },
    eSize: { unit: ' square feet', hi: 'the largest average this estimate covers', lo: 'the smallest average this estimate covers' },
    eGsf: { unit: ' gross square feet', hi: 'the most this estimate covers', lo: 'the least this estimate covers' },
  };
  let note = '';

  function read() {
    const mode = val('eMode') || 'apts';
    const borough = val('eBoro') || S.default_borough;
    const type = val('eType') || S.default_type;
    if (mode === 'apts') {
      const apts = clamp(Math.round(cur.eApts), S.apartments.min, S.apartments.max);
      const size = clamp(roundTo(cur.eSize, S.avg_size_sf.step), S.avg_size_sf.min, S.avg_size_sf.max);
      return { mode, borough, type, apts, size, gsf: grossFromApartments(apts, size) };
    }
    const gsf = clamp(roundTo(cur.eGsf, S.gsf_round_to), S.gsf.min, S.gsf.max);
    return { mode, borough, type, gsf };
  }

  // each slider is paired with a number box; typing moves the slider, the slider fills the box
  $$('input[type=range]', form).forEach(r => {
    const box = $('#' + r.dataset.pair);
    cur[box.id] = +box.value;
    fill(r);
    r.addEventListener('input', () => { box.value = r.value; cur[box.id] = +r.value; note = ''; fill(r); update(); });
    box.addEventListener('input', () => {
      const v = +box.value;
      if (box.value !== '' && v >= +r.min && v <= +r.max) { r.value = v; cur[box.id] = v; note = ''; fill(r); update(); }
    });
    box.addEventListener('change', () => {
      const step = +box.step || 1, lo = +r.min, hi = +r.max;
      const typed = box.value === '' ? NaN : +box.value;
      const v = Number.isFinite(typed) ? clamp(roundTo(typed, step), lo, hi) : cur[box.id];  // an emptied box keeps its last figure
      const L = LIMIT[box.id];
      note = L && Number.isFinite(typed) && (typed > hi || typed < lo)
        ? `Set to ${nf.format(v)}${L.unit}, ${typed > hi ? L.hi : L.lo}.` : '';
      box.value = r.value = v; cur[box.id] = v; fill(r); update();
    });
  });

  form.addEventListener('change', e => {
    if (/^e(Mode|Boro|Type)$/.test(e.target.name)) note = '';
    if (e.target.name === 'eMode') {
      const apts = e.target.value === 'apts';
      if (!apts) {  // carry the building's size across, to the nearest 10 square feet, so the answer does not move
        const g = clamp(grossFromApartments(cur.eApts, cur.eSize), S.gsf.min, S.gsf.max);
        $('#eGsfR').value = $('#eGsf').value = g; cur.eGsf = g; fill($('#eGsfR'));
      }
      $('#eModeApts').hidden = !apts; $('#eModeGsf').hidden = apts;
      const shown = apts ? $('#eModeApts') : $('#eModeGsf');
      if (!REDUCED && shown.animate) shown.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 500, easing: 'cubic-bezier(.22,1,.36,1)' });
    }
    if (/^e(Mode|Boro|Type)$/.test(e.target.name)) update();
  });
  form.addEventListener('submit', e => e.preventDefault());

  /* ---------- output ---------- */
  const millions = x => (x / 1e6).toFixed(1);
  const money = x => `$${millions(x)} million`;
  const [smin, smax] = S.scale_psf;
  const pct = x => ((clamp(x, smin, smax) - smin) / (smax - smin) * 100).toFixed(2) + '%';
  $('#eTicks').innerHTML = [300, 400, 500].map(v => `<span style="left:${pct(v)}">$${v}</span>`).join('');

  // numbers ease to their new value; the last frame always writes the exact figure
  const tweens = new Map();
  function tweenText(el, to, fmt, from) {
    if (!el) return;
    cancelAnimationFrame(tweens.get(el));  // a count still running must never overwrite the new figure
    tweens.delete(el);
    const start = from !== undefined ? from : (el._d !== undefined ? el._d : to);  // from what is on screen now
    if (REDUCED || start === to) { el._d = to; el.textContent = fmt(to); return; }
    const t0 = performance.now(), dur = 700, ease = t => 1 - Math.pow(2, -10 * t);
    const step = now => {
      const k = Math.min(1, (now - t0) / dur);
      el._d = k < 1 ? start + (to - start) * ease(k) : to;  // ease(1) is 0.999, not 1
      el.textContent = fmt(el._d);
      if (k < 1) tweens.set(el, requestAnimationFrame(step)); else tweens.delete(el);
    };
    tweens.set(el, requestAnimationFrame(step));
  }

  let shown = false, liveTimer = 0, last = null;
  function summary(s, r) {
    const size = s.mode === 'apts' ? `${s.apts} apartments of ${nf.format(s.size)} square feet, about ${nf.format(s.gsf)} gross square feet` : `${nf.format(s.gsf)} gross square feet`;
    return `${s.borough} · ${TYPE_LABEL[s.type]} · ${size} · ${money(r.total.low)} to ${money(r.total.high)}, middle ${money(r.total.mid)}`;
  }
  function update(force) {
    const s = read(), r = estimate(s);
    last = { s, r };
    $('#eCtx').textContent = `${s.borough} · ${TYPE_LABEL[s.type]} · ` + (s.mode === 'apts' ? `${s.apts} apartments` : `${nf.format(s.gsf)} gross square feet`);
    $('#eArea').textContent = (note ? note + ' ' : '') + (s.mode === 'apts'
      ? `About ${nf.format(s.gsf)} gross square feet, counting halls, stairs, lobby and walls.`
      : 'The floor area of every story, walls included.');
    $('#eArea').classList.toggle('is-set', !!note);
    $('#eDockMid').textContent = money(r.total.mid);
    $('#eDockRange').textContent = `${money(r.total.low)} to ${money(r.total.high)}`;
    if (!force) {  // a visitor's change: say the new range to screen readers once the slider settles
      clearTimeout(liveTimer);
      const said = note;
      liveTimer = setTimeout(() => { $('#eLive').textContent = (said ? said + ' ' : '') + `Estimated hard cost ${money(r.total.low)} to ${money(r.total.high)}, middle ${money(r.total.mid)}.`; }, 600);
    }
    if (!shown && (!force || force === 'init')) return;  // the card's numbers count up the first time it comes into view
    const from = force === 'intro' ? 0 : undefined;
    tweenText($('#eMid'), r.total.mid / 1e6, v => v.toFixed(1), from);
    tweenText($('#eLow'), r.total.low / 1e6, v => `$${v.toFixed(1)} million`, from);
    tweenText($('#eHigh'), r.total.high / 1e6, v => `$${v.toFixed(1)} million`, from);
    tweenText($('#ePsfLow'), r.psf.low, v => '$' + Math.round(v), from);
    tweenText($('#ePsfMid'), r.psf.mid, v => '$' + Math.round(v), from);
    tweenText($('#ePsfHigh'), r.psf.high, v => '$' + Math.round(v), from);
    const band = $('#eBand'), mark = $('#eMark');
    band.style.left = pct(r.psf.low); band.style.width = `calc(${pct(r.psf.high)} - ${pct(r.psf.low)})`;
    mark.style.left = pct(r.psf.mid);
  }

  /* ---------- first view, phone dock ---------- */
  const card = $('.est__card', root), dock = $('#eDock');
  update('init');
  if ('IntersectionObserver' in window && !REDUCED) {
    $('#eMid').textContent = '0.0';
    const io = new IntersectionObserver(es => es.forEach(en => {
      if (en.isIntersecting && !shown) { shown = true; update('intro'); io.disconnect(); }
    }), { threshold: 0.3 });
    io.observe(card);
  } else { shown = true; update(true); }

  // on a phone the result card sits below the inputs: a slim bar keeps the middle figure in sight while adjusting
  if ('IntersectionObserver' in window) {
    let formIn = false, cardIn = false;
    const sync = () => dock.classList.toggle('is-on', formIn && !cardIn && matchMedia('(max-width: 899px)').matches);
    new IntersectionObserver(es => { es.forEach(en => { if (en.target === form) formIn = en.isIntersecting; else cardIn = en.isIntersecting; }); sync(); }, { threshold: [0, 0.25] })
      .observe(form);
    const io2 = new IntersectionObserver(es => { es.forEach(en => { cardIn = en.intersectionRatio > 0.25; }); sync(); }, { threshold: [0, 0.25, 0.5] });
    io2.observe(card);
    dock.addEventListener('click', () => card.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth', block: 'center' }));
  }

  /* ---------- request a bid, with the inputs carried over ---------- */
  const bid = $('#bid');
  if (bid) bid.setAttribute('tabindex', '-1');
  $('#eCta').addEventListener('click', () => {
    // main.js scrolls to #bid; this fills the bid form first
    if (!last) update(true);
    const { s, r } = last;
    if (window.__bbBid) window.__bbBid.prefill({ borough: s.borough, type: TYPE_LABEL[s.type], units: s.mode === 'apts' ? s.apts : null, summary: summary(s, r) });
    setTimeout(() => bid && bid.focus({ preventScroll: true }), REDUCED ? 50 : 1500);
  });
})();
