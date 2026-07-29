// Activity log vocabulary + rendering, as a PURE module.
//
// No React, no icons, no browser APIs — so it can be asserted under plain Node
// like lib/orderSearch.js and lib/packing.js, and so both data modes share one
// definition of "what happened".

// Event types the app appends. Dot-namespaced so they can never collide with the
// bare verbs the set_units DB trigger has always written ('reserved',
// 'released', 'checked_out', 'returned').
export const EVENT = {
  ORDER_CREATED: 'order.created',
  ORDER_UPDATED: 'order.updated',
  ORDER_CONFIRMED: 'order.confirmed',
  ORDER_HELD: 'order.held',
  ORDER_DELETED: 'order.deleted',
  EQ_CHANGED: 'order.equipment_changed',
  ADDON_CREATED: 'addon.created',
  ADDON_DELETED: 'addon.deleted',
  PACKING_SIGNED: 'packing.signed',
  PACKING_CLEARED: 'packing.cleared',
  ITEM_CREATED: 'item.created',
  ITEM_UPDATED: 'item.updated',
  ITEM_DELETED: 'item.deleted',
  // Non-barcoded stock moves by QUANTITY, not by unit rows, so a
  // delta is the whole story: who put 20 more J-hooks on the shelf, and when.
  STOCK_ADJUSTED: 'item.stock_adjusted',
  UNIT_ADDED: 'unit.added',
  UNIT_UPDATED: 'unit.updated',
  UNIT_WRITTEN_OFF: 'unit.written_off',
  UNIT_BARCODE_SET: 'unit.barcode_set',
  UNIT_OWNERSHIP: 'unit.ownership_changed',
  UNIT_VENDOR: 'unit.vendor_changed',
  UNIT_REPAIR_OUT: 'unit.sent_to_repair',
  UNIT_REPAIR_BACK: 'unit.returned_from_repair',
}

// Reservations are written per unit by the DB trigger, and the reservation sync
// rewrites every row of a set on each confirm — so they are noise on an ORDER
// card. They stay on the unit/item feed, where "when was this gear out" is the
// whole point.
const RESERVATION_TYPES = new Set(['reserved', 'released', 'checked_out', 'returned'])

export const isReservationEvent = (type) => RESERVATION_TYPES.has(type)

// What an order card shows: everything except reservation churn.
export function orderFeed(events) {
  return (events || []).filter((e) => !isReservationEvent(e.type))
}

// --- the equipment diff ----------------------------------------------------
//
// An order's lines are replaced WHOLESALE on every save, so a naive log would
// say "removed everything, added everything" on a save that only bumped one
// quantity. Grouping by item first is what makes the feed read like a sentence:
// "added 2 x C-Stand 40", "Sandbag 25lb 3 -> 2".
export function diffOrderLines(before, after) {
  const tally = (lines) => {
    const map = new Map()
    for (const l of lines || []) {
      if (!l?.itemId) continue
      const cur = map.get(l.itemId) || { itemId: l.itemId, itemName: l.itemName || null, quantity: 0 }
      cur.quantity += Math.max(1, Number(l.quantity) || 1)
      if (!cur.itemName && l.itemName) cur.itemName = l.itemName
      map.set(l.itemId, cur)
    }
    return map
  }
  const a = tally(before)
  const b = tally(after)
  const added = []
  const removed = []
  const changed = []
  for (const [id, next] of b) {
    const prev = a.get(id)
    if (!prev) added.push({ itemId: id, itemName: next.itemName, quantity: next.quantity })
    else if (prev.quantity !== next.quantity)
      changed.push({
        itemId: id,
        itemName: next.itemName || prev.itemName,
        from: prev.quantity,
        to: next.quantity,
      })
  }
  for (const [id, prev] of a) {
    if (!b.has(id)) removed.push({ itemId: id, itemName: prev.itemName, quantity: prev.quantity })
  }
  let pieces = 0
  for (const [, v] of b) pieces += v.quantity
  return { added, removed, changed, lineCount: b.size, pieces }
}

const qty = (n) => `${n} x`
const list = (rows, fmt) => rows.map(fmt).join(', ')

