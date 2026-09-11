// Build a database patch from ONLY the keys the caller actually supplied.
//
// ⚠️ The distinction this exists for: `undefined` means "leave that column
// alone", while `null` or '' means "clear it". A mapper that emits every column
// it knows about — filling the missing ones with null — is correct for a form
// that always submits its whole shape, and DESTRUCTIVE for a partial write.
//
// That is not hypothetical. `itemFieldColumns` did exactly that, and the moment
// something saved one field on its own (the note on the item card), the same
// UPDATE also wrote null over brand, asset type, storage location, subcategory,
// purchase date and purchase price. Local mode was fine — its own field list is
// guarded with `in` — so only the real database would have lost the data: the
// "same logic written twice" class again.
//
// `map` is { callerKey: column_name }.
export function pickPatch(source = {}, map = {}) {
  const out = {}
  for (const [key, col] of Object.entries(map)) {
    if (!(key in source)) continue
    const v = source[key]
    out[col] = v === '' || v == null ? null : v
  }
  return out
}
