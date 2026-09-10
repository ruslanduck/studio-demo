// Inventory seed for the photo/film studio. ~40 items across 7 categories.
// Units (individual physical copies) are generated with deterministic,
// realistic-looking 4-digit barcodes and serials so the demo is stable
// across reloads.

// Ordered category list — drives the Inventory category dropdown.
//
// This is the STUDIO'S OWN taxonomy, taken from the inventory migrated out of
// the old Mac system (18 exported top levels, normalised: "ORGANIZED" was a
// shelf-status prefix rather than a category, and DIGITAL/GRIP/LIGHT MODIFIERS
// were case variants of names already here). Ordered the way a shoot is built —
// light, then grip, then set, then digital — not alphabetically.
//
// Not a closed list: every category dropdown merges this with whatever the
// register actually uses, so a category that exists in the data is always
// offered even if it was never added here.
export const CATEGORIES = [
  'Strobes',
  'Lighting Modification',
  'Continuous Lighting',
  'Grip',
  'Stands',
  'Set',
  'Digital',
  'Digital Cart',
  'Camera Support',
  'Rolling Monitor Accessories',
  'Production',
  'Front Desk',
  'Crew',
  'Tools',
  'A/V / Events',
  'Uncategorized',
]

// Subcategories per category (the second level of the inventory tree). Offered
// as a LIST so the same gear doesn't end up under three spellings — but not a
// closed one: new kinds of equipment arrive, and the field also suggests
// whatever the register is already using.
export const SUBCATEGORIES = {
  Grip: ['Clamps', 'Stands', 'Sandbags & Weights', 'Aprons & Flags', 'Applebox & Risers', 'Rigging'],
  'Electric/Lighting': [
    'LED Panels',
    'LED Tubes',
    'Fresnel & Open Face',
    'Strobe & Flash',
    'Modifiers',
    'Power & Distro',
  ],
  Computers: ['Laptops', 'Monitors', 'Peripherals', 'Storage & Media', 'Adapters & Hubs'],
  Cables: ['Power', 'Video', 'Audio', 'Data', 'Adapters'],
  Camera: ['Bodies', 'Lenses', 'Support & Tripods', 'Monitoring', 'Media', 'Batteries & Power'],
  Furniture: ['Seating', 'Tables & Surfaces', 'Props & Set Dressing', 'Carts & Cases'],
  Audio: ['Microphones', 'Recorders & Mixers', 'Wireless', 'Headphones & Monitoring', 'Stands'],
}

// Item types (2.1). The type drives the detail card + how the item is counted.
// There used to be a third type, `consumable`; it was dropped on request —
// expendable stock is just non-barcoded stock that gets drawn down, which the
// "Went out" side of the stock action already covers.
export const ITEM_KINDS = [
  { value: 'barcoded', label: 'Barcoded' },
  { value: 'non_barcoded', label: 'Non-barcoded' },
]

export function kindLabel(kind) {
  const known = ITEM_KINDS.find((k) => k.value === kind)?.label
  if (known) return known
  // A row from before the `consumable` type was dropped (or any unknown value)
  // is quantity-counted, not unit-tracked — labelling it "Barcoded" would be a
  // lie, and `itemCount` already treats everything non-barcoded by quantity.
  return kind === 'barcoded' ? 'Barcoded' : 'Non-barcoded'
}

// The copies still in the register. A written-off unit is ARCHIVED, not deleted
// (20260808120000), so it stays on the item for its history but must never be
// counted, listed or offered. Use this anywhere a unit list is shown or counted;
// use raw `item.units` only to look one up by id (history, an old order line).
export function activeUnits(item) {
  return (item?.units || []).filter((u) => !u.archivedAt)
}

// On-hand count: barcoded items count their tracked units; the rest use qty.
export function itemCount(item) {
  return item.kind === 'barcoded' ? activeUnits(item).length : (item.quantity ?? 0)
}

