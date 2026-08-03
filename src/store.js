import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { startOfWeek, addDays, format } from 'date-fns'
import { STUDIOS, studioLabel } from './data/studios'
import { INVENTORY_SEED, createUnits, serialFor } from './data/inventory'
import { REPAIR_TEMPLATES, repairDates } from './data/repairs'
import { generateUsage } from './data/usage'
import { KIT_SEED } from './data/kits'
import { SCENARIO_SEED } from './data/scenarios'
import { BOOKING_TEMPLATES } from './data/bookings'
import { PHOTOGRAPHERS, MODELS } from './data/contacts'
import { PEOPLE_SEED, COMPANY_SEED, COMPANY_TYPES } from './data/people'
import { ORDER_SEED, SUB_RENTAL_VENDORS } from './data/orders'
import {
  usingSupabase,
  getInventory as sbGetInventory,
  getBookings as sbGetBookings,
  getKits as sbGetKits,
  getScenarioLists as sbGetScenarioLists,
  createBooking as sbCreateBooking,
  updateBooking as sbUpdateBooking,
  archiveBooking as sbArchiveBooking,
  restoreBooking as sbRestoreBooking,
  toggleOwnership as sbToggleOwnership,
  setUnitBarcode as sbSetUnitBarcode,
  setReservationsForSet as sbSetReservationsForSet,
  markSetReturned as sbMarkSetReturned,
  logScan as sbLogScan,
  setSetUnitStatus as sbSetSetUnitStatus,
  logEvent as sbLogEvent,
  getEvents as sbGetEvents,
  getEventsForUnits as sbGetEventsForUnits,
  touchOrderEquipment as sbTouchOrderEquipment,
  addUnits as sbAddUnits,
  updateUnit as sbUpdateUnit,
  archiveUnit as sbArchiveUnit,
  restoreUnit as sbRestoreUnit,
  sendToRepair as sbSendToRepair,
  returnFromRepair as sbReturnFromRepair,
  logItemUsage as sbLogItemUsage,
  addInventoryItem as sbAddInventoryItem,
  updateInventoryItem as sbUpdateInventoryItem,
  archiveInventoryItem as sbArchiveInventoryItem,
  restoreInventoryItem as sbRestoreInventoryItem,
  createKit as sbCreateKit,
  updateKit as sbUpdateKit,
  archiveKit as sbArchiveKit,
  restoreKit as sbRestoreKit,
  createScenarioList as sbCreateScenarioList,
  updateScenarioList as sbUpdateScenarioList,
  archiveScenarioList as sbArchiveScenarioList,
  restoreScenarioList as sbRestoreScenarioList,
  getPeople as sbGetPeople,
  getCompanies as sbGetCompanies,
  createPerson as sbCreatePerson,
  updatePerson as sbUpdatePerson,
  archivePerson as sbArchivePerson,
  restorePerson as sbRestorePerson,
  createCompany as sbCreateCompany,
  updateCompany as sbUpdateCompany,
  archiveCompany as sbArchiveCompany,
  restoreCompany as sbRestoreCompany,
  getCompanyTypes as sbGetCompanyTypes,
  createCompanyType as sbCreateCompanyType,
  renameCompanyType as sbRenameCompanyType,
  archiveCompanyType as sbArchiveCompanyType,
  restoreCompanyType as sbRestoreCompanyType,
  getOrders as sbGetOrders,
  setUnitVendor as sbSetUnitVendor,
  createOrder as sbCreateOrder,
  updateOrder as sbUpdateOrder,
  archiveOrder as sbArchiveOrder,
  restoreOrder as sbRestoreOrder,
  createSetForOrder as sbCreateSetForOrder,
  countSetsOn as sbCountSetsOn,
  setOrderLines as sbSetOrderLines,
  setPackingSignoff as sbSetPackingSignoff,
  clearPackingSignoff as sbClearPackingSignoff,
} from './data/repository'
import { supabase } from './lib/supabase'
import { reservedUnitsForOrder, overlaps } from './lib/availability'
import { isClosedStatus } from './data/orderStatus'
import { SCAN_OUT, SCAN_IN, expectedUnits, resolveScan } from './lib/scanning'
import { EVENT, diffOrderLines } from './lib/activity'

const STORAGE_KEY = 'anntaylor-rental-demo'

// Local demo mode has no auth, so activity is attributed to the machine's user.
const LOCAL_ACTOR = 'Demo user'

// The flat archivable types: which collection holds them, how to name one in the
// feed, and the repository calls. Anything with side effects (orders release
// gear, items take their units) has its own action instead.
const ARCHIVABLE = {
  kit: { list: 'kits', name: (r) => r.name, archive: sbArchiveKit, restore: sbRestoreKit },
  scenario: {
    list: 'scenarios',
    name: (r) => r.name,
    archive: sbArchiveScenarioList,
    restore: sbRestoreScenarioList,
  },
  person: { list: 'people', name: (r) => r.name, archive: sbArchivePerson, restore: sbRestorePerson },
  company: {
    list: 'companies',
    name: (r) => r.name,
    archive: sbArchiveCompany,
    restore: sbRestoreCompany,
  },
  companyType: {
    list: 'companyTypes',
    name: (r) => r.name,
    archive: sbArchiveCompanyType,
    restore: sbRestoreCompanyType,
  },
}

// Is this record archived? One predicate so every filter reads the same.
export const isArchived = (r) => !!r?.archivedAt
export const notArchived = (r) => !r?.archivedAt

// Build a fresh copy of the seeded data: clone the inventory, resolve booking
// dates to the current week, and reserve units (status -> checked_out,
// location -> set name) for each booking.
function buildSeedData() {
  const inventory = structuredClone(INVENTORY_SEED)
  for (const item of inventory) for (const u of item.units) u.repairs = []
  const byId = Object.fromEntries(inventory.map((item) => [item.id, item]))
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })

  // Work-history / usage seeds (attach a year of usage events per item).
  const usageByItem = generateUsage(new Date(), (d) => format(d, 'yyyy-MM-dd'))
  for (const item of inventory) item.usage = usageByItem[item.id] || []

  // Repair-log seeds first: an OPEN repair marks the unit 'in_repair' so the
  // booking loop below skips it (a unit out for repair can't be reserved).
  const today = new Date()
  const isoFor = (d) => format(d, 'yyyy-MM-dd')
  for (const t of REPAIR_TEMPLATES) {
    const unit = byId[t.itemId]?.units[t.unitIndex]
    if (!unit) continue
    const { sentAt, returnedAt } = repairDates(t, today, isoFor)
    unit.repairs.unshift({
      id: `rep-${t.itemId}-${t.unitIndex}`,
      vendor: t.vendor,
      issue: t.issue,
      sentAt,
      returnedAt,
      resolution: t.resolution,
    })
    if (!returnedAt) {
      unit.status = 'in_repair'
      unit.location = `In repair — ${t.vendor || 'Vendor'}`
    }
  }

  // Sets (studio-calendar shoots). Gear is NO LONGER reserved here — a Set's
  // reserved units derive from its CONFIRMED order's in-house lines further down
  // (reservationsFromOrders), so inventory and orders can't disagree. Bookings
  // start with no units; `orderId` links back to the driving order once built.
  const bookings = BOOKING_TEMPLATES.map((t, idx) => ({
    id: `set-${String(idx + 1).padStart(3, '0')}`,
    title: t.title,
    studioId: t.studioId,
    date: format(addDays(weekStart, t.dayOffset), 'yyyy-MM-dd'),
    startTime: t.startTime,
    endTime: t.endTime,
    photographer: t.photographer,
    model: t.model,
    unitIds: [],
    orderId: null,
    status: 'active',
    color: t.color,
  }))

  // Kits (entry type #2): resolve each slot's component item for display.
  const kits = KIT_SEED.map((k) => ({
    id: k.id,
    name: k.name,
    category: k.category,
    notes: k.notes,
    slots: k.slots.map((s, i) => {
      const it = byId[s.itemId]
      // FIXED slots pin one specific unit (by its index within the item);
      // GENERIC slots leave the concrete unit unassigned (scanned at pull time).
      const fixedUnit =
        s.slotType === 'fixed' && it ? it.units[s.fixedUnitIndex ?? 0] || null : null
      return {
        id: `${k.id}-slot-${i}`,
        label: s.label,
        position: i,
        slotType: s.slotType || 'generic',
        itemId: s.itemId,
        itemName: it?.name || null,
        itemCategory: it?.category || null,
        itemKind: it?.kind || null,
        fixedUnitId: fixedUnit?.id || null,
        fixedBarcode: fixedUnit?.barcode || null,
      }
    }),
  }))

  // Predefined scenario lists (3.5): resolve each entry to its item or kit so
  // the UI can show names/availability without another lookup.
  const kitById = Object.fromEntries(kits.map((k) => [k.id, k]))
  const scenarios = SCENARIO_SEED.map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    notes: l.notes,
    entries: l.entries.map((e, i) => {
      const kit = e.kit ? kitById[e.kit] : null
      const item = e.item ? byId[e.item] : null
      return {
        id: `${l.id}-entry-${i}`,
        type: e.kit ? 'kit' : 'item',
        quantity: e.kit ? 1 : (e.qty ?? 1),
        position: i,
        note: e.note || null,
        itemId: item?.id || null,
        itemName: item?.name || null,
        itemKind: item?.kind || null,
        kitId: kit?.id || null,
        kitName: kit?.name || null,
      }
    }),
  }))

  // People & companies (4.1/4.2). Seed people carry a company slug; jobs are
  // derived from the bookings that name them.
  const companies = COMPANY_SEED.map((c) => ({
    id: c.id,
    name: c.name,
    kind: c.kind ?? 'client',
    companyType: c.companyType ?? null,
    notes: c.notes ?? null,
    // 4.3 — contact block shown on the company card.
    address: c.address ?? null,
    openingHours: c.openingHours ?? null,
    website: c.website ?? null,
    email: c.email ?? null,
    phone: c.phone ?? null,
  }))
  const people = PEOPLE_SEED.map((p, i) =>
    resolvePerson(
      { ...p, id: p.id ?? `person-${i}`, companyId: p.company ?? null },
      companies,
      bookings,
    ),
  ).sort((a, b) => a.name.localeCompare(b.name))

  // 4.4 — the editable Type option list starts from the base set.
  const companyTypes = COMPANY_TYPES.map((name, i) => ({ id: `type-${i}`, name, position: i }))

  // 4.5 — attribute sub-rented units to the vendor they came from, so a company
  // card can list the gear we currently hold from it. Only items with a known
  // vendor are attributed: the rest stay unattributed rather than being dumped on
  // whichever vendor happens to be first, which would put keyboards on a lighting
  // house's card.
  for (const item of inventory) {
    const vendorId = SUB_RENTAL_VENDORS[item.id] ?? null
    for (const u of item.units || []) {
      if (u.ownership !== 'sub_rental') continue
      u.subRentalVendorId = vendorId
    }
  }

  // Orders (4.5 history + epics #5/#6). The linked booking is the Set and its
  // title is the Job name, so studio / dates / photographer come from it. Line
  // form in the seed:
  //   [itemId, qty]                  → in-house line (our stock)
  //   [itemId, qty, vendorCompanyId] → sub-rental from that vendor (reserves none)
  const bookingByTitle = Object.fromEntries(bookings.map((b) => [b.title, b]))
  const orders = ORDER_SEED.map((o, i) => {
    const set = o.setTitle ? bookingByTitle[o.setTitle] : null
    const orderedAt = format(addDays(weekStart, o.dayOffset), 'yyyy-MM-dd')
    return {
      id: `order-${i}`,
      number: o.number,
      poNumber: o.po ?? null,
      // DEMO CONTENT ONLY. The field is hand-typed by the crew; the studio's job
      // names happen to end in their set designation (…_OMSet1), so the seed
      // takes it from there instead of repeating it in every seed row.
      setLabel: setLabelFromJobName(o.setTitle),
      status: o.status,
      kind: o.kind,
      orderedAt,
      jobName: set?.title ?? o.setTitle ?? null,
      studioId: set?.studioId ?? null,
      startsOn: set?.date ?? orderedAt,
      endsOn: set?.date ?? orderedAt,
      photographer: set?.photographer ?? null,
      photographerId: null,
      createdBy: 'Ann Taylor',
      createdAt: orderedAt,
      companyId: o.company,
      companyName: companies.find((c) => c.id === o.company)?.name ?? null,
      setId: set?.id ?? null,
      setTitle: set?.title ?? o.setTitle ?? null,
      packing: {}, // digital packing checklist sign-offs (6.2 / 6.5), by lineKey
      scans: [], // scan-out / scan-in log (epic #6) — filled at the station
      lines: o.lines.map(([itemId, quantity, vendorId], li) => {
        const source = vendorId ? 'sub_rental' : 'in_house'
        return {
          id: `line-order-${i}-${li}`,
          itemId,
          itemName: byId[itemId]?.name ?? null,
          quantity,
          dayRate: byId[itemId]?.dayRate ?? null,
          kitId: null,
          unitId: null,
          barcode: null,
          slotLabel: null,
          source,
          vendorId: source === 'sub_rental' ? vendorId : null,
          vendorName:
            source === 'sub_rental' ? companies.find((c) => c.id === vendorId)?.name ?? null : null,
        }
      }),
    }
  })

  // Link each Set back to its driving CLIENT order (sub-rental history orders
  // reference the Set for context but don't own it). First client order wins.
  for (const o of orders) {
    if (o.kind !== 'client' || !o.setId) continue
    const b = bookings.find((x) => x.id === o.setId)
    if (b && !b.orderId) b.orderId = o.id
  }

  // "Orders drive reservations": assign each order-linked Set the units its
  // CONFIRMED order reserves, then project status/location onto inventory. Fixed
  // kit units are pre-claimed so a loose line never grabs a unit pinned to a kit.
  const reservedBookings = reservationsFromOrders(bookings, orders, inventory, fixedUnitIdsOf(kits))
  const reservedInventory = withReservations(inventory, reservedBookings)
  orders.sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1))

  return {
    inventory: reservedInventory,
    bookings: reservedBookings,
    kits,
    scenarios,
    people,
    companies,
    companyTypes,
    orders,
  }
}

