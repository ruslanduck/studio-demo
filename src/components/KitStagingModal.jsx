import { useEffect, useMemo, useState } from 'react'
import {
  Layers,
  Search,
  RefreshCw,
  X,
  Check,
  AlertTriangle,
  Plus,
  ScanLine,
  Lock,
  MousePointerClick,
  Pencil,
  Wrench,
  Undo2,
} from 'lucide-react'
import Modal from './Modal'
import { freeUnitsOf, isUnitFree } from '../lib/availability'
import { normalizeBarcode } from '../lib/scanning'

// Staging window (Build order #3, 3.2 + 3.3 + 3.4). Adding a kit to a set opens
// this: the kit's slot *definitions* are resolved into slot *fills* for THIS add.
//
//   FIXED slot   → auto-filled with its pinned unit (its default barcode). If the
//                  unit is taken, the fill is a CONFLICT; "Replace" downgrades the
//                  slot to generic behaviour (this add only).
//   GENERIC slot → starts EMPTY and is assigned a concrete unit by scanning a
//                  barcode, or by picking one from the copies free for these
//                  dates ("Choose unit").
//
// 3.4 adds, when filling slots:
//   • Replace a filled unit with an explicit reason — "Return to stock" (back to
//     the pool) or "Broken → repair" (sends the unit to the 2.6 repair log so it
//     can't be reused anywhere). These are REAL inventory changes, unlike the
//     this-add-only slot edits.
//   • Edit/add a barcode: correct an assigned unit's barcode inline, or register
//     an unknown scanned barcode onto an available unit — both persist to stock.
//
// A slot with no valid unit (empty or conflict) blocks the final add. Slot
// add/remove/replace choices never change the kit template.

