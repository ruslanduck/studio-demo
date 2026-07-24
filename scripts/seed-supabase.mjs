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
import { BOOKING_TEMPLATES } from '../src/data/bookings.js'
import { PHOTOGRAPHERS, MODELS } from '../src/data/contacts.js'
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
  'set_units', 'events', 'roster_entries', 'order_lines',
  'sets', 'orders', 'units', 'kit_items', 'kits',
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

  console.log('Company + contacts…')
  const { data: company, error: cErr } =
    await db.from('companies').insert({ name: 'AnnTaylor Rental', kind: 'both' }).select('id').single()
  if (cErr) throw cErr

  const names = [...new Set([...PHOTOGRAPHERS, ...MODELS])]
  const { data: contactRows, error: ctErr } = await db.from('contacts')
    .insert(names.map((full_name) => ({ company_id: company.id, full_name })))
    .select('id, full_name')
  if (ctErr) throw ctErr
  const contactId = Object.fromEntries(contactRows.map((c) => [c.full_name, c.id]))

  console.log('Inventory items + units…')
  const itemUnits = {} // local item id -> [db unit id] in local order
  const itemUsed = {} // local item id -> count reserved so far
  for (const item of INVENTORY_SEED) {
    const { data: it, error: iErr } =
      await db.from('inventory_items').insert({ name: item.name, category: item.category }).select('id').single()
    if (iErr) throw iErr

    const { data: units, error: uErr } = await db.from('units')
      .insert(item.units.map((u) => ({
        inventory_item_id: it.id, barcode: u.barcode, serial: u.serial, ownership: u.ownership,
      })))
      .select('id, barcode')
    if (uErr) throw uErr

    const byBarcode = Object.fromEntries(units.map((u) => [u.barcode, u.id]))
    itemUnits[item.id] = item.units.map((u) => byBarcode[u.barcode])
    itemUsed[item.id] = 0
  }

  console.log('Sets + set_units + roster…')
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })
  let sets = 0, reservations = 0, rosterCount = 0
  for (const t of BOOKING_TEMPLATES) {
    const date = format(addDays(weekStart, t.dayOffset), 'yyyy-MM-dd')
    const { data: set, error: sErr } = await db.from('sets').insert({
      title: t.title, studio_id: t.studioId, date,
      start_time: t.startTime, end_time: t.endTime, status: 'active', color: t.color,
    }).select('id').single()
    if (sErr) throw sErr
    sets++

    const suRows = []
    for (const [itemLocalId, count] of t.reserve) {
      const ids = itemUnits[itemLocalId] || []
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

  const totalUnits = Object.values(itemUnits).reduce((n, a) => n + a.length, 0)
  console.log('\nDone:')
  console.log(`  companies: 1, contacts: ${contactRows.length}`)
  console.log(`  inventory_items: ${INVENTORY_SEED.length}, units: ${totalUnits}`)
  console.log(`  sets: ${sets}, set_units: ${reservations}, roster_entries: ${rosterCount}`)
}

main().catch((e) => { console.error('SEED FAILED:', e.message); process.exit(1) })
