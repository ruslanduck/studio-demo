import { useEffect, useState } from 'react'
import { Plus, Minus, AlertTriangle, Info } from 'lucide-react'
import Modal from './Modal'

// Move stock for a non-barcoded item, which has no unit rows to
// add — only a count. The point is that you say what ARRIVED or WENT OUT and
// the system does the arithmetic: overwriting the number by hand loses the
// event, and the item card's history had nothing to show.
export default function StockModal({ open, item, onClose, onSubmit }) {
  const [mode, setMode] = useState('add') // 'add' | 'remove'
  const [count, setCount] = useState('1')
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setMode('add')
    setCount('1')
    setError(null)
    setBusy(false)
  }, [open, item])

  const onHand = item?.quantity ?? 0
  const n = Math.max(0, Math.trunc(Number(count) || 0))
  const delta = mode === 'add' ? n : -n
  const next = onHand + delta
  const tooMany = next < 0

  async function submit(e) {
    e?.preventDefault()
    if (!n) return setError('Enter how many.')
    if (tooMany) return setError(`Only ${onHand} on hand — can't take ${n} out.`)
    setBusy(true)
    const res = await onSubmit({ delta })
    setBusy(false)
    if (res?.error) return setError(res.error)
    onClose()
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <Modal open={open} onClose={onClose} size="md" title="Stock">
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <p className="text-sm text-slate-500">
            <span className="font-medium text-slate-700">{item?.name}</span> is counted by quantity —
            no barcodes, no per-unit rows.
          </p>

          <div className="flex rounded-lg border border-slate-300 p-0.5">
            {[
              { value: 'add', text: 'Received', icon: Plus },
              { value: 'remove', text: 'Went out', icon: Minus },
            ].map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => {
                  setMode(m.value)
                  setError(null)
                }}
                className={[
                  'flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium transition',
                  mode === m.value
                    ? 'bg-violet-600 text-white shadow-sm'
                    : 'text-slate-600 hover:bg-slate-100',
                ].join(' ')}
              >
                <m.icon size={13} />
                {m.text}
              </button>
            ))}
          </div>

          <div className="flex items-end gap-4">
            <div>
              <label className={label}>How many?</label>
              <input
                autoFocus
                type="number"
                min="1"
                value={count}
                onChange={(e) => {
                  setCount(e.target.value)
                  setError(null)
                }}
                className={[field, 'w-28'].join(' ')}
              />
            </div>
            <div className="pb-1 text-sm text-slate-500">
              On hand <span className="font-medium text-slate-700">{onHand}</span>
              <span className="mx-1.5 text-slate-300">→</span>
              <span
                className={[
                  'font-semibold',
                  tooMany ? 'text-rose-600' : delta > 0 ? 'text-emerald-600' : 'text-slate-900',
                ].join(' ')}
              >
                {tooMany ? '—' : next}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 ring-1 ring-slate-200">
            <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
            <span>
              Recorded in this item&apos;s activity with your name and the time — that&apos;s the
              difference from correcting the number under “Edit item”.
            </span>
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
            disabled={busy || tooMany}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
          >
            {mode === 'add' ? <Plus size={15} /> : <Minus size={15} />}
            {mode === 'add' ? `Add ${n || ''}`.trim() : `Take out ${n || ''}`.trim()}
          </button>
        </div>
      </form>
    </Modal>
  )
}
