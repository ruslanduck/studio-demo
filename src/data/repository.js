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

// Inventory items with their units. `status`/`location` are derived from the
// active reservations in set_units (the DB keeps no denormalized copy).
export async function getInventory() {
  const { data, error } = await supabase
    .from('inventory_items')
    .select(
      `id, name, category,
       units (
         id, barcode, serial, ownership,
         set_units ( status, set:sets ( title, studio_id, status ) )
       )`,
    )
    .order('name')
  if (error) throw error

  return data.map((item) => ({
    id: item.id,
    name: item.name,
    category: item.category,
    units: (item.units || []).map((u) => {
      const active = (u.set_units || []).find(occupies)
      return {
        id: u.id,
        barcode: u.barcode,
        serial: u.serial,
        ownership: u.ownership,
        status: active ? 'checked_out' : 'available',
        location: active
          ? `${active.set.title} — ${studioLabel(active.set.studio_id)}`
          : 'Available',
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
// RLS write policies are `to authenticated`, so these need a session (the app
// gets one via anonymous sign-in — see src/lib/auth.js).

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

export async function addInventoryItem({ name, category, quantity }) {
  const { data: item, error } = await supabase
    .from('inventory_items').insert({ name: name.trim(), category }).select('id').single()
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
