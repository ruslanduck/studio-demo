import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Activity, TrendingUp, Briefcase, Plus, CalendarRange } from 'lucide-react'
import Modal from './Modal'
import DateField from './DateField'
import SelectField from './SelectField'
import { STUDIOS, studioLabel } from '../data/studios'
import { usageSummary } from '../data/usage'

const todayISO = () => format(new Date(), 'yyyy-MM-dd')

const field =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-sm font-medium text-slate-700'

// Aggregate stat tile.
export function UsageStats({ events, className }) {
  const s = usageSummary(events, new Date())
  const tiles = [
    { icon: TrendingUp, label: 'Used · 12 mo', value: s.last12 },
    { icon: Activity, label: 'Total used', value: s.totalQty },
    { icon: Briefcase, label: 'Jobs', value: s.jobCount },
  ]
  return (
    <div className={['grid grid-cols-3 gap-2.5', className || ''].join(' ')}>
      {tiles.map((t) => (
        <div key={t.label} className="rounded-xl border border-slate-200 bg-slate-50/70 px-3 py-2.5">
          <div className="flex items-center gap-1 text-[10px] font-medium uppercase tracking-wide text-slate-400">
            <t.icon size={11} /> {t.label}
          </div>
          <div className="mt-0.5 text-2xl font-semibold text-slate-900">{t.value}</div>
        </div>
      ))}
    </div>
  )
}

// One usage-timeline row.
function UsageRow({ e }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2">
      <div className="flex min-w-0 items-center gap-2">
        <CalendarRange size={15} className="shrink-0 text-violet-500" />
        <span className="truncate text-sm font-medium text-slate-800">
          {e.jobTitle || 'Usage'}
        </span>
        {e.studioId && (
          <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
            {studioLabel(e.studioId)}
          </span>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-3 text-xs">
        <span className="font-medium text-slate-700">×{e.quantity}</span>
        <span className="text-slate-400">{e.usedOn}</span>
      </div>
    </li>
  )
}

// Per-item work history: aggregate counters + a usage timeline, plus an
// optional "log usage" form (the analytics foundation for all item types).
export default function WorkHistoryModal({ open, onClose, item, canLog, onLog }) {
  const events = item?.usage || []
  const [form, setForm] = useState({ quantity: '1', jobTitle: '', studioId: '1', usedOn: todayISO() })
  const [busy, setBusy] = useState(false)
  const [showLog, setShowLog] = useState(false)

  useEffect(() => {
    if (!open) return
    setForm({ quantity: '1', jobTitle: '', studioId: '1', usedOn: todayISO() })
    setShowLog(false)
    setBusy(false)
  }, [open, item?.id])

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))
  const qty = Math.floor(Number(form.quantity))

  async function handleLog(e) {
    e.preventDefault()
    if (busy || !form.jobTitle.trim() || !(qty >= 1)) return
    setBusy(true)
    try {
      await onLog({
        quantity: qty,
        jobTitle: form.jobTitle.trim(),
        studioId: form.studioId,
        usedOn: form.usedOn || todayISO(),
      })
      setShowLog(false)
      setForm({ quantity: '1', jobTitle: '', studioId: '1', usedOn: todayISO() })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Work history">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {item && (
          <div className="mb-4">
            <div className="truncate font-semibold text-slate-900">{item.name}</div>
            <div className="mt-0.5 text-xs text-slate-500">
              {item.category}
              {item.brand ? ` · ${item.brand}` : ''}
            </div>
          </div>
        )}

        <UsageStats events={events} className="mb-4" />

        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Usage timeline
          </h4>
          {canLog && !showLog && (
            <button
              type="button"
              onClick={() => setShowLog(true)}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
            >
              <Plus size={14} />
              Log usage
            </button>
          )}
        </div>

        {canLog && showLog && (
          <form onSubmit={handleLog} className="mb-3 rounded-xl border border-slate-200 p-3">
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              <div className="col-span-2">
                <label className={label}>Job</label>
                <input
                  autoFocus
                  type="text"
                  value={form.jobTitle}
                  onChange={set('jobTitle')}
                  placeholder="e.g. 20260716_AT_MAIN"
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Studio</label>
                <SelectField
                  value={form.studioId}
                  onChange={set('studioId')}
                  options={STUDIOS.map((id) => ({ value: id, label: studioLabel(id) }))}
                  className={field}
                />
              </div>
              <div>
                <label className={label}>Qty</label>
                <input
                  type="number"
                  min="1"
                  value={form.quantity}
                  onChange={set('quantity')}
                  className={field}
                />
              </div>
              <div className="col-span-2">
                <label className={label}>Date</label>
                <DateField value={form.usedOn} onChange={set('usedOn')} className={field} />
              </div>
            </div>
            <div className="mt-3 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowLog(false)}
                className="rounded-lg px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy || !form.jobTitle.trim() || !(qty >= 1)}
                className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3.5 py-1.5 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={15} />
                Add
              </button>
            </div>
          </form>
        )}

        {events.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            No usage recorded yet.
          </p>
        ) : (
          <ul className="space-y-1.5">
            {events.map((e, i) => (
              <UsageRow key={i} e={e} />
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
