import { useEffect, useState } from 'react'
import {
  Check,
  AlertTriangle,
  Info,
  Archive as ArchiveIcon,
  Layers,
  Minus,
  Plus,
  X,
  Boxes,
} from 'lucide-react'
import Modal from './Modal'
import DateField from './DateField'
import SelectField from './SelectField'
import ComboField from './ComboField'
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
// Creating one is TWO steps: this form settles the job (studio, set date, job
// name, photographer, PO) and its button leads to the equipment window, which
// is where the order is actually created. Equipment used to be pickable here
// too; that duplicated the fuller picker, so it was removed.
//
// 5.2: PO number is typed in by hand — deliberately NOT generated — because it
// has to match the number accounting already issued for the job. The client
// outline said "generate automatic PO"; the last call overrode that.
const blank = {
  jobName: '',
  setLabel: '',
  studioId: '1',
  startsOn: '',
  photographer: '',
  poNumber: '',
  status: 'hold',
}

// One staged kit, as a row. Rendered both inside a preset's frame and on its own,
// so it lives here rather than being written twice.
function KitRow({ kitName, units, onRemove }) {
  return (
    <li className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-violet-200">
      <span className="inline-flex min-w-0 items-center gap-1.5">
        <Layers size={13} className="shrink-0 text-violet-500" />
        <span className="truncate font-medium text-slate-700">{kitName}</span>
        <span className="shrink-0 text-slate-400">
          {units.filter((u) => u.kitName === kitName).length} unit(s)
        </span>
      </span>
      <button
        type="button"
        onClick={onRemove}
        title="Remove this kit"
        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-500"
      >
        <X size={13} />
      </button>
    </li>
  )
}

// One a-la-carte line: quantity steppers and what's actually free behind it.
// Over-capacity is shown, never refused (same rule as the booking modal).
function ItemLine({ item, itemId, qty, free, onLess, onMore, onRemove }) {
  const over = item?.kind === 'barcoded' ? Math.max(0, qty - free) : 0
  return (
    <li className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-slate-200">
      <span className="min-w-0 flex-1 truncate text-slate-700">{item?.name ?? itemId}</span>
      <span className="inline-flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={onLess}
          className="grid h-5 w-5 place-items-center rounded border border-slate-300 text-slate-500 hover:bg-slate-100"
        >
          <Minus size={11} />
        </button>
        <span className="w-5 text-center font-medium text-slate-800">{qty}</span>
        <button
          type="button"
          onClick={onMore}
          className="grid h-5 w-5 place-items-center rounded border border-slate-300 text-slate-500 hover:bg-slate-100"
        >
          <Plus size={11} />
        </button>
      </span>
      <span
        className={[
          'w-24 shrink-0 text-right',
          over > 0 ? 'font-medium text-amber-700' : 'text-slate-400',
        ].join(' ')}
      >
        {over > 0 ? `/${free} free · ${over} short` : `/${free} free`}
      </span>
      <button
        type="button"
        onClick={onRemove}
        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-500"
      >
        <X size={13} />
      </button>
    </li>
  )
}

export default function OrderEditorModal({
  open,
  order,
  prefill,
  studios,
  photographers,
  onClose,
  onProceed,
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
            setLabel: order.setLabel ?? '',
            studioId: order.studioId ?? '1',
            startsOn: order.startsOn ?? '',
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

  async function submit(e) {
    e?.preventDefault()
    if (!form.jobName.trim()) return setError('Give the job a name — what are we shooting?')
    if (!form.startsOn) return setError('Pick the set date.')
    setBusy(true)
    const payload = {
      ...form,
      jobName: form.jobName.trim(),
      setLabel: form.setLabel.trim(),
      // One-day shoot: the window closes on the same date it opens.
      endsOn: form.startsOn,
    }
    // Creating is a two-step flow: this form settles the job, then the equipment
    // window opens and IT creates the order together with the gear. So nothing is
    // written yet — abandoning step two leaves no empty order behind.
    const res = isEdit ? await onSave(order.id, payload) : await onProceed(payload)
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
                The order starts on <strong>Hold</strong> and books the studio for this job.
                Equipment comes next, in the window that opens after this one.
              </span>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
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
            {/* The crew's own designation for the set — typed, never generated,
                like the PO. A studio runs several sets a day and this is what
                tells them apart on the calendar and on the pull sheet. */}
            <div>
              <label className={label}>Set</label>
              <input
                type="text"
                value={form.setLabel}
                onChange={(e) => set({ setLabel: e.target.value })}
                placeholder="e.g. OMSet1"
                className={field}
              />
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Studio</label>
              <SelectField
                value={form.studioId}
                onChange={(e) => set({ studioId: e.target.value })}
                options={studios.map((id) => ({ value: id, label: studioLabel(id) }))}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Photographer</label>
              <ComboField
                value={form.photographer}
                onChange={(e) => set({ photographer: e.target.value })}
                options={photographers}
                placeholder="Select or type…"
                className={field}
              />
            </div>
          </div>

          {/* A shoot is always a single day, so there is one date, not a range.
              `endsOn` is still written (equal to it) because availability, the
              estimate's billable days and the order search all read a window. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Set date</label>
              <DateField
                value={form.startsOn}
                onChange={(e) => set({ startsOn: e.target.value })}
                className={field}
              />
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
                  Archive this order? Its gear is released and the shoot leaves the calendar.
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
              {isEdit ? <Check size={15} /> : <Boxes size={15} />}
              {isEdit ? 'Save order' : 'Select equipment'}
            </button>
          </div>
        </div>
      </form>

    </Modal>
  )
}
