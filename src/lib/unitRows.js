// Registering PHYSICAL COPIES from a list of rows — one row per copy, each with
// an optional barcode and serial.
//
// A blank row means "generate it", which is the case for a batch of identical
// stands; a typed row means "this is the label on the piece in my hand". Both
// have to work in the same batch, and a typed number must never be handed to
// another row as well.
//
// PURE — no React, no store — because this rule is used in THREE places now
// (adding copies to an item, creating an item with its copies, and the greyed
// previews both of those show) and a rule written three times is a rule that
// drifts. `npm run test:lib` asserts it under plain Node.

export const MAX_UNIT_ROWS = 50

const pad = (n) => String(n).padStart(4, '0')
const clean = (v) => String(v ?? '').trim()

// Rows as the form holds them, or `count` blank ones when nothing was typed.
export function normalizeUnitRows(rows, count = 1, max = MAX_UNIT_ROWS) {
  const list =
    Array.isArray(rows) && rows.length
      ? rows
      : Array.from({ length: Math.max(1, Math.min(max, Math.floor(Number(count) || 1))) }, () => ({}))
  return list.slice(0, max).map((r) => ({ barcode: clean(r?.barcode), serial: clean(r?.serial) }))
}

// The greyed placeholder for each blank row: the next free number, SKIPPING the
// ones typed into other rows of the same batch — so the preview never promises a
// barcode the save cannot use.
//
// `taken` is optional here: the form knows the register too, and a preview that
// silently proposes an existing barcode would be a lie the save then refuses.
export function barcodePreviews(rows, suggested, taken = new Set()) {
  const specs = normalizeUnitRows(rows, rows?.length || 1)
  const typed = new Set(specs.map((r) => r.barcode).filter(Boolean))
  const base = parseInt(suggested, 10)
  let next = Number.isFinite(base) ? base : 1
  return specs.map((r) => {
    if (r.barcode) return null
    let code = pad(next)
    while (typed.has(code) || taken.has(code)) code = pad(++next)
    next++
    // Claimed, so the NEXT blank row does not get the same preview.
    typed.add(code)
    return code
  })
}

// The barcode each row will actually get — or the reason it cannot be saved.
// Returns `{ codes }` or `{ error }`; the caller reports the error rather than
// guessing a substitute, because a barcode is a physical label.
export function resolveUnitCodes(rows, { taken = new Set(), nextBarcode = '0001', count = 1 } = {}) {
  const specs = normalizeUnitRows(rows, count)
  const claimed = new Set()

  for (const s of specs) {
    if (!s.barcode) continue
    if (taken.has(s.barcode)) return { error: `#${s.barcode} is already used by another unit.` }
    if (claimed.has(s.barcode))
      return { error: `#${s.barcode} is listed twice — each copy needs its own barcode.` }
    claimed.add(s.barcode)
  }

  const base = parseInt(nextBarcode, 10)
  let next = Number.isFinite(base) ? base : 1
  const codes = specs.map((s) => {
    if (s.barcode) return s.barcode
    let code = pad(next)
    while (taken.has(code) || claimed.has(code)) code = pad(++next)
    next++
    claimed.add(code)
    return code
  })
  return { codes, specs }
}

// The same duplicate check the form runs before submitting, so the mistake is
// caught next to the field rather than after a round trip. The STORE checks it
// too — that one is the guarantee, this one is the courtesy.
export function duplicateTypedBarcode(rows) {
  const typed = normalizeUnitRows(rows, rows?.length || 1)
    .map((r) => r.barcode)
    .filter(Boolean)
  return typed.find((c, i) => typed.indexOf(c) !== i) ?? null
}
