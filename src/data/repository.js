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
  const { data, error } = await supabase
    .from('repairs')
    .select('id, unit_id, vendor, issue, sent_at, returned_at, resolution')
    .order('sent_at', { ascending: false })
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
    })
  }
  return map
}

// Usage events grouped by item id, newest first. Fetched separately (like
// repairs) so inventory still loads if the 2.7 migration hasn't run yet.
async function getUsageByItem() {
  const { data, error } = await supabase
    .from('item_usage')
    .select('inventory_item_id, job_title, studio_id, quantity, used_on')
    .order('used_on', { ascending: false })
  if (error) return {} // table absent / not yet migrated → no usage
  const map = {}
  for (const u of data || []) {
    ;(map[u.inventory_item_id] ||= []).push({
      jobTitle: u.job_title,
      studioId: u.studio_id,
      quantity: u.quantity,
      usedOn: u.used_on,
    })
  }
  return map
}

// Inventory items with their units. `status`/`location` are derived from the
// active reservations in set_units + any open repair (the DB keeps no
// denormalized copy). An open repair takes precedence: the unit is unavailable.
export async function getInventory() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(
      `id, name, category, kind, quantity,
       brand, asset_type, placement, subcategory, purchase_date, replacement_price,
       units (
         id, barcode, serial, ownership,
         set_units ( status, set:sets ( title, studio_id, status ) )
       )`,
    )
    .order('name')
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
      `id, title, studio_id, date, start_time, end_time, status, color, notes,
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

export async function toggleOwnership(unitId, next) {
  const { error } = await supabase.from('units').update({ ownership: next }).eq('id', unitId)
  if (error) throw error
}

// Set/correct a unit's barcode (3.4 — barcode edit/add when filling slots).
export async function setUnitBarcode(unitId, barcode) {
  const { error } = await supabase.from('units').update({ barcode }).eq('id', unitId)
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
// deletes the item (units cascade). Event-log history is preserved.
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
  const enriched = 'id, name, kind, notes, company_type'
  const basic = 'id, name, kind, notes'
  let { data, error } = await supabase.from('companies').select(enriched).order('name')
  if (error) ({ data, error } = await supabase.from('companies').select(basic).order('name'))
  if (error) return []
  return (data || []).map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind,
    companyType: c.company_type ?? null,
    notes: c.notes,
  }))
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
