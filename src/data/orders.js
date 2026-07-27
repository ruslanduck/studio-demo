// Order seed (4.5 work-history views, extended for epic #5).
//
// Orders get their own module in epic #5; 4.5 only needs them as a *history
// source*, so this seeds a realistic handful and the People/Company cards read
// them. Two flavours, both hanging off `orders.company_id`:
//
//   kind: 'client'     — someone ordered gear/studio time FROM us (the agency or
//                        production company on the job).
//   kind: 'sub_rental' — we rented gear FROM a vendor for a job. This is the
//                        "company as sub-rental vendor" history the spec asks for.
//
// `setTitle` links an order to a seeded booking so the card can show which job it
// served; `dayOffset` is relative to the current week's Monday, like the bookings.
//
// Epic #5 vocabulary: the linked booking IS the Set, and its title IS the Job
// name — so studio / dates / photographer are derived from it rather than
// duplicated here. `po` is the accounting PO (5.2), typed by hand in the app;
// seeded values just look like real ones. `status` uses the epic-5 lifecycle:
// 'hold' (yellow) → 'confirmed' (green), with 'fulfilled' kept for past jobs.
export const ORDER_SEED = [
  {
    number: 'SR-26014',
    po: 'PO-4471',
    company: 'northlight-rentals',
    kind: 'sub_rental',
    status: 'fulfilled',
    dayOffset: -1, // picked up the Sunday before
    setTitle: 'Zara Denim Campaign',
    lines: [
      ['arri-2k', 2],
      ['stinger-25', 4],
    ],
  },
  {
    number: 'SR-26015',
    po: 'PO-4482',
    company: 'kino-grip-co',
    kind: 'sub_rental',
    status: 'fulfilled',
    dayOffset: 0,
    setTitle: 'Vogue Editorial',
    lines: [
      ['sony-2470', 1],
      ['smallhd-702', 1],
    ],
  },
  {
    number: 'SR-26016',
    po: 'PO-4490',
    company: 'northlight-rentals',
    kind: 'sub_rental',
    status: 'confirmed',
    dayOffset: 2,
    setTitle: 'Nike SS26 Lookbook',
    lines: [
      ['aputure-600d', 2],
      ['flag-24x36', 3],
    ],
  },
  {
    number: 'SR-26017',
    po: 'PO-4491',
    company: 'kino-grip-co',
    kind: 'sub_rental',
    status: 'confirmed',
    dayOffset: 3,
    setTitle: 'Apple Product Shoot',
    lines: [['canon-r5', 1]],
  },
  {
    number: 'CL-26031',
    po: 'PO-4482',
    company: 'atlas-models',
    kind: 'client',
    status: 'fulfilled',
    dayOffset: 1,
    setTitle: 'Vogue Editorial',
    lines: [
      ['bench', 1],
      ['wardrobe-rack', 2],
    ],
  },
  {
    number: 'CL-26032',
    po: 'PO-4490',
    company: 'vantage-mgmt',
    kind: 'client',
    status: 'confirmed',
    dayOffset: 3,
    setTitle: 'Nike SS26 Lookbook',
    lines: [
      ['director-chair', 4],
      ['wardrobe-rack', 1],
    ],
  },
  {
    number: 'CL-26033',
    po: 'PO-4503',
    company: 'atlas-models',
    kind: 'client',
    status: 'hold',
    dayOffset: 5,
    setTitle: 'Wedding Editorial',
    lines: [['folding-table-6', 2]],
  },
  {
    number: 'MS-26008',
    po: 'PO-4496',
    company: 'swiftline-couriers',
    kind: 'sub_rental',
    status: 'fulfilled',
    dayOffset: 4,
    setTitle: 'H&M Kidswear',
    lines: [['lightning-cable', 6]],
  },
]

// Which vendor each sub-rented item came from. Units whose ownership is
// 'sub_rental' are attributed to these vendors so a company card can list the
// gear we hold from them; anything unlisted falls back to the first vendor.
export const SUB_RENTAL_VENDORS = {
  'arri-2k': 'northlight-rentals',
  'arri-750': 'northlight-rentals',
  'aputure-600d': 'northlight-rentals',
  'aputure-300x': 'northlight-rentals',
  'stinger-25': 'northlight-rentals',
  'flag-24x36': 'northlight-rentals',
  'quasar-4ft': 'northlight-rentals',
  'astera-titan': 'northlight-rentals',
  'sony-fx6': 'kino-grip-co',
  'sony-2470': 'kino-grip-co',
  'canon-r5': 'kino-grip-co',
  'smallhd-702': 'kino-grip-co',
  'cfexpress-512': 'kino-grip-co',
}
