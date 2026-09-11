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
import { newestFirst } from '../lib/ordering'
import { studioLabel, studioColor } from './studios'
import { createUnits } from './inventory'
import { normalizeCallTimes, toHHMM } from '../lib/callTimes'

export const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE || 'local').toLowerCase()
export const usingSupabase = DATA_SOURCE === 'supabase' && isSupabaseConfigured

// A set_unit occupies its unit when the booking is active and not yet returned.
function occupies(su) {
  return su?.set?.status === 'active' && su.status !== 'returned'
}

// --- archive (nothing is deleted) -------------------------------------------
//
// The ten tables with their own identity carry `archived_at` / `archived_by`
// instead of being deleted, and RLS no longer grants the app DELETE on them
// (20260808120000). Reads DON'T filter on it: the app resolves display data by
// id from the hydrated store, so an order line, a roster row or a PDF must
// still find gear that has since been written off. Filtering happens in list
// views, pickers and availability.
const ARCHIVE_COLS = 'archived_at, archived_by'

// Requested with a fallback, like every other column added after launch: a
// database without this migration keeps loading, just with no archive.
const stripArchive = (sel) =>
  sel.replace(new RegExp(`\\s*${ARCHIVE_COLS},`), '').replace(new RegExp(`,\\s*${ARCHIVE_COLS}`), '')

const archiveFields = (row) => ({
  archivedAt: row?.archived_at ?? null,
  archivedBy: row?.archived_by ?? null,
})

// `sets.end_date` is NULL for a one-day shoot (20260909120000) and the reader
// falls back to `date`, so writing the same value into both columns would only
// be noise to disagree with later.
const endDateColumn = (b) => (!b.endDate || b.endDate === b.date ? null : b.endDate)

// Archive / restore one row. `table` is the caller's business, not the user's:
// every call site is a store action, so an unknown table can't come from input.
// Returns the stamp it wrote, which is what ties a cascade together (below).
export async function archiveRow(table, id, actorId = null, stamp = null) {
  const archived_at = stamp || new Date().toISOString()
  const { error } = await supabase
    .from(table)
    .update({ archived_at, archived_by: actorId })
    .eq('id', id)
  if (error) throw error
  return archived_at
}

export async function restoreRow(table, id) {
  const { error } = await supabase
    .from(table)
    .update({ archived_at: null, archived_by: null })
    .eq('id', id)
  if (error) throw error
}

// Archiving an item takes its physical copies with it. The units get the ITEM's
// timestamp, which is what makes the reverse exact: restoring brings back only
// the copies that went down with the item, leaving a unit that had already been
// written off on its own still archived.
export async function archiveUnitsOfItem(itemId, stamp, actorId = null) {
  const { error } = await supabase
    .from('units')
    .update({ archived_at: stamp, archived_by: actorId })
    .eq('inventory_item_id', itemId)
    .is('archived_at', null)
  if (error) throw error
}