// Best-effort brand from an item name (for realistic seed data).
const KNOWN_BRANDS = [
  'Apple', 'Canon', 'Sony', 'Aputure', 'Arri', 'Anker', 'LG', 'Sandisk',
  'Sennheiser', 'Rode', 'Zoom', 'Sound Devices', 'Quasar', 'Astera', 'Matthews',
  'SmallHD', 'Avenger',
]
export function brandFor(name) {
  const n = name.toLowerCase()
  return KNOWN_BRANDS.find((b) => n.includes(b.toLowerCase())) || null
}

const SERIAL_CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789'

// Deterministic serial derived from a seed string (FNV-1a hash + xorshift).
export function serialFor(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  let out = 'SF'
  for (let i = 0; i < 12; i++) {
    h ^= h << 13
    h ^= h >>> 17
    h ^= h << 5
    out += SERIAL_CHARS[Math.abs(h) % SERIAL_CHARS.length]
  }
  return out
}

// Create `count` units for an item, with sequential 4-digit barcodes starting
// at `startBarcode`. Units default to available / owned; callers (the store's
// add-inventory action) pass a start barcode past every existing one so ids
// never collide.
export function createUnits(itemId, count, startBarcode) {
  const units = []
  for (let i = 0; i < count; i++) {
    const barcode = String(startBarcode + i).padStart(4, '0')
    units.push({
      id: `u-${barcode}`,
      barcode,
      serial: serialFor(`${itemId}-${i}`),
      status: 'available', // "available" | "checked_out"
      location: 'Available', // DERIVED: "Available" OR the set/repair it's on
      placement: null, // STORED: this copy's shelf; null = inherit the item's
      ownership: 'owned', // "owned" | "sub_rental"
    })
  }
  return units
}

// [id, name, category, quantity]
const CATALOG = [
  // --- Grip ---
  ['aclamp-2', 'A-Clamp 2" (Medium)', 'Grip', 12],
  ['aclamp-3', 'A-Clamp 3" (Large)', 'Grip', 8],
  ['avenger-riser', 'Avenger Double Riser', 'Grip', 6],
  ['big-ben-clamp', 'Big Ben Clamp', 'Grip', 5],
  ['applebox-full', 'Applebox Full', 'Grip', 6],
  ['applebox-half', 'Applebox Half', 'Grip', 6],
  ['applebox-quarter', 'Applebox Quarter', 'Grip', 8],
  ['applebox-pancake', 'Applebox Pancake', 'Grip', 8],
  ['cstand-40', 'C-Stand 40" w/ Grip Arm', 'Grip', 10],
  ['sandbag-25', 'Sandbag 25lb', 'Grip', 20],

  // --- Electric/Lighting ---
  ['arri-2k', 'Arri 2K Open Face', 'Electric/Lighting', 4],
  ['arri-750', 'Arri 750', 'Electric/Lighting', 6],
  ['aputure-600d', 'Aputure 600D Pro', 'Electric/Lighting', 3],
  ['aputure-300x', 'Aputure 300X', 'Electric/Lighting', 4],
  ['stinger-25', 'AC Extension Cord / Stinger 20amp 25\'', 'Electric/Lighting', 15],
  ['quasar-4ft', 'Quasar Science 4\' Tube', 'Electric/Lighting', 8],
  ['astera-titan', 'Astera Titan Tube', 'Electric/Lighting', 6],
  ['flag-24x36', 'Matthews Flag 24x36', 'Electric/Lighting', 10],

  // --- Computers ---
  ['macbook-16', 'Apple Late 2019 16" MacBook Pro', 'Computers', 3],
  ['kbd-magic', 'Apple Wireless Magic Keyboard', 'Computers', 17],
  ['mouse-magic', 'Apple Wireless Magic Mouse', 'Computers', 14],
  ['anker-hub', 'Anker USB-C Hub', 'Computers', 9],
  ['monitor-lg-27', 'LG 27" 4K Monitor', 'Computers', 5],

  // --- Cables ---
  ['lightning-cable', 'Apple Lightning Cable', 'Cables', 20],
  ['usbc-power-96w', 'Apple MacBook Pro 96W USB-C Power Adapter', 'Cables', 10],
  ['usbc-cable-2m', 'USB-C to USB-C Cable 2m', 'Cables', 18],
  ['hdmi-10ft', 'HDMI Cable 10\'', 'Cables', 12],

  // --- Camera ---
  ['sony-fx6', 'Sony FX6 Cinema Body', 'Camera', 3],
  ['canon-r5', 'Canon EOS R5', 'Camera', 2],
  ['sony-2470', 'Sony 24-70mm f/2.8 GM', 'Camera', 4],
  ['smallhd-702', 'SmallHD 702 Touch Monitor', 'Camera', 3],
  ['cfexpress-512', 'Sandisk CFexpress 512GB', 'Camera', 10],

  // --- Furniture ---
  ['bench', 'Bench', 'Furniture', 5],
  ['director-chair', 'Director Chair', 'Furniture', 8],
  ['folding-table-6', 'Folding Table 6\'', 'Furniture', 6],
  ['wardrobe-rack', 'Wardrobe Rack', 'Furniture', 6],

  // --- Audio ---
  ['mkh-416', 'Sennheiser MKH 416 Shotgun', 'Audio', 3],
  ['wireless-go-2', 'Rode Wireless GO II', 'Audio', 5],
  ['zoom-h6', 'Zoom H6 Recorder', 'Audio', 4],
  ['mixpre-6', 'Sound Devices MixPre-6', 'Audio', 2],

  // --- Non-barcoded (counted by quantity, no per-unit tracking) ---
  ['j-hook-2', 'J-Hook 2"', 'Grip', 50, 'non_barcoded'],
  ['safety-cable', 'Safety Cable', 'Grip', 40, 'non_barcoded'],
  // Expendable stock. Same type as the rest now — it's just counted and drawn
  // down; what makes it different is that it isn't rented by the day (below).
  ['gaff-tape', 'Gaffer Tape 2" Black', 'Grip', 24, 'non_barcoded'],
  ['aa-batteries', 'AA Batteries', 'Electric/Lighting', 200, 'non_barcoded'],
]

