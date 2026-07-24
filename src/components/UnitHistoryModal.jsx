import { useEffect, useState } from 'react'
import { Loader2, CalendarRange, Lock } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../store'
import { studioLabel } from '../data/studios'
import { usingSupabase, getUnitHistory } from '../data/repository'

// Click a unit → every set it was reserved for → each set's roster.
export default function UnitHistoryModal({ open, onClose, unit, itemName }) {
  const bookings = useStore((s) => s.bookings)
  const [rows, setRows] = useState([])
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!open || !unit) return
    let alive = true

    if (usingSupabase) {
      setBusy(true)
      getUnitHistory(unit.id)
        .then((r) => alive && setRows(r))
        .catch(() => alive && setRows([]))
        .finally(() => alive && setBusy(false))
    } else {
      // Local mode: derive history from the in-memory bookings.
      const local = bookings
        .filter((b) => (b.unitIds || []).includes(unit.id))
        .map((b) => ({
          setId: b.id,
          title: b.title,
          date: b.date,
          studioId: b.studioId,
          reservationStatus: b.status === 'active' ? 'reserved' : b.status,
          roster: [
            b.photographer && { role: 'photographer', name: b.photographer },
            b.model && { role: 'model', name: b.model },
          ].filter(Boolean),
        }))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
      setRows(local)
    }
    return () => {
      alive = false
    }
  }, [open, unit, bookings])

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Unit history">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {unit && (
          <div className="mb-4 flex items-center justify-between rounded-lg bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">{itemName}</div>
              <div className="mt-0.5 font-mono text-xs text-slate-500">
                #{unit.barcode} · {unit.serial}
              </div>
            </div>
            <span className="shrink-0 text-sm text-slate-400">
              {rows.length} set{rows.length === 1 ? '' : 's'}
            </span>
          </div>
        )}

        {busy ? (
          <div className="flex items-center justify-center gap-2 py-10 text-slate-400">
            <Loader2 size={20} className="animate-spin" />
            <span className="text-sm">Loading history…</span>
          </div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            This unit hasn’t been reserved for any set yet.
          </p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r) => (
              <li
                key={r.setId}
                className="rounded-lg border border-slate-200 p-3"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <CalendarRange size={16} className="shrink-0 text-violet-500" />
                    <span className="truncate font-medium text-slate-900">
                      {r.title}
                    </span>
                  </div>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {studioLabel(r.studioId)}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 pl-6 text-xs text-slate-500">
                  <span>{r.date}</span>
                  <span className="capitalize text-slate-400">{r.reservationStatus}</span>
                </div>

                {/* Roster */}
                <div className="mt-2 flex flex-wrap gap-1.5 pl-6">
                  {r.roster && r.roster.length > 0 ? (
                    r.roster.map((p, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 text-xs text-violet-700"
                      >
                        <span className="font-medium capitalize">{p.role}:</span>
                        {p.name}
                      </span>
                    ))
                  ) : (
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      <Lock size={11} /> Roster hidden — requires sign-in
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Modal>
  )
}
