import { useEffect, useMemo, useState } from 'react'
import { Layers, Search, RefreshCw, X, Check, AlertTriangle, Plus } from 'lucide-react'
import Modal from './Modal'

// Staging window (Build order #3, 3.2). A kit is "ready to add" to a set but
// not added yet: each slot is auto-assigned an available unit; the user can
// add / remove / replace slots before finalizing. A slot with no available
// unit (missing) blocks the final add until it's removed or replaced from
// stock. Editing here affects only THIS add — never the kit template.
export default function KitStagingModal({ open, kit, inventory, reservedUnitIds = [], onConfirm, onCancel }) {
  const [slots, setSlots] = useState([])
  const [picker, setPicker] = useState(null) // { mode: 'replace'|'add', slotKey? }
  const [pickerSearch, setPickerSearch] = useState('')

  // Resolve the kit's slots to available units on open (respecting units already
  // spoken for by the booking / other staged kits).
  useEffect(() => {
    if (!open || !kit) return
    const used = new Set(reservedUnitIds)
    const next = kit.slots.map((slot, i) => {
      const item = inventory.find((it) => it.id === slot.itemId)
      const unit = item?.units.find((u) => u.status === 'available' && !used.has(u.id)) || null
      if (unit) used.add(unit.id)
      return {
        key: `${kit.id}:${slot.id ?? i}`,
        label: slot.label,
        itemId: slot.itemId,
        itemName: slot.itemName || item?.name || 'Unknown item',
        unitId: unit?.id ?? null,
        barcode: unit?.barcode ?? null,
      }
    })
    setSlots(next)
    setPicker(null)
    setPickerSearch('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kit])

  // Unit ids already committed in this staging (+ the booking's own).
  const usedIds = useMemo(() => {
    const s = new Set(reservedUnitIds)
    for (const sl of slots) if (sl.unitId) s.add(sl.unitId)
    return s
  }, [slots, reservedUnitIds])

  const freeUnitsFor = (itemId) => {
    const item = inventory.find((i) => i.id === itemId)
    return (item?.units || []).filter((u) => u.status === 'available' && !usedIds.has(u.id))
  }

  const missing = slots.filter((s) => !s.unitId).length
  const ready = slots.length > 0 && missing === 0

  function removeSlot(key) {
    setSlots((prev) => prev.filter((s) => s.key !== key))
  }

  function pickItem(itemId) {
    const unit = freeUnitsFor(itemId)[0]
    if (!unit) return
    const item = inventory.find((i) => i.id === itemId)
    if (picker.mode === 'replace') {
      setSlots((prev) =>
        prev.map((s) =>
          s.key === picker.slotKey
            ? { ...s, itemId, itemName: item.name, unitId: unit.id, barcode: unit.barcode }
            : s,
        ),
      )
    } else {
      setSlots((prev) => [
        ...prev,
        {
          key: `add:${unit.id}`,
          label: item.name,
          itemId,
          itemName: item.name,
          unitId: unit.id,
          barcode: unit.barcode,
        },
      ])
    }
    setPicker(null)
    setPickerSearch('')
  }

  // Stock items with at least one free unit — the replacement / add pool.
  const pickerResults = useMemo(() => {
    if (!picker) return []
    const q = pickerSearch.trim().toLowerCase()
    return inventory
      .filter((i) => i.kind === 'barcoded' && freeUnitsFor(i.id).length > 0)
      .filter((i) => q === '' || i.name.toLowerCase().includes(q))
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, pickerSearch, inventory, usedIds])

  function confirm() {
    if (!ready) return
    onConfirm(
      slots
        .filter((s) => s.unitId)
        .map((s) => ({
          unitId: s.unitId,
          itemId: s.itemId,
          itemName: s.itemName,
          barcode: s.barcode,
          label: s.label,
          kitId: kit.id,
          kitName: kit.name,
        })),
    )
  }

  return (
    <Modal open={open} onClose={onCancel} size="lg" title="Stage kit">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {kit && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-3">
            <Layers size={16} className="shrink-0 text-violet-600" />
            <div className="min-w-0">
              <div className="truncate font-semibold text-violet-900">{kit.name}</div>
              <div className="text-xs text-violet-700/80">
                Ready to add — adjust the pull below, then confirm. This won’t change the kit
                itself.
              </div>
            </div>
          </div>
        )}

        {missing > 0 && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            <AlertTriangle size={13} />
            {missing} slot{missing === 1 ? '' : 's'} unavailable — replace from stock or remove
            before adding.
          </div>
        )}

        <ul className="space-y-1.5">
          {slots.map((s, i) => (
            <li
              key={s.key}
              className={[
                'flex items-center gap-3 rounded-lg border px-3 py-2.5',
                s.unitId ? 'border-slate-200' : 'border-amber-300 bg-amber-50/40',
              ].join(' ')}
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">
                {i + 1}
              </span>
              <div className="min-w-0 flex-1">
                {s.label && (
                  <div className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                    {s.label}
                  </div>
                )}
                <div className="truncate text-sm font-medium text-slate-800">{s.itemName}</div>
              </div>
              {s.unitId ? (
                <span className="shrink-0 font-mono text-xs text-slate-500">#{s.barcode}</span>
              ) : (
                <span className="shrink-0 text-xs font-medium text-amber-700">unavailable</span>
              )}
              <div className="flex shrink-0 items-center gap-1">
                <button
                  type="button"
                  onClick={() => {
                    setPicker({ mode: 'replace', slotKey: s.key })
                    setPickerSearch('')
                  }}
                  title="Replace from stock"
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                >
                  <RefreshCw size={13} />
                  Replace
                </button>
                <button
                  type="button"
                  onClick={() => removeSlot(s.key)}
                  title="Remove from this add"
                  className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                >
                  <X size={15} />
                </button>
              </div>
            </li>
          ))}
        </ul>

        {slots.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            No slots left — add an item from stock, or cancel.
          </p>
        )}

        {/* Add / replace picker */}
        {picker ? (
          <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              {picker.mode === 'replace' ? 'Replace with' : 'Add from stock'}
            </div>
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
              <ul className="mt-1 max-h-48 overflow-auto">
                {pickerResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => pickItem(item.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 truncate text-slate-700">{item.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {freeUnitsFor(item.id).length} free
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 py-3 text-center text-xs text-slate-400">
                No matching stock with free units.
              </p>
            )}
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPicker({ mode: 'add' })
              setPickerSearch('')
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
          >
            <Plus size={15} />
            Add item
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
        <span className="text-xs text-slate-400">
          {slots.filter((s) => s.unitId).length} unit
          {slots.filter((s) => s.unitId).length === 1 ? '' : 's'} ready
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!ready}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={15} />
            Add {slots.filter((s) => s.unitId).length} to set
          </button>
        </div>
      </div>
    </Modal>
  )
}
