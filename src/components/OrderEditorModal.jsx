import { useEffect, useMemo, useState } from 'react'
import {
  ClipboardCheck,
  Check,
  AlertTriangle,
  Info,
  Archive as ArchiveIcon,
  Search,
  Layers,
  Minus,
  Plus,
  X,
  Boxes,
} from 'lucide-react'
import Modal from './Modal'
import DateField from './DateField'
import KitStagingModal from './KitStagingModal'
import { studioLabel } from '../data/studios'
import { notArchived } from '../store'
import { availableCount } from '../lib/availability'
import { applyScenarioList } from '../lib/scenarios'

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
  inventory = [],
  kits = [],
  scenarios = [],
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

  // --- equipment, right here in the form -----------------------------------
  //
  // The old New Booking window let you pick the gear while writing the job down,
  // and that is what the crew expects: one window, job + kit. Creating the order
  // first and opening a second dialog made "add inventory" feel missing.
  //
  // This covers the everyday case — a-la-carte quantities, whole kits, scenario
  // lists. The full picker (sub-rental vendors, the zero-availability dialog)
  // still lives behind "Edit equipment" on the card, for refining afterwards.
  const [selected, setSelected] = useState({}) // itemId -> qty
  const [stagedUnits, setStagedUnits] = useState([]) // units committed by kits
  const [staging, setStaging] = useState(null) // kit being staged, or null
  const [invSearch, setInvSearch] = useState('')
  const [applied, setApplied] = useState(null) // last scenario list applied

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
    setSelected({})
    setStagedUnits([])
    setStaging(null)
    setInvSearch('')
    setApplied(null)
  }, [open, order, prefill])

  const itemsById = useMemo(
    () => Object.fromEntries(inventory.map((i) => [i.id, i])),
    [inventory],
  )
  const liveKits = useMemo(() => kits.filter(notArchived), [kits])
  const liveScenarios = useMemo(() => scenarios.filter(notArchived), [scenarios])
  const stagedIds = useMemo(() => new Set(stagedUnits.map((u) => u.unitId)), [stagedUnits])

  // Shared availability rule (5.6) — the same answer kits and lists get.
  const freeFor = (item) => availableCount(item, { claimed: stagedIds })

  const searchResults = useMemo(() => {
    const q = invSearch.trim().toLowerCase()
    if (q === '') return []
    return inventory.filter((i) => notArchived(i) && i.name.toLowerCase().includes(q)).slice(0, 8)
  }, [inventory, invSearch])

  // Adding is never capped by what's free: the crew has to be able to write the
  // job down before the gear is back. The shortfall is shown instead (same rule
  // as the booking modal and the full picker).
  const addItem = (itemId) => setSelected((s) => ({ ...s, [itemId]: (s[itemId] ?? 0) + 1 }))
  const setQty = (itemId, qty) =>
    setSelected((s) => {
      if (qty <= 0) {
        const { [itemId]: _drop, ...rest } = s
        return rest
      }
      return { ...s, [itemId]: qty }
    })

  function applyList(list) {
    const res = applyScenarioList({ list, inventory, kits: liveKits, selected, stagedUnits })
    setSelected(res.selected)
    setStagedUnits(res.stagedUnits)
    setApplied({ name: list.name, ...res })
  }

  const pieces = Object.values(selected).reduce((n, q) => n + q, 0) + stagedUnits.length

  const shortfall = useMemo(() => {
    let short = 0
    for (const [itemId, qty] of Object.entries(selected)) {
      const item = itemsById[itemId]
      if (!item || item.kind !== 'barcoded') continue
      short += Math.max(0, qty - freeFor(item))
    }
    return short
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, itemsById, stagedIds])

  // The lines to write once the order exists — same shape the full picker saves.
  const equipmentLines = useMemo(
    () => [
      ...stagedUnits.map((u) => ({
        itemId: u.itemId,
        itemName: u.itemName,
        quantity: 1,
        kitId: u.kitId,
        unitId: u.unitId,
        barcode: u.barcode,
        slotLabel: u.label,
        source: 'in_house',
        vendorId: null,
        dayRate: itemsById[u.itemId]?.dayRate ?? null,
      })),
      ...Object.entries(selected)
        .filter(([, qty]) => qty > 0)
        .map(([itemId, quantity]) => ({
          itemId,
          itemName: itemsById[itemId]?.name ?? null,
          quantity,
          source: 'in_house',
          vendorId: null,
          dayRate: itemsById[itemId]?.dayRate ?? null,
        })),
    ],
    [selected, stagedUnits, itemsById],
  )

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
    // The gear chosen above goes in with the order, in one action.
    const res = isEdit
      ? await onSave(order.id, payload)
      : await onCreate(payload, equipmentLines)
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
                The order starts on <strong>Hold</strong> and books the studio for this job. Pick
                the gear below — items, whole kits or a scenario list — and it goes in with the
                order.
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

          {/* EQUIPMENT — in the form, like the old New Booking window. */}
          {!isEdit && (
            <div className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <Boxes size={15} className="text-violet-500" />
                  Equipment
                </span>
                <span className="text-xs text-slate-500">
                  {pieces === 0 ? 'nothing yet' : `${pieces} piece${pieces === 1 ? '' : 's'}`}
                  {shortfall > 0 && (
                    <span className="ml-1 font-medium text-amber-700">· {shortfall} short</span>
                  )}
                </span>
              </div>

              {liveScenarios.length > 0 && (
                <select
                  value=""
                  onChange={(e) => {
                    const list = liveScenarios.find((l) => l.id === e.target.value)
                    if (list) applyList(list)
                    e.target.value = ''
                  }}
                  className={[field, 'mb-2 bg-white'].join(' ')}
                >
                  <option value="">Start from a scenario list…</option>
                  {liveScenarios.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                      {l.category ? ` · ${l.category}` : ''}
                    </option>
                  ))}
                </select>
              )}

              {applied && (
                <p className="mb-2 text-[11px] text-slate-500">
                  Applied <span className="font-medium text-slate-700">{applied.name}</span>
                  {applied.warnings?.length ? ` · ${applied.warnings.length} line(s) short` : ''}
                  {applied.notes?.length ? ` · ${applied.notes.length} to take from stock` : ''}
                </p>
              )}

              {/* Staged kits, grouped */}
              {stagedUnits.length > 0 && (
                <ul className="mb-2 space-y-1">
                  {[...new Set(stagedUnits.map((u) => u.kitName))].map((kitName) => (
                    <li
                      key={kitName}
                      className="flex items-center justify-between gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-violet-200"
                    >
                      <span className="inline-flex min-w-0 items-center gap-1.5">
                        <Layers size={13} className="shrink-0 text-violet-500" />
                        <span className="truncate font-medium text-slate-700">{kitName}</span>
                        <span className="shrink-0 text-slate-400">
                          {stagedUnits.filter((u) => u.kitName === kitName).length} unit(s)
                        </span>
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          setStagedUnits((prev) => prev.filter((u) => u.kitName !== kitName))
                        }
                        title="Remove this kit"
                        className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-500"
                      >
                        <X size={13} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              {/* A-la-carte lines */}
              {Object.keys(selected).length > 0 && (
                <ul className="mb-2 space-y-1">
                  {Object.entries(selected).map(([itemId, qty]) => {
                    const item = itemsById[itemId]
                    const freeNow = item ? freeFor(item) : 0
                    const over = item?.kind === 'barcoded' ? Math.max(0, qty - freeNow) : 0
                    return (
                      <li
                        key={itemId}
                        className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-slate-200"
                      >
                        <span className="min-w-0 flex-1 truncate text-slate-700">
                          {item?.name ?? itemId}
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setQty(itemId, qty - 1)}
                            className="grid h-5 w-5 place-items-center rounded border border-slate-300 text-slate-500 hover:bg-slate-100"
                          >
                            <Minus size={11} />
                          </button>
                          <span className="w-5 text-center font-medium text-slate-800">{qty}</span>
                          <button
                            type="button"
                            onClick={() => addItem(itemId)}
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
                          {over > 0 ? `/${freeNow} free · ${over} short` : `/${freeNow} free`}
                        </span>
                        <button
                          type="button"
                          onClick={() => setQty(itemId, 0)}
                          className="shrink-0 rounded p-0.5 text-slate-400 hover:text-rose-500"
                        >
                          <X size={13} />
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="relative">
                <Search
                  size={15}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  type="text"
                  value={invSearch}
                  onChange={(e) => setInvSearch(e.target.value)}
                  placeholder="Search inventory to add…"
                  className={[field, 'bg-white pl-9'].join(' ')}
                />
                {searchResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                    {searchResults.map((item) => {
                      const freeNow = freeFor(item)
                      const none = (selected[item.id] ?? 0) >= freeNow
                      return (
                        <li key={item.id}>
                          <button
                            type="button"
                            onClick={() => {
                              addItem(item.id)
                              setInvSearch('')
                            }}
                            title={
                              none ? 'Nothing free — adds it anyway, the shortfall is flagged' : undefined
                            }
                            className="flex w-full items-center justify-between gap-2 px-3 py-1.5 text-left text-sm hover:bg-slate-50"
                          >
                            <span className="min-w-0 truncate text-slate-700">{item.name}</span>
                            <span
                              className={[
                                'shrink-0 text-xs',
                                none ? 'font-medium text-amber-600' : 'text-slate-400',
                              ].join(' ')}
                            >
                              {freeNow} free{none ? ' · add anyway' : ''}
                            </span>
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>

              {liveKits.length > 0 && (
                <div className="relative mt-2">
                  <Layers
                    size={15}
                    className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500"
                  />
                  <select
                    value=""
                    onChange={(e) => {
                      const kit = liveKits.find((k) => k.id === e.target.value)
                      if (kit) setStaging(kit)
                      e.target.value = ''
                    }}
                    className={[field, 'bg-white pl-9'].join(' ')}
                  >
                    <option value="">Add a kit…</option>
                    {liveKits.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <p className="mt-2 text-[11px] text-slate-400">
                Sub-rental and vendors are set afterwards under “Edit equipment” on the order.
              </p>
            </div>
          )}

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
              {isEdit ? <Check size={15} /> : <ClipboardCheck size={15} />}
              {isEdit
                ? 'Save order'
                : pieces > 0
                  ? `Create order · ${pieces} piece${pieces === 1 ? '' : 's'}`
                  : 'Create order'}
            </button>
          </div>
        </div>
      </form>

      {/* Kits are filled the same way as everywhere else — the epic-3 staging
          window, unchanged, layered over this form (exactly what the old booking
          modal did). */}
      <KitStagingModal
        open={!!staging}
        kit={staging}
        inventory={inventory}
        // Only units already committed by another staged kit are hard-claimed;
        // a-la-carte quantities resolve to units when the order is saved.
        reservedUnitIds={[...stagedIds]}
        onConfirm={(units) => {
          setStagedUnits((prev) => [...prev, ...units])
          setStaging(null)
        }}
        onCancel={() => setStaging(null)}
      />
    </Modal>
  )
}
