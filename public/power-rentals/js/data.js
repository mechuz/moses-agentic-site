/* Power Rentals demo · catalog and SAMPLE fleet.
   Categories and models follow the rental listings on powerrentals.com (10 Nov 2026).
   Unit counts, unit numbers, customers, dates and amounts are SAMPLE data for the demo:
   a real build loads the fleet list from Power Rentals and the history from their invoices and tickets. */
window.PR = window.PR || {};
(function () {
  'use strict';

  const categories = [
    { id: 'gen',   name: 'Generators',            icon: 'gen', tagline: 'Towable diesel, 20 to 700 kilovolt-amperes.',   blurb: 'Towable diesel generators from 20 to 700 kilovolt-amperes, silent units and hybrid battery units. Diesel units come with fuel monitoring.' },
    { id: 'heat',  name: 'Heaters',               icon: 'heat', tagline: 'Diesel and electric heat for pours and framing.',  blurb: 'Campo and Val 6 diesel heaters, Heat Star, and L.B. White Volt and Campo Blaze electric heaters for pours, framing and buildings without heat.' },
    { id: 'cool',  name: 'Cooling',               icon: 'cool', tagline: 'Portable air conditioners, coolers and fans.',  blurb: 'Portable air conditioners from 1 to 12 ton, evaporative coolers, fans and dehumidifiers.' },
    { id: 'light', name: 'Light towers',          icon: 'light', tagline: 'Light for night work and site security.', blurb: 'Electric and diesel light towers for night work and site security.' },
    { id: 'dist',  name: 'Power distribution',    icon: 'dist', tagline: 'Spider boxes and 100 to 400 amp boxes.',  blurb: 'Spider boxes and 100 to 400 amp distribution boxes.' },
    { id: 'lift',  name: 'Forklifts and telehandlers', icon: 'lift', tagline: 'Forklifts, telehandlers and pallet jacks.', blurb: 'Dual-fuel and diesel forklifts from 5,000 to 10,000 pounds, telehandlers, and manual and electric pallet jacks.' }
  ];

  /* fuel: 'diesel' units get fuel monitoring and diesel delivery; 'fueled' heaters need Fire Department supervision on construction sites */
  const models = [
    { id: 'g20',  cat: 'gen',   name: '20 kilovolt-ampere generator',            short: '20 kilovolt-ampere',  fuel: 'diesel', units: 3 },
    { id: 'g50s', cat: 'gen',   name: '50 kilovolt-ampere silent generator',     short: '50 kilovolt-ampere silent', fuel: 'diesel', units: 3 },
    { id: 'g115', cat: 'gen',   name: '115 kilovolt-ampere generator',           short: '115 kilovolt-ampere', fuel: 'diesel', units: 2 },
    { id: 'g175', cat: 'gen',   name: '175 kilovolt-ampere generator',           short: '175 kilovolt-ampere', fuel: 'diesel', units: 3 },
    { id: 'g310', cat: 'gen',   name: '310 kilovolt-ampere generator',           short: '310 kilovolt-ampere', fuel: 'diesel', units: 1 },
    { id: 'g700', cat: 'gen',   name: '700 kilovolt-ampere generator',           short: '700 kilovolt-ampere', fuel: 'diesel', units: 1 },
    { id: 'hyb70',cat: 'gen',   name: 'Hybrid battery generator, 70 kilovolt-amperes', short: 'Hybrid 70', fuel: 'diesel', units: 2 },
    { id: 'c200', cat: 'heat',  name: 'Campo 200D diesel heater',                short: 'Campo 200D', fuel: 'fueled', units: 3 },
    { id: 'c400', cat: 'heat',  name: 'Campo 400D diesel heater',                short: 'Campo 400D', fuel: 'fueled', units: 2 },
    { id: 'val6', cat: 'heat',  name: 'Val 6 diesel radiant heater',             short: 'Val 6', fuel: 'fueled', units: 2 },
    { id: 'volt18',cat:'heat',  name: 'L.B. White Volt 18 electric heater',      short: 'Volt 18', fuel: 'electric', units: 3 },
    { id: 'ac5',  cat: 'cool',  name: 'Portable air conditioner, 5 ton',         short: '5 ton air conditioner', fuel: 'electric', units: 3 },
    { id: 'ac12', cat: 'cool',  name: 'Portable air conditioner, 12 ton',        short: '12 ton air conditioner', fuel: 'electric', units: 1 },
    { id: 'dehu', cat: 'cool',  name: 'Dehumidifier and air mover set',          short: 'Dehumidifier', fuel: 'electric', units: 2 },
    { id: 'ltd',  cat: 'light', name: 'Diesel light tower',                      short: 'Light tower, diesel', fuel: 'diesel', units: 2 },
    { id: 'lte',  cat: 'light', name: 'Electric light tower',                    short: 'Light tower, electric', fuel: 'electric', units: 1 },
    { id: 'spider',cat:'dist',  name: 'Spider box',                              short: 'Spider box', fuel: 'none', units: 3 },
    { id: 'db400',cat: 'dist',  name: '400 amp distribution box',                short: '400 amp box', fuel: 'none', units: 2 },
    { id: 'fl5',  cat: 'lift',  name: 'Dual-fuel forklift, 5,000 pounds',       short: 'Forklift, 5,000 pounds', fuel: 'none', units: 2 },
    { id: 'fl10', cat: 'lift',  name: 'Diesel forklift, 10,000 pounds',         short: 'Forklift, 10,000 pounds', fuel: 'diesel', units: 1 },
    { id: 'tele', cat: 'lift',  name: 'Telehandler',                             short: 'Telehandler', fuel: 'none', units: 2 }
  ];

  /* SAMPLE customers, shown as roles (never real customer names). */
  const customers = [
    { id: 'gcA', name: 'General contractor A', terms: 'Net 30', cycle: 'Monthly' },
    { id: 'pmB', name: 'Property manager B',   terms: 'Every two weeks', cycle: 'Biweekly' },
    { id: 'evC', name: 'Event customer C',     terms: 'Paid on delivery', cycle: 'Per event' },
    { id: 'gcD', name: 'General contractor D', terms: 'Net 30', cycle: 'Weekly' },
    { id: 'citE',name: 'City agency E',        terms: 'Contract terms', cycle: 'Monthly' },
    { id: 'rsF', name: 'Restaurant F',         terms: 'Card on file', cycle: 'Per rental' },
    { id: 'gcG', name: 'General contractor G', terms: 'Net 30', cycle: 'Monthly' }
  ];

  /* Build numbered units, then a SAMPLE history relative to today so the demo always looks current.
     offsets are in days from today; negative = past. */
  const units = [];
  let no = 1;
  models.forEach(m => { for (let i = 0; i < m.units; i++) units.push({ no: no++, model: m.id }); });

  const U = (modelId, k) => units.filter(u => u.model === modelId)[k].no;
  /* [unit, startOffset, endOffset, customer, borough, source] */
  const rentals = [
    [U('g20',0),   -20, 10, 'gcA', 'Brooklyn',      'Rental invoice'],
    [U('g50s',0),  -6,  1,  'evC', 'Manhattan',     'Rental invoice'],
    [U('g50s',1),  -12, 16, 'pmB', 'Queens',        'Rental invoice'],
    [U('g115',0),  -30, 0,  'gcD', 'Brooklyn',      'Rental invoice'],   // final today: returning
    [U('g175',0),  -9,  6,  'gcG', 'Queens',        'Rental invoice'],
    [U('g175',1),  -3,  2,  'rsF', 'Brooklyn',      'Website booking'],
    [U('g310',0),  -40, 20, 'citE','Staten Island', 'Rental invoice'],
    [U('hyb70',0), -14, 14, 'pmB', 'Manhattan',     'Rental invoice'],
    [U('c200',0),  -18, 40, 'gcA', 'Brooklyn',      'Rental invoice'],
    [U('c200',1),  -10, 30, 'gcG', 'Queens',        'Rental invoice'],
    [U('c200',2),  -5,  3,  'gcD', 'Brooklyn',      'Website booking'],
    [U('c400',0),  -21, 25, 'citE','The Bronx',     'Rental invoice'],
    [U('c400',1),  -2,  9,  'gcA', 'Brooklyn',      'Phone booking'],
    [U('val6',0),  -7,  7,  'gcG', 'Queens',        'Rental invoice'],
    [U('volt18',0),-4,  0,  'pmB', 'Manhattan',     'Rental invoice'],   // returning
    [U('ac5',0),   -60, 2,  'citE','Manhattan',     'Rental invoice'],
    [U('ltd',0),   -15, 12, 'gcD', 'Brooklyn',      'Rental invoice'],
    [U('ltd',1),   -2,  5,  'citE','Queens',        'Rental invoice'],
    [U('lte',0),   -8,  4,  'evC', 'Manhattan',     'Website booking'],
    [U('spider',0),-20, 10, 'gcA', 'Brooklyn',      'Rental invoice'],
    [U('db400',0), -9,  21, 'gcG', 'Queens',        'Rental invoice'],
    [U('fl5',0),   -3,  4,  'gcD', 'Brooklyn',      'Phone booking'],
    [U('tele',0),  -11, 3,  'gcA', 'Brooklyn',      'Rental invoice']
  ];
  /* [unit, startOffset, endOffset, reason] */
  const service = [
    [U('g20',2),   -1, 2,  '250-hour service'],
    [U('ac12',0),  -2, 1,  'Compressor check'],
    [U('fl10',0),   0, 3,  'Brake service']
  ];

  /* Photos: Power Rentals' own product photos from powerrentals.com.
     kind 'photo' = a real photo in the yard (fills its frame); 'cutout' = product on a transparent background. */
  const IMG = f => 'img/fleet/' + f;
  const catImg = { gen: ['yard-generator-2.webp', 'photo'], heat: ['heater.webp', 'cutout'], cool: ['cooling-2.webp', 'cutout'], light: ['light-tower.webp', 'cutout'], dist: ['distribution.webp', 'cutout'], lift: ['forklift.webp', 'cutout'] };
  categories.forEach(c => { c.img = catImg[c.id][0] && IMG(catImg[c.id][0]); c.imgKind = catImg[c.id][1]; });
  const modelImg = { g20: ['yard-generator-3.webp', 'photo'], g115: ['yard-generator-hero.webp', 'photo'], hyb70: ['hybrid.webp', 'cutout'],
    c200: ['heater-3.webp', 'cutout'], c400: ['heater.webp', 'cutout'], volt18: ['heater-electric.webp', 'cutout'],
    ac5: ['cooling-2.webp', 'cutout'], ac12: ['cooling.webp', 'cutout'], lte: ['light-tower.webp', 'cutout'], fl10: ['forklift.webp', 'cutout'], fl5: ['forklift-2.webp', 'cutout'],
    db400: ['distribution.webp', 'cutout'], spider: ['spider-box.webp', 'cutout'] };
  models.forEach(m => { const own = modelImg[m.id], cat = categories.find(c => c.id === m.cat); m.img = own ? IMG(own[0]) : cat.img; m.imgKind = own ? own[1] : cat.imgKind; });

  PR.data = { categories, models, customers, units, sample: { rentals, service } };
})();
