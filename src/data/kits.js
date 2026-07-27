// Kit seed (Build order #3, 3.1 + 3.3).
//
// A kit is the second inventory "entry type": a named bundle of a-la-carte
// items. Each slot references one component item by its local id (resolved to
// name/category at load time).
//
// Slot typing (3.3):
//   slotType: 'fixed'   — the slot is bound to ONE specific unit (e.g. the
//                         monitor mounted in a capture cart). `fixedUnitIndex`
//                         picks which unit of the item is pinned (index into
//                         the item's generated units). Distinct indices across
//                         kits avoid two kits pinning the same physical unit.
//   slotType: 'generic' — bound only to the item; the concrete unit is assigned
//                         at pull time by scanning a barcode.
export const KIT_SEED = [
  {
    id: 'kit-capture-1',
    name: 'Capture Station 1',
    category: 'Workstation',
    notes:
      'Tethered capture cart. Monitor + laptop live on the cart; keyboard/mouse assigned at pull.',
    slots: [
      { label: 'Laptop', itemId: 'macbook-16', slotType: 'fixed', fixedUnitIndex: 0 },
      { label: 'Monitor', itemId: 'monitor-lg-27', slotType: 'fixed', fixedUnitIndex: 0 },
      { label: 'Keyboard', itemId: 'kbd-magic', slotType: 'generic' },
      { label: 'Mouse', itemId: 'mouse-magic', slotType: 'generic' },
      { label: 'USB-C hub', itemId: 'anker-hub', slotType: 'generic' },
    ],
  },
  {
    id: 'kit-camera-fx6',
    name: 'Camera Kit A — Sony FX6',
    category: 'Camera',
    notes: 'A-cam package: a dedicated body; lens, monitor and media pulled per shoot.',
    slots: [
      { label: 'Camera body', itemId: 'sony-fx6', slotType: 'fixed', fixedUnitIndex: 0 },
      { label: 'Lens', itemId: 'sony-2470', slotType: 'generic' },
      { label: 'Monitor', itemId: 'smallhd-702', slotType: 'generic' },
      { label: 'Media', itemId: 'cfexpress-512', slotType: 'generic' },
    ],
  },
  {
    id: 'kit-digital-ws',
    name: 'Digital Workstation',
    category: 'Workstation',
    notes: 'Editing / review bench for the digital tech. Laptop + monitor stay on the bench.',
    slots: [
      { label: 'Laptop', itemId: 'macbook-16', slotType: 'fixed', fixedUnitIndex: 1 },
      { label: 'Monitor', itemId: 'monitor-lg-27', slotType: 'fixed', fixedUnitIndex: 1 },
      { label: 'Keyboard', itemId: 'kbd-magic', slotType: 'generic' },
      { label: 'Mouse', itemId: 'mouse-magic', slotType: 'generic' },
      { label: 'Power adapter', itemId: 'usbc-power-96w', slotType: 'generic' },
    ],
  },
]
