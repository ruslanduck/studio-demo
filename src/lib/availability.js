// One availability rule for everything (epic #5, 5.6).
//
// Kits, scenario lists, a-la-carte lines and sub-rental all used to compute "is
// this free?" with their own slightly different filter. That is how a unit ends
// up promised twice. This module is the single answer, and every caller passes
// the same two pieces of context:
//
//   claimed  — unit ids already spoken for in the thing being edited (a staged
//              kit's slots, other lines of the same order). A unit in here is
//              never free, no matter what its stock status says.
//   alsoFree — unit ids that count as free even though stock says otherwise,
//              because the record being edited already holds them (a booking
//              re-opened for editing owns its own reservations).
//
// Sub-rental sits deliberately outside all of this: gear coming in from a vendor
// is not our stock, so a sub-rental line consumes no availability. That is what
// makes "0 available -> pick another item or raise a sub-rental" a real choice
// rather than a dead end.

const asSet = (v) => (v instanceof Set ? v : new Set(v ?? []))

// Do two inclusive date ranges share a day? A missing end means a single day; a
// missing start means "no window given", which overlaps nothing on its own.
export function overlaps(a, b) {
  if (!a?.from || !b?.from) return false
  const aTo = a.to || a.from
  const bTo = b.to || b.from
  return a.from <= bTo && b.from <= aTo
}

// Is this individual unit takeable?
//
// `window` ({ from, to }) is the dates being asked about — a shoot on the 30th
// says nothing about the 31st. Gear is committed PER DAY: one camera can be out
// today and bookable tomorrow, even while today's order is still open, because
// it comes back at the end of the day. Without a window the answer falls back to
// "right now", which is what the inventory table means.
export function isUnitFree(unit, { claimed, alsoFree, window } = {}) {
  if (!unit) return false
  // A written-off (archived) copy is out of the pool everywhere. This one guard
  // covers kits, staging, scenario lists, bookings, the order editor and the
  // reservation sync, because they all resolve availability through here.
  if (unit.archivedAt) return false
  const claimedSet = asSet(claimed)
  const alsoFreeSet = asSet(alsoFree)
  if (claimedSet.has(unit.id)) return false
  if (alsoFreeSet.has(unit.id)) return true
  // An open repair has no dates: the copy is physically away, so it's out
  // whatever window you ask about.
  if (unit.status === 'in_repair') return false
  if (window?.from) {
    // Free unless something it's already committed to covers one of these days.
    return !(unit.reservations || []).some((r) => overlaps(r, window))
  }
  return unit.status === 'available'
}

// The units of `item` that can still be taken, in stock order.
export function freeUnitsOf(item, ctx = {}) {
  return (item?.units ?? []).filter((u) => isUnitFree(u, ctx))
}

// How many of `item` can still be taken. Barcoded items count real free units;
// non-barcoded stock is counted by quantity on hand, minus whatever
// the caller has already put on the list (`usedQty`).
export function availableCount(item, ctx = {}) {
  if (!item) return 0
  if (item.kind === 'barcoded') return freeUnitsOf(item, ctx).length
  const onHand = item.quantity ?? 0
  return Math.max(0, onHand - (ctx.usedQty ?? 0))
}

// Convenience for the zero-availability rule: nothing left in-house.
export function isExhausted(item, ctx = {}) {
  return availableCount(item, ctx) === 0
}

// Units an order reserves (epic #6 fix): a CONFIRMED order's in-house lines,
// resolved to concrete unit ids. Kit slots pin their unit; a-la-carte lines
// resolve by quantity. Sub-rental lines are vendor gear and reserve nothing;
// Hold orders reserve nothing. `claimed` is shared across orders so two orders
// never take the same unit (mutated as units are taken).
export function reservedUnitsForOrder(order, inventory, claimed = new Set()) {
  if (!order || order.status !== 'confirmed') return []
  // Gear is held PER DAY: resolving is done against this order's own working
  // window, so two confirmed orders on different days can hold the same camera.
  const window = { from: order.startsOn || null, to: order.endsOn || order.startsOn || null }
  const ids = []
  for (const l of order.lines || []) {
    if (l.source === 'sub_rental' || !l.unitId) continue
    if (!claimed.has(l.unitId)) {
      claimed.add(l.unitId)
      ids.push(l.unitId)
    }
  }
  const qtyLines = (order.lines || []).filter(
    (l) => l.source !== 'sub_rental' && !l.unitId && l.itemId,
  )
  for (const id of resolveUnitsForQuantities(qtyLines, inventory, { claimed, window })) {
    claimed.add(id)
    ids.push(id)
  }
  return ids
}

// Which concrete units a batch of quantity-based lines would take.
//
// Kits pin their units explicitly; loose a-la-carte lines only carry a quantity,
// so nothing stops a kit slot and a loose line from both counting on the last
// free unit. Resolving quantities to real unit ids — and feeding those ids back
// in as `claimed` — is what makes "one unit can't be booked twice" true across
// kits, lists and loose lines.
//
// Non-barcoded stock is counted, not tracked per unit, so it has nothing to pin.
export function resolveUnitsForQuantities(lines, inventory, ctx = {}) {
  const claimed = new Set(asSet(ctx.claimed))
  const ids = []
  for (const line of lines ?? []) {
    const item = inventory.find((i) => i.id === line.itemId)
    if (!item || item.kind !== 'barcoded') continue
    const take = freeUnitsOf(item, { ...ctx, claimed }).slice(0, Math.max(0, line.quantity ?? 0))
    for (const u of take) {
      claimed.add(u.id)
      ids.push(u.id)
    }
  }
  return ids
}
