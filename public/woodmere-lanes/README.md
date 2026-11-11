# Woodmere Lanes — demo website

A fully static site. No build step, no server code, no database. Every page works from a plain web host or even a USB stick.

## What's in it
- `index.html` — homepage (animated hero, zones, this week's events, menu teaser, parties, hours with live Shabbos times)
- `lanes.html` — lane booking: 7-day picker with Shabbos logic, time slots, bowler count, lane map, lighting mode, add-ons, live price, hold
- `menu.html` — interactive menu with tabs, Add buttons, lane or pickup order, running total
- `events.html` — filterable events, ticket checkout with lane and table bundles
- `parties.html` — party builder with tiers, headcount, add-ons, live estimate and deposit, package comparison, FAQ
- `catering.html` — catering menus by type, quote form with live estimate
- `leagues.html` — league divisions and team registration
- `gift-cards.html` — gift card builder with live preview
- `visit.html` — hours, this week's Shabbos times, directions, kashrus, FAQ, contact form
- `admin.html` — manager back-office preview (sample data)
- `css/site.css`, `js/app.js`, `img/`

Forms and checkouts confirm on-screen. Nothing is sent anywhere. Prices, events and availability are placeholders.

## Host it (pick one, all free tiers work)
- **Netlify:** drag the folder onto app.netlify.com/drop. Password: Site settings → Access control → Password protection (paid add-on) or use Netlify Identity.
- **Cloudflare Pages:** upload the folder. Password: Zero Trust → Access → add an application for the domain with a one-time PIN or allowed emails. Free for up to 50 users.
- **Vercel:** `vercel deploy` from the folder. Password: Project → Settings → Deployment Protection → Password (Pro plan).
- **Any Apache host:** upload the folder and add `.htaccess` + `.htpasswd` for basic auth.

The simplest free option with a real password is Cloudflare Pages + Cloudflare Access.

## Shabbos times
`js/app.js` calculates sunset for Woodmere (40.632, -73.712). Candle lighting is sunset minus 18 minutes; Shabbos ends sunset plus 50 minutes. Friday close is two hours before candle lighting. Motzei Shabbos opens one hour after Shabbos ends. Change the constants at the top of `app.js` if the venue uses different customs. Yom Tov dates are not calculated.

## Passcode gate
`js/gate.js` hides every page behind a passcode (client-side; it deters casual visitors, it is not real security since the files are public).
- Default passcode: `goloud`
- Share a link that unlocks automatically: `https://mosesagentic.com/woodmere-lanes/?key=goloud`
- To change it, compute the SHA-256 of the new code (lowercase) and paste it into `HASH` in `js/gate.js`:
  `echo -n "newcode" | shasum -a 256`
- To remove the gate, delete the `<script src="js/gate.js"></script>` line from each page.
All pages carry `noindex,nofollow` and are left out of the main site's sitemap.