export async function restoreUnitsOfItem(itemId, stamp) {
  if (!stamp) return
  const { error } = await supabase
    .from('units')
    .update({ archived_at: null, archived_by: null })
    .eq('inventory_item_id', itemId)
    .eq('archived_at', stamp)
  if (error) throw error
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
  const enriched = `id, name, category, notes, ${ARCHIVE_COLS},
     kit_slots ( id, label, position, slot_type, inventory_item_id,
                 fixed_unit:units!fixed_unit_id ( id, barcode ),
                 item:inventory_items ( name, category, kind ) )`
  const basic = `id, name, category, notes, ${ARCHIVE_COLS},
     kit_slots ( id, label, position, inventory_item_id,
                 item:inventory_items ( name, category, kind ) )`

  let { data, error } = await supabase.from('kits').select(enriched).order('name')
  if (error) {
    // 3.3 columns not present yet → fall back to the pre-3.3 shape.
    ;({ data, error } = await supabase.from('kits').select(basic).order('name'))
  }
  if (error) {
    // No archive columns (pre-20260808) → same shapes without them.
    ;({ data, error } = await supabase.from('kits').select(stripArchive(enriched)).order('name'))
    if (error)
      ({ data, error } = await supabase.from('kits').select(stripArchive(basic)).order('name'))
  }
  if (error) return [] // kit_slots table itself absent (pre-3.1)
  return (data || []).map((k) => ({
    id: k.id,
    name: k.name,
    category: k.category,
    notes: k.notes,
    ...archiveFields(k),
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
  const sel = `id, name, category, notes, ${ARCHIVE_COLS},
       scenario_list_entries (
         id, entry_type, quantity, position, note, inventory_item_id, kit_id,
         item:inventory_items ( name, category, kind ),
         kit:kits ( name, category )
       )`
  let { data, error } = await supabase.from('scenario_lists').select(sel).order('name')
  if (error)
    ({ data, error } = await supabase
      .from('scenario_lists')
      .select(stripArchive(sel))
      .order('name'))
  if (error) return []
  return (data || []).map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    notes: l.notes,
    ...archiveFields(l),
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
  // `placement` on units (the per-copy storage location) is its own layer, so a
  // database without that migration still loads inventory.
  // Archive columns on BOTH levels: an item can be archived, and so can a single
  // physical copy (a write-off).
  const withArchive = `id, name, category, kind, quantity, ${ARCHIVE_COLS},
     brand, asset_type, placement, subcategory, purchase_date, replacement_price, day_rate,
     units (
       id, barcode, serial, ownership, sub_rental_vendor_id, placement, ${ARCHIVE_COLS},
       set_units ( status, reserved_from, reserved_to,
                   set:sets ( id, title, date, studio_id, status ) )
     )`
  // ⚠️ `subcategory_id` is the OUTERMOST layer — SIXTH time this rule has
  // mattered. A column added last must be the first one dropped, or a database
  // without the migration fails every rich layer and degrades to the stub
  // shape, losing the units and reservations it does have.
  const withSubcategory = withArchive.replace(
    'id, name, category, kind, quantity,',
    'id, name, category, kind, quantity, subcategory_id,',
  )
  // The newest column, so the first one dropped (20260913120000).
  const withNotes = withSubcategory.replace(
    'id, name, category, kind, quantity,',
    'id, name, category, kind, quantity, notes,',
  )
  const withUnitPlacement = stripArchive(withArchive)
  const withVendor = withUnitPlacement.replace('sub_rental_vendor_id, placement,', 'sub_rental_vendor_id,')
  const withoutVendor = withVendor.replace(', sub_rental_vendor_id', '')
  const withoutRate = withoutVendor.replace(', day_rate', '')
  let { data, error } = await supabase.from('inventory_items').select(withNotes).order('name')
  if (error)
    ({ data, error } = await supabase
      .from('inventory_items')
      .select(withSubcategory)
      .order('name'))
  if (error)
    ({ data, error } = await supabase.from('inventory_items').select(withArchive).order('name'))
  if (error)
    ({ data, error } = await supabase
      .from('inventory_items')
      .select(withUnitPlacement)
      .order('name'))
  if (error)
    ({ data, error } = await supabase.from('inventory_items').select(withVendor).order('name'))
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
    // The only real link: an item belongs to a SUBCATEGORY, and its category is
    // derived by following that (lib/taxonomy). `category`/`subcategory` above
    // are the legacy TEXT the register was imported with — kept as the record of
    // where a piece came from, and shown as a hint while it is being assigned.
    subcategoryId: item.subcategory_id ?? null,
    notes: item.notes ?? null,
    purchaseDate: item.purchase_date,
    // ⚠️ The COLUMN is `replacement_price` and the label is "Purchase price".
    // It was added as an insurance value (20260724160000) and the studio uses it
    // for what a piece cost, which is why it now sits beside Purchase date.
    // Renaming the column would rewrite stored data for no visible benefit —
    // the same call as the `orders` table meaning Job.
    replacementPrice: item.replacement_price,
    dayRate: item.day_rate != null ? Number(item.day_rate) : null,
    ...archiveFields(item),
    usage: usageByItem[item.id] || [],
    units: (item.units || []).map((u) => {
      const repairs = repairsByUnit[u.id] || []
      const openRepair = repairs.find((r) => !r.returnedAt)
      // Every commitment this copy carries, WITH its dates. Availability is a
      // question about a date range, not a single flag: one camera can be on
      // today's shoot and still be free tomorrow (see lib/availability
      // `isUnitFree` + `overlaps`).
      const reservations = (u.set_units || []).filter(occupies).map((su) => ({
        setId: su.set?.id ?? null,
        setTitle: su.set?.title ?? null,
        studioId: su.set?.studio_id ?? null,
        // The order's working window; a set with no window falls back to its own
        // shoot date, so a legacy row still blocks the right day.
        from: su.reserved_from ?? su.set?.date ?? null,
        to: su.reserved_to ?? su.reserved_from ?? su.set?.date ?? null,
      }))
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
        location, // derived: the job it's committed to (or a repair)
        reservations, // derived: WHEN it's committed, so other days stay free
        placement: u.placement ?? null, // stored: where it LIVES when it's in
        ...archiveFields(u), // written off, but still here for the history
        repairs,
      }
    }),
  }))
}

