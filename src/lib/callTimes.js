// Call times: who is expected on set, and when.
//
// A shoot has no single start. The photographer is called at 08:00, hair and
// makeup at 09:00, the models at 10:00 — and the whole thing wraps at some hour.
// So this is a LIST of any length (including empty), each entry carrying the
// roles it applies to and one time, plus a single wrap time for the shoot.
//
// PURE — no React, no store, no date library — so `npm run test:lib` can assert
// the sorting, the validation and the summary strings under plain Node.

// The roles offered in the picker. Drawn from the freelancer taxonomy the People
// database already uses (PEOPLE_CATEGORIES) plus the ones a call sheet needs and
// that taxonomy has no entry for.
//
// NOT a closed list: `rolesFor` merges these with whatever the shoots already
// use, and the field takes a typed role — a closed vocabulary has been a dead
// end three times in this codebase (item categories, subcategories, job types).
export const CALL_ROLES = [
  'Producer',
  'Photographer',
  'Digital tech',
  'Assistant',
  'Art director',
  'Stylist',
  'Hair & makeup',
  'Model',
  'Crew',
  'Client',
]

// The offered roles plus every role already stored, so a role typed once keeps
// being offered instead of vanishing from the list that suggested it.
export function rolesFor(bookings = []) {
  const seen = new Set(CALL_ROLES)
  const extra = []
  for (const b of bookings)
    for (const c of b?.callTimes || [])
      for (const r of c?.roles || []) {
        const role = String(r).trim()
        if (role && !seen.has(role)) {
          seen.add(role)
          extra.push(role)
        }
      }
  return [...CALL_ROLES, ...extra.sort()]
}

// HH:MM, 24-hour. The field is a TimeField, but a stored value can come from
// anywhere (a seed, an import, a hand-written SQL row).
export function isValidTime(t) {
  return typeof t === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(t)
}

// A DB `time` comes back as "08:00:00"; the UI works in "08:00".
export function toHHMM(t) {
  if (typeof t !== 'string') return ''
  const m = t.match(/^(\d{1,2}):(\d{2})/)
  if (!m) return ''
  return `${m[1].padStart(2, '0')}:${m[2]}`
}

// Drop the half-filled rows, de-duplicate roles, and put the day in order.
// A row with no roles or no time is not a call time — it is a row someone
// started and abandoned, and storing it would put a blank line on the call
// sheet. Sorted by time, then by the order they were typed.
export function normalizeCallTimes(rows = []) {
  return (rows || [])
    .map((r, i) => {
      const roles = [...new Set((r?.roles || []).map((x) => String(x).trim()).filter(Boolean))]
      return {
        id: r?.id ?? null,
        roles,
        time: toHHMM(r?.time),
        note: (r?.note ?? '').trim() || null,
        position: Number.isFinite(r?.position) ? r.position : i,
      }
    })
    .filter((r) => r.roles.length > 0 && isValidTime(r.time))
    .sort((a, b) => a.time.localeCompare(b.time) || a.position - b.position)
    .map((r, i) => ({ ...r, position: i }))
}

// "Photographer, Digital tech" — the roles of one call, as a human reads them.
export function rolesLabel(entry) {
  return (entry?.roles || []).join(', ')
}

// The earliest call. This is what a calendar chip has room for: one number
// answering "when do I have to be there".
export function earliestCall(rows = []) {
  const ok = normalizeCallTimes(rows)
  return ok.length ? ok[0].time : null
}

// "08:00 Photographer · 09:00 Model, Stylist" — the whole schedule on one line,
// for a tooltip or a narrow card row.
export function callSummary(rows = []) {
  return normalizeCallTimes(rows)
    .map((r) => `${r.time} ${rolesLabel(r)}`)
    .join(' · ')
}

// A wrap before the first call is a typo, not a shoot. Reported, not clamped:
// the form can say so where the crew can see it, and clamping would invent an
// hour nobody typed.
export function wrapBeforeFirstCall(rows = [], wrapTime = null) {
  const first = earliestCall(rows)
  const wrap = toHHMM(wrapTime)
  if (!first || !isValidTime(wrap)) return false
  return wrap < first
}
