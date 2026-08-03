import { useEffect, useMemo, useState } from 'react'
import {
  Search,
  Minus,
  Plus,
  X,
  Layers,
  ClipboardList,
  AlertTriangle,
  Check,
  Archive as ArchiveIcon,
} from 'lucide-react'
import { useStore, notArchived } from '../store'
import { applyScenarioList } from '../lib/scenarios'
import { availableCount, resolveUnitsForQuantities } from '../lib/availability'
import { studioLabel } from '../data/studios'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import Modal from './Modal'
import DateField from './DateField'
import TimeField from './TimeField'
import KitStagingModal from './KitStagingModal'

const fieldClass =
  'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
const labelClass = 'mb-1.5 block text-sm font-medium text-slate-700'

function blankForm(prefill) {
  return {
    title: '',
    studioId: prefill?.studioId ?? '1',
    date: prefill?.date ?? '',
    startTime: '09:00',
    endTime: '17:00',
    photographer: '',
    model: '',
    notes: '',
  }
}

export default function BookingModal({ open, onClose, booking, prefill }) {
  const studios = useStore((s) => s.studios)
  const inventory = useStore((s) => s.inventory)
  const kits = useStore((s) => s.kits)
  const scenarios = useStore((s) => s.scenarios)
  const photographers = useStore((s) => s.photographers)
  const models = useStore((s) => s.models)
  const createBooking = useStore((s) => s.createBooking)
  const updateBooking = useStore((s) => s.updateBooking)
  const archiveBooking = useStore((s) => s.archiveBooking)
  const sendToRepair = useStore((s) => s.sendToRepair)
  const setUnitBarcode = useStore((s) => s.setUnitBarcode)

  const can = useCan()
  const isEdit = !!booking

  const [form, setForm] = useState(() => blankForm(prefill))
  const [selected, setSelected] = useState({}) // itemId -> qty
  const [invSearch, setInvSearch] = useState('')
  const [staging, setStaging] = useState(null) // kit being staged, or null
  const [stagedUnits, setStagedUnits] = useState([]) // units added via kits: {unitId,itemName,label,kitName}
  const [applied, setApplied] = useState(null) // last applied scenario list: {name, applied, warnings, notes}

  // Unit ids already assigned by staged kits — excluded from the a-la-carte pool.
  const stagedIds = useMemo(() => new Set(stagedUnits.map((u) => u.unitId)), [stagedUnits])

  // Availability is asked about THIS shoot's day — gear out on another day is
  // back by then (see lib/availability isUnitFree).
  const dateWindow = useMemo(() => ({ from: form.date || null, to: form.date || null }), [form.date])

  // Units already reserved by *this* booking are available to it when editing.
  const bookingUnits = useMemo(
    () => new Set(booking?.unitIds ?? []),
    [booking],
  )

  // Initialize the form whenever the modal is opened.
  useEffect(() => {
    if (!open) return
    const inv = useStore.getState().inventory
    if (booking) {
      setForm({
        title: booking.title,
        studioId: booking.studioId,
        date: booking.date,
        startTime: booking.startTime,
        endTime: booking.endTime,
        photographer: booking.photographer ?? '',
        model: booking.model ?? '',
        notes: booking.notes ?? '',
      })
      const counts = {}
      for (const uid of booking.unitIds) {
        const item = inv.find((i) => i.units.some((u) => u.id === uid))
        if (item) counts[item.id] = (counts[item.id] ?? 0) + 1
      }
      setSelected(counts)
    } else {
      setForm(blankForm(prefill))
      setSelected({})
    }
    setInvSearch('')
    setStaging(null)
    setStagedUnits([])
    setApplied(null)
  }, [open, booking, prefill])

  // Apply a predefined scenario list (3.5): kits are auto-staged and item lines
  // are added at their listed quantity, capped by what's actually free. The
  // result is a normal editable selection — nothing about the list changes.
  function applyList(list) {
    const res = applyScenarioList({
      list,
      inventory,
      kits,
      selected,
      stagedUnits,
      bookingUnits,
      dateWindow,
    })
    setSelected(res.selected)
    setStagedUnits(res.stagedUnits)
    setApplied({ name: list.name, ...res })
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  // Units of an item that this booking may reserve (free + its own), minus any
  // already claimed by a staged kit.
  function availCount(item) {
    // Shared availability rule (5.6) — same answer kits and lists get.
    return availableCount(item, { claimed: stagedIds, alsoFree: bookingUnits, window: dateWindow })
  }

  // Adding is NOT capped by what's free. The crew has to be able to put a job on
  // paper before the gear is back — the honest answer is to let it through and
  // say what won't be reserved (see `shortage` below), not to refuse the click.
  function addItem(itemId) {
    const item = inventory.find((i) => i.id === itemId)
    if (!item) return
    setSelected((s) => ({ ...s, [itemId]: (s[itemId] ?? 0) + 1 }))
  }

  function setQty(itemId, qty) {
    setSelected((s) => {
      if (qty <= 0) {
        const { [itemId]: _drop, ...rest } = s
        return rest
      }
      return { ...s, [itemId]: qty }
    })
  }

  const searchResults = useMemo(() => {
    const q = invSearch.trim().toLowerCase()
    if (q === '') return []
    return inventory
      .filter((i) => notArchived(i) && i.name.toLowerCase().includes(q))
      .slice(0, 8)
  }, [invSearch, inventory])

  const totalUnits =
    Object.values(selected).reduce((n, q) => n + q, 0) + stagedUnits.length

  // How many requested pieces have nothing free behind them. The resolver only
  // ever picks free units, so these would silently NOT be reserved — which is
  // exactly why the number has to be on screen.
  // Only barcoded stock is unit-tracked; quantity-counted stock isn't reserved at all.
  const shortage = useMemo(() => {
    let short = 0
    for (const [itemId, qty] of Object.entries(selected)) {
      const item = inventory.find((i) => i.id === itemId)
      if (!item || item.kind !== 'barcoded') continue
      short += Math.max(0, qty - availableCount(item, { claimed: stagedIds, alsoFree: bookingUnits, window: dateWindow }))
    }
    return short
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, inventory, stagedIds, bookingUnits])

  // Reserved unit ids already spoken for (a-la-carte + staged) — passed to the
  // staging window so it never re-assigns a unit this booking already holds.
  const reservedForStaging = useMemo(
    () => [...resolveUnitIds()],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selected, stagedUnits, inventory],
  )

  // Kits grouped in the staged list for display.
  const stagedByKit = useMemo(() => {
    const m = new Map()
    for (const u of stagedUnits) {
      if (!m.has(u.kitName)) m.set(u.kitName, [])
      m.get(u.kitName).push(u)
    }
    return [...m.entries()]
  }, [stagedUnits])

  function resolveUnitIds() {
    // Same shared resolver the order editor uses (5.6) — quantities become
    // concrete unit ids under one rule, so nothing is promised twice.
    const ids = resolveUnitsForQuantities(
      Object.entries(selected)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, qty]) => ({ itemId, quantity: qty })),
      inventory,
      { claimed: stagedIds, alsoFree: bookingUnits, window: dateWindow },
    )
    // Merge in the units committed by staged kits (dedupe).
    for (const u of stagedUnits) if (!ids.includes(u.unitId)) ids.push(u.unitId)
    return ids
  }

  async function handleSubmit(e) {
    e.preventDefault()
    if (!form.title.trim()) return
    const payload = { ...form, title: form.title.trim(), unitIds: resolveUnitIds() }
    if (isEdit) await updateBooking(booking.id, payload)
    else await createBooking(payload)
    onClose()
  }

  async function handleDelete() {
    if (
      window.confirm(
        `Archive "${booking.title}"? It leaves the calendar and frees its gear.`,
      )
    ) {
      await archiveBooking(booking.id)
      onClose()
    }
  }

  return (
    <>
    <Modal
      open={open}
      // While the staging window is open, keep the booking modal open
      // (Escape / backdrop should close staging, not the booking).
      onClose={() => {
        if (staging) return
        onClose()
      }}
      size="lg"
      title={isEdit ? 'Edit booking' : 'New booking'}
    >
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <label className={labelClass}>Title</label>
            <input
              autoFocus
              type="text"
              value={form.title}
              onChange={set('title')}
              placeholder="e.g. 20260716_AT_MAIN_SepMM_Missy_OMSet1"
              className={fieldClass}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Studio</label>
              <select
                value={form.studioId}
                onChange={set('studioId')}
                className={fieldClass}
              >
                {studios.map((id) => (
                  <option key={id} value={id}>
                    {studioLabel(id)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelClass}>Date</label>
              <DateField
                value={form.date}
                onChange={set('date')}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Start time</label>
              <TimeField
                value={form.startTime}
                onChange={set('startTime')}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>End time</label>
              <TimeField
                value={form.endTime}
                onChange={set('endTime')}
                className={fieldClass}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Photographer</label>
              <input
                type="text"
                list="photographer-options"
                value={form.photographer}
                onChange={set('photographer')}
                placeholder="Select or type…"
                className={fieldClass}
              />
              <datalist id="photographer-options">
                {photographers.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input
                type="text"
                list="model-options"
                value={form.model}
                onChange={set('model')}
                placeholder="Select or type…"
                className={fieldClass}
              />
              <datalist id="model-options">
                {models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          {/* Inventory multi-select */}
          <div>
            <label className={labelClass}>
              Inventory{' '}
              <span className="font-normal text-slate-400">
                · {totalUnits - shortage} of {totalUnits} unit
                {totalUnits === 1 ? '' : 's'} reserved
              </span>
              {shortage > 0 && (
                <span className="font-medium text-amber-600">
                  {' '}
                  · {shortage} over capacity
                </span>
              )}
            </label>

            {/* The consequence, spelled out: over-capacity pieces stay on the
                list but no unit is held for them, so nobody discovers it at the
                packing table. */}
            {shortage > 0 && (
              <p className="mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                <span>
                  {shortage} piece(s) have nothing free behind them — they stay on this list but
                  won&apos;t be reserved. Free them from another job, or raise them as a sub-rental
                  on the order.
                </span>
              </p>
            )}

            {/* Predefined scenario list (3.5) — one pick instead of adding
                every line by hand; the result stays fully editable below. */}
            {scenarios.length > 0 && (
              <div className="mb-2">
                <div className="relative">
                  <ClipboardList
                    size={16}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500"
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      const list = scenarios.find((l) => l.id === e.target.value)
                      if (list) applyList(list)
                    }}
                    className={fieldClass + ' pl-9'}
                  >
                    <option value="">Start from a scenario list…</option>
                    {scenarios.map((l) => (
                      <option key={l.id} value={l.id}>
                        {l.name}
                        {l.category ? ` · ${l.category}` : ''} ({l.entries.length} lines)
                      </option>
                    ))}
                  </select>
                </div>

                {applied && (
                  <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 px-3 py-2">
                    <div className="flex items-start gap-2">
                      <Check size={14} className="mt-0.5 shrink-0 text-violet-600" />
                      <p className="min-w-0 flex-1 text-xs text-violet-900">
                        <span className="font-semibold">{applied.name}</span> applied —{' '}
                        {applied.applied.units} unit
                        {applied.applied.units === 1 ? '' : 's'} reserved
                        {applied.applied.kits > 0 &&
                          `, ${applied.applied.kits} kit${applied.applied.kits === 1 ? '' : 's'} staged`}
                        . Edit anything below.
                      </p>
                      <button
                        type="button"
                        onClick={() => setApplied(null)}
                        className="shrink-0 rounded p-0.5 text-violet-400 transition hover:text-violet-700"
                      >
                        <X size={14} />
                      </button>
                    </div>

                    {applied.notes.length > 0 && (
                      <ul className="mt-1.5 space-y-0.5 pl-6 text-xs text-slate-500">
                        {applied.notes.map((n) => (
                          <li key={n}>• {n}</li>
                        ))}
                      </ul>
                    )}

                    {applied.warnings.length > 0 && (
                      <div className="mt-1.5 rounded-md bg-amber-50 px-2 py-1.5 ring-1 ring-amber-200">
                        <div className="flex items-center gap-1.5 text-xs font-semibold text-amber-700">
                          <AlertTriangle size={12} />
                          {applied.warnings.length} line
                          {applied.warnings.length === 1 ? '' : 's'} need sourcing
                        </div>
                        <ul className="mt-0.5 space-y-0.5 pl-5 text-xs text-amber-700/90">
                          {applied.warnings.map((w) => (
                            <li key={w}>• {w}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {stagedByKit.length > 0 && (
              <div className="mb-2 space-y-2">
                {stagedByKit.map(([kitName, units]) => (
                  <div
                    key={kitName}
                    className="rounded-lg border border-violet-200 bg-violet-50/50 p-2"
                  >
                    <div className="mb-1 flex items-center gap-1.5 px-1 text-xs font-semibold text-violet-700">
                      <Layers size={13} />
                      {kitName}
                    </div>
                    <ul className="space-y-1">
                      {units.map((u) => (
                        <li
                          key={u.unitId}
                          className="flex items-center gap-2 rounded-md bg-white px-2.5 py-1"
                        >
                          <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                            {u.label && <span className="text-slate-400">{u.label}: </span>}
                            {u.itemName}
                          </span>
                          {u.barcode && (
                            <span className="shrink-0 font-mono text-xs text-slate-400">
                              #{u.barcode}
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() =>
                              setStagedUnits((prev) => prev.filter((x) => x.unitId !== u.unitId))
                            }
                            className="rounded p-0.5 text-slate-400 hover:text-rose-500"
                          >
                            <X size={14} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}

            {Object.keys(selected).length > 0 && (
              <ul className="mb-2 space-y-1.5">
                {Object.entries(selected).map(([itemId, qty]) => {
                  const item = inventory.find((i) => i.id === itemId)
                  if (!item) return null
                  const free = availCount(item)
                  // Over capacity only means something for unit-tracked stock.
                  const over = item.kind === 'barcoded' ? Math.max(0, qty - free) : 0
                  return (
                    <li
                      key={itemId}
                      className={[
                        'flex items-center gap-2 rounded-lg px-3 py-1.5',
                        over > 0 ? 'bg-amber-50 ring-1 ring-amber-200' : 'bg-slate-50',
                      ].join(' ')}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm text-slate-700">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setQty(itemId, qty - 1)}
                          className="grid h-6 w-6 place-items-center rounded border border-slate-300 text-slate-500 hover:bg-white"
                        >
                          <Minus size={13} />
                        </button>
                        <span className="w-6 text-center text-sm font-medium text-slate-800">
                          {qty}
                        </span>
                        <button
                          type="button"
                          onClick={() => addItem(itemId)}
                          className="grid h-6 w-6 place-items-center rounded border border-slate-300 text-slate-500 hover:bg-white"
                        >
                          <Plus size={13} />
                        </button>
                      </div>
                      {over > 0 ? (
                        <span
                          title={`Only ${free} free — ${over} piece(s) won't be reserved`}
                          className="whitespace-nowrap text-right text-xs font-medium text-amber-700"
                        >
                          /{free} free · {over} short
                        </span>
                      ) : (
                        <span className="w-14 text-right text-xs text-slate-400">
                          /{free} free
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={() => setQty(itemId, 0)}
                        className="rounded p-0.5 text-slate-400 hover:text-rose-500"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}

            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={invSearch}
                onChange={(e) => setInvSearch(e.target.value)}
                placeholder="Search inventory to add…"
                className={fieldClass + ' pl-9'}
              />
              {searchResults.length > 0 && (
                <ul className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {searchResults.map((item) => {
                    const free = availCount(item)
                    // Exhausted stock stays CLICKABLE — it just says so. Refusing
                    // the click is what made this a dead end.
                    const none = (selected[item.id] ?? 0) >= free
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => addItem(item.id)}
                          title={
                            none
                              ? 'Nothing free — adds it anyway, and the shortfall is flagged'
                              : undefined
                          }
                          className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                        >
                          <span className="min-w-0 truncate text-slate-700">
                            {item.name}
                          </span>
                          <span
                            className={[
                              'shrink-0 text-xs',
                              none ? 'font-medium text-amber-600' : 'text-slate-400',
                            ].join(' ')}
                          >
                            {free} free{none ? ' · add anyway' : ''}
                          </span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>

            {kits.length > 0 && (
              <div className="relative mt-2">
                <Layers
                  size={16}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500"
                />
                <select
                  value=""
                  onChange={(e) => {
                    const kit = kits.find((k) => k.id === e.target.value)
                    if (kit) setStaging(kit)
                  }}
                  className={fieldClass + ' pl-9'}
                >
                  <option value="">Add a kit…</option>
                  {kits.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div>
            <label className={labelClass}>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={set('notes')}
              placeholder="Optional notes…"
              className={fieldClass + ' resize-none'}
            />
          </div>

          {isEdit && booking?.createdBy && (
            <p className="text-xs text-slate-400">
              Created by {booking.createdBy}
            </p>
          )}
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          {isEdit && can(CAP.BOOKING_DELETE) ? (
            <button
              type="button"
              onClick={handleDelete}
              className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
            >
              <ArchiveIcon size={15} />
              Archive
            </button>
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
              disabled={!form.title.trim()}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isEdit ? 'Save changes' : 'Create booking'}
            </button>
          </div>
        </div>
      </form>
    </Modal>

    <KitStagingModal
      open={!!staging}
      kit={staging}
      inventory={inventory}
      dateWindow={dateWindow}
      ownUnitIds={bookingUnits}
      reservedUnitIds={reservedForStaging}
      // The staging window now asks WHAT is wrong (and optionally where it went),
      // so pass that through instead of a fixed sentence. The fallback keeps a
      // blank submission meaningful in the repair log.
      onMarkBroken={(itemId, unitId, details = {}) =>
        sendToRepair(itemId, unitId, {
          vendor: details.vendor || null,
          issue: details.issue || 'Flagged broken while packing',
        })
      }
      onSetBarcode={(itemId, unitId, barcode) => setUnitBarcode(itemId, unitId, barcode)}
      onConfirm={(units) => {
        setStagedUnits((prev) => [...prev, ...units])
        setStaging(null)
      }}
      onCancel={() => setStaging(null)}
    />
    </>
  )
}
