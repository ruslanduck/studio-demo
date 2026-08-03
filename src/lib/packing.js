// Packing checklist helpers (epic #6, 6.2 + 6.5). Shared by the store, the
// digital checklist modal and (later) the scanning page so all agree on how a
// line is identified and when it's considered signed out / returned.

// The three sign-off slots per line: two at sign-out, one at return.
export const PACKING_SLOTS = ['out1', 'out2', 'ret']

// A stable key for a packing-list line. Order lines are replaced wholesale when
// equipment is edited, so we key sign-offs by the line's content, not its id.
// item + slot label + barcode is unique per line (a-la-carte is one line per
// item; kit slots each carry their own assigned unit's barcode). `prefix`
// namespaces an add-on's lines (6.4) so they don't collide with the main list.
export const packingLineKey = (line, prefix = '') =>
  `${prefix}${line.itemId ?? ''}::${line.slotLabel ?? ''}::${line.barcode ?? ''}`

// What the crew actually ticks off, one row at a time.
//
// An order LINE is not a row: an a-la-carte line says "Arri 2K Open Face x2",
// and two physical bodies get pulled, carried and returned separately — ticking
// one box for both is how a piece goes missing. So barcoded stock is expanded to
// ONE ROW PER COPY, with the barcode that will be on the case.
//
// What can't be expanded stays a counted row, and says why:
//   • non-barcoded stock is counted, not tracked copy by copy;
//   • a SUB-RENTAL line is the vendor's gear — it has no barcode of ours;
//   • pieces the order asks for beyond what is reserved have no unit to name
//     (over-capacity, deliberately allowed) — they stay as a remainder row
//     rather than silently disappearing off the pull sheet.
//
// The concrete copies come from the SET's reservations (`booking.unitIds`), the
// same source the scanning station uses — a loose line carries a quantity, and
// the reservation is the resolved answer to "which ones".
export function packingRows(estimate, { inventory = [], booking = null } = {}) {
  const groups = estimate?.groups ?? []
  const itemsById = Object.fromEntries(inventory.map((i) => [i.id, i]))
  const reserved = new Set(booking?.unitIds ?? [])

  // Units already named by a kit slot are spoken for and must not be handed to a
  // loose line of the same item as well.
  const taken = new Set()
  for (const g of groups) for (const l of g.lines) if (l.unitId) taken.add(l.unitId)

  const unitOf = (unitId, itemId) =>
    (itemsById[itemId]?.units ?? []).find((u) => u.id === unitId) ?? null

  const out = []
  for (const g of groups) {
    const rows = []
    for (const l of g.lines) {
      const item = itemsById[l.itemId] ?? null
      const base = {
        itemId: l.itemId,
        itemName: l.itemName,
        slotLabel: l.slotLabel ?? null,
        kitId: l.kitId ?? null,
        source: l.source ?? 'in_house',
        vendorName: l.vendorName ?? null,
        dayRate: l.dayRate ?? null,
      }

      // A kit slot already names its copy.
      if (l.unitId) {
        const u = unitOf(l.unitId, l.itemId)
        rows.push({ ...base, kind: 'unit', unitId: l.unitId, barcode: l.barcode ?? u?.barcode ?? null, serial: u?.serial ?? null, quantity: 1 })
        continue
      }

      const qty = Math.max(1, Number(l.quantity) || 1)
      const barcoded = item?.kind === 'barcoded'
      if (!barcoded || base.source === 'sub_rental') {
        rows.push({
          ...base,
          kind: 'bulk',
          unitId: null,
          barcode: null,
          quantity: qty,
          why: base.source === 'sub_rental' ? 'vendor gear' : 'counted stock',
        })
        continue
      }

      // Expand to the reserved copies of this item that nothing else holds.
      const mine = (item.units ?? []).filter((u) => reserved.has(u.id) && !taken.has(u.id)).slice(0, qty)
      for (const u of mine) {
        taken.add(u.id)
        rows.push({ ...base, kind: 'unit', unitId: u.id, barcode: u.barcode ?? null, serial: u.serial ?? null, quantity: 1 })
      }
      const short = qty - mine.length
      if (short > 0)
        rows.push({
          ...base,
          kind: 'bulk',
          unitId: null,
          barcode: null,
          quantity: short,
          why: 'no unit reserved',
        })
    }
    if (rows.length) out.push({ ...g, lines: rows })
  }
  return out
}

// A line is "out" once BOTH sign-out slots are initialled; "returned" once the
// return slot is. Returns counts over a flat list of estimate lines.
export function packingProgress(lines = [], packing = {}, prefix = '') {
  let out = 0
  let ret = 0
  for (const l of lines) {
    const s = packing[packingLineKey(l, prefix)] || {}
    if (s.out1?.initials && s.out2?.initials) out += 1
    if (s.ret?.initials) ret += 1
  }
  return { total: lines.length, out, ret }
}
