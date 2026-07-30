// Order search (epic #5, 5.7).
//
// Pure functions — no React — so the matching rules can be tested directly and
// the Orders view stays a thin shell over them.
//
// The point of this search is fast access to job history: the crew knows one
// thing (a PO from accounting, a job name, roughly when it shot, or who shot it)
// and needs the order. So:
//   • the text box takes SEVERAL terms and requires all of them, each matching any
//     field — "nike 4490" finds the Nike job on PO-4490 without a field picker;
//   • dates are matched by OVERLAP against the order's working window, not by
//     string prefix, so "everything shooting that week" is a real question;
//   • orders sharing a PO are counted, because one job's PO covers every order
//     raised against it and that grouping IS the job history.


export const SORTS = {
  newest: { label: 'Newest first' },
  oldest: { label: 'Oldest first' },
  job: { label: 'Job name (A–Z)' },
}

// Everything a free-text term may match.
//
// Studio is deliberately NOT in here. It used to be, as its label, and it made
// short numeric terms useless: "studio 2" matched almost every order, because the
// term "2" is a substring of every 2026 date. Studio is an exact-match dropdown
// instead — a filter, not a search term.
function haystack(order) {
  return [
    order.poNumber,
    order.jobName,
    order.setTitle,
    // The hand-typed set designation ("OMSet1") — searchable on its own, which is
    // the point of pulling it out of the job name.
    order.setLabel,
    order.photographer,
    order.number,
    order.startsOn,
    order.endsOn,
    order.companyName,
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase()
}

// Does [aFrom, aTo] overlap [bFrom, bTo]? Open ends mean "unbounded".
function windowsOverlap(aFrom, aTo, bFrom, bTo) {
  const start = aFrom || aTo || null
  const end = aTo || aFrom || null
  if (bFrom && end && end < bFrom) return false
  if (bTo && start && start > bTo) return false
  // An order with no dates at all can't satisfy a date filter.
  if (!start && !end && (bFrom || bTo)) return false
  return true
}

export function matchesOrder(
  order,
  { text = '', status = 'All', photographer = 'All', studio = 'All', from = '', to = '' } = {},
) {
  if (status !== 'All' && order.status !== status) return false
  if (photographer !== 'All' && (order.photographer ?? '') !== photographer) return false
  if (studio !== 'All' && (order.studioId ?? '') !== studio) return false
  if ((from || to) && !windowsOverlap(order.startsOn, order.endsOn, from, to)) return false

  const terms = String(text).toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return true
  const hay = haystack(order)
  return terms.every((t) => hay.includes(t))
}

function compare(sort) {
  if (sort === 'oldest') return (a, b) => String(a.startsOn ?? '').localeCompare(String(b.startsOn ?? ''))
  if (sort === 'job')
    return (a, b) => String(a.jobName ?? a.setTitle ?? '').localeCompare(String(b.jobName ?? b.setTitle ?? ''))
  // newest: undated orders sink to the bottom rather than floating to the top.
  return (a, b) => String(b.startsOn ?? '').localeCompare(String(a.startsOn ?? ''))
}

// How many orders share each PO — the job-history count shown on a row.
export function poCounts(orders) {
  const counts = {}
  for (const o of orders) {
    if (!o.poNumber) continue
    counts[o.poNumber] = (counts[o.poNumber] ?? 0) + 1
  }
  return counts
}

export function searchOrders(orders, criteria = {}) {
  const { sort = 'newest' } = criteria
  return (orders ?? []).filter((o) => matchesOrder(o, criteria)).sort(compare(sort))
}

// Distinct studios present, for the filter dropdown.
export function studiosIn(orders) {
  return [...new Set((orders ?? []).map((o) => o.studioId).filter(Boolean))].sort()
}

// Distinct photographers present, for the filter dropdown.
export function photographersIn(orders) {
  return [...new Set((orders ?? []).map((o) => o.photographer).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  )
}
