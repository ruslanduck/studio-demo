// Scanning station (epic #6, the scan-out / scan-in log).
//
// Pure: order + shoot + inventory + the scan log in, "what is out and what came
// back" out. No React, no store, no browser API — so the rules below can be
// asserted under plain Node, which is how they are tested.
//
// The model, and why it is a separate log rather than a flag on the unit:
//
//   CONFIRMED order → its gear is RESERVED (committed to the job, still on the
//                     shelf; `set_units` rows exist and block other dates)
//   SCAN OUT        → that copy physically left the building
//   SCAN IN         → it came back and is on the shelf again
//
// A flag can only say where a unit is NOW. The acceptance criteria ask who
// scanned it and when, in both directions, so every scan is appended and the
// current state is derived from the last one. That also makes a double scan
// answerable ("already scanned out at 09:14 by Ann") instead of silently
// counting twice.

export const SCAN_OUT = 'out'
export const SCAN_IN = 'in'

// Only a confirmed order has gear committed to it. A hold reserves nothing (see
// "orders drive reservations"), and a closed one has already given everything
// back, so neither can be scanned.
export const isScannable = (order) => order?.status === 'confirmed' && !order?.archivedAt

// The concrete copies that must go out with this shoot.
//
// The order's LINES are not enough: an a-la-carte line carries a quantity, not
// units. The set's reservations are the resolved answer (that is the whole point
// of "orders drive reservations"), so those are what the packing station scans.
// Sub-rental lines are the vendor's gear and never appear here — they are not in
// our register and have no barcode of ours.
export function expectedUnits(order, booking, inventory = []) {
  const ids = booking?.unitIds ?? []
  if (!ids.length) return []

  // Line context (kit name, slot label) so a scan row reads like the pull sheet.
  const byUnit = new Map()
  for (const l of order?.lines ?? []) if (l.unitId) byUnit.set(l.unitId, l)

  const out = []
  for (const item of inventory) {
    for (const u of item.units ?? []) {
      if (!ids.includes(u.id)) continue
      const line = byUnit.get(u.id) || null
      out.push({
        unitId: u.id,
        itemId: item.id,
        itemName: item.name,
        barcode: u.barcode ?? null,
        serial: u.serial ?? null,
        slotLabel: line?.slotLabel ?? null,
        kitId: line?.kitId ?? null,
      })
    }
  }
  // Kit gear first, then loose items — same grouping the packing list prints in.
  return out.sort((a, b) => {
    if (!!a.kitId !== !!b.kitId) return a.kitId ? -1 : 1
    return (a.itemName || '').localeCompare(b.itemName || '')
  })
}

// Current state per unit, from the log. The LAST scan wins, so a unit scanned
// out, back in and out again for a second day reads as out.
export function scanStates(scans = []) {
  const byUnit = new Map()
  const ordered = [...scans].sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')))
  for (const s of ordered) {
    if (!s?.unitId) continue
    const cur = byUnit.get(s.unitId) || { state: 'pending', outAt: null, outBy: null, inAt: null, inBy: null }
    if (s.direction === SCAN_OUT) {
      byUnit.set(s.unitId, { ...cur, state: 'out', outAt: s.at, outBy: s.by ?? null, inAt: null, inBy: null })
    } else if (s.direction === SCAN_IN) {
      byUnit.set(s.unitId, { ...cur, state: 'back', inAt: s.at, inBy: s.by ?? null })
    }
  }
  return byUnit
}

export function scanProgress(expected = [], scans = []) {
  const states = scanStates(scans)
  let out = 0
  let back = 0
  for (const e of expected) {
    const st = states.get(e.unitId)?.state
    if (st === 'out') out += 1
    else if (st === 'back') back += 1
  }
  return { total: expected.length, out, back, pending: expected.length - out - back }
}

// Can the order be closed? Only when nothing is still out. An order whose gear
// was never scanned out has nothing to bring back — the crew can pull a job
// without using the station, and blocking that would make the whole flow
// unusable — so it closes.
export function outstandingUnits(expected = [], scans = []) {
  const states = scanStates(scans)
  return expected.filter((e) => states.get(e.unitId)?.state === 'out')
}

// Resolve a scanned code for one direction. Returns either an accepted unit or
// the reason it was refused, in the crew's words.
//
// `inventory` is used only to name a code that exists but doesn't belong to this
// order — "that's a C-Stand" is far more useful than "unknown barcode".
export function resolveScan(rawCode, { order, expected = [], scans = [], direction, inventory = [] } = {}) {
  const code = String(rawCode ?? '').trim()
  if (!code) return { error: 'Scan or type a barcode.' }
  if (!isScannable(order))
    return {
      error: order?.status
        ? `This order is ${order.status} — only a confirmed order can be scanned.`
        : 'Pick a confirmed order first.',
    }

  const match = expected.find((e) => e.barcode === code)
  if (!match) {
    // Is the code even ours? Name what it is, so a mis-pull is obvious.
    let elsewhere = null
    for (const item of inventory) {
      const u = (item.units ?? []).find((x) => x.barcode === code)
      if (u) {
        elsewhere = item.name
        break
      }
    }
    return {
      error: elsewhere
        ? `#${code} is a ${elsewhere}, and it isn't on this order.`
        : `#${code} isn't in the register.`,
    }
  }

  const st = scanStates(scans).get(match.unitId)?.state ?? 'pending'
  if (direction === SCAN_OUT && st === 'out')
    return { error: `#${code} is already scanned out.`, unit: match, duplicate: true }
  if (direction === SCAN_IN && st !== 'out')
    return {
      error:
        st === 'back'
          ? `#${code} is already back.`
          : `#${code} was never scanned out, so it can't be scanned back in.`,
      unit: match,
      duplicate: st === 'back',
    }

  return { ok: true, unit: match, direction }
}
