import { useEffect, useMemo, useState } from 'react'
import { ClipboardCheck, Check, AlertTriangle, Info, Archive as ArchiveIcon } from 'lucide-react'
import Modal from './Modal'
import DateField from './DateField'
import { studioLabel } from '../data/studios'

// Order (Estimate) creation form — epic #5, 5.1 + 5.2.
//
// Terminology (agreed with Clay):
//   Job   = what we shoot, a free-text job name.
//   Set   = the shoot itself; creating an order creates the Set it equips, so the
//           job shows up on the studio calendar. Max 5 sets per studio per day —
//           the store refuses the 6th and the error lands here.
//   Order = the equipment list for that set. Starts as HOLD.
//
// 5.2: PO number is typed in by hand — deliberately NOT generated — because it
// has to match the number accounting already issued for the job. The client
// outline said "generate automatic PO"; the last call overrode that.
const blank = {
  jobName: '',
  studioId: '1',
  startsOn: '',
  endsOn: '',
  photographer: '',
  poNumber: '',
  status: 'hold',
}

export default function OrderEditorModal({
  open,
  order,
  prefill,
  studios,
  photographers,
  onClose,
  onCreate,
  onSave,
  onDelete,
}) {
  const isEdit = !!order
  const [form, setForm] = useState(blank)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm(
      order
        ? {
            jobName: order.jobName ?? '',
            studioId: order.studioId ?? '1',
            startsOn: order.startsOn ?? '',
            endsOn: order.endsOn ?? order.startsOn ?? '',
            photographer: order.photographer ?? '',
            poNumber: order.poNumber ?? '',
            status: order.status ?? 'hold',
          }
        : // 5.1 — reuse the V1 behaviour: a calendar cell pre-fills studio + date.
          { ...blank, ...(prefill ?? {}) },
    )
    setError(null)
    setConfirmDelete(false)
    setBusy(false)
  }, [open, order, prefill])

  const set = (changes) => setForm((f) => ({ ...f, ...changes }))

  // Keep the end date from preceding the start date.
  const endInvalid = useMemo(
    () => !!form.endsOn && !!form.startsOn && form.endsOn < form.startsOn,
    [form.endsOn, form.startsOn],
  )

  async function submit(e) {
    e?.preventDefault()
    if (!form.jobName.trim()) return setError('Give the job a name — what are we shooting?')
    if (!form.startsOn) return setError('Pick the first working date.')
    if (endInvalid) return setError('The last working date is before the first one.')

    setBusy(true)
    const payload = { ...form, jobName: form.jobName.trim(), endsOn: form.endsOn || form.startsOn }
    const res = isEdit ? await onSave(order.id, payload) : await onCreate(payload)
    setBusy(false)
    if (res?.error) return setError(res.error)
    onClose()
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit order' : 'New order'}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {!isEdit && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                The order starts on <strong>Hold</strong> and books the studio for this job. Saving
                opens the equipment picker straight away — items, kits and scenario lists.
              </span>
            </div>
          )}

          <div>
            <label className={label}>Job name — what are we shooting?</label>
            <input
              autoFocus
              type="text"
              value={form.jobName}
              onChange={(e) => set({ jobName: e.target.value })}
              placeholder="e.g. Loft e-commerce on figure"
              className={field}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Studio</label>
              <select
                value={form.studioId}
                onChange={(e) => set({ studioId: e.target.value })}
                className={field}
              >
                {studios.map((id) => (
                  <option key={id} value={id}>
                    {studioLabel(id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Photographer</label>
              <input
                type="text"
                list="order-photographer-options"
                value={form.photographer}
                onChange={(e) => set({ photographer: e.target.value })}
                placeholder="Select or type…"
                className={field}
              />
              <datalist id="order-photographer-options">
                {photographers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>First working date</label>
              <DateField
                value={form.startsOn}
                onChange={(e) => set({ startsOn: e.target.value })}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Last working date</label>
              <DateField
                value={form.endsOn}
                onChange={(e) => set({ endsOn: e.target.value })}
                className={field}
              />
              <p className="mt-1 text-[11px] text-slate-400">
                Leave empty for a single-day job.
              </p>
            </div>
          </div>

          {/* 5.2 — the accounting PO, typed in by hand */}
          <div>
            <label className={label}>PO number</label>
            <input
              type="text"
              value={form.poNumber}
              onChange={(e) => set({ poNumber: e.target.value })}
              placeholder="e.g. PO-4503"
              className={[field, 'font-mono'].join(' ')}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Typed in from accounting — it must match their PO for this job. Not generated.
            </p>
          </div>

          {isEdit && (
            <div>
              <label className={label}>Status</label>
              <div className="flex rounded-lg border border-slate-300 p-0.5">
                {[
                  ['hold', 'Hold', 'bg-amber-400 text-amber-950'],
                  ['confirmed', 'Confirmed', 'bg-emerald-500 text-white'],
                ].map(([val, lbl, active]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => set({ status: val })}
                    className={[
                      'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                      form.status === val ? active : 'text-slate-600 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    {lbl}
                  </button>
                ))}
              </div>
              {!['hold', 'confirmed'].includes(form.status) && (
                <p className="mt-1 text-[11px] text-slate-400">
                  Currently “{form.status}” — picking Hold or Confirmed replaces it.
                </p>
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
          {isEdit && onDelete ? (
            confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">
                  Archive this order? Its gear is released and the shoot leaves the calendar —
                  both come back if you restore it.
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(order.id)
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
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {isEdit ? <Check size={15} /> : <ClipboardCheck size={15} />}
              {isEdit ? 'Save order' : 'Create & add equipment'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
