# Power Rentals: concept website (private preview)

Moses Agentic's pitch website for Power Rentals (Brooklyn): a new site where customers book rentals online from live availability, plus the customer account, fuel, service plans and the office view that keeps it all current. Served at `https://mosesagentic.com/power-rentals/` behind a passcode.

It is fully static: no build step, no server, no database. It works from any web host or straight from the folder.

## Pages
- `index.html`: home. Live "in the yard today" card, the fleet with availability, booking steps, how availability stays live, fuel, service, who we serve and testimonials.
- `equipment.html`: the catalog by category and model. It shows live availability and unit-level status, with filters by date.
- `book.html`: the four-step booking flow:
  1. equipment
  2. dates on an availability calendar
  3. site and delivery
  4. review, with a 30-minute hold, then book
- `account.html`: the customer portal for a sample account. It covers units on rent, pick-up requests, extensions, fuel orders, invoices, the fuel log and documents.
- `fuel.html`: fuel monitoring with a live sample tank board, and diesel delivery orders.
- `service.html`: service plans for generators customers own, and booking a service visit.
- `office.html`: the back office.
  - yard board and 21-day availability timeline
  - billing brief: fuel not yet billed, cycles ready or missing, rentals missing fuel
  - receivables watch: final, event, behind schedule and broken promise
  - live feed that simulates driver tickets and accounting events
- `build.html`: how this was built, how it connects, and what it costs.

## Architecture
| File | Role |
|---|---|
| `js/config.js` | Business rules: hours, same-day cutoff, hold time, delivery windows, pricing. Change them here. |
| `js/data.js` | The catalog and a **sample** fleet: categories, models, numbered units, customers as roles, and a sample history dated relative to today. |
| `js/engine.js` | The **event log** (store) and the **availability engine**. |
| `js/ui.js` | The shared shell (preview bar, header, footer), DOM helpers, icons and toasts. |
| `js/pages/*.js`, `css/pages/*.css` | One script and one stylesheet per page. |
| `css/site.css` | The design system: Power Rentals black and gold, Poppins and Inter. |
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
