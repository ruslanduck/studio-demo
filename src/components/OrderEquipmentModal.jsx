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
} from 'lucide-react'
import Modal from './Modal'
import KitStagingModal from './KitStagingModal'
import { applyScenarioList } from '../lib/scenarios'
import { buildEstimate, money } from '../lib/estimate'
import { availableCount, freeUnitsOf, resolveUnitsForQuantities } from '../lib/availability'

// Equipment entry for an order (epic #5, 5.3 + 5.6).
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
  const [itemLines, setItemLines] = useState([]) // { itemId, quantity, source, vendorId }
  const [stagedUnits, setStagedUnits] = useState([]) // kit lines (unit-level)
  const [staging, setStaging] = useState(null)
  const [picker, setPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [applied, setApplied] = useState(null)
  const [blocked, setBlocked] = useState(null) // { itemId, name } — hit 0 available
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

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
      } else {
        items.push({
          itemId: l.itemId,
          quantity: l.quantity ?? 1,
          source: l.source === SUB_RENTAL ? SUB_RENTAL : IN_HOUSE,
          vendorId: l.vendorId ?? null,
        })
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
  const stagedIds = useMemo(() => new Set(stagedUnits.map((u) => u.unitId)), [stagedUnits])
  const vendors = useMemo(
    () => companies.filter((c) => c.kind === 'vendor' || c.kind === 'both'),
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
    Math.max(0, availableCount(item, { claimed: stagedIds }) - inHouseQty(item?.id))

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
      ...itemLines.map((l) => ({
        itemId: l.itemId,
        itemName: itemsById[l.itemId]?.name ?? null,
        quantity: l.quantity,
        source: l.source,
        vendorId: l.vendorId,
        dayRate: itemsById[l.itemId]?.dayRate ?? null,
      })),
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
      ...resolveUnitsForQuantities(
        itemLines.filter((l) => l.source === IN_HOUSE),
        inventory,
        { claimed: stagedIds },
      ),
    ],
    [stagedUnits, itemLines, inventory, stagedIds],
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
    const res = applyScenarioList({ list, inventory, kits, selected, stagedUnits })
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
  function addItem(itemId, source = IN_HOUSE) {
    const item = itemsById[itemId]
    if (source === IN_HOUSE && remainingFor(item) <= 0) {
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

  const updateLine = (index, changes) =>
    setItemLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...changes } : l)))

  const removeLine = (index) => setItemLines((prev) => prev.filter((_, i) => i !== index))

  function stepLine(index, delta) {
    const line = itemLines[index]
    const item = itemsById[line.itemId]
    const next = line.quantity + delta
    if (next <= 0) return removeLine(index)
    // In-house is capped by what's actually free; a vendor's stock is not ours to cap.
    if (line.source === IN_HOUSE && delta > 0 && remainingFor(item) <= 0) {
      setBlocked({ itemId: line.itemId, name: item.name })
      return
    }
    updateLine(index, { quantity: next })
  }

  // Switching a line to sub-rental frees the in-house units it was holding.
  function switchSource(index, source) {
    const line = itemLines[index]
    if (source === IN_HOUSE) {
      const item = itemsById[line.itemId]
      const free = availableCount(item, { claimed: stagedIds }) - inHouseQty(line.itemId)
      if (free < line.quantity) {
        setBlocked({ itemId: line.itemId, name: item.name })
        return
      }
    }
    updateLine(index, { source, vendorId: source === SUB_RENTAL ? line.vendorId : null })
    setBlocked(null)
  }

  function replaceStaged(unitId) {
    const line = stagedUnits.find((u) => u.unitId === unitId)
    const item = itemsById[line?.itemId]
    const next = freeUnitsOf(item, { claimed: stagedIds })[0]
    if (!next) return setError(`No other ${item?.name ?? 'unit'} is free.`)
    setStagedUnits((prev) =>
      prev.map((u) => (u.unitId === unitId ? { ...u, unitId: next.id, barcode: next.barcode } : u)),
    )
    setError(null)
  }

  const removeStaged = (unitId) => setStagedUnits((prev) => prev.filter((u) => u.unitId !== unitId))
  const removeKit = (kitId) => setStagedUnits((prev) => prev.filter((u) => u.kitId !== kitId))

  // The picker deliberately shows exhausted stock too — that is how the crew
  // discovers a sub-rental is needed.
  const pickerResults = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    return inventory
      .filter((i) => q === '' || i.name.toLowerCase().includes(q))
      .slice(0, 10)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, pickerSearch, itemLines, stagedIds])

  async function save() {
    const missingVendor = itemLines.find((l) => l.source === SUB_RENTAL && !l.vendorId)
    if (missingVendor) {
      setError(
        `Pick the vendor for the sub-rented ${itemsById[missingVendor.itemId]?.name ?? 'item'}.`,
      )
      return
    }
    setBusy(true)
    const res = await onSave(order.id, lines)
    setBusy(false)
    if (res?.error) return setError(res.error)
    onClose()
  }

  const subRentalCount = itemLines.filter((l) => l.source === SUB_RENTAL).length

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title="Order equipment">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {scenarios.length > 0 && (
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Start from a scenario list
              </label>
              <select
                value=""
                onChange={(e) => {
                  const list = scenarios.find((l) => l.id === e.target.value)
                  if (list) applyList(list)
                  e.target.value = ''
                }}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              >
                <option value="">Pick a preset…</option>
                {scenarios.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.category ? ` · ${l.category}` : ''} ({l.entries.length} lines)
                  </option>
                ))}
              </select>
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
                  <strong>{blocked.name}</strong> has 0 available for these dates. Pick a different
                  item, or raise it as a sub-rental from a vendor.
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
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {isSub ? 'from vendor' : `${remainingFor(item)} left`}
                        </span>
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
                        {isSub &&
                          (vendors.length > 0 ? (
                            <select
                              value={l.vendorId ?? ''}
                              onChange={(e) => updateLine(i, { vendorId: e.target.value || null })}
                              className={[
                                'rounded-md border px-2 py-1 text-xs outline-none transition focus:ring-2 focus:ring-violet-100',
                                l.vendorId ? 'border-slate-300 text-slate-700' : 'border-amber-400 text-amber-700',
                              ].join(' ')}
                            >
                              <option value="">pick a vendor…</option>
                              {vendors.map((c) => (
                                <option key={c.id} value={c.id}>
                                  {c.name}
                                </option>
                              ))}
                            </select>
                          ) : (
                            <span className="text-[11px] text-amber-600">
                              no vendor companies on file
                            </span>
                          ))}
                      </div>
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
                <p className="px-1 py-3 text-center text-xs text-slate-400">Nothing matching.</p>
              )}
              <div className="mt-1 flex justify-end">
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
            <div className="flex flex-wrap gap-2">
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
              {kits.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const kit = kits.find((k) => k.id === e.target.value)
                    if (kit) setStaging(kit)
                    e.target.value = ''
                  }}
                  className="rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 outline-none transition hover:border-violet-300 hover:text-violet-600"
                >
                  <option value="">Add a kit…</option>
                  {kits.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
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
              Save equipment
            </button>
          </div>
        </div>
      </Modal>

      <KitStagingModal
        open={!!staging}
        kit={staging}
        inventory={inventory}
        reservedUnitIds={reservedForStaging}
        onConfirm={(units) => {
          setStagedUnits((prev) => [...prev, ...units])
          setStaging(null)
        }}
        onCancel={() => setStaging(null)}
      />
    </>
  )
}
