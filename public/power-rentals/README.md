# Power Rentals: concept website (private preview)

Moses Agentic's pitch website for Power Rentals (Brooklyn): a new site where customers book rentals online from live availability, plus the customer account, fuel, service plans and the office view that keeps it all current. Served at `https://mosesagentic.com/power-rentals/` behind a passcode.

It is fully static: no build step, no server, no database. It works from any web host or straight from the folder.

## Pages
- `index.html`: home. A full-bleed construction-site hero, the fleet as photo tiles with live availability, the live yard list, fuel, service, a customer quote band and who they serve.
- `equipment.html`: the catalog by category and model, with photos, live availability, unit-level status and a date filter.
- `product.html?model=ID`: the product page and buy box. Choose a size, a start (quick picks: today, tomorrow, next Monday), the length and the borough, then **Rent now** (straight to checkout) or **Add to order**. Availability is checked live against the yard.
- `checkout.html`: a one-page checkout.
  - the delivery address, payment (account terms, card on file or pay on delivery) and insurance certificate are on file
  - the units are held for 30 minutes
  - **Place your order** creates the rentals, and the office view sees them at once
- `book.html`: retired. It redirects to the product page or the catalog.
- `account.html`: the customer's account and orders: recent orders, units on rent, pick-up requests, extensions, fuel orders, invoices, the fuel log and documents.
- `fuel.html`: fuel monitoring with a live sample tank board, and diesel delivery orders.
- `service.html`: service plans for generators customers own, and booking a service visit.
- `office.html`: the back office.
  - yard board and 21-day availability timeline
  - billing brief: fuel not billed yet, cycles ready or missing, rentals missing fuel
  - receivables watch: final, event, behind schedule, broken promise
  - live feed that simulates driver tickets and accounting events
- `build.html`: how it is built, how it connects, and what it costs.

Product photos are Power Rentals' own, from powerrentals.com (`img/fleet/`). Construction-site photography (`img/scenes/`) comes from Wikimedia Commons under CC0, CC BY and CC BY-SA licenses; the credits are in `img/scenes/credits.json` and on `credits.html`, linked from every footer.

## Architecture
| File | Role |
|---|---|
| `js/config.js` | Business rules: hours, same-day cutoff, hold time, delivery windows, pricing. Change them here. |
| `js/data.js` | The catalog and a **sample** fleet: categories, models, numbered units, customers as roles, and a sample history dated relative to today. |
| `js/engine.js` | The **event log** (store) and the **availability engine**. |
| `js/cart.js` | The order (cart), synced across tabs. |
| `js/ui.js` | The shared shell (preview bar, header, footer), DOM helpers, icons and toasts. |
| `js/pages/*.js`, `css/pages/*.css` | One script and one stylesheet per page. |
| `css/site.css` | The design system (v3): heavy, wide, uppercase Archivo headlines, Inter body text, gold primary actions, construction photography behind heroes, tiles and bands. |
| `js/gate.js` | The passcode gate. |

**The event log.** Every fact about a unit is an event: a rental from an invoice, a website or phone booking, a service hold, a 30-minute hold, a pick-up, drop-off or fuel ticket, or an extension.

**The availability engine** turns those events into answers: what is in the yard, what is free for a date range, when the next unit comes back, and whether the office is open.

**In this preview**, the events live in the browser (localStorage) and sync across open tabs. Booking on `book.html` in one tab shows up on `office.html` in another. A "driver pick-up ticket" in the office's live feed puts the unit back on the website immediately.

**In production**, the same events come from Power Rentals' billing inbox (driver tickets) and their accounting system (rental invoices, "final" invoices, payments). AI agents read those, and people approve anything that posts.

"Reset demo" in the preview bar clears what a visitor added and restores the sample data.

## Sensitivities built in
- **Posted hours:** Monday to Thursday 6am to 8pm, Friday 6am to 1pm, Saturday closed, Sunday to confirm.
- **Booking pauses** from Friday 1pm through Saturday. Visitors can still look, and the button reads "Booking reopens when the office opens". The site never says why.
- **No prices are invented.** Rates show as dashed "from your rate card" boxes. Rental delivery cost is "confirm". Diesel delivery is free (their own claim).
- **No private client details.** This repository is public, so nothing the client told us privately is in these files. Customers appear as roles, and all counts, dates and amounts are labelled sample.

## Passcode
- The passcode is `fullpower`. A link that unlocks automatically: `https://mosesagentic.com/power-rentals/?key=fullpower`
- To change it, put the SHA-256 of the new code (lowercase) into `HASH` in `js/gate.js`: `echo -n "newcode" | sha256sum`
- The gate is client-side. It keeps casual visitors out but is not real security, because the files are public. Every page carries `noindex,nofollow`, and the folder is left out of the main sitemap.
