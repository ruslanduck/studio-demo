// Sort orders that are TOTAL, so a list cannot reshuffle.
//
// ⚠️ The app was full of `(a, b) => (a.date < b.date ? 1 : -1)`. That looks
// like "newest first" and is a broken comparator: for two rows with the SAME
// date it answers -1 whichever way it is asked, i.e. "a comes after b" AND
// "b comes after a". V8 takes it at its word and swaps them — so every re-sort
// flipped the pair.
//
// That matters because this store re-sorts on EVERY write. Two jobs on one day
// changed places each time anything was saved, and a view whose selection falls
// back to the first row (which every view does on a first visit) then showed a
// DIFFERENT record after each save. It surfaced as a note being written to the
// wrong job; it was never about notes.
//
// The tie-breaker is what makes the order total: equal keys fall through to the
// id, which is unique and never changes.
export const newestFirst = (field, tie = 'id') => (a, b) => {
  const x = String(a?.[field] ?? '')
  const y = String(b?.[field] ?? '')
  if (x !== y) return x < y ? 1 : -1
  return String(a?.[tie] ?? '').localeCompare(String(b?.[tie] ?? ''))
}

// The same rule the other way up, for lists read oldest-first.
export const oldestFirst = (field, tie = 'id') => (a, b) => -newestFirst(field, tie)(a, b)
