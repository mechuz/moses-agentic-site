/* Power Rentals demo · configuration.
   One place for the business rules a real build would read from the client's settings.
   Everything marked SAMPLE or CONFIRM must be supplied or confirmed by Power Rentals. */
window.PR = window.PR || {};
PR.config = {
  business: {
    name: 'Power Rentals',
    phone: '(718) 400-7368',
    phoneHref: 'tel:+17184007368',
    mailing: '4809 Avenue N, Suite 302, Brooklyn 11234',
    yard: '2210 East 69th Street, Brooklyn 11234',   // CONFIRM: from directories, not on their contact page
    since: 2012,
    boroughs: ['Brooklyn', 'Queens', 'Manhattan', 'The Bronx', 'Staten Island']
  },

  /* Posted hours (their contact page). Day 0 = Sunday. null = closed or not confirmed. */
  hours: {
    0: null,                      // Sunday: CONFIRM (not listed on their site)
    1: [6, 20], 2: [6, 20], 3: [6, 20], 4: [6, 20],
    5: [6, 13],                   // Friday until 1pm
    6: null                       // Saturday closed
  },
  sundayToConfirm: true,

  sameDayCutoffHour: 10,          // free same-day delivery when ordered by 10am (their home page)
  holdMinutes: 30,                // how long a unit is held while a customer finishes booking (proposed)

  /* Delivery windows offered on a booking, by weekday (proposed; CONFIRM). */
  deliveryWindows: {
    weekday: ['6am to 9am', '9am to noon', 'Noon to 4pm', '4pm to 8pm'],
    friday: ['6am to 9am', '9am to 1pm']
  },

  /* What the build costs (Moses Agentic standard pricing). Change here and every page follows. */
  pricing: {
    buildPerAgent: 10000,
    monthlyPerAgent: 1000,
    websiteAgent: 'Booking desk',
    recommended: ['Billing and collections desk', 'Booking desk']
  },

  /* Demo passcode lives in js/gate.js (hashed). */
  storageKey: 'pr_demo_v1'
};
