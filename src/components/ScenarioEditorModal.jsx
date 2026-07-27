import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardList,
  Search,
  Plus,
  X,
  Check,
  Trash2,
  ChevronUp,
  ChevronDown,
  Layers,
  Package,
  AlertTriangle,
} from 'lucide-react'
import Modal from './Modal'

// Scenario list editor (Build order #3, 3.6). A list is the preset pull list for
// a *type of shoot* — it mixes whole KITS and a-la-carte ITEMS with quantities.
//
// Unlike a kit slot, a list line doesn't name a unit: applying the list resolves
// lines to whatever is available at the time (see lib/scenarios.js). So any item
// kind is allowed here, including non-barcoded and consumables ("take from
// stock"). Kit lines are always quantity 1 — a kit is staged one at a time.
const blank = { name: '', category: '', notes: '', entries: [] }

export default function ScenarioEditorModal({
  open,
  list,
  inventory,
  kits,
  onClose,
  onCreate,
  onSave,
  onDelete,
}) {
  const isEdit = !!list
  const [form, setForm] = useState(blank)
  const [picker, setPicker] = useState(null) // 'item' | 'kit' | null
  const [pickerSearch, setPickerSearch] = useState('')
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      list
        ? {
            name: list.name ?? '',
            category: list.category ?? '',
            notes: list.notes ?? '',
            entries: (list.entries || []).map((e) => ({
              type: e.type,
              itemId: e.itemId ?? null,
              kitId: e.kitId ?? null,
              quantity: e.quantity ?? 1,
              note: e.note ?? '',
            })),
          }
        : blank,
    )
    setPicker(null)
    setPickerSearch('')
    setError(null)
    setConfirmDelete(false)
  }, [open, list])

  const itemById = useMemo(() => Object.fromEntries(inventory.map((i) => [i.id, i])), [inventory])
  const kitById = useMemo(() => Object.fromEntries(kits.map((k) => [k.id, k])), [kits])

  const setEntry = (index, changes) =>
    setForm((f) => ({
      ...f,
      entries: f.entries.map((e, i) => (i === index ? { ...e, ...changes } : e)),
    }))

  const removeEntry = (index) =>
    setForm((f) => ({ ...f, entries: f.entries.filter((_, i) => i !== index) }))

  const moveEntry = (index, dir) =>
    setForm((f) => {
      const to = index + dir
      if (to < 0 || to >= f.entries.length) return f
      const entries = [...f.entries]
      ;[entries[index], entries[to]] = [entries[to], entries[index]]
      return { ...f, entries }
    })

  function addEntry(kind, id) {
    setForm((f) => ({
      ...f,
      entries: [
        ...f.entries,
        kind === 'kit'
          ? { type: 'kit', kitId: id, itemId: null, quantity: 1, note: '' }
          : { type: 'item', itemId: id, kitId: null, quantity: 1, note: '' },
      ],
    }))
    setPicker(null)
    setPickerSearch('')
    setError(null)
  }

  // Already-listed targets are hidden from the pickers (one line per thing).
  const usedItemIds = new Set(form.entries.filter((e) => e.itemId).map((e) => e.itemId))
  const usedKitIds = new Set(form.entries.filter((e) => e.kitId).map((e) => e.kitId))

  const pickerResults = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase()
    if (picker === 'kit') {
      return kits
        .filter((k) => !usedKitIds.has(k.id))
        .filter((k) => q === '' || k.name.toLowerCase().includes(q))
        .slice(0, 8)
    }
    if (picker === 'item') {
      return inventory
        .filter((i) => !usedItemIds.has(i.id))
        .filter((i) => q === '' || i.name.toLowerCase().includes(q))
        .slice(0, 8)
    }
    return []
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, pickerSearch, inventory, kits, form.entries])

  function submit(e) {
    e?.preventDefault()
    const name = form.name.trim()
    if (!name) return setError('Give the list a name.')
    if (form.entries.length === 0) return setError('Add at least one kit or item.')

    const payload = {
      name,
      category: form.category.trim(),
      notes: form.notes,
      entries: form.entries,
    }
    if (isEdit) onSave(list.id, payload)
    else onCreate(payload)
    onClose()
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit scenario list' : 'New scenario list'}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <label className={label}>Name</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Beauty close-up"
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
                placeholder="e.g. Editorial"
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

          {/* Entries */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Pull list ({form.entries.length})
              </span>
              <span className="text-[11px] text-slate-400">
                Kits stage their own slots · items pull by quantity
              </span>
            </div>

            <ul className="space-y-1.5">
              {form.entries.map((e, i) => {
                const isKit = e.type === 'kit'
                const target = isKit ? kitById[e.kitId] : itemById[e.itemId]
                const missing = !target
                return (
                  <li
                    key={i}
                    className={[
                      'flex items-center gap-2 rounded-lg border px-3 py-2',
                      missing ? 'border-amber-300 bg-amber-50/40' : 'border-slate-200',
                    ].join(' ')}
                  >
                    <span className="grid h-6 w-6 shrink-0 place-items-center rounded-md bg-slate-100 text-[11px] font-semibold text-slate-500">
                      {i + 1}
                    </span>
                    <span
                      className={[
                        'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        isKit ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600',
                      ].join(' ')}
                    >
                      {isKit ? <Layers size={9} /> : <Package size={9} />}
                      {isKit ? 'Kit' : 'Item'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800">
                      {target?.name ?? (isKit ? 'Deleted kit' : 'Deleted item')}
                    </span>

                    {isKit ? (
                      <span className="shrink-0 text-[11px] text-slate-400">×1</span>
                    ) : (
                      <label className="flex shrink-0 items-center gap-1 text-[11px] text-slate-400">
                        ×
                        <input
                          type="number"
                          min="1"
                          value={e.quantity}
                          onChange={(ev) =>
                            setEntry(i, { quantity: Math.max(1, Number(ev.target.value) || 1) })
                          }
                          className="w-14 rounded-md border border-slate-300 px-1.5 py-1 text-center text-xs text-slate-700 outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                        />
                      </label>
                    )}

                    <div className="flex shrink-0 items-center gap-0.5">
                      <button
                        type="button"
                        onClick={() => moveEntry(i, -1)}
                        disabled={i === 0}
                        title="Move up"
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveEntry(i, 1)}
                        disabled={i === form.entries.length - 1}
                        title="Move down"
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30"
                      >
                        <ChevronDown size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeEntry(i)}
                        title="Remove line"
                        className="rounded p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                      >
                        <X size={15} />
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            {form.entries.length === 0 && (
              <p className="rounded-lg border border-dashed border-slate-300 py-5 text-center text-sm text-slate-400">
                Nothing listed yet — add kits and items below.
              </p>
            )}

            {/* Add pickers */}
            {picker ? (
              <div className="mt-2 rounded-xl border border-slate-200 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  {picker === 'kit' ? 'Add a kit' : 'Add an item'}
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
                    onChange={(ev) => setPickerSearch(ev.target.value)}
                    placeholder={picker === 'kit' ? 'Search kits…' : 'Search inventory…'}
                    className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                  />
                </div>
                {pickerResults.length > 0 ? (
                  <ul className="mt-1 max-h-44 overflow-auto">
                    {pickerResults.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => addEntry(picker, t.id)}
                          className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition hover:bg-slate-50"
                        >
                          <span className="min-w-0 truncate text-slate-700">{t.name}</span>
                          <span className="shrink-0 text-xs text-slate-400">
                            {picker === 'kit'
                              ? `${t.slots?.length ?? 0} slots`
                              : t.kind === 'barcoded'
                                ? `${t.units?.length ?? 0} units`
                                : `${t.quantity ?? 0} on hand`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-1 py-3 text-center text-xs text-slate-400">
                    {picker === 'kit' ? 'No kits left to add.' : 'No matching items left to add.'}
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
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setPicker('kit')
                    setPickerSearch('')
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
                >
                  <Layers size={15} />
                  Add kit
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPicker('item')
                    setPickerSearch('')
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
                >
                  <Plus size={15} />
                  Add item
                </button>
              </div>
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
                <span className="text-slate-500">Delete this list?</span>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(list.id)
                    onClose()
                  }}
                  className="rounded-md bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700"
                >
                  Delete
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
                <Trash2 size={15} />
                Delete
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
              {isEdit ? <Check size={15} /> : <ClipboardList size={15} />}
              {isEdit ? 'Save list' : 'Create list'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