// Turn an event into a sentence. Returns { icon, title, detail } — the icon is a
// KEY, resolved to a lucide component by the component, keeping this file pure.
export function describeEvent(ev) {
  const d = ev?.data || {}
  switch (ev?.type) {
    case EVENT.EQ_CHANGED: {
      const parts = []
      if (d.added?.length) parts.push(`added ${list(d.added, (r) => `${qty(r.quantity)} ${r.itemName ?? 'item'}`)}`)
      if (d.removed?.length)
        parts.push(`removed ${list(d.removed, (r) => `${qty(r.quantity)} ${r.itemName ?? 'item'}`)}`)
      if (d.changed?.length)
        parts.push(list(d.changed, (r) => `${r.itemName ?? 'item'} ${r.from} → ${r.to}`))
      return {
        icon: 'boxes',
        title: 'Changed the equipment',
        detail: parts.length
          ? parts.join(' · ')
          : `${d.lineCount ?? 0} line(s) · ${d.pieces ?? 0} pcs`,
      }
    }
    case EVENT.ORDER_CONFIRMED:
      return {
        icon: 'check',
        title: 'Confirmed the order',
        detail:
          d.reserved != null
            ? `${d.reserved} piece(s) reserved${d.short ? ` · ${d.short} short` : ''}`
            : null,
      }
    case EVENT.ORDER_HELD:
      return { icon: 'undo', title: 'Moved back to hold', detail: 'Reservations released' }
    case EVENT.ORDER_CREATED:
      return { icon: 'clipboard', title: 'Created the order', detail: d.jobName ?? null }
    case EVENT.ORDER_UPDATED:
      return {
        icon: 'pencil',
        title: 'Edited the order',
        detail: d.changed?.length ? d.changed.join(', ') : null,
      }
    case EVENT.ORDER_DELETED:
      return { icon: 'trash', title: 'Scrapped the order', detail: d.jobName ?? null }
    case EVENT.ADDON_CREATED:
      return { icon: 'plus', title: 'Added an add-on list', detail: d.label ?? null }
    case EVENT.ADDON_DELETED:
      return { icon: 'trash', title: 'Deleted an add-on list', detail: d.label ?? null }
    case EVENT.PACKING_SIGNED:
      return {
        icon: 'signature',
        title: `Signed ${slotLabel(d.slot)}`,
        detail: [d.itemName, d.initials ? `“${d.initials}”` : null].filter(Boolean).join(' · '),
      }
    case EVENT.PACKING_CLEARED:
      return { icon: 'eraser', title: `Cleared ${slotLabel(d.slot)}`, detail: d.itemName ?? null }
    case EVENT.ITEM_CREATED:
      return { icon: 'boxes', title: 'Added this item', detail: d.name ?? null }
    case EVENT.ITEM_UPDATED:
      return {
        icon: 'pencil',
        title: 'Edited the item',
        detail: d.changed?.length ? d.changed.join(', ') : null,
      }
    case EVENT.ITEM_DELETED:
      return { icon: 'trash', title: 'Wrote off the item', detail: d.name ?? null }
    case EVENT.STOCK_ADJUSTED: {
      const delta = Number(d.delta) || 0
      const move = `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`
      return {
        icon: delta > 0 ? 'plus' : 'boxes',
        title: delta > 0 ? 'Added stock' : 'Took stock out',
        detail: `${move} · ${d.from ?? '—'} → ${d.to ?? '—'} on hand`,
      }
    }
    case EVENT.UNIT_ADDED:
      return {
        icon: 'plus',
        title: 'Registered a unit',
        detail: [d.barcode ? `#${d.barcode}` : null, d.serial].filter(Boolean).join(' · '),
      }
    case EVENT.UNIT_UPDATED: {
      // Say WHICH field moved — a relocation and a barcode fix read differently.
      const bits = []
      if (d.from && d.to) {
        if (d.from.barcode !== d.to.barcode) bits.push(`#${d.from.barcode} → #${d.to.barcode}`)
        if (d.from.serial !== d.to.serial) bits.push(`serial ${d.to.serial ?? '—'}`)
        if (d.from.placement !== d.to.placement)
          bits.push(`stored: ${d.from.placement || 'item default'} → ${d.to.placement || 'item default'}`)
      }
      const moved = d.from && d.to && d.from.placement !== d.to.placement
      return {
        icon: moved ? 'tag' : 'pencil',
        title: moved && bits.length === 1 ? 'Moved a unit' : 'Corrected a unit',
        detail: bits.length ? bits.join(' · ') : d.to?.barcode ? `#${d.to.barcode}` : null,
      }
    }
    case EVENT.UNIT_WRITTEN_OFF:
      return {
        icon: 'trash',
        title: 'Wrote off a unit',
        detail: d.barcode ? `#${d.barcode}` : null,
      }
    case EVENT.UNIT_BARCODE_SET:
      return { icon: 'scan', title: 'Set a barcode', detail: `#${d.from ?? '—'} → #${d.to ?? '—'}` }
    case EVENT.UNIT_OWNERSHIP:
      return {
        icon: 'tag',
        title: 'Changed ownership',
        detail: `${own(d.from)} → ${own(d.to)}${d.barcode ? ` · #${d.barcode}` : ''}`,
      }
    case EVENT.UNIT_VENDOR:
      return {
        icon: 'truck',
        title: 'Set the sub-rental vendor',
        detail: [d.vendorName ?? 'cleared', d.barcode ? `#${d.barcode}` : null]
          .filter(Boolean)
          .join(' · '),
      }
    case EVENT.UNIT_REPAIR_OUT:
      return {
        icon: 'wrench',
        title: 'Sent a unit for repair',
        detail: [d.vendor, d.issue, d.barcode ? `#${d.barcode}` : null].filter(Boolean).join(' · '),
      }
    case EVENT.UNIT_REPAIR_BACK:
      return {
        icon: 'wrench',
        title: 'Took a unit back from repair',
        detail: [d.resolution, d.barcode ? `#${d.barcode}` : null].filter(Boolean).join(' · '),
      }
    // Legacy bare verbs from the set_units trigger — these predate the app-side
    // log and must stay renderable.
    case 'reserved':
      return { icon: 'calendar', title: 'Reserved for a shoot', detail: null }
    case 'released':
      return { icon: 'calendar', title: 'Released from a shoot', detail: null }
    case 'checked_out':
      return { icon: 'calendar', title: 'Checked out', detail: null }
    case 'returned':
      return { icon: 'calendar', title: 'Returned', detail: null }
    default:
      return { icon: 'dot', title: String(ev?.type ?? 'Activity').replace(/[._]/g, ' '), detail: null }
  }
}

const slotLabel = (slot) =>
  slot === 'ret' ? 'the return' : slot === 'out2' ? 'the 2nd sign-out' : 'the 1st sign-out'

const own = (v) => (v === 'sub_rental' ? 'sub-rental' : v === 'owned' ? 'owned' : (v ?? '—'))
