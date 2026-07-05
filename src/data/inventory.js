// Inventory seed for the photo/film studio. ~40 items across 7 categories.
// Units (individual physical copies) are generated with deterministic,
// realistic-looking 4-digit barcodes and serials so the demo is stable
// across reloads.

// Ordered category list — drives the Inventory category dropdown.
export const CATEGORIES = [
  'Grip',
  'Electric/Lighting',
  'Computers',
  'Cables',
  'Camera',
  'Furniture',
  'Audio',
]

const SERIAL_CHARS = 'ABCDEFGHIJKLMNPQRSTUVWXYZ0123456789'

// Monotonic barcode sequence with small deterministic gaps so the numbers
// look organic (0703, 0705, 0708, ...) while staying unique.
let barcodeSeq = 703
function nextBarcode() {
  const code = String(barcodeSeq).padStart(4, '0')
  barcodeSeq += 1 + ((barcodeSeq * 13) % 3)
  return code
}

// Deterministic serial derived from a seed string (FNV-1a hash + xorshift).
function serialFor(seed) {
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

function makeUnits(itemId, count) {
  const units = []
  for (let i = 0; i < count; i++) {
    const barcode = nextBarcode()
    units.push({
      id: `u-${barcode}`,
      barcode,
      serial: serialFor(`${itemId}-${i}`),
      status: 'available', // "available" | "checked_out"
      location: 'Available', // "Available" OR a set name
      // Sprinkle a few sub-rentals into larger stocks for realism.
      ownership: i % 7 === 6 ? 'sub_rental' : 'owned', // "owned" | "sub_rental"
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
]

export const INVENTORY_SEED = CATALOG.map(([id, name, category, qty]) => ({
  id,
  name,
  category,
  units: makeUnits(id, qty),
}))
