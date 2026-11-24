// Boulder Builders · website concept · page interactions
(function () {
  const gsap = window.gsap, ScrollTrigger = window.ScrollTrigger;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const mq = q => window.matchMedia(q).matches;
  const REDUCED = mq('(prefers-reduced-motion: reduce)') || /[?&]static\b/.test(location.search);
  const MOBILE = mq('(max-width: 899px)');
  const FINE = mq('(hover: hover) and (pointer: fine)');
  const HAS_GSAP = !!(gsap && ScrollTrigger);
  const MOTION = HAS_GSAP && !REDUCED;
  const pad2 = n => String(n).padStart(2, '0');
  // dates always month first, en-US, never the browser's locale
  const fmtDate = d => d.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
  if (HAS_GSAP) gsap.registerPlugin(ScrollTrigger);
  document.documentElement.classList.toggle('reduced', REDUCED);

  /* ---------- smooth scroll ---------- */
  let lenis = null;
  if (MOTION && window.Lenis) {
    lenis = new window.Lenis({ lerp: 0.09, smoothWheel: true });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(t => lenis.raf(t * 1000));
    gsap.ticker.lagSmoothing(0);
    window.__lenis = lenis;
  }
  const HDR = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--hdr')) || 68;
  const scrollTo = target => {
    if (target === 0) return lenis ? lenis.scrollTo(0, { duration: 1.4 }) : window.scrollTo({ top: 0, behavior: REDUCED ? 'auto' : 'smooth' });
    const el = $(target); if (!el) return;
    const off = el.id === 'bid' ? -(HDR() + 16) : (el.tagName === 'SECTION' ? 0 : -HDR());
    if (lenis) lenis.scrollTo(el, { offset: off, duration: 1.4 });
    else window.scrollTo({ top: el.getBoundingClientRect().top + scrollY + off, behavior: REDUCED ? 'auto' : 'smooth' });
  };
  window.__bbScrollTo = scrollTo;
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a || a.getAttribute('href').startsWith('#project/')) return;
    const id = a.getAttribute('href');
    if (id.length < 2) return;
    e.preventDefault();
    closeMenu();
    scrollTo(id === '#top' ? 0 : id);
  });

  /* ---------- top navigation: over the photo, then hides going down and returns going up ---------- */
  const nav = $('#nav');
  function initNav() {
    const hero = $('#hero'), links = $$('.nav__links a');
    const secs = ['hero', 'about', 'work', 'map', 'team', 'model', 'process', 'estimator', 'developers'].map(id => document.getElementById(id)).filter(Boolean);
    const linkFor = { work: '#work', map: '#map', team: '#team', model: '#team', process: '#process', estimator: '#estimator' };
    let lastY = scrollY;
    const update = () => {
      const y = scrollY, over = hero && y < hero.offsetHeight - HDR() - 4;
      nav.classList.toggle('is-over', !!over);
      if (!document.documentElement.classList.contains('menu-open')) {
        if (y > lastY + 4 && y > 160) nav.classList.add('is-hidden');
        else if (y < lastY - 4 || y < 160) nav.classList.remove('is-hidden');
      }
      lastY = y;
      const mid = innerHeight * 0.4;
      let cur = 'hero';
      for (const s of secs) { const r = s.getBoundingClientRect(); if (r.top <= mid && r.bottom > mid) cur = s.id; }
      links.forEach(l => l.classList.toggle('is-on', l.getAttribute('href') === linkFor[cur]));
    };
    update();
    if (lenis) lenis.on('scroll', update);
    window.addEventListener('scroll', update, { passive: true });
    nav.addEventListener('focusin', () => nav.classList.remove('is-hidden'));
  }

  /* ---------- phone menu ---------- */
  const menu = $('#menu'), menuBtn = $('#menuBtn');
  function closeMenu() {
    if (!menu || menu.hidden) return;
    menu.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); menuBtn.setAttribute('aria-label', 'Open the menu');
    document.documentElement.classList.remove('menu-open'); lenis && lenis.start();
  }
  function initMenu() {
    menuBtn.addEventListener('click', () => {
      if (!menu.hidden) return closeMenu();
      menu.hidden = false; menuBtn.setAttribute('aria-expanded', 'true'); menuBtn.setAttribute('aria-label', 'Close the menu');
      document.documentElement.classList.add('menu-open'); lenis && lenis.stop();
      if (MOTION) gsap.from($$('.menu__links a, .menu__talk', menu), { y: 24, opacity: 0, duration: .8, ease: 'expo.out', stagger: .05 });
    });
    $$('[data-talk]', menu).forEach(b => b.addEventListener('click', closeMenu));
    addEventListener('keydown', e => { if (e.key === 'Escape') closeMenu(); });
    addEventListener('resize', () => { if (innerWidth > 980) closeMenu(); });
  }

  /* ---------- headings: words rise out of a mask ---------- */
  function splitWords(el) {
    let i = 0;
    const walk = node => {
      [...node.childNodes].forEach(n => {
        if (n.nodeType === 3) {
          const frag = document.createDocumentFragment();
          n.textContent.split(/(\s+)/).forEach(t => {
            if (!t) return;
            if (/^\s+$/.test(t)) { frag.appendChild(document.createTextNode(t)); return; }
            const w = document.createElement('span'); w.className = 'w';
            const wi = document.createElement('span'); wi.className = 'wi'; wi.style.setProperty('--i', i++); wi.textContent = t;
            w.appendChild(wi); frag.appendChild(w);
          });
          n.replaceWith(frag);
        } else if (n.nodeType === 1 && n.tagName !== 'BR') walk(n);
      });
    };
    walk(el); el.classList.add('is-split');
  }
  function initSplit() {
    if (REDUCED) return;
    const els = $$('[data-split]');
    els.forEach(splitWords);
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -12% 0px' });
    els.forEach(e => { if (!e.closest('.hero')) io.observe(e); });
  }

  /* ---------- first screen: line-by-line entrance, parallax on scroll ---------- */
  function initHero() {
    const hero = $('#hero'); if (!hero) return;
    const heads = $$('.hero [data-split]');
    if (!MOTION) { heads.forEach(h => h.classList.add('is-in')); return; }
    gsap.from('.hero__pan img', { scale: MOBILE ? 1.18 : 1.1, duration: 2.4, ease: 'expo.out' });
    if (!MOBILE) gsap.from('.hero__media', { clipPath: 'inset(0% 0% 0% 100%)', duration: 1.5, ease: 'expo.inOut', clearProps: 'clipPath' });
    gsap.from('.hero__shade', { opacity: 0, duration: 1.6, ease: 'power2.out' });
    gsap.from('.hero__k', { y: 16, opacity: 0, duration: 1, ease: 'expo.out', delay: .25 });
    setTimeout(() => heads[0] && heads[0].classList.add('is-in'), 380);
    setTimeout(() => heads[1] && heads[1].classList.add('is-in'), 620);
    gsap.from('.hero__cta > *', { y: 20, opacity: 0, duration: 1, ease: 'expo.out', stagger: .08, delay: 1.0 });
    gsap.from('.hero__cap, .hero__cue', { opacity: 0, duration: 1.2, ease: 'power2.out', delay: 1.3 });
    gsap.from(nav, { y: -20, opacity: 0, duration: 1, ease: 'expo.out', delay: .2, clearProps: 'transform,opacity' });
    gsap.to('.hero__pan', { yPercent: 14, ease: 'none', scrollTrigger: { trigger: hero, start: 'top top', end: 'bottom top', scrub: true } });
    gsap.to('.hero__in', { y: -80, opacity: 0, ease: 'none', scrollTrigger: { trigger: hero, start: '25% top', end: '85% top', scrub: true } });
  }

  /* ---------- image parallax inside its frame ---------- */
  function initParallax() {
    if (!MOTION) return;
    $$('[data-par]').forEach(box => {
      const media = box.querySelector('img, video'); if (!media) return;
      gsap.fromTo(media, { yPercent: -6 }, { yPercent: 6, ease: 'none', scrollTrigger: { trigger: box, start: 'top bottom', end: 'bottom top', scrub: true } });
    });
  }

  /* ---------- fades ---------- */
  function initReveals() {
    const els = $$('.reveal');
    if (REDUCED || !('IntersectionObserver' in window)) { els.forEach(e => e.classList.add('is-in')); return; }
    const io = new IntersectionObserver(es => es.forEach(en => { if (en.isIntersecting) { en.target.classList.add('is-in'); io.unobserve(en.target); } }), { rootMargin: '0px 0px -10% 0px' });
    els.forEach(e => io.observe(e));
  }

  /* ---------- neighborhood ticker from the record ---------- */
  function initMarquee() {
    const t = $('#marquee'); if (!t) return;
    let names = [];
    try { names = [...new Set(JSON.parse($('#bbData').textContent).projects.map(p => p.neighborhood.split(' / ')[0].replace(/ \(.*\)/, '')))]; } catch (e) { names = ['Brooklyn', 'Queens', 'the Bronx']; }
    const row = names.map((n, i) => `<span class="${i % 2 ? 's' : ''}">${n}</span><i></i>`).join('');
    t.innerHTML = row + row;
    if (REDUCED) t.style.animation = 'none';
  }

  /* ---------- buttons follow the pointer a little ---------- */
  function initMagnetic() {
    if (!FINE || REDUCED) return;
    $$('.btn:not(.btn--sm), .sq').forEach(el => {
      el.addEventListener('pointermove', e => { const r = el.getBoundingClientRect(); el.style.setProperty('--tx', ((e.clientX - r.left - r.width / 2) * .14).toFixed(1) + 'px'); el.style.setProperty('--ty', ((e.clientY - r.top - r.height / 2) * .22).toFixed(1) + 'px'); });
      el.addEventListener('pointerleave', () => { el.style.setProperty('--tx', '0px'); el.style.setProperty('--ty', '0px'); });
    });
  }

  /* ---------- band video: play only while on screen ---------- */
  function initBand() {
    const v = $('#bandVideo');
    if (!v || REDUCED || !('IntersectionObserver' in window)) return;
    v.preload = 'auto';
    const io = new IntersectionObserver(es => es.forEach(e => { if (e.isIntersecting) { const p = v.play(); p && p.catch(() => {}); } else v.pause(); }), { threshold: 0.05 });
    io.observe(v);
  }

  /* ---------- how we work: pinned, the photo follows the step ---------- */
  function initProcess() {
    const sec = $('#process'), steps = $$('.step', sec), media = $$('.pm', sec), now = $('#stepNow');
    let active = 0;
    const set = i => {
      if (i === active) return;
      media.forEach((m, k) => { m.classList.toggle('was-on', k === active); m.classList.toggle('is-on', k === i); });
      active = i;
      steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
      if (now) now.textContent = pad2(i + 1);
    };
    if (MOBILE || !MOTION) {
      sec.classList.add('is-stack');
      steps.forEach((s, i) => { s.classList.add('is-on'); const src = media[i].querySelector('img'); const im = document.createElement('img'); im.className = 'step__img'; im.src = src.getAttribute('src').replace(/step-(\d)\.webp/, 'step-$1-sm.webp'); im.alt = src.alt; im.loading = 'lazy'; s.querySelector('div').appendChild(im); });
      return;
    }
    steps.forEach((s, i) => s.addEventListener('mouseenter', () => set(i)));
    ScrollTrigger.create({
      trigger: sec, start: 'top top+=' + HDR(), end: () => '+=' + Math.round(innerHeight * 2.6), pin: '.process__pin', scrub: true, anticipatePin: 1,
      onUpdate: s => set(Math.min(5, Math.floor(s.progress * 6)))
    });
  }

  /* ---------- request a bid ---------- */
  // Brooklyn and Manhattan lead (November 22, 2026); any other borough is still welcome
  const HOODS = {
    Brooklyn: ['Bay Ridge', 'Bedford-Stuyvesant', 'Bensonhurst', 'Boerum Hill', 'Borough Park', 'Brooklyn Heights', 'Brownsville', 'Bushwick', 'Canarsie', 'Carroll Gardens', 'Clinton Hill', 'Coney Island', 'Crown Heights', 'Downtown Brooklyn', 'East Flatbush', 'East New York', 'Flatbush', 'Flatlands', 'Fort Greene', 'Gowanus', 'Gravesend', 'Greenpoint', 'Marine Park', 'Midwood', 'Park Slope', 'Prospect Heights', 'Prospect Lefferts Gardens', 'Red Hook', 'Sheepshead Bay', 'Sunset Park', 'Williamsburg', 'Elsewhere in Brooklyn'],
    Manhattan: ['Chelsea', 'Chinatown', 'East Harlem', 'East Village', 'Financial District', 'Gramercy', 'Greenwich Village', 'Hamilton Heights', 'Harlem', "Hell's Kitchen", 'Inwood', 'Kips Bay', 'Lower East Side', 'Midtown', 'Morningside Heights', 'Murray Hill', 'SoHo', 'Tribeca', 'Upper East Side', 'Upper West Side', 'Washington Heights', 'West Village', 'Elsewhere in Manhattan'],
    Other: ['Queens', 'The Bronx', 'Staten Island']
  };
  function initBid() {
    const sel = $('#fHood');
    const form = $('#bidForm'), steps = $$('.bstep', form), next = $('#bidNext'), back = $('#bidBack'), bar = $('#bidBar');
    const boro = () => (form.querySelector('input[name=borough]:checked') || {}).value || 'Brooklyn';
    const fillHoods = () => {
      const b = boro(), keep = sel.value, other = b === 'Other';
      $('#hoodLbl').textContent = other ? 'Which borough' : 'Neighborhood';
      sel.innerHTML = '';
      const first = document.createElement('option'); first.value = ''; first.textContent = other ? 'Choose a borough' : 'Choose a neighborhood in ' + b; sel.appendChild(first);
      HOODS[b].forEach(n => { const o = document.createElement('option'); o.value = o.textContent = n; sel.appendChild(o); });
      if (HOODS[b].includes(keep)) sel.value = keep;
      $('.err', sel.closest('.field')).textContent = other ? 'Choose a borough.' : 'Choose a neighborhood.';
    };
    fillHoods();
    form.addEventListener('change', e => { if (e.target.name === 'borough') { fillHoods(); sel.closest('.field').classList.remove('is-bad'); } });
    let step = 0, files = [];
    const range = $('#fStoriesRange'), stories = $('#fStories');
    range.addEventListener('input', () => { stories.value = range.value; stories.dataset.touched = '1'; });
    stories.addEventListener('input', () => { range.value = Math.min(60, Math.max(3, +stories.value || 3)); stories.dataset.touched = '1'; });
    form.addEventListener('change', e => { if (e.target.name === 'type' && !stories.dataset.touched) stories.value = range.value = e.target.value === 'High-rise' ? 24 : e.target.value === 'Low-rise' ? 4 : 8; });

    const due = $('#fDue');
    const today = new Date(); due.min = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
    const human = () => { $('#dueHuman').textContent = due.value ? 'Bids due ' + fmtDate(new Date(due.value + 'T00:00:00Z')) : ''; };
    due.addEventListener('input', human); due.addEventListener('change', human);

    const fi = $('#fFiles'), drop = $('#drop'), fl = $('#fileList');
    const size = n => n > 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB';
    const esc = s => s.replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const renderFiles = () => { fl.innerHTML = files.map(f => `<li>${esc(f.name)}<span>${size(f.size)}</span></li>`).join(''); };
    fi.addEventListener('change', () => { files = [...fi.files]; renderFiles(); drop.closest('.field').classList.remove('is-bad'); });
    ['dragenter', 'dragover'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(t => drop.addEventListener(t, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => { files = [...e.dataTransfer.files]; renderFiles(); });

    const bad = (el, on) => el.closest('.field').classList.toggle('is-bad', on);
    const validate = i => {
      let ok = true;
      if (i === 0) {
        bad(sel, !sel.value); ok = ok && !!sel.value;
        const t = form.querySelector('input[name=type]:checked'); bad($('.seg', form), !t); ok = ok && !!t;
        const s = +stories.value; const sOk = s >= 1 && s <= 120; bad(stories, !sOk); ok = ok && sOk;
        const u = $('#fUnits'); const uOk = Number.isInteger(+u.value) && +u.value >= 20 && +u.value <= 99; bad(u, !uOk); ok = ok && uOk;
      }
      if (i === 1) {
        const fOk = files.length > 0 || $('#fLater').checked; bad(drop, !fOk); ok = ok && fOk;
        const dOk = !!due.value && due.value >= due.min; bad(due, !dOk); ok = ok && dOk;
      }
      if (i === 2) {
        const n = $('#fName'); bad(n, !n.value.trim()); ok = ok && !!n.value.trim();
        const em = $('#fEmail'); const eOk = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim()); bad(em, !eOk); ok = ok && eOk;
      }
      if (!ok) { const f = $('.is-bad input, .is-bad select', steps[i]); f && f.focus({ preventScroll: true }); }
      return ok;
    };
    form.addEventListener('input', e => { const f = e.target.closest('.field'); f && f.classList.remove('is-bad'); });
    $('#fLater').addEventListener('change', () => drop.closest('.field').classList.remove('is-bad'));

    const go = i => {
      step = i;
      steps.forEach((s, k) => s.classList.toggle('is-on', k === i));
      $('#bidStepNum').textContent = i + 1;
      bar.style.transform = `scaleX(${(i + 1) / 3})`;
      back.hidden = i === 0;
      next.innerHTML = (i === 2 ? 'Send request' : 'Next') + ' <svg><use href="#i-arrow"/></svg>';
    };
    next.addEventListener('click', () => {
      if (!validate(step)) return;
      if (step < 2) return go(step + 1);
      // live (November 24, 2026): the request goes to the Boulder Builders CRM through window.bbSend
      const data = new FormData(form);
      const other = data.get('borough') === 'Other';
      const place = other ? data.get('neighborhood') : `${data.get('neighborhood')}, ${data.get('borough')}`;
      const summary = [data.get('type'), `${data.get('stories')} stories`, `${data.get('units')} apartments`, place,
        `bids due ${fmtDate(new Date(data.get('due') + 'T00:00:00Z'))}`,
        files.length ? `${files.length} drawing file${files.length > 1 ? 's' : ''}` : 'drawings to follow'].join(' · ');
      $('#doneSummary').textContent = summary + (data.get('estimate') ? `. Your estimate: ${data.get('estimate')}.` : '');
      const show = () => {
        form.hidden = true; $('#bid').classList.add('is-done');
        const done = $('#bidDone'); done.hidden = false; done.focus({ preventScroll: true });
        if ($('#bid').getBoundingClientRect().top < HDR()) scrollTo('#bid');
      };
      if (data.get('website')) return show();   // honeypot filled: a bot, so nothing is sent
      const err = $('#bidErr'); err.hidden = true; next.disabled = true;
      window.bbSend({
        form: 'bid', source: 'Website: bid request',
        name: (data.get('name') || '').trim(), company: (data.get('company') || '').trim(), role: data.get('role') || '',
        email: (data.get('email') || '').trim(), phone: (data.get('phone') || '').trim(), message: '',
        borough: other ? data.get('neighborhood') : data.get('borough'), neighborhood: other ? '' : data.get('neighborhood'), place,
        type: data.get('type'), stories: data.get('stories'), units: data.get('units'), due: data.get('due'),
        drawings: files.length ? `${files.length} file(s) chosen on the site; ask for them by email` : 'To follow: reply with where to upload them',
        estimate: data.get('estimate') || '', summary,
      }).then(show, () => { err.hidden = false; }).finally(() => { next.disabled = false; });
    });
    back.addEventListener('click', () => step > 0 && go(step - 1));
    $('#bidAgain').addEventListener('click', () => {
      form.reset(); files = []; renderFiles(); human(); delete stories.dataset.touched; fillHoods(); clearCarried();
      $$('.is-bad', form).forEach(f => f.classList.remove('is-bad'));
      form.hidden = false; $('#bidDone').hidden = true; $('#bid').classList.remove('is-done');
      go(0);
    });
    go(0);

    // carried over from the estimator (assets/js/estimator.js): borough, type, apartments and the estimate line
    const carried = $('#bidCarried');
    function clearCarried() { carried.hidden = true; $('#fEstimate').value = ''; }
    $('#bidCarriedClear').addEventListener('click', () => { clearCarried(); sel.focus(); });
    window.__bbBid = {
      prefill(d) {
        if (!$('#bidDone').hidden) $('#bidAgain').click();
        if (d.borough) { const r = form.querySelector(`input[name=borough][value="${d.borough}"]`); if (r && !r.checked) { r.checked = true; fillHoods(); } }
        if (d.type) {
          const r = form.querySelector(`input[name=type][value="${d.type}"]`); if (r) r.checked = true;
          const band = { 'Low-rise': [3, 6], 'Mid-rise': [7, 12], 'High-rise': [13, 60] }[d.type];
          const sv = +stories.value;
          if (band && (sv < band[0] || sv > band[1])) stories.value = range.value = sv < band[0] ? band[0] : band[1];
        }
        if (d.units) $('#fUnits').value = d.units;
        $('#fEstimate').value = d.summary || '';
        $('#bidCarriedText').textContent = d.summary || '';
        carried.hidden = !d.summary;
        $$('.is-bad', steps[0]).forEach(f => f.classList.remove('is-bad'));
        go(0);
      }
    };

    const br = $('#brochure');
    br.addEventListener('submit', e => {
      e.preventDefault();
      const em = $('#bEmail'), msg = $('.brochure__msg', br);
      const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(em.value.trim());
      msg.classList.toggle('is-err', !ok);
      msg.textContent = ok ? 'Thank you. This is a preview: nothing was sent to ' + em.value.trim() + '.' : 'Enter a valid work email.';
      if (ok) em.value = '';
    });
  }


  /* ---------- boot ---------- */
  initSplit();
  initBid();
  initNav();
  initMenu();
  initHero();
  initMarquee();
  initMagnetic();
  initBand();
  initProcess();
  initParallax();
  initReveals();
  if (HAS_GSAP) { ScrollTrigger.refresh(); addEventListener('load', () => ScrollTrigger.refresh()); }
  document.documentElement.classList.add('is-ready');
})();
