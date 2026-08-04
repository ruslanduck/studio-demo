// Which years the month/year chooser offers.
//
// Pure, and in lib/ rather than in the component, so it can be asserted under
// plain Node like the rest of the app's rules.
//
// DERIVED from today, never hardcoded, so the span slides forward on its own:
// next January the top of the list moves up without anyone editing anything.
// Gear gets bought long before it gets rented, hence the long tail backwards; a
// few years ahead covers a season that isn't this one.
export const YEARS_AHEAD = 3
export const YEARS_BACK = 30

// The list ALSO always contains the year being viewed. Without that, paging past
// the edge with the arrows showed a list that didn't include the year you were
// on — nothing highlighted, and no way back to it from the chooser.
export function yearsFor(viewed, today = new Date()) {
  const now = today.getFullYear()
  const at = Number.isFinite(viewed) ? viewed : now
  const top = Math.max(now + YEARS_AHEAD, at + 2)
  const bottom = Math.min(now - YEARS_BACK, at - 2)
  return Array.from({ length: top - bottom + 1 }, (_, i) => top - i)
}
