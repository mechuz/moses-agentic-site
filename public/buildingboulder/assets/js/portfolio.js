// Boulder Builders · portfolio: featured carousel, map and list, project view, team, quick contact
(function () {
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches || /[?&]static\b/.test(location.search);
  const MOBILE = matchMedia('(max-width: 899px)').matches;
  const FINE = matchMedia('(hover: hover) and (pointer: fine)').matches;
  const MAPLIBRE_JS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.js';
  const MAPLIBRE_CSS = 'https://cdn.jsdelivr.net/npm/maplibre-gl@4.7.1/dist/maplibre-gl.css';
  const MAP_STYLE = 'https://tiles.openfreemap.org/styles/positron';
  const pad2 = n => String(n).padStart(2, '0');
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const lenis = () => window.__lenis;

  // data: the built-in copy is the fallback; the JSON file is the source of truth
  let DATA = JSON.parse($('#bbData').textContent);
  let P = DATA.projects;
  const bySlug = slug => P.find(p => p.slug === slug);
  const hood = p => p.neighborhood.split(' / ')[0];
  const statusLine = p => p.status === 'completed' ? `Completed ${p.year}` : 'In construction';
  fetch('data/projects.json', { cache: 'no-cache' }).then(r => r.ok ? r.json() : null).then(d => { if (d && d.projects) { DATA = d; P = d.projects; } }).catch(() => {});

  const addrCard = (p, extra = '') => `<div class="acard ${extra}" style="--st:${p.stories}" aria-hidden="true"><span class="acard__tag">Photo to come</span><span class="acard__elev"><i></i></span><span class="acard__addr">${esc(p.address)}</span><span class="acard__hood">${esc(hood(p))}, ${esc(p.borough)}</span></div>`;

  /* ---------------- featured carousel: drag, momentum, snap ---------------- */
  function initCarousel() {
    const view = $('#carView'), track = $('#carTrack'), prog = $('#carProg');
    if (!view) return;
    const cards = $$('.fcard', track), imgs = cards.map(c => $('.fcard__media img', c)), count = $('#carCount');
    let x = 0, target = 0, min = 0, dragging = false, startX = 0, startT = 0, lastX = 0, lastT = 0, vel = 0, moved = 0, raf = 0;
    const measure = () => { min = Math.min(0, view.clientWidth - track.scrollWidth - parseFloat(getComputedStyle(view).paddingLeft)); target = Math.max(min, Math.min(0, target)); };
    const offsets = () => cards.map(c => -c.offsetLeft);
    const snap = t => { const o = offsets(); let best = o[0]; o.forEach(v => { if (Math.abs(v - t) < Math.abs(best - t)) best = v; }); return Math.max(min, Math.min(0, best)); };
    const tick = () => {
      x += (target - x) * (REDUCED ? 1 : 0.12);
      if (Math.abs(target - x) < 0.1) x = target;
      track.style.transform = `translate3d(${x.toFixed(2)}px,0,0)`;
      prog.style.transform = `scaleX(${min ? Math.max(0.08, x / min) : 1})`;
      parallax();
      const moving = x !== target || dragging;
      view.classList.toggle('is-moving', moving);
      raf = moving ? requestAnimationFrame(tick) : 0;
    };
    // each photo drifts against the drag, inside its own frame
    const vw = () => view.clientWidth || innerWidth;
    const parallax = () => {
      if (count) { const o = offsets(); let k = 0; o.forEach((v, j) => { if (Math.abs(v - x) < Math.abs(o[k] - x)) k = j; }); count.textContent = `${pad2(k + 1)} / ${pad2(cards.length)}`; }
      if (REDUCED) return;
      const w = vw(), cx = w / 2;
      cards.forEach((c, i) => { if (!imgs[i]) return; const mid = c.offsetLeft + x + c.offsetWidth / 2; imgs[i].style.setProperty('--px', (((mid - cx) / w) * -34).toFixed(1) + 'px'); });
    };
    const run = () => { if (!raf) raf = requestAnimationFrame(tick); };
    measure(); run();
    view.addEventListener('dragstart', e => e.preventDefault());
    $$('a, img', track).forEach(el => { el.draggable = false; });
    addEventListener('resize', () => { measure(); run(); });
    view.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      dragging = true; moved = 0; startX = lastX = e.clientX; startT = target; lastT = performance.now(); vel = 0;
      run();
    });
    addEventListener('pointermove', e => {
      if (!dragging) return;
      const dx = e.clientX - startX; moved = Math.max(moved, Math.abs(dx));
      if (moved > 6) view.classList.add('is-drag');
      let t = startT + dx;
      if (t > 0) t *= 0.35; if (t < min) t = min + (t - min) * 0.35;
      target = t;
      const now = performance.now(); vel = (e.clientX - lastX) / Math.max(1, now - lastT); lastX = e.clientX; lastT = now;
      run();
    }, { passive: true });
    const end = () => {
      if (!dragging) return; dragging = false;
      target = snap(target + vel * 260);
      setTimeout(() => view.classList.remove('is-drag'), 0);
      run();
    };
    addEventListener('pointerup', end); addEventListener('pointercancel', end);
    view.addEventListener('click', e => { if (moved > 6) { e.preventDefault(); e.stopPropagation(); } }, true);
    const step = dir => { const o = offsets(); let i = o.findIndex(v => v <= target + 2); if (i < 0) i = 0; i = Math.max(0, Math.min(o.length - 1, i + dir)); target = Math.max(min, o[i]); run(); };
    $('#carPrev').addEventListener('click', () => step(-1));
    $('#carNext').addEventListener('click', () => step(1));
    // keyboard focus keeps the focused card in view
    track.addEventListener('focusin', e => { const c = e.target.closest('.fcard'); if (!c) return; const l = -c.offsetLeft; if (l > target || l < target - view.clientWidth + c.offsetWidth) { target = Math.max(min, l); run(); } });
    parallax();
  }

  /* ---------------- stats count up ---------------- */
  function countUp(el, dur = 1600) {
    const to = +el.dataset.count; if (REDUCED || !to || to > 1900) return; // a year stays as written
    const from = to > 1900 ? to - 40 : 0, t0 = performance.now();
    el.textContent = from;
    (function f(now) { const t = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - t, 4); el.textContent = Math.round(from + (to - from) * e); if (t < 1) requestAnimationFrame(f); })(t0);
  }
  function initCounters() {
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { $$('[data-count]', en.target).forEach((n, i) => setTimeout(() => countUp(n), i * 120)); io.unobserve(en.target); } }), { threshold: 0.35 });
    ['#stats', '#counters'].forEach(s => { const el = $(s); if (el) io.observe(el); });
    const tl = $('.tl');
    if (tl && !REDUCED) {
      tl.classList.add('is-pre');
      $$('.tl__bar', tl).forEach((b, i) => { b.style.transitionDelay = (i * 70) + 'ms'; });
      const io2 = new IntersectionObserver(es => { if (es[0].isIntersecting) { tl.classList.remove('is-pre'); io2.disconnect(); } }, { threshold: 0.3 });
      io2.observe(tl);
    }
  }

  /* ---------------- map and list ---------------- */
  let map = null, mapReady = false, markers = {}, popup = null, maplibreP = null;
  const filter = { status: 'all', boro: 'all', size: 'all' };
  const sizeOf = p => p.stories <= 5 ? '4-5' : p.stories <= 7 ? '6-7' : '8+';
  const visible = p => (filter.status === 'all' || p.status === filter.status) && (filter.boro === 'all' || p.borough === filter.boro) && (filter.size === 'all' || sizeOf(p) === filter.size);

  function loadMapLibre() {
    if (maplibreP) return maplibreP;
    maplibreP = new Promise((res, rej) => {
      if (window.maplibregl) return res(window.maplibregl);
      const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = MAPLIBRE_CSS; document.head.appendChild(l);
      const s = document.createElement('script'); s.src = MAPLIBRE_JS; s.async = true;
      s.onload = () => window.maplibregl ? res(window.maplibregl) : rej(new Error('maplibre missing'));
      s.onerror = () => rej(new Error('maplibre failed to load'));
      document.head.appendChild(s);
    });
    return maplibreP;
  }
  const webgl = () => { try { const c = document.createElement('canvas'); return !!(c.getContext('webgl2') || c.getContext('webgl')); } catch (e) { return false; } };

  // warm the basemap toward the site's paper and ink
  function tuneStyle(m) {
    const st = m.getStyle(); if (!st || !st.layers) return;
    st.layers.forEach(l => {
      try {
        if (l.type === 'background') m.setPaintProperty(l.id, 'background-color', '#efece5');
        if (l.type === 'fill' && /water/.test(l.id)) m.setPaintProperty(l.id, 'fill-color', '#d6dadb');
        if (l.type === 'fill' && /park|landuse|landcover|wood|grass/.test(l.id)) m.setPaintProperty(l.id, 'fill-color', '#e6e4dc');
        if (l.type === 'symbol' && l.layout && l.layout['text-field']) m.setPaintProperty(l.id, 'text-color', '#7d7a74');
      } catch (e) { /* layer without that property */ }
    });
  }

  function popupHTML(p) {
    const x = p.exterior[0];
    const media = x ? `<img src="${esc(x.card_img || x.sm)}" alt="">${x.kind === 'rendering' ? '<span class="fcard__tag">Rendering</span>' : ''}` : addrCard(p);
    return `<div class="mpop__media">${media}</div><div class="mpop__b"><p class="mpop__a">${esc(p.address)}</p><p class="mpop__m">${esc(hood(p))}, ${esc(p.borough)} · ${p.stories} stories · ${p.apartments} apartments · ${esc(statusLine(p))}</p></div>`;
  }

  function hot(slug, on) {
    const m = markers[slug]; if (m) m.el.classList.toggle('is-hot', on);
    const row = $(`.prow[data-slug="${slug}"]`); if (row) row.classList.toggle('is-hot', on);
    if (!mapReady) return;
    if (on) { const p = bySlug(slug); popup.setLngLat([p.lng, p.lat]).setHTML(popupHTML(p)).addTo(map); }
    else popup.remove();
  }

  async function initMap() {
    const el = $('#atlasMap'), fail = () => { $('#mapFail').hidden = false; };
    if (!webgl()) return fail();
    let ml;
    try { ml = await loadMapLibre(); } catch (e) { return fail(); }
    try {
      map = new ml.Map({
        container: el, style: MAP_STYLE, center: [-73.94, 40.72], zoom: 10.6, minZoom: 9, maxZoom: 17,
        attributionControl: { compact: true }, cooperativeGestures: true, dragRotate: false, pitchWithRotate: false, touchPitch: false, fadeDuration: 0
      });
    } catch (e) { return fail(); }
    map.addControl(new ml.NavigationControl({ showCompass: false }), 'bottom-right');
    map.touchZoomRotate.disableRotation();
    popup = new ml.Popup({ closeButton: false, closeOnClick: false, offset: 16, className: 'mpop', maxWidth: '260px' });
    const timeout = setTimeout(() => { if (!mapReady) fail(); }, 15000);
    map.on('error', e => { if (!mapReady) console.warn('map', e && e.error && e.error.message); });
    map.on('load', () => {
      clearTimeout(timeout); mapReady = true; tuneStyle(map);
      P.forEach(p => {
        const d = document.createElement('button');
        d.className = 'mk' + (p.status === 'completed' ? '' : ' mk--wip');
        d.setAttribute('aria-label', `${p.address}, ${statusLine(p)}`);
        d.addEventListener('mouseenter', () => hot(p.slug, true));
        d.addEventListener('mouseleave', () => hot(p.slug, false));
        d.addEventListener('focus', () => hot(p.slug, true));
        d.addEventListener('blur', () => hot(p.slug, false));
        d.addEventListener('click', e => { e.stopPropagation(); map.flyTo({ center: [p.lng, p.lat], zoom: Math.max(map.getZoom(), 14), speed: 1.4, essential: true }); setTimeout(() => go(p.slug), REDUCED ? 0 : 650); });
        markers[p.slug] = { el: d, m: new ml.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(map) };
      });
      applyFilter(false);
      fit(false);
    });
  }

  function fit(animate = true) {
    if (!mapReady) return;
    const vis = P.filter(visible); if (!vis.length) return;
    const lngs = vis.map(p => p.lng), lats = vis.map(p => p.lat);
    const b = [[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]];
    if (vis.length === 1) map.flyTo({ center: [vis[0].lng, vis[0].lat], zoom: 14, duration: animate ? 1400 : 0 });
    else map.fitBounds(b, { padding: { top: 70, bottom: 50, left: 50, right: 50 }, maxZoom: 14, duration: animate && !REDUCED ? 1400 : 0 });
  }

  function applyFilter(animate = true) {
    let n = 0;
    P.forEach(p => {
      const on = visible(p); if (on) n++;
      const row = $(`.prow[data-slug="${p.slug}"]`); if (row) row.classList.toggle('is-off', !on);
      if (markers[p.slug]) markers[p.slug].el.classList.toggle('is-off', !on);
    });
    $('#atlasCount').textContent = `${n} ${n === 1 ? 'building' : 'buildings'}`;
    if (animate) fit(true);
  }

  function initList() {
    $$('#filters .filters__row').forEach(row => row.addEventListener('click', e => {
      const b = e.target.closest('.chip'); if (!b) return;
      $$('.chip', row).forEach(c => c.classList.toggle('is-on', c === b));
      filter[row.dataset.key] = b.dataset.v;
      applyFilter(true);
    }));
    let fly = 0, flown = false;
    $$('.prow').forEach(r => {
      r.addEventListener('mouseenter', () => {
        hot(r.dataset.slug, true);
        clearTimeout(fly);
        fly = setTimeout(() => { if (!mapReady) return; const p = bySlug(r.dataset.slug); flown = true; const o = { center: [p.lng, p.lat], zoom: Math.max(13.2, Math.min(map.getZoom() + 1.2, 14.5)), speed: 1.1, curve: 1.5, essential: true }; if (REDUCED) o.duration = 0; map.flyTo(o); }, 320);
      });
      r.addEventListener('mouseleave', () => { clearTimeout(fly); hot(r.dataset.slug, false); });
    });
    $('#plist').addEventListener('mouseleave', () => { clearTimeout(fly); if (flown) { flown = false; fit(true); } });
    // phones: the first ten, then "show all"
    const list = $('#plist');
    if (MOBILE) {
      list.classList.add('is-short');
      const b = document.createElement('button'); b.className = 'tlink plist-more'; b.textContent = `Show all ${P.length} buildings`;
      b.addEventListener('click', () => { list.classList.remove('is-short'); b.remove(); window.ScrollTrigger && ScrollTrigger.refresh(); });
      list.after(b);
    }
    const io = new IntersectionObserver(es => { if (es[0].isIntersecting) { io.disconnect(); initMap(); } }, { rootMargin: '900px 0px' });
    io.observe($('#atlasMap'));
  }

  /* ---------------- project view ---------------- */
  const pv = $('#pv'), stage = $('#pvStage');
  let cur = null, set = 'exterior', idx = 0, slides = [], lastFocus = null, locMap = null, locMarker = null, isOpen = false, fromCard = null;

  function gallery(p, which) {
    if (which === 'interior') return (p.interior && p.interior.length ? p.interior.map(x => ({ ...x })) : DATA.representative_interior.map(x => ({ ...x, rep: true })));
    const real = (p.exterior || []).map(x => ({ ...x, fit: true }));
    return [...real, { card: true, caption: real.length ? 'The building on the record' : 'Photo to come · the building on the record' }];
  }

  function renderSet() {
    slides = gallery(cur, set);
    stage.innerHTML = slides.map((s, i) => s.card
      ? `<div class="slide" data-i="${i}">${addrCard(cur)}</div>`
      : `<div class="slide${s.fit ? ' slide--fit' : ''}" data-i="${i}">${s.fit ? `<img class="slide__bg" data-src="${esc(s.sm)}" alt="" aria-hidden="true">` : ''}<img class="slide__img" data-src="${esc(s.fit ? s.src : (MOBILE ? s.sm : s.src))}" alt="${esc(s.alt)}" draggable="false"></div>`).join('');
    $('#pvThumbs').innerHTML = slides.map((s, i) => `<button class="pv__thumb" role="tab" aria-label="Photo ${i + 1}" data-i="${i}">${s.card ? addrCard(cur) : `<img src="${esc(s.sm)}" alt="" loading="lazy">`}</button>`).join('');
    $$('.pv__tab').forEach(t => { const on = t.dataset.set === set; t.classList.toggle('is-on', on); t.setAttribute('aria-selected', on); });
    show(0, true);
  }

  function load(i) { const s = $(`.slide[data-i="${i}"]`, stage); if (!s) return; $$('img[data-src]', s).forEach(im => { im.src = im.dataset.src; im.removeAttribute('data-src'); }); }

  function show(i, instant) {
    const n = slides.length; idx = (i + n) % n;
    load(idx); load((idx + 1) % n); load((idx - 1 + n) % n);
    $$('.slide', stage).forEach(s => s.classList.toggle('is-on', +s.dataset.i === idx));
    $$('.pv__thumb').forEach(t => t.classList.toggle('is-on', +t.dataset.i === idx));
    const s = slides[idx];
    $('#pvCap').textContent = s.card ? s.caption : (s.rep ? 'Representative interior · not this building' : (s.caption || ''));
    $('#pvCount').textContent = `${pad2(idx + 1)} / ${pad2(n)}`;
    $('#pvZoom').hidden = !!s.card;
    const th = $(`.pv__thumb[data-i="${idx}"]`); if (th && !instant) th.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function facts(p) {
    const rows = [['Neighborhood', hood(p)], ['Borough', p.borough], ['Stories', p.stories], ['Apartments', p.apartments], ['Status', p.status === 'completed' ? 'Completed' : 'In construction'], ['Year completed', p.year || '—']];
    return rows.map(([k, v]) => `<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('');
  }

  async function locator(p) {
    const box = $('#pvLoc');
    if (!webgl()) { box.hidden = true; return; }
    try {
      const ml = await loadMapLibre();
      if (!locMap) {
        locMap = new ml.Map({ container: box, style: MAP_STYLE, center: [p.lng, p.lat], zoom: 14.2, interactive: false, attributionControl: { compact: true }, fadeDuration: 0 });
        locMap.on('load', () => tuneStyle(locMap));
        const d = document.createElement('div'); d.className = 'mk';
        locMarker = new ml.Marker({ element: d }).setLngLat([p.lng, p.lat]).addTo(locMap);
      } else {
        locMap.resize();
        locMap.jumpTo({ center: [p.lng, p.lat], zoom: 14.2 });
        locMarker.setLngLat([p.lng, p.lat]);
      }
      locMarker.getElement().className = 'mk' + (p.status === 'completed' ? '' : ' mk--wip');
    } catch (e) { box.hidden = true; }
  }

  function fill(p) {
    cur = p; set = 'exterior';
    const order = P, i = order.indexOf(p);
    $('#pvIdx').textContent = `${pad2(i + 1)} of ${order.length}`;
    const st = $('#pvStatus'); st.textContent = statusLine(p); st.classList.toggle('is-wip', p.status !== 'completed');
    $('#pvAddr').textContent = p.address;
    $('#pvName').textContent = '';  // listing names are never shown: addresses only
    $('#pvFacts').innerHTML = facts(p);
    const ext = $('#pvExt');
    if (p.link) { ext.hidden = false; ext.href = p.link.url; ext.innerHTML = `View on ${esc(p.link.source)} <svg aria-hidden="true"><use href="#i-ext"/></svg>`; } else ext.hidden = true;
    const prev = order[(i - 1 + order.length) % order.length], next = order[(i + 1) % order.length];
    $('#pvPrev span').textContent = prev.address; $('#pvPrev').dataset.slug = prev.slug;
    $('#pvNext span').textContent = next.address; $('#pvNext').dataset.slug = next.slug;
    document.title = `${p.address}, ${p.borough} · Boulder Builders`;
    // hero: the first real photo, or the address card
    const x = (p.exterior || [])[0];
    const hx = x && x.wide ? x.wide : x;
    $('#pvHero').innerHTML = x
      ? `<img class="bg" src="${esc(x.sm)}" alt="" aria-hidden="true"><img class="h" src="${esc(hx.src)}" width="${hx.w}" height="${hx.h}" alt="${esc(x.alt)}"><span class="pv__herocap">${esc(x.caption || '')}</span>`
      : addrCard(p);
    $('#pvHero').classList.toggle('is-wide', !!(x && x.wide));
    $('#pvHero').style.setProperty('--ar', x ? (MOBILE ? (x.w / x.h) : (hx.w / hx.h)) : 0.8);
    if (x && MOBILE) $('#pvHero .h').src = x.src;
    $('#pvDesc').innerHTML = (p.description || []).map(t => `<p>${esc(t)}</p>`).join('');
    renderSet();
    locator(p);
  }

  const baseTitle = document.title;
  function open(slug) {
    const p = bySlug(slug); if (!p) return;
    const was = isOpen;
    if (!was) lastFocus = document.activeElement;
    fill(p);
    const src = fromCard; fromCard = null;
    pv.scrollTop = 0;
    if (!was) {
      isOpen = true; pv.hidden = false;
      document.documentElement.classList.add('pv-open');
      lenis() && lenis().stop();
      const heads = $$('.pv__head > *, .pv__facts > div');
      if (window.gsap && !REDUCED && src) {
        // the photo grows from its card into the project's hero frame
        const to = $('#pvHero').getBoundingClientRect();
        const ghost = document.createElement('div'); ghost.className = 'xfer';
        ghost.innerHTML = `<img src="${esc(src.src)}" alt="">`;
        Object.assign(ghost.style, { left: src.r.left + 'px', top: src.r.top + 'px', width: src.r.width + 'px', height: src.r.height + 'px' });
        document.body.appendChild(ghost);
        gsap.set(pv, { opacity: 0 });
        gsap.timeline({ onComplete: () => ghost.parentNode && ghost.parentNode.removeChild(ghost) })
          .to(ghost, { left: to.left, top: to.top, width: to.width, height: to.height, duration: 1.0, ease: 'expo.inOut' })
          .to(pv, { opacity: 1, duration: .45, ease: 'power1.out', clearProps: 'opacity' }, .55)
          .to(ghost, { opacity: 0, duration: .35, ease: 'power1.out' }, '>-.05')
          .from(heads, { y: 26, opacity: 0, duration: 1, ease: 'expo.out', stagger: .04 }, .7);
      } else if (window.gsap && !REDUCED) {
        gsap.fromTo(pv, { clipPath: 'inset(100% 0% 0% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: 1.0, ease: 'expo.inOut', clearProps: 'clipPath' });
        gsap.from($$('.pv__head > *, .pv__hero, .pv__facts > div'), { y: 30, opacity: 0, duration: 1.1, ease: 'expo.out', stagger: 0.04, delay: 0.4 });
      }
      setTimeout(() => $('#pvClose').focus({ preventScroll: true }), 60);
    } else if (window.gsap && !REDUCED) {
      gsap.from($$('.pv__head > *, .pv__hero, .pv__facts > div'), { y: 18, opacity: 0, duration: 0.9, ease: 'expo.out', stagger: 0.03 });
    }
  }

  function close(fromHash) {
    if (!isOpen) return;
    isOpen = false;
    const done = () => {
      pv.hidden = true; document.documentElement.classList.remove('pv-open');
      lenis() && lenis().start();
      document.title = baseTitle;
      if (lastFocus && lastFocus.focus) lastFocus.focus({ preventScroll: true });
    };
    if (window.gsap && !REDUCED) gsap.to(pv, { clipPath: 'inset(0% 0% 100% 0%)', duration: 0.8, ease: 'expo.inOut', onComplete: () => { gsap.set(pv, { clearProps: 'clipPath' }); done(); } });
    else done();
    if (!fromHash && location.hash.startsWith('#project/')) history.pushState(null, '', location.pathname + location.search);
  }

  // deep links: #project/<slug>
  function go(slug) { if (location.hash !== '#project/' + slug) history.pushState(null, '', '#project/' + slug); open(slug); }
  function route() {
    const m = location.hash.match(/^#project\/([a-z0-9-]+)$/);
    if (m) open(m[1]); else close(true);
  }
  addEventListener('popstate', route);
  addEventListener('hashchange', route);
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#project/"]');
    if (!a) return;
    e.preventDefault(); e.stopPropagation();
    if (a.closest('.is-drag')) return; // the end of a carousel drag is not a click
    const im = a.querySelector('.fcard__media img, .feature__media img');
    fromCard = im ? { r: im.parentNode.getBoundingClientRect(), src: im.currentSrc || im.src } : null;
    go(a.getAttribute('href').slice(9));
  }, true);

  function initProjectView() {
    $('#pvClose').addEventListener('click', () => close());
    $('#pvPrev').addEventListener('click', e => go(e.currentTarget.dataset.slug));
    $('#pvPrevTop').addEventListener('click', () => go($('#pvPrev').dataset.slug));
    $('#pvNextTop').addEventListener('click', () => go($('#pvNext').dataset.slug));
    $('#pvNext').addEventListener('click', e => go(e.currentTarget.dataset.slug));
    $('#pvPrevImg').addEventListener('click', () => show(idx - 1));
    $('#pvNextImg').addEventListener('click', () => show(idx + 1));
    $('#pvThumbs').addEventListener('click', e => { const t = e.target.closest('.pv__thumb'); if (t) show(+t.dataset.i); });
    $$('.pv__tab').forEach(t => t.addEventListener('click', () => { if (set !== t.dataset.set) { set = t.dataset.set; renderSet(); } }));
    $('#pvZoom').addEventListener('click', openLightbox);
    $('#pvHero').addEventListener('click', () => { if (!(cur.exterior || []).length) return; if (set !== 'exterior') { set = 'exterior'; renderSet(); } show(0); openLightbox(); });
    $('#pvStart').addEventListener('click', e => {
      e.preventDefault(); e.stopPropagation();
      const p = cur; close();
      const type = p.stories <= 6 ? 'Low-rise' : p.stories <= 12 ? 'Mid-rise' : 'High-rise';
      const r = document.querySelector(`input[name=type][value="${type}"]`); if (r) { r.checked = true; r.dispatchEvent(new Event('change', { bubbles: true })); }
      const st = $('#fStories'), rg = $('#fStoriesRange'); st.value = p.stories; rg.value = Math.min(60, Math.max(3, p.stories)); st.dataset.touched = '1';
      setTimeout(() => window.__bbScrollTo ? window.__bbScrollTo('#bid') : $('#bid').scrollIntoView(), REDUCED ? 0 : 850);
    }, true);
    // swipe / drag on the stage; a plain click opens the lightbox
    let sx = 0, sy = 0, down = false, dragged = false;
    stage.addEventListener('pointerdown', e => { down = true; dragged = false; sx = e.clientX; sy = e.clientY; });
    stage.addEventListener('pointermove', e => { if (down && Math.abs(e.clientX - sx) > 8) dragged = true; });
    stage.addEventListener('pointerup', e => {
      if (!down) return; down = false;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy)) show(idx + (dx < 0 ? 1 : -1));
      else if (!dragged && !slides[idx].card && e.pointerType === 'mouse') openLightbox();
    });
    stage.addEventListener('pointercancel', () => { down = false; });
    addEventListener('keydown', e => {
      if (!$('#lb').hidden) { if (e.key === 'Escape') closeLightbox(); if (e.key === 'ArrowRight') { show(idx + 1); lbFill(); } if (e.key === 'ArrowLeft') { show(idx - 1); lbFill(); } return; }
      if (!isOpen) return;
      if (e.key === 'Escape') close();
      if (e.key === 'ArrowRight' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) show(idx + 1);
      if (e.key === 'ArrowLeft' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) show(idx - 1);
      if (e.key === 'Tab') { // keep focus inside the dialog
        const f = $$('button:not([hidden]), a[href]:not([hidden]), [tabindex="0"]', pv).filter(el => el.offsetParent !== null);
        if (!f.length) return;
        if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
        else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
      }
    });
  }

  /* ---------------- lightbox ---------------- */
  const lb = $('#lb');
  function lbFill() {
    const s = slides[idx]; if (!s || s.card) return closeLightbox();
    // never shown larger than the photo's own pixels
    $('#lbImg').innerHTML = `<img src="${esc(s.src)}" alt="${esc(s.alt)}" style="--nw:${s.w || 9999}px;--nh:${s.h || 9999}px">`;
    $('#lbCap').textContent = `${cur.address} · ${s.rep ? 'Representative interior · not this building' : (s.caption || '')}`;
    lb.classList.remove('is-zoom');
  }
  function openLightbox() { if (slides[idx].card) return; lbFill(); lb.hidden = false; $('#lbClose').focus({ preventScroll: true }); }
  function closeLightbox() { lb.hidden = true; lb.classList.remove('is-zoom'); $('#pvZoom').focus({ preventScroll: true }); }
  $('#lbClose').addEventListener('click', e => { e.stopPropagation(); closeLightbox(); });
  lb.addEventListener('click', e => {
    if (e.target.closest('#lbClose')) return;
    const r = $('#lbImg').getBoundingClientRect();
    lb.style.setProperty('--ox', ((e.clientX - r.left) / r.width * 100) + '%');
    lb.style.setProperty('--oy', ((e.clientY - r.top) / r.height * 100) + '%');
    lb.classList.toggle('is-zoom');
  });
  lb.addEventListener('pointermove', e => {
    if (!lb.classList.contains('is-zoom')) return;
    const r = $('#lbImg').getBoundingClientRect();
    const img = $('#lbImg img'); if (img) img.style.transformOrigin = `${(e.clientX - r.left) / r.width * 100}% ${(e.clientY - r.top) / r.height * 100}%`;
  });

  /* ---------------- quick contact ---------------- */
  function initTalk() {
    const btn = $('#talkBtn'), triggers = $$('[data-talk]'), panel = $('#talk'), scrim = $('#talkScrim'), form = $('#talkForm');
    const cfg = window.BB_CONFIG || {};
    const bits = [];
    if (cfg.phone) bits.push(`<a href="tel:${esc(cfg.phone.replace(/[^\d+]/g, ''))}">${esc(cfg.phone)}</a>`);
    if (cfg.email) bits.push(`<a href="mailto:${esc(cfg.email)}">${esc(cfg.email)}</a>`);
    if (bits.length) { $('#talkContact').innerHTML = bits.join(' · '); $('#talkContact').hidden = false; $('#footContact').innerHTML = bits.join('<br>'); $('#footContact').hidden = false; }
    let last = null;
    const openP = () => { last = document.activeElement; panel.hidden = false; scrim.hidden = false; requestAnimationFrame(() => { panel.classList.add('is-on'); scrim.classList.add('is-on'); }); btn.setAttribute('aria-expanded', 'true'); lenis() && lenis().stop(); setTimeout(() => $('#tName').focus({ preventScroll: true }), 400); };
    const closeP = () => { panel.classList.remove('is-on'); scrim.classList.remove('is-on'); btn.setAttribute('aria-expanded', 'false'); lenis() && !isOpen && lenis().start(); setTimeout(() => { panel.hidden = true; scrim.hidden = true; }, REDUCED ? 0 : 700); last && last.focus && last.focus({ preventScroll: true }); };
    triggers.forEach(t => t.addEventListener('click', openP));
    $('#talkClose').addEventListener('click', closeP);
    scrim.addEventListener('click', closeP);
    addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) closeP(); });
    const bad = (el, on) => el.closest('.field').classList.toggle('is-bad', on);
    form.addEventListener('input', e => { const f = e.target.closest('.field'); f && f.classList.remove('is-bad'); });
    form.addEventListener('submit', e => {
      e.preventDefault();
      const n = $('#tName'), r = $('#tReach'), m = $('#tMsg');
      const reachOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(r.value.trim()) || r.value.replace(/\D/g, '').length >= 10;
      bad(n, !n.value.trim()); bad(r, !reachOk); bad(m, !m.value.trim());
      if (!n.value.trim() || !reachOk || !m.value.trim()) return;
      // live (November 24, 2026): the note goes to the Boulder Builders CRM through window.bbSend
      const show = () => { form.hidden = true; $('#talkDone').hidden = false; $('#talkDone').focus({ preventScroll: true }); };
      const hp = form.querySelector('input[name=website]');
      if (hp && hp.value) return show();   // honeypot filled: a bot, so nothing is sent
      const reach = r.value.trim(), isMail = reach.includes('@'), sendBtn = form.querySelector('button[type=submit]'), err = $('#talkErr');
      err.hidden = true; sendBtn.disabled = true;
      window.bbSend({ form: 'contact', source: 'Website: quick contact', name: n.value.trim(), email: isMail ? reach : '', phone: isMail ? '' : reach, message: m.value.trim() })
        .then(show, () => { err.hidden = false; }).finally(() => { sendBtn.disabled = false; });
    });
    $('#talkAgain').addEventListener('click', () => { form.reset(); form.hidden = false; $('#talkDone').hidden = true; });
  }

  /* ---------------- boot ---------------- */
  initCarousel();
  initCounters();
  initList();
  initProjectView();
  initTalk();
  window.__bbPortfolio = { open: go, close };
  if (location.hash.startsWith('#project/')) setTimeout(route, REDUCED ? 0 : 1700);
})();
