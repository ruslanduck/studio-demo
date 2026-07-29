import { useEffect, useMemo, useState } from 'react'
import { Check, Plus, AlertTriangle, Info, X } from 'lucide-react'
import Modal from './Modal'

const MAX_ROWS = 50

const blankRow = () => ({ barcode: '', serial: '' })

// Add or correct the PHYSICAL COPIES of an item — the barcoded units with their
// own serial. "Add inventory" creates the item type; this manages what's on the
// shelf under it.
//
// Adding shows ONE ROW PER COPY, because that's the only honest way to register
// several: a batch of 6 identical stands can be left blank (barcode + serial
// generated per row), while gear with real serials needs each one typed. The
// count field and "Add another" are two ways to get the same rows.
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
  const [rows, setRows] = useState([blankRow()])
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setBarcode(isEdit ? unit.barcode ?? '' : '')
    setSerial(isEdit ? unit.serial ?? '' : '')
    setPlacement(isEdit ? unit.placement ?? '' : '')
    setRows([blankRow()])
    setError(null)
    setBusy(false)
  }, [open, unit, isEdit])

  // What each blank row will actually get, skipping numbers typed elsewhere in
  // the batch — so the greyed-out preview never promises a barcode it can't use.
  const previews = useMemo(() => {
    const base = parseInt(suggestedBarcode, 10)
    const typed = new Set(rows.map((r) => r.barcode.trim()).filter(Boolean))
    let next = Number.isFinite(base) ? base : 1
    return rows.map((r) => {
      if (r.barcode.trim()) return null
      let code = String(next).padStart(4, '0')
      while (typed.has(code)) code = String(++next).padStart(4, '0')
      next++
      return code
    })
  }, [rows, suggestedBarcode])

  function setCount(value) {
    const n = Math.max(1, Math.min(MAX_ROWS, Math.floor(Number(value) || 1)))
    setRows((cur) =>
      n === cur.length
        ? cur
        : n < cur.length
          ? cur.slice(0, n)
          : [...cur, ...Array.from({ length: n - cur.length }, blankRow)],
    )
  }

  const setRow = (i, key) => (e) =>
    setRows((cur) => cur.map((r, idx) => (idx === i ? { ...r, [key]: e.target.value } : r)))

  async function submit(e) {
    e?.preventDefault()
    if (!isEdit) {
      // Two rows claiming one barcode is a mistake worth catching here — the
      // store only knows about barcodes that already exist.
      const typed = rows.map((r) => r.barcode.trim()).filter(Boolean)
      const dup = typed.find((c, i) => typed.indexOf(c) !== i)
      if (dup) return setError(`#${dup} is listed twice — each copy needs its own barcode.`)
    }
    setBusy(true)
    const res = isEdit
      ? await onSave({ barcode, serial, placement })
      : await onAdd({ units: rows, placement })
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

          {isEdit ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className={label}>Barcode</label>
                <input
                  autoFocus
                  type="text"
                  value={barcode}
                  onChange={(e) => setBarcode(e.target.value)}
                  className={[field, 'font-mono'].join(' ')}
                />
              </div>
              <div>
                <label className={label}>Serial</label>
                <input
                  type="text"
                  value={serial}
                  onChange={(e) => setSerial(e.target.value)}
                  className={[field, 'font-mono'].join(' ')}
                />
              </div>
            </div>
          ) : (
            <>
              <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 ring-1 ring-slate-200">
                <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
                <span>
                  One row per copy. Leave a row empty and its barcode and serial are generated —
                  that&apos;s the case for a batch of identical gear. Type them in for a copy you
                  have in hand.
                </span>
              </div>

              <div className="flex items-end gap-3">
                <div>
                  <label className={label}>How many?</label>
                  <input
                    type="number"
                    min="1"
                    max={MAX_ROWS}
                    value={rows.length}
                    onChange={(e) => setCount(e.target.value)}
                    className={[field, 'w-24'].join(' ')}
                  />
                </div>
                <p className="pb-2.5 text-xs text-slate-400">
                  {rows.length === 1 ? '1 copy' : `${rows.length} copies`} will be registered.
                </p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-[1.5rem_1fr_1fr_1.5rem] items-center gap-2 text-[11px] uppercase tracking-wide text-slate-400">
                  <span />
                  <span>Barcode</span>
                  <span>Serial</span>
                  <span />
                </div>
                {rows.map((row, i) => (
                  <div key={i} className="grid grid-cols-[1.5rem_1fr_1fr_1.5rem] items-center gap-2">
                    <span className="text-right text-xs text-slate-400">{i + 1}</span>
                    <input
                      autoFocus={i === 0}
                      type="text"
                      value={row.barcode}
                      onChange={setRow(i, 'barcode')}
                      placeholder={previews[i] ?? ''}
                      className={[field, 'font-mono'].join(' ')}
                    />
                    <input
                      type="text"
                      value={row.serial}
                      onChange={setRow(i, 'serial')}
                      placeholder="generated"
                      className={[field, 'font-mono'].join(' ')}
                    />
                    {rows.length > 1 ? (
                      <button
                        type="button"
                        onClick={() => setRows((cur) => cur.filter((_, idx) => idx !== i))}
                        title="Remove this copy"
                        className="rounded p-1 text-slate-400 transition hover:bg-slate-100 hover:text-rose-600"
                      >
                        <X size={14} />
                      </button>
                    ) : (
                      <span />
                    )}
                  </div>
                ))}
                {rows.length < MAX_ROWS && (
                  <button
                    type="button"
                    onClick={() => setRows((cur) => [...cur, blankRow()])}
                    className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50"
                  >
                    <Plus size={13} />
                    Add another copy
                  </button>
                )}
              </div>
            </>
          )}

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
              Where {isEdit ? 'this copy is' : rows.length === 1 ? 'it is' : 'they are'} kept when
              in.{' '}
              {!isEdit && rows.length > 1 && 'Applies to every copy above. '}
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
            {isEdit ? 'Save unit' : rows.length === 1 ? 'Add copy' : `Add ${rows.length} copies`}
          </button>
        </div>
      </form>
    </Modal>
  )
}
