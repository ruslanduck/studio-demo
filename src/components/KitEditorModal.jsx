import { useEffect, useMemo, useState } from 'react'
import {
  Layers,
  Search,
  Plus,
  X,
  Check,

  ChevronUp,
  ChevronDown,
  Lock,
  ScanLine,
  AlertTriangle,
  Archive as ArchiveIcon,
} from 'lucide-react'
import Modal from './Modal'
import SelectField from './SelectField'
import { notArchived } from '../store'
import { activeUnits } from '../data/inventory'

// Kit editor (Build order #3, 3.6). Authors a kit's *slot definitions* — the
// counterpart to KitStagingModal, which fills them at pull time.
//
// Each slot names one component item and a type:
//   FIXED   → pinned to one specific unit (the monitor bolted to the cart). The
//             unit must be chosen here; that's what staging auto-fills.
//   GENERIC → the item only; the concrete unit is scanned when the kit is pulled.
//
// Only barcoded items can fill slots: FIXED needs a unit to pin and GENERIC needs
// units to scan. Non-barcoded stock is counted by quantity and belongs in a
// scenario list instead.
const blank = { name: '', category: '', notes: '', slots: [] }

export default function KitEditorModal({
  open,
  kit,
  inventory,
  onClose,
  onCreate,
  onSave,
  onDelete,
}) {
  const isEdit = !!kit
  const [form, setForm] = useState(blank)
  const [picker, setPicker] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      kit
        ? {
            name: kit.name ?? '',
            category: kit.category ?? '',
            notes: kit.notes ?? '',
            slots: (kit.slots || []).map((s) => ({
              itemId: s.itemId,
              label: s.label ?? '',
              slotType: s.slotType || 'generic',
              fixedUnitId: s.fixedUnitId ?? null,
            })),
          }
        : blank,
    )
    setPicker(false)
    setPickerSearch('')
    setError(null)
    setConfirmDelete(false)
  }, [open, kit])

  const itemById = useMemo(
    () => Object.fromEntries(inventory.map((i) => [i.id, i])),
    [inventory],
  )

  // Units already pinned by other FIXED slots in this kit — a physical unit can
  // only be bolted into one place.
  const pinnedElsewhere = (slotIndex) =>
    new Set(
      form.slots
        .filter((s, i) => i !== slotIndex && s.slotType === 'fixed' && s.fixedUnitId)
        .map((s) => s.fixedUnitId),
    )

  const setSlot = (index, changes) =>
    setForm((f) => ({
      ...f,
      slots: f.slots.map((s, i) => (i === index ? { ...s, ...changes } : s)),
    }))

  const removeSlot = (index) =>
    setForm((f) => ({ ...f, slots: f.slots.filter((_, i) => i !== index) }))

  const moveSlot = (index, dir) =>
    setForm((f) => {
      const to = index + dir
      if (to < 0 || to >= f.slots.length) return f
      const slots = [...f.slots]
      ;[slots[index], slots[to]] = [slots[to], slots[index]]
      return { ...f, slots }
    })

  function addSlot(itemId) {
    const item = itemById[itemId]
    setForm((f) => ({
      ...f,
      slots: [
        ...f.slots,
        { itemId, label: item?.name ?? '', slotType: 'generic', fixedUnitId: null },
      ],
    }))
    setPicker(false)
    setPickerSearch('')
    setError(null)
  }

  // Barcoded stock only (see header comment).
  const pickerResults = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    return inventory
      .filter((i) => notArchived(i) && i.kind === 'barcoded' && activeUnits(i).length > 0)
      .filter((i) => q === '' || i.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [inventory, pickerSearch])

  function submit(e) {
    e?.preventDefault()
    const name = form.name.trim()
    if (!name) return setError('Give the kit a name.')
    if (form.slots.length === 0) return setError('Add at least one slot.')
    const unpinned = form.slots.findIndex((s) => s.slotType === 'fixed' && !s.fixedUnitId)
    if (unpinned !== -1)
      return setError(`Slot ${unpinned + 1} is FIXED — pick the unit it's pinned to.`)

    const payload = { name, category: form.category.trim(), notes: form.notes, slots: form.slots }
    if (isEdit) onSave(kit.id, payload)
    else onCreate(payload)
    onClose()
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit kit' : 'New kit'}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <label className={label}>Name</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Capture Station 2"
              className={field}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Category</label>
              <input
                type="text"
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="e.g. Workstation"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Notes</label>
              <input
                type="text"
                value={form.notes}
                onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                placeholder="Optional"
                className={field}
              />
            </div>
          </div>

          {/* Slots */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Slots ({form.slots.length})
              </span>
              <span className="text-[11px] text-slate-400">
                FIXED = always the same unit · GENERIC = scanned at pull
              </span>
            </div>

            <ul className="space-y-1.5">
              {form.slots.map((s, i) => {
                const item = itemById[s.itemId]
                const isFixed = s.slotType === 'fixed'
                const blocked = pinnedElsewhere(i)
                const units = (item?.units || []).filter(
                  (u) => !blocked.has(u.id) || u.id === s.fixedUnitId,
                )
                return (
                  <li key={i} className="rounded-lg border border-slate-200 px-3 py-2.5">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-500">
                        {i + 1}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                        {item?.name ?? 'Unknown item'}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5">
                        <button
                          type="button"
                          onClick={() => moveSlot(i, -1)}
                          disabled={i === 0}
                          title="Move up"
                          className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                        >
                          <ChevronUp size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => moveSlot(i, 1)}
                          disabled={i === form.slots.length - 1}
                          title="Move down"
                          className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                        >
                          <ChevronDown size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={() => removeSlot(i)}
                          title="Remove slot"
                          className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                        >
                          <X size={15} />
                        </button>
                      </div>
                    </div>

                    <div className="mt-2 flex flex-wrap items-center gap-2 pl-8">
                      <input
                        type="text"
                        value={s.label}
                        onChange={(e) => setSlot(i, { label: e.target.value })}
                        placeholder="Slot label, e.g. Monitor"
                        className="w-40 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                      />

                      {/* Type toggle */}
                      <div className="flex rounded-md border border-slate-300 p-0.5">
                        {[
                          ['generic', 'Generic', ScanLine],
                          ['fixed', 'Fixed', Lock],
                        ].map(([val, lbl, Icon]) => (
                          <button
                            key={val}
                            type="button"
                            onClick={() =>
                              setSlot(i, {
                                slotType: val,
                                fixedUnitId:
                                  val === 'fixed' ? (s.fixedUnitId ?? units[0]?.id ?? null) : null,
                              })
                            }
                            className={[
                              'inline-flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition',
                              s.slotType === val
                                ? val === 'fixed'
                                  ? 'bg-slate-700 text-white'
                                  : 'bg-violet-600 text-white'
                                : 'text-slate-500 hover:bg-slate-100',
                            ].join(' ')}
                          >
                            <Icon size={11} />
                            {lbl}
                          </button>
                        ))}
                      </div>

                      {isFixed ? (
                        units.length > 0 ? (
                          <SelectField
                            value={s.fixedUnitId ?? ''}
                            onChange={(e) => setSlot(i, { fixedUnitId: e.target.value || null })}
                            placeholder="pick a unit…"
                            options={units.map((u) => ({
                              value: u.id,
                              label: `#${u.barcode}${u.status !== 'available' ? ' (out)' : ''}`,
                            }))}
                            className="w-40 rounded-md border border-slate-300 px-2 py-1 font-mono text-xs outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                          />
                        ) : (
                          <span className="text-[11px] font-medium text-amber-600">
                            no free unit to pin
                          </span>
                        )
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          {(item?.units || []).length} unit
                          {(item?.units || []).length === 1 ? '' : 's'} to scan from
                        </span>
                      )}
                    </div>
                  </li>
                )
              })}
            </ul>

            {form.slots.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 py-5 text-center text-sm text-slate-400">
                No slots yet — add the kit's components below.
              </p>
            )}

            {/* Add-slot picker */}
            {picker ? (
              <div className="mt-2 rounded-xl border border-slate-200 p-3">
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
                    placeholder="Search barcoded stock…"
                    className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                {pickerResults.length > 0 ? (
                  <ul className="mt-1 max-h-44 overflow-auto">
                    {pickerResults.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => addSlot(item.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition hover:bg-slate-50"
                        >
                          <span className="min-w-0 truncate text-slate-700">{item.name}</span>
                          <span className="shrink-0 text-xs text-slate-400">
                            {item.units.length} units
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-1 py-3 text-center text-xs text-slate-400">
                    No matching barcoded stock.
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
              <button
                type="button"
                onClick={() => {
                  setPicker(true)
                  setPickerSearch('')
                }}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
              >
                <Plus size={15} />
                Add slot
              </button>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          {isEdit && onDelete ? (
            confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Archive this kit?</span>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(kit.id)
                    onClose()
                  }}
                  className="rounded-md bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700"
                >
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-2 py-1 font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                <ArchiveIcon size={15} />
                Archive
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              {isEdit ? <Check size={15} /> : <Layers size={15} />}
              {isEdit ? 'Save kit' : 'Create kit'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
