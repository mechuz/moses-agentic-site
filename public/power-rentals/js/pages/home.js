/* Home: the fleet as product tiles and the live yard list, repainted whenever the store changes (this tab or another). */
(function () {
  'use strict';
  const { h, availLine } = PR.ui, E = PR.engine, D = PR.data;

  function shot(src, kind, alt) {
    if (!src) return h('div.shot.none', 'Photo to come');
    return h('div.shot.' + (kind || 'photo'), h('img', { src, alt, loading: 'lazy' }));
  }

  function paint() {
    const ev = E.events(), today = E.today();
    const grid = document.getElementById('catGrid'); grid.textContent = '';
    D.categories.forEach(c => {
      const first = D.models.find(m => m.cat === c.id);
      grid.appendChild(h('article.tile',
        shot(c.img, c.imgKind, c.name),
        h('div.tile-body',
          h('h3', c.name),
          h('p.mute', c.tagline),
          availLine(E.categorySummary(c.id, today, ev)),
          h('div.tile-links', h('a.more', { href: 'product.html?model=' + first.id }, 'Rent'), h('a.more', { href: 'equipment.html#' + c.id }, 'All sizes')))));
    });
    const list = document.getElementById('yardList'); list.textContent = '';
    D.categories.forEach(c => {
      const s = E.categorySummary(c.id, today, ev);
      list.appendChild(h('li', h('a', { href: 'equipment.html#' + c.id },
        h('span.yl-name', c.name),
        h('span.yl-num', h('b', String(s.free)), ' of ' + s.total),
        h('span.yl-dot.' + s.level, { 'aria-hidden': 'true' }),
        h('span.yl-next', s.free ? 'Available now' : s.nextBack ? 'Next back ' + E.fmt.rel(s.nextBack) : 'All out'))));
    });
  }
  document.addEventListener('DOMContentLoaded', () => { paint(); PR.store.subscribe(paint); });
})();
