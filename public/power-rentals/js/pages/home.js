/* Home: live "in the yard" card and category grid, repainted whenever the store changes (in this tab or another). */
(function () {
  'use strict';
  const { h, icon, availLine } = PR.ui, E = PR.engine, D = PR.data;
  function paint() {
    const ev = E.events();
    const list = document.getElementById('yardList'); list.textContent = '';
    D.categories.forEach(c => list.appendChild(h('li', h('a', { href: 'equipment.html#' + c.id }, icon(c.icon), h('span.yc-name', c.name), availLine(E.categorySummary(c.id, E.today(), ev))))));
    const grid = document.getElementById('catGrid'); grid.textContent = '';
    D.categories.forEach(c => {
      const sum = E.categorySummary(c.id, E.today(), ev);
      grid.appendChild(h('article.card.cat',
        h('div.cat-top', h('span.cat-ico', icon(c.icon)), h('h3', c.name)),
        h('p.mute', c.blurb), availLine(sum),
        h('div.cat-actions', h('a.btn.btn-gold.btn-sm', { href: 'book.html?cat=' + c.id }, 'Book'), h('a.btn.btn-line.btn-sm', { href: 'equipment.html#' + c.id }, 'Sizes and models'))));
    });
  }
  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('.fi').forEach(el => { const n = el.textContent; el.textContent = ''; el.appendChild(icon(n)); });
    paint(); PR.store.subscribe(paint);
  });
})();
