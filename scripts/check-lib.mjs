// Assertions over the PURE modules in src/lib, run by plain Node.
//
// Why this file exists: the app's logic deliberately lives in side-effect-free
// modules so it can be checked without a browser — but until now those checks
// lived in a scratchpad and vanished with the session, so they protected the
// change that prompted them and nothing after it. A rename that rewrote 69
// user-facing strings across 16 files is exactly the kind of edit that needs a
// net underneath it, so the net is committed now and runs in CI.
//
// Deliberately NOT a test framework: no dependency, no watch mode, no mocks.
// `npm run test:lib` either prints a count or fails loudly with the assertion
// that broke.
import assert from 'node:assert/strict'
import { pathToFileURL } from 'node:url'
import { resolve } from 'node:path'

const load = (p) => import(pathToFileURL(resolve(p)).href)
const [activity, scanning, orderSearch, estimate, estimatePdf, packingPdf, packing, itemAvail, years, orderStatus, setDays] =
  await Promise.all([
    load('src/lib/activity.js'),
    load('src/lib/scanning.js'),
    load('src/lib/orderSearch.js'),
    load('src/lib/estimate.js'),
    load('src/lib/estimatePdf.js'),
    load('src/lib/packingListPdf.js'),
    load('src/lib/packing.js'),
    load('src/lib/itemAvailability.js'),
    load('src/lib/years.js'),
    load('src/data/orderStatus.js'),
    load('src/lib/setDays.js'),
  ])

let n = 0
const ok = (c, label) => {
  n++
  assert.ok(c, label)
}
const eq = (a, b, label) => {
  n++
  assert.deepStrictEqual(a, b, `${label}\n  got:      ${JSON.stringify(a)}\n  expected: ${JSON.stringify(b)}`)
}

// ─────────────────────────────────────────────── the record is called a JOB
// The word the studio uses. The DB table, the event types and the state keys
// still say `order` on purpose — renaming those would break stored data — so
// these assertions pin the LABELS without touching the identifiers.
for (const [type, expected] of [
  [activity.EVENT.ORDER_CREATED, 'Created the job'],
  [activity.EVENT.ORDER_UPDATED, 'Edited the job'],
  [activity.EVENT.ORDER_CONFIRMED, 'Confirmed the job'],
  [activity.EVENT.ORDER_CLOSED, 'Closed the job'],
  [activity.EVENT.ORDER_REOPENED, 'Re-opened the job'],
  [activity.EVENT.ORDER_DELETED, 'Scrapped the job'],
]) {
  eq(activity.describeEvent({ type, data: {} }).title, expected, `${type} reads as a job`)
}
eq(activity.archiveKindLabel('order'), 'job', 'an archived job reads as a job')
ok(
  activity.describeEvent({ type: activity.EVENT.ARCHIVED, data: { what: 'order' } }).title.includes('job'),
  'and so does the archive event — the stored key stays "order" for old rows',
)
eq(activity.archiveKindLabel('booking'), 'shoot', 'a shoot is still a shoot')
for (const t of Object.values(activity.EVENT)) {
  const r = activity.describeEvent({ type: t, data: {} })
  ok(r?.title, `every event type still renders a title: ${t}`)
  ok(!/\border\b/i.test(r.title), `and none of them says "order": ${t}`)
}

const scanErr = (o) => scanning.resolveScan('0801', { order: o, expected: [], scans: [], direction: 'out' }).error
ok(/job/i.test(scanErr({ status: 'hold' })), 'the station refuses a job that is not confirmed, in those words')
ok(!/\border\b/i.test(scanErr({ status: 'hold' })), 'and does not say "order"')
ok(/job/i.test(scanErr(null)), 'nor when nothing is picked')

// ─────────────────────────────────────────────── brand + shoot type
const jobs = [
  { id: 'j1', jobName: 'Nike SS26', brand: 'Nike', jobType: 'Editorial', status: 'confirmed', studioId: '2', startsOn: '2026-09-10', endsOn: '2026-09-10' },
  { id: 'j2', jobName: 'H&M Basics', brand: 'H&M', jobType: 'PDP', status: 'hold', studioId: '1', startsOn: '2026-09-11', endsOn: '2026-09-11' },
  { id: 'j3', jobName: 'Zara drop', brand: 'Nike', jobType: 'PDP', status: 'confirmed', studioId: '2', startsOn: '2026-09-12', endsOn: '2026-09-12' },
  { id: 'j4', jobName: 'legacy', brand: null, jobType: null, status: 'confirmed', studioId: '3', startsOn: '2026-09-13', endsOn: '2026-09-13' },
]
const ids = (c) => orderSearch.searchOrders(jobs, c).map((o) => o.id).sort()
eq(ids({ brand: 'Nike' }), ['j1', 'j3'], 'brand filter')
eq(ids({ jobType: 'PDP' }), ['j2', 'j3'], 'shoot-type filter')
eq(ids({ brand: 'Nike', jobType: 'PDP' }), ['j3'], 'the two narrow together')
eq(ids({ brand: 'All', jobType: 'All' }), ['j1', 'j2', 'j3', 'j4'], '"All" filters nothing')
eq(ids({ text: 'nike editorial' }), ['j1'], 'free text spans brand and type — no field picker')
eq(ids({ brand: 'Nike', text: 'legacy' }), [], 'a job with no brand never matches a brand filter')
ok(orderSearch.searchOrders(jobs, { text: 'legacy' }).length === 1, 'but stays findable by name')
eq(orderSearch.brandsIn(jobs), ['H&M', 'Nike'], 'brand options: from the data, deduped, sorted')
eq(orderSearch.brandsIn([]), [], 'no jobs, no brands')
eq(orderSearch.jobTypesIn([]), ['Editorial', 'PDP'], 'the two asked-for types are offered from day one')
eq(orderSearch.jobTypesIn([{ jobType: 'Lookbook' }]), ['Editorial', 'PDP', 'Lookbook'], 'a new type joins')
eq(orderSearch.jobTypesIn([{ jobType: 'PDP' }]), ['Editorial', 'PDP'], 'and a used default is not duplicated')
// the studio stays OUT of free text: a bare "2" would match every 2026 date
eq(orderSearch.searchOrders(jobs, { text: 'studio' }).length, 0, 'studio is a dropdown, not a search term')

