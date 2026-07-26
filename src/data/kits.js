// Kit seed (Build order #3, 3.1).
//
// A kit is the second inventory "entry type": a named bundle of a-la-carte
// items. Each slot references one component item by its local id (resolved to
// name/category at load time). Slot typing (FIXED / GENERIC) arrives in 3.3 —
// here a slot is just { label, itemId }.
export const KIT_SEED = [
  {
    id: 'kit-capture-1',
    name: 'Capture Station 1',
    category: 'Workstation',
    notes:
      'Tethered capture cart. Monitor + laptop live on the cart; keyboard/mouse assigned at pull.',
    slots: [
      { label: 'Laptop', itemId: 'macbook-16' },
      { label: 'Monitor', itemId: 'monitor-lg-27' },
      { label: 'Keyboard', itemId: 'kbd-magic' },
      { label: 'Mouse', itemId: 'mouse-magic' },
      { label: 'USB-C hub', itemId: 'anker-hub' },
    ],
  },
  {
    id: 'kit-camera-fx6',
    name: 'Camera Kit A — Sony FX6',
    category: 'Camera',
    notes: 'A-cam package: body, standard zoom, on-board monitor and media.',
    slots: [
      { label: 'Camera body', itemId: 'sony-fx6' },
      { label: 'Lens', itemId: 'sony-2470' },
      { label: 'Monitor', itemId: 'smallhd-702' },
      { label: 'Media', itemId: 'cfexpress-512' },
    ],
  },
  {
    id: 'kit-digital-ws',
    name: 'Digital Workstation',
    category: 'Workstation',
    notes: 'Editing / review bench for the digital tech.',
    slots: [
      { label: 'Laptop', itemId: 'macbook-16' },
      { label: 'Monitor', itemId: 'monitor-lg-27' },
      { label: 'Keyboard', itemId: 'kbd-magic' },
      { label: 'Mouse', itemId: 'mouse-magic' },
      { label: 'Power adapter', itemId: 'usbc-power-96w' },
    ],
  },
]
