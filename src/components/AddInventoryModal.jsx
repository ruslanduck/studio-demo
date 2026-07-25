import { useEffect, useState } from 'react'
import { CATEGORIES, ITEM_KINDS } from '../data/inventory'
import Modal from './Modal'

const MAX_QTY = 500

const KIND_HELP = {
  barcoded: 'Each unit tracked by barcode & serial.',
  non_barcoded: 'Counted by quantity only (e.g. 50 J-hooks).',
  consumable: 'Expendable stock, drawn down over time.',
}

const BLANK = {
  name: '',
  kind: 'barcoded',
  category: CATEGORIES[0],
  subcategory: '',
  brand: '',
  assetType: '',
  placement: '',
  replacementPrice: '',
  purchaseDate: '',
  quantity: '1',
}

// Create an inventory item of any type with the full field set. Barcoded items
// auto-generate that many tracked units; non-barcoded / consumable store a qty.
export default function AddInventoryModal({ open, onClose, onCreate }) {
  const [form, setForm] = useState(BLANK)

  useEffect(() => {
    if (open) setForm(BLANK)
  }, [open])

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const qty = Math.floor(Number(form.quantity))
  const canSubmit = form.name.trim() !== '' && Number.isFinite(qty) && qty >= 1
  const isBarcoded = form.kind === 'barcoded'

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    const price = form.replacementPrice.trim()
    onCreate({
      name: form.name.trim(),
      kind: form.kind,
      category: form.category,
      subcategory: form.subcategory.trim(),
      brand: form.brand.trim(),
      assetType: form.assetType.trim(),
      placement: form.placement.trim(),
      replacementPrice: price === '' ? null : Number(price),
      purchaseDate: form.purchaseDate || null,
      quantity: Math.min(MAX_QTY, qty),
    })
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
  const label = 'mb-1.5 block text-sm font-medium text-slate-700'

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Add inventory item">
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <label className={label}>Name</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Aputure 1200D Pro"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Type</label>
            <div className="flex rounded-lg border border-slate-300 p-0.5">
              {ITEM_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, kind: k.value }))}
                  className={[
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    form.kind === k.value
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{KIND_HELP[form.kind]}</p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Category</label>
              <select value={form.category} onChange={set('category')} className={field}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Subcategory</label>
              <input
                type="text"
                value={form.subcategory}
                onChange={set('subcategory')}
                placeholder="e.g. LED Panels"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Brand</label>
              <input
                type="text"
                value={form.brand}
                onChange={set('brand')}
                placeholder="e.g. Aputure"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Asset type</label>
              <input
                type="text"
                value={form.assetType}
                onChange={set('assetType')}
                placeholder="e.g. Fixture"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Placement</label>
              <input
                type="text"
                value={form.placement}
                onChange={set('placement')}
                placeholder="e.g. Shelf B3"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Replacement price</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.replacementPrice}
                  onChange={set('replacementPrice')}
                  placeholder="0.00"
                  className={field + ' pl-7'}
                />
              </div>
            </div>
            <div>
              <label className={label}>Purchase date</label>
              <input
                type="date"
                value={form.purchaseDate}
                onChange={set('purchaseDate')}
                className={field}
              />
            </div>
            <div>
              <label className={label}>{isBarcoded ? 'Quantity' : 'Quantity on hand'}</label>
              <input
                type="number"
                min="1"
                max={MAX_QTY}
                value={form.quantity}
                onChange={set('quantity')}
                className={field}
              />
              <p className="mt-1.5 text-xs text-slate-400">
                {isBarcoded
                  ? `Generates ${Number.isFinite(qty) && qty >= 1 ? Math.min(MAX_QTY, qty) : 0} unit${qty === 1 ? '' : 's'} with auto barcodes.`
                  : 'Stored as a count — no per-unit barcodes.'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            Add item
          </button>
        </div>
      </form>
    </Modal>
  )
}
