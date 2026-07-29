// Work-history / usage seed (Build order #2, 2.7).
//
// Generates a year of deterministic usage events per item so the work-history
// view and its aggregate counters look real from the first load. Barcoded gear
// is used 1–2 at a time; non-barcoded stock is drawn down in bulk
// (that's what powers "N J-hooks used this year").

// (jobTitle, studioId) pool — believable studio jobs the gear gets used on.
const JOBS = [
  ['20260624_AT_MAIN_SepBOM_Missy_OMSet1', '1'],
  ['20260629_AT_MAIN_SepBOM_Missy_OMSet1', '3'],
  ['20260630_AT_MAIN_SepBOM_Missy_OMSet1', '2'],
  ['20260630_AT_MAIN_SepBOM_Missy_OMSet2', 'L'],
  ['20260706_AT_MAIN_SepBOM_Missy_OMSet1', '4'],
  ['20260716_AT_MAIN_SepMM_Missy_OMSet1', 'L'],
  ['20260629_AT_MAIN_SepBOM_Missy_OMSet2', '5'],
  ['20260625_AT_MAIN_SepBOM_Missy_OMSet1', '2'],
  ['20260715_AT_MAIN_SepMM_Missy_OMSet1', '3'],
  ['20260701_AT_MAIN_SepBOM_Missy_OMSet1', '1'],
  ['20260701_AT_MAIN_SepBOM_Missy_SLSet1', 'L'],
  ['20260720_AT_MAIN_SepMM_Missy_OMSet1', '2'],
  ['20260701_AT_MAIN_SepBOM_Missy_SLSet1', '5'],
  ['20260720_AT_MAIN_SepMM_Missy_OMSet1', '4'],
  ['20260701_AT_MAIN_SepBOM_Missy_SLSet1', '3'],
]

// [itemId, eventsPerYear, [minQty, maxQty]]
const USAGE_PROFILES = [
  // Non-barcoded — high volume
  ['j-hook-2', 15, [4, 14]],
  ['safety-cable', 12, [3, 10]],
  // Expendable stock — drawn down every job
  ['gaff-tape', 22, [1, 4]],
  ['aa-batteries', 24, [4, 16]],
  // Barcoded — a representative selection, 1–4 units per job
  ['kbd-magic', 16, [1, 3]],
  ['mouse-magic', 14, [1, 3]],
  ['macbook-16', 12, [1, 2]],
  ['sony-fx6', 10, [1, 1]],
  ['canon-r5', 9, [1, 1]],
  ['sony-2470', 10, [1, 1]],
  ['aputure-600d', 11, [1, 2]],
  ['arri-2k', 8, [1, 2]],
  ['cstand-40', 18, [2, 4]],
  ['sandbag-25', 20, [2, 6]],
  ['quasar-4ft', 10, [2, 4]],
  ['zoom-h6', 7, [1, 1]],
  ['director-chair', 11, [2, 4]],
  ['smallhd-702', 6, [1, 1]],
]

// Deterministic pseudo-random in [0,1) from an integer seed (FNV-ish).
function rng(seed) {
  let h = (2166136261 ^ seed) >>> 0
  h = Math.imul(h, 16777619)
  h ^= h >>> 13
  h = Math.imul(h, 16777619)
  return ((h >>> 0) % 100000) / 100000
}

// Build usage events per item over the past ~year. `isoFor` formats a Date to
// an ISO day string. Returns { itemId: [{ jobTitle, studioId, quantity, usedOn }] }
// with each list sorted newest-first.
export function generateUsage(today, isoFor) {
  const byItem = {}
  USAGE_PROFILES.forEach(([itemId, count, [qMin, qMax]], pi) => {
    const events = []
    for (let i = 0; i < count; i++) {
      const s = pi * 1000 + i
      const dayOffset = 3 + Math.floor(rng(s) * 360) // 3..363 days ago
      const job = JOBS[Math.floor(rng(s + 7) * JOBS.length)]
      const quantity = qMin + Math.floor(rng(s + 13) * (qMax - qMin + 1))
      const used = new Date(today.getTime() - dayOffset * 86400000)
      events.push({ jobTitle: job[0], studioId: job[1], quantity, usedOn: isoFor(used) })
    }
    events.sort((a, b) => (a.usedOn < b.usedOn ? 1 : -1))
    byItem[itemId] = events
  })
  return byItem
}

// Aggregate counters for the work-history view. `events` newest-first.
export function usageSummary(events = [], today = new Date()) {
  const totalQty = events.reduce((n, e) => n + (e.quantity || 0), 0)
  const yearAgo = today.getTime() - 365 * 86400000
  const last12 = events
    .filter((e) => Date.parse(e.usedOn) >= yearAgo)
    .reduce((n, e) => n + (e.quantity || 0), 0)
  return {
    totalQty,
    last12,
    jobCount: events.length,
    lastUsedOn: events[0]?.usedOn || null,
  }
}
