import { useEffect, useState } from 'react'
import { Check, AlertTriangle, Info, Archive as ArchiveIcon, Boxes } from 'lucide-react'
import Modal from './Modal'
import DateField from './DateField'
import SelectField from './SelectField'
import ComboField from './ComboField'
import { studioLabel } from '../data/studios'
import { MAX_SET_DAYS, setSpanDays, spanLabel } from '../lib/setDays'
import { isValidTime, normalizeCallTimes, wrapBeforeFirstCall } from '../lib/callTimes'
import CallTimesField from './CallTimesField'

// Order (Estimate) creation form — epic #5, 5.1 + 5.2.
//
// Terminology (agreed with Clay):
//   Job   = what we shoot, a free-text job name.
//   Set   = the shoot itself; creating an order creates the Set it equips, so the
//           job shows up on the studio calendar. Max 5 sets per studio per day —
//           the store refuses the 6th and the error lands here.
//   Order = the equipment list for that set. Starts as HOLD.
//
// Creating one is TWO steps: this form settles the job (studio, set dates, job
// name, photographer, PO) and its button leads to the equipment window, which
// is where the order is actually created. Equipment used to be pickable here
// too; that duplicated the fuller picker, so it was removed.
//
// 5.2: PO number is typed in by hand — deliberately NOT generated — because it
// has to match the number accounting already issued for the job. The client
// outline said "generate automatic PO"; the last call overrode that.
//
// A shoot books WHOLE DAYS and may book several of them, so the form asks for a
// start date and an end date. It used to ask for one date plus a start and end
// TIME, and those times were fiction: the grid is studio × day, not hourly, and
// an order-created set got a hardcoded 09:00–18:00 because nothing collected
// one. The range is what the crew actually needs to say.
const blank = {
  jobName: '',
  setLabel: '',
  brand: '',
  jobType: '',
  notes: '',
  studioId: '1',
  startsOn: '',
  endsOn: '',
  callTimes: [],
  wrapTime: '',
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
  brands = [],
  jobTypes = [],
  roleOptions = [],
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
            brand: order.brand ?? '',
            jobType: order.jobType ?? '',
            notes: order.notes ?? '',
            studioId: order.studioId ?? '1',
            startsOn: order.startsOn ?? '',
            endsOn: order.endsOn ?? order.startsOn ?? '',
            // The schedule lives on the SHOOT; the job form is where the crew
            // edits it, so the caller hands it in alongside the order.
            callTimes: (order.callTimes ?? []).map((c) => ({ ...c })),
            wrapTime: order.wrapTime ?? '',
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

  // Picking a start pulls an empty or earlier end along with it, so the common
  // case (a one-day shoot) is one click and the range can never read backwards
  // just because the fields were filled in an awkward order.
  const setStart = (startsOn) =>
    setForm((f) => ({
      ...f,
      startsOn,
      endsOn: !f.endsOn || f.endsOn < startsOn ? startsOn : f.endsOn,
    }))

  const days = setSpanDays(form.startsOn, form.endsOn)

  async function submit(e) {
    e?.preventDefault()
    if (!form.jobName.trim()) return setError('Give the job a name — what are we shooting?')
    if (!form.startsOn) return setError('Pick the start date.')
    // Clamping a backwards range silently would book days nobody asked for.
    if (form.endsOn && form.endsOn < form.startsOn)
      return setError('The last day is before the first one — check the dates.')
    if (days > MAX_SET_DAYS)
      return setError(`${days} days is longer than a shoot gets (max ${MAX_SET_DAYS}) — check the year.`)
    // A half-typed time is a typo, and dropping it silently would put the wrong
    // hour on the call sheet. An empty row (no roles, no time) is fine — it is
    // just a row the crew opened and left, and it is dropped on save.
    const halfTyped = form.callTimes.find(
      (c) => (c.time || (c.roles || []).length) && !(isValidTime(c.time) && (c.roles || []).length),
    )
    if (halfTyped)
      return setError('Every call time needs a role and an HH:MM time — or remove the row.')
    if (form.wrapTime && !isValidTime(form.wrapTime))
      return setError('The wrap time should read as HH:MM.')
    if (wrapBeforeFirstCall(form.callTimes, form.wrapTime))
      return setError('The wrap time is before the first call.')
    setBusy(true)
    const payload = {
      ...form,
      jobName: form.jobName.trim(),
      setLabel: form.setLabel.trim(),
      brand: form.brand.trim(),
      jobType: form.jobType.trim(),
      notes: form.notes.trim(),
      // A one-day shoot ends the day it starts; the store normalises this too,
      // so nothing downstream has to guess what an empty end means.
      endsOn: form.endsOn || form.startsOn,
      callTimes: normalizeCallTimes(form.callTimes),
      wrapTime: form.wrapTime || null,
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
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit job' : 'New job'}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          {!isEdit && (
            <div className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800 ring-1 ring-amber-200">
              <Info size={14} className="mt-0.5 shrink-0" />
              <span>
                The job starts on <strong>Hold</strong> and books the studio for
                {days > 1 ? ` all ${days} days` : ' the day'}. Equipment comes next, in the
                window that opens after this one.
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

          {/* A shoot books whole days, from the first to the last — no times.
              Availability, the estimate's billable days, the packing sheet and
              the job search already read this window; the form is what used to
              force it shut on the day it opened. */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>First day</label>
              <DateField
                value={form.startsOn}
                onChange={(e) => setStart(e.target.value)}
                className={field}
              />
            </div>
            <div>
              <label className={label}>Last day</label>
              <DateField
                value={form.endsOn}
                onChange={(e) => set({ endsOn: e.target.value })}
                className={field}
              />
              <p
                className={[
                  'mt-1 text-[11px]',
                  form.endsOn && form.startsOn && form.endsOn < form.startsOn
                    ? 'font-medium text-rose-600'
                    : 'text-slate-400',
                ].join(' ')}
              >
                {!form.startsOn
                  ? 'Same as the first day unless you say otherwise.'
                  : form.endsOn && form.endsOn < form.startsOn
                    ? 'That is before the first day.'
                    : days > 1
                      ? `${days} days · ${spanLabel(form.startsOn, form.endsOn)} — the studio and the gear are held for all of them.`
                      : `One day · ${spanLabel(form.startsOn, form.endsOn)}`}
              </p>
            </div>
          </div>

          {/* The call sheet. A shoot has no single start time — the
              photographer is called at 08:00 and the models at 10:00 — so the
              generic start/end pair was replaced by this list plus a wrap.
              ⚠️ A call sheet belongs to the SHOOT (`set_call_times` +
              `sets.wrap_time`), so a job with no shoot row has nowhere to keep
              one. Three legacy sub-rental orders are in that state — we rented
              FROM a vendor, no studio was booked — and the form used to take a
              full call sheet and drop it on save without a word. Measured on
              prod: typed 07:15 Producer + Photographer with an 18:30 wrap,
              saved, and the card came back "not set". Creating a job is fine —
              its shoot is written in the same action. */}
          {isEdit && !order?.setId ? (
            <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 ring-1 ring-slate-200">
              <p className="font-medium text-slate-700">No call sheet</p>
              <p className="mt-1">This job has no shoot booked.</p>
            </div>
          ) : (
            <div className="rounded-lg bg-surface p-3 ring-1 ring-slate-200">
              <CallTimesField
                value={form.callTimes}
                // The field hands back an updater, applied against the CURRENT
                // form — see the note on CallTimesField.
                onChange={(fn) => setForm((f) => ({ ...f, callTimes: fn(f.callTimes) }))}
                roleOptions={roleOptions}
                wrapTime={form.wrapTime}
                onWrapChange={(wrapTime) => set({ wrapTime })}
              />
            </div>
          )}

          {/* Brand + shoot type (20260908120000). Both free text with
              suggestions, NOT closed dropdowns: a new client arrives and a third
              kind of shoot appears, and refusing to book either is absurd. The
              suggestion lists are built from what the register already uses (the
              types also always offer Editorial / PDP), so the filters on the list
              can only ever offer values that match something. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={label}>Brand</label>
              <ComboField
                value={form.brand}
                onChange={(e) => set({ brand: e.target.value })}
                options={brands}
                placeholder="Who is it for…"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Type</label>
              <ComboField
                value={form.jobType}
                onChange={(e) => set({ jobType: e.target.value })}
                options={jobTypes}
                placeholder="Editorial, PDP…"
                className={field}
              />
            </div>
          </div>

          {/* A free-text note on the JOB. Deliberately a textarea, not an input:
              what the crew writes here is a sentence or three ("client brings
              their own backdrop", "load in through the freight door"), and a
              single-line box would hide most of it. */}
          <div>
            <label className={label}>Note</label>
            <textarea
              rows={3}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Anything the crew should know about this job…"
              className={`${field} resize-y`}
            />
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
                  className="rounded-md bg-danger px-2.5 py-1 font-medium text-white transition hover:bg-danger-strong"
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
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white transition hover:bg-brand-strong disabled:opacity-50"
            >
              {isEdit ? <Check size={15} /> : <Boxes size={15} />}
              {isEdit ? 'Save job' : 'Select equipment'}
            </button>
          </div>
        </div>
      </form>

    </Modal>
  )
}
