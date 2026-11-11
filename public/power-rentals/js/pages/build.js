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

  document.addEventListener('DOMContentLoaded', () => {
    /* Keep each half of a price together when it wraps: "$10,000 build" + "$1,000 / mo". */
    document.querySelectorAll('[data-price]').forEach(el => {
      const parts = (PRICES[el.dataset.price] || '').split(' + ');
      el.textContent = parts.length > 1 ? '' : parts[0];
      if (parts.length > 1) parts.forEach((part, i) => {
        if (i) el.append(' + ');
        const s = document.createElement('span'); s.className = 'nb'; s.textContent = part; el.append(s);
      });
    });
    document.querySelectorAll('[data-agent]').forEach(el => { el.textContent = AGENTS[el.dataset.agent] || ''; });
  });
})();
