import { useMemo, useState } from 'react'
import { ScanLine } from 'lucide-react'
import { normalizeBarcode } from '../lib/scanning'

// Which physical COPY goes on the job.
//
// Used by the kit staging window (a slot names one copy) and by the order's
// a-la-carte lines (the same question, asked per piece): the copies that are free
// for the dates in question, each with the barcode that will be on the case.
//
// It is a list and not an auto-pick because to the crew #0961 and #0962 are
// different objects — one lives in the van, one has a scratched hood — and
// because after returning a unit to stock they must be able to take a DIFFERENT
// one, which "the first free unit" made impossible.
//
// Typing filters by barcode or serial; a value that IS a free copy's barcode is
// taken immediately, so a hardware scanner (which types the code and presses
// Enter) and a pasted code both work without a second click.
export default function UnitPickList({
  itemName,
  units,
  onPick,
  onCancel,
  ownUnitIds = [],
  bare = false,
  scan = false,
}) {
  const [q, setQ] = useState('')

  // Callers pass `ownUnitIds` as an array (BookingModal) or a Set (the order
  // editor) — everything else forwards it to `isUnitFree`, which normalises it,
  // so this is the one place that has to.
  const own = ownUnitIds instanceof Set ? ownUnitIds : new Set(ownUnitIds ?? [])

  // Every unit here is free for the dates being staged, so its own `location`
  // (the job it is committed to NEXT) would read as "taken" if shown bare. What
  // helps the puller is the shelf, plus a note when the copy is spoken for on
  // some other day.
  const note = (u) => {
    if (own.has(u.id)) return 'already on this job'
    const other = (u.reservations || []).length
    return other > 0 ? `booked on ${other} other day${other === 1 ? '' : 's'}` : null
  }

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle) return units
    return units.filter(
      (u) =>
        String(u.barcode ?? '').toLowerCase().includes(needle) ||
        String(u.serial ?? '').toLowerCase().includes(needle),
    )
  }, [q, units])

  function typed(v) {
    setQ(v)
    const code = normalizeBarcode(v)
    if (!code) return
    const hit = units.find((u) => u.barcode === code)
    if (hit) {
      setQ('')
      onPick(hit)
    }
  }

  const body = (
    <>
      {scan && (
        <div className="relative px-3 pb-1.5 pt-1">
          <ScanLine
            size={14}
            className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-violet-500"
          />
          <input
            autoFocus
            type="text"
            value={q}
            onChange={(e) => typed(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                // A reader ends with Enter; if it matched, `typed` already took
                // it, so this only has to catch the single-result case.
                if (shown.length === 1) onPick(shown[0])
              } else if (e.key === 'Escape') {
                e.stopPropagation()
                onCancel?.()
              }
            }}
            placeholder="Scan, paste or type a barcode…"
            className="w-full rounded-md border border-slate-300 py-1.5 pl-7 pr-2 text-xs outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
      )}
      {shown.length === 0 ? (
        <p className="px-3 py-3 text-center text-xs text-slate-400">
          {units.length === 0
            ? `No ${itemName} is free for these dates.`
            : `No copy matches “${q.trim()}”.`}
        </p>
      ) : (
        <ul className="max-h-44 overflow-auto">
          {shown.map((u) => (
            <li key={u.id}>
              <button
                type="button"
                onClick={() => onPick(u)}
                className="flex w-full items-center gap-3 px-3 py-1.5 text-left transition hover:bg-violet-50"
              >
                <span className="w-16 shrink-0 font-mono text-xs font-medium text-slate-700">
                  #{u.barcode}
                </span>
                <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-slate-400">
                  {u.serial || '—'}
                </span>
                <span className="max-w-[40%] shrink-0 truncate text-[11px] text-slate-500">
                  {u.placement || 'no shelf set'}
                </span>
                {note(u) && <span className="shrink-0 text-[11px] text-amber-600">· {note(u)}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  )

  if (bare) return body
  return (
    <div className="border-t border-slate-200 bg-slate-50/70">
      <div className="flex items-center justify-between px-3 pt-2 text-[11px] text-slate-500">
        <span>
          {units.length} free {itemName} — pick the copy
        </span>
        <button
          type="button"
          onClick={onCancel}
          className="rounded px-1.5 py-0.5 font-medium text-slate-400 transition hover:bg-slate-200 hover:text-slate-600"
        >
          Cancel
        </button>
      </div>
      {body}
    </div>
  )
}
