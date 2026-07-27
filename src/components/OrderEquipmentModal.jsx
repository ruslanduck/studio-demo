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
  ClipboardList,
  AlertTriangle,
} from 'lucide-react'
import Modal from './Modal'
import KitStagingModal from './KitStagingModal'
import { applyScenarioList } from '../lib/scenarios'
import { buildEstimate, money } from '../lib/estimate'

// Equipment entry for an order (epic #5, 5.3).
//
// Three ways in, all reused from earlier epics:
//   • a-la-carte items with a quantity;
//   • whole KITS through the epic-3 staging window, which pins a concrete unit to
//     each slot (FIXED auto-filled, GENERIC scanned);
//   • predefined SCENARIO LISTS (3.5), which resolve to both of the above.
//
// State is held exactly like the booking modal — `selected` (itemId → qty) plus
// `stagedUnits` (unit-level kit lines) — so `applyScenarioList` works unchanged
// and a kit's composition stays editable after it was added: every staged unit is
// individually replaceable or removable, and the whole kit can be dropped.
//
// Note: the pickers only offer stock that has something free, which is the
// natural half of the zero-availability rule. The explicit "0 available → choose
// another or raise a sub-rental" error and the in-house/sub-rental marking per
// line are the next sub-item of this epic.
export default function OrderEquipmentModal({
  open,
  order,
  inventory,
  kits,
  scenarios,
  onClose,
  onSave,
}) {
  const [selected, setSelected] = useState({}) // itemId -> qty (a-la-carte)
  const [stagedUnits, setStagedUnits] = useState([]) // kit lines
  const [staging, setStaging] = useState(null) // kit being staged
  const [picker, setPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [applied, setApplied] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  // Load the order's existing lines back into the two buckets.
  useEffect(() => {
    if (!open || !order) return
    const sel = {}
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
        sel[l.itemId] = (sel[l.itemId] ?? 0) + (l.quantity ?? 1)
      }
    }
    setSelected(sel)
    setStagedUnits(staged)
    setStaging(null)
    setPicker(false)
    setPickerSearch('')
    setApplied(null)
    setError(null)
    setBusy(false)
  }, [open, order, kits])

  const itemsById = useMemo(
    () => Object.fromEntries(inventory.map((i) => [i.id, i])),
    [inventory],
  )
  const stagedIds = useMemo(() => new Set(stagedUnits.map((u) => u.unitId)), [stagedUnits])

  // Free units of an item, minus anything a staged kit already claimed here.
  const freeUnits = (item) =>
    (item?.units ?? []).filter((u) => u.status === 'available' && !stagedIds.has(u.id))
  const availCount = (item) =>
    item?.kind === 'barcoded' ? freeUnits(item).length : (item?.quantity ?? 0)

  // The lines this modal would save — also what the live total is built from.
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
        dayRate: itemsById[u.itemId]?.dayRate ?? null,
      })),
      ...Object.entries(selected).map(([itemId, quantity]) => ({
        itemId,
        itemName: itemsById[itemId]?.name ?? null,
        quantity,
        dayRate: itemsById[itemId]?.dayRate ?? null,
      })),
    ],
    [stagedUnits, selected, itemsById],
  )

  const estimate = useMemo(
    () => buildEstimate({ ...order, lines }, { inventory, kits }),
    [order, lines, inventory, kits],
  )

  // Kit groups for display, in first-seen order.
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
    const res = applyScenarioList({ list, inventory, kits, selected, stagedUnits })
    setSelected(res.selected)
    setStagedUnits(res.stagedUnits)
    setApplied({ name: list.name, ...res })
    setError(null)
  }

  function addItem(itemId) {
    const item = itemsById[itemId]
    const used = selected[itemId] ?? 0
    if (used >= availCount(item)) {
      setError(`No more ${item.name} available.`)
      return
    }
    setSelected((s) => ({ ...s, [itemId]: used + 1 }))
    setPicker(false)
    setPickerSearch('')
    setError(null)
  }

  const stepItem = (itemId, delta) =>
    setSelected((s) => {
      const next = (s[itemId] ?? 0) + delta
      const cap = availCount(itemsById[itemId])
      if (next <= 0) {
        const { [itemId]: _drop, ...rest } = s
        return rest
      }
      return { ...s, [itemId]: Math.min(next, cap) }
    })

  // Swap a staged unit for the next free unit of the same item (kit editing).
  function replaceStaged(unitId) {
    const line = stagedUnits.find((u) => u.unitId === unitId)
    const item = itemsById[line?.itemId]
    const next = freeUnits(item)[0]
    if (!next) return setError(`No other ${item?.name ?? 'unit'} is free.`)
    setStagedUnits((prev) =>
      prev.map((u) =>
        u.unitId === unitId ? { ...u, unitId: next.id, barcode: next.barcode } : u,
      ),
    )
    setError(null)
  }

  const removeStaged = (unitId) =>
    setStagedUnits((prev) => prev.filter((u) => u.unitId !== unitId))
  const removeKit = (kitId) => setStagedUnits((prev) => prev.filter((u) => u.kitId !== kitId))

  const pickerResults = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    return inventory
      .filter((i) => availCount(i) > (selected[i.id] ?? 0))
      .filter((i) => q === '' || i.name.toLowerCase().includes(q))
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inventory, pickerSearch, selected, stagedIds])

  async function save() {
    setBusy(true)
    const res = await onSave(order.id, lines)
    setBusy(false)
    if (res?.error) return setError(res.error)
    onClose()
  }

  const alaCarteRows = Object.entries(selected)

  return (
    <>
      <Modal open={open} onClose={onClose} size="lg" title="Order equipment">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {/* Scenario list shortcut (3.5) */}
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

          {/* Kit groups — composition stays editable after adding (5.3) */}
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
                      <span className="shrink-0 font-mono text-xs text-slate-500">
                        #{u.barcode}
                      </span>
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

          {/* A-la-carte lines */}
          {alaCarteRows.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                A-la-carte
              </div>
              <ul className="space-y-1.5">
                {alaCarteRows.map(([itemId, qty]) => {
                  const item = itemsById[itemId]
                  return (
                    <li
                      key={itemId}
                      className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <Package size={14} className="shrink-0 text-slate-400" />
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                        {item?.name ?? 'Item'}
                      </span>
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {availCount(item)} avail
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          onClick={() => stepItem(itemId, -1)}
                          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-slate-700">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => stepItem(itemId, 1)}
                          disabled={qty >= availCount(item)}
                          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 disabled:opacity-30"
                        >
                          <Plus size={13} />
                        </button>
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

          {/* Add controls */}
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
                  placeholder="Search available stock…"
                  className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
              </div>
              {pickerResults.length > 0 ? (
                <ul className="mt-1 max-h-44 overflow-auto">
                  {pickerResults.map((item) => (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => addItem(item.id)}
                        className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition hover:bg-slate-50"
                      >
                        <span className="min-w-0 truncate text-slate-700">{item.name}</span>
                        <span className="shrink-0 text-xs text-slate-400">
                          {availCount(item)} avail
                          {item.dayRate != null ? ` · ${money(item.dayRate)}/day` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="px-1 py-3 text-center text-xs text-slate-400">
                  Nothing matching with stock free.
                </p>
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
            {estimate.unratedCount > 0 && (
              <span className="ml-1 text-amber-600">({estimate.unratedCount} unrated)</span>
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

      {/* Kits come in through the epic-3 staging window, unchanged. */}
      <KitStagingModal
        open={!!staging}
        kit={staging}
        inventory={inventory}
        reservedUnitIds={stagedUnits.map((u) => u.unitId)}
        onConfirm={(units) => {
          setStagedUnits((prev) => [...prev, ...units])
          setStaging(null)
        }}
        onCancel={() => setStaging(null)}
      />
    </>
  )
}