// Bookings (sets) mapped to the app's booking shape. photographer/model come
// from the roster (requires auth to read — under anon they resolve to '').
export async function getBookings() {
  const sel = (extra) =>
    `id, title, studio_id, date, start_time, end_time, status, color, notes, order_id,
       ${ARCHIVE_COLS}, created_by, creator:profiles!created_by ( full_name ),
       set_units ( unit_id ),
       roster_entries ( role, contact:contacts ( full_name ) )${extra}`
  // Newest first, so a database missing a migration drops only what that
  // migration added. Fifth time this rule has mattered (see getOrders'
  // withBrandType): put a new column anywhere but the top and a pre-migration
  // DB loses the roster and the reservations along with it.
  const CALLS = ', wrap_time, set_call_times ( id, roles, call_time, note, position )'
  const layers = [
    sel(`, end_date${CALLS}`), // 20260910120000 — call times + wrap
    sel(', end_date'), //         20260909120000 — multi-day shoots
    sel(''), //                   before either
    stripArchive(sel('')), //     before the archive columns
  ]
  let data, error
  for (const layer of layers) {
    ;({ data, error } = await supabase.from('sets').select(layer).order('date'))
    if (!error) break
  }
  if (error) throw error

  return data.map((s) => {
    const roster = s.roster_entries || []
    const byRole = (role) => roster.find((r) => r.role === role)?.contact?.full_name || ''
    return {
      id: s.id,
      title: s.title,
      studioId: s.studio_id,
      date: s.date,
      // A one-day shoot stores no end (null), so it reads back as its own date —
      // every consumer can then treat a set as a window without a special case.
      endDate: s.end_date || s.date,
      // When each role is called on, and when the shoot wraps. Absent on a
      // pre-migration database, and legitimately empty on a shoot nobody has
      // scheduled yet — both read as "not set", never as a made-up 09:00.
      callTimes: normalizeCallTimes(
        (s.set_call_times || []).map((c) => ({
          id: c.id,
          roles: c.roles || [],
          time: c.call_time,
          note: c.note,
          position: c.position,
        })),
      ),
      wrapTime: toHHMM(s.wrap_time) || null,
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
      ...archiveFields(s),
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

// A shoot's call times are its CONTENTS: replaced wholesale on save, like an
// order's lines. Silently tolerated on a database without 20260910120000 —
// losing a call time is a missing field, while a rejected save is a crew that
// cannot write the shoot down at all.
export async function setCallTimes(setId, rows) {
  const clean = normalizeCallTimes(rows)
  const del = await supabase.from('set_call_times').delete().eq('set_id', setId)
  if (del.error) {
    if (isMissingTable(del.error)) return { stored: false }
    throw del.error
  }
  if (!clean.length) return { stored: true }
  const { error } = await supabase.from('set_call_times').insert(
    clean.map((c) => ({
      set_id: setId,
      roles: c.roles,
      call_time: c.time,
      note: c.note,
      position: c.position,
    })),
  )
  if (error) {
    if (isMissingTable(error)) return { stored: false }
    throw error
  }
  return { stored: true }
}

export async function createBooking(b) {
  // A shoot is a range of whole days now, so no times are written — the columns
  // stay for the rows that already carry them (nothing in this app deletes
  // data), but nothing collects or reads them any more.
  const row = {
    title: b.title, studio_id: b.studioId, date: b.date, end_date: endDateColumn(b),
    wrap_time: b.wrapTime || null,
    color: b.color || studioColor(b.studioId), notes: b.notes, status: 'active',
  }
  let { data: set, error } = await supabase.from('sets').insert(row).select('id').single()
  if (error && isUndefinedColumn(error)) {
    // Drop the newest columns and retry, newest first.
    const { wrap_time, ...noWrap } = row
    ;({ data: set, error } = await supabase.from('sets').insert(noWrap).select('id').single())
    if (error && isUndefinedColumn(error)) {
      const { end_date, ...oneDay } = noWrap
      ;({ data: set, error } = await supabase.from('sets').insert(oneDay).select('id').single())
    }
  }
  if (error) throw error
  await replaceUnits(set.id, b.unitIds)
  await replaceRoster(set.id, b.photographer, b.model)
  if (b.callTimes) await setCallTimes(set.id, b.callTimes)
  return set.id
}

export async function updateBooking(setId, changes) {
  const patch = {}
  if ('title' in changes) patch.title = changes.title
  if ('studioId' in changes) patch.studio_id = changes.studioId
  if ('date' in changes) patch.date = changes.date
  if ('endDate' in changes) patch.end_date = endDateColumn(changes)
  if ('wrapTime' in changes) patch.wrap_time = changes.wrapTime || null
  if ('notes' in changes) patch.notes = changes.notes
  if ('color' in changes) patch.color = changes.color
  if (Object.keys(patch).length) {
    let { error } = await supabase.from('sets').update(patch).eq('id', setId)
    // Drop the newest column and retry, newest first, so a pre-migration
    // database still saves everything it does have room for.
    if (error && isUndefinedColumn(error)) {
      const { wrap_time, ...noWrap } = patch
      error = null
      if (Object.keys(noWrap).length)
        ({ error } = await supabase.from('sets').update(noWrap).eq('id', setId))
      if (error && isUndefinedColumn(error)) {
        const { end_date, ...oneDay } = noWrap
        error = null
        if (Object.keys(oneDay).length)
          ({ error } = await supabase.from('sets').update(oneDay).eq('id', setId))
      }
    }
    if (error) throw error
  }
  if ('callTimes' in changes) await setCallTimes(setId, changes.callTimes)
  if ('unitIds' in changes) await replaceUnits(setId, changes.unitIds)
  if ('photographer' in changes || 'model' in changes) {
    await replaceRoster(setId, changes.photographer, changes.model)
  }
}

// Archiving a shoot takes it off the calendar and releases its gear. The
// reservations themselves ARE deleted — they are derived state, not a record,
// and the set_units trigger logs the release into `events`.
export async function archiveBooking(setId, actorId = null) {
  await setReservationsForSet(setId, [])
  return archiveRow('sets', setId, actorId)
}

export async function restoreBooking(setId) {
  // Deliberately does NOT re-reserve: the gear may be on another job by now.
  return restoreRow('sets', setId)
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
    placement: u.placement || null,
  }))
  if (!rows.length) return
  let { error } = await supabase.from('units').insert(rows)
  if (error) {
    // Pre-placement database: retry without the column rather than fail the add.
    ;({ error } = await supabase
      .from('units')
      .insert(rows.map(({ placement: _p, ...rest }) => rest)))
  }
  if (error) throw error
}

// Correct one unit's identifiers.
export async function updateUnit(unitId, { barcode, serial, placement } = {}) {
  const patch = {}
  if (barcode != null) patch.barcode = barcode
  if (serial != null) patch.serial = serial
  // Explicit '' clears it (back to inheriting the item's placement).
  if (placement !== undefined) patch.placement = placement || null
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
// Writing off a unit archives it. Its `set_units` rows stay: they are the
// history of the jobs it went out on, and the store refuses the write-off while
// the unit is actually out or in repair, so nothing live is left dangling.
export async function archiveUnit(unitId, actorId = null) {
  return archiveRow('units', unitId, actorId)
}

export async function restoreUnit(unitId) {
  return restoreRow('units', unitId)
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
  const cols = {
    brand: clean(f.brand),
    asset_type: clean(f.assetType),
    placement: clean(f.placement),
    subcategory: clean(f.subcategory),
    purchase_date: clean(f.purchaseDate),
    replacement_price: clean(f.replacementPrice),
  }
  // Only when the caller actually said something about it: `undefined` means
  // "leave the assignment alone", `null` means "unassign".
  if ('subcategoryId' in f) cols.subcategory_id = clean(f.subcategoryId)
  if ('notes' in f) cols.notes = clean(f.notes)
  return cols
}

// A write that carries a column a pre-migration database hasn't got: retry
// without it rather than failing the user's action, and report that it went
// missing so the loss is never silent (the `order_lines.day_rate` lesson).
const MISSING_COLUMN = '42703'
const ITEM_COLUMNS_ADDED_AFTER_LAUNCH = ['notes', 'subcategory_id']
async function writeItemRow(run, patch) {
  const { error } = await run(patch)
  if (!error) return { ok: true }
  if (error.code !== MISSING_COLUMN) throw error
  // Drop the columns a pre-migration database hasn't got and retry, newest
  // first — one of them is why the write was refused, and which one is not
  // worth parsing out of the message.
  const rest = { ...patch }
  const dropped = []
  for (const col of ITEM_COLUMNS_ADDED_AFTER_LAUNCH) {
    if (!(col in rest)) continue
    delete rest[col]
    dropped.push(col)
  }
  if (!dropped.length) throw error
  const retry = await run(rest)
  if (retry.error) throw retry.error
  return { ok: true, droppedColumns: dropped }
}

export async function addInventoryItem({
  name,
  category,
  quantity,
  kind = 'barcoded',
  // Fully resolved copies, when the caller typed any of their barcodes.
  units,
  ...fields
}) {
  const attrs = itemFieldColumns(fields)

  // Non-barcoded items store a quantity and have no unit rows.
  // A pre-migration database has no `subcategory_id`; insert without it rather
  // than refusing to register the gear at all.
  const insertItem = async (body) => {
    let res = await supabase.from('inventory_items').insert(body).select('id').single()
    if (res.error?.code === MISSING_COLUMN) {
      const rest = { ...body }
      for (const col of ITEM_COLUMNS_ADDED_AFTER_LAUNCH) delete rest[col]
      res = await supabase.from('inventory_items').insert(rest).select('id').single()
    }
    if (res.error) throw res.error
    return res.data
  }

  if (kind !== 'barcoded') {
    const item = await insertItem({ name: name.trim(), category, kind, quantity, ...attrs })
    return item.id
  }

  // Barcoded: register its physical copies in the same breath.
  const item = await insertItem({ name: name.trim(), category, kind: 'barcoded', ...attrs })
  // The CALLER resolves the barcodes when it has them — the store holds the
  // register and already owns that rule for `addUnits` (lib/unitRows), so doing
  // it twice is how the two would come to disagree. Without them, fall back to
  // generating `quantity` from the highest barcode the DB holds.
  let toInsert = units
  if (!toInsert?.length) {
    const { data: rows } = await supabase.from('units').select('barcode')
    let maxB = 0
    for (const r of rows || []) {
      const n = parseInt(r.barcode, 10)
      if (Number.isFinite(n) && n > maxB) maxB = n
    }
    toInsert = createUnits(item.id, quantity, maxB + 1)
  }
  const { error: uErr } = await supabase.from('units').insert(
    toInsert.map((u) => ({
      inventory_item_id: item.id,
      barcode: u.barcode,
      serial: u.serial,
      ownership: u.ownership || 'owned',
      placement: u.placement || null,
    })),
  )
  if (uErr) {
    // Pre-placement database: retry without the column rather than lose the
    // copies (the same fallback `addUnits` has).
    const { error: retry } = await supabase.from('units').insert(
      toInsert.map((u) => ({
        inventory_item_id: item.id,
        barcode: u.barcode,
        serial: u.serial,
        ownership: u.ownership || 'owned',
      })),
    )
    if (retry) throw retry
  }
  return item.id
}

// Update an item's fields. kind is immutable; quantity only applies to
// non-barcoded items.
export async function updateInventoryItem(itemId, { name, category, kind, quantity, ...fields }) {
  const patch = itemFieldColumns(fields)
  if (name != null) patch.name = name.trim()
  if (category != null) patch.category = category
  // Barcoded items count their unit rows, so their `quantity` column stays 0.
  // `kind` is optional: the stock actions know what they're updating and pass
  // only the quantity — requiring kind here made those writes silent no-ops.
  if (quantity != null && kind !== 'barcoded') patch.quantity = quantity
  if (!Object.keys(patch).length) return
  return writeItemRow(
    (body) => supabase.from('inventory_items').update(body).eq('id', itemId),
    patch,
  )
}

// ---------------------------------------------------------------------------
// The inventory taxonomy (20260911120000). Categories hold subcategories; an
// item points at a subcategory and NEVER at a category.
//
// Read in ONE go with the items, and try/caught like every other table added
// after launch: a database without the migration answers with an empty taxonomy
// and the register still loads — the items simply have nothing to be assigned
// to yet.
export async function getInventoryTaxonomy() {
  const empty = { categories: [], subcategories: [] }
  try {
    const [cats, subs] = await Promise.all([
      supabase
        .from('inventory_categories')
        .select(`id, name, position, created_at, created_by, ${ARCHIVE_COLS}`)
        .order('position')
        .order('name'),
      supabase
        .from('inventory_subcategories')
        .select(`id, category_id, name, position, created_at, created_by, ${ARCHIVE_COLS}`)
        .order('position')
        .order('name'),
    ])
    if (cats.error || subs.error) return empty
    return {
      categories: (cats.data || []).map((c) => ({
        id: c.id,
        name: c.name,
        position: c.position ?? 0,
        createdAt: c.created_at ?? null,
        createdBy: c.created_by ?? null,
        ...archiveFields(c),
      })),
      subcategories: (subs.data || []).map((r) => ({
        id: r.id,
        categoryId: r.category_id,
        name: r.name,
        position: r.position ?? 0,
        createdAt: r.created_at ?? null,
        createdBy: r.created_by ?? null,
        ...archiveFields(r),
      })),
    }
  } catch {
    return empty
  }
}

export async function createInventoryCategory({ name, position = 0 }) {
  const { data, error } = await supabase
    .from('inventory_categories')
    .insert({ name: String(name).trim(), position })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

export async function updateInventoryCategory(id, { name, position }) {
  const patch = {}
  if (name != null) patch.name = String(name).trim()
  if (position != null) patch.position = position
  if (!Object.keys(patch).length) return
  const { error } = await supabase.from('inventory_categories').update(patch).eq('id', id)
  if (error) throw error
}

export async function createInventorySubcategory({ categoryId, name, position = 0 }) {
  const { data, error } = await supabase
    .from('inventory_subcategories')
    .insert({ category_id: categoryId, name: String(name).trim(), position })
    .select('id')
    .single()
  if (error) throw error
  return data.id
}

// Moving a subcategory to another category is allowed on purpose: a piece of
// gear filed under the wrong heading is exactly what "edit" is for. It changes
// the derived category of every item in it, which is the point.
export async function updateInventorySubcategory(id, { name, categoryId, position }) {
  const patch = {}
  if (name != null) patch.name = String(name).trim()
  if (categoryId != null) patch.category_id = categoryId
  if (position != null) patch.position = position
  if (!Object.keys(patch).length) return
  const { error } = await supabase.from('inventory_subcategories').update(patch).eq('id', id)
  if (error) throw error
}

// Removing either level ARCHIVES it — the app holds no DELETE (20260808120000),
// and the caller checks the usage rules first (lib/taxonomy).
export const archiveInventoryCategory = (id, actorId = null) =>
  archiveRow('inventory_categories', id, actorId)
export const restoreInventoryCategory = (id) => restoreRow('inventory_categories', id)
export const archiveInventorySubcategory = (id, actorId = null) =>
  archiveRow('inventory_subcategories', id, actorId)
export const restoreInventorySubcategory = (id) => restoreRow('inventory_subcategories', id)

// Assign many items at once — the answer to a register where 51 pieces arrived
// with no subcategory. One statement, so it cannot half-apply.
export async function setItemsSubcategory(itemIds, subcategoryId) {
  const ids = [...new Set((itemIds || []).filter(Boolean))]
  if (!ids.length) return { ok: true, count: 0 }
  const { error } = await supabase
    .from('inventory_items')
    .update({ subcategory_id: subcategoryId || null })
    .in('id', ids)
  if (error) throw error
  return { ok: true, count: ids.length }
}

// Delete an item (write-off). Frees any reservations on its units first, then
// deletes the item (units cascade). Event-log history is preserved — events hold
// only soft references (see deleteUnit).
// Archiving an item retires the type and every copy of it. No FK games are
// needed any more: order lines, kit slots and usage rows keep pointing at it,
// which is exactly why a past order still shows what it had on it.
export async function archiveInventoryItem(itemId, actorId = null) {
  const stamp = await archiveRow('inventory_items', itemId, actorId)
  await archiveUnitsOfItem(itemId, stamp, actorId)
  return stamp
}

export async function restoreInventoryItem(itemId, stamp) {
  await restoreRow('inventory_items', itemId)
  await restoreUnitsOfItem(itemId, stamp)
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
// The kit's slots stay, so a scenario list line pointing at it still reads.
export async function archiveKit(kitId, actorId = null) {
  return archiveRow('kits', kitId, actorId)
}

export async function restoreKit(kitId) {
  return restoreRow('kits', kitId)
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

export async function archiveScenarioList(listId, actorId = null) {
  return archiveRow('scenario_lists', listId, actorId)
}

export async function restoreScenarioList(listId) {
  return restoreRow('scenario_lists', listId)
}

// ---------------------------------------------------------------------------
// People & companies (4.1 + 4.2). `contacts` predates this module as the roster
// lookup, so both reads degrade to the pre-4.1 column set when the migration
// hasn't run — the app keeps working, just without categories/profiles.
// ---------------------------------------------------------------------------

export async function getCompanies() {
  // Layered like getKits: full 4.3 shape, then 4.2, then the original columns.
  const withArchive = `id, name, kind, notes, company_type, address, opening_hours, website, email, phone, ${ARCHIVE_COLS}`
  const full = stripArchive(withArchive)
  const mid = 'id, name, kind, notes, company_type'
  const basic = 'id, name, kind, notes'
  let { data, error } = await supabase.from('companies').select(withArchive).order('name')
  if (error) ({ data, error } = await supabase.from('companies').select(full).order('name'))
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
    ...archiveFields(c),
  }))
}

// The user-editable Type option list (4.4). Missing table → the app falls back to
// the types already in use, so the dropdown is never empty.
export async function getCompanyTypes() {
  let { data, error } = await supabase
    .from('company_types')
    .select(`id, name, position, ${ARCHIVE_COLS}`)
    .order('position')
  if (error)
    ({ data, error } = await supabase
      .from('company_types')
      .select('id, name, position')
      .order('position'))
  if (error) return []
  return (data || []).map((t) => ({
    id: t.id,
    name: t.name,
    position: t.position,
    ...archiveFields(t),
  }))
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
// Archiving a Type only takes the option out of the dropdown: companies store
// their type as text, so existing labels keep reading (marked "(removed)").
export async function archiveCompanyType(id, actorId = null) {
  return archiveRow('company_types', id, actorId)
}

export async function restoreCompanyType(id) {
  return restoreRow('company_types', id)
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

// Archiving a company keeps its links: its people and orders used to be silently
// detached by `ON DELETE SET NULL`, which destroyed history as a side effect of
// removing one row. Now nothing moves — the company just stops being offered.
export async function archiveCompany(id, actorId = null) {
  return archiveRow('companies', id, actorId)
}

export async function restoreCompany(id) {
  return restoreRow('companies', id)
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


// Map a DB order line row to the app's line shape.
function mapLineRow(l) {
  return {
    id: l.id ?? null,
    itemId: l.item?.id ?? null,
    itemName: l.item?.name ?? null,
    quantity: l.quantity,
    // The LINE's own rate wins; the item's is the default. A sub-rental line is
    // priced by the vendor, so it must be able to differ from our rate.
    dayRate:
      l.day_rate != null
        ? Number(l.day_rate)
        : l.item?.day_rate != null
          ? Number(l.item.day_rate)
          : null,
    itemDayRate: l.item?.day_rate != null ? Number(l.item.day_rate) : null,
    rateOverridden: l.day_rate != null,
    kitId: l.kit_id ?? null,
    unitId: l.unit?.id ?? l.unit_id ?? null,
    barcode: l.unit?.barcode ?? null,
    slotLabel: l.slot_label ?? null,
    source: l.source ?? 'in_house',
    vendorId: l.vendor?.id ?? l.vendor_company_id ?? null,
    vendorName: l.vendor?.name ?? null,
  }
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
  // Archived orders are still fetched — the list hides them, but a link, a PDF
  // or the archive screen must find them. Its own layer, like eq_updated_*.
  const withArchive = `${full}, ${ARCHIVE_COLS}`
  // The hand-typed set designation gets its own layer too, so a database that
  // hasn't run 20260809120000 keeps everything else instead of falling all the
  // way back to the stub shape.
  const withSetLabel = `${withArchive}, set_label`
  // The per-line rate override (20260811120000) is the OUTERMOST layer for the
  // same reason: it lives inside the order_lines embed, so a database without the
  // column would otherwise fail every shape that carries equipment at all and
  // degrade to the stub — losing kits, units and vendors, not just the price.
  const withLineRate = withSetLabel.replace(
    'order_lines ( id, quantity,',
    'order_lines ( id, quantity, day_rate,',
  )
  // Brand + shoot type (20260908120000) go OUTSIDE everything, same rule as the
  // two layers above: a column added last must be the first thing dropped, or a
  // database that hasn't run this migration loses equipment it does have.
  const withBrandType = `${withLineRate}, brand, job_type`
  // ⚠️ OUTERMOST layer, as every column added after launch has to be: put it
  // anywhere else and a database without 20260913120000 fails the rich layers
  // and degrades to the stub shape, losing the equipment it does have.
  const withNotes = `${withBrandType}, notes`
  const withKind = `id, order_number, status, ordered_at, kind, company_id,
     company:companies ( id, name ),
     order_lines ( quantity, item:inventory_items ( id, name ) ),
     sets ( id, title, date )`
  const withoutKind = withKind.replace('kind, ', '')

  let { data, error } = await supabase.from('orders').select(withNotes).order('ordered_at')
  if (error)
    ({ data, error } = await supabase.from('orders').select(withBrandType).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(withLineRate).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(withSetLabel).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(withArchive).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(full).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(fullNoEq).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(withKind).order('ordered_at'))
  if (error) ({ data, error } = await supabase.from('orders').select(withoutKind).order('ordered_at'))
  if (error) return []

  // The packing sign-offs ride along in their own try/caught query, so orders
  // still load on a database where that migration hasn't run. (The scan log
  // used to be fetched beside it; the scanning station is gone.)
  const packing = await getPackingSignoffs()

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
    setLabel: o.set_label ?? null,
    // 20260908120000 — null on a database that hasn't run it, which the UI
    // renders as "—" rather than inventing a brand or a shoot type.
    brand: o.brand ?? null,
    jobType: o.job_type ?? null,
    notes: o.notes ?? null,
    photographerId: o.photographer?.id ?? null,
    photographer: o.photographer?.full_name ?? null,
    createdBy: o.creator?.full_name ?? null,
    createdAt: o.created_at ?? null,
    // Who last touched this order's equipment (null on a pre-activity-log DB).
    eqUpdatedBy: o.eq_editor?.full_name ?? null,
    eqUpdatedAt: o.eq_updated_at ?? null,
    packing: packing[o.id] || {},
    lines: (o.order_lines || []).map(mapLineRow),
    ...archiveFields(o),
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
  if (o.setLabel !== undefined) row.set_label = o.setLabel?.trim() || null
  if (o.brand !== undefined) row.brand = o.brand?.trim() || null
  if (o.jobType !== undefined) row.job_type = o.jobType?.trim() || null
  if (o.status !== undefined) row.status = o.status
  if (o.kind !== undefined) row.kind = o.kind
  if (o.companyId !== undefined) row.company_id = o.companyId || null
  if (o.number !== undefined) row.order_number = o.number?.trim() || null
  // The order date follows the first working day so history lines up.
  if (o.startsOn !== undefined) row.ordered_at = o.startsOn || null
  // Empty means "no note", not an empty string sitting in the column.
  if (o.notes !== undefined) row.notes = o.notes?.trim() || null
  return row
}

// A database that hasn't run 20260908120000 must still be able to SAVE a job —
// losing the brand and the shoot type is a missing field, while a rejected
// insert is a crew that cannot write the job down at all. So the newest two
// columns are dropped and the write retried, like the reads' outermost layer.
const withoutNewestColumns = (row) => {
  const { brand, job_type, notes, ...rest } = row
  return rest
}
const isUndefinedColumn = (e) => e?.code === '42703' || /column .* does not exist/i.test(e?.message || '')
// A table the migration for it hasn't created yet. Every feature added after
// launch degrades to "not available" rather than failing the user's action.
const isMissingTable = (e) =>
  e?.code === '42P01' ||
  e?.code === 'PGRST205' ||
  /relation .* does not exist|could not find the table/i.test(e?.message || '')

export async function createOrder(order) {
  const row = orderColumns(order)
  let { data, error } = await supabase.from('orders').insert(row).select('id').single()
  if (error && isUndefinedColumn(error))
    ({ data, error } = await supabase
      .from('orders')
      .insert(withoutNewestColumns(row))
      .select('id')
      .single())
  if (error) throw error
  return data.id
}

export async function updateOrder(id, changes) {
  const row = orderColumns(changes)
  let { error } = await supabase.from('orders').update(row).eq('id', id)
  if (error && isUndefinedColumn(error))
    ({ error } = await supabase.from('orders').update(withoutNewestColumns(row)).eq('id', id))
  if (error) throw error
}

// order_lines cascade; sets.order_id is ON DELETE SET NULL, so the shoot itself
// survives an order being scrapped.
// Archiving an order releases its gear and takes its shoot off the calendar —
// the shoot only exists because this order equips it. Its lines, add-ons and
// packing sign-offs all stay, so restoring brings the whole document back.
export async function archiveOrder(id, setId = null, actorId = null) {
  const stamp = await archiveRow('orders', id, actorId)
  if (setId) {
    await setReservationsForSet(setId, [])
    await archiveRow('sets', setId, actorId, stamp)
  }
  return stamp
}

// Restores the shoot only if it went down WITH this order (same stamp), so a
// shoot archived separately beforehand stays archived.
export async function restoreOrder(id, setId = null, stamp = null) {
  await restoreRow('orders', id)
  if (!setId) return
  if (!stamp) return restoreRow('sets', setId)
  const { data } = await supabase.from('sets').select('archived_at').eq('id', setId).maybeSingle()
  if (data?.archived_at === stamp) await restoreRow('sets', setId)
}

// Replace a Set's reservations with exactly `unitIds` (empty = release all).
//
// This is what makes "orders drive reservations" true LIVE in Supabase mode, not
// only at seed time: confirming an order writes these rows, moving it back to
// hold clears them. Deleting the old rows fires the 'released' event trigger and
// inserting fires 'reserved', so the audit log reads as a real release/re-take.
// Closing a set: the gear came back. The rows are MARKED returned rather than
// deleted — they are the unit's job history (getUnitHistory reads them), and
// `occupies` already treats 'returned' as free, so the stock is released.
export async function markSetReturned(setId) {
  const { error } = await supabase
    .from('set_units')
    .update({ status: 'returned' })
    .eq('set_id', setId)
    .neq('status', 'returned')
  if (error) throw error
}

export async function setReservationsForSet(setId, unitIds, { from = null, to = null } = {}) {
  const wanted = [...new Set(unitIds || [])]
  // No-op guard. Every delete+insert here fires the set_units trigger, so a
  // re-save that changes nothing would otherwise spray a released+reserved pair
  // per unit into the activity log (and churn the DB for nothing).
  //
  // A RETURNED row is not a holding, so it can never satisfy the guard: after
  // closing an order and re-opening it the unit ids are identical, and skipping
  // the write would leave the gear marked back-on-the-shelf while the order says
  // it's confirmed.
  //
  // The WINDOW is part of the comparison for the same reason. Gear is held per
  // day, so moving a confirmed order's set date changes nothing about WHICH
  // units it holds — only WHEN. Comparing ids alone made that edit a no-op: the
  // rows kept their old dates, so the stock stayed blocked on a day with no
  // shoot and read as free on the day of the actual one.
  const { data: current } = await supabase
    .from('set_units')
    .select('unit_id, status, reserved_from, reserved_to')
    .eq('set_id', setId)
  const rowsNow = current || []
  const held = new Set(rowsNow.map((r) => r.unit_id))
  const allHolding = rowsNow.every((r) => r.status !== 'returned')
  const day = (v) => (typeof v === 'string' ? v.slice(0, 10) : null)
  const sameWindow = rowsNow.every(
    (r) => day(r.reserved_from) === day(from) && day(r.reserved_to) === day(to),
  )
  if (
    allHolding &&
    sameWindow &&
    held.size === wanted.length &&
    wanted.every((id) => held.has(id))
  )
    return wanted.length

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
// The shoot spans the order's whole working window; no times are written — the
// grid is studio × day, and the range is what the crew now types.
export async function createSetForOrder(
  orderId,
  { jobName, studioId, date, endDate, wrapTime = null, callTimes = null },
) {
  const row = {
    title: jobName.trim(),
    studio_id: studioId,
    date,
    end_date: endDateColumn({ date, endDate }),
    wrap_time: wrapTime || null,
    status: 'active',
    order_id: orderId,
  }
  let { data, error } = await supabase.from('sets').insert(row).select('id').single()
  if (error && isUndefinedColumn(error)) {
    const { wrap_time, ...noWrap } = row
    ;({ data, error } = await supabase.from('sets').insert(noWrap).select('id').single())
    if (error && isUndefinedColumn(error)) {
      const { end_date, ...oneDay } = noWrap
      ;({ data, error } = await supabase.from('sets').insert(oneDay).select('id').single())
    }
  }
  if (error) throw error
  if (callTimes?.length) await setCallTimes(data.id, callTimes)
  return data.id
}

// Mirror an order onto the Set it equips. Local mode always did this in memory;
// Supabase mode did NOT, so editing a job's date moved its reservations and left
// the shoot on the old day of the calendar. A multi-day window makes that
// mismatch visible immediately, so the two modes are the same shape now.
// Roster (photographer) is deliberately left alone — that needs a contact id,
// which is the order form's photographerId, and is a separate write.
export async function syncSetForOrder(
  setId,
  { jobName, studioId, date, endDate, wrapTime, callTimes },
) {
  return updateBooking(setId, {
    ...(jobName != null ? { title: jobName.trim() } : {}),
    ...(studioId ? { studioId } : {}),
    ...(date ? { date, endDate: endDate || date } : {}),
    // undefined = the form didn't carry them; null / [] = the crew cleared them.
    ...(wrapTime !== undefined ? { wrapTime } : {}),
    ...(callTimes !== undefined ? { callTimes } : {}),
  })
}

// The active, unarchived sets a studio has anywhere in [from, to] — the input to
// the "max 5 sets per studio per day" rule. It reads a RANGE because a set can
// now span days: asking `date = x` would let a three-day job slip past a day it
// actually sits on. Archived shoots are excluded; they used to count against
// capacity, which quietly shrank a studio's day.
export async function activeSetsInRange(studioId, from, to) {
  const last = to || from
  // Starts on or before our last day — the other half of the overlap test
  // (ends on or after our first day) is applied below, because it has to treat a
  // null end_date as "ends on `date`" and that is easier to read in JS than in
  // a nested PostgREST `or`.
  const q = (sel) =>
    supabase
      .from('sets')
      .select(sel)
      .eq('studio_id', studioId)
      .eq('status', 'active')
      .lte('date', last)
  // Layered newest-column-first, like every read here: no end_date → every set
  // is one day; no archive columns → nothing is archived on that database.
  let { data, error } = await q('id, date, end_date').is('archived_at', null)
  if (error) ({ data, error } = await q('id, date').is('archived_at', null))
  if (error) ({ data, error } = await q('id, date'))
  if (error) return []
  return (data || [])
    .map((s) => ({ id: s.id, from: s.date, to: s.end_date || s.date }))
    .filter((s) => s.to >= from)
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
  const withArchive = `id, full_name, email, phone, notes,
     category, subcategory, website, instagram, cv_url, cv_filename, ${ARCHIVE_COLS},
     company:companies ( id, name ), ${jobs}`
  const enriched = stripArchive(withArchive)
  const basic = `id, full_name, email, phone, notes, company:companies ( id, name ), ${jobs}`

  let { data, error } = await supabase.from('contacts').select(withArchive).order('full_name')
  if (error) ({ data, error } = await supabase.from('contacts').select(enriched).order('full_name'))
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
      .sort(newestFirst('date', 'setId')),
    ...archiveFields(p),
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
// `roster_entries.contact_id` is ON DELETE RESTRICT, which meant a person who
// had worked a single job could never be removed. Archiving retires them and
// keeps every job they were on.
export async function archivePerson(id, actorId = null) {
  return archiveRow('contacts', id, actorId)
}

export async function restorePerson(id) {
  return restoreRow('contacts', id)
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
      // Null = quote at the item's own day rate. Only a typed value is stored, so
      // an untouched line keeps following the item.
      day_rate: l.rateOverridden && l.dayRate != null ? Number(l.dayRate) : null,
      kit_id: l.kitId || null,
      unit_id: l.unitId || null,
      slot_label: l.slotLabel?.trim() || null,
      // 5.6 — in-house vs sub-rental, and the vendor it comes from. The DB check
      // forbids a vendor on an in-house line, so it is cleared explicitly.
      source: l.source === 'sub_rental' ? 'sub_rental' : 'in_house',
      vendor_company_id: l.source === 'sub_rental' ? l.vendorId || null : null,
      notes: l.notes?.trim() || null,
    }))
  if (!rows.length) return {}
  let { error } = await supabase.from('order_lines').insert(rows)
  if (error && /day_rate/.test(error.message || '')) {
    // This database hasn't run 20260811120000. Write everything else rather than
    // losing the whole list — and REPORT it, because a price that silently
    // vanishes is worse than one that was refused out loud.
    const stripped = rows.map(({ day_rate: _drop, ...rest }) => rest)
    ;({ error } = await supabase.from('order_lines').insert(stripped))
    if (error) throw error
    const dropped = rows.filter((r) => r.day_rate != null).length
    return dropped ? { rateNotStored: dropped } : {}
  }
  if (error) throw error
  return {}
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