// The copies that are actually free for the dates in question. Shown instead of
// silently taking the first one: to the crew #0961 and #0962 are different
// objects (one lives in the van, one has a scratched hood), and after returning a
// unit to stock they need to be able to pick a DIFFERENT one — which taking the
// first free unit made impossible, since the one just released came back first.
function UnitPickList({ itemName, units, onPick, onCancel, ownUnitIds = [], bare = false }) {
  // Every unit here is free for the dates being staged, so its own `location`
  // (the job it is committed to NEXT) would read as "taken" if shown bare. What
  // helps the puller is the shelf, plus a note when the copy is spoken for on
  // some other day.
  // Callers pass `ownUnitIds` as an array (BookingModal) or a Set (the order
  // editor) — everything else here forwards it to `isUnitFree`, which normalises
  // it, so this is the one place that has to.
  const own = ownUnitIds instanceof Set ? ownUnitIds : new Set(ownUnitIds ?? [])
  const note = (u) => {
    if (own.has(u.id)) return 'already on this job'
    const other = (u.reservations || []).length
    return other > 0 ? `booked on ${other} other day${other === 1 ? '' : 's'}` : null
  }

  const body =
    units.length === 0 ? (
      <p className="px-3 py-3 text-center text-xs text-slate-400">
        No {itemName} is free for these dates.
      </p>
    ) : (
      <ul className="max-h-44 overflow-auto">
        {units.map((u) => (
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
              {note(u) && (
                <span className="shrink-0 text-[11px] text-amber-600">· {note(u)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
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

export default function KitStagingModal({
  open,
  kit,
  inventory,
  reservedUnitIds = [],
  dateWindow = null,
  // Gear the record being edited already holds — free to re-take here.
  ownUnitIds = [],
  onMarkBroken,
  onSetBarcode,
  onConfirm,
  onCancel,
}) {
  const [fills, setFills] = useState([])
  const [activeKey, setActiveKey] = useState(null) // slot targeted by the next scan
  const [scanValue, setScanValue] = useState('')
  const [scanError, setScanError] = useState(null)
  const [picker, setPicker] = useState(null) // ad-hoc "add item": {}
  const [pickerSearch, setPickerSearch] = useState('')
  // Which copy goes in. NOT auto-picked: several copies of one lens are not
  // interchangeable to the crew (condition, which case it lives in), and taking
  // "the first free one" made a replaced unit come straight back.
  //   { itemId, slotKey } — slotKey null = choosing a copy for an ad-hoc add.
  const [unitPicker, setUnitPicker] = useState(null)
  const [scanOk, setScanOk] = useState(null) // last accepted scan, for feedback
  const [replacing, setReplacing] = useState(null) // slot key showing the replace-reason choice
  const [editing, setEditing] = useState(null) // { key, value, error } — inline barcode edit
  const [pendingScan, setPendingScan] = useState(null) // { code, slotKey, itemName } — register offer

  // Resolve the kit's slot definitions into fills on open.
  useEffect(() => {
    if (!open || !kit) return
    const used = new Set(reservedUnitIds)
    const next = kit.slots.map((slot, i) => {
      const item = inventory.find((it) => it.id === slot.itemId)
      const slotType = slot.slotType || 'generic'
      const base = {
        key: `${kit.id}:${slot.id ?? i}`,
        slotId: slot.id ?? null,
        slotType,
        label: slot.label,
        itemId: slot.itemId,
        itemName: slot.itemName || item?.name || 'Unknown item',
        unitId: null,
        barcode: null,
        source: null,
        overridden: false,
        state: 'empty',
        conflictReason: null,
      }
      if (slotType !== 'fixed') return base // generic → empty, awaiting a scan

      const unit = item?.units.find((u) => u.id === slot.fixedUnitId) || null
      if (!unit) return { ...base, state: 'conflict', conflictReason: 'pinned unit missing' }
      const pinnedFree = isUnitFree(unit, {
        claimed: used,
        alsoFree: ownUnitIds,
        window: dateWindow,
      })
      if (!pinnedFree) {
        return {
          ...base,
          barcode: unit.barcode,
          state: 'conflict',
          conflictReason: used.has(unit.id)
            ? 'already in this booking'
            : dateWindow?.from
              ? 'booked for those dates'
              : 'checked out',
        }
      }
      used.add(unit.id)
      return { ...base, unitId: unit.id, barcode: unit.barcode, source: 'fixed', state: 'filled' }
    })
    setFills(next)
    setActiveKey(null)
    setScanValue('')
    setScanError(null)
    setPicker(null)
    setPickerSearch('')
    setReplacing(null)
    setEditing(null)
    setPendingScan(null)
    setUnitPicker(null)
    setScanOk(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, kit])

  // Unit ids already spoken for (booking's own + everything filled here).
  const usedIds = useMemo(() => {
    const s = new Set(reservedUnitIds)
    for (const f of fills) if (f.unitId) s.add(f.unitId)
    return s
  }, [fills, reservedUnitIds])

  // Availability comes from the shared rule (5.6) so a unit staged here can't
  // also be taken by a list, another kit or an a-la-carte line.
  const freeUnitsFor = (itemId) =>
    freeUnitsOf(
      inventory.find((i) => i.id === itemId),
      { claimed: usedIds, alsoFree: ownUnitIds, window: dateWindow },
    )

  // A fill accepts a scanned/manual unit when it still needs one and isn't a
  // still-pinned fixed slot (fixed slots take a unit only after "Replace").
  const isOpenSlot = (f) =>
    f.state !== 'filled' && (f.slotType === 'generic' || f.slotType === 'extra' || f.overridden)

  const needCount = fills.filter((f) => f.state !== 'filled').length
  const filledCount = fills.filter((f) => f.state === 'filled').length
  const ready = fills.length > 0 && needCount === 0

  const fillSlot = (key, unit, source) =>
    setFills((prev) =>
      prev.map((f) =>
        f.key === key ? { ...f, unitId: unit.id, barcode: unit.barcode, source, state: 'filled' } : f,
      ),
    )

  // Every barcode in the register, so a paste/scan can be recognised the moment
  // it lands — see `onChange` on the scan field.
  const knownBarcodes = useMemo(() => {
    const s = new Set()
    for (const it of inventory) for (const u of it.units || []) if (u.barcode) s.add(u.barcode)
    return s
  }, [inventory])

  // Assign a unit to an open slot by its barcode (the scan path).
  //
  // The code identifies ONE copy — barcodes are unique across the whole register
  // — so we don't need to be told which item is being scanned: the unit's item
  // decides which slot it fills. That's why the crew can scan the case in any
  // order and the highlighted slot is only a preference, not a requirement.
  function assignByBarcode(rawCode, targetKey) {
    // Accepts what a reader sends AND what a person copies off the screen — the
    // leading # is decoration, not part of the code.
    const code = normalizeBarcode(rawCode)
    if (!code) return
    let unit = null
    let item = null
    for (const it of inventory) {
      const u = (it.units || []).find((x) => x.barcode === code)
      if (u) {
        unit = u
        item = it
        break
      }
    }

    // Unknown barcode → offer to register it onto an available unit of the
    // targeted open slot's item (3.4 "add barcode"), rather than dead-ending.
    if (!unit) {
      const open = fills.find((f) => isOpenSlot(f) && f.key === (targetKey ?? activeKey)) ||
        fills.find((f) => isOpenSlot(f))
      if (!open) return setScanError(`Barcode #${code} not found, and no slot is open.`)
      setScanError(null)
      setPendingScan({ code, slotKey: open.key, itemName: open.itemName })
      return
    }

    if (fills.some((f) => f.unitId === unit.id))
      return setScanError(`#${code} is already assigned to a slot in this kit.`)
    if (reservedUnitIds.includes(unit.id))
      return setScanError(`#${code} is already reserved elsewhere in this booking.`)
    if (!isUnitFree(unit, { alsoFree: ownUnitIds, window: dateWindow }))
      return setScanError(
        dateWindow?.from
          ? `#${code} is already booked for these dates.`
          : `#${code} is checked out — not available.`,
      )

    const candidates = fills.filter((f) => isOpenSlot(f) && f.itemId === item.id)
    if (candidates.length === 0)
      return setScanError(
        `#${code} is a unit of ${item.name} — no open slot needs that item. Scan a different unit, or add the item below.`,
      )
    const target = candidates.find((f) => f.key === targetKey) || candidates[0]

    fillSlot(target.key, { id: unit.id, barcode: unit.barcode }, 'scan')
    setFills((prev) => prev.map((f) => (f.key === target.key ? { ...f, itemName: item.name } : f)))
    setScanError(null)
    setScanValue('')
    setActiveKey(null)
    setUnitPicker(null)
    // Say what the scan did: a barcode that silently vanishes into the field
    // looks broken even when it worked.
    setScanOk({ code, itemName: item.name, label: target.label })
  }

  // Register an unknown scanned barcode onto a free unit of the slot's item.
  function confirmRegister() {
    const slot = fills.find((f) => f.key === pendingScan.slotKey)
    if (!slot) return setPendingScan(null)
    const unit = freeUnitsFor(slot.itemId)[0]
    if (!unit) {
      setScanError(`No free ${slot.itemName} in stock to register #${pendingScan.code} onto.`)
      return setPendingScan(null)
    }
    const res = onSetBarcode?.(slot.itemId, unit.id, pendingScan.code)
    if (res?.error) return setScanError(res.error)
    fillSlot(slot.key, { id: unit.id, barcode: pendingScan.code }, 'scan')
    setPendingScan(null)
    setScanValue('')
    setScanError(null)
    setActiveKey(null)
  }

  // Manual path: show which copies are free for these dates and let the crew
  // choose. It used to take `freeUnitsFor(itemId)[0]` outright, which meant a
  // unit you had just returned to stock was handed straight back to you.
  function openUnitPicker(key) {
    const f = fills.find((x) => x.key === key)
    if (!f) return
    setUnitPicker({ itemId: f.itemId, slotKey: key })
    setReplacing(null)
    setEditing(null)
    setScanError(null)
  }

  function pickUnit(unit) {
    if (!unitPicker) return
    if (unitPicker.slotKey) fillSlot(unitPicker.slotKey, unit, 'manual')
    else addExtraUnit(unitPicker.itemId, unit)
    setUnitPicker(null)
    setScanError(null)
  }

  // Fixed-slot conflict override: downgrade to a fillable (generic-like) slot
  // for THIS add only. The kit template is untouched.
  function overrideFixed(key) {
    setFills((prev) =>
      prev.map((f) =>
        f.key === key
          ? { ...f, overridden: true, unitId: null, barcode: null, source: null, state: 'empty' }
          : f,
      ),
    )
    setActiveKey(key)
    setScanError(null)
  }

  // Un-assign a filled slot so it can take a different unit (return to pool).
  function returnToStock(key) {
    setFills((prev) =>
      prev.map((f) =>
        f.key === key ? { ...f, unitId: null, barcode: null, source: null, state: 'empty' } : f,
      ),
    )
    setReplacing(null)
    setActiveKey(key)
    setScanError(null)
  }

  // Replace because the unit is broken: send it to repair (global — it becomes
  // unavailable everywhere and logs in 2.6), then empty the slot for a re-scan.
  function markBroken(f) {
    onMarkBroken?.(f.itemId, f.unitId)
    setFills((prev) =>
      prev.map((x) =>
        x.key === f.key ? { ...x, unitId: null, barcode: null, source: null, state: 'empty' } : x,
      ),
    )
    setReplacing(null)
    setActiveKey(f.key)
    setScanError(null)
  }

  // Save an inline barcode edit for an assigned unit (persists to stock).
  function saveBarcode() {
    const f = fills.find((x) => x.key === editing.key)
    if (!f) return setEditing(null)
    const res = onSetBarcode?.(f.itemId, f.unitId, editing.value)
    if (res?.error) return setEditing((e) => ({ ...e, error: res.error }))
    setFills((prev) =>
      prev.map((x) => (x.key === editing.key ? { ...x, barcode: editing.value.trim() } : x)),
    )
    setEditing(null)
  }

  function removeSlot(key) {
    setFills((prev) => prev.filter((f) => f.key !== key))
    setActiveKey((k) => (k === key ? null : k))
    if (replacing === key) setReplacing(null)
    if (editing?.key === key) setEditing(null)
  }

  // Ad-hoc extra item (not part of the kit template). Which copy is a choice
  // here too, so picking the item only opens the unit list.
  function addExtra(itemId) {
    setUnitPicker({ itemId, slotKey: null })
    setPicker(null)
    setPickerSearch('')
  }

  function addExtraUnit(itemId, unit) {
    const item = inventory.find((i) => i.id === itemId)
    setFills((prev) => [
      ...prev,
      {
        key: `extra:${unit.id}`,
        slotId: null,
        slotType: 'extra',
        label: null,
        itemId,
        itemName: item.name,
        unitId: unit.id,
        barcode: unit.barcode,
        source: 'manual',
        overridden: false,
        state: 'filled',
        conflictReason: null,
      },
    ])
    setPicker(null)
    setPickerSearch('')
  }

  const pickerResults = useMemo(() => {
    if (!picker) return []
    const q = pickerSearch.trim().toLowerCase()
    return inventory
      .filter((i) => i.kind === 'barcoded' && freeUnitsFor(i.id).length > 0)
      .filter((i) => q === '' || i.name.toLowerCase().includes(q))
      .slice(0, 8)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker, pickerSearch, inventory, usedIds])

  function confirm() {
    if (!ready) return
    onConfirm(
      fills
        .filter((f) => f.unitId)
        .map((f) => ({
          unitId: f.unitId,
          itemId: f.itemId,
          itemName: f.itemName,
          barcode: f.barcode,
          label: f.label,
          kitId: kit.id,
          kitName: kit.name,
        })),
    )
  }

  const sourceBadge = (f) => {
    if (f.source === 'fixed')
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
          <Lock size={11} /> pinned
        </span>
      )
    if (f.source === 'scan')
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600">
          <ScanLine size={11} /> scanned
        </span>
      )
    if (f.source === 'manual')
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-400">
          <MousePointerClick size={11} /> picked
        </span>
      )
    return null
  }

  return (
    <Modal open={open} onClose={onCancel} size="lg" title="Stage kit">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {kit && (
          <div className="mb-4 flex items-center gap-2 rounded-lg bg-violet-50 px-4 py-3">
            <Layers size={16} className="shrink-0 text-violet-600" />
            <div className="min-w-0">
              <div className="truncate font-semibold text-violet-900">{kit.name}</div>
              <div className="text-xs text-violet-700/80">
                Fixed slots are pinned automatically. Fill each generic slot by scanning a barcode
                or choosing a free copy. This won’t change the kit itself.
              </div>
            </div>
          </div>
        )}

        {/* Scan-to-assign field */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            assignByBarcode(scanValue, activeKey)
          }}
          className="mb-3"
        >
          <div className="relative">
            <ScanLine
              size={16}
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500"
            />
            <input
              autoFocus
              type="text"
              inputMode="numeric"
              value={scanValue}
              onChange={(e) => {
                const v = e.target.value
                setScanValue(v)
                if (scanError) setScanError(null)
                if (pendingScan) setPendingScan(null)
                if (scanOk) setScanOk(null)
                // A hardware scanner types the code and presses Enter, but
                // PASTING one (which is how a scan is imitated by hand) sends no
                // Enter at all — the code just sat in the field doing nothing.
                // So a value that IS a known barcode is assigned on the spot.
                if (knownBarcodes.has(normalizeBarcode(v))) assignByBarcode(v, activeKey)
              }}
              onKeyDown={(e) => {
                // Barcode scanners send the code + Enter; handle it directly so
                // it works regardless of implicit form submission.
                if (e.key === 'Enter') {
                  e.preventDefault()
                  assignByBarcode(scanValue, activeKey)
                }
              }}
              placeholder={
                activeKey
                  ? `Scan into: ${fills.find((f) => f.key === activeKey)?.itemName ?? 'slot'}…`
                  : 'Scan, paste or type a barcode…'
              }
              className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-24 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            />
            <button
              type="submit"
              disabled={!scanValue.trim()}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md px-2.5 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50 disabled:opacity-40"
            >
              Assign
            </button>
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            A barcode belongs to one copy only, so the scan fills whichever slot expects that item —
            the crew can work through the case in any order.
          </p>
          {scanError && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-rose-600">
              <AlertTriangle size={13} />
              {scanError}
            </div>
          )}
          {scanOk && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs font-medium text-emerald-600">
              <Check size={13} />
              <span className="font-mono">#{scanOk.code}</span> → {scanOk.itemName}
              {scanOk.label ? ` · ${scanOk.label}` : ''}
            </div>
          )}
        </form>

        {/* Unknown-barcode → register offer */}
        {pendingScan && (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-violet-50 px-3 py-2 text-xs ring-1 ring-violet-200">
            <ScanLine size={14} className="shrink-0 text-violet-600" />
            <span className="min-w-0 text-violet-900">
              No unit has <span className="font-mono font-semibold">#{pendingScan.code}</span>.
              Register it onto an available {pendingScan.itemName}?
            </span>
            <button
              type="button"
              onClick={confirmRegister}
              className="ml-auto shrink-0 rounded-md bg-violet-600 px-2.5 py-1 font-medium text-white transition hover:bg-violet-700"
            >
              Register &amp; assign
            </button>
            <button
              type="button"
              onClick={() => setPendingScan(null)}
              className="shrink-0 rounded-md px-2 py-1 font-medium text-slate-500 transition hover:bg-slate-100"
            >
              Dismiss
            </button>
          </div>
        )}

        {needCount > 0 ? (
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700 ring-1 ring-amber-200">
            <AlertTriangle size={13} />
            {needCount} slot{needCount === 1 ? '' : 's'} still need a unit — scan, use available, or
            remove before adding.
          </div>
        ) : (
          fills.length > 0 && (
            <div className="mb-3 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
              <Check size={13} />
              All slots assigned — ready to add.
            </div>
          )
        )}

        <ul className="space-y-1.5">
          {fills.map((f, i) => {
            const filled = f.state === 'filled'
            const conflict = f.state === 'conflict'
            const isFixed = f.slotType === 'fixed'
            const active = activeKey === f.key
            const free = isOpenSlot(f) ? freeUnitsFor(f.itemId).length : 0
            return (
              <li
                key={f.key}
                className={[
                  'rounded-lg border transition',
                  filled
                    ? 'border-slate-200'
                    : conflict
                      ? 'border-rose-300 bg-rose-50/40'
                      : 'border-amber-300 bg-amber-50/40',
                  active ? 'ring-2 ring-violet-300' : '',
                ].join(' ')}
              >
                <div
                  onClick={() => isOpenSlot(f) && setActiveKey(f.key)}
                  className={[
                    'flex items-center gap-3 px-3 py-2.5',
                    isOpenSlot(f) ? 'cursor-pointer' : '',
                  ].join(' ')}
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-slate-100 text-xs font-semibold text-slate-500">
                    {i + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      {isFixed && !f.overridden ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-700 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                          <Lock size={9} /> Fixed
                        </span>
                      ) : f.slotType === 'extra' ? (
                        <span className="inline-flex items-center gap-1 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">
                          Added
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                          <ScanLine size={9} /> {f.overridden ? 'Fixed → sub' : 'Generic'}
                        </span>
                      )}
                      {f.label && (
                        <span className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-400">
                          {f.label}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm font-medium text-slate-800">{f.itemName}</div>
                  </div>

                  {/* Right side: state */}
                  {filled ? (
                    <div className="flex shrink-0 flex-col items-end">
                      <span className="font-mono text-xs text-slate-600">#{f.barcode}</span>
                      {sourceBadge(f)}
                    </div>
                  ) : conflict ? (
                    <span className="shrink-0 text-right text-xs font-medium text-rose-600">
                      {f.barcode ? `#${f.barcode} ` : ''}
                      {f.conflictReason}
                    </span>
                  ) : (
                    <span className="shrink-0 text-right text-[11px] font-medium text-amber-700">
                      {active ? 'scan lands here' : 'awaiting scan'}
                      <span className="ml-1 text-slate-400">· {free} free</span>
                    </span>
                  )}

                  {/* Actions */}
                  <div className="flex shrink-0 items-center gap-1">
                    {conflict && isFixed && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          overrideFixed(f.key)
                        }}
                        title="Substitute another unit for this pull only"
                        className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                      >
                        <RefreshCw size={13} />
                        Replace
                      </button>
                    )}
                    {isOpenSlot(f) && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          if (unitPicker?.slotKey === f.key) setUnitPicker(null)
                          else openUnitPicker(f.key)
                        }}
                        disabled={free === 0}
                        title="Show the copies that are free for these dates and pick one"
                        className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Choose unit
                      </button>
                    )}
                    {filled && f.source !== 'fixed' && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setEditing({ key: f.key, value: f.barcode ?? '', error: null })
                            setReplacing(null)
                          }}
                          title="Correct this copy's barcode in stock (a worn label) — not a way to swap units; use Replace for that"
                          className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            setReplacing((k) => (k === f.key ? null : f.key))
                            setEditing(null)
                          }}
                          title="Replace this unit"
                          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                        >
                          <RefreshCw size={13} />
                          Replace
                        </button>
                      </>
                    )}
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation()
                        removeSlot(f.key)
                      }}
                      title="Remove from this add"
                      className="rounded-md p-1 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                    >
                      <X size={15} />
                    </button>
                  </div>
                </div>

                {/* Which copy — the free units for these dates */}
                {unitPicker?.slotKey === f.key && (
                  <UnitPickList
                    itemName={f.itemName}
                    units={freeUnitsFor(f.itemId)}
                    ownUnitIds={ownUnitIds}
                    onPick={pickUnit}
                    onCancel={() => setUnitPicker(null)}
                  />
                )}

                {/* Replace-with-reason panel */}
                {replacing === f.key && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
                    <span className="text-slate-500">Replace #{f.barcode} —</span>
                    <button
                      type="button"
                      onClick={() => returnToStock(f.key)}
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-slate-600 ring-1 ring-slate-200 transition hover:bg-slate-100"
                    >
                      <Undo2 size={13} /> Return to stock
                    </button>
                    <button
                      type="button"
                      onClick={() => markBroken(f)}
                      className="inline-flex items-center gap-1 rounded-md bg-white px-2 py-1 font-medium text-rose-600 ring-1 ring-rose-200 transition hover:bg-rose-50"
                    >
                      <Wrench size={13} /> Broken → send to repair
                    </button>
                    <button
                      type="button"
                      onClick={() => setReplacing(null)}
                      className="ml-auto rounded-md px-2 py-1 font-medium text-slate-400 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {/* Inline barcode edit panel */}
                {editing?.key === f.key && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-200 bg-slate-50/70 px-3 py-2 text-xs">
                    <span className="text-slate-500">Barcode</span>
                    <input
                      autoFocus
                      type="text"
                      inputMode="numeric"
                      value={editing.value}
                      onChange={(e) => setEditing((s) => ({ ...s, value: e.target.value, error: null }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveBarcode()
                        } else if (e.key === 'Escape') {
                          setEditing(null)
                        }
                      }}
                      className="w-32 rounded-md border border-slate-300 px-2 py-1 font-mono outline-none focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button
                      type="button"
                      onClick={saveBarcode}
                      className="rounded-md bg-violet-600 px-2.5 py-1 font-medium text-white transition hover:bg-violet-700"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditing(null)}
                      className="rounded-md px-2 py-1 font-medium text-slate-500 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                    {editing.error && (
                      <span className="flex items-center gap-1 font-medium text-rose-600">
                        <AlertTriangle size={12} /> {editing.error}
                      </span>
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>

        {fills.length === 0 && (
          <p className="py-6 text-center text-sm text-slate-400">
            No slots left — add an item from stock, or cancel.
          </p>
        )}

        {/* Ad-hoc add, step two: which copy */}
        {unitPicker && !unitPicker.slotKey && (
          <div className="mt-3 overflow-hidden rounded-xl border border-slate-200">
            <div className="border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Add {inventory.find((i) => i.id === unitPicker.itemId)?.name} — pick a copy
            </div>
            <UnitPickList
              bare
              itemName={inventory.find((i) => i.id === unitPicker.itemId)?.name ?? 'item'}
              units={freeUnitsFor(unitPicker.itemId)}
              ownUnitIds={ownUnitIds}
              onPick={pickUnit}
              onCancel={() => setUnitPicker(null)}
            />
          </div>
        )}

        {/* Ad-hoc add */}
        {picker ? (
          <div className="mt-3 rounded-xl border border-slate-200 p-3">
            <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Add from stock
            </div>
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                autoFocus
                type="text"
                value={pickerSearch}
                onChange={(e) => setPickerSearch(e.target.value)}
                placeholder="Search available stock…"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
            {pickerResults.length > 0 ? (
              <ul className="mt-1 max-h-48 overflow-auto">
                {pickerResults.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => addExtra(item.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-1.5 text-left text-sm transition hover:bg-slate-50"
                    >
                      <span className="min-w-0 truncate text-slate-700">{item.name}</span>
                      <span className="shrink-0 text-xs text-slate-400">
                        {freeUnitsFor(item.id).length} free
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-1 py-3 text-center text-xs text-slate-400">
                No matching stock with free units.
              </p>
            )}
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setPicker(null)}
                className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => {
              setPicker({})
              setPickerSearch('')
            }}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-2 text-sm font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
          >
            <Plus size={15} />
            Add item
          </button>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
        <span className="text-xs text-slate-400">
          {filledCount} of {fills.length} slot{fills.length === 1 ? '' : 's'} assigned
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={confirm}
            disabled={!ready}
            className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Check size={15} />
            Add {filledCount} to set
          </button>
        </div>
      </div>
    </Modal>
  )
}
