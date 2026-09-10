import { useMemo } from 'react'
import { Info, Plus, X } from 'lucide-react'
import { MAX_UNIT_ROWS, barcodePreviews } from '../lib/unitRows'

// ONE ROW PER COPY — the control for registering physical units, shared by
// "Add units" on an item's card and by the item editor when a new BARCODED item
// is created. Two places asking the same question had to ask it the same way,
// and the greyed previews have to agree with what the save assigns
// (`lib/unitRows` owns that rule for both).
//
// ⚠️ `onChange` takes an UPDATER, not a value: "How many?" and the × buttons can
// both fire before a re-render, and a mutator that maps over the `rows` PROP
// drops one of them. That is the trap this codebase has now hit seven times.

const FIELD =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const LABEL = 'mb-1.5 block text-sm font-medium text-slate-700'
const GRID = 'grid grid-cols-[1.5rem_1fr_1fr_1.5rem] items-center gap-2'

export const blankUnitRow = () => ({ barcode: '', serial: '' })

export default function UnitRowsField({
  rows,
  onChange,
  suggestedBarcode,
  // Every barcode the register already holds, so a preview can't propose one
  // the save would refuse.
  taken,
  autoFocus = false,
}) {
  const previews = useMemo(
    () => barcodePreviews(rows, suggestedBarcode, taken),
    [rows, suggestedBarcode, taken],
  )

  const setCount = (value) => {
    const n = Math.max(1, Math.min(MAX_UNIT_ROWS, Math.floor(Number(value) || 1)))
    onChange((cur) =>
      n === cur.length
        ? cur
        : n < cur.length
          ? cur.slice(0, n)
          : [...cur, ...Array.from({ length: n - cur.length }, blankUnitRow)],
    )
  }

  const setRow = (i, key) => (e) => {
    const { value } = e.target
    onChange((cur) => cur.map((r, idx) => (idx === i ? { ...r, [key]: value } : r)))
  }

  return (
    <>
      <div className="flex items-start gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600 ring-1 ring-slate-200">
        <Info size={14} className="mt-0.5 shrink-0 text-slate-400" />
        <span>
          One row per copy. Leave a row empty and its barcode and serial are generated — that&apos;s
          the case for a batch of identical gear. Type them in for a copy you have in hand.
        </span>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className={LABEL}>How many?</label>
          <input
            type="number"
            min="1"
            max={MAX_UNIT_ROWS}
            value={rows.length}
            onChange={(e) => setCount(e.target.value)}
            className={[FIELD, 'w-24'].join(' ')}
          />
        </div>
        <p className="pb-2.5 text-xs text-slate-400">
          {rows.length === 1 ? '1 copy' : `${rows.length} copies`} will be registered.
        </p>
      </div>

      <div className="space-y-2">
        <div className={`${GRID} text-[11px] uppercase tracking-wide text-slate-400`}>
          <span />
          <span>Barcode</span>
          <span>Serial</span>
          <span />
        </div>
        {rows.map((row, i) => (
          <div key={i} className={GRID}>
            <span className="text-right text-xs text-slate-400">{i + 1}</span>
            <input
              autoFocus={autoFocus && i === 0}
              type="text"
              value={row.barcode}
              onChange={setRow(i, 'barcode')}
              placeholder={previews[i] ?? ''}
              className={[FIELD, 'font-mono'].join(' ')}
            />
            <input
              type="text"
              value={row.serial}
              onChange={setRow(i, 'serial')}
              placeholder="generated"
              className={[FIELD, 'font-mono'].join(' ')}
            />
            {rows.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange((cur) => cur.filter((_, idx) => idx !== i))}
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
        {rows.length < MAX_UNIT_ROWS && (
          <button
            type="button"
            onClick={() => onChange((cur) => [...cur, blankUnitRow()])}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-violet-700 transition hover:bg-violet-50"
          >
            <Plus size={13} />
            Add another copy
          </button>
        )}
      </div>
    </>
  )
}
