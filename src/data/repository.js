// Source-agnostic data layer.
//
// The app talks to this module, not to Supabase or localStorage directly.
// `VITE_DATA_SOURCE` picks the backend:
//   - "local"    (default) → in-memory seeds + Zustand/localStorage (current demo)
//   - "supabase"           → the Postgres schema over PostgREST
//
// Shapes returned here match what the UI already expects (see CLAUDE.md data
// models), so switching the source is transparent to components.
import { supabase, isSupabaseConfigured } from '../lib/supabase'
import { studioLabel, studioColor } from './studios'
import { createUnits } from './inventory'

export const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE || 'local').toLowerCase()
export const usingSupabase = DATA_SOURCE === 'supabase' && isSupabaseConfigured

// A set_unit occupies its unit when the booking is active and not yet returned.
function occupies(su) {
  return su?.set?.status === 'active' && su.status !== 'returned'
}

// ---------------------------------------------------------------- reads ----

export async function getStudios() {
  const { data, error } = await supabase.from('studios').select('id,label').order('id')
  if (error) throw error
  return data
}

// Kits with their component slots (Build order #3). Resilient in two layers:
//   • returns [] if the 3.1 kit_slots table is absent (app still loads);
//   • if the 3.3 slot_type / fixed_unit columns aren't migrated yet, retries
//     without them so kits keep working (every slot treated as generic) until
//     the migration runs. This lets the frontend deploy before the migration.
export async function getKits() {
  const enriched = `id, name, category, notes,
     kit_slots ( id, label, position, slot_type, inventory_item_id,
                 fixed_unit:units!fixed_unit_id ( id, barcode ),
                 item:inventory_items ( name, category, kind ) )`
  const basic = `id, name, category, notes,
     kit_slots ( id, label, position, inventory_item_id,
                 item:inventory_items ( name, category, kind ) )`

  let { data, error } = await supabase.from('kits').select(enriched).order('name')
  if (error) {
    // 3.3 columns not present yet → fall back to the pre-3.3 shape.
    ;({ data, error } = await supabase.from('kits').select(basic).order('name'))
  }
  if (error) return [] // kit_slots table itself absent (pre-3.1)
  return (data || []).map((k) => ({
    id: k.id,
    name: k.name,
    category: k.category,
    notes: k.notes,
    slots: (k.kit_slots || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((s) => ({
        id: s.id,
        label: s.label,
        position: s.position,
        slotType: s.slot_type || 'generic',
        itemId: s.inventory_item_id,
        itemName: s.item?.name || null,
        itemCategory: s.item?.category || null,
        itemKind: s.item?.kind || null,
        fixedUnitId: s.fixed_unit?.id || null,
        fixedBarcode: s.fixed_unit?.barcode || null,
      })),
  }))
}

// Predefined scenario lists with their entries (3.5). Like kits, this degrades
// to [] when the table isn't migrated yet, so the frontend can ship first.
export async function getScenarioLists() {
  const { data, error } = await supabase
    .from('scenario_lists')
    .select(
      `id, name, category, notes,
       scenario_list_entries (
         id, entry_type, quantity, position, note, inventory_item_id, kit_id,
         item:inventory_items ( name, category, kind ),
         kit:kits ( name, category )
       )`,
    )
    .order('name')
  if (error) return []
  return (data || []).map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    notes: l.notes,
    entries: (l.scenario_list_entries || [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((e) => ({
        id: e.id,
        type: e.entry_type,
        quantity: e.quantity,
        position: e.position,
        note: e.note,
        itemId: e.inventory_item_id,
        itemName: e.item?.name || null,
        itemKind: e.item?.kind || null,
        kitId: e.kit_id,
        kitName: e.kit?.name || null,
      })),
  }))
}

// Repairs grouped by unit id, newest first. Fetched separately (not embedded)
// so a project that hasn't run the 2.6 migration yet still loads inventory —
// a missing `repairs` relation degrades to "no repairs" rather than failing
// the whole query.
async function getRepairsByUnit() {
  // `created_by` / `returned_by` were stored from the start (the second by a DB
  // trigger) but never selected, so the UI could never say who sent a unit out
  // or who took it back. Embedded here under two distinct aliases.
  const withActors = `id, unit_id, vendor, issue, sent_at, returned_at, resolution,
     sender:profiles!created_by ( full_name ),
     returner:profiles!returned_by ( full_name )`
  let { data, error } = await supabase
    .from('repairs')
    .select(withActors)
    .order('sent_at', { ascending: false })
  if (error) {
    // Pre-2.6 shape (or no profiles): fall back to the plain columns.
    ;({ data, error } = await supabase
      .from('repairs')
      .select('id, unit_id, vendor, issue, sent_at, returned_at, resolution')
      .order('sent_at', { ascending: false }))
  }
  if (error) return {} // table absent / not yet migrated → no repairs
  const map = {}
  for (const r of data || []) {
    ;(map[r.unit_id] ||= []).push({
      id: r.id,
      vendor: r.vendor,
      issue: r.issue,
      sentAt: r.sent_at,
      returnedAt: r.returned_at,
      resolution: r.resolution,
      sentBy: r.sender?.full_name ?? null,
      returnedBy: r.returner?.full_name ?? null,
    })
  }
  return map
}

// Usage events grouped by item id, newest first. Fetched separately (like
// repairs) so inventory still loads if the 2.7 migration hasn't run yet.
async function getUsageByItem() {
  // Same story as repairs: `created_by` was recorded and thrown away on read.
  const withActor = `inventory_item_id, job_title, studio_id, quantity, used_on,
     logger:profiles!created_by ( full_name )`
  let { data, error } = await supabase
    .from('item_usage')
    .select(withActor)
    .order('used_on', { ascending: false })
  if (error) {
    ;({ data, error } = await supabase
      .from('item_usage')
      .select('inventory_item_id, job_title, studio_id, quantity, used_on')
      .order('used_on', { ascending: false }))
  }
  if (error) return {} // table absent / not yet migrated → no usage
  const map = {}
  for (const u of data || []) {
    ;(map[u.inventory_item_id] ||= []).push({
      jobTitle: u.job_title,
      studioId: u.studio_id,
      quantity: u.quantity,
      usedOn: u.used_on,
      loggedBy: u.logger?.full_name ?? null,
    })
  }
  return map
}

