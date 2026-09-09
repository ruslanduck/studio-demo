// A shoot occupies WHOLE DAYS, and may occupy several of them.
//
// Until now a set was one day plus a start/end time, and the times were mostly
// fiction: the studio grid is studio × day, not hourly, and an order-created set
// got a hardcoded 09:00–18:00 because nothing asked for one. What the crew
// actually needs to say is "this job holds Studio 2 from Wednesday to Friday",
// so the date range replaced the time pair.
//
// This module owns the day math for that range. It is PURE — no React, no
// store, no date library — so `npm run test:lib` can assert it under plain
// Node, which is where the off-by-one in an inclusive range gets caught.
import { nextIso } from './itemAvailability.js'

// A shoot longer than this is a typo, not a booking (a mistyped year would
// otherwise build a 3600-entry array and render 3600 chips). The range is
// clamped for DISPLAY and iteration; the stored dates are left exactly as
// typed, so nothing is silently rewritten behind the crew's back.
export const MAX_SET_DAYS = 60

// The day a set ends, given what the form holds. `to` before `from` is a
// half-typed range, not a shoot that ends before it starts — it reads as one
// day rather than as an error, because the form is validated where the crew can
// see the message.
export function endsOnFor(from, to) {
  if (!from) return to || ''
  if (!to || to < from) return from
  return to
}

// Every ISO day the set covers, inclusive of both ends.
export function setDays(from, to) {
  if (!from) return []
  const last = endsOnFor(from, to)
  const out = []
  for (let iso = from; iso <= last && out.length < MAX_SET_DAYS; iso = nextIso(iso)) out.push(iso)
  return out
}

// How many days the set bills / holds studio capacity for. Mirrors
// estimate.billableDays deliberately — that one is the money, this one is the
// calendar, and a shoot that bills 3 days must occupy 3.
export function setSpanDays(from, to) {
  if (!from) return 0
  return setDays(from, to).length
}

// Whether a set's window covers a given day (inclusive, missing end = one day).
export function coversDay(from, to, iso) {
  if (!from || !iso) return false
  return iso >= from && iso <= endsOnFor(from, to)
}

// Whether two windows share at least one day. This is what "the studio is
// taken" means once a set can span days: an equal-date test would let a 3-day
// job slip past a full day it actually sits on.
export function windowsOverlap(a, b) {
  if (!a?.from || !b?.from) return false
  return a.from <= endsOnFor(b.from, b.to) && b.from <= endsOnFor(a.from, a.to)
}

// The first day in `window` where `countOn(iso)` has already reached `max`.
// Returns null when the whole range fits.
//
// Capacity is per studio per DAY, so a multi-day job has to clear every day it
// covers — and the message has to name WHICH day is full, or the crew is left
// guessing which end of the range to move.
export function firstFullDay(from, to, countOn, max) {
  for (const iso of setDays(from, to)) if (countOn(iso) >= max) return iso
  return null
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// "Sep 9" · "Sep 9 – 11" · "Sep 29 – Oct 1" — the span as a human reads it,
// dropping the repeated month and never printing a year the crew doesn't need.
// One implementation, because this string shows up on the chip, the job card,
// the peek card and the form's own hint.
export function spanLabel(from, to) {
  if (!from) return '—'
  const day = (iso) => {
    const [, m, d] = iso.split('-')
    return { month: MONTHS[Number(m) - 1] ?? m, day: String(Number(d)) }
  }
  const a = day(from)
  const last = endsOnFor(from, to)
  if (last === from) return `${a.month} ${a.day}`
  const b = day(last)
  return a.month === b.month
    ? `${a.month} ${a.day} – ${b.day}`
    : `${a.month} ${a.day} – ${b.month} ${b.day}`
}

// "3 days · Sep 9 – 11", or just the date for a one-day shoot. Used wherever
// the span needs to justify itself (the form hint, the job card).
export function spanSummary(from, to) {
  if (!from) return '—'
  const n = setSpanDays(from, to)
  return n > 1 ? `${n} days · ${spanLabel(from, to)}` : spanLabel(from, to)
}
