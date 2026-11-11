/* Power Rentals demo · the order (cart). Amazon-style: "Rent now" goes straight to checkout with one item;
   "Add to order" collects several. Items: {model, start (YYYY-MM-DD), days}. Lives in this browser, synced across tabs. */
window.PR = window.PR || {};
(function () {
  'use strict';
  const KEY = 'pr_cart_v1', subs = new Set();
  let mem = [];
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || '[]'); } catch (e) { return mem; } };
  const write = list => { mem = list; try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) {} subs.forEach(f => f(list)); };
  window.addEventListener('storage', e => { if (e.key === KEY) subs.forEach(f => f(read())); });
  PR.cart = {
    items: read,
    count: () => read().length,
    add(item) { const l = read(); l.push(Object.assign({ id: 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5) }, item)); write(l); return l; },
    update(id, patch) { write(read().map(i => i.id === id ? Object.assign({}, i, patch) : i)); },
    remove(id) { write(read().filter(i => i.id !== id)); },
    clear() { write([]); },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); }
  };
})();
