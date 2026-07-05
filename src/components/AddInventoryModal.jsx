import { useEffect, useState } from 'react'
import { CATEGORIES } from '../data/inventory'
import Modal from './Modal'

const MAX_QTY = 500

// Create a new inventory item. On submit it auto-generates `quantity` units
// (handled by the store) and reports the new item's id back to the parent.
export default function AddInventoryModal({ open, onClose, onCreate }) {
  const [name, setName] = useState('')
  const [category, setCategory] = useState(CATEGORIES[0])
  const [quantity, setQuantity] = useState('1')

  // Reset the form each time the modal opens.
  useEffect(() => {
    if (open) {
      setName('')
      setCategory(CATEGORIES[0])
      setQuantity('1')
    }
  }, [open])

  const qty = Math.floor(Number(quantity))
  const canSubmit = name.trim() !== '' && Number.isFinite(qty) && qty >= 1

  function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    onCreate({
      name: name.trim(),
      category,
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
              Quantity
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
              Generates {Number.isFinite(qty) && qty >= 1 ? Math.min(MAX_QTY, qty) : 0}{' '}
              unit{qty === 1 ? '' : 's'} with auto barcodes &amp; serials, all owned.
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
