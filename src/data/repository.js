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
import { studioLabel } from './studios'

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
      startTime: s.start_time,
      endTime: s.end_time,
      status: s.status,
      color: s.color,
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
// RLS write policies are `to authenticated`, so these require Supabase Auth.
// Until login is wired, anonymous writes are (correctly) rejected by the DB.
// Kept here so the migration path is obvious.

export async function createBooking({ title, studioId, date, startTime, endTime, color, notes, unitIds = [] }) {
  const { data: set, error } = await supabase
    .from('sets')
    .insert({ title, studio_id: studioId, date, start_time: startTime, end_time: endTime, color, notes })
    .select('id')
    .single()
  if (error) throw error
  if (unitIds.length) {
    const rows = unitIds.map((unit_id) => ({ set_id: set.id, unit_id }))
    const { error: suErr } = await supabase.from('set_units').insert(rows)
    if (suErr) throw suErr
  }
  return set.id
}

export async function deleteBooking(setId) {
  const { error } = await supabase.from('sets').delete().eq('id', setId)
  if (error) throw error
}

export async function toggleOwnership(unitId, next) {
  const { error } = await supabase.from('units').update({ ownership: next }).eq('id', unitId)
  if (error) throw error
}