// Inventory items with their units. `status`/`location` are derived from the
// active reservations in set_units + any open repair (the DB keeps no
// denormalized copy). An open repair takes precedence: the unit is unavailable.
export async function getInventory() {
  // `sub_rental_vendor_id` (4.5) is requested with a fallback: inventory is the
  // app's backbone, so a pre-4.5 database must still load it.
  const withVendor = `id, name, category, kind, quantity,
     brand, asset_type, placement, subcategory, purchase_date, replacement_price, day_rate,
     units (
       id, barcode, serial, ownership, sub_rental_vendor_id,
       set_units ( status, set:sets ( title, studio_id, status ) )
     )`
  const withoutVendor = withVendor.replace(', sub_rental_vendor_id', '')
  const withoutRate = withoutVendor.replace(', day_rate', '')
  let { data, error } = await supabase.from('inventory_items').select(withVendor).order('name')
  if (error)
    ({ data, error } = await supabase.from('inventory_items').select(withoutVendor).order('name'))
  if (error)
    ({ data, error } = await supabase.from('inventory_items').select(withoutRate).order('name'))
  if (error) throw error

  const [repairsByUnit, usageByItem] = await Promise.all([
    getRepairsByUnit(),
    getUsageByItem(),
  ])

  return data.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    kind: item.kind,
    quantity: item.quantity,
    brand: item.brand,
    assetType: item.asset_type,
    placement: item.placement,
    subcategory: item.subcategory,
    purchaseDate: item.purchase_date,
    replacementPrice: item.replacement_price,
    dayRate: item.day_rate != null ? Number(item.day_rate) : null,
    usage: usageByItem[item.id] || [],
    units: (item.units || []).map((u) => {
      const repairs = repairsByUnit[u.id] || []
      const openRepair = repairs.find((r) => !r.returnedAt)
      const active = (u.set_units || []).find(occupies)
      let status = 'available'
      let location = 'Available'
      if (openRepair) {
        status = 'in_repair'
        location = `In repair — ${openRepair.vendor || 'Vendor'}`
      } else if (active) {
        status = 'checked_out'
        location = `${active.set.title} — ${studioLabel(active.set.studio_id)}`
      }
      return {
        id: u.id,
        barcode: u.barcode,
        serial: u.serial,
        ownership: u.ownership,
        subRentalVendorId: u.sub_rental_vendor_id ?? null,
        status,
        location,
        repairs,
      }
    }),
  }))
}

// Bookings (sets) mapped to the app's booking shape. photographer/model come
// from the roster (requires auth to read — under anon they resolve to '').
export async function getBookings() {
  const { data, error } = await supabase
    .from('sets')
    .select(
      `id, title, studio_id, date, start_time, end_time, status, color, notes, order_id,
       created_by, creator:profiles!created_by ( full_name ),
       set_units ( unit_id ),
       roster_entries ( role, contact:contacts ( full_name ) )`,
    )
    .order('date')
  if (error) throw error

  return data.map((s) => {
    const roster = s.roster_entries || []
    const byRole = (role) => roster.find((r) => r.role === role)?.contact?.full_name || ''
    return {
      id: s.id,
      title: s.title,
      studioId: s.studio_id,
      date: s.date,
      startTime: s.start_time?.slice(0, 5),
      endTime: s.end_time?.slice(0, 5),
      status: s.status,
      color: s.color || studioColor(s.studio_id),
      notes: s.notes,
      // The set's driving (client) order, so the calendar can open it — a shoot
      // IS its order. Null for a legacy order-less booking.
      orderId: s.order_id || null,
      unitIds: (s.set_units || []).map((su) => su.unit_id),
      photographer: byRole('photographer'),
      model: byRole('model'),
      createdBy: s.creator?.full_name || null,
    }
  })
}

// KEY SCENARIO: click a unit → every set it was in → each set's roster.
// Powered by set_units (unit↔set) + roster_entries (person↔set).
export async function getUnitHistory(unitId) {
  const { data, error } = await supabase
    .from('set_units')
    .select(
      `status, reserved_from, reserved_to,
       set:sets (
         id, title, date, studio_id,
         roster:roster_entries ( role, contact:contacts ( full_name ) )
       )`,
    )
    .eq('unit_id', unitId)
  if (error) throw error

  return (data || [])
    .filter((su) => su.set)
    .map((su) => ({
      reservationStatus: su.status,
      reservedFrom: su.reserved_from,
      reservedTo: su.reserved_to,
      setId: su.set.id,
      title: su.set.title,
      date: su.set.date,
      studioId: su.set.studio_id,
      // Roster is RLS-protected — empty for anonymous viewers, populated once signed in.
      roster: (su.set.roster || []).map((r) => ({
        role: r.role,
        name: r.contact?.full_name,
      })),
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)))
}

// -------------------------------------------------------------- writes ----
// RLS write policies are `to authenticated`, so these need a signed-in user
// (the app requires email/password login in supabase mode).

// Find a contact by name, creating it if absent (supports free-text entry).
async function resolveContactId(fullName) {
  const name = (fullName || '').trim()
  if (!name) return null
  const { data: found, error } = await supabase
    .from('contacts').select('id').eq('full_name', name).limit(1)
  if (error) throw error
  if (found && found.length) return found[0].id
  const { data: created, error: cErr } = await supabase
    .from('contacts').insert({ full_name: name }).select('id').single()
  if (cErr) throw cErr
  return created.id
}

// Replace a set's roster with the given photographer/model.
async function replaceRoster(setId, photographer, model) {
  await supabase.from('roster_entries').delete().eq('set_id', setId)
  const rows = []
  const pId = await resolveContactId(photographer)
  if (pId) rows.push({ set_id: setId, contact_id: pId, role: 'photographer' })
  const mId = await resolveContactId(model)
  if (mId) rows.push({ set_id: setId, contact_id: mId, role: 'model' })
  if (rows.length) {
    const { error } = await supabase.from('roster_entries').insert(rows)
    if (error) throw error
  }
}

