// Per-day availability of ONE item — the data behind the inventory calendar.
//
// "10 units" is not an answer to "can I book this on the 4th": three may be out
// on that day's shoot and one away for repair. Gear is committed per day (see
// lib/availability), and every unit already carries its reservation windows
// (mapped from set_units in supabase mode, derived from the bookings locally),
// so the whole calendar is a pure function of the item + a list of days.
//
// Pure on purpose: no React, no store, no date-fns — it runs under plain Node,
// which is how it's asserted.
//
// Only CONFIRMED orders reserve gear (a Hold pencils it in and holds nothing),
// so a day that looks free may still have estimates against it. The UI says so
// rather than pretending the calendar is the whole truth.

const isoOf = (v) => (typeof v === 'string' ? v.slice(0, 10) : null)

// Does an inclusive [from, to] window cover this day? A missing `to` is one day.
export function covers(reservation, iso) {
  const from = isoOf(reservation?.from)
  if (!from || !iso) return false
  const to = isoOf(reservation?.to) || from
  return from <= iso && iso <= to
}

// A unit is physically away for the whole calendar when it's out for repair;
// an archived (written-off) copy isn't stock at all and is left out entirely.
const isLive = (unit) => !unit?.archivedAt
const isAway = (unit) => unit?.status === 'in_repair'

// One day: how many pieces exist, how many are committed, what's left, and the
// exact copies behind those numbers.
//
//   { iso, total, booked, away, free, entries: [{ unitId, barcode, serial,
//     setId, setTitle, studioId, from, to }], awayUnits: [{…unit}] }
export function dayAvailability(item, iso) {
  const units = (item?.units || []).filter(isLive)
  const entries = []
  const awayUnits = []
  for (const u of units) {
    if (isAway(u)) {
      awayUnits.push({ unitId: u.id, barcode: u.barcode, serial: u.serial })
      continue
    }
    // The FIRST window covering this day is the one that holds the unit; a
    // second one would be a double-booking, which availability.js prevents.
    const hit = (u.reservations || []).find((r) => covers(r, iso))
    if (!hit) continue
    entries.push({
      unitId: u.id,
      barcode: u.barcode,
      serial: u.serial,
      setId: hit.setId ?? null,
      setTitle: hit.setTitle ?? null,
      studioId: hit.studioId ?? null,
      from: isoOf(hit.from),
      to: isoOf(hit.to) || isoOf(hit.from),
    })
  }
  const total = units.length
  const booked = entries.length
  const away = awayUnits.length
  return { iso, total, booked, away, free: Math.max(0, total - booked - away), entries, awayUnits }
}

// The same, for a run of days (the calendar grid).
export function availabilityForDays(item, isoDays) {
  return (isoDays || []).map((iso) => dayAvailability(item, iso))
}

// Free copies on a day, for "which ones can I still take".
export function freeUnitsOn(item, iso) {
  const day = dayAvailability(item, iso)
  const taken = new Set([...day.entries, ...day.awayUnits].map((e) => e.unitId))
  return (item?.units || []).filter((u) => isLive(u) && !taken.has(u.id))
}

// Every day this item has ANY commitment, so a card can say "next booked on…"
// without walking a calendar.
export function bookedDays(item) {
  const days = new Set()
  for (const u of (item?.units || []).filter(isLive)) {
    for (const r of u.reservations || []) {
      const from = isoOf(r.from)
      if (!from) continue
      const to = isoOf(r.to) || from
      // Windows are days, not milliseconds: step the ISO string forward.
      let d = from
      let guard = 0
      while (d <= to && guard++ < 400) {
        days.add(d)
        d = nextIso(d)
      }
    }
  }
  return [...days].sort()
}

// The day after an ISO date, without pulling in a date library (this module has
// to stay importable from plain Node).
export function nextIso(iso) {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + 1))
  return dt.toISOString().slice(0, 10)
}
