import { useEffect, useState } from 'react'
import { Check, Plus, AlertTriangle, Info } from 'lucide-react'
import Modal from './Modal'

// Add or correct the PHYSICAL COPIES of an item — the barcoded units with their
// own serial. "Add inventory" creates the item type; this manages what's on the
// shelf under it.
//
// Adding: the barcode/serial fields are optional. Left empty they're generated
// (next free barcode, deterministic serial), which is what you want when
// receiving a batch — set the count and go. Filled in, they apply to the first
// unit, which is the "I have this exact body in my hand" case.
export default function UnitEditorModal({
  open,
  unit,
  itemName,
  itemPlacement,
  suggestedBarcode,
  onClose,
  onAdd,
  onSave,
}) {
  const isEdit = !!unit
  const [barcode, setBarcode] = useState('')
  const [serial, setSerial] = useState('')
  const [placement, setPlacement] = useState('')
  const [count, setCount] = useState(1)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBarcode(isEdit ? unit.barcode ?? '' : '')
    setSerial(isEdit ? unit.serial ?? '' : '')
    setPlacement(isEdit ? unit.placement ?? '' : '')
    setCount(1)
    setError(null)
    setBusy(false)
  }, [open, unit, isEdit])

  async function submit(e) {
    e?.preventDefault()
    setBusy(true)
    const res = isEdit
      ? await onSave({ barcode, serial, placement })
      : await onAdd({ count, barcode, serial, placement })
    setBusy(false)
    if (res?.error) return setError(res.error)
    onClose()
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="md"
      title={isEdit ? `Edit unit #${unit?.barcode ?? ''}` : 'Add units'}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <p className="text-sm text-slate-500">
            {isEdit ? 'Correcting the identifiers on ' : 'Adding physical copies of '}
            <span className="font-medium text-slate-700">{itemName}</span>.
          </p>

          {!isEdit && (
            <>
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 ring-1 ring-slate-200">
                <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  Leave the barcode and serial empty to generate them (next free number
                  {suggestedBarcode ? ` — #${suggestedBarcode}` : ''}). Fill them in to register one
                  specific unit you have in hand.
                </span>
              </div>
              <div>
                <label className={label}>How many?</label>
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={count}
                  onChange={(e) => setCount(e.target.value)}
                  className={[field, 'w-28'].join(' ')}
                />
              </div>
            </>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Barcode{!isEdit && ' (first unit)'}</label>
              <input
                autoFocus
                type="text"
                value={barcode}
                onChange={(e) => setBarcode(e.target.value)}
                placeholder={isEdit ? '' : suggestedBarcode || '0000'}
                className={[field, 'font-mono'].join(' ')}
              />
            </div>
            <div>
              <label className={label}>Serial{!isEdit && ' (first unit)'}</label>
              <input
                type="text"
                value={serial}
                onChange={(e) => setSerial(e.target.value)}
                placeholder={isEdit ? '' : 'generated'}
                className={[field, 'font-mono'].join(' ')}
              />
            </div>
          </div>

          {/* Where the copy LIVES. Not the same as the LOCATION column in the
              table, which is derived (a job or a repair) and can't be typed. */}
          <div>
            <label className={label}>Storage location</label>
            <input
              type="text"
              value={placement}
              onChange={(e) => setPlacement(e.target.value)}
              placeholder={itemPlacement || 'e.g. Camera cage · Shelf A1'}
              className={field}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Where this copy is kept when it&apos;s in.{' '}
              {itemPlacement
                ? `Leave empty to use the item's — ${itemPlacement}.`
                : 'The item has no storage location yet — set one under “Edit item” and every copy inherits it.'}{' '}
              The table&apos;s Location column shows the job it&apos;s out on instead, which comes
              from the orders.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-end gap-2 border-t border-slate-200 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={busy}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {isEdit ? <Check size={15} /> : <Plus size={15} />}
            {isEdit ? 'Save unit' : 'Add'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
