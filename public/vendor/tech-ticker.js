/* Technology-sector stock ticker.
   Uses TradingView's free ticker-tape widget (quotes come from TradingView; their credit link must stay visible).
   Nothing loads until mount() is called, and the tape is removed again if the widget never arrives (ad blockers, offline).
   Usage: MosesTicker.mount(element)            fills the element
          MosesTicker.mount(element, { theme: "dark" }) */
(function () {
  "use strict";
  /* Sector funds first, then the largest technology companies by group. */
  var SYMBOLS = [
    ["NASDAQ:QQQ", "Nasdaq 100"], ["AMEX:XLK", "Tech sector"], ["NASDAQ:SMH", "Semiconductors"], ["AMEX:IGV", "Software"],
    ["NASDAQ:NVDA", "Nvidia"], ["NASDAQ:MSFT", "Microsoft"], ["NASDAQ:AAPL", "Apple"], ["NASDAQ:GOOGL", "Alphabet"],
    ["NASDAQ:AMZN", "Amazon"], ["NASDAQ:META", "Meta"], ["NASDAQ:AVGO", "Broadcom"], ["NYSE:TSM", "TSMC"],
    ["NASDAQ:TSLA", "Tesla"], ["NYSE:ORCL", "Oracle"], ["NASDAQ:AMD", "AMD"], ["NASDAQ:PLTR", "Palantir"],
    ["NASDAQ:ASML", "ASML"], ["NASDAQ:NFLX", "Netflix"], ["NYSE:CRM", "Salesforce"], ["NASDAQ:CSCO", "Cisco"],
    ["NYSE:IBM", "IBM"], ["NASDAQ:ADBE", "Adobe"], ["NASDAQ:INTC", "Intel"], ["NASDAQ:QCOM", "Qualcomm"],
    ["NASDAQ:MU", "Micron"], ["NASDAQ:ARM", "Arm"], ["NASDAQ:AMAT", "Applied Materials"], ["NASDAQ:LRCX", "Lam Research"],
    ["NASDAQ:KLAC", "KLA"], ["NASDAQ:TXN", "Texas Instruments"], ["NASDAQ:MRVL", "Marvell"], ["NYSE:ANET", "Arista"],
    ["NYSE:DELL", "Dell"], ["NASDAQ:SMCI", "Supermicro"], ["NYSE:NOW", "ServiceNow"], ["NASDAQ:INTU", "Intuit"],
    ["NYSE:SNOW", "Snowflake"], ["NASDAQ:DDOG", "Datadog"], ["NASDAQ:PANW", "Palo Alto Networks"], ["NASDAQ:CRWD", "CrowdStrike"],
    ["NYSE:NET", "Cloudflare"], ["NASDAQ:CDNS", "Cadence"], ["NASDAQ:SNPS", "Synopsys"], ["NYSE:UBER", "Uber"],
    ["NASDAQ:SHOP", "Shopify"], ["NYSE:SAP", "SAP"], ["NYSE:SONY", "Sony"], ["NYSE:BABA", "Alibaba"],
    ["NYSE:SPOT", "Spotify"], ["NASDAQ:APP", "AppLovin"], ["NASDAQ:WDAY", "Workday"], ["NASDAQ:TEAM", "Atlassian"]
  ];

  function mount(el, opts) {
    if (!el || el.getAttribute("data-ticker")) return;
    el.setAttribute("data-ticker", "1");
    opts = opts || {};
    var box = document.createElement("div");
    box.className = "tradingview-widget-container";
    var inner = document.createElement("div");
    inner.className = "tradingview-widget-container__widget";
    box.appendChild(inner);
    var s = document.createElement("script");
    s.type = "text/javascript";
    s.async = true;
    s.src = "https://s3.tradingview.com/external-embedding/embed-widget-ticker-tape.js";
    s.text = JSON.stringify({
      symbols: SYMBOLS.map(function (p) { return { proName: p[0], title: p[1] }; }),
      showSymbolLogo: true,
      isTransparent: true,
      displayMode: "regular",
      colorTheme: opts.theme === "dark" ? "dark" : "light",
      locale: "en"
    });
    s.onerror = function () { el.textContent = ""; el.removeAttribute("data-ticker"); };
    box.appendChild(s);
    /* the credit TradingView asks for; screen readers and no-frame browsers get it as a plain link */
    var credit = document.createElement("a");
    credit.href = "https://www.tradingview.com/";
    credit.target = "_blank";
    credit.rel = "noopener nofollow";
    credit.className = "ticker-credit";
    credit.textContent = "Quotes by TradingView";
    el.appendChild(box);
    el.appendChild(credit);
    /* if nothing arrived after a while, take the empty band away */
    setTimeout(function () { if (!el.querySelector("iframe")) { el.textContent = ""; el.removeAttribute("data-ticker"); } }, 9000);
  }

  window.MosesTicker = { mount: mount, symbols: SYMBOLS };
})();