// Build the seed inventory. Barcoded items get sequential barcodes (with a few
// sub-rentals sprinkled in); non-barcoded items store a quantity and have no
// unit rows.
let seedBarcode = 703
// Rental day rates (epic #5, 5.4) — what the estimate multiplies by quantity and
// billable days. Real per-item rates where the number matters (camera, lighting,
// computers); everything else falls back to its category's typical rate, so the
// catalogue can grow without touching this table. Stock that's used up rather
// than rented carries no day rate (see NOT_RENTED_BY_THE_DAY).
const DAY_RATE_BY_CATEGORY = {
  Grip: 12,
  'Electric/Lighting': 45,
  Computers: 55,
  Cables: 6,
  Camera: 90,
  Furniture: 15,
  Audio: 40,
}

const DAY_RATE_OVERRIDES = {
  // Camera
  'sony-fx6': 285,
  'canon-r5': 210,
  'sony-2470': 75,
  'smallhd-702': 65,
  'cfexpress-512': 35,
  // Electric / lighting
  'arri-2k': 110,
  'arri-750': 65,
  'aputure-600d': 145,
  'aputure-300x': 95,
  'astera-titan': 120,
  'quasar-4ft': 28,
  'stinger-25': 9,
  'flag-24x36': 14,
  // Computers
  'macbook-16': 120,
  'monitor-lg-27': 45,
  'kbd-magic': 12,
  'mouse-magic': 10,
  'anker-hub': 14,
  // Audio
  'mkh-416': 55,
  'wireless-go-2': 45,
  'zoom-h6': 40,
  'mixpre-6': 70,
  // Grip / furniture
  'c-stand-40': 18,
  'sandbag-25': 6,
  'applebox-full': 12,
  'bench': 18,
  'director-chair': 12,
  'wardrobe-rack': 22,
  'folding-table-6': 16,
}