// ─────────────────────────────────────────────── the money and the documents
const inventory = [
  { id: 'i1', name: 'Profoto D2', kind: 'barcoded', dayRate: 90, units: [{ id: 'u1', barcode: '0801', serial: null }] },
  { id: 'i2', name: 'Gaffer tape', kind: 'non_barcoded', dayRate: null, quantity: 10 },
]
const job = {
  id: 'o1', number: 'CL-1', poNumber: 'PO-9', jobName: 'Nike SS26', setLabel: 'OMSet1',
  brand: 'Nike', jobType: 'Editorial', studioId: '2', status: 'confirmed',
  startsOn: '2026-09-10', endsOn: '2026-09-10', photographer: 'Ann Taylor',
  lines: [{ itemId: 'i1', quantity: 2 }, { itemId: 'i2', quantity: 3 }],
}
const booking = { id: 's1', unitIds: ['u1'], roster: [] }
const est = estimate.buildEstimate(job, { inventory })
eq(est.days, 1, 'a shoot is one day')
eq(est.total, 180, '2 x $90 x 1 day; the unrated line adds nothing')
eq(est.order.brand, 'Nike', 'the estimate carries the brand to both documents')
eq(est.order.jobType, 'Editorial', 'and the shoot type')
eq(estimate.billableDays('2026-09-10', '2026-09-12'), 3, 'a legacy span still bills inclusively')
eq(estimate.money(0), '$0.00', '$0 is a real price')

const bytes = (doc) => Buffer.from(doc.output('arraybuffer')).toString('latin1')
for (const [label, doc] of [
  ['estimate', estimatePdf.buildEstimatePdf(est, { booking })],
  ['pull sheet', packingPdf.buildPackingListPdf(est, { booking, inventory })],
]) {
  const t = bytes(doc)
  ok(t.includes('Kitbay'), `${label}: the letterhead is Kitbay`)
  ok(!t.includes('AnnTaylor'), `${label}: and not the old brand`)
  ok(t.includes('Job ref'), `${label}: the reference row says Job`)
  ok(!t.includes('Order ref'), `${label}: not Order`)
  ok(t.includes('Brand') && t.includes('Nike'), `${label}: prints the brand`)
  ok(t.includes('Type') && t.includes('Editorial'), `${label}: prints the shoot type`)
  ok(t.includes('OMSet1'), `${label}: and the Set the crew reads`)
  ok(doc.getNumberOfPages() >= 1, `${label}: builds`)
}
ok(!bytes(packingPdf.buildPackingListPdf(est, { booking, inventory })).includes('$'), 'a pull sheet carries no money')
ok(estimatePdf.estimateFileName(est).endsWith('.pdf'), 'estimate filename')
ok(packingPdf.packingListFileName(est.order).endsWith('.pdf'), 'pull-sheet filename')
ok(!packingPdf.packingListFileName({}).includes('order'), 'and a nameless job does not fall back to "order"')

// ─────────────────────────────────────────────── the rules that hold stock
eq(packing.PACKING_SLOTS, [packing.PACKED_SLOT], 'one tick per row')
{
  // 2 copies asked for, 1 actually reserved: a row for the copy, a row for the
  // shortfall (it must SAY it has no unit, not vanish off the sheet) and one
  // counted row for the tape.
  const rows = packing.packingRows(est, { inventory, booking }).flatMap((g) => g.lines)
  eq(rows.length, 3, 'one row per barcoded copy, plus the shortfall, plus counted stock')
  eq(rows.filter((r) => r.barcode).map((r) => r.barcode), ['0801'], 'the reserved copy carries its barcode')
  eq(rows.find((r) => r.why === 'counted stock')?.quantity, 3, 'counted stock stays one row with its quantity')
  ok(
    rows.some((r) => /reserv/i.test(r.why || '')),
    'and the piece with no unit behind it says so rather than disappearing',
  )
  eq(packing.packingProgress(rows, {}), { total: 3, packed: 0 }, 'nothing packed yet')
}
eq(itemAvail.covers({ from: '2026-09-06', to: '2026-09-15' }, '2026-09-10'), true, 'a span covers a day inside it')
eq(itemAvail.covers({ from: '2026-09-06' }, '2026-09-07'), false, 'a missing end is exactly one day')
eq(itemAvail.nextIso('2026-12-31'), '2027-01-01', 'the ISO stepper crosses a year')
ok(orderStatus.isClosedStatus('fulfilled'), 'fulfilled is closed')
ok(!orderStatus.isClosedStatus('confirmed'), 'confirmed is not')
{
  const ys = years.yearsFor(2026, new Date(Date.UTC(2027, 0, 15)))
  eq(ys[0], 2030, 'the year window slides with the calendar year')
  ok(ys.includes(2026), 'and always contains the year being viewed')
}

