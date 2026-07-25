import { useEffect, useState } from 'react'
import { CATEGORIES, ITEM_KINDS } from '../data/inventory'
import Modal from './Modal'

const MAX_QTY = 500

const KIND_HELP = {
  barcoded: 'Each unit tracked by barcode & serial.',
  non_barcoded: 'Counted by quantity only (e.g. 50 J-hooks).',
  consumable: 'Expendable stock, drawn down over time.',
}

// Create a new inventory item of any type. Barcoded items auto-generate that
// many tracked units; non-barcoded / consumable items just store a quantity.
export default function AddInventoryModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [kind, setKind] = useState('barcoded')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [quantity, setQuantity] = useState('1')

  useEffect(() => {
    if (open) {
      setName('')
      setKind('barcoded')
      setCategory(CATEGORIES[0])
      setQuantity('1')
    }
  }, [open])

  const qty = Math.floor(Number(quantity))
  const canSubmit = name.trim() !== '' && Number.isFinite(qty) && qty >= 1
  const isBarcoded = kind === 'barcoded'

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onCreate({
      name: name.trim(),
      category,
      kind,
      quantity: Math.min(MAX_QTY, qty),
    })
  }

  const fieldClass =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <Modal open={open} onClose={onClose} title="Add inventory item">
      <form onSubmit={handleSubmit} className="px-5 py-4">
        <div className="space-y-4">
          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Name
            </label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Aputure 1200D Pro"
              className={fieldClass}
            />
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Type
            </label>
            <div className="flex rounded-lg border border-slate-300 p-0.5">
              {ITEM_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  onClick={() => setKind(k.value)}
                  className={[
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    kind === k.value
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">{KIND_HELP[kind]}</p>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className={fieldClass}
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1.5 block text-sm font-medium text-slate-700">
              {isBarcoded ? 'Quantity' : 'Quantity on hand'}
            </label>
            <input
              type="number"
              min="1"
              max={MAX_QTY}
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
              className={fieldClass}
            />
            <p className="mt-1.5 text-xs text-slate-400">
              {isBarcoded ? (
                <>
                  Generates{' '}
                  {Number.isFinite(qty) && qty >= 1 ? Math.min(MAX_QTY, qty) : 0}{' '}
                  unit{qty === 1 ? '' : 's'} with auto barcodes &amp; serials.
                </>
              ) : (
                'Stored as a count — no per-unit barcodes.'
              )}
            </p>
          </div>
        </div>

        <div className="mt-6 flex justify-end gap-2">
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
