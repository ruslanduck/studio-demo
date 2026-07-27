// Seed the Supabase project with the full studio dataset.
//
// Reuses the app's local seed modules (src/data/*) so the DB matches the demo,
// and mirrors the store's reservation logic. Uses the service_role key to
// bypass RLS — LOCAL ONLY, never shipped to the client.
//
// Run:  node --env-file=.env.local scripts/seed-supabase.mjs
import { createClient } from '@supabase/supabase-js'
import { startOfWeek, addDays, format } from 'date-fns'
import { INVENTORY_SEED } from '../src/data/inventory.js'
import { REPAIR_TEMPLATES, repairDates } from '../src/data/repairs.js'
import { generateUsage } from '../src/data/usage.js'
import { KIT_SEED } from '../src/data/kits.js'
import { SCENARIO_SEED } from '../src/data/scenarios.js'
import { BOOKING_TEMPLATES } from '../src/data/bookings.js'
import { PHOTOGRAPHERS, MODELS } from '../src/data/contacts.js'
import { PEOPLE_SEED, COMPANY_SEED, COMPANY_TYPES } from '../src/data/people.js'
import { ORDER_SEED, SUB_RENTAL_VENDORS } from '../src/data/orders.js'
import { STUDIOS, studioLabel } from '../src/data/studios.js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (run with --env-file=.env.local)')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

function must(label, { error }) {
  if (error) throw new Error(`${label}: ${error.message}`)
}

// Wipe order avoids FK conflicts. set_units is deleted first: its DELETE
// trigger writes to events, so events is cleared right after.
const WIPE_ORDER = [
  'set_units', 'events', 'roster_entries', 'order_lines', 'item_usage',
  'sets', 'orders', 'repairs', 'units', 'scenario_list_entries', 'scenario_lists',
  'kit_items', 'kit_slots', 'kits',
  'inventory_items', 'contacts', 'companies',
]

async function wipe() {
  for (const t of WIPE_ORDER) {
    const col = t === 'kit_items' ? 'kit_id' : 'id'
    must(`wipe ${t}`, await db.from(t).delete().not(col, 'is', null))
  }
}