// ─────────────────────────────────────────────── a shoot can run several days
// The inclusive range is where off-by-ones live: a Wed→Fri shoot is 3 days, and
// it has to appear in 3 calendar cells and hold its gear on all 3.
eq(setDays.setDays('2026-09-09', '2026-09-11'), ['2026-09-09', '2026-09-10', '2026-09-11'], 'both ends are included')
eq(setDays.setDays('2026-09-09', '2026-09-09'), ['2026-09-09'], 'one day is one day')
eq(setDays.setDays('2026-09-09', ''), ['2026-09-09'], 'a missing end means one day')
eq(setDays.setDays('2026-09-09', '2026-09-01'), ['2026-09-09'], 'and a backwards range never books days before the start')
eq(setDays.setDays('', '2026-09-11'), [], 'no start, no shoot')
eq(setDays.setDays('2026-12-30', '2027-01-02').length, 4, 'the range crosses a year')
eq(setDays.setDays('2026-02-27', '2026-03-01').length, 3, 'and a month end')
eq(setDays.setSpanDays('2026-09-09', '2026-09-11'), 3, 'the span is the day count')
eq(
  setDays.setSpanDays('2026-09-09', '2026-09-11'),
  estimate.billableDays('2026-09-09', '2026-09-11'),
  'what a shoot occupies is what it bills — the two rules must agree',
)
eq(setDays.setDays('2026-01-01', '2030-01-01').length, setDays.MAX_SET_DAYS, 'a mistyped year is clamped, not rendered')
ok(setDays.coversDay('2026-09-09', '2026-09-11', '2026-09-10'), 'a middle day is covered')
ok(!setDays.coversDay('2026-09-09', '2026-09-11', '2026-09-12'), 'the day after is not')
ok(!setDays.coversDay('2026-09-09', '', '2026-09-10'), 'a one-day set covers only its own day')
ok(setDays.windowsOverlap({ from: '2026-09-09', to: '2026-09-11' }, { from: '2026-09-11' }), 'touching ranges overlap')
ok(!setDays.windowsOverlap({ from: '2026-09-09', to: '2026-09-10' }, { from: '2026-09-11' }), 'adjacent ones do not')
eq(setDays.endsOnFor('2026-09-09', ''), '2026-09-09', 'an empty end resolves to the start')
{
  // Capacity is per studio per DAY: a 3-day job must clear every day it covers,
  // and the caller has to be told WHICH day is full.
  const busy = { '2026-09-10': 5 }
  const countOn = (iso) => busy[iso] ?? 1
  eq(setDays.firstFullDay('2026-09-09', '2026-09-11', countOn, 5), '2026-09-10', 'names the full day inside the range')
  eq(setDays.firstFullDay('2026-09-09', '2026-09-09', countOn, 5), null, 'a day with room passes')
  eq(setDays.firstFullDay('2026-09-11', '2026-09-12', countOn, 5), null, 'and a range that misses it passes')
}
eq(setDays.spanLabel('2026-09-09', '2026-09-09'), 'Sep 9', 'one day reads as one date')
eq(setDays.spanLabel('2026-09-09', '2026-09-11'), 'Sep 9 – 11', 'a span inside one month says the month once')
eq(setDays.spanLabel('2026-09-29', '2026-10-01'), 'Sep 29 – Oct 1', 'across months it says both')
eq(setDays.spanSummary('2026-09-09', '2026-09-11'), '3 days · Sep 9 – 11', 'the summary leads with how long')
eq(setDays.spanSummary('2026-09-09', '2026-09-09'), 'Sep 9', 'and says nothing extra for one day')
{
  // The estimate and both documents follow the window, not the first day.
  const wide = { ...job, endsOn: '2026-09-12' }
  const e3 = estimate.buildEstimate(wide, { inventory })
  eq(e3.days, 3, 'three days on the job')
  eq(e3.total, 540, 'and the estimate bills all three')
  const t = bytes(packingPdf.buildPackingListPdf(e3, { booking, inventory }))
  ok(t.includes('Set dates'), 'the pull sheet says dates, plural, for a multi-day shoot')
  ok(t.includes('2026-09-10') || t.includes('to  2026-09-12') || t.includes('2026-09-12'), 'and prints the window')
}

console.log(`OK — ${n} assertions passed`)
