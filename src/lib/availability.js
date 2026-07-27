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

// Is this individual unit takeable right now?
export function isUnitFree(unit, { claimed, alsoFree } = {}) {
  if (!unit) return false
  const claimedSet = asSet(claimed)
  const alsoFreeSet = asSet(alsoFree)
  if (claimedSet.has(unit.id)) return false
  return unit.status === 'available' || alsoFreeSet.has(unit.id)
}

// The units of `item` that can still be taken, in stock order.
export function freeUnitsOf(item, ctx = {}) {
  return (item?.units ?? []).filter((u) => isUnitFree(u, ctx))
}

// How many of `item` can still be taken. Barcoded items count real free units;
// non-barcoded and consumables are counted by quantity on hand, minus whatever
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