// The trailing segment of a job name in the studio's convention
// (20260716_AT_MAIN_SepMM_Missy_OMSet1 → OMSet1). Seed use only: a real order's
// Set is whatever the crew typed into the field.
function setLabelFromJobName(title) {
  const parts = String(title || '').split('_')
  return parts.length > 1 ? parts[parts.length - 1] : null
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  )
}

// First free id of the form base, base-2, base-3… (local mode only; Supabase
// hands out uuids).
function uniqueId(base, existing) {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

const trimmed = (v) => (typeof v === 'string' ? v.trim() || null : v || null)

// Resolve an authored kit (3.6) into the shape the UI reads: component names
// plus, for FIXED slots, the pinned unit's barcode. Accepts either editor slots
// ({ itemId, label, slotType, fixedUnitId }) or already-resolved ones, so it can
// re-resolve a kit after an edit. A slot whose pinned unit can't be found
// degrades to GENERIC — mirroring the DB check constraint.
function resolveKit(kit, inventory) {
  const byId = Object.fromEntries(inventory.map((i) => [i.id, i]))
  return {
    id: kit.id,
    name: kit.name,
    category: trimmed(kit.category),
    notes: trimmed(kit.notes),
    slots: (kit.slots || [])
      .filter((s) => s.itemId)
      .map((s, i) => {
        const it = byId[s.itemId]
        const fixedUnit =
          s.slotType === 'fixed' && s.fixedUnitId
            ? (it?.units || []).find((u) => u.id === s.fixedUnitId) || null
            : null
        return {
          id: s.id || `${kit.id}-slot-${i}`,
          label: trimmed(s.label),
          position: i,
          slotType: fixedUnit ? 'fixed' : 'generic',
          itemId: s.itemId,
          itemName: it?.name || null,
          itemCategory: it?.category || null,
          itemKind: it?.kind || null,
          fixedUnitId: fixedUnit?.id || null,
          fixedBarcode: fixedUnit?.barcode || null,
        }
      }),
  }
}

// Same for an authored scenario list (3.6). Kit entries are always quantity 1
// (a kit is staged one at a time), matching the DB constraint.
function resolveScenario(list, inventory, kits) {
  const byId = Object.fromEntries(inventory.map((i) => [i.id, i]))
  const kitById = Object.fromEntries(kits.map((k) => [k.id, k]))
  return {
    id: list.id,
    name: list.name,
    category: trimmed(list.category),
    notes: trimmed(list.notes),
    entries: (list.entries || [])
      .filter((e) => (e.type === 'kit' ? e.kitId : e.itemId))
      .map((e, i) => {
        const isKit = e.type === 'kit'
        const kit = isKit ? kitById[e.kitId] : null
        const item = isKit ? null : byId[e.itemId]
        return {
          id: e.id || `${list.id}-entry-${i}`,
          type: isKit ? 'kit' : 'item',
          quantity: isKit ? 1 : Math.max(1, Number(e.quantity) || 1),
          position: i,
          note: trimmed(e.note),
          itemId: item?.id || null,
          itemName: item?.name || null,
          itemKind: item?.kind || null,
          kitId: kit?.id || null,
          kitName: kit?.name || null,
        }
      }),
  }
}

// A studio runs at most this many shoots a day (epic #5 terminology: Sets).
export const MAX_SETS_PER_DAY = 5

// Normalize an authored order (5.1/5.2) into the shape the UI reads. `createdBy`
// is set here for local mode only; in Supabase mode the DB fills created_by from
// auth.uid() and hydrate() reads the profile name back.
function resolveOrder(o, companies) {
  const startsOn = o.startsOn || o.orderedAt || null
  return {
    id: o.id,
    number: trimmed(o.number),
    poNumber: trimmed(o.poNumber),
    setLabel: trimmed(o.setLabel),
    status: o.status || 'hold',
    kind: o.kind || 'client',
    orderedAt: startsOn,
    jobName: trimmed(o.jobName),
    studioId: o.studioId || null,
    startsOn,
    endsOn: o.endsOn || startsOn,
    photographer: trimmed(o.photographer),
    photographerId: o.photographerId || null,
    createdBy: o.createdBy ?? 'You',
    createdAt: o.createdAt ?? format(new Date(), 'yyyy-MM-dd'),
    companyId: o.companyId || null,
    companyName: companies.find((c) => c.id === o.companyId)?.name ?? null,
    setId: o.setId || null,
    setTitle: trimmed(o.setTitle) ?? trimmed(o.jobName),
    lines: o.lines || [],
  }
}

// Normalize an authored company (4.3) into the shape the UI reads.
function resolveCompany(c) {
  return {
    id: c.id,
    name: c.name.trim(),
    kind: c.kind || 'client',
    companyType: trimmed(c.companyType),
    notes: trimmed(c.notes),
    address: trimmed(c.address),
    openingHours: trimmed(c.openingHours),
    website: trimmed(c.website),
    email: trimmed(c.email),
    phone: trimmed(c.phone),
  }
}

// Resolve a person (4.1/4.2) into the shape the UI reads: the company name for
// the hyperlink plus their job history. In Supabase mode history comes from
// roster_entries; locally a booking's photographer/model fields are plain names,
// so the person's jobs are the bookings that name them.
function resolvePerson(person, companies, bookings) {
  const company = companies.find((c) => c.id === person.companyId) || null
  const jobs = (bookings || [])
    .map((b) => {
      const role =
        b.photographer === person.name ? 'photographer' : b.model === person.name ? 'model' : null
      return role
        ? {
            id: b.id,
            title: b.title,
            date: b.date,
            studioId: b.studioId,
            status: b.status,
            role,
          }
        : null
    })
    .filter(Boolean)
    .sort((a, b) => (a.date < b.date ? 1 : -1))
  return {
    id: person.id,
    name: person.name,
    email: trimmed(person.email),
    phone: trimmed(person.phone),
    notes: trimmed(person.notes),
    category: trimmed(person.category),
    subcategory: trimmed(person.subcategory),
    website: trimmed(person.website),
    instagram: trimmed(person.instagram),
    cvUrl: trimmed(person.cvUrl),
    cvFilename: trimmed(person.cvFilename),
    companyId: company?.id ?? null,
    companyName: company?.name ?? null,
    jobs,
  }
}

// Default chip colors cycled through for newly created bookings.
const BOOKING_COLORS = [
  '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6',
  '#14b8a6', '#f43f5e', '#06b6d4', '#6366f1', '#f97316',
]

// Map each reserved unit id -> the location label of the (first) active
// booking that reserves it.
function reservationMap(bookings) {
  const map = new Map()
  for (const b of bookings) {
    if (b.status !== 'active' || b.unitsReturned) continue
    const location = `${b.title} — ${studioLabel(b.studioId)}`
    for (const uid of b.unitIds) if (!map.has(uid)) map.set(uid, location)
  }
  return map
}

// Map each reserved unit id -> every shoot holding it, WITH DATES. Gear is
// committed per day, so a picker asking about the 31st has to know that the
// camera's only commitment is on the 30th. Supabase mode reads the same shape
// off set_units (reserved_from/reserved_to); local bookings are single-day.
function reservationWindows(bookings) {
  const map = new Map()
  for (const b of bookings) {
    // A closed set's gear is back on the shelf: it blocks no dates.
    if (b.status !== 'active' || b.unitsReturned) continue
    const entry = {
      setId: b.id,
      setTitle: b.title,
      studioId: b.studioId,
      from: b.date,
      to: b.date,
    }
    for (const uid of b.unitIds || []) {
      const list = map.get(uid)
      if (list) list.push(entry)
      else map.set(uid, [entry])
    }
  }
  return map
}

// The unit's currently-open repair (no return date), if any.
function openRepairOf(unit) {
  return (unit.repairs || []).find((r) => !r.returnedAt) || null
}

// Recompute every unit's status/location from the active bookings + repairs.
// Precedence: an open repair (unbookable) wins over a reservation, which wins
// over free. Units not reserved by any active booking are freed. Ownership is
// left untouched.
//
// `status`/`location` answer "where is this copy" — they're what the inventory
// table shows. `reservations` answers "which days is it committed", which is what
// every picker asks, since the same copy can be out today and free tomorrow.
function withReservations(inventory, bookings) {
  const map = reservationMap(bookings)
  const windows = reservationWindows(bookings)
  return inventory.map((item) => ({
    ...item,
    units: item.units.map((u) => {
      const reservations = windows.get(u.id) || []
      const repair = openRepairOf(u)
      if (repair) {
        const location = `In repair — ${repair.vendor || 'Vendor'}`
        return { ...u, status: 'in_repair', location, reservations }
      }
      const location = map.get(u.id)
      if (location) return { ...u, status: 'checked_out', location, reservations }
      return { ...u, status: 'available', location: 'Available', reservations }
    }),
  }))
}

// Unit ids pinned to a kit's FIXED slots. These are physically dedicated to
// their kit (bolted to the cart), so an order's loose quantity line must never
// reserve them.
function fixedUnitIdsOf(kits) {
  const ids = []
  for (const k of kits || [])
    for (const s of k.slots || []) if (s.fixedUnitId) ids.push(s.fixedUnitId)
  return ids
}

// "Orders drive reservations" (epic #6 fix): give every order-linked Set the
// units its CONFIRMED order reserves. A Set referenced by no order keeps its own
// unitIds (a hand-made calendar booking). Resolution runs against a RAW
// availability view — repairs + fixed kit pins only — NOT the live checked-out
// projection, since that projection is exactly what we're recomputing.
//
// Two orders must never take the same unit ON THE SAME DAYS — but on different
// days they should, since the gear comes back at the end of each shoot. So claims
// are recorded WITH their window and only the overlapping ones are held against
// the order being resolved. Fixed kit pins are dateless: they're dedicated to
// their kit, so they're claimed for every window.
function reservationsFromOrders(bookings, orders, inventory, fixedUnitIds = []) {
  const rawInventory = inventory.map((item) => ({
    ...item,
    units: (item.units || []).map((u) =>
      (u.repairs || []).some((r) => !r.returnedAt)
        ? { ...u, status: 'in_repair', reservations: [] }
        : { ...u, status: 'available', location: 'Available', reservations: [] },
    ),
  }))
  const pinned = new Set(fixedUnitIds)
  // unitId -> windows already taken by an earlier order in this pass.
  const claims = new Map()
  const bySet = new Map()
  const orderedSets = new Set()
  // A CLOSED order's gear came back: it holds nothing, but the set keeps the
  // units it went out with — that list IS the unit's job history.
  const closedSets = new Set()
  const confirmed = (orders || []).filter(
    (o) => !o.archivedAt && o.status === 'confirmed',
  )
  for (const o of orders || []) {
    if (!o.setId) continue
    orderedSets.add(o.setId)
    if (!o.archivedAt && isClosedStatus(o.status)) closedSets.add(o.setId)
  }
  for (const o of confirmed) {
    const window = { from: o.startsOn || null, to: o.endsOn || o.startsOn || null }
    const namedUnits = new Set((o.lines || []).map((l) => l.unitId).filter(Boolean))
    const claimed = new Set([...pinned].filter((id) => !namedUnits.has(id)))
    for (const [unitId, windows] of claims) {
      // No window on either side means "we can't tell them apart" — hold it, so
      // a dateless order can't silently share gear.
      if (windows.some((w) => (!w.from || !window.from ? true : overlaps(w, window))))
        claimed.add(unitId)
    }
    const ids = reservedUnitsForOrder(o, rawInventory, claimed)
    for (const id of ids) {
      const list = claims.get(id)
      if (list) list.push(window)
      else claims.set(id, [window])
    }
    if (!o.setId) continue
    bySet.set(o.setId, (bySet.get(o.setId) || []).concat(ids))
  }
  return bookings.map((b) => {
    if (bySet.has(b.id)) return { ...b, unitIds: bySet.get(b.id), unitsReturned: false }
    // Keep the gear on a closed set, flagged as back — history without a hold.
    if (closedSets.has(b.id)) return { ...b, unitsReturned: true }
    if (orderedSets.has(b.id)) return { ...b, unitIds: [], unitsReturned: false }
    return b
  })
}

export const useStore = create(
  persist(
    (set, get) => ({
      // --- static reference data ---
      studios: STUDIOS,
      photographers: PHOTOGRAPHERS,
      models: MODELS,

      // --- data ---
      // Local mode: seeded synchronously. Supabase mode: starts empty and is
      // filled by hydrate() when the app mounts.
      ...(usingSupabase
        ? {
            inventory: [],
            bookings: [],
            kits: [],
            scenarios: [],
            people: [],
            companies: [],
            companyTypes: [],
            orders: [],
            loading: true,
          }
        : { ...buildSeedData(), loading: false }),

      // Fetch inventory + bookings + kits + scenario lists from Supabase
      // (no-op in local mode).
      // Fetch everything from Supabase (no-op in local mode).
      //
      // `quiet` refetches WITHOUT raising `loading`, which matters because the
      // loading flag swaps the whole view for a full-screen spinner: that
      // unmounts the active screen and throws away its local state — the filter
      // you typed, the row you had open, the message about what just happened.
      // The spinner belongs to the FIRST load only; every refetch after a write
      // is quiet, so the screen just updates under you.
      hydrate: async ({ quiet = false } = {}) => {
        if (!usingSupabase) return
        if (!quiet) set({ loading: true })
        try {
          const [inventory, bookings, kits, scenarios, people, companies, companyTypes, orders] =
            await Promise.all([
              sbGetInventory(),
              sbGetBookings(),
              sbGetKits(),
              sbGetScenarioLists(),
              sbGetPeople(),
              sbGetCompanies(),
              sbGetCompanyTypes(),
              sbGetOrders(),
            ])
          set({
            inventory,
            bookings,
            kits,
            scenarios,
            people,
            companies,
            companyTypes,
            orders,
            loading: false,
          })
        } catch (e) {
          console.error('Supabase hydrate failed:', e)
          set({ loading: false })
        }
      },

      // --- UI state (not persisted — always starts on the current week) ---
      activeView: 'calendar', // 'calendar' | 'inventory'
      // Picking a view from the sidebar is a deliberate jump, not a drill-in, so
      // it drops the back trail (nothing to return "up" to).
      setActiveView: (view) => set({ activeView: view, navStack: [], peekStack: [] }),

      // --- cross-view drill-in + a BACK STACK -------------------------------
      //
      // Drilling in ("show me this item's history", "open this shoot's order")
      // used to be one-way: you landed in another view with no idea where you
      // came from. Every drill-in now takes an optional `from` describing the
      // place being left — { view, label, focus } — which is pushed onto
      // `navStack`. `goBack()` pops it and restores that view's selection, and
      // the shell renders a "Back to <label>" bar while the stack isn't empty.
      // Each push also adds a browser history entry, so the browser's own back
      // arrow works too (App.jsx listens for popstate).
      //
      // Focus payloads are per-view: inventory { itemId | kitId | listId, unitId },
      // orders { orderId }, people { personId | companyId }. Not persisted.
      navStack: [], // [{ view, label, focus }]
      inventoryFocus: null, // { itemId, unitId, kitId, listId, ts } | null
      orderFocus: null, // { orderId, ts } | null
      orderDraft: null, // { payload, ts } | null — a new order awaiting its gear
      // A scan that appeared on screen but whose write was refused (e.g. the
      // scanning migration hasn't run on this database). Shown at the station.
      scanSyncError: null,
      peopleFocus: null, // { personId, companyId, ts } | null

      // Send the caller's location to the stack + push a browser history entry.
      pushNav: (from) => {
        if (!from?.view) return
        set({ navStack: [...get().navStack, from] })
        if (typeof window !== 'undefined' && window.history?.pushState) {
          window.history.pushState({ appNav: true }, '')
        }
      },

      // With the Archive screen hidden (on request), an archived record is not
      // viewable ANYWHERE — so a link that would open one is silently ignored.
      // One predicate serves every drill-in and every peek card.
      isViewBlocked: (kind, id) => {
        if (!id) return false
        const s = get()
        const rec =
          kind === 'item'
            ? s.inventory.find((r) => r.id === id)
            : kind === 'kit'
              ? s.kits.find((r) => r.id === id)
              : kind === 'list'
                ? s.scenarios.find((r) => r.id === id)
                : kind === 'order'
                  ? s.orders.find((r) => r.id === id)
                  : kind === 'person'
                    ? s.people.find((r) => r.id === id)
                    : kind === 'company'
                      ? s.companies.find((r) => r.id === id)
                      : kind === 'job'
                        ? s.bookings.find((r) => r.id === id)
                        : null
        return !!rec?.archivedAt
      },

      focusInventory: ({ itemId, unitId = null, kitId = null, listId = null, from = null } = {}) => {
        if (!itemId && !kitId && !listId) return
        const blocked = get().isViewBlocked
        if (blocked('item', itemId) || blocked('kit', kitId) || blocked('list', listId)) return
        if (from) get().pushNav(from)
        set({
          inventoryFocus: { itemId: itemId ?? null, unitId, kitId, listId, ts: Date.now() },
          activeView: 'inventory',
          sidebarOpen: false,
          peekStack: [], // leaving the page closes the layered cards
        })
      },
      clearInventoryFocus: () => set({ inventoryFocus: null }),

      // A shoot on the calendar IS its order, so clicking it opens that order.
      // (Creating one goes through `openOrderDraft` below instead — the order
      // doesn't exist yet at that point.)
      openOrder: (orderId, from = null) => {
        if (!orderId) return
        if (get().isViewBlocked('order', orderId)) return
        if (from) get().pushNav(from)
        set({
          orderFocus: { orderId, ts: Date.now() },
          activeView: 'orders',
          sidebarOpen: false,
          peekStack: [],
        })
      },
      clearOrderFocus: () => set({ orderFocus: null }),

      // Step one of creating an order, answered on the CALENDAR. Nothing is
      // written yet: the form's answers travel to the Orders view, which opens
      // the equipment window, and THAT is what creates the order. Backing out
      // there leaves no empty order and no booked studio slot behind.
      openOrderDraft: (payload, from = null) => {
        if (!payload) return
        if (from) get().pushNav(from)
        set({
          orderDraft: { payload, ts: Date.now() },
          activeView: 'orders',
          sidebarOpen: false,
          peekStack: [],
        })
      },
      clearOrderDraft: () => set({ orderDraft: null }),

      // --- activity log: who did what ---------------------------------------
      //
      // One entry point for every action worth attributing. In Supabase mode it
      // appends to the `events` table (actor = the signed-in user, enforced by
      // RLS); in local mode there is no DB, so entries go into a persisted array
      // and the same UI reads them. Logging is FIRE-AND-FORGET: it must never
      // block or fail the action it describes.
      activity: [], // local mode only: [{ id, at, type, entityType, entityId, unitId, actorName, data }]
      // Bumped on every write so an open card refetches its feed. NOT persisted,
      // and deliberately not keyed on `orders` — that changes on every quiet
      // hydrate and would refetch constantly.
      activityVersion: 0,

      logActivity: ({ type, entityType, entityId, unitId = null, setId = null, data = {} } = {}) => {
        if (!type || !entityType || !entityId) return
        const state = get()
        if (usingSupabase) {
          // Bump the refresh counter AFTER the row lands. Bumping first makes an
          // open card refetch while the insert is still in flight, so the feed
          // comes back without the event that just happened (and nothing bumps
          // again). Callers stay fire-and-forget.
          sbLogEvent(
            { eventType: type, entityType, entityId, unitId, setId, data },
            state.session?.user?.id ?? null,
          )
            .then(() => set({ activityVersion: get().activityVersion + 1 }))
            .catch(() => {})
          return
        }
        set({ activityVersion: state.activityVersion + 1 })
        // Local demo: whoever is at the machine. There's no auth in this mode.
        const entry = {
          id: `act-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`,
          at: new Date().toISOString(),
          type,
          entityType,
          entityId,
          unitId,
          setId,
          actorName: state.profile?.full_name || LOCAL_ACTOR,
          data,
        }
        set({ activity: [entry, ...state.activity].slice(0, 500) })
      },

      // One entity's history, newest first. Supabase mode fetches on demand (the
      // caller holds the result in state); local mode filters the array.
      activityFor: (entityType, entityId) =>
        get().activity.filter((e) => e.entityType === entityType && e.entityId === entityId),

      // Same for a set of units (an item's units), used by the item card.
      activityForUnits: (unitIds) => {
        const ids = new Set((unitIds || []).filter(Boolean))
        return get().activity.filter((e) => e.unitId && ids.has(e.unitId))
      },

      // Supabase-mode fetchers, so a card can pull its own history.
      fetchActivity: async (entityType, entityId) =>
        usingSupabase
          ? await sbGetEvents({ entityType, entityId })
          : get().activityFor(entityType, entityId),

      fetchActivityForUnits: async (unitIds) =>
        usingSupabase
          ? await sbGetEventsForUnits(unitIds)
          : get().activityForUnits(unitIds),

      // --- peek stack: look at related data WITHOUT leaving the page ---------
      //
      // Anything related is clickable, and clicking it opens a card layered over
      // the current screen instead of navigating away. Peeks stack, so you can go
      // order → its gear → that unit's job → the model on it and unwind one step
      // at a time; closing the last one puts you exactly where you started.
      // Each entry is { type: 'order'|'item'|'person'|'company'|'job', id }.
      // Not persisted.
      peekStack: [],
      peek: (target) => {
        if (!target?.type || !target?.id) return
        // An archived record has no card anywhere (the Archive screen is
        // hidden) — the click is ignored rather than opening a ghost.
        if (get().isViewBlocked(target.type, target.id)) return
        const stack = get().peekStack
        const top = stack[stack.length - 1]
        // Clicking the thing you're already looking at shouldn't deepen the stack.
        if (top && top.type === target.type && top.id === target.id) return
        set({ peekStack: [...stack, { ...target }] })
      },
      peekBack: () => set({ peekStack: get().peekStack.slice(0, -1) }),
      peekClose: () => set({ peekStack: [] }),

      // Open the studio calendar on a given date. Used when a job has no order
      // to open (a legacy order-less shoot), so a work-history row still leads
      // somewhere. Bypasses setActiveView so the back trail survives.
      openCalendarOn: (date, from = null) => {
        if (from) get().pushNav(from)
        set({
          ...(date ? { selectedDate: date } : {}),
          calendarMode: 'week',
          activeView: 'calendar',
          sidebarOpen: false,
          peekStack: [],
        })
      },

      focusPeople: ({ personId = null, companyId = null, from = null } = {}) => {
        if (!personId && !companyId) return
        const blocked = get().isViewBlocked
        if (blocked('person', personId) || blocked('company', companyId)) return
        if (from) get().pushNav(from)
        set({
          peopleFocus: { personId, companyId, ts: Date.now() },
          activeView: 'people',
          sidebarOpen: false,
          peekStack: [],
        })
      },
      clearPeopleFocus: () => set({ peopleFocus: null }),

      // Pop the stack and restore that location. Restoring never re-opens a
      // modal (a returning unitId is dropped) — you came back to the page, not
      // to the dialog you had open.
      goBack: () => {
        const stack = get().navStack
        if (!stack.length) return
        const target = stack[stack.length - 1]
        const focus = target.focus || {}
        const ts = Date.now()
        set({
          navStack: stack.slice(0, -1),
          activeView: target.view,
          sidebarOpen: false,
          peekStack: [],
          inventoryFocus:
            target.view === 'inventory' ? { ...focus, unitId: null, ts } : get().inventoryFocus,
          orderFocus: target.view === 'orders' ? { ...focus, ts } : get().orderFocus,
          peopleFocus: target.view === 'people' ? { ...focus, ts } : get().peopleFocus,
        })
      },

      // Mobile/tablet off-canvas sidebar drawer.
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      calendarMode: 'week', // 'week' | 'month'
      setCalendarMode: (mode) => set({ calendarMode: mode }),

      selectedDate: format(new Date(), 'yyyy-MM-dd'),
      setSelectedDate: (date) => set({ selectedDate: date }),

      // --- auth (supabase mode only; local mode has no login) ---
      session: null,
      profile: null,
      authReady: !usingSupabase,

      // Subscribe to auth changes; load profile + hydrate data when signed in.
      initAuth: () => {
        if (!usingSupabase) return
        supabase.auth.onAuthStateChange((_event, session) => {
          const prev = get().session
          set({ session })
          // Token refreshes and tab-focus re-fires (supabase re-validates the
          // session when the tab becomes visible) land here too. Re-fetching the
          // profile + re-hydrating on each one flashes the full-screen loader,
          // which unmounts the active view and wipes its in-view filters. So only
          // (re)load when the signed-in user actually changed — first load, a real
          // sign-in, or sign-out. A refresh for the already-loaded user is a no-op.
          const sameUser =
            prev?.user?.id && session?.user?.id && prev.user.id === session.user.id
          if (session && sameUser && get().profile) {
            if (!get().authReady) set({ authReady: true })
            return
          }
          // Defer supabase calls out of the auth callback (avoids a lock deadlock).
          setTimeout(async () => {
            if (session) {
              const { data } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .eq('id', session.user.id)
                .maybeSingle()
              if (!data) {
                // Session without a team profile (e.g. a stale anonymous
                // session) — reject and fall back to the login screen.
                await supabase.auth.signOut()
                set({ authReady: true })
                return
              }
              set({ profile: data })
              await get().hydrate()
            } else {
              set({ profile: null, inventory: [], bookings: [], kits: [], scenarios: [] })
            }
            set({ authReady: true })
          }, 0)
        })
      },

      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      // Register a new team member. Returns the session (null if the project
      // requires email confirmation — the UI then shows a "check your email"
      // message). New users get a 'crew' profile via the DB trigger.
      signUp: async ({ email, password, fullName }) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw error
        return data.session
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },

      // Reload data: re-fetch from Supabase, or rebuild the local seeds.
      resetDemoData: () =>
        usingSupabase
          ? get().hydrate()
          : set({ ...buildSeedData(), activeView: 'calendar' }),

      // Flip a single unit between owned and sub-rental (manual marking).
      // Optimistic in both modes; persisted to Supabase in the background.
      toggleOwnership: (itemId, unitId) => {
        const state = get()
        const before = state.inventory
          .find((i) => i.id === itemId)
          ?.units?.find((u) => u.id === unitId)
        let next = 'owned'
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) => {
                  if (u.id !== unitId) return u
                  next = u.ownership === 'owned' ? 'sub_rental' : 'owned'
                  // Back to owned → the unit has no vendor any more (4.5).
                  return {
                    ...u,
                    ownership: next,
                    subRentalVendorId: next === 'owned' ? null : (u.subRentalVendorId ?? null),
                  }
                }),
              },
        )
        set({ inventory })
        get().logActivity({
          type: EVENT.UNIT_OWNERSHIP,
          entityType: 'item',
          entityId: itemId,
          unitId,
          data: { from: before?.ownership ?? null, to: next, barcode: before?.barcode ?? null },
        })
        if (usingSupabase) {
          sbToggleOwnership(unitId, next).catch((e) =>
            console.error('toggleOwnership failed:', e),
          )
          if (next === 'owned') {
            sbSetUnitVendor(unitId, null).catch((e) =>
              console.error('clear unit vendor failed:', e),
            )
          }
        }
      },

      // Name the vendor a sub-rented unit came from (4.5). Clearing ownership back
      // to 'owned' drops the vendor too — an owned unit has no vendor.
      setUnitVendor: (itemId, unitId, companyId) => {
        const state = get()
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) =>
                  u.id === unitId ? { ...u, subRentalVendorId: companyId || null } : u,
                ),
              },
        )
        set({ inventory })
        if (usingSupabase) {
          sbSetUnitVendor(unitId, companyId || null).catch((e) =>
            console.error('setUnitVendor failed:', e),
          )
        }
      },

      // Set/correct a unit's barcode (3.4). Returns { ok } or { error } — the
      // caller (kit staging) uses it to guard against duplicate barcodes.
      setUnitBarcode: (itemId, unitId, barcode) => {
        const code = String(barcode || '').trim()
        if (!code) return { error: 'Barcode cannot be empty.' }
        const state = get()
        const clash = state.inventory.some((item) =>
          item.units?.some((u) => u.id !== unitId && u.barcode === code),
        )
        if (clash) return { error: `#${code} is already used by another unit.` }
        const wasCode = state.inventory
          .find((i) => i.id === itemId)
          ?.units?.find((u) => u.id === unitId)?.barcode ?? null
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) => (u.id === unitId ? { ...u, barcode: code } : u)),
              },
        )
        set({ inventory })
        get().logActivity({
          type: EVENT.UNIT_BARCODE_SET,
          entityType: 'item',
          entityId: itemId,
          unitId,
          data: { from: wasCode, to: code },
        })
        if (usingSupabase) {
          sbSetUnitBarcode(unitId, code).catch((e) => console.error('setUnitBarcode failed:', e))
        }
        return { ok: true }
      },

      // --- individual units of an existing item (the asset register) --------
      //
      // "Add inventory" creates an item TYPE; these manage the physical copies
      // under it. Barcodes must be unique across the whole register, so the
      // next free number is computed from every loaded unit.
      nextBarcode: () => {
        let max = 0
        for (const item of get().inventory)
          for (const u of item.units || []) {
            const n = parseInt(u.barcode, 10)
            if (Number.isFinite(n) && n > max) max = n
          }
        return String(max + 1).padStart(4, '0')
      },

      // Register physical copies of a barcoded item. `rows` is ONE ENTRY PER
      // COPY ([{ barcode, serial }]) — each may be typed or left blank to be
      // generated, so a batch of 6 and 6 hand-entered serials are the same call.
      // `count` alone still works: it means that many generated copies.
      // Returns { ok, count } or { error }.
      addUnits: async (itemId, { units: rows, count = 1, placement = '' } = {}) => {
        const state = get()
        const item = state.inventory.find((i) => i.id === itemId)
        if (!item) return { error: 'Item not found.' }
        if (item.kind !== 'barcoded')
          return { error: 'Only barcoded items track individual units — edit the quantity instead.' }

        const specs = (Array.isArray(rows) && rows.length
          ? rows
          : Array.from({ length: Math.max(1, Math.min(100, Number(count) || 1)) }, () => ({}))
        )
          .slice(0, 100)
          .map((r) => ({
            barcode: String(r?.barcode ?? '').trim(),
            serial: String(r?.serial ?? '').trim(),
          }))

        const taken = new Set()
        for (const it of state.inventory) for (const u of it.units || []) taken.add(u.barcode)

        // A typed barcode must be free, and no two rows may claim the same one.
        const claimed = new Set()
        for (const s of specs) {
          if (!s.barcode) continue
          if (taken.has(s.barcode)) return { error: `#${s.barcode} is already used by another unit.` }
          if (claimed.has(s.barcode))
            return { error: `#${s.barcode} is listed twice — each copy needs its own barcode.` }
          claimed.add(s.barcode)
        }

        // Blank rows take the next free numbers, skipping anything typed above.
        let next = parseInt(get().nextBarcode(), 10)
        const codes = specs.map((s) => {
          if (s.barcode) return s.barcode
          let code = String(next).padStart(4, '0')
          while (taken.has(code) || claimed.has(code)) code = String(++next).padStart(4, '0')
          next++
          claimed.add(code)
          return code
        })

        const typedPlacement = String(placement || '').trim()
        const units = codes.map((code, i) => ({
          id: usingSupabase ? `tmp-${code}` : `u-${code}`,
          barcode: code,
          serial: specs[i].serial || serialFor(`${itemId}-${code}`),
          status: 'available',
          location: 'Available',
          // Where the copy lives. Applies to the whole batch: units received
          // together go on the same shelf. Empty = inherit the item's placement.
          placement: typedPlacement || null,
          ownership: 'owned',
          repairs: [],
        }))

        // One event per physical copy registered — the item card's feed.
        const logAdds = () => {
          for (const u of units)
            get().logActivity({
              type: EVENT.UNIT_ADDED,
              entityType: 'item',
              entityId: itemId,
              data: { barcode: u.barcode, serial: u.serial, itemName: item.name },
            })
        }

        if (usingSupabase) {
          try {
            await sbAddUnits(itemId, units)
          } catch (e) {
            return { error: e.message }
          }
          logAdds()
          await get().hydrate({ quiet: true })
          return { ok: true, count: units.length }
        }
        logAdds()
        set({
          inventory: state.inventory.map((it) =>
            it.id === itemId ? { ...it, units: [...it.units, ...units] } : it,
          ),
        })
        return { ok: true, count: units.length }
      },

      // Correct one unit's barcode / serial / storage location.
      updateUnit: async (itemId, unitId, { barcode, serial, placement } = {}) => {
        const state = get()
        const code = String(barcode ?? '').trim()
        const ser = String(serial ?? '').trim()
        // Empty is meaningful here: it clears the override so the unit inherits
        // the item's placement again.
        const place = String(placement ?? '').trim()
        if (!code) return { error: 'Barcode cannot be empty.' }
        if (!ser) return { error: 'Serial cannot be empty.' }
        const clash = state.inventory.some((it) =>
          (it.units || []).some((u) => u.id !== unitId && u.barcode === code),
        )
        if (clash) return { error: `#${code} is already used by another unit.` }

        const was = state.inventory
          .find((i) => i.id === itemId)
          ?.units?.find((u) => u.id === unitId)
        const logEdit = () =>
          get().logActivity({
            type: EVENT.UNIT_UPDATED,
            entityType: 'item',
            entityId: itemId,
            unitId,
            data: {
              from: {
                barcode: was?.barcode ?? null,
                serial: was?.serial ?? null,
                placement: was?.placement ?? null,
              },
              to: { barcode: code, serial: ser, placement: place || null },
            },
          })

        if (usingSupabase) {
          try {
            await sbUpdateUnit(unitId, { barcode: code, serial: ser, placement: place })
          } catch (e) {
            return { error: e.message }
          }
          logEdit()
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        logEdit()
        set({
          inventory: state.inventory.map((it) =>
            it.id !== itemId
              ? it
              : {
                  ...it,
                  units: it.units.map((u) =>
                    u.id === unitId
                      ? { ...u, barcode: code, serial: ser, placement: place || null }
                      : u,
                  ),
                },
          ),
        })
        return { ok: true }
      },

      // Write off ONE unit. Refused with a reason while it's on a job or out for
      // repair, or while a kit pins it to a FIXED slot (the DB forbids that one).
      // Write off one physical copy. Archives it — the register keeps the row,
      // so its barcode stays taken and its job history stays readable.
      archiveUnit: async (itemId, unitId) => {
        const state = get()
        const item = state.inventory.find((i) => i.id === itemId)
        const unit = item?.units?.find((u) => u.id === unitId)
        if (!unit) return { error: 'Unit not found.' }
        if (unit.status === 'checked_out')
          return { error: `#${unit.barcode} is out on “${unit.location}”. Free it from that job first.` }
        if (unit.status === 'in_repair')
          return { error: `#${unit.barcode} is out for repair. Mark it returned first.` }
        const pinnedBy = state.kits.find((k) =>
          (k.slots || []).some((s) => s.fixedUnitId === unitId),
        )
        if (pinnedBy)
          return {
            error: `#${unit.barcode} is the fixed unit of kit “${pinnedBy.name}”. Change that slot first.`,
          }

        const logWriteOff = () =>
          get().logActivity({
            type: EVENT.UNIT_WRITTEN_OFF,
            entityType: 'item',
            entityId: itemId,
            unitId,
            data: { barcode: unit.barcode, serial: unit.serial, itemName: item?.name ?? null },
          })

        // A write-off ARCHIVES the unit: it leaves every list, picker and count,
        // but its barcode, serial and job history stay readable for ever.
        if (usingSupabase) {
          try {
            await sbArchiveUnit(unitId, get().session?.user?.id ?? null)
          } catch (e) {
            return { error: e.message }
          }
          logWriteOff()
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        logWriteOff()
        const stamp = new Date().toISOString()
        const inventory = state.inventory.map((it) =>
          it.id === itemId
            ? {
                ...it,
                units: it.units.map((u) =>
                  u.id === unitId ? { ...u, archivedAt: stamp, archivedBy: LOCAL_ACTOR } : u,
                ),
              }
            : it,
        )
        // Drop it from any booking that still lists it, then re-project.
        const bookings = state.bookings.map((b) =>
          (b.unitIds || []).includes(unitId)
            ? { ...b, unitIds: b.unitIds.filter((id) => id !== unitId) }
            : b,
        )
        set({ bookings, inventory: withReservations(inventory, bookings) })
        return { ok: true }
      },

      // Bring a written-off copy back into the register.
      restoreUnit: async (itemId, unitId) => {
        const state = get()
        const item = state.inventory.find((i) => i.id === itemId)
        const unit = item?.units?.find((u) => u.id === unitId)
        if (!unit) return { error: 'Unit not found.' }
        get().logActivity({
          type: EVENT.RESTORED,
          entityType: 'item',
          entityId: itemId,
          unitId,
          data: { what: 'unit', name: `#${unit.barcode}`, itemName: item?.name ?? null },
        })
        if (usingSupabase) {
          try {
            await sbRestoreUnit(unitId)
          } catch (e) {
            return { error: e.message }
          }
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        set({
          inventory: state.inventory.map((it) =>
            it.id === itemId
              ? {
                  ...it,
                  units: it.units.map((u) =>
                    u.id === unitId ? { ...u, archivedAt: null, archivedBy: null } : u,
                  ),
                }
              : it,
          ),
        })
        return { ok: true }
      },

      // Send a unit out for repair. Opens a repair entry; the unit becomes
      // 'in_repair' (unavailable) until it's returned.
      sendToRepair: async (itemId, unitId, details = {}) => {
        const barcodeOf = (uid) =>
          get()
            .inventory.find((i) => i.id === itemId)
            ?.units?.find((u) => u.id === uid)?.barcode ?? null
        const logOut = (barcode) =>
          get().logActivity({
            type: EVENT.UNIT_REPAIR_OUT,
            entityType: 'item',
            entityId: itemId,
            unitId,
            data: { vendor: details.vendor ?? null, issue: details.issue ?? null, barcode },
          })

        if (usingSupabase) {
          const barcode = barcodeOf(unitId)
          await sbSendToRepair(unitId, details)
          logOut(barcode)
          await get().hydrate({ quiet: true })
          return
        }
        logOut(barcodeOf(unitId))
        const state = get()
        const repair = {
          id: `rep-${Date.now().toString(36)}`,
          vendor: details.vendor || null,
          issue: details.issue || null,
          sentAt: details.sentAt || format(new Date(), 'yyyy-MM-dd'),
          returnedAt: null,
          resolution: null,
        }
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) =>
                  u.id !== unitId
                    ? u
                    : { ...u, repairs: [repair, ...(u.repairs || [])] },
                ),
              },
        )
        set({ inventory: withReservations(inventory, state.bookings) })
      },

      // Close a unit's open repair (returned date + resolution). The unit frees
      // up unless it's still reserved by an active booking.
      returnFromRepair: async (itemId, unitId, repairId, details = {}) => {
        const logBack = () =>
          get().logActivity({
            type: EVENT.UNIT_REPAIR_BACK,
            entityType: 'item',
            entityId: itemId,
            unitId,
            data: {
              resolution: details.resolution ?? null,
              barcode:
                get()
                  .inventory.find((i) => i.id === itemId)
                  ?.units?.find((u) => u.id === unitId)?.barcode ?? null,
            },
          })
        if (usingSupabase) {
          await sbReturnFromRepair(repairId, details)
          logBack()
          await get().hydrate({ quiet: true })
          return
        }
        logBack()
        const state = get()
        const returnedAt = details.returnedAt || format(new Date(), 'yyyy-MM-dd')
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) =>
                  u.id !== unitId
                    ? u
                    : {
                        ...u,
                        repairs: (u.repairs || []).map((r) =>
                          r.id !== repairId
                            ? r
                            : { ...r, returnedAt, resolution: details.resolution || null },
                        ),
                      },
                ),
              },
        )
        set({ inventory: withReservations(inventory, state.bookings) })
      },

      // Record a usage event for an item (work-history / analytics).
      logUsage: async (itemId, details = {}) => {
        if (usingSupabase) {
          await sbLogItemUsage(itemId, details)
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        const event = {
          jobTitle: details.jobTitle || null,
          studioId: details.studioId || null,
          quantity: details.quantity || 1,
          usedOn: details.usedOn || format(new Date(), 'yyyy-MM-dd'),
        }
        set({
          inventory: state.inventory.map((item) =>
            item.id !== itemId
              ? item
              : {
                  ...item,
                  usage: [event, ...(item.usage || [])].sort((a, b) =>
                    a.usedOn < b.usedOn ? 1 : -1,
                  ),
                },
          ),
        })
      },

      // Create a new inventory item with `quantity` freshly generated units.
      // Barcodes start past every existing one so ids never collide. Returns
      // the new item's id so the UI can select it.
      addInventoryItem: async ({ name, category, quantity, kind = 'barcoded', ...fields }) => {
        const logCreate = (itemId) =>
          get().logActivity({
            type: EVENT.ITEM_CREATED,
            entityType: 'item',
            entityId: itemId,
            data: { name, category, kind, quantity },
          })
        if (usingSupabase) {
          const id = await sbAddInventoryItem({ name, category, quantity, kind, ...fields })
          logCreate(id)
          await get().hydrate({ quiet: true })
          return id
        }
        const state = get()
        const existingIds = new Set(state.inventory.map((i) => i.id))
        const base = slugify(name)
        let id = base
        let n = 2
        while (existingIds.has(id)) id = `${base}-${n++}`

        let maxBarcode = 0
        for (const item of state.inventory) {
          for (const u of item.units) {
            const num = parseInt(u.barcode, 10)
            if (Number.isFinite(num) && num > maxBarcode) maxBarcode = num
          }
        }

        const attrs = {
          brand: fields.brand || null,
          assetType: fields.assetType || null,
          placement: fields.placement || null,
          subcategory: fields.subcategory || null,
          purchaseDate: fields.purchaseDate || null,
          replacementPrice: fields.replacementPrice || null,
        }
        const base_ = { id, name: name.trim(), category, kind, ...attrs }
        const item =
          kind === 'barcoded'
            ? { ...base_, quantity: 0, units: createUnits(id, quantity, maxBarcode + 1) }
            : { ...base_, quantity, units: [] }
        set({ inventory: [item, ...state.inventory] })
        logCreate(id)
        return id
      },

      // Move non-barcoded stock by a DELTA — "20 more arrived",
      // "5 went out" — instead of overwriting the count in the item editor.
      // Barcoded items have unit rows, so they use addUnits/deleteUnit instead.
      adjustStock: async (itemId, { delta } = {}) => {
        const item = get().inventory.find((i) => i.id === itemId)
        if (!item) return { error: 'Item not found.' }
        if (item.kind === 'barcoded')
          return { error: 'This item is tracked per unit — add or write off units instead.' }
        const n = Math.trunc(Number(delta) || 0)
        if (!n) return { error: 'Enter how many.' }

        const from = item.quantity ?? 0
        if (n < 0 && from + n < 0)
          return { error: `Only ${from} on hand — can't take ${Math.abs(n)} out.` }
        const to = from + n

        if (usingSupabase) {
          try {
            await sbUpdateInventoryItem(itemId, { kind: item.kind, quantity: to })
          } catch (e) {
            return { error: e.message }
          }
        } else {
          set({
            inventory: get().inventory.map((i) => (i.id === itemId ? { ...i, quantity: to } : i)),
          })
        }
        get().logActivity({
          type: EVENT.STOCK_ADJUSTED,
          entityType: 'item',
          entityId: itemId,
          data: { delta: n, from, to, itemName: item.name },
        })
        if (usingSupabase) await get().hydrate({ quiet: true })
        return { ok: true, from, to }
      },

      // Edit an item's fields (kind immutable; quantity only for non-barcoded).
      updateInventoryItem: async (id, changes) => {
        // What actually moved — the item card's feed said nothing about item
        // edits before, so a corrected count left no trace at all.
        const before = get().inventory.find((i) => i.id === id)
        const LABELS = {
          name: 'name',
          category: 'category',
          brand: 'brand',
          assetType: 'asset type',
          placement: 'storage location',
          subcategory: 'subcategory',
          purchaseDate: 'purchase date',
          replacementPrice: 'replacement price',
          dayRate: 'day rate',
        }
        const changed = []
        if (before) {
          for (const [key, label] of Object.entries(LABELS)) {
            if (!(key in changes)) continue
            const was = before[key] ?? null
            const now = changes[key] === '' ? null : (changes[key] ?? null)
            if (String(was ?? '') !== String(now ?? '')) changed.push(label)
          }
          if (before.kind !== 'barcoded' && changes.quantity != null) {
            const was = before.quantity ?? 0
            if (Number(was) !== Number(changes.quantity))
              changed.push(`quantity ${was} → ${changes.quantity}`)
          }
        }
        const logEdit = () => {
          if (!changed.length) return
          get().logActivity({
            type: EVENT.ITEM_UPDATED,
            entityType: 'item',
            entityId: id,
            data: { changed, name: before?.name ?? null },
          })
        }

        if (usingSupabase) {
          await sbUpdateInventoryItem(id, changes)
          logEdit()
          await get().hydrate({ quiet: true })
          return
        }
        logEdit()
        const state = get()
        const { name, category, quantity, kind, ...fields } = changes
        const inventory = state.inventory.map((item) => {
          if (item.id !== id) return item
          const next = { ...item }
          if (name != null) next.name = name.trim()
          if (category != null) next.category = category
          for (const k of ['brand', 'assetType', 'placement', 'subcategory', 'purchaseDate', 'replacementPrice']) {
            if (k in fields) next[k] = fields[k] || null
          }
          if (item.kind !== 'barcoded' && quantity != null) next.quantity = quantity
          return next
        })
        // Kit slots and list entries cache the component's name/category, so
        // re-resolve the presets after an item edit to avoid stale labels.
        const kits = state.kits.map((k) => resolveKit(k, inventory))
        set({
          inventory,
          kits,
          scenarios: state.scenarios.map((l) => resolveScenario(l, inventory, kits)),
        })
      },

      // Retire an item: it and all its copies are archived, never deleted, so
      // every order line, kit slot and usage row that mentions it still reads.
      // Refused while a copy is physically out, for the same reason a single
      // write-off is: you can't retire gear that is on a job or at a repairer.
      archiveInventoryItem: async (id) => {
        const state = get()
        const item = state.inventory.find((i) => i.id === id)
        if (!item) return { error: 'Item not found.' }
        const live = (item.units || []).filter((u) => !u.archivedAt)
        const out = live.find((u) => u.status === 'checked_out')
        if (out)
          return { error: `#${out.barcode} is out on “${out.location}”. Free it from that job first.` }
        const fixing = live.find((u) => u.status === 'in_repair')
        if (fixing)
          return { error: `#${fixing.barcode} is out for repair. Mark it returned first.` }

        const logIt = () =>
          get().logActivity({
            type: EVENT.ARCHIVED,
            entityType: 'item',
            entityId: id,
            data: { what: 'item', name: item.name, units: live.length },
          })

        if (usingSupabase) {
          try {
            await sbArchiveInventoryItem(id, get().session?.user?.id ?? null)
          } catch (e) {
            return { error: e.message }
          }
          logIt()
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        logIt()
        const stamp = new Date().toISOString()
        const unitIds = new Set(live.map((u) => u.id))
        set({
          inventory: state.inventory.map((i) =>
            i.id === id
              ? {
                  ...i,
                  archivedAt: stamp,
                  archivedBy: LOCAL_ACTOR,
                  units: (i.units || []).map((u) =>
                    unitIds.has(u.id) ? { ...u, archivedAt: stamp, archivedBy: LOCAL_ACTOR } : u,
                  ),
                }
              : i,
          ),
          bookings: state.bookings.map((b) => ({
            ...b,
            unitIds: (b.unitIds || []).filter((uid) => !unitIds.has(uid)),
          })),
        })
        return { ok: true }
      },

      restoreInventoryItem: async (id) => {
        const state = get()
        const item = state.inventory.find((i) => i.id === id)
        if (!item) return { error: 'Item not found.' }
        const stamp = item.archivedAt
        get().logActivity({
          type: EVENT.RESTORED,
          entityType: 'item',
          entityId: id,
          data: { what: 'item', name: item.name },
        })
        if (usingSupabase) {
          try {
            await sbRestoreInventoryItem(id, stamp)
          } catch (e) {
            return { error: e.message }
          }
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        set({
          inventory: state.inventory.map((i) =>
            i.id === id
              ? {
                  ...i,
                  archivedAt: null,
                  archivedBy: null,
                  // Only the copies that went down WITH the item come back; one
                  // written off on its own beforehand stays written off.
                  units: (i.units || []).map((u) =>
                    u.archivedAt && u.archivedAt === stamp
                      ? { ...u, archivedAt: null, archivedBy: null }
                      : u,
                  ),
                }
              : i,
          ),
        })
        return { ok: true }
      },

      // ---- archive / restore, the flat entities --------------------------
      //
      // Kits, scenario lists, people, companies and company types have nothing to
      // release and no children to follow, so one implementation serves all five:
      // stamp the row, log it, and let the filters in the views do the hiding.
      // Orders, shoots, items, units and add-ons have side effects and live above.
      archiveRecord: async (what, id) => {
        const cfg = ARCHIVABLE[what]
        if (!cfg) return { error: `Unknown record type: ${what}` }
        const record = (get()[cfg.list] || []).find((r) => r.id === id)
        if (!record) return { error: 'Record not found.' }
        get().logActivity({
          type: EVENT.ARCHIVED,
          entityType: what,
          entityId: id,
          data: { what, name: cfg.name(record) },
        })
        if (usingSupabase) {
          try {
            await cfg.archive(id, get().session?.user?.id ?? null)
          } catch (e) {
            return { error: e.message }
          }
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        set({
          [cfg.list]: get()[cfg.list].map((r) =>
            r.id === id
              ? { ...r, archivedAt: new Date().toISOString(), archivedBy: LOCAL_ACTOR }
              : r,
          ),
        })
        return { ok: true }
      },

      restoreRecord: async (what, id) => {
        const cfg = ARCHIVABLE[what]
        if (!cfg) return { error: `Unknown record type: ${what}` }
        const record = (get()[cfg.list] || []).find((r) => r.id === id)
        if (!record) return { error: 'Record not found.' }
        get().logActivity({
          type: EVENT.RESTORED,
          entityType: what,
          entityId: id,
          data: { what, name: cfg.name(record) },
        })
        if (usingSupabase) {
          try {
            await cfg.restore(id)
          } catch (e) {
            return { error: e.message }
          }
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        set({
          [cfg.list]: get()[cfg.list].map((r) =>
            r.id === id ? { ...r, archivedAt: null, archivedBy: null } : r,
          ),
        })
        return { ok: true }
      },

      // ---- Kit authoring (3.6) ------------------------------------------
      // Editor slots arrive as { itemId, label, slotType, fixedUnitId }; local
      // mode resolves the display fields the UI reads (names, fixed barcode).
      createKit: async ({ name, category, notes, slots }) => {
        if (usingSupabase) {
          await sbCreateKit({ name, category, notes, slots })
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        const id = uniqueId(
          slugify(name),
          state.kits.map((k) => k.id),
        )
        set({
          kits: [
            ...state.kits,
            resolveKit({ id, name: name.trim(), category, notes, slots }, state.inventory),
          ].sort((a, b) => a.name.localeCompare(b.name)),
        })
        return id
      },

      updateKit: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateKit(id, changes)
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        const kits = state.kits
          .map((k) => (k.id === id ? resolveKit({ ...k, ...changes, id }, state.inventory) : k))
          .sort((a, b) => a.name.localeCompare(b.name))
        // Scenario entries cache the kit's name for display — re-resolve them so a
        // rename doesn't leave stale labels. (Supabase mode re-reads the join.)
        set({
          kits,
          scenarios: state.scenarios.map((l) => resolveScenario(l, state.inventory, kits)),
        })
      },

      // Archiving a kit leaves its slots and every scenario-list line pointing at
      // it intact — the line simply reports the kit as unavailable until it's
      // restored, instead of the line being destroyed as it was before.
      archiveKit: (id) => get().archiveRecord('kit', id),
      restoreKit: (id) => get().restoreRecord('kit', id),

      // ---- Scenario list authoring (3.6) --------------------------------
      // Editor entries arrive as { type, itemId|kitId, quantity, note }.
      createScenario: async ({ name, category, notes, entries }) => {
        if (usingSupabase) {
          await sbCreateScenarioList({ name, category, notes, entries })
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        const id = uniqueId(
          slugify(name),
          state.scenarios.map((l) => l.id),
        )
        set({
          scenarios: [
            ...state.scenarios,
            resolveScenario(
              { id, name: name.trim(), category, notes, entries },
              state.inventory,
              state.kits,
            ),
          ].sort((a, b) => a.name.localeCompare(b.name)),
        })
        return id
      },

      updateScenario: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateScenarioList(id, changes)
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        set({
          scenarios: state.scenarios
            .map((l) =>
              l.id === id
                ? resolveScenario({ ...l, ...changes, id }, state.inventory, state.kits)
                : l,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        })
      },

      archiveScenario: (id) => get().archiveRecord('scenario', id),
      restoreScenario: (id) => get().restoreRecord('scenario', id),

      // ---- People & companies (4.1 / 4.2) --------------------------------
      createPerson: async (person) => {
        if (usingSupabase) {
          const id = await sbCreatePerson(person)
          await get().hydrate({ quiet: true })
          return id
        }
        const state = get()
        const id = uniqueId(
          slugify(person.name),
          state.people.map((p) => p.id),
        )
        set({
          people: [
            ...state.people,
            resolvePerson({ ...person, id }, state.companies, state.bookings),
          ].sort((a, b) => a.name.localeCompare(b.name)),
        })
        return id
      },

      updatePerson: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdatePerson(id, changes)
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        set({
          people: state.people
            .map((p) =>
              p.id === id
                ? resolvePerson({ ...p, ...changes, id }, state.companies, state.bookings)
                : p,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        })
      },

      // Retiring a person used to be REFUSED outright for anyone who had worked a
      // job (roster_entries references contacts with ON DELETE RESTRICT), so the
      // roster could only ever grow. Archiving does what was actually wanted:
      // they leave the pickers, and every job they were on keeps their name.
      archivePerson: (id) => get().archiveRecord('person', id),
      restorePerson: (id) => get().restoreRecord('person', id),

      // Used both by the company editor (4.3) and as a quick-add from the person
      // editor when the company isn't on file yet.
      createCompany: async (company) => {
        const { name, kind = 'client' } = company
        if (usingSupabase) {
          const id = await sbCreateCompany({ ...company, kind })
          await get().hydrate({ quiet: true })
          return id
        }
        const state = get()
        const id = uniqueId(
          slugify(name),
          state.companies.map((c) => c.id),
        )
        set({
          companies: [...state.companies, resolveCompany({ ...company, id, kind })].sort((a, b) =>
            a.name.localeCompare(b.name),
          ),
        })
        return id
      },

      updateCompany: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateCompany(id, changes)
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        const companies = state.companies
          .map((c) => (c.id === id ? resolveCompany({ ...c, ...changes, id }) : c))
          .sort((a, b) => a.name.localeCompare(b.name))
        // People and orders cache the company name for display — re-resolve them
        // so a rename doesn't leave stale labels behind.
        set({
          companies,
          people: state.people.map((p) => resolvePerson(p, companies, state.bookings)),
          orders: state.orders.map((o) => ({
            ...o,
            companyName: companies.find((c) => c.id === o.companyId)?.name ?? o.companyName,
          })),
        })
      },

      // Deleting a company used to DETACH its people, orders and sub-rented gear
      // (those columns are ON DELETE SET NULL) — removing one row quietly damaged
      // the history around it. Archiving keeps every link exactly as it was.
      archiveCompany: (id) => get().archiveRecord('company', id),
      restoreCompany: (id) => get().restoreRecord('company', id),

      // ---- Editable company Type options (4.4) --------------------------
      createCompanyType: async (name) => {
        const clean = String(name || '').trim()
        if (!clean) return { error: 'Type name cannot be empty.' }
        const state = get()
        if (state.companyTypes.some((t) => t.name.toLowerCase() === clean.toLowerCase()))
          return { error: `"${clean}" already exists.` }
        const position = state.companyTypes.length
        if (usingSupabase) {
          await sbCreateCompanyType(clean, position)
          await get().hydrate({ quiet: true })
          return { ok: true, name: clean }
        }
        set({
          companyTypes: [
            ...state.companyTypes,
            { id: uniqueId(slugify(clean), state.companyTypes.map((t) => t.id)), name: clean, position },
          ],
        })
        return { ok: true, name: clean }
      },

      // Renaming an option also relabels every company already using it.
      renameCompanyType: async (id, newName) => {
        const clean = String(newName || '').trim()
        if (!clean) return { error: 'Type name cannot be empty.' }
        const state = get()
        const old = state.companyTypes.find((t) => t.id === id)
        if (!old) return { error: 'Type not found.' }
        if (state.companyTypes.some((t) => t.id !== id && t.name.toLowerCase() === clean.toLowerCase()))
          return { error: `"${clean}" already exists.` }
        if (usingSupabase) {
          await sbRenameCompanyType(id, old.name, clean)
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        set({
          companyTypes: state.companyTypes.map((t) => (t.id === id ? { ...t, name: clean } : t)),
          companies: state.companies.map((c) =>
            c.companyType === old.name ? { ...c, companyType: clean } : c,
          ),
        })
        return { ok: true }
      },

      // Removing an option leaves companies already labelled with it untouched —
      // the label stays (marked "(removed)"), it just stops being offered.
      archiveCompanyType: (id) => get().archiveRecord('companyType', id),
      restoreCompanyType: (id) => get().restoreRecord('companyType', id),

      // ---- Orders / Estimates (epic #5, 5.1 / 5.2) -----------------------
      // An Order equips one Set: creating it also creates the shoot, so the job
      // lands on the calendar. A studio takes at most MAX_SETS_PER_DAY shoots a
      // day — the 6th is refused with an explanation rather than silently added.
      // Make an order's reservations real in Supabase mode (local mode already
      // re-derives them in memory — see reservationsFromOrders).
      //
      // CONFIRMED → the units its in-house lines resolve to are written to
      // set_units; HOLD or anything else → the set's rows are cleared. Only THIS
      // order's set is touched: a global recompute would rewrite every set on
      // every click.
      //
      // Availability is judged from a projection where a unit is takeable unless
      // it's out for repair or held by ANOTHER set — units this set already holds
      // count as free, otherwise re-confirming would find its own gear taken.
      // Fixed kit units stay off limits unless a kit line names one explicitly.
      // Returns { reserved, short } — `short` counts pieces the order asks for
      // that nothing was free to cover, so the UI can say so instead of quietly
      // reserving less than the paperwork claims.
      syncReservationsForOrder: async (orderId) => {
        if (!usingSupabase) return { ok: true, reserved: 0, short: 0 }
        const state = get()
        const order = state.orders.find((o) => o.id === orderId)
        if (!order?.setId) return { ok: true, reserved: 0, short: 0 }
        const booking = state.bookings.find((b) => b.id === order.setId)

        // CLOSED: the gear came back. The rows are MARKED returned, not deleted —
        // they're the unit's job history, and a returned row holds no stock.
        if (isClosedStatus(order.status)) {
          const released = (booking?.unitIds || []).length
          await sbMarkSetReturned(order.setId)
          return { ok: true, reserved: 0, short: 0, released }
        }
        // Hold / draft / canceled: nothing ever went out, so the rows go.
        if (order.status !== 'confirmed') {
          await sbSetReservationsForSet(order.setId, [])
          return { ok: true, reserved: 0, short: 0 }
        }

        const heldByThisSet = new Set(booking?.unitIds || [])
        // A unit is takeable unless it's away for repair or held by another set
        // ON THESE DAYS — so a camera out on Monday is still bookable for Tuesday.
        // Its own set's rows are dropped from the picture, or re-confirming an
        // order would find its own gear taken.
        const projection = state.inventory.map((item) => ({
          ...item,
          units: (item.units || []).map((u) => {
            if (openRepairOf(u)) return { ...u, status: 'in_repair', reservations: [] }
            const reservations = (u.reservations || []).filter(
              (r) => r.setId !== order.setId,
            )
            const free = heldByThisSet.has(u.id) || u.status !== 'checked_out'
            return { ...u, status: free ? 'available' : 'checked_out', reservations }
          }),
        }))

        // Pin-protect fixed kit units, except any this order's kit lines name.
        const namedUnits = new Set(
          (order.lines || []).map((l) => l.unitId).filter(Boolean),
        )
        const claimed = new Set(
          fixedUnitIdsOf(state.kits).filter((id) => !namedUnits.has(id)),
        )

        const ids = reservedUnitsForOrder(order, projection, claimed)

        // What the order asks for in-house vs what could actually be held.
        const asked = (order.lines || [])
          .filter((l) => l.source !== 'sub_rental')
          .reduce((n, l) => {
            const item = state.inventory.find((i) => i.id === l.itemId)
            // Only barcoded stock is unit-tracked; the rest isn't reserved at all.
            return item?.kind === 'barcoded' ? n + Math.max(1, Number(l.quantity) || 1) : n
          }, 0)

        const reserved = await sbSetReservationsForSet(order.setId, ids, {
          from: order.startsOn || null,
          to: order.endsOn || order.startsOn || null,
        })
        return { ok: true, reserved, short: Math.max(0, asked - ids.length) }
      },

      createOrder: async (order) => {
        const { jobName, studioId, startsOn } = order
        if (!jobName?.trim()) return { error: 'Give the job a name.' }
        if (!studioId) return { error: 'Pick a studio.' }
        if (!startsOn) return { error: 'Pick the set date.' }

        const used = usingSupabase
          ? await sbCountSetsOn(studioId, startsOn)
          : get().bookings.filter(
              (b) => b.studioId === studioId && b.date === startsOn && b.status === 'active',
            ).length
        if (used >= MAX_SETS_PER_DAY)
          return {
            error: `${studioLabel(studioId)} already has ${used} sets on ${startsOn} (max ${MAX_SETS_PER_DAY}). Pick another studio or date.`,
          }

        const logNew = (id) =>
          get().logActivity({
            type: EVENT.ORDER_CREATED,
            entityType: 'order',
            entityId: id,
            data: { jobName: jobName.trim(), studioId, startsOn, poNumber: order.poNumber ?? null },
          })

        if (usingSupabase) {
          const id = await sbCreateOrder({ ...order, status: order.status || 'hold' })
          await sbCreateSetForOrder(id, { jobName, studioId, date: startsOn })
          logNew(id)
          await get().hydrate({ quiet: true })
          return { ok: true, id }
        }

        const state = get()
        const id = uniqueId(
          `order-${slugify(jobName)}`,
          state.orders.map((o) => o.id),
        )
        const setId = uniqueId(
          `set-${slugify(jobName)}`,
          state.bookings.map((b) => b.id),
        )
        const booking = {
          id: setId,
          title: jobName.trim(),
          studioId,
          date: startsOn,
          startTime: order.startTime || '09:00',
          endTime: order.endTime || '18:00',
          photographer: order.photographer || '',
          model: '',
          unitIds: [],
          status: 'active',
          color: BOOKING_COLORS[state.bookings.length % BOOKING_COLORS.length],
          orderId: id,
        }
        const nextOrders = [
          ...state.orders,
          resolveOrder({ ...order, id, setId, setTitle: jobName.trim() }, state.companies),
        ].sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1))
        // A new order is a Hold (reserves nothing), but recompute anyway so the
        // one path stays correct if it ever arrives confirmed.
        const nextBookings = reservationsFromOrders(
          [...state.bookings, booking],
          nextOrders,
          state.inventory,
          fixedUnitIdsOf(state.kits),
        )
        set({
          bookings: nextBookings,
          orders: nextOrders,
          inventory: withReservations(state.inventory, nextBookings),
        })
        return { ok: true, id }
      },

      updateOrder: async (id, changes) => {
        // Status moves are the interesting ones: confirming is what commits gear.
        const before = get().orders.find((o) => o.id === id)
        const statusMoved = changes.status && before && changes.status !== before.status
        const reopened = statusMoved && isClosedStatus(before?.status)
        const statusEvent = () => {
          if (isClosedStatus(changes.status)) return EVENT.ORDER_CLOSED
          if (reopened) return EVENT.ORDER_REOPENED
          if (changes.status === 'confirmed') return EVENT.ORDER_CONFIRMED
          if (changes.status === 'hold') return EVENT.ORDER_HELD
          return EVENT.ORDER_UPDATED
        }
        const logStatus = (res) =>
          get().logActivity({
            type: statusEvent(),
            entityType: 'order',
            entityId: id,
            data: res
              ? isClosedStatus(changes.status)
                ? { released: res.released ?? 0 }
                : { reserved: res.reserved ?? 0, short: res.short ?? 0 }
              : { changed: Object.keys(changes) },
          })

        if (usingSupabase) {
          await sbUpdateOrder(id, changes)
          // Reservations follow the order: hydrate first so the sync sees the new
          // status/dates, then hydrate again to pick up the set_units it wrote.
          await get().hydrate({ quiet: true })
          let res = { reserved: 0, short: 0 }
          try {
            res = await get().syncReservationsForOrder(id)
            await get().hydrate({ quiet: true })
          } catch (e) {
            console.error('reservation sync failed:', e)
          }
          logStatus(statusMoved ? res : null)
          return { ok: true, ...res }
        }
        const state = get()
        // Local mode re-derives reservations in memory, so the count comes from
        // what the set was holding a moment ago.
        const held = (state.bookings.find((b) => b.id === before?.setId)?.unitIds || []).length
        logStatus(statusMoved && isClosedStatus(changes.status) ? { released: held } : null)
        const orders = state.orders
          .map((o) => (o.id === id ? resolveOrder({ ...o, ...changes, id }, state.companies) : o))
          .sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1))
        // The Set mirrors the order's job name, studio and set date.
        const target = orders.find((o) => o.id === id)
        const mirrored = state.bookings.map((b) =>
          target?.setId && b.id === target.setId
            ? {
                ...b,
                title: target.jobName ?? b.title,
                studioId: target.studioId ?? b.studioId,
                date: target.startsOn ?? b.date,
                photographer: target.photographer ?? b.photographer,
              }
            : b,
        )
        // A status change (Hold ↔ Confirmed) or edit re-derives what's reserved.
        const bookings = reservationsFromOrders(
          mirrored,
          orders,
          state.inventory,
          fixedUnitIdsOf(state.kits),
        )
        set({ orders, bookings, inventory: withReservations(state.inventory, bookings) })
        return { ok: true }
      },

      // 5.3 — replace an order's equipment lines. Lines arrive as
      // { itemId, quantity, kitId?, unitId?, slotLabel? }; names and day rates are
      // resolved here so the estimate and the PDF read the same numbers.
      setOrderLines: async (orderId, lines) => {
        // "The order is attributed to whoever last added inventory to it" — this
        // is that moment, and until now it left no trace at all. The lines are
        // replaced wholesale, so diff against the previous ones: the log has to
        // say WHAT changed, not just that something did.
        const prevLines = get().orders.find((o) => o.id === orderId)?.lines ?? []
        const eqStats = diffOrderLines(prevLines, lines)
        if (usingSupabase) {
          await sbSetOrderLines(orderId, lines)
          await sbTouchOrderEquipment(orderId, get().session?.user?.id ?? null)
          get().logActivity({
            type: EVENT.EQ_CHANGED,
            entityType: 'order',
            entityId: orderId,
            data: eqStats,
          })
          await get().hydrate({ quiet: true })
          // Editing a CONFIRMED order's gear changes what it holds.
          let res = { reserved: 0, short: 0 }
          try {
            res = await get().syncReservationsForOrder(orderId)
            await get().hydrate({ quiet: true })
          } catch (e) {
            console.error('reservation sync failed:', e)
          }
          return { ok: true, ...res }
        }
        get().logActivity({
          type: EVENT.EQ_CHANGED,
          entityType: 'order',
          entityId: orderId,
          data: eqStats,
        })
        const state = get()
        const byId = Object.fromEntries(state.inventory.map((i) => [i.id, i]))
        const unitBarcode = {}
        for (const item of state.inventory)
          for (const u of item.units || []) unitBarcode[u.id] = u.barcode

        const resolved = (lines || [])
          .filter((l) => l.itemId)
          .map((l, i) => ({
            id: l.id ?? `line-${orderId}-${i}`,
            itemId: l.itemId,
            itemName: byId[l.itemId]?.name ?? l.itemName ?? null,
            quantity: Math.max(1, Number(l.quantity) || 1),
            dayRate: byId[l.itemId]?.dayRate ?? null,
            kitId: l.kitId ?? null,
            unitId: l.unitId ?? null,
            barcode: l.barcode ?? (l.unitId ? unitBarcode[l.unitId] ?? null : null),
            slotLabel: l.slotLabel ?? null,
            source: l.source === 'sub_rental' ? 'sub_rental' : 'in_house',
            vendorId: l.source === 'sub_rental' ? l.vendorId ?? null : null,
            vendorName:
              l.source === 'sub_rental'
                ? state.companies.find((c) => c.id === l.vendorId)?.name ?? null
                : null,
          }))
        const nextOrders = state.orders.map((o) =>
          o.id === orderId
            ? {
                ...o,
                lines: resolved,
                // Same headline as the Supabase columns, kept in memory.
                eqUpdatedBy: state.profile?.full_name || LOCAL_ACTOR,
                eqUpdatedAt: new Date().toISOString(),
              }
            : o,
        )
        // Changing a confirmed order's lines changes what it reserves.
        const bookings = reservationsFromOrders(
          state.bookings,
          nextOrders,
          state.inventory,
          fixedUnitIdsOf(state.kits),
        )
        set({ orders: nextOrders, bookings, inventory: withReservations(state.inventory, bookings) })
        return { ok: true }
      },

      // Digital packing checklist (6.2 / 6.5). Optimistic — the sign-off shows
      // instantly and persists to Supabase in the background (a packing station
      // shouldn't wait on a round-trip). Initials are the "who"; `at` is the when.
      signPackingLine: (orderId, lineKey, slot, initials, itemName) => {
        const ini = (initials || '').trim().toUpperCase()
        if (!ini) return
        const at = new Date().toISOString()
        set({
          orders: get().orders.map((o) =>
            o.id !== orderId
              ? o
              : {
                  ...o,
                  packing: {
                    ...(o.packing || {}),
                    [lineKey]: { ...((o.packing || {})[lineKey] || {}), [slot]: { initials: ini, at } },
                  },
                },
          ),
        })
        // The initials stay hand-typed (that's the paper-equivalent), but the
        // ACT of signing is now attributed to the signed-in account — so "AT" is
        // backed by a name instead of being anonymous free text.
        get().logActivity({
          type: EVENT.PACKING_SIGNED,
          entityType: 'order',
          entityId: orderId,
          data: { slot, initials: ini, itemName: itemName ?? null, lineKey },
        })
        if (usingSupabase)
          sbSetPackingSignoff(orderId, lineKey, slot, ini, itemName).catch((e) =>
            console.error('packing sign-off failed:', e),
          )
      },

      clearPackingSignoff: (orderId, lineKey, slot) => {
        set({
          orders: get().orders.map((o) =>
            o.id !== orderId
              ? o
              : {
                  ...o,
                  packing: {
                    ...(o.packing || {}),
                    [lineKey]: { ...((o.packing || {})[lineKey] || {}), [slot]: null },
                  },
                },
          ),
        })
        // Un-signing used to erase the only "who" the packing flow had.
        get().logActivity({
          type: EVENT.PACKING_CLEARED,
          entityType: 'order',
          entityId: orderId,
          data: { slot, lineKey },
        })
        if (usingSupabase)
          sbClearPackingSignoff(orderId, lineKey, slot).catch((e) =>
            console.error('packing clear failed:', e),
          )
      },

      // --- the scanning station (epic #6) ----------------------------------
      //
      // One scan. Validation lives in `lib/scanning` (pure, asserted under Node);
      // this only writes: append to the order's log, move the reservation row's
      // status so the DB says where the copy is, and put the act in the activity
      // feed with the account that did it.
      //
      // OPTIMISTIC, like the packing sign-off: a scanning station cannot wait on
      // a round-trip while someone holds a camera over the reader.
      scanUnit: (orderId, code, direction) => {
        const state = get()
        const order = state.orders.find((o) => o.id === orderId)
        if (!order) return { error: 'That order is gone — reload.' }
        const booking = state.bookings.find((b) => b.id === order.setId)
        const expected = expectedUnits(order, booking, state.inventory)
        const res = resolveScan(code, {
          order,
          expected,
          scans: order.scans || [],
          direction,
          inventory: state.inventory,
        })
        if (!res.ok) return res

        const unit = res.unit
        const at = new Date().toISOString()
        const entry = {
          id: `scan-${unit.unitId}-${at}`,
          setId: order.setId ?? null,
          unitId: unit.unitId,
          itemId: unit.itemId,
          barcode: unit.barcode,
          itemName: unit.itemName,
          direction,
          at,
          by: state.profile?.fullName ?? 'Demo user',
        }
        set({
          orders: state.orders.map((o) =>
            o.id === orderId ? { ...o, scans: [...(o.scans || []), entry] } : o,
          ),
        })

        get().logActivity({
          type: direction === SCAN_OUT ? EVENT.SCANNED_OUT : EVENT.SCANNED_IN,
          entityType: 'order',
          entityId: orderId,
          unitId: unit.unitId,
          data: { barcode: unit.barcode, itemName: unit.itemName },
        })

        if (usingSupabase) {
          sbLogScan({
            orderId,
            setId: order.setId,
            unitId: unit.unitId,
            itemId: unit.itemId,
            barcode: unit.barcode,
            itemName: unit.itemName,
            direction,
          }).catch((e) => {
            // The scan showed instantly (a station can't wait on a round-trip),
            // so a failed write has to be TAKEN BACK and said out loud —
            // otherwise the screen claims gear moved and a reload disagrees.
            // This is also what a pre-migration database looks like.
            console.error('scan log failed:', e)
            set({
              orders: get().orders.map((o) =>
                o.id === orderId
                  ? { ...o, scans: (o.scans || []).filter((x) => x.id !== entry.id) }
                  : o,
              ),
              scanSyncError: `That scan didn't reach the database (${e?.message ?? 'write refused'}) — nothing was recorded.`,
            })
          })
          // 'checked_out' and 'reserved' both occupy the unit, so this changes
          // what the DB says about WHERE the copy is, never what is available.
          sbSetSetUnitStatus(
            order.setId,
            unit.unitId,
            direction === SCAN_OUT ? 'checked_out' : 'reserved',
          ).catch((e) => console.error('set_unit status failed:', e))
        }

        set({ scanSyncError: null })
        return { ok: true, unit, direction, at }
      },

      clearScanSyncError: () => set({ scanSyncError: null }),

      // Archiving an order releases its gear AND takes its shoot off the calendar:
      // the shoot exists because this order equips it, so leaving a phantom
      // booking behind (which is what deleting used to do) was the wrong default.
      // Its lines and packing sign-offs are all kept.
      archiveOrder: async (id) => {
        const order = get().orders.find((o) => o.id === id)
        if (!order) return { error: 'Order not found.' }
        const held = get().bookings.find((b) => b.id === order.setId)?.unitIds?.length ?? 0
        const logIt = () =>
          get().logActivity({
            type: EVENT.ARCHIVED,
            entityType: 'order',
            entityId: id,
            data: {
              what: 'order',
              name: order.jobName || order.number,
              releasedUnits: held || null,
            },
          })

        if (usingSupabase) {
          try {
            await sbArchiveOrder(id, order.setId ?? null, get().session?.user?.id ?? null)
          } catch (e) {
            return { error: e.message }
          }
          logIt()
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        logIt()
        const state = get()
        const stamp = new Date().toISOString()
        const orders = state.orders.map((o) =>
          o.id === id ? { ...o, archivedAt: stamp, archivedBy: LOCAL_ACTOR } : o,
        )
        // The shoot goes with it, and its units are freed by the re-derivation
        // (an archived order reserves nothing — see reservationsFromOrders).
        const bookings = reservationsFromOrders(
          state.bookings.map((b) =>
            b.id === order.setId ? { ...b, archivedAt: stamp, archivedBy: LOCAL_ACTOR } : b,
          ),
          orders,
          state.inventory,
          fixedUnitIdsOf(state.kits),
        )
        set({ orders, bookings, inventory: withReservations(state.inventory, bookings) })
        return { ok: true }
      },

      // Restoring re-runs the reservation sync rather than assuming the gear is
      // still free — it reports what it could and couldn't take back.
      restoreOrder: async (id) => {
        const state = get()
        const order = state.orders.find((o) => o.id === id)
        if (!order) return { error: 'Order not found.' }
        const stamp = order.archivedAt
        get().logActivity({
          type: EVENT.RESTORED,
          entityType: 'order',
          entityId: id,
          data: { what: 'order', name: order.jobName || order.number },
        })
        if (usingSupabase) {
          try {
            await sbRestoreOrder(id, order.setId ?? null, stamp)
          } catch (e) {
            return { error: e.message }
          }
          await get().hydrate({ quiet: true })
          const res = await get().syncReservationsForOrder(id)
          return { ok: true, ...res }
        }
        const orders = state.orders.map((o) =>
          o.id === id ? { ...o, archivedAt: null, archivedBy: null } : o,
        )
        const bookings = reservationsFromOrders(
          state.bookings.map((b) =>
            // Only the shoot that went down with THIS order comes back.
            b.id === order.setId && b.archivedAt === stamp
              ? { ...b, archivedAt: null, archivedBy: null }
              : b,
          ),
          orders,
          state.inventory,
          fixedUnitIdsOf(state.kits),
        )
        set({ orders, bookings, inventory: withReservations(state.inventory, bookings) })
        return { ok: true }
      },

      // Create a booking and reserve its selected units.
      createBooking: async (data) => {
        if (usingSupabase) {
          const id = await sbCreateBooking(data)
          await get().hydrate({ quiet: true })
          return id
        }
        const state = get()
        const booking = {
          id: `set-${Date.now().toString(36)}`,
          status: 'active',
          color: data.color || BOOKING_COLORS[state.bookings.length % BOOKING_COLORS.length],
          unitIds: [],
          ...data,
        }
        const bookings = [...state.bookings, booking]
        set({ bookings, inventory: withReservations(state.inventory, bookings) })
        return booking.id
      },

      // Update a booking and re-reserve units to match its new unit list.
      updateBooking: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateBooking(id, changes)
          await get().hydrate({ quiet: true })
          return
        }
        const state = get()
        const bookings = state.bookings.map((b) =>
          b.id === id ? { ...b, ...changes } : b,
        )
        set({ bookings, inventory: withReservations(state.inventory, bookings) })
      },

      // Archive a shoot: off the calendar, its gear released, its roster and unit
      // history kept. (An order-driven shoot normally goes via archiveOrder; this
      // is the path for a legacy order-less booking.)
      archiveBooking: async (id) => {
        const booking = get().bookings.find((b) => b.id === id)
        if (!booking) return { error: 'Shoot not found.' }
        const logIt = () =>
          get().logActivity({
            type: EVENT.ARCHIVED,
            entityType: 'booking',
            entityId: id,
            data: {
              what: 'booking',
              name: booking.title,
              releasedUnits: booking.unitIds?.length || null,
            },
          })
        if (usingSupabase) {
          try {
            await sbArchiveBooking(id, get().session?.user?.id ?? null)
          } catch (e) {
            return { error: e.message }
          }
          logIt()
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        logIt()
        const state = get()
        const bookings = state.bookings.map((b) =>
          b.id === id
            ? { ...b, archivedAt: new Date().toISOString(), archivedBy: LOCAL_ACTOR, unitIds: [] }
            : b,
        )
        set({ bookings, inventory: withReservations(state.inventory, bookings) })
        return { ok: true }
      },

      restoreBooking: async (id) => {
        const state = get()
        const booking = state.bookings.find((b) => b.id === id)
        if (!booking) return { error: 'Shoot not found.' }
        get().logActivity({
          type: EVENT.RESTORED,
          entityType: 'booking',
          entityId: id,
          data: { what: 'booking', name: booking.title },
        })
        if (usingSupabase) {
          try {
            await sbRestoreBooking(id)
          } catch (e) {
            return { error: e.message }
          }
          await get().hydrate({ quiet: true })
          return { ok: true }
        }
        const bookings = state.bookings.map((b) =>
          b.id === id ? { ...b, archivedAt: null, archivedBy: null } : b,
        )
        set({ bookings, inventory: withReservations(state.inventory, bookings) })
        return { ok: true }
      },
    }),
    {
      name: STORAGE_KEY,
      // Bumped for 4.1/4.2: older persisted state has no people/companies, so it
      // is reseeded rather than merged into a half-filled shape.
      // v2 added people/companies; v3 added orders' epic-5 fields and the day
      // rates the estimate multiplies. An older snapshot has neither, and a
      // half-filled shape would quietly total $0.00 — so it is reseeded.
      // v4 adds the local-mode activity log: a v3 snapshot has no `activity`, so
      // the seeded "who did what" narrative would be missing forever.
      // v5 adds the archive fields. A v4 snapshot's records have no `archivedAt`,
      // which reads as "live" — harmless in itself, but the seed also gains the
      // archive-aware projections, so it is reseeded like every bump before it.
      version: 5,
      migrate: (persisted, version) => {
        if (version >= 5) return persisted
        return usingSupabase
          ? { activeView: persisted?.activeView ?? 'calendar' }
          : { ...buildSeedData(), activeView: persisted?.activeView ?? 'calendar' }
      },
      // Local mode persists data to localStorage. Supabase mode persists only
      // UI state — data always comes fresh from the database.
      partialize: (state) =>
        usingSupabase
          ? { activeView: state.activeView }
          : {
              inventory: state.inventory,
              bookings: state.bookings,
              kits: state.kits,
              scenarios: state.scenarios,
              people: state.people,
              companies: state.companies,
              companyTypes: state.companyTypes,
              orders: state.orders,
              activity: state.activity,
              activeView: state.activeView,
            },
    },
  ),
)