// Replace a set's reserved units.
async function replaceUnits(setId, unitIds = []) {
  await supabase.from('set_units').delete().eq('set_id', setId)
  if (unitIds.length) {
    const rows = unitIds.map((unit_id) => ({ set_id: setId, unit_id, status: 'reserved' }))
    const { error } = await supabase.from('set_units').insert(rows)
    if (error) throw error
  }
}

export async function createBooking(b) {
  const { data: set, error } = await supabase
    .from('sets')
    .insert({
      title: b.title, studio_id: b.studioId, date: b.date,
      start_time: b.startTime, end_time: b.endTime,
      color: b.color || studioColor(b.studioId), notes: b.notes, status: 'active',
    })
    .select('id')
    .single()
  if (error) throw error
  await replaceUnits(set.id, b.unitIds)
  await replaceRoster(set.id, b.photographer, b.model)
  return set.id
}

export async function updateBooking(setId, changes) {
  const patch = {}
  if ('title' in changes) patch.title = changes.title
  if ('studioId' in changes) patch.studio_id = changes.studioId
  if ('date' in changes) patch.date = changes.date
  if ('startTime' in changes) patch.start_time = changes.startTime
  if ('endTime' in changes) patch.end_time = changes.endTime
  if ('notes' in changes) patch.notes = changes.notes
  if ('color' in changes) patch.color = changes.color
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('sets').update(patch).eq('id', setId)
    if (error) throw error
  }
  if ('unitIds' in changes) await replaceUnits(setId, changes.unitIds)
  if ('photographer' in changes || 'model' in changes) {
    await replaceRoster(setId, changes.photographer, changes.model)
  }
}

export async function deleteBooking(setId) {
  const { error } = await supabase.from('sets').delete().eq('id', setId)
  if (error) throw error
}

// --- activity log ----------------------------------------------------------
//
// `events` was already an append-only history with an actor and timeline
// indexes, fed by a trigger on set_units and read by nobody. These two turn it
// into the app's activity log.
//
// Writing NEVER blocks or fails the action it describes: a missing migration (or
// a missing INSERT policy) degrades to "no history", not a broken save. The
// actor is passed in rather than defaulted, because the column has no default —
// the RLS check (actor_id = auth.uid()) is what stops it being spoofed.
export async function logEvent(
  { eventType, entityType, entityId, unitId = null, setId = null, data = {} } = {},
  actorId = null,
) {
  if (!eventType || !entityType || !entityId) return false
  try {
    const { error } = await supabase.from('events').insert({
      event_type: eventType,
      entity_type: entityType,
      entity_id: entityId,
      unit_id: unitId,
      set_id: setId,
      actor_id: actorId,
      data,
    })
    if (error) throw error
    return true
  } catch (e) {
    console.warn('activity log skipped:', e.message)
    return false
  }
}

// One entity's history, newest first, with the actor resolved to a name.
export async function getEvents({ entityType, entityId, limit = 60 } = {}) {
  if (!entityType || !entityId) return []
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, occurred_at, event_type, entity_type, entity_id, unit_id, set_id, data, actor:profiles!actor_id ( full_name )')
      .eq('entity_type', entityType)
      .eq('entity_id', entityId)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data || []).map(mapEventRow)
  } catch {
    return [] // table/FK absent → no history rather than a broken card
  }
}

// Events for MANY units at once (an item's units), so the item card can show
// unit-level activity without a query per unit.
export async function getEventsForUnits(unitIds, limit = 60) {
  const ids = [...new Set(unitIds || [])].filter(Boolean)
  if (!ids.length) return []
  try {
    const { data, error } = await supabase
      .from('events')
      .select('id, occurred_at, event_type, entity_type, entity_id, unit_id, set_id, data, actor:profiles!actor_id ( full_name )')
      .in('unit_id', ids)
      .order('occurred_at', { ascending: false })
      .limit(limit)
    if (error) throw error
    return (data || []).map(mapEventRow)
  } catch {
    return []
  }
}

function mapEventRow(e) {
  return {
    id: e.id,
    at: e.occurred_at,
    type: e.event_type,
    entityType: e.entity_type,
    entityId: e.entity_id,
    unitId: e.unit_id,
    setId: e.set_id,
    actorName: e.actor?.full_name ?? null,
    data: e.data || {},
  }
}

// Stamp who last changed an order's equipment (the denormalised headline the
// order list and card read; `events` keeps the full trail).
export async function touchOrderEquipment(orderId, actorId) {
  try {
    const { error } = await supabase
      .from('orders')
      .update({ eq_updated_by: actorId ?? null, eq_updated_at: new Date().toISOString() })
      .eq('id', orderId)
    if (error) throw error
  } catch (e) {
    console.warn('eq attribution skipped:', e.message)
  }
}

export async function toggleOwnership(unitId, next) {
  const { error } = await supabase.from('units').update({ ownership: next }).eq('id', unitId)
  if (error) throw error
}

// Set/correct a unit's barcode (3.4 — barcode edit/add when filling slots).
export async function setUnitBarcode(unitId, barcode) {
  const { error } = await supabase.from('units').update({ barcode }).eq('id', unitId)
  if (error) throw error
}

// --- individual units of an existing item (the asset register) --------------

// Add tracked units (physical copies) to a barcoded item. Barcodes/serials are
// decided by the caller so the same numbers show in the UI immediately.
export async function addUnits(itemId, units) {
  const rows = (units || []).map((u) => ({
    inventory_item_id: itemId,
    barcode: u.barcode,
    serial: u.serial,
    ownership: u.ownership || 'owned',
  }))
  if (!rows.length) return
  const { error } = await supabase.from('units').insert(rows)
  if (error) throw error
}

