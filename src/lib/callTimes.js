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

const pad = (n) => String(n).padStart(2, '0')

// The hours and the minutes a picker offers. Minutes come in steps because a
// call sheet is written on the 5s — and any other minute is still TYPEABLE, so
// the list covers the real cases without closing the door on 08:07.
export function hourOptions() {
  return Array.from({ length: 24 }, (_, h) => pad(h))
}
export function minuteOptions(step = 5) {
  const n = Math.max(1, Math.min(60, Math.round(step)))
  const out = []
  for (let m = 0; m < 60; m += n) out.push(pad(m))
  return out
}

// What a person TYPED, snapped to HH:MM — so nobody has to reach for the colon.
//   "8" → 08:00 · "830" → 08:30 · "0830" → 08:30 · "8:5" → 08:05 · "19.45" → 19:45
// Returns '' when the text cannot be read as a time (including a real 24:00 or
// 08:75), so the caller can leave what was typed alone rather than overwrite it
// with a guess.
export function parseTimeInput(raw) {
  const text = String(raw ?? '').trim()
  if (!text) return ''
  if (!/^[\d\s:.]+$/.test(text)) return ''
  let h
  let m
  if (/[:.\s]/.test(text)) {
    // Up to THREE parts: "08:00:00" is a Postgres `time` someone pasted and it
    // means 08:00, while "1:2:3:4" is junk — reading its first two fields would
    // invent a value out of nonsense.
    const parts = text.split(/[:.\s]+/)
    if (parts.length > 3) return ''
    const [a, b = ''] = parts
    if (!a) return ''
    h = Number(a)
    m = b === '' ? 0 : Number(b.length === 1 ? b : b.slice(0, 2))
  } else {
    // No separator: read it the way a clock does — the last two digits are
    // minutes once there are more than two.
    if (text.length <= 2) {
      h = Number(text)
      m = 0
    } else if (text.length === 3) {
      h = Number(text[0])
      m = Number(text.slice(1))
    } else {
      h = Number(text.slice(0, 2))
      m = Number(text.slice(2, 4))
    }
  }
  if (!Number.isInteger(h) || !Number.isInteger(m)) return ''
  if (h < 0 || h > 23 || m < 0 || m > 59) return ''
  return `${pad(h)}:${pad(m)}`
}

// Nudge a time by N minutes, wrapping at midnight — what the arrow keys do on a
// time field, so a value can be corrected without retyping it.
export function stepTime(hhmm, deltaMinutes, fallback = '08:00') {
  const base = isValidTime(toHHMM(hhmm)) ? toHHMM(hhmm) : null
  if (!base) return fallback
  const [h, m] = base.split(':').map(Number)
  const total = (((h * 60 + m + deltaMinutes) % 1440) + 1440) % 1440
  return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`
}

// Drop the half-filled rows, de-duplicate roles, and put the day in order.
// A row with no roles or no time is not a call time — it is a row someone
// started and abandoned, and storing it would put a blank line on the call
// sheet. Sorted by time, then by the order they were typed.
export function normalizeCallTimes(rows = []) {
  const clean = (rows || [])
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

  // Two rows saying the same thing at the same time are ONE call. The sheet is
  // read by time — that is why roles is a list in the first place — so a second
  // "08:15 Producer" line adds nothing and reads as a rendering fault (it was
  // reported as exactly that). Their roles are unioned.
  //
  // Rows that share a time but carry DIFFERENT notes stay apart: the note is
  // what tells them apart ("through the freight door" vs "park on 9th"), and
  // folding them together would strand it on a role it was never about.
  const merged = []
  const byKey = new Map()
  for (const r of clean) {
    const key = `${r.time}\u0000${r.note ?? ''}`
    const seen = byKey.get(key)
    if (!seen) {
      byKey.set(key, r)
      merged.push(r)
      continue
    }
    for (const role of r.roles) if (!seen.roles.includes(role)) seen.roles.push(role)
  }
  return merged.map((r, i) => ({ ...r, position: i }))
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
