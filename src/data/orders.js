// Order seed (epic #5 + the epic-6 reservation model).
//
// An Order is the equipment list for a Set (shoot). Reservations now DERIVE
// from orders: a unit is "checked out" to a job because a CONFIRMED order lists
// it in-house (see lib/availability `reservedUnitsForOrder`). Hold orders
// reserve nothing; sub-rental lines are gear brought in from a vendor and
// reserve none of our stock.
//
// Line forms:
//   [itemId, qty]                 → in-house (our stock — reserved when confirmed)
//   [itemId, qty, vendorCompanyId] → sub-rental from that vendor (reserves nothing)
//
// `setTitle` links the order to its booking (the shoot); `dayOffset` (days from
// this week's Monday, negative = earlier) sets the order date.
export const ORDER_SEED = [
  // ---- This week's equipment pulls — these DRIVE the inventory reservations.
  {
    number: 'CL-26051', po: 'PO-4511', company: 'vantage-mgmt', kind: 'client',
    status: 'confirmed', dayOffset: 0, setTitle: 'Zara Denim Campaign',
    // No loose MacBook here: the only non-fixed 16" MacBook goes to Nike below
    // (the other two are pinned to the capture-cart kits), so stock stays honest.
    lines: [['kbd-magic', 2], ['mouse-magic', 2], ['cstand-40', 3], ['sandbag-25', 4]],
  },
  {
    number: 'CL-26052', po: 'PO-4512', company: 'atlas-models', kind: 'client',
    status: 'confirmed', dayOffset: 1, setTitle: 'Vogue Editorial',
    // one sub-rental line (extra tubes from Northlight) alongside the in-house pull
    lines: [['arri-2k', 2], ['stinger-25', 3], ['sandbag-25', 3], ['flag-24x36', 2], ['astera-titan', 2, 'northlight-rentals']],
  },
  {
    number: 'CL-26053', po: 'PO-4513', company: 'vantage-mgmt', kind: 'client',
    status: 'confirmed', dayOffset: 1, setTitle: 'Adidas Originals',
    lines: [['aputure-600d', 1], ['aputure-300x', 2], ['cstand-40', 2], ['kbd-magic', 1]],
  },
  {
    number: 'CL-26054', po: 'PO-4514', company: 'atlas-models', kind: 'client',
    status: 'confirmed', dayOffset: 2, setTitle: 'Glossier Beauty',
    lines: [['quasar-4ft', 4], ['astera-titan', 2], ['smallhd-702', 1]],
  },
  {
    number: 'CL-26055', po: 'PO-4515', company: 'vantage-mgmt', kind: 'client',
    status: 'confirmed', dayOffset: 3, setTitle: 'Nike SS26 Lookbook',
    lines: [['kbd-magic', 3], ['mouse-magic', 2], ['macbook-16', 1], ['sony-fx6', 1], ['sony-2470', 1]],
  },
  {
    number: 'CL-26056', po: 'PO-4516', company: 'atlas-models', kind: 'client',
    status: 'confirmed', dayOffset: 3, setTitle: 'Apple Product Shoot',
    lines: [['canon-r5', 1], ['sony-2470', 1], ['aputure-600d', 1], ['kbd-magic', 2]],
  },
  {
    number: 'CL-26057', po: 'PO-4517', company: 'vantage-mgmt', kind: 'client',
    status: 'confirmed', dayOffset: 4, setTitle: 'H&M Kidswear',
    lines: [['arri-750', 2], ['stinger-25', 2], ['director-chair', 2], ['applebox-half', 2]],
  },
  {
    // The visible HOLD example — nothing committed, so its gear (incl. the Canon)
    // stays available.
    number: 'CL-26058', po: 'PO-4503', company: 'atlas-models', kind: 'client',
    status: 'hold', dayOffset: 5, setTitle: 'Wedding Editorial',
    lines: [['canon-r5', 1], ['wireless-go-2', 1], ['sandbag-25', 2], ['cstand-40', 2]],
  },
  {
    number: 'CL-26059', po: 'PO-4519', company: 'vantage-mgmt', kind: 'client',
    status: 'confirmed', dayOffset: 5, setTitle: 'Local Band EP',
    lines: [['zoom-h6', 1], ['wireless-go-2', 1], ['astera-titan', 1]],
  },
  {
    number: 'CL-26060', po: 'PO-4520', company: 'atlas-models', kind: 'client',
    status: 'confirmed', dayOffset: 6, setTitle: 'Spotify Podcast Set',
    lines: [['mkh-416', 2], ['zoom-h6', 1], ['wireless-go-2', 2], ['director-chair', 2]],
  },
  {
    number: 'CL-26061', po: 'PO-4521', company: 'vantage-mgmt', kind: 'client',
    status: 'confirmed', dayOffset: 6, setTitle: 'Netflix BTS',
    lines: [['sony-fx6', 1], ['smallhd-702', 1], ['mixpre-6', 1], ['mkh-416', 1]],
  },

  // ---- Past sub-rental orders: vendor history / analytics (epic #4). Not
  // confirmed, so they reserve nothing — pure record of gear rented from vendors.
  {
    number: 'SR-26014', po: 'PO-4471', company: 'northlight-rentals', kind: 'sub_rental',
    status: 'fulfilled', dayOffset: -2, setTitle: 'Vogue Editorial',
    lines: [['arri-2k', 2, 'northlight-rentals'], ['stinger-25', 4, 'northlight-rentals']],
  },
  {
    number: 'SR-26015', po: 'PO-4482', company: 'kino-grip-co', kind: 'sub_rental',
    status: 'fulfilled', dayOffset: -1, setTitle: 'Nike SS26 Lookbook',
    lines: [['sony-2470', 1, 'kino-grip-co'], ['smallhd-702', 1, 'kino-grip-co']],
  },
  {
    number: 'MS-26008', po: 'PO-4496', company: 'swiftline-couriers', kind: 'sub_rental',
    status: 'fulfilled', dayOffset: -1, setTitle: 'H&M Kidswear',
    lines: [['lightning-cable', 6, 'swiftline-couriers']],
  },
]

// Which vendor each sub-rented item came from — attributes sub_rental-owned
// units to a vendor so a company card can list the gear we hold from them.
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