// Correct one unit's identifiers.
export async function updateUnit(unitId, { barcode, serial } = {}) {
  const patch = {}
  if (barcode != null) patch.barcode = barcode
  if (serial != null) patch.serial = serial
  if (!Object.keys(patch).length) return
  const { error } = await supabase.from('units').update(patch).eq('id', unitId)
  if (error) throw error
}

// Write off ONE unit. `set_units.unit_id` is ON DELETE RESTRICT, so a unit that
// has been on jobs can't be dropped while those links exist — they're cleared
// first, exactly like the item-level write-off. The event log keeps its history:
// `events.unit_id` is a SOFT reference (its FK was dropped in
// 20260724120000_events_soft_refs.sql), so the trail survives the unit.
// A unit pinned to a kit's FIXED slot is still refused by the DB
// (kit_slots.fixed_unit_id is RESTRICT) — the store checks for that up front so
// the user gets a reason instead of a raw error.
export async function deleteUnit(unitId) {
  const { error: suErr } = await supabase.from('set_units').delete().eq('unit_id', unitId)
  if (suErr) throw suErr
  const { error } = await supabase.from('units').delete().eq('id', unitId)
  if (error) throw error
}

// Send a unit out for repair (opens a repair row → unit becomes unavailable).
export async function sendToRepair(unitId, { vendor, issue, sentAt } = {}) {
  const row = { unit_id: unitId, vendor: vendor || null, issue: issue || null }
  if (sentAt) row.sent_at = sentAt // else DB default current_date
  const { error } = await supabase.from('repairs').insert(row)
  if (error) throw error
}

// Close an open repair (returned_at + resolution). returned_by is stamped by a
// DB trigger. The unit frees up unless another open repair remains.
export async function returnFromRepair(repairId, { returnedAt, resolution } = {}) {
  const { error } = await supabase
    .from('repairs')
    .update({ returned_at: returnedAt, resolution: resolution || null })
    .eq('id', repairId)
  if (error) throw error
}

// Record a usage event for an item (work-history / analytics).
export async function logItemUsage(itemId, { jobTitle, studioId, quantity, usedOn } = {}) {
  const row = {
    inventory_item_id: itemId,
    job_title: jobTitle || null,
    studio_id: studioId || null,
    quantity: quantity || 1,
  }
  if (usedOn) row.used_on = usedOn
  const { error } = await supabase.from('item_usage').insert(row)
  if (error) throw error
}

// Map the item's optional attribute fields to DB columns (blank → null).
function itemFieldColumns(f = {}) {
  const clean = (v) => (v === '' || v == null ? null : v)
  return {
    brand: clean(f.brand),
    asset_type: clean(f.assetType),
    placement: clean(f.placement),
    subcategory: clean(f.subcategory),
    purchase_date: clean(f.purchaseDate),
    replacement_price: clean(f.replacementPrice),
  }
}

export async function addInventoryItem({ name, category, quantity, kind = 'barcoded', ...fields }) {
  const attrs = itemFieldColumns(fields)

  // Non-barcoded / consumable items store a quantity and have no unit rows.
  if (kind !== 'barcoded') {
    const { data: item, error } = await supabase
      .from('inventory_items')
      .insert({ name: name.trim(), category, kind, quantity, ...attrs })
      .select('id')
      .single()
    if (error) throw error
    return item.id
  }

  // Barcoded: generate `quantity` tracked units with fresh barcodes.
  const { data: item, error } = await supabase
    .from('inventory_items')
    .insert({ name: name.trim(), category, kind: 'barcoded', ...attrs })
    .select('id')
    .single()
  if (error) throw error
  const { data: rows } = await supabase.from('units').select('barcode')
  let maxB = 0
  for (const r of rows || []) {
    const n = parseInt(r.barcode, 10)
    if (Number.isFinite(n) && n > maxB) maxB = n
  }
  const units = createUnits(item.id, quantity, maxB + 1)
  const { error: uErr } = await supabase.from('units').insert(
    units.map((u) => ({
      inventory_item_id: item.id, barcode: u.barcode, serial: u.serial, ownership: u.ownership,
    })),
  )
  if (uErr) throw uErr
  return item.id
}

// Update an item's fields. kind is immutable; quantity only applies to
// non-barcoded / consumable items.
export async function updateInventoryItem(itemId, { name, category, kind, quantity, ...fields }) {
  const patch = itemFieldColumns(fields)
  if (name != null) patch.name = name.trim()
  if (category != null) patch.category = category
  if (kind && kind !== 'barcoded' && quantity != null) patch.quantity = quantity
  const { error } = await supabase.from('inventory_items').update(patch).eq('id', itemId)
  if (error) throw error
}