async function main() {
  console.log('Wiping domain tables…')
  await wipe()

  console.log('Studios…')
  must('studios', await db.from('studios').upsert(
    STUDIOS.map((id) => ({ id, label: studioLabel(id) })),
  ))

  console.log('Companies + people…')
  const { data: companyRows, error: cErr } = await db.from('companies')
    .insert(COMPANY_SEED.map((c) => ({
      name: c.name,
      kind: c.kind ?? 'client',
      company_type: c.companyType ?? null,
      notes: c.notes ?? null,
      address: c.address ?? null,
      opening_hours: c.openingHours ?? null,
      website: c.website ?? null,
      email: c.email ?? null,
      phone: c.phone ?? null,
    })))
    .select('id, name')
  if (cErr) throw cErr
  const companyIdByName = Object.fromEntries(companyRows.map((c) => [c.name, c.id]))
  // seed slug -> db uuid, so a person's `company` slug resolves.
  const companyIdBySlug = Object.fromEntries(
    COMPANY_SEED.map((c) => [c.id, companyIdByName[c.name]]),
  )

  // 4.4 — the editable Type option list. Upserted by name: the migration already
  // inserted a base set, and a reseed must not duplicate it.
  must('company_types', await db.from('company_types').upsert(
    COMPANY_TYPES.map((name, i) => ({ name, position: i })),
    { onConflict: 'name' },
  ))

  // People (4.1/4.2) carry category/subcategory and their profile. Any booking
  // name missing from PEOPLE_SEED is added bare so the roster still links.
  const seeded = new Set(PEOPLE_SEED.map((p) => p.name))
  const extras = [...new Set([...PHOTOGRAPHERS, ...MODELS])].filter((n) => !seeded.has(n))
  const { data: contactRows, error: ctErr } = await db.from('contacts')
    .insert([
      ...PEOPLE_SEED.map((p) => ({
        company_id: p.company ? companyIdBySlug[p.company] ?? null : null,
        full_name: p.name,
        email: p.email ?? null,
        phone: p.phone ?? null,
        notes: p.notes ?? null,
        category: p.category ?? null,
        subcategory: p.subcategory ?? null,
        website: p.website ?? null,
        instagram: p.instagram ?? null,
        cv_filename: p.cvFilename ?? null,
      })),
      ...extras.map((full_name) => ({ full_name })),
    ])
    .select('id, full_name')
  if (ctErr) throw ctErr
  const contactId = Object.fromEntries(contactRows.map((c) => [c.full_name, c.id]))

  console.log('Inventory items + units…')
  const itemUnits = {} // local item id -> [db unit id] in local order
  const itemUsed = {} // local item id -> count reserved so far
  const itemDbId = {} // local item id -> db item id
  for (const item of INVENTORY_SEED) {
    const kind = item.kind ?? 'barcoded'
    const { data: it, error: iErr } = await db
      .from('inventory_items')
      .insert({
        name: item.name,
        category: item.category,
        kind,
        quantity: kind === 'barcoded' ? 0 : item.quantity ?? 0,
        brand: item.brand ?? null,
        asset_type: item.assetType ?? null,
        placement: item.placement ?? null,
        subcategory: item.subcategory ?? null,
        purchase_date: item.purchaseDate ?? null,
        replacement_price: item.replacementPrice ?? null,
        day_rate: item.dayRate ?? null, // 5.4 — what the estimate multiplies
      })
      .select('id')
      .single()
    if (iErr) throw iErr

    itemDbId[item.id] = it.id
    itemUnits[item.id] = []
    itemUsed[item.id] = 0
    if (kind !== 'barcoded' || item.units.length === 0) continue // no unit rows

    const { data: units, error: uErr } = await db.from('units')
      .insert(item.units.map((u) => ({
        inventory_item_id: it.id, barcode: u.barcode, serial: u.serial, ownership: u.ownership,
      })))
      .select('id, barcode')
    if (uErr) throw uErr

    const byBarcode = Object.fromEntries(units.map((u) => [u.barcode, u.id]))
    itemUnits[item.id] = item.units.map((u) => byBarcode[u.barcode])
  }

  // 4.5 — attribute sub-rented units to the vendor they came from. Only mapped
  // items are attributed; the rest stay unattributed on purpose.
  let vendorLinks = 0
  for (const [itemSlug, vendorSlug] of Object.entries(SUB_RENTAL_VENDORS)) {
    const vendorId = companyIdBySlug[vendorSlug]
    const dbItemId = itemDbId[itemSlug]
    if (!vendorId || !dbItemId) continue
    const { data: linked, error: vErr } = await db.from('units')
      .update({ sub_rental_vendor_id: vendorId })
      .eq('inventory_item_id', dbItemId)
      .eq('ownership', 'sub_rental')
      .select('id')
    if (vErr) throw vErr
    vendorLinks += (linked || []).length
  }

  console.log('Repairs…')
  const isoFor = (d) => format(d, 'yyyy-MM-dd')
  const now = new Date()
  const repairRows = []
  for (const t of REPAIR_TEMPLATES) {
    const unitId = (itemUnits[t.itemId] || [])[t.unitIndex]
    if (!unitId) continue
    const { sentAt, returnedAt } = repairDates(t, now, isoFor)
    repairRows.push({
      unit_id: unitId, vendor: t.vendor, issue: t.issue,
      sent_at: sentAt, returned_at: returnedAt, resolution: t.resolution,
    })
  }
  let repairs = 0
  if (repairRows.length) {
    must('repairs', await db.from('repairs').insert(repairRows))
    repairs = repairRows.length
  }
  // Units with an OPEN repair are unavailable — keep them out of reservations.
  const openRepairUnits = new Set(
    repairRows.filter((r) => !r.returned_at).map((r) => r.unit_id),
  )

  console.log('Work-history / usage…')
  const usageByItem = generateUsage(now, isoFor)
  const usageRows = []
  for (const [localId, events] of Object.entries(usageByItem)) {
    const dbId = itemDbId[localId]
    if (!dbId) continue
    for (const e of events) {
      usageRows.push({
        inventory_item_id: dbId,
        job_title: e.jobTitle,
        studio_id: e.studioId,
        quantity: e.quantity,
        used_on: e.usedOn,
      })
    }
  }
  let usage = 0
  if (usageRows.length) {
    must('item_usage', await db.from('item_usage').insert(usageRows))
    usage = usageRows.length
  }

  console.log('Kits + slots…')
  let kits = 0, kitSlots = 0
  const kitDbId = {} // local kit id -> db kit id
  for (const k of KIT_SEED) {
    const { data: kit, error: kErr } = await db
      .from('kits')
      .insert({ name: k.name, category: k.category, notes: k.notes })
      .select('id')
      .single()
    if (kErr) throw kErr
    kits++
    kitDbId[k.id] = kit.id
    const slotRows = k.slots
      .map((s, i) => {
        // FIXED slots pin a specific unit (by index within the item); fall back
        // to generic if the pinned unit can't be resolved, so seeding never
        // violates the fixed-slot check constraint.
        const fixedUnitId =
          s.slotType === 'fixed' ? (itemUnits[s.itemId] || [])[s.fixedUnitIndex ?? 0] || null : null
        const slotType = s.slotType === 'fixed' && fixedUnitId ? 'fixed' : 'generic'
        return {
          kit_id: kit.id,
          inventory_item_id: itemDbId[s.itemId],
          label: s.label,
          position: i,
          slot_type: slotType,
          fixed_unit_id: slotType === 'fixed' ? fixedUnitId : null,
        }
      })
      .filter((r) => r.inventory_item_id)
    if (slotRows.length) {
      must('kit_slots', await db.from('kit_slots').insert(slotRows))
      kitSlots += slotRows.length
    }
  }

  console.log('Scenario lists…')
  let lists = 0, listEntries = 0
  for (const l of SCENARIO_SEED) {
    const { data: list, error: lErr } = await db
      .from('scenario_lists')
      .insert({ name: l.name, category: l.category, notes: l.notes })
      .select('id')
      .single()
    if (lErr) throw lErr
    lists++
    const rows = l.entries
      .map((e, i) => ({
        list_id: list.id,
        entry_type: e.kit ? 'kit' : 'item',
        kit_id: e.kit ? kitDbId[e.kit] ?? null : null,
        inventory_item_id: e.item ? itemDbId[e.item] ?? null : null,
        quantity: e.kit ? 1 : e.qty ?? 1,
        position: i,
        note: e.note ?? null,
      }))
      // Skip entries whose target didn't seed (keeps the target check valid).
      .filter((r) => (r.entry_type === 'kit' ? r.kit_id : r.inventory_item_id))
    if (rows.length) {
      must('scenario_list_entries', await db.from('scenario_list_entries').insert(rows))
      listEntries += rows.length
    }
  }

  console.log('Sets + set_units + roster…')
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  let sets = 0, reservations = 0, rosterCount = 0
  const setByTitle = {} // title -> { id, date }, used to link orders (4.5)
  for (const t of BOOKING_TEMPLATES) {
    const date = format(addDays(weekStart, t.dayOffset), 'yyyy-MM-dd')
    const { data: set, error: sErr } = await db.from('sets').insert({
      title: t.title, studio_id: t.studioId, date,
      start_time: t.startTime, end_time: t.endTime, status: 'active', color: t.color,
    }).select('id').single()
    if (sErr) throw sErr
    sets++
    setByTitle[t.title] = { id: set.id, date, studioId: t.studioId, photographer: t.photographer }

    const suRows = []
    for (const [itemLocalId, count] of t.reserve) {
      const ids = (itemUnits[itemLocalId] || []).filter((id) => !openRepairUnits.has(id))
      const used = itemUsed[itemLocalId] || 0
      const pick = ids.slice(used, used + count)
      itemUsed[itemLocalId] = used + pick.length
      for (const unit_id of pick) {
        suRows.push({ set_id: set.id, unit_id, status: 'reserved', reserved_from: date, reserved_to: date })
      }
    }
    if (suRows.length) {
      must('set_units', await db.from('set_units').insert(suRows))
      reservations += suRows.length
    }

    const roster = []
    if (contactId[t.photographer]) roster.push({ set_id: set.id, contact_id: contactId[t.photographer], role: 'photographer' })
    if (contactId[t.model]) roster.push({ set_id: set.id, contact_id: contactId[t.model], role: 'model' })
    if (roster.length) {
      must('roster', await db.from('roster_entries').insert(roster))
      rosterCount += roster.length
    }
  }

  // 4.5 — orders as the work-history source (the module itself is epic #5). An
  // order's date follows the job it serves so the two histories line up.
  console.log('Orders + lines…')
  let orders = 0, orderLines = 0
  for (const o of ORDER_SEED) {
    const companyId = companyIdBySlug[o.company]
    if (!companyId) continue
    const set = o.setTitle ? setByTitle[o.setTitle] : null
    const { data: order, error: oErr } = await db.from('orders').insert({
      order_number: o.number,
      company_id: companyId,
      kind: o.kind,
      status: o.status,
      ordered_at: set?.date ?? null,
      // epic #5 (5.1/5.2): the linked booking is the Set and its title the Job
      // name, so studio / dates / photographer come from it. PO is hand-typed.
      job_name: o.setTitle ?? null,
      studio_id: set?.studioId ?? null,
      starts_on: set?.date ?? null,
      ends_on: set?.date ?? null,
      po_number: o.po ?? null,
      photographer_contact_id: set?.photographer ? contactId[set.photographer] ?? null : null,
    }).select('id').single()
    if (oErr) throw oErr
    orders++

    const lineRows = o.lines
      .map(([slug, quantity]) => ({
        order_id: order.id,
        inventory_item_id: itemDbId[slug],
        quantity,
      }))
      .filter((r) => r.inventory_item_id)
    if (lineRows.length) {
      must('order_lines', await db.from('order_lines').insert(lineRows))
      orderLines += lineRows.length
    }
    // Link the job to its order so a card can show which shoot it served.
    if (set) must('sets.order_id', await db.from('sets').update({ order_id: order.id }).eq('id', set.id))
  }

  const totalUnits = Object.values(itemUnits).reduce((n, a) => n + a.length, 0)
  console.log('\nDone:')
  console.log(`  companies: ${companyRows.length}, contacts: ${contactRows.length}`)
  console.log(`  inventory_items: ${INVENTORY_SEED.length}, units: ${totalUnits}, repairs: ${repairs}, item_usage: ${usage}`)
  console.log(`  kits: ${kits}, kit_slots: ${kitSlots}`)
  console.log(`  scenario_lists: ${lists}, scenario_list_entries: ${listEntries}`)
  console.log(`  sets: ${sets}, set_units: ${reservations}, roster_entries: ${rosterCount}`)
  console.log(`  company_types: ${COMPANY_TYPES.length}, sub-rental vendor links: ${vendorLinks}`)
  console.log(`  orders: ${orders}, order_lines: ${orderLines}`)
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1) })
