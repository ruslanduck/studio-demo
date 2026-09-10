import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Minus,
  X,
  Check,
  Layers,
  Package,
  RefreshCw,
  AlertTriangle,
  Truck,
  Home,
  ScanLine,
} from 'lucide-react'
import Modal from './Modal'
import KitStagingModal from './KitStagingModal'
import UnitPickList from './UnitPickList'
import SelectField from './SelectField'
import AddInventoryModal from './AddInventoryModal'
import CompanyEditorModal from './CompanyEditorModal'
import { normalizeBarcode } from '../lib/scanning'
import { studioLabel } from '../data/studios'
import { setSpanDays } from '../lib/setDays'
import { useStore, notArchived } from '../store'
import { applyScenarioList } from '../lib/scenarios'
import { buildEstimate, money } from '../lib/estimate'
import { availableCount, freeUnitsOf, resolveUnitsForQuantities } from '../lib/availability'

// Equipment entry for an order (epic #5, 5.3 + 5.6).
//
// This window is also STEP TWO of creating an order: the order form hands it a
// draft (an order-shaped object with no id) and the button reads "Create order",
// writing the order and its gear in one go. Backing out writes nothing at all.
//
// 5.3 — three ways in, all reused from earlier epics: a-la-carte items, whole
// KITS through the epic-3 staging window (which pins a concrete unit per slot),
// and predefined SCENARIO LISTS (3.5). A kit's composition stays editable after
// it was added.
//
// 5.6 — every a-la-carte line is either IN-HOUSE (our stock, consumes
// availability) or SUB-RENTAL (brought in from a vendor, consumes none and needs
// the vendor named). Availability itself comes from `lib/availability` so kits,
// lists and loose lines can never promise the same unit twice, and an item with
// nothing left can't be added in-house — the error offers the sub-rental instead
// of dead-ending.
//
// Kit lines are in-house by definition: the staging window pins real units we own.
const IN_HOUSE = 'in_house'
const SUB_RENTAL = 'sub_rental'
// A sentinel option value, not a company id: picking it opens the editor.
const NEW_VENDOR = '__new_vendor__'