// Delete an item (write-off). Frees any reservations on its units first, then
// deletes the item (units cascade). Event-log history is preserved — events hold
// only soft references (see deleteUnit).
export async function deleteInventoryItem(itemId) {
  const { data: units } = await supabase.from('units').select('id').eq('inventory_item_id', itemId)
  const unitIds = (units || []).map((u) => u.id)
  if (unitIds.length) {
    const { error: suErr } = await supabase.from('set_units').delete().in('unit_id', unitIds)
    if (suErr) throw suErr
  }
  const { error } = await supabase.from('inventory_items').delete().eq('id', itemId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Kit authoring (3.6). A kit's composition is its slot list, so saving a kit
// means replacing its slots wholesale — simpler and safer than diffing, and the
// slot ids aren't referenced anywhere outside the kit.
// ---------------------------------------------------------------------------

// Map an editor slot to a kit_slots row. Honours the DB check constraint:
// FIXED must name a unit, GENERIC must not.
function kitSlotRow(kitId, s, position) {
  const fixed = s.slotType === 'fixed' && s.fixedUnitId
  return {
    kit_id: kitId,
    inventory_item_id: s.itemId,
    label: s.label?.trim() || null,
    position,
    slot_type: fixed ? 'fixed' : 'generic',
    fixed_unit_id: fixed ? s.fixedUnitId : null,
  }
}

async function replaceKitSlots(kitId, slots) {
  const { error: delErr } = await supabase.from('kit_slots').delete().eq('kit_id', kitId)
  if (delErr) throw delErr
  const rows = (slots || []).filter((s) => s.itemId).map((s, i) => kitSlotRow(kitId, s, i))
  if (!rows.length) return
  const { error } = await supabase.from('kit_slots').insert(rows)
  if (error) throw error
}

export async function createKit({ name, category, notes, slots }) {
  const { data, error } = await supabase
    .from('kits')
    .insert({ name: name.trim(), category: category || null, notes: notes?.trim() || null })
    .select('id')
    .single()
  if (error) throw error
  await replaceKitSlots(data.id, slots)
  return data.id
}

export async function updateKit(kitId, { name, category, notes, slots }) {
  const patch = {}
  if (name != null) patch.name = name.trim()
  if (category !== undefined) patch.category = category || null
  if (notes !== undefined) patch.notes = notes?.trim() || null
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('kits').update(patch).eq('id', kitId)
    if (error) throw error
  }
  if (slots) await replaceKitSlots(kitId, slots)
}

// Delete a kit. kit_slots cascade; scenario_list_entries pointing at it cascade
// too (both declare on delete cascade), so lists lose that line cleanly.
export async function deleteKit(kitId) {
  const { error } = await supabase.from('kits').delete().eq('id', kitId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// Scenario list authoring (3.6). Same wholesale-replace approach for entries.
// ---------------------------------------------------------------------------

// Honours scenario_entry_target_ck: an entry points at exactly one target that
// matches its type, and kit entries are always quantity 1.
function scenarioEntryRow(listId, e, position) {
  const isKit = e.type === 'kit'
  return {
    list_id: listId,
    entry_type: isKit ? 'kit' : 'item',
    inventory_item_id: isKit ? null : e.itemId,
    kit_id: isKit ? e.kitId : null,
    quantity: isKit ? 1 : Math.max(1, Number(e.quantity) || 1),
    position,
    note: e.note?.trim() || null,
  }
}

async function replaceScenarioEntries(listId, entries) {
  const { error: delErr } = await supabase
    .from('scenario_list_entries')
    .delete()
    .eq('list_id', listId)
  if (delErr) throw delErr
  const rows = (entries || [])
    .filter((e) => (e.type === 'kit' ? e.kitId : e.itemId))
    .map((e, i) => scenarioEntryRow(listId, e, i))
  if (!rows.length) return
  const { error } = await supabase.from('scenario_list_entries').insert(rows)
  if (error) throw error
}

export async function createScenarioList({ name, category, notes, entries }) {
  const { data, error } = await supabase
    .from('scenario_lists')
    .insert({ name: name.trim(), category: category || null, notes: notes?.trim() || null })
    .select('id')
    .single()
  if (error) throw error
  await replaceScenarioEntries(data.id, entries)
  return data.id
}

export async function updateScenarioList(listId, { name, category, notes, entries }) {
  const patch = {}
  if (name != null) patch.name = name.trim()
  if (category !== undefined) patch.category = category || null
  if (notes !== undefined) patch.notes = notes?.trim() || null
  if (Object.keys(patch).length) {
    const { error } = await supabase.from('scenario_lists').update(patch).eq('id', listId)
    if (error) throw error
  }
  if (entries) await replaceScenarioEntries(listId, entries)
}

export async function deleteScenarioList(listId) {
  const { error } = await supabase.from('scenario_lists').delete().eq('id', listId)
  if (error) throw error
}

// ---------------------------------------------------------------------------
// People & companies (4.1 + 4.2). `contacts` predates this module as the roster
// lookup, so both reads degrade to the pre-4.1 column set when the migration
// hasn't run — the app keeps working, just without categories/profiles.
// ---------------------------------------------------------------------------

export async function getCompanies() {
  // Layered like getKits: full 4.3 shape, then 4.2, then the original columns.
  const full = 'id, name, kind, notes, company_type, address, opening_hours, website, email, phone'
  const mid = 'id, name, kind, notes, company_type'
  const basic = 'id, name, kind, notes'
  let { data, error } = await supabase.from('companies').select(full).order('name')
  if (error) ({ data, error } = await supabase.from('companies').select(mid).order('name'))
  if (error) ({ data, error } = await supabase.from('companies').select(basic).order('name'))
  if (error) return []
  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    companyType: c.company_type ?? null,
    notes: c.notes,
    address: c.address ?? null,
    openingHours: c.opening_hours ?? null,
    website: c.website ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
  }))
}

// The user-editable Type option list (4.4). Missing table → the app falls back to
// the types already in use, so the dropdown is never empty.
export async function getCompanyTypes() {
  const { data, error } = await supabase
    .from('company_types')
    .select('id, name, position')
    .order('position')
  if (error) return []
  return (data || []).map((t) => ({ id: t.id, name: t.name, position: t.position }))
}

