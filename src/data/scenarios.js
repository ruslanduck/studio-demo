// Predefined scenario lists (Build order #3, 3.5).
//
// A ready-made pull list for a *type of shoot*. It mixes two entry kinds:
//   { kit:  'kit-id' }               — a whole kit, staged like any other kit
//   { item: 'item-id', qty: n }      — n units of an a-la-carte item
//
// Picking a list when creating a booking replaces the manual add-everything
// step; the crew then edits the result. Nothing here is a hard rule — it's a
// starting point that saves the assembly time.
export const SCENARIO_SEED = [
  {
    id: 'list-ecom-figure',
    name: 'Loft e-commerce on figure',
    category: 'E-commerce',
    notes:
      'Daylight loft, model on figure. Two-light setup, tethered capture, wardrobe on set.',
    entries: [
      { kit: 'kit-capture-1', note: 'Tether cart by the mark' },
      { item: 'aputure-600d', qty: 2 },
      { item: 'cstand-40', qty: 4 },
      { item: 'sandbag-25', qty: 6 },
      { item: 'flag-24x36', qty: 2 },
      { item: 'stinger-25', qty: 4 },
      { item: 'wardrobe-rack', qty: 2 },
      { item: 'applebox-full', qty: 2 },
      { item: 'gaff-tape', qty: 2 },
    ],
  },
  {
    id: 'list-still-life',
    name: 'Still life / tabletop',
    category: 'E-commerce',
    notes: 'Product table, single hard source + flags. Digital bench for the retoucher.',
    entries: [
      { kit: 'kit-digital-ws', note: 'Retouch bench' },
      { item: 'aputure-300x', qty: 1 },
      { item: 'folding-table-6', qty: 1 },
      { item: 'cstand-40', qty: 3 },
      { item: 'sandbag-25', qty: 4 },
      { item: 'flag-24x36', qty: 3 },
      { item: 'aclamp-2', qty: 6 },
      { item: 'applebox-pancake', qty: 2 },
      { item: 'stinger-25', qty: 3 },
    ],
  },
  {
    id: 'list-video-interview',
    name: 'Video interview (1-cam)',
    category: 'Motion',
    notes: 'Single-camera sit-down: A-cam package, key + practical, boom and lav audio.',
    entries: [
      { kit: 'kit-camera-fx6', note: 'A-cam' },
      { item: 'mkh-416', qty: 1 },
      { item: 'wireless-go-2', qty: 1 },
      { item: 'mixpre-6', qty: 1 },
      { item: 'aputure-600d', qty: 1 },
      { item: 'quasar-4ft', qty: 2 },
      { item: 'cstand-40', qty: 3 },
      { item: 'sandbag-25', qty: 4 },
      { item: 'director-chair', qty: 2 },
      { item: 'aa-batteries', qty: 8 },
    ],
  },
  {
    id: 'list-editorial-strobe',
    name: 'Editorial — hard light',
    category: 'Editorial',
    notes: 'Tungsten hard-light editorial look. Heavier grip package, no tether cart.',
    entries: [
      { item: 'arri-2k', qty: 2 },
      { item: 'arri-750', qty: 2 },
      { item: 'astera-titan', qty: 4 },
      { item: 'cstand-40', qty: 6 },
      { item: 'sandbag-25', qty: 10 },
      { item: 'avenger-riser', qty: 2 },
      { item: 'flag-24x36', qty: 4 },
      { item: 'stinger-25', qty: 6 },
      { item: 'applebox-half', qty: 2 },
      { item: 'safety-cable', qty: 6 },
    ],
  },
]
