// Estimate builder (epic #5, 5.4).
//
// Pure functions: order + inventory + the set it equips in, a printable estimate
// out. Keeping this free of React and of jsPDF means the same numbers feed the
// on-screen estimate and the PDF, and both can be tested in Node.
//
// Money model: an item has a `dayRate`; the estimate charges
// quantity × dayRate × billable days. Items with no rate (stock that is used up) are listed
// but contribute 0 and are counted so the UI can say so out loud rather than
// quietly understating the total.

// Billable days are inclusive: a single-day job bills 1, Mon→Wed bills 3.
export function billableDays(startsOn, endsOn) {
  if (!startsOn) return 1
  if (!endsOn || endsOn === startsOn) return 1
  const from = Date.parse(`${startsOn}T00:00:00Z`)
  const to = Date.parse(`${endsOn}T00:00:00Z`)
  if (!Number.isFinite(from) || !Number.isFinite(to) || to < from) return 1
  return Math.round((to - from) / 86400000) + 1
}

export const money = (n) =>
  `$${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

// Roster for the set an order equips. Supabase and local mode both expose the
// photographer/model on the booking; the order's own photographer wins when the
// two disagree (it's the field the order form actually wrote).
export function rosterFor(order, booking) {
  const roster = []
  const photographer = order?.photographer || booking?.photographer
  if (photographer) roster.push({ role: 'Photographer', name: photographer })
  if (booking?.model) roster.push({ role: 'Model', name: booking.model })
  return roster
}

// Group an order's lines: one group per kit (in first-seen order), then the
// a-la-carte lines. Mirrors how the booking modal shows staged kits.
function groupLines(lines, kitsById) {
  const groups = []
  const byKit = new Map()
  const alaCarte = []

  for (const line of lines) {
    if (line.kitId) {
      if (!byKit.has(line.kitId)) {
        const group = {
          type: 'kit',
          kitId: line.kitId,
          name: kitsById[line.kitId]?.name ?? 'Kit',
          lines: [],
        }
        byKit.set(line.kitId, group)
        groups.push(group)
      }
      byKit.get(line.kitId).lines.push(line)
    } else {
      alaCarte.push(line)
    }
  }
  if (alaCarte.length)
    groups.push({ type: 'items', kitId: null, name: 'A-la-carte', lines: alaCarte })
  return groups
}

// Build the estimate. `inventory` supplies names and day rates so a line stays
// correct even if it was saved before a rate existed.
export function buildEstimate(order, { inventory = [], kits = [], booking = null } = {}) {
  const itemsById = Object.fromEntries(inventory.map((i) => [i.id, i]))
  const kitsById = Object.fromEntries(kits.map((k) => [k.id, k]))
  const days = billableDays(order?.startsOn, order?.endsOn)

  const priced = (order?.lines ?? []).map((l) => {
    const item = itemsById[l.itemId] ?? null
    const rate = l.dayRate ?? item?.dayRate ?? null
    const quantity = Math.max(1, Number(l.quantity) || 1)
    return {
      ...l,
      quantity,
      itemName: l.itemName ?? item?.name ?? 'Item',
      dayRate: rate,
      lineTotal: rate == null ? 0 : rate * quantity * days,
    }
  })

  const groups = groupLines(priced, kitsById).map((g) => ({
    ...g,
    subtotal: g.lines.reduce((n, l) => n + l.lineTotal, 0),
    pieces: g.lines.reduce((n, l) => n + l.quantity, 0),
  }))

  const unratedLines = priced.filter((l) => l.dayRate == null)

  return {
    order: {
      id: order?.id ?? null,
      jobName: order?.jobName ?? order?.setTitle ?? 'Untitled job',
      poNumber: order?.poNumber ?? null,
      setLabel: order?.setLabel ?? null,
      number: order?.number ?? null,
      status: order?.status ?? 'hold',
      studioId: order?.studioId ?? null,
      startsOn: order?.startsOn ?? null,
      endsOn: order?.endsOn ?? null,
      photographer: order?.photographer ?? null,
      companyName: order?.companyName ?? null,
      createdBy: order?.createdBy ?? null,
      createdAt: order?.createdAt ?? null,
    },
    days,
    groups,
    roster: rosterFor(order, booking),
    lineCount: priced.length,
    pieces: priced.reduce((n, l) => n + l.quantity, 0),
    total: priced.reduce((n, l) => n + l.lineTotal, 0),
    unratedCount: unratedLines.length,
    unratedNames: unratedLines.map((l) => l.itemName),
  }
}