export default function OrderEquipmentModal({
  open,
  order,
  inventory,
  kits,
  scenarios,
  companies = [],
  onClose,
  onSave,
}) {
  // Writes the staging window can make on real stock (repair log, barcode fix).
  const sendToRepair = useStore((st) => st.sendToRepair)
  const setUnitBarcode = useStore((st) => st.setUnitBarcode)
  // Stock and vendors can be created from here: a piece of gear that isn't in
  // the register yet, or a rental house nobody has filed, used to be a dead end
  // that sent the crew to another screen and lost this window's picks.
  const addInventoryItem = useStore((st) => st.addInventoryItem)
  const createCompany = useStore((st) => st.createCompany)
  const companyTypes = useStore((st) => st.companyTypes)
  const createCompanyType = useStore((st) => st.createCompanyType)
  const renameCompanyType = useStore((st) => st.renameCompanyType)
  const archiveCompanyType = useStore((st) => st.archiveCompanyType)
  const [itemLines, setItemLines] = useState([]) // { itemId, quantity, source, vendorId }
  const [stagedUnits, setStagedUnits] = useState([]) // kit lines (unit-level)
  const [staging, setStaging] = useState(null)
  const [picker, setPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [applied, setApplied] = useState(null)
  const [blocked, setBlocked] = useState(null) // { itemId, name } — hit 0 available
  // Which a-la-carte line is choosing a copy: the line's index, or null.
  const [copyPicker, setCopyPicker] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  // What the last scan did — reported, because a reader that swallows a code
  // silently is indistinguishable from a broken one.
  const [scan, setScan] = useState('')
  const [scanNote, setScanNote] = useState(null)
  // Creating stock / a vendor without leaving this window. `newVendorFor` holds
  // the line index that asked, so the company lands on the right one.
  const [newItemOpen, setNewItemOpen] = useState(false)
  const [newVendorFor, setNewVendorFor] = useState(null)

  // Load the order's existing lines back into the two buckets.
  useEffect(() => {
    if (!open || !order) return
    const items = []
    const staged = []
    for (const l of order.lines ?? []) {
      if (l.kitId) {
        staged.push({
          unitId: l.unitId,
          itemId: l.itemId,
          itemName: l.itemName,
          barcode: l.barcode,
          label: l.slotLabel,
          kitId: l.kitId,
          kitName: kits.find((k) => k.id === l.kitId)?.name ?? 'Kit',
        })
      } else if (l.unitId) {
        // A loose line that names a COPY (chosen or scanned, not from a kit).
        // Folded back into that item's line as a pinned copy, so the crew sees
        // one line with its barcodes rather than N one-piece lines.
        const at = items.findIndex((x) => x.itemId === l.itemId && x.source === IN_HOUSE)
        const pin = { unitId: l.unitId, barcode: l.barcode ?? null }
        if (at === -1)
          items.push({
            itemId: l.itemId,
            quantity: 1,
            source: IN_HOUSE,
            vendorId: null,
            dayRate: l.rateOverridden ? l.dayRate ?? null : null,
            rateOverridden: !!l.rateOverridden,
            units: [pin],
          })
        else {
          items[at] = {
            ...items[at],
            quantity: items[at].quantity + 1,
            units: [...(items[at].units ?? []), pin],
          }
        }
      } else {
        const at = items.findIndex((x) => x.itemId === l.itemId && x.source === IN_HOUSE)
        const loose = {
          itemId: l.itemId,
          quantity: l.quantity ?? 1,
          source: l.source === SUB_RENTAL ? SUB_RENTAL : IN_HOUSE,
          vendorId: l.vendorId ?? null,
          // A rate typed on this line before; null means "follow the item".
          dayRate: l.rateOverridden ? l.dayRate ?? null : null,
          rateOverridden: !!l.rateOverridden,
          units: [],
        }
        // Pinned copies of the same item arrived as their own rows; merge the
        // quantity into that line instead of showing two.
        if (at !== -1 && loose.source === IN_HOUSE)
          items[at] = { ...items[at], quantity: items[at].quantity + loose.quantity }
        else items.push(loose)
      }
    }
    setItemLines(items)
    setStagedUnits(staged)
    setStaging(null)
    setPicker(false)
    setPickerSearch('')
    setApplied(null)
    setBlocked(null)
    setError(null)
    setBusy(false)
  }, [open, order, kits])

  const itemsById = useMemo(() => Object.fromEntries(inventory.map((i) => [i.id, i])), [inventory])
  // Copies chosen on a loose line are spoken for just like a kit's units — they
  // must leave the free pool, or two lines could name the same camera.
  const pinnedIds = useMemo(
    () => new Set(itemLines.flatMap((l) => (l.units ?? []).map((u) => u.unitId))),
    [itemLines],
  )
  const stagedIds = useMemo(
    () => new Set([...stagedUnits.map((u) => u.unitId), ...pinnedIds]),
    [stagedUnits, pinnedIds],
  )
  // Availability is asked about the ORDER's set date (see lib/availability).
  const dateWindow = useMemo(
    () => ({ from: order?.startsOn || null, to: order?.endsOn || order?.startsOn || null }),
    [order?.startsOn, order?.endsOn],
  )
  // Gear THIS order's shoot already holds counts as free while editing it —
  // otherwise re-opening a confirmed order would find its own kit taken.
  const ownUnits = useMemo(() => {
    if (!order?.setId) return new Set()
    const ids = new Set()
    for (const item of inventory)
      for (const u of item.units || [])
        if ((u.reservations || []).some((r) => r.setId === order.setId)) ids.add(u.id)
    return ids
  }, [inventory, order?.setId])

  // One availability context for the whole modal: what's staged here is taken,
  // what this shoot already holds is free, and the question is about its dates.
  const avCtx = useMemo(
    () => ({ claimed: stagedIds, alsoFree: ownUnits, window: dateWindow }),
    [stagedIds, ownUnits, dateWindow],
  )

  // Every barcode the register holds, so a PASTED code can fire without waiting
  // for an Enter a paste never sends (a reader does).
  const knownBarcodes = useMemo(() => {
    const set = new Set()
    for (const item of inventory)
      if (notArchived(item))
        for (const u of item.units || []) if (notArchived(u) && u.barcode) set.add(u.barcode)
    return set
  }, [inventory])

  const vendors = useMemo(
    // Any company can be one we rented from: the client/vendor/both axis was
    // dropped, and the Type list is the studio's own to manage.
    () => companies.filter(notArchived),
    [companies],
  )

  // What this order already takes from our own stock for an item.
  const inHouseQty = (itemId) =>
    itemLines
      .filter((l) => l.itemId === itemId && l.source === IN_HOUSE)
      .reduce((n, l) => n + l.quantity, 0)

  // Shared availability rule, minus what this order's own in-house lines take.
  // Sub-rental lines are deliberately not subtracted — that gear isn't ours.
  const remainingFor = (item) =>
    Math.max(0, availableCount(item, avCtx) - inHouseQty(item?.id))

  // How much this order's in-house lines exceed what's actually free. Over
  // capacity is ALLOWED (you can't always wait for the gear to come back), but it
  // must be visible on the line and in the footer — the resolver reserves only
  // what exists, so the difference is simply not held.
  //
  // ⚠️ A copy THIS order pinned is part of what it asks for, not something taken
  // away from it. Pinned ids join `claimed` (so no other line or kit can grab
  // the same copy), and subtracting that from what we ask made a line report
  // itself over capacity for every copy it named — visible the moment a scan
  // pins one. Our own pins are put back before the comparison.
  const overFor = (item) => {
    if (item?.kind !== 'barcoded') return 0
    const ownPins = new Set(
      itemLines
        .filter((l) => l.itemId === item.id && l.source === IN_HOUSE)
        .flatMap((l) => (l.units ?? []).map((u) => u.unitId)),
    )
    const claimed = new Set([...stagedIds].filter((id) => !ownPins.has(id)))
    return Math.max(0, inHouseQty(item.id) - availableCount(item, { ...avCtx, claimed }))
  }

  const lines = useMemo(
    () => [
      ...stagedUnits.map((u) => ({
        itemId: u.itemId,
        itemName: u.itemName,
        quantity: 1,
        kitId: u.kitId,
        unitId: u.unitId,
        barcode: u.barcode,
        slotLabel: u.label,
        source: IN_HOUSE,
        vendorId: null,
        dayRate: itemsById[u.itemId]?.dayRate ?? null,
      })),
      ...itemLines.flatMap((l) => {
        const rate = {
          // A typed rate is what this line costs; otherwise the item's own.
          dayRate:
            l.rateOverridden && l.dayRate != null ? l.dayRate : itemsById[l.itemId]?.dayRate ?? null,
          itemDayRate: itemsById[l.itemId]?.dayRate ?? null,
          rateOverridden: !!l.rateOverridden && l.dayRate != null,
        }
        const pinned = l.units ?? []
        // A chosen copy is stored the same way a kit slot's unit is — a
        // unit-level line — which is why reservations, packing and scanning need
        // no special case for it (`reservedUnitsForOrder` pre-claims any line
        // that names a unit).
        const rows = pinned.map((u) => ({
          itemId: l.itemId,
          itemName: itemsById[l.itemId]?.name ?? null,
          quantity: 1,
          unitId: u.unitId,
          barcode: u.barcode ?? null,
          source: l.source,
          vendorId: l.vendorId,
          ...rate,
        }))
        const rest = l.quantity - pinned.length
        if (rest > 0)
          rows.push({
            itemId: l.itemId,
            itemName: itemsById[l.itemId]?.name ?? null,
            quantity: rest,
            source: l.source,
            vendorId: l.vendorId,
            ...rate,
          })
        return rows
      }),
    ],
    [stagedUnits, itemLines, itemsById],
  )

  const estimate = useMemo(
    () => buildEstimate({ ...order, lines }, { inventory, kits }),
    [order, lines, inventory, kits],
  )

  // 5.6 — a loose in-house line only carries a quantity, so resolve those to real
  // unit ids and hand them to the staging window alongside the kit units.
  // Without this a kit slot and a loose line can both take the last free unit.
  const reservedForStaging = useMemo(
    () => [
      ...stagedUnits.map((u) => u.unitId),
      ...pinnedIds,
      // Only the UNPINNED remainder of each line still has to be resolved from
      // the pool; the pinned copies are already named above.
      ...resolveUnitsForQuantities(
        itemLines
          .filter((l) => l.source === IN_HOUSE)
          .map((l) => ({ ...l, quantity: l.quantity - (l.units ?? []).length })),
        inventory,
        avCtx,
      ),
    ],
    [stagedUnits, pinnedIds, itemLines, inventory, avCtx],
  )

  const kitGroups = useMemo(() => {
    const groups = []
    const byKit = new Map()
    for (const u of stagedUnits) {
      if (!byKit.has(u.kitId)) {
        const g = { kitId: u.kitId, name: u.kitName, units: [] }
        byKit.set(u.kitId, g)
        groups.push(g)
      }
      byKit.get(u.kitId).units.push(u)
    }
    return groups
  }, [stagedUnits])

  function applyList(list) {
    // applyScenarioList speaks the booking modal's shape, so convert in-house
    // lines to a qty map and back. Sub-rental lines are left untouched.
    const selected = {}
    for (const l of itemLines.filter((x) => x.source === IN_HOUSE))
      selected[l.itemId] = (selected[l.itemId] ?? 0) + l.quantity
    const res = applyScenarioList({
      list,
      inventory,
      kits,
      selected,
      stagedUnits,
      bookingUnits: ownUnits,
      dateWindow,
    })
    const nextInHouse = Object.entries(res.selected).map(([itemId, quantity]) => ({
      itemId,
      quantity,
      source: IN_HOUSE,
      vendorId: null,
    }))
    setItemLines([...itemLines.filter((l) => l.source === SUB_RENTAL), ...nextInHouse])
    setStagedUnits(res.stagedUnits)
    setApplied({ name: list.name, ...res })
    setBlocked(null)
    setError(null)
  }

  // 5.6 — the zero-availability block. Adding in-house is refused when nothing is
  // left; the sub-rental route is offered right there.
  function addItem(itemId, source = IN_HOUSE, { force = false } = {}) {
    const item = itemsById[itemId]
    // Nothing free: offer the choices instead of adding silently. `force` is the
    // "Add anyway" answer — over capacity is allowed, it just has to be visible.
    if (source === IN_HOUSE && !force && remainingFor(item) <= 0) {
      setBlocked({ itemId, name: item.name })
      setPicker(false)
      return
    }
    setItemLines((prev) => {
      const at = prev.findIndex((l) => l.itemId === itemId && l.source === source)
      if (at !== -1 && source === IN_HOUSE) {
        const next = [...prev]
        next[at] = { ...next[at], quantity: next[at].quantity + 1 }
        return next
      }
      if (at !== -1 && source === SUB_RENTAL) {
        const next = [...prev]
        next[at] = { ...next[at], quantity: next[at].quantity + 1 }
        return next
      }
      return [...prev, { itemId, quantity: 1, source, vendorId: null }]
    })
    setPicker(false)
    setPickerSearch('')
    setBlocked(null)
    setError(null)
  }

  // Add stock by SCANNING it, which is how a crew works at the shelf: the code
  // names one physical copy, so the item goes on the order AND that copy is
  // pinned to it. Same rule as the per-line copy picker — a scan fills the next
  // unpinned piece and only grows the quantity once every piece is named.
  //
  // `normalizeBarcode` is shared with the scanning station: a code copied off
  // the screen carries the decorative `#`, and a reader sends a trailing CR.
  function scanIn(raw) {
    const code = normalizeBarcode(raw)
    if (!code) return
    setScan('')
    setError(null)
    const item = inventory.find(
      (i) => notArchived(i) && (i.units || []).some((u) => u.barcode === code),
    )
    const unit = item ? (item.units || []).find((u) => u.barcode === code) : null
    if (!item || !unit) {
      setScanNote({ bad: true, text: `#${code} isn't in the register.` })
      return
    }
    if (!notArchived(unit)) {
      setScanNote({ bad: true, text: `#${code} was written off.` })
      return
    }
    // Already on this order — say so rather than counting it twice.
    if (itemLines.some((l) => (l.units ?? []).some((u) => u.unitId === unit.id))) {
      setScanNote({ bad: true, text: `#${code} is already on this order.` })
      return
    }
    if (stagedUnits.some((u) => u.unitId === unit.id)) {
      setScanNote({ bad: true, text: `#${code} is already in a kit on this order.` })
      return
    }
    // A copy someone else holds for these days can't be pinned: the pull sheet
    // would name a piece that isn't coming. The item can still be added by name
    // ("add anyway"), which is a deliberate, visible over-capacity choice.
    if (!freeUnitsOf(item, avCtx).some((u) => u.id === unit.id)) {
      const held = (unit.reservations || [])[0]
      setScanNote({
        bad: true,
        text: `#${code} ${item.name} isn't free for these dates${held?.setTitle ? ` — ${held.setTitle} has it` : ''}.`,
      })
      return
    }
    setItemLines((prev) => {
      const at = prev.findIndex((l) => l.itemId === item.id && l.source === IN_HOUSE)
      const pin = { unitId: unit.id, barcode: unit.barcode ?? null }
      if (at === -1)
        return [...prev, { itemId: item.id, quantity: 1, source: IN_HOUSE, vendorId: null, units: [pin] }]
      const line = prev[at]
      const units = line.units ?? []
      const next = [...prev]
      next[at] = {
        ...line,
        quantity: Math.max(line.quantity, units.length + 1),
        units: [...units, pin],
      }
      return next
    })
    setScanNote({ bad: false, text: `#${code} → ${item.name} · copy pinned` })
  }

  // A brand-new item type, created here and added straight to the order. The
  // line only needs the id: `inventory` comes from the store through a prop, so
  // the row resolves its name in the same commit as this state change.
  async function createItemAndAdd(payload) {
    setNewItemOpen(false)
    const id = await addInventoryItem(payload)
    if (!id) {
      setError('The item could not be created.')
      return
    }
    setItemLines((prev) => [...prev, { itemId: id, quantity: 1, source: IN_HOUSE, vendorId: null }])
    setPicker(false)
    setPickerSearch('')
    setBlocked(null)
    setError(null)
    setScanNote({ bad: false, text: `${payload.name} added to the register and to this order` })
  }

  // A vendor nobody has filed yet, created for the line that asked for one.
  async function createVendorForLine(company) {
    const index = newVendorFor
    setNewVendorFor(null)
    const id = await createCompany(company)
    if (!id) {
      setError('The company could not be created.')
      return
    }
    if (index != null) updateLine(index, { vendorId: id })
  }

  const updateLine = (index, changes) =>
    setItemLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...changes } : l)))

  // A sub-rental line is the vendor's gear: it has no copy of OURS to name, so
  // any pinned copies are released when a line moves over.
  const clearPins = (index) =>
    setItemLines((prev) => prev.map((l, i) => (i === index ? { ...l, units: [] } : l)))

  // What this line costs per day. Typing a number overrides the item's rate for
  // THIS line only — the item everyone else quotes from is untouched. Clearing
  // the field goes back to following the item.
  function setLineRate(index, raw) {
    const t = String(raw ?? '').trim()
    if (t === '') return updateLine(index, { dayRate: null, rateOverridden: false })
    const n = Number(t.replace(',', '.'))
    if (!Number.isFinite(n) || n < 0) return
    updateLine(index, { dayRate: n, rateOverridden: true })
  }

  const removeLine = (index) => setItemLines((prev) => prev.filter((_, i) => i !== index))

  // Choosing WHICH copy goes on the job, for a plain item — the same question a
  // kit slot asks. Pinning does not change the quantity: it says which piece the
  // n-th one is. Non-barcoded stock has no copies to choose, so the UI never
  // offers this for it.
  function pinUnit(index, unit) {
    setItemLines((prev) =>
      prev.map((l, i) => {
        if (i !== index) return l
        const units = l.units ?? []
        if (units.some((u) => u.unitId === unit.id)) return l
        return {
          ...l,
          // Pinning the (n+1)-th copy of a line that only asked for n pieces
          // means the crew wants one more.
          quantity: Math.max(l.quantity, units.length + 1),
          units: [...units, { unitId: unit.id, barcode: unit.barcode ?? null }],
        }
      }),
    )
    setCopyPicker(null)
    setError(null)
  }

  // Back to "any free copy" for that piece — the resolver picks one at confirm.
  function unpinUnit(index, unitId) {
    setItemLines((prev) =>
      prev.map((l, i) =>
        i === index ? { ...l, units: (l.units ?? []).filter((u) => u.unitId !== unitId) } : l,
      ),
    )
  }

  function stepLine(index, delta) {
    const line = itemLines[index]
    const item = itemsById[line.itemId]
    const next = line.quantity + delta
    if (next <= 0) return removeLine(index)
    // Fewer pieces than pinned copies is a contradiction: drop the last pin with
    // the piece it belonged to.
    if (delta < 0 && next < (line.units ?? []).length) {
      const last = line.units[line.units.length - 1]
      unpinUnit(index, last.unitId)
    }
    // In-house is capped by what's actually free; a vendor's stock is not ours to cap.
    if (line.source === IN_HOUSE && delta > 0 && remainingFor(item) <= 0) {
      setBlocked({ itemId: line.itemId, name: item.name, intent: 'add' })
      return
    }
    updateLine(index, { quantity: next })
  }

  // Switching a line to sub-rental frees the in-house units it was holding.
  function switchSource(index, source, { force = false } = {}) {
    const line = itemLines[index]
    if (source === IN_HOUSE && !force) {
      const item = itemsById[line.itemId]
      const free = availableCount(item, avCtx) - inHouseQty(line.itemId)
      if (free < line.quantity) {
        // Same warning, but remember it was a SWITCH: "Add anyway" must move this
        // line in-house, not bolt an extra quantity onto the order.
        setBlocked({ itemId: line.itemId, name: item.name, intent: 'switch', index })
        return
      }
    }
    updateLine(index, { source, vendorId: source === SUB_RENTAL ? line.vendorId : null })
    // Moving to the vendor releases the copies of ours this line had named.
    if (source === SUB_RENTAL && (line.units ?? []).length) clearPins(index)
    setBlocked(null)
  }

  function replaceStaged(unitId) {
    const line = stagedUnits.find((u) => u.unitId === unitId)
    const item = itemsById[line?.itemId]
    const next = freeUnitsOf(item, avCtx)[0]
    if (!next) return setError(`No other ${item?.name ?? 'unit'} is free.`)
    setStagedUnits((prev) =>
      prev.map((u) => (u.unitId === unitId ? { ...u, unitId: next.id, barcode: next.barcode } : u)),
    )
    setError(null)
  }

  const removeStaged = (unitId) => setStagedUnits((prev) => prev.filter((u) => u.unitId !== unitId))
  const removeKit = (kitId) => setStagedUnits((prev) => prev.filter((u) => u.kitId !== kitId))

  // Archived kits and lists are not offered for new work (they stay resolvable
  // by id so an existing line still reads).
  const liveKits = useMemo(() => (kits || []).filter(notArchived), [kits])
  const liveScenarios = useMemo(() => (scenarios || []).filter(notArchived), [scenarios])

  // The picker deliberately shows exhausted stock too — that is how the crew
  // discovers a sub-rental is needed.
  const pickerResults = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    return inventory
      .filter((i) => notArchived(i) && (q === '' || i.name.toLowerCase().includes(q)))
      .slice(0, 10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, pickerSearch, itemLines, stagedIds])

  // A draft handed over by the order form has no id yet: this window is step two
  // of creating the order, so its button creates rather than saves.
  const isNew = !order?.id

  async function save() {
    const missingVendor = itemLines.find((l) => l.source === SUB_RENTAL && !l.vendorId)
    if (missingVendor) {
      setError(
        `Pick the vendor for the sub-rented ${itemsById[missingVendor.itemId]?.name ?? 'item'}.`,
      )
      return
    }
    setBusy(true)
    const res = await onSave(order?.id ?? null, lines)
    setBusy(false)
    if (res?.error) return setError(res.error)
    onClose()
  }

  const subRentalCount = itemLines.filter((l) => l.source === SUB_RENTAL).length

  // Total pieces on in-house lines that nothing free backs. Counted per ITEM (two
  // lines of the same item share one stock pool), hence the de-duplication.
  const overCapacity = useMemo(() => {
    const seen = new Set()
    let over = 0
    for (const l of itemLines) {
      if (l.source === SUB_RENTAL || seen.has(l.itemId)) continue
      seen.add(l.itemId)
      over += overFor(itemsById[l.itemId])
    }
    return over
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemLines, itemsById, stagedIds])

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title={isNew ? 'New job — equipment' : 'Job equipment'}>
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {/* Step one's form is gone by now, so restate what this gear is for.
              An existing order has its detail card right behind this window. */}
          {isNew && (
            <div className="rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 ring-1 ring-slate-200">
              <span className="font-semibold text-slate-800">{order?.jobName}</span>
              {order?.setLabel ? ` · ${order.setLabel}` : ''}
              {order?.studioId ? ` · ${studioLabel(order.studioId)}` : ''}
              {/* The whole window: a 3-day shoot picks gear for 3 days, and
                  the availability numbers in this very window say so. */}
              {order?.startsOn
                ? ` · ${order.startsOn}${
                    order.endsOn && order.endsOn !== order.startsOn
                      ? ` → ${order.endsOn} · ${setSpanDays(order.startsOn, order.endsOn)} days`
                      : ''
                  }`
                : ''}
              <span className="mt-1 block text-slate-500">
                Nothing is saved yet — <strong>Create job</strong> writes the job and this
                equipment together. Gear can be changed later.
              </span>
            </div>
          )}

          {liveScenarios.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Start from a scenario list
              </label>
              <SelectField
                value=""
                onChange={(e) => {
                  const list = liveScenarios.find((l) => l.id === e.target.value)
                  if (list) applyList(list)
                }}
                placeholder="Pick a preset…"
                options={liveScenarios.map((l) => ({
                  value: l.id,
                  label: `${l.name} (${l.entries.length} lines)`,
                }))}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              {applied && (
                <div className="mt-2 rounded-lg bg-violet-50 px-3 py-2 text-xs text-violet-900 ring-1 ring-violet-200">
                  <strong>{applied.name}</strong> applied. Edit anything below.
                  {(applied.warnings?.length > 0 || applied.notes?.length > 0) && (
                    <ul className="mt-1 space-y-0.5 text-violet-700/90">
                      {[...(applied.warnings ?? []), ...(applied.notes ?? [])].map((w, i) => (
                        <li key={i}>• {w}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          )}

          {/* 5.6 — zero-availability block, with the sub-rental way out */}
          {blocked && (
            <div className="rounded-lg bg-amber-50 px-3 py-2.5 text-xs ring-1 ring-amber-200">
              <div className="flex items-start gap-2 text-amber-900">
                <AlertTriangle size={14} className="mt-0.5 shrink-0" />
                <span>
                  <strong>{blocked.name}</strong> has 0 available for these dates. Raise it as a
                  sub-rental, pick a different item — or put it on the job anyway and settle the
                  shortfall later.
                </span>
              </div>
              <div className="mt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => addItem(blocked.itemId, SUB_RENTAL)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-amber-500 px-2.5 py-1 font-medium text-white transition hover:bg-amber-600"
                >
                  <Truck size={12} />
                  Add as sub-rental
                </button>
                {/* Refusing outright was a dead end: the crew needs to be able to
                    write the job down before the gear is back. Added in-house it
                    stays flagged as over capacity on the line and in the footer. */}
                <button
                  type="button"
                  onClick={() =>
                    blocked.intent === 'switch'
                      ? switchSource(blocked.index, IN_HOUSE, { force: true })
                      : addItem(blocked.itemId, IN_HOUSE, { force: true })
                  }
                  className="rounded-md border border-amber-300 px-2.5 py-1 font-medium text-amber-800 transition hover:bg-amber-100"
                >
                  {blocked.intent === 'switch' ? 'Switch anyway' : 'Add anyway'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setBlocked(null)
                    setPicker(true)
                  }}
                  className="rounded-md px-2 py-1 font-medium text-amber-800 transition hover:bg-amber-100"
                >
                  Choose another
                </button>
                <button
                  type="button"
                  onClick={() => setBlocked(null)}
                  className="ml-auto rounded-md px-2 py-1 font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Kit groups — composition editable after adding (5.3) */}
          {kitGroups.map((g) => (
            <div key={g.kitId} className="rounded-xl border border-violet-200 bg-violet-50/40 p-3">
              <div className="mb-2 flex items-center gap-2">
                <Layers size={15} className="shrink-0 text-violet-600" />
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-violet-900">
                  {g.name}
                </span>
                <span className="shrink-0 text-xs text-violet-700/80">{g.units.length} pcs</span>
                <button
                  type="button"
                  onClick={() => removeKit(g.kitId)}
                  title="Remove the whole kit"
                  className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                >
                  <X size={15} />
                </button>
              </div>
              <ul className="space-y-1">
                {g.units.map((u) => (
                  <li
                    key={u.unitId}
                    className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5"
                  >
                    <div className="min-w-0 flex-1">
                      {u.label && (
                        <div className="text-[10px] font-medium uppercase tracking-wide text-slate-400">
                          {u.label}
                        </div>
                      )}
                      <div className="truncate text-sm text-slate-800">{u.itemName}</div>
                    </div>
                    {u.barcode && (
                      <span className="shrink-0 font-mono text-xs text-slate-500">#{u.barcode}</span>
                    )}
                    <button
                      type="button"
                      onClick={() => replaceStaged(u.unitId)}
                      title="Swap for another free unit"
                      className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-violet-50 hover:text-violet-600"
                    >
                      <RefreshCw size={13} />
                    </button>
                    <button
                      type="button"
                      onClick={() => removeStaged(u.unitId)}
                      title="Remove this line"
                      className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    >
                      <X size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}

          {/* A-la-carte lines with the in-house / sub-rental switch (5.6) */}
          {itemLines.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                A-la-carte
              </div>
              <ul className="space-y-1.5">
                {itemLines.map((l, i) => {
                  const item = itemsById[l.itemId]
                  const isSub = l.source === SUB_RENTAL
                  return (
                    <li key={`${l.itemId}-${l.source}-${i}`} className="rounded-lg border border-slate-200 px-3 py-2">
                      <div className="flex items-center gap-2">
                        <Package size={14} className="shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                          {item?.name ?? 'Item'}
                        </span>
                        {(() => {
                          const over = isSub ? 0 : overFor(item)
                          return (
                            <span
                              title={
                                over > 0
                                  ? `${over} piece(s) beyond what's free — they won't be reserved`
                                  : undefined
                              }
                              className={[
                                'shrink-0 whitespace-nowrap text-[11px]',
                                over > 0 ? 'font-medium text-amber-600' : 'text-slate-400',
                              ].join(' ')}
                            >
                              {isSub
                                ? 'from vendor'
                                : over > 0
                                  ? `${over} over capacity`
                                  : `${remainingFor(item)} left`}
                            </span>
                          )
                        })()}
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => stepLine(i, -1)}
                            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100"
                          >
                            <Minus size={13} />
                          </button>
                          <span className="w-6 text-center text-sm font-medium text-slate-700">
                            {l.quantity}
                          </span>
                          <button
                            type="button"
                            onClick={() => stepLine(i, 1)}
                            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100"
                          >
                            <Plus size={13} />
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeLine(i)}
                          title="Remove line"
                          className="shrink-0 rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                        >
                          <X size={14} />
                        </button>
                      </div>

                      <div className="mt-2 flex flex-wrap items-center gap-2 pl-6">
                        <div className="flex rounded-md border border-slate-300 p-0.5">
                          {[
                            [IN_HOUSE, 'In-house', Home],
                            [SUB_RENTAL, 'Sub-rental', Truck],
                          ].map(([val, lbl, Icon]) => (
                            <button
                              key={val}
                              type="button"
                              onClick={() => switchSource(i, val)}
                              className={[
                                'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium transition',
                                l.source === val
                                  ? val === SUB_RENTAL
                                    ? 'bg-amber-500 text-white'
                                    : 'bg-slate-700 text-white'
                                  : 'text-slate-500 hover:bg-slate-100',
                              ].join(' ')}
                            >
                              <Icon size={11} />
                              {lbl}
                            </button>
                          ))}
                        </div>
                        {isSub && (
                          <SelectField
                            value={l.vendorId ?? ''}
                            onChange={(e) => {
                              // A rental house nobody has filed yet is the common
                              // case for a sub-rental, so the list itself offers
                              // creating one instead of sending you to People.
                              if (e.target.value === NEW_VENDOR) return setNewVendorFor(i)
                              updateLine(i, { vendorId: e.target.value || null })
                            }}
                            placeholder={vendors.length ? 'pick a vendor…' : 'new vendor…'}
                            options={[
                              ...vendors.map((c) => ({ value: c.id, label: c.name })),
                              { value: NEW_VENDOR, label: '+ New vendor…' },
                            ]}
                            className={[
                              'w-40 rounded-md border px-2 py-1 text-xs outline-none transition focus:ring-2 focus:ring-violet-100',
                              l.vendorId ? 'border-slate-300 text-slate-700' : 'border-amber-400 text-amber-700',
                            ].join(' ')}
                          />
                        )}

                        {/* The rental price for this line. A sub-rental is priced
                            by its vendor, so our own rate is only a starting
                            point; leaving it empty quotes the item's rate. */}
                        <label className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                          <span className="text-slate-400">$</span>
                          <input
                            type="text"
                            inputMode="decimal"
                            value={l.rateOverridden && l.dayRate != null ? String(l.dayRate) : ''}
                            onChange={(e) => setLineRate(i, e.target.value)}
                            placeholder={
                              itemsById[l.itemId]?.dayRate != null
                                ? String(itemsById[l.itemId].dayRate)
                                : '—'
                            }
                            title={
                              isSub
                                ? "What the vendor charges per day for this line"
                                : "Rate per day for this line — leave empty to use the item's own rate"
                            }
                            className={[
                              'w-16 rounded-md border px-1.5 py-1 text-right text-xs outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
                              l.rateOverridden
                                ? 'border-violet-300 font-medium text-violet-700'
                                : 'border-slate-300 text-slate-700 placeholder:text-slate-300',
                            ].join(' ')}
                          />
                          <span className="text-slate-400">/day</span>
                          {l.rateOverridden ? (
                            <button
                              type="button"
                              onClick={() => setLineRate(i, '')}
                              title="Back to the item's own rate"
                              className="rounded px-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                            >
                              reset
                            </button>
                          ) : isSub ? (
                            <span className="text-amber-600">vendor price not set</span>
                          ) : null}
                        </label>
                      </div>

                      {/* WHICH copies go on the job. Offered only for our own
                          barcoded stock: non-barcoded stock is counted, not
                          tracked copy by copy, and a sub-rental has no barcode of
                          ours to name. Unpinned pieces stay "any free copy" and
                          are resolved when the order is confirmed. */}
                      {!isSub && item?.kind === 'barcoded' && (
                        <div className="mt-1.5 flex flex-wrap items-center gap-1.5 pl-6">
                          <span className="text-[11px] text-slate-400">Copies</span>
                          {(l.units ?? []).map((u) => (
                            <span
                              key={u.unitId}
                              className="inline-flex items-center gap-1 rounded bg-violet-50 px-1.5 py-0.5 font-mono text-[11px] font-medium text-violet-700 ring-1 ring-violet-200"
                            >
                              #{u.barcode ?? '—'}
                              <button
                                type="button"
                                onClick={() => unpinUnit(i, u.unitId)}
                                title="Back to any free copy"
                                className="rounded text-violet-400 transition hover:text-rose-500"
                              >
                                <X size={11} />
                              </button>
                            </span>
                          ))}
                          {l.quantity - (l.units ?? []).length > 0 && (
                            <span
                              className="text-[11px] text-slate-400"
                              title="Resolved from what's free when the job is confirmed"
                            >
                              {l.quantity - (l.units ?? []).length} × any free copy
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => setCopyPicker(copyPicker === i ? null : i)}
                            className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium text-violet-600 transition hover:bg-violet-50"
                          >
                            <ScanLine size={11} />
                            {copyPicker === i ? 'Close' : 'Choose / scan a copy'}
                          </button>
                        </div>
                      )}

                      {copyPicker === i && !isSub && item?.kind === 'barcoded' && (
                        <div className="-mx-3 mt-1.5 overflow-hidden rounded-b-lg">
                          <UnitPickList
                            scan
                            itemName={item?.name ?? 'item'}
                            units={freeUnitsOf(item, avCtx)}
                            ownUnitIds={ownUnits}
                            onPick={(u) => pinUnit(i, u)}
                            onCancel={() => setCopyPicker(null)}
                          />
                        </div>
                      )}
                    </li>
                  )
                })}
              </ul>
            </div>
          )}

          {lines.length === 0 && (
            <p className="rounded-lg border border-dashed border-slate-300 py-6 text-center text-sm text-slate-400">
              No equipment yet — add items, a kit, or start from a scenario list.
            </p>
          )}

          {picker ? (
            <div className="rounded-xl border border-slate-200 p-3">
              <div className="relative">
                <Search
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  autoFocus
                  type="text"
                  value={pickerSearch}
                  onChange={(e) => setPickerSearch(e.target.value)}
                  placeholder="Search stock…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              {pickerResults.length > 0 ? (
                <ul className="mt-1 max-h-48 overflow-auto">
                  {pickerResults.map((item) => {
                    const left = remainingFor(item)
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => addItem(item.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition hover:bg-slate-50"
                        >
                          <span className="min-w-0 truncate text-slate-700">{item.name}</span>
                          <span
                            className={[
                              'shrink-0 text-xs',
                              left === 0 ? 'font-medium text-rose-500' : 'text-slate-400',
                            ].join(' ')}
                          >
                            {left === 0 ? '0 available' : `${left} avail`}
                            {item.dayRate != null ? ` · ${money(item.dayRate)}/day` : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              ) : (
                <p className="px-1 py-3 text-center text-xs text-slate-400">
                  Nothing matching{pickerSearch.trim() ? ' — register it below' : ''}.
                </p>
              )}
              {/* Gear that isn't in the register yet used to dead-end here and
                  send the crew to another screen, losing this window's picks. */}
              <div className="mt-1 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => setNewItemOpen(true)}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                >
                  <Plus size={12} />
                  {pickerSearch.trim() ? `New item “${pickerSearch.trim()}”` : 'New item type'}
                </button>
                <button
                  type="button"
                  onClick={() => setPicker(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setPicker(true)
                  setPickerSearch('')
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
              >
                <Plus size={15} />
                Add item
              </button>
              {/* Scan the gear onto the order. A hardware reader ends with Enter;
                  a code pasted with Ctrl+V does not, so a value that IS a known
                  barcode fires on its own — the same rule as the station and the
                  kit window, and for the same reason. */}
              <label className="relative inline-flex items-center">
                <ScanLine
                  size={15}
                  className="pointer-events-none absolute left-2.5 text-slate-400"
                />
                <input
                  type="text"
                  value={scan}
                  onChange={(e) => {
                    const v = e.target.value
                    setScan(v)
                    setScanNote(null)
                    if (knownBarcodes.has(normalizeBarcode(v))) scanIn(v)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault()
                      scanIn(scan)
                    }
                  }}
                  placeholder="Scan a barcode…"
                  className="w-44 rounded-lg border border-dashed border-slate-300 py-2 pl-8 pr-2 text-sm outline-none transition focus:border-violet-400 focus:border-solid focus:ring-2 focus:ring-violet-100"
                />
              </label>
              {kits.length > 0 && (
                <SelectField
                  value=""
                  onChange={(e) => {
                    const kit = kits.find((k) => k.id === e.target.value)
                    if (kit) setStaging(kit)
                  }}
                  placeholder="Add a kit…"
                  options={liveKits.map((k) => ({ value: k.id, label: k.name }))}
                  className="w-48 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 outline-none transition hover:border-violet-300 hover:text-violet-600"
                />
              )}
            </div>
          )}

          {scanNote && (
            <p
              className={[
                'text-xs font-medium',
                scanNote.bad ? 'text-rose-600' : 'text-emerald-600',
              ].join(' ')}
            >
              {scanNote.text}
            </p>
          )}

          {error && (
            <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          <div className="text-xs text-slate-500">
            <span className="font-medium text-slate-700">{estimate.pieces} pcs</span> ·{' '}
            {estimate.days} day(s) ·{' '}
            <span className="font-semibold text-slate-800">{money(estimate.total)}</span>
            {subRentalCount > 0 && (
              <span className="ml-1 text-amber-600">({subRentalCount} sub-rental)</span>
            )}
            {overCapacity > 0 && (
              <span
                title="These pieces exceed what's free, so no unit will be held for them"
                className="ml-1 font-medium text-amber-600"
              >
                · {overCapacity} over capacity
              </span>
            )}
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={save}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              <Check size={15} />
              {isNew ? 'Create job' : 'Save equipment'}
            </button>
          </div>
        </div>
      </Modal>

      <KitStagingModal
        open={!!staging}
        kit={staging}
        inventory={inventory}
        dateWindow={dateWindow}
        ownUnitIds={ownUnits}
        reservedUnitIds={reservedForStaging}
        onConfirm={(units) => {
          setStagedUnits((prev) => [...prev, ...units])
          setStaging(null)
        }}
        onCancel={() => setStaging(null)}
        // Both of these are REAL inventory writes the staging window offers, and
        // both were missing here: the calls are optional, so sending a unit for
        // repair from an order emptied the slot, wrote no repair, logged nothing
        // and left the count unchanged — which is exactly what it looked like.
        onMarkBroken={(itemId, unitId, details) => sendToRepair(itemId, unitId, details)}
        onSetBarcode={(itemId, unitId, barcode) => setUnitBarcode(itemId, unitId, barcode)}
      />

      {/* Both editors are the SAME ones the Inventory and People screens use,
          layered over this window — they own the fields, the validation and the
          store call, and a lesser copy here would drift from them. */}
      <AddInventoryModal
        open={newItemOpen}
        prefill={pickerSearch.trim() ? { name: pickerSearch.trim() } : null}
        onClose={() => setNewItemOpen(false)}
        onCreate={createItemAndAdd}
      />

      <CompanyEditorModal
        open={newVendorFor != null}
        companyTypes={companyTypes.filter(notArchived)}
        onClose={() => setNewVendorFor(null)}
        onCreate={createVendorForLine}
        onCreateType={(name) => createCompanyType(name)}
        onRenameType={(id, name) => renameCompanyType(id, name)}
        onDeleteType={(id) => archiveCompanyType(id)}
      />
    </>
  )
}
