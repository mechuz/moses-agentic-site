/* How this was built and what it costs (Moses Agentic's page inside the preview).
   Every price on the page is read from PR.config.pricing, so a change there updates this page.
   Prices are always written as "$10,000 build + $1,000 / mo", never as a year-one total. */
(function () {
  'use strict';
  const P = PR.config.pricing, money = PR.engine.fmt.money;

  /* The price of n agents in the house format. */
  const priceFor = n => money(n * P.buildPerAgent) + ' build + ' + money(n * P.monthlyPerAgent) + ' / mo';
  /* All six agents in the proposal. */
  const ALL_AGENTS = 6;

  const PRICES = {
    '1': priceFor(1),
    rec: priceFor(P.recommended.length),
    '6': priceFor(ALL_AGENTS),
    own: money(P.buildPerAgent) + ' per agent, no monthly fee'
  };
  const AGENTS = { web: P.websiteAgent, rec: P.recommended.join(' + ') };

  /* One half of a price, e.g. "$10,000 build": the figure in a .num span (styled large),
     the words after it as plain text. The text content stays exactly the house format. */
  function half(text) {
    const s = document.createElement('span'); s.className = 'nb';
    const i = text.indexOf(' ');
    const num = document.createElement('span'); num.className = 'num'; num.textContent = i < 0 ? text : text.slice(0, i);
    s.append(num);
    if (i >= 0) s.append(text.slice(i));
    return s;
  }

  document.addEventListener('DOMContentLoaded', () => {
    /* Keep each half of a price together when it wraps: "$10,000 build" + "$1,000 / mo". */
    document.querySelectorAll('[data-price]').forEach(el => {
      el.textContent = '';
      (PRICES[el.dataset.price] || '').split(' + ').forEach((part, i) => {
        if (i) el.append(' + ');
        el.append(half(part));
      });
    });
    document.querySelectorAll('[data-agent]').forEach(el => { el.textContent = AGENTS[el.dataset.agent] || ''; });
  });
})();