// Stock that is used up rather than rented: it goes on the pull sheet and on the
// estimate as a line, but carries no day rate, so `buildEstimate` lists it and
// leaves it out of the total (and says so). This used to be keyed on the
// `consumable` item type; the type is gone, the fact isn't.
const NOT_RENTED_BY_THE_DAY = new Set(['gaff-tape', 'aa-batteries'])

// Day rate for a seed item; null when the item isn't rented out by the day.
export function dayRateFor({ id, category }) {
  if (NOT_RENTED_BY_THE_DAY.has(id)) return null
  return DAY_RATE_OVERRIDES[id] ?? DAY_RATE_BY_CATEGORY[category] ?? 20
}

// Where each demo item is FILED (the second level of the tree). Values all come
// from SUBCATEGORIES above — that map was written for exactly these seven demo
// categories and lost its last consumer when the taxonomy became real rows, so
// it is the seed's own source of truth now.
//
// A few pieces are deliberately left OUT: stock arriving before anyone has
// filed it is a real state (the studio's own register had 51 such items after
// the import), and the demo should show the "Not filed" group and the
// file-in-bulk tool doing something.
const SEED_SUBCATEGORY = {
  // Grip
  'aclamp-2': 'Clamps',
  'aclamp-3': 'Clamps',
  'big-ben-clamp': 'Clamps',
  'avenger-riser': 'Applebox & Risers',
  'applebox-full': 'Applebox & Risers',
  'applebox-half': 'Applebox & Risers',
  'applebox-quarter': 'Applebox & Risers',
  'applebox-pancake': 'Applebox & Risers',
  'cstand-40': 'Stands',
  'sandbag-25': 'Sandbags & Weights',
  'j-hook-2': 'Rigging',
  // Electric/Lighting
  'arri-2k': 'Fresnel & Open Face',
  'arri-750': 'Fresnel & Open Face',
  'aputure-600d': 'LED Panels',
  'aputure-300x': 'LED Panels',
  'quasar-4ft': 'LED Tubes',
  'astera-titan': 'LED Tubes',
  'stinger-25': 'Power & Distro',
  'aa-batteries': 'Power & Distro',
  'flag-24x36': 'Modifiers',
  // Computers
  'macbook-16': 'Laptops',
  'monitor-lg-27': 'Monitors',
  'kbd-magic': 'Peripherals',
  'mouse-magic': 'Peripherals',
  'anker-hub': 'Adapters & Hubs',
  // Cables
  'usbc-power-96w': 'Power',
  'hdmi-10ft': 'Video',
  'lightning-cable': 'Data',
  'usbc-cable-2m': 'Data',
  // Camera
  'sony-fx6': 'Bodies',
  'canon-r5': 'Bodies',
  'sony-2470': 'Lenses',
  'smallhd-702': 'Monitoring',
  'cfexpress-512': 'Media',
  // Furniture
  bench: 'Seating',
  'director-chair': 'Seating',
  'folding-table-6': 'Tables & Surfaces',
  'wardrobe-rack': 'Props & Set Dressing',
  // Audio
  'mkh-416': 'Microphones',
  'wireless-go-2': 'Wireless',
  'zoom-h6': 'Recorders & Mixers',
  'mixpre-6': 'Recorders & Mixers',
  // NOT filed on purpose: 'gaff-tape', 'safety-cable'.
}

export const INVENTORY_SEED = CATALOG.map(([id, name, category, qty, kind = 'barcoded']) => {
  if (kind !== 'barcoded') {
    return {
      id, name, category, subcategory: SEED_SUBCATEGORY[id] ?? null, kind,
      quantity: qty, units: [], brand: brandFor(name),
      dayRate: dayRateFor({ id, category, kind }),
    }
  }
  const units = createUnits(id, qty, seedBarcode)
  seedBarcode += qty
  units.forEach((u, i) => {
    if (i % 7 === 6) u.ownership = 'sub_rental'
  })
  return {
    id, name, category, subcategory: SEED_SUBCATEGORY[id] ?? null, kind,
    quantity: 0, units, brand: brandFor(name),
    dayRate: dayRateFor({ id, category, kind }),
  }
})