export async function createCompanyType(name, position = 999) {
  const { data, error } = await supabase
    .from('company_types')
    .insert({ name: name.trim(), position })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// Renaming a type also moves every company already labelled with the old value,
// since companies store the type as text.
export async function renameCompanyType(id, oldName, newName) {
  const { error } = await supabase
    .from('company_types')
    .update({ name: newName.trim() })
    .eq('id', id)
  if (error) throw error
  if (oldName) {
    await supabase
      .from('companies')
      .update({ company_type: newName.trim() })
      .eq('company_type', oldName)
  }
}

// Removing an option leaves companies that already use it untouched — the label
// stays, it just stops being offered.
export async function deleteCompanyType(id) {
  const { error } = await supabase.from('company_types').delete().eq('id', id)
  if (error) throw error
}

function companyColumns(c) {
  const row = {}
  if (c.name != null) row.name = c.name.trim()
  if (c.kind !== undefined) row.kind = c.kind || 'client'
  for (const [key, col] of [
    ['companyType', 'company_type'],
    ['address', 'address'],
    ['openingHours', 'opening_hours'],
    ['website', 'website'],
    ['email', 'email'],
    ['phone', 'phone'],
    ['notes', 'notes'],
  ]) {
    if (key in c) row[col] = (typeof c[key] === 'string' ? c[key].trim() : c[key]) || null
  }
  return row
}

export async function updateCompany(id, changes) {
  const { error } = await supabase.from('companies').update(companyColumns(changes)).eq('id', id)
  if (error) throw error
}

// contacts.company_id and orders.company_id are ON DELETE SET NULL, so deleting a
// company detaches its people and orders rather than destroying them.
export async function deleteCompany(id) {
  const { error } = await supabase.from('companies').delete().eq('id', id)
  if (error) throw error
}

// Orders, used by 4.5 as the work-history source for company cards. Epic #5 owns
// the orders module; a missing kind column or table degrades to [].
// Packing sign-offs grouped by order id → { [lineKey]: { out1, out2, ret } },
// each slot { initials, at } or null. Fetched separately (like repairs/usage)
// so orders still load if the 6.2 migration hasn't run yet.
async function getPackingSignoffs() {
  const { data, error } = await supabase
    .from('packing_signoffs')
    .select('order_id, line_key, out1_initials, out1_at, out2_initials, out2_at, ret_initials, ret_at')
  if (error) return {}
  const map = {}
  const slot = (ini, at) => (ini ? { initials: ini, at } : null)
  for (const r of data || []) {
    ;(map[r.order_id] ||= {})[r.line_key] = {
      out1: slot(r.out1_initials, r.out1_at),
      out2: slot(r.out2_initials, r.out2_at),
      ret: slot(r.ret_initials, r.ret_at),
    }
  }
  return map
}

// Map a DB order/addon line row to the app's line shape (shared by orders and
// add-ons, since add-on lines mirror order_lines).
function mapLineRow(l) {
  return {
    id: l.id ?? null,
    itemId: l.item?.id ?? null,
    itemName: l.item?.name ?? null,
    quantity: l.quantity,
    dayRate: l.item?.day_rate != null ? Number(l.item.day_rate) : null,
    kitId: l.kit_id ?? null,
    unitId: l.unit?.id ?? l.unit_id ?? null,
    barcode: l.unit?.barcode ?? null,
    slotLabel: l.slot_label ?? null,
    source: l.source ?? 'in_house',
    vendorId: l.vendor?.id ?? l.vendor_company_id ?? null,
    vendorName: l.vendor?.name ?? null,
  }
}

// Add-on packing lists grouped by order id (6.4). Fetched separately so orders
// still load if the 6.4 migration hasn't run yet.
async function getAddonsByOrder() {
  const lines = `addon_lines ( id, quantity, kit_id, unit_id, slot_label, source, vendor_company_id,
                     item:inventory_items ( id, name, day_rate ),
                     unit:units ( id, barcode ),
                     vendor:companies!vendor_company_id ( id, name ) )`
  // `created_by` was stored and never read — an add-on is the most day-of,
  // most disputable action in the app, so it should say who added it.
  let { data, error } = await supabase
    .from('order_addons')
    .select(`id, order_id, label, created_at, author:profiles!created_by ( full_name ), ${lines}`)
    .order('created_at')
  if (error) {
    ;({ data, error } = await supabase
      .from('order_addons')
      .select(`id, order_id, label, created_at, ${lines}`)
      .order('created_at'))
  }
  if (error) return {}
  const map = {}
  for (const a of data || []) {
    ;(map[a.order_id] ||= []).push({
      id: a.id,
      label: a.label,
      createdAt: a.created_at,
      createdBy: a.author?.full_name ?? null,
      lines: (a.addon_lines || []).map(mapLineRow),
    })
  }
  return map
}

export async function getOrders() {
  // Layered: the epic-5 shape first, then the 4.5 shape, then the stub — so a
  // database that hasn't run the newer migrations still renders history.
  const fullNoEq = `id, order_number, status, ordered_at, kind, company_id,
     job_name, studio_id, starts_on, ends_on, po_number, created_at,
     photographer:contacts!photographer_contact_id ( id, full_name ),
     creator:profiles!created_by ( full_name ),
     company:companies ( id, name ),
     order_lines ( id, quantity, kit_id, unit_id, slot_label, source, vendor_company_id,
                   item:inventory_items ( id, name, day_rate ),
                   unit:units ( id, barcode ),
                   vendor:companies!vendor_company_id ( id, name ) ),
     sets ( id, title, date )`
  // Who last changed the equipment (a second, distinct alias on profiles). Its
  // own layer so a database without the activity-log migration falls back to the
  // shape WITH creator/created_at instead of skipping straight past it — that
  // used to turn a real author into "unknown".
  const full = `${fullNoEq}, eq_updated_at, eq_editor:profiles!eq_updated_by ( full_name )`
  const withKind = `id, order_number, status, ordered_at, kind, company_id,
     company:companies ( id, name ),
     order_lines ( quantity, item:inventory_items ( id, name ) ),
     sets ( id, title, date )`
  const withoutKind = withKind.replace('kind, ', '')

  let { data, error } = await supabase.from('orders').select(full).order('ordered_at')
  if (error) ({ data, error } = await supabase.from('orders').select(fullNoEq).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(withKind).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(withoutKind).order('ordered_at'))
  if (error) return []

  const [packing, addonsByOrder] = await Promise.all([getPackingSignoffs(), getAddonsByOrder()])

  return (data || []).map((o) => ({
    id: o.id,
    number: o.order_number,
    status: o.status,
    orderedAt: o.ordered_at,
    kind: o.kind ?? 'client',
    companyId: o.company?.id ?? o.company_id ?? null,
    companyName: o.company?.name ?? null,
    setId: o.sets?.[0]?.id ?? null,
    setTitle: o.sets?.[0]?.title ?? null,
    // epic 5 (absent on a pre-5.1 database → null, and the UI hides the block)
    jobName: o.job_name ?? o.sets?.[0]?.title ?? null,
    studioId: o.studio_id ?? null,
    startsOn: o.starts_on ?? null,
    endsOn: o.ends_on ?? null,
    poNumber: o.po_number ?? null,
    photographerId: o.photographer?.id ?? null,
    photographer: o.photographer?.full_name ?? null,
    createdBy: o.creator?.full_name ?? null,
    createdAt: o.created_at ?? null,
    // Who last touched this order's equipment (null on a pre-activity-log DB).
    eqUpdatedBy: o.eq_editor?.full_name ?? null,
    eqUpdatedAt: o.eq_updated_at ?? null,
    packing: packing[o.id] || {},
    addons: addonsByOrder[o.id] || [],
    lines: (o.order_lines || []).map(mapLineRow),
  }))
}

// Columns for an order payload (5.1/5.2). `created_by` is left to the column
// default (auth.uid()) so attribution can't be spoofed from the client.
function orderColumns(o) {
  const row = {}
  if (o.jobName != null) row.job_name = o.jobName.trim()
  if (o.studioId !== undefined) row.studio_id = o.studioId || null
  if (o.startsOn !== undefined) row.starts_on = o.startsOn || null
  if (o.endsOn !== undefined) row.ends_on = o.endsOn || null
  if (o.photographerId !== undefined) row.photographer_contact_id = o.photographerId || null
  if (o.poNumber !== undefined) row.po_number = o.poNumber?.trim() || null
  if (o.status !== undefined) row.status = o.status
  if (o.kind !== undefined) row.kind = o.kind
  if (o.companyId !== undefined) row.company_id = o.companyId || null
  if (o.number !== undefined) row.order_number = o.number?.trim() || null
  // The order date follows the first working day so history lines up.
  if (o.startsOn !== undefined) row.ordered_at = o.startsOn || null
  return row
}

export async function createOrder(order) {
  const { data, error } = await supabase
    .from('orders')
    .insert(orderColumns(order))
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateOrder(id, changes) {
  const { error } = await supabase.from('orders').update(orderColumns(changes)).eq('id', id)
  if (error) throw error
}

// order_lines cascade; sets.order_id is ON DELETE SET NULL, so the shoot itself
// survives an order being scrapped.
export async function deleteOrder(id) {
  const { error } = await supabase.from('orders').delete().eq('id', id)
  if (error) throw error
}

// Replace a Set's reservations with exactly `unitIds` (empty = release all).
//
// This is what makes "orders drive reservations" true LIVE in Supabase mode, not
// only at seed time: confirming an order writes these rows, moving it back to
// hold clears them. Deleting the old rows fires the 'released' event trigger and
// inserting fires 'reserved', so the audit log reads as a real release/re-take.
export async function setReservationsForSet(setId, unitIds, { from = null, to = null } = {}) {
  const wanted = [...new Set(unitIds || [])]
  // No-op guard. Every delete+insert here fires the set_units trigger, so a
  // re-save that changes nothing would otherwise spray a released+reserved pair
  // per unit into the activity log (and churn the DB for nothing).
  const { data: current } = await supabase.from('set_units').select('unit_id').eq('set_id', setId)
  const held = new Set((current || []).map((r) => r.unit_id))
  if (held.size === wanted.length && wanted.every((id) => held.has(id))) return wanted.length

  const { error: delErr } = await supabase.from('set_units').delete().eq('set_id', setId)
  if (delErr) throw delErr
  const rows = wanted.map((unit_id) => ({
    set_id: setId,
    unit_id,
    status: 'reserved',
    reserved_from: from,
    reserved_to: to,
  }))
  if (!rows.length) return 0
  const { error } = await supabase.from('set_units').insert(rows)
  if (error) throw error
  return rows.length
}

// Create the Set an order equips (5.1: "Order привязан к Set/Job"), then link it.
export async function createSetForOrder(orderId, { jobName, studioId, date }) {
  const { data, error } = await supabase
    .from('sets')
    .insert({
      title: jobName.trim(),
      studio_id: studioId,
      date,
      // Default working hours so the calendar chip has a time range (the order
      // editor doesn't collect times; the grid is studio×day, not hourly).
      start_time: '09:00',
      end_time: '18:00',
      status: 'active',
      order_id: orderId,
    })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// How many sets a studio already has on a date — the "max 5 sets per day" rule.
export async function countSetsOn(studioId, date) {
  const { count, error } = await supabase
    .from('sets')
    .select('*', { count: 'exact', head: true })
    .eq('studio_id', studioId)
    .eq('date', date)
    .eq('status', 'active')
  if (error) return 0
  return count ?? 0
}

// Name the vendor a sub-rented unit came from (4.5).
export async function setUnitVendor(unitId, companyId) {
  const { error } = await supabase
    .from('units')
    .update({ sub_rental_vendor_id: companyId || null })
    .eq('id', unitId)
  if (error) throw error
}

// A person plus their company (for the hyperlink) and their job history, which
// comes from roster_entries → sets.
export async function getPeople() {
  const jobs = `roster_entries ( role, set:sets ( id, title, date, studio_id, status ) )`
  const enriched = `id, full_name, email, phone, notes,
     category, subcategory, website, instagram, cv_url, cv_filename,
     company:companies ( id, name ), ${jobs}`
  const basic = `id, full_name, email, phone, notes, company:companies ( id, name ), ${jobs}`

  let { data, error } = await supabase.from('contacts').select(enriched).order('full_name')
  if (error) ({ data, error } = await supabase.from('contacts').select(basic).order('full_name'))
  if (error) return []

  return (data || []).map((p) => ({
    id: p.id,
    name: p.full_name,
    email: p.email,
    phone: p.phone,
    notes: p.notes,
    category: p.category ?? null,
    subcategory: p.subcategory ?? null,
    website: p.website ?? null,
    instagram: p.instagram ?? null,
    cvUrl: p.cv_url ?? null,
    cvFilename: p.cv_filename ?? null,
    companyId: p.company?.id ?? null,
    companyName: p.company?.name ?? null,
    jobs: (p.roster_entries || [])
      .filter((r) => r.set)
      .map((r) => ({
        id: r.set.id,
        title: r.set.title,
        date: r.set.date,
        studioId: r.set.studio_id,
        status: r.set.status,
        role: r.role,
      }))
      .sort((a, b) => (a.date < b.date ? 1 : -1)),
  }))
}

// contacts columns for a person payload (only the keys present are written).
function personColumns(p) {
  const row = {}
  if (p.name != null) row.full_name = p.name.trim()
  if (p.companyId !== undefined) row.company_id = p.companyId || null
  for (const [key, col] of [
    ['email', 'email'],
    ['phone', 'phone'],
    ['notes', 'notes'],
    ['category', 'category'],
    ['subcategory', 'subcategory'],
    ['website', 'website'],
    ['instagram', 'instagram'],
    ['cvUrl', 'cv_url'],
    ['cvFilename', 'cv_filename'],
  ]) {
    if (key in p) row[col] = (typeof p[key] === 'string' ? p[key].trim() : p[key]) || null
  }
  return row
}

export async function createPerson(person) {
  const { data, error } = await supabase
    .from('contacts')
    .insert(personColumns(person))
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updatePerson(id, changes) {
  const { error } = await supabase.from('contacts').update(personColumns(changes)).eq('id', id)
  if (error) throw error
}

// roster_entries references contacts with ON DELETE RESTRICT, so a person who
// worked a job can't be deleted — the caller checks job count first and explains
// why instead of letting the DB throw.
export async function deletePerson(id) {
  const { error } = await supabase.from('contacts').delete().eq('id', id)
  if (error) throw error
}

export async function createCompany({ name, companyType, kind = 'client', notes }) {
  const row = { name: name.trim(), kind, notes: notes?.trim() || null }
  if (companyType !== undefined) row.company_type = companyType || null
  const { data, error } = await supabase.from('companies').insert(row).select('id').single()
  if (error) throw error
  return data.id
}

// Upload a CV into the public `cvs` bucket and return its public URL.
export async function uploadCv(file, personName = 'cv') {
  const safe = `${personName}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
  const ext = file.name.includes('.') ? file.name.split('.').pop() : 'pdf'
  const path = `${safe || 'cv'}-${Math.floor(performance.now())}.${ext}`
  const { error } = await supabase.storage.from('cvs').upload(path, file, { upsert: true })
  if (error) throw error
  const { data } = supabase.storage.from('cvs').getPublicUrl(path)
  return { url: data.publicUrl, filename: file.name }
}

// Replace an order's equipment lines wholesale (5.3). Same approach as kit slots
// and scenario entries: the lines aren't referenced from anywhere else, so a full
// replace is simpler and safer than diffing.
export async function setOrderLines(orderId, lines) {
  const { error: delErr } = await supabase.from('order_lines').delete().eq('order_id', orderId)
  if (delErr) throw delErr
  const rows = (lines || [])
    .filter((l) => l.itemId)
    .map((l) => ({
      order_id: orderId,
      inventory_item_id: l.itemId,
      quantity: Math.max(1, Number(l.quantity) || 1),
      kit_id: l.kitId || null,
      unit_id: l.unitId || null,
      slot_label: l.slotLabel?.trim() || null,
      // 5.6 — in-house vs sub-rental, and the vendor it comes from. The DB check
      // forbids a vendor on an in-house line, so it is cleared explicitly.
      source: l.source === 'sub_rental' ? 'sub_rental' : 'in_house',
      vendor_company_id: l.source === 'sub_rental' ? l.vendorId || null : null,
      notes: l.notes?.trim() || null,
    }))
  if (!rows.length) return
  const { error } = await supabase.from('order_lines').insert(rows)
  if (error) throw error
}

// Packing checklist sign-offs (6.2 / 6.5). Upsert one slot of a line; the
// partial payload leaves the other two slots untouched on conflict.
export async function setPackingSignoff(orderId, lineKey, slot, initials, itemName) {
  const nowIso = new Date().toISOString()
  const row = {
    order_id: orderId,
    line_key: lineKey,
    item_name: itemName ?? null,
    updated_at: nowIso,
    [`${slot}_initials`]: initials,
    [`${slot}_at`]: nowIso,
  }
  const { error } = await supabase
    .from('packing_signoffs')
    .upsert(row, { onConflict: 'order_id,line_key' })
  if (error) throw error
}

export async function clearPackingSignoff(orderId, lineKey, slot) {
  const row = {
    order_id: orderId,
    line_key: lineKey,
    updated_at: new Date().toISOString(),
    [`${slot}_initials`]: null,
    [`${slot}_at`]: null,
  }
  const { error } = await supabase
    .from('packing_signoffs')
    .upsert(row, { onConflict: 'order_id,line_key' })
  if (error) throw error
}

// Add-on packing lists (6.4). Add-ons are their own labelled line lists on an
// order; the main order_lines are never touched.
export async function createAddon(orderId, label) {
  const { data, error } = await supabase
    .from('order_addons')
    .insert({ order_id: orderId, label: label?.trim() || null })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// Replace an add-on's lines (same delete-then-insert as setOrderLines).
export async function setAddonLines(addonId, lines) {
  const { error: delErr } = await supabase.from('addon_lines').delete().eq('addon_id', addonId)
  if (delErr) throw delErr
  const rows = (lines || [])
    .filter((l) => l.itemId)
    .map((l) => ({
      addon_id: addonId,
      inventory_item_id: l.itemId,
      quantity: Math.max(1, Number(l.quantity) || 1),
      kit_id: l.kitId || null,
      unit_id: l.unitId || null,
      slot_label: l.slotLabel?.trim() || null,
      source: l.source === 'sub_rental' ? 'sub_rental' : 'in_house',
      vendor_company_id: l.source === 'sub_rental' ? l.vendorId || null : null,
      notes: l.notes?.trim() || null,
    }))
  if (!rows.length) return
  const { error } = await supabase.from('addon_lines').insert(rows)
  if (error) throw error
}

export async function deleteAddon(addonId) {
  const { error } = await supabase.from('order_addons').delete().eq('id', addonId)
  if (error) throw error
}
