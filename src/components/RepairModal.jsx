import { useEffect, useState } from 'react'
import { format } from 'date-fns'
import { Wrench, CheckCircle2, Clock, PackageCheck } from 'lucide-react'
import Modal from './Modal'
import DateField from './DateField'

const todayISO = () => format(new Date(), 'yyyy-MM-dd')

function daysSince(iso) {
  const d = Math.floor((Date.now() - Date.parse(iso)) / 86400000)
  return Number.isFinite(d) && d > 0 ? d : 0
}

const field =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const label = 'mb-1.5 block text-sm font-medium text-slate-700'

// Per-unit repair log: send a unit out for repair (vendor + issue), mark it
// returned (date + resolution), and see the full repair history. An open
// repair makes the unit unavailable.
export default function RepairModal({ open, onClose, unit, itemName, canManage, onSend, onReturn }) {
  const repairs = unit?.repairs || []
  const openRepair = repairs.find((r) => !r.returnedAt) || null

  const [sendForm, setSendForm] = useState({ vendor: '', issue: '', sentAt: todayISO() })
  const [returnForm, setReturnForm] = useState({ returnedAt: todayISO(), resolution: '' })
  const [busy, setBusy] = useState(false)

  // Reset the forms whenever the modal opens or the target unit changes.
  useEffect(() => {
    if (!open) return
    setSendForm({ vendor: '', issue: '', sentAt: todayISO() })
    setReturnForm({ returnedAt: todayISO(), resolution: '' })
    setBusy(false)
  }, [open, unit?.id])

  const setS = (k) => (e) => setSendForm((f) => ({ ...f, [k]: e.target.value }))
  const setR = (k) => (e) => setReturnForm((f) => ({ ...f, [k]: e.target.value }))

  async function handleSend(e) {
    e.preventDefault()
    if (!sendForm.vendor.trim() || busy) return
    setBusy(true)
    try {
      await onSend({
        vendor: sendForm.vendor.trim(),
        issue: sendForm.issue.trim(),
        sentAt: sendForm.sentAt || todayISO(),
      })
    } finally {
      setBusy(false)
    }
  }

  async function handleReturn(e) {
    e.preventDefault()
    if (busy || !openRepair) return
    setBusy(true)
    try {
      await onReturn(openRepair.id, {
        returnedAt: returnForm.returnedAt || todayISO(),
        resolution: returnForm.resolution.trim(),
      })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Repair log">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {unit && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{itemName}</div>
              <div className="mt-0.5 font-mono text-xs text-slate-500">
                #{unit.barcode} · {unit.serial}
              </div>
            </div>
            {openRepair ? (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
                <Wrench size={12} /> Out for repair
              </span>
            ) : (
              <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                <CheckCircle2 size={12} /> In service
              </span>
            )}
          </div>
        )}

        {/* Action: return the open repair, or send out for a new one */}
        {openRepair ? (
          <div className="mb-5 rounded-xl border border-amber-200 bg-amber-50/50 p-4">
            <div className="flex items-start gap-2">
              <Wrench size={16} className="mt-0.5 shrink-0 text-amber-600" />
              <div className="min-w-0">
                <div className="font-medium text-slate-900">
                  At {openRepair.vendor || 'vendor'}
                </div>
                {openRepair.issue && (
                  <p className="mt-0.5 text-sm text-slate-600">{openRepair.issue}</p>
                )}
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <Clock size={11} /> Sent {openRepair.sentAt}
                  {daysSince(openRepair.sentAt) > 0
                    ? ` · ${daysSince(openRepair.sentAt)} day${
                        daysSince(openRepair.sentAt) === 1 ? '' : 's'
                      } out`
                    : ' · today'}
                </p>
              </div>
            </div>

            {canManage && (
              <form onSubmit={handleReturn} className="mt-4 border-t border-amber-200/70 pt-4">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label}>Returned date</label>
                    <DateField
                      value={returnForm.returnedAt}
                      onChange={setR('returnedAt')}
                      className={field}
                    />
                  </div>
                  <div>
                    <label className={label}>Resolution</label>
                    <input
                      type="text"
                      value={returnForm.resolution}
                      onChange={setR('resolution')}
                      placeholder="e.g. Shutter replaced"
                      className={field}
                    />
                  </div>
                </div>
                <div className="mt-3 flex justify-end">
                  <button
                    type="submit"
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700 disabled:opacity-40"
                  >
                    <PackageCheck size={15} />
                    Mark returned
                  </button>
                </div>
              </form>
            )}
          </div>
        ) : (
          canManage && (
            <form onSubmit={handleSend} className="mb-5 rounded-xl border border-slate-200 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-slate-700">
                <Wrench size={15} className="text-violet-500" />
                Send this unit out for repair
              </div>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className={label}>Vendor</label>
                  <input
                    autoFocus
                    type="text"
                    value={sendForm.vendor}
                    onChange={setS('vendor')}
                    placeholder="e.g. Canon"
                    className={field}
                  />
                </div>
                <div>
                  <label className={label}>Sent date</label>
                  <DateField value={sendForm.sentAt} onChange={setS('sentAt')} className={field} />
                </div>
                <div className="sm:col-span-2">
                  <label className={label}>Issue</label>
                  <input
                    type="text"
                    value={sendForm.issue}
                    onChange={setS('issue')}
                    placeholder="What happened / reported fault"
                    className={field}
                  />
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !sendForm.vendor.trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <Wrench size={15} />
                  Send to repair
                </button>
              </div>
            </form>
          )
        )}

        {/* History */}
        <div className="mb-2 flex items-center justify-between">
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            History
          </h4>
          <span className="text-xs text-slate-400">
            {repairs.length} repair{repairs.length === 1 ? '' : 's'}
          </span>
        </div>

        {repairs.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">
            This unit has never been sent for repair.
          </p>
        ) : (
          <ul className="space-y-2">
            {repairs.map((r) => {
              const done = !!r.returnedAt
              return (
                <li key={r.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <Wrench
                        size={15}
                        className={done ? 'shrink-0 text-slate-400' : 'shrink-0 text-amber-500'}
                      />
                      <span className="truncate font-medium text-slate-900">
                        {r.vendor || 'Vendor'}
                      </span>
                    </div>
                    <span
                      className={[
                        'shrink-0 rounded-full px-2 py-0.5 text-xs font-medium',
                        done
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200',
                      ].join(' ')}
                    >
                      {done ? 'Returned' : 'Open'}
                    </span>
                  </div>
                  {r.issue && <p className="mt-1 pl-6 text-sm text-slate-600">{r.issue}</p>}
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 pl-6 text-xs text-slate-500">
                    <span>Sent {r.sentAt}</span>
                    {done && <span>Returned {r.returnedAt}</span>}
                  </div>
                  {done && r.resolution && (
                    <p className="mt-1.5 flex items-start gap-1 pl-6 text-xs text-emerald-700">
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0" />
                      {r.resolution}
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </Modal>
  )
}
