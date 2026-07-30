// Applying a predefined scenario list to a booking (Build order #3, 3.5).
//
// A list is a preset pull list mixing kits and a-la-carte items. Applying it
// resolves every entry against live stock and returns the new booking selection
// — it never mutates the list itself (same rule as kit staging in 3.2–3.4).
//
// Resolution order matters: KIT entries go first because their slots need
// *specific* units (a fixed slot only accepts its pinned one). Item quantities
// are filled from whatever is left, so a kit never loses a unit to a loose line.
//
// Anything that can't be satisfied is reported in `warnings` rather than
// silently dropped — the crew sees exactly what still has to be sourced.

import { freeUnitsOf, isUnitFree } from './availability'

// Units of `item` this booking may take. Delegates to the shared availability
// rule (5.6): free for the requested DATES (or already its own) and not yet
// claimed by a staged kit. `dateWindow` is named explicitly — a local called
// `window` would silently resolve to the global object when the parameter is
// missing, which reads as "no window" instead of failing.
function takeableUnits(item, { bookingUnits, claimed, dateWindow }) {
  return freeUnitsOf(item, { claimed, alsoFree: bookingUnits, window: dateWindow })
}

// Resolve one kit's slots to concrete units, mirroring the staging window's
// auto-fill: a FIXED slot takes its pinned unit (or fails), a GENERIC slot takes
// the next free unit of its item.
function resolveKit(kit, inventory, ctx) {
  const units = []
  const unresolved = []
  for (const slot of kit.slots || []) {
    const item = inventory.find((i) => i.id === slot.itemId)
    const name = slot.itemName || item?.name || 'Unknown item'
    const push = (unit) => {
      ctx.claimed.add(unit.id)
      units.push({
        unitId: unit.id,
        itemId: slot.itemId,
        itemName: name,
        barcode: unit.barcode,
        label: slot.label,
        kitId: kit.id,
        kitName: kit.name,
      })
    }

    if ((slot.slotType || 'generic') === 'fixed') {
      const pinned = (item?.units || []).find((u) => u.id === slot.fixedUnitId)
      if (!pinned) unresolved.push(`${name} — pinned unit missing`)
      else if (ctx.claimed.has(pinned.id)) unresolved.push(`${name} — pinned unit already in this booking`)
      // Judged for the requested dates, like every other availability question:
      // the pinned camera may be out today and free on the day we're pulling.
      else if (
        !isUnitFree(pinned, {
          claimed: ctx.claimed,
          alsoFree: ctx.bookingUnits,
          window: ctx.dateWindow,
        })
      )
        unresolved.push(
          `${name} — pinned unit #${pinned.barcode} is ${
            pinned.status === 'in_repair' ? 'in repair' : 'booked for those dates'
          }`,
        )
      else push(pinned)
      continue
    }

    const free = takeableUnits(item, ctx)[0]
    if (!free) unresolved.push(`${name} — nothing free in stock`)
    else push(free)
  }
  return { units, unresolved }
}

/**
 * Apply a scenario list on top of the booking's current selection.
 *
 * @param list         the scenario list ({ entries: [...] })
 * @param inventory    live inventory
 * @param kits         the kit catalogue (list entries store only kit ids)
 * @param selected     current a-la-carte counts, itemId -> qty
 * @param stagedUnits  units already committed by staged kits
 * @param bookingUnits Set of unit ids this booking already holds (edit mode)
 * @param dateWindow   { from, to } the days being pulled for; gear committed to
 *                     other days stays available (omit for "right now")
 * @returns { selected, stagedUnits, applied, warnings, notes }
 *   applied  — { kits, units, lines } summary counts
 *   warnings — entries that could not be fully satisfied
 *   notes    — non-unit-tracked lines to pull by hand (tape, batteries…)
 */
export function applyScenarioList({
  list,
  inventory,
  kits = [],
  selected = {},
  stagedUnits = [],
  bookingUnits = new Set(),
  dateWindow = null,
}) {
  const claimed = new Set(stagedUnits.map((u) => u.unitId))
  const ctx = { bookingUnits, claimed, dateWindow }
  const nextSelected = { ...selected }
  const nextStaged = [...stagedUnits]
  const warnings = []
  const notes = []
  let kitCount = 0

  const entries = list?.entries || []
  const kitEntries = entries.filter((e) => e.type === 'kit')
  const itemEntries = entries.filter((e) => e.type !== 'kit')

  for (const entry of kitEntries) {
    const kit = kits.find((k) => k.id === entry.kitId)
    if (!kit) {
      warnings.push(`${entry.kitName || 'Kit'} — not found`)
      continue
    }
    // An archived kit is REPORTED, never silently resolved: the list line still
    // exists (nothing is deleted), it just can't be pulled until it's restored.
    if (kit.archivedAt) {
      warnings.push(`${kit.name} — archived, restore it to pull this line`)
      continue
    }
    const { units, unresolved } = resolveKit(kit, inventory, ctx)
    nextStaged.push(...units)
    kitCount++
    for (const u of unresolved) warnings.push(`${kit.name}: ${u}`)
  }

  for (const entry of itemEntries) {
    const item = inventory.find((i) => i.id === entry.itemId)
    const wanted = entry.quantity ?? 1
    if (!item) {
      warnings.push(`${entry.itemName || 'Item'} — no longer in inventory`)
      continue
    }
    if (item.archivedAt) {
      warnings.push(`${item.name} — archived, restore it to pull this line`)
      continue
    }
    // Non-barcoded stock has no unit rows to reserve; surface it
    // as a pull note so the list stays complete without faking a reservation.
    if (item.kind && item.kind !== 'barcoded') {
      notes.push(`${wanted}× ${item.name} — not unit-tracked, take from stock`)
      continue
    }
    const already = nextSelected[item.id] ?? 0
    const free = takeableUnits(item, ctx).length
    const add = Math.min(wanted, Math.max(free - already, 0))
    if (add > 0) nextSelected[item.id] = already + add
    if (add < wanted) {
      warnings.push(
        `${item.name} — ${add} of ${wanted} available${free === 0 ? ' (none free)' : ''}`,
      )
    }
  }

  const addedUnits =
    nextStaged.length -
    stagedUnits.length +
    Object.entries(nextSelected).reduce(
      (n, [id, q]) => n + (q - (selected[id] ?? 0)),
      0,
    )

  return {
    selected: nextSelected,
    stagedUnits: nextStaged,
    applied: { kits: kitCount, units: addedUnits, lines: entries.length },
    warnings,
    notes,
  }
}
