import { useEffect, useMemo, useState } from 'react'
import { Archive as ArchiveIcon, AlertTriangle } from 'lucide-react'
import { ITEM_KINDS } from '../data/inventory'
import { useStore } from '../store'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import Modal from './Modal'
import DateField from './DateField'
import SelectField from './SelectField'
import UnitRowsField, { blankUnitRow } from './UnitRowsField'
import { duplicateTypedBarcode } from '../lib/unitRows'
import {
  liveCategories,
  subcategoryById,
  subcategoryNameError,
  subcategoryOptions as subcategoryOptionsFor,
} from '../lib/taxonomy'

const MAX_QTY = 500
// A sentinel option value, not an id: picking it opens the inline creator.
const NEW_SUB = '__new_subcategory__'

const KIND_HELP = {
  barcoded: 'Each unit tracked by barcode & serial.',
  non_barcoded: 'Counted by quantity only (e.g. 50 J-hooks, gaffer tape).',
}

const BLANK = {
  name: '',
  kind: 'barcoded',
  subcategoryId: '',
  brand: '',
  assetType: '',
  placement: '',
  replacementPrice: '',
  purchaseDate: '',
  quantity: '1',
}

function fromItem(item) {
  return {
    name: item.name ?? '',
    kind: item.kind ?? 'barcoded',
    subcategoryId: item.subcategoryId ?? '',
    brand: item.brand ?? '',
    assetType: item.assetType ?? '',
    placement: item.placement ?? '',
    replacementPrice: item.replacementPrice != null ? String(item.replacementPrice) : '',
    purchaseDate: item.purchaseDate ?? '',
    quantity:
      item.kind === 'barcoded' ? String(item.units.length) : String(item.quantity ?? 0),
  }
}

// Create or edit an inventory item (full field set). In edit mode the type is
// locked and barcoded quantity is read-only (units are managed individually).
export default function AddInventoryModal({
  open,
  onClose,
  onCreate,
  onSave,
  onDelete,
  item,
  // Create-mode starting values. The equipment picker opens this with the
  // name already typed into its search box — retyping it would be silly.
  prefill = null,
}) {
  // ONE field decides where a piece of gear lives: its SUBCATEGORY. The
  // category comes from that (lib/taxonomy), which is why there is no category
  // field here — an item is never attached to a category directly.
  const taxonomy = useStore((st) => st.taxonomy)
  const createSubcategory = useStore((st) => st.createSubcategory)
  // Read from the store rather than threaded down: what the previews need is
  // this control's own business (the `companies={companies}` lesson).
  const inventory = useStore((st) => st.inventory)
  const nextBarcode = useStore((st) => st.nextBarcode)
  const takenBarcodes = useMemo(() => {
    const set = new Set()
    for (const it of inventory) for (const u of it.units || []) if (u.barcode) set.add(u.barcode)
    return set
  }, [inventory])
  const can = useCan()
  const isEdit = !!item
  const [form, setForm] = useState(BLANK)
  // The inline "+ New subcategory…" panel: `null` when closed.
  const [newSub, setNewSub] = useState(null)
  const [subError, setSubError] = useState(null)
  // The physical copies of a NEW barcoded item, one row per copy. Registering
  // the item and what is on the shelf under it used to be two trips.
  const [unitRows, setUnitRows] = useState([blankUnitRow()])
  const [createError, setCreateError] = useState(null)

  useEffect(() => {
    if (open) {
      setForm(item ? fromItem(item) : { ...BLANK, ...(prefill ?? {}) })
      setNewSub(null)
      setSubError(null)
      setUnitRows([blankUnitRow()])
      setCreateError(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, prefill?.name])

  const filedOptions = useMemo(() => subcategoryOptionsFor(taxonomy), [taxonomy])
  const categories = useMemo(() => liveCategories(taxonomy), [taxonomy])
  const filed = subcategoryById(taxonomy, form.subcategoryId)

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))

  const isBarcoded = form.kind === 'barcoded'
  // A NEW barcoded item counts its copies from the rows below — the count field
  // there is the same number, so there is no second place to disagree.
  const creatingUnits = !isEdit && isBarcoded
  const qty = creatingUnits ? unitRows.length : Math.floor(Number(form.quantity))
  const showQty = !isEdit || !isBarcoded
  // Creating the missing subcategory from here, so a half-typed item is never
  // abandoned to go and make one elsewhere.
  async function addSubcategory() {
    const bad = subcategoryNameError(newSub?.name, taxonomy, newSub?.categoryId)
    if (bad) return setSubError(bad)
    setSubError(null)
    const res = await createSubcategory(newSub.categoryId, newSub.name)
    if (res?.error) return setSubError(res.error)
    setForm((f) => ({ ...f, subcategoryId: res.id }))
    setNewSub(null)
  }

  const canSubmit =
    form.name.trim() !== '' && (isEdit || (Number.isFinite(qty) && qty >= 1))

  async function handleSubmit(e) {
    e.preventDefault()
    if (!canSubmit) return
    setCreateError(null)
    if (creatingUnits) {
      // Caught next to the field; the store checks it too and that one is the
      // guarantee (lib/unitRows).
      const dup = duplicateTypedBarcode(unitRows)
      if (dup) return setCreateError(`#${dup} is listed twice — each copy needs its own barcode.`)
    }
    const price = form.replacementPrice.trim()
    const base = {
      name: form.name.trim(),
      // The legacy `category`/`subcategory` TEXT is deliberately NOT written:
      // it records what the register was imported as, and a second place saying
      // where an item lives is exactly how the two get to disagree.
      subcategoryId: form.subcategoryId || null,
      brand: form.brand.trim(),
      assetType: form.assetType.trim(),
      placement: form.placement.trim(),
      replacementPrice: price === '' ? null : Number(price),
      purchaseDate: form.purchaseDate || null,
    }
    if (isEdit) {
      const changes = { ...base, kind: form.kind }
      if (!isBarcoded) changes.quantity = Number.isFinite(qty) && qty >= 0 ? qty : 0
      onSave(item.id, changes)
    } else {
      const res = await onCreate({
        ...base,
        kind: form.kind,
        quantity: Math.min(MAX_QTY, qty),
        // One entry per copy: typed where the crew has the label in hand, blank
        // to be generated. Only for barcoded stock — counted stock has no
        // copies to register.
        units: creatingUnits ? unitRows : undefined,
      })
      // A refused barcode leaves the form open with the reason on it, rather
      // than closing on a write that did not happen.
      if (res?.error) setCreateError(res.error)
    }
  }

  // Archiving, not deleting: an inline confirm (window.confirm can't be exercised
  // in the preview pane, and this reads better anyway).
  const [confirmArchive, setConfirmArchive] = useState(false)
  const [archiveError, setArchiveError] = useState(null)

  async function handleArchive() {
    const res = await onDelete(item.id)
    if (res?.error) {
      setConfirmArchive(false)
      setArchiveError(res.error)
      return
    }
    setConfirmArchive(false)
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
  const label = 'mb-1.5 block text-sm font-medium text-slate-700'

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit inventory item' : 'Add inventory item'}>
      <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <label className={label}>Name</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={set('name')}
              placeholder="e.g. Aputure 1200D Pro"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Type</label>
            <div className="flex rounded-lg border border-slate-300 p-0.5">
              {ITEM_KINDS.map((k) => (
                <button
                  key={k.value}
                  type="button"
                  disabled={isEdit}
                  onClick={() => setForm((f) => ({ ...f, kind: k.value }))}
                  className={[
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    form.kind === k.value
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                    isEdit && form.kind !== k.value ? 'opacity-40' : '',
                    isEdit ? 'cursor-not-allowed' : '',
                  ].join(' ')}
                >
                  {k.label}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-xs text-slate-400">
              {isEdit ? "Type can't be changed after creation." : KIND_HELP[form.kind]}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label className={label}>Filed under</label>
              {/* Category / Subcategory as ONE choice, because an item belongs
                  to a subcategory and its category follows from that. The option
                  shows the whole path: two categories may each have a
                  "Profoto", and on this register two do. */}
              <SelectField
                value={form.subcategoryId}
                onChange={(e) => {
                  if (e.target.value === NEW_SUB) {
                    setNewSub({
                      categoryId: filed?.categoryId ?? categories[0]?.id ?? '',
                      name: '',
                    })
                    return
                  }
                  setForm((f) => ({ ...f, subcategoryId: e.target.value }))
                }}
                options={[
                  { value: '', label: 'Not filed yet' },
                  ...filedOptions,
                  ...(categories.length ? [{ value: NEW_SUB, label: '+ New subcategory…' }] : []),
                ]}
                placeholder="Not filed yet"
                className={field}
              />
              {newSub ? (
                <div className="mt-2 rounded-lg border border-violet-200 bg-violet-50/60 p-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <SelectField
                      value={newSub.categoryId}
                      onChange={(e) => setNewSub((v) => ({ ...v, categoryId: e.target.value }))}
                      options={categories.map((c) => ({ value: c.id, label: c.name }))}
                      placeholder="Category…"
                      className="min-w-0 flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm outline-none"
                    />
                    <span className="text-slate-400">/</span>
                    <input
                      autoFocus
                      type="text"
                      value={newSub.name}
                      onChange={(e) => setNewSub((v) => ({ ...v, name: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addSubcategory()
                        }
                      }}
                      placeholder="New subcategory"
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-violet-400"
                    />
                    <button
                      type="button"
                      onClick={addSubcategory}
                      className="rounded-md bg-violet-600 px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-violet-700"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewSub(null)}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-white"
                    >
                      Cancel
                    </button>
                  </div>
                  {subError && (
                    <p className="mt-1 text-[11px] font-medium text-rose-600">{subError}</p>
                  )}
                </div>
              ) : (
                <p className="mt-1 text-[11px] text-slate-400">
                  {filed
                    ? 'Its category comes from the subcategory.'
                    : item?.category
                      ? `Imported as “${item.category}”${item.subcategory ? ` / ${item.subcategory}` : ''} — pick where it belongs.`
                      : 'Stock can be registered before it is filed.'}
                </p>
              )}
            </div>
            <div>
              <label className={label}>Brand</label>
              <input type="text" value={form.brand} onChange={set('brand')} placeholder="e.g. Aputure" className={field} />
            </div>
            <div>
              <label className={label}>Asset type</label>
              <input type="text" value={form.assetType} onChange={set('assetType')} placeholder="e.g. Fixture" className={field} />
            </div>
            {/* Same concept, same name as the per-unit field in UnitEditorModal
                and the Location column: where the gear is KEPT. */}
            <div>
              <label className={label}>Storage location</label>
              <input type="text" value={form.placement} onChange={set('placement')} placeholder="e.g. Grip room · Shelf B3" className={field} />
              {isBarcoded && (
                <p className="mt-1.5 text-xs text-slate-400">
                  Units inherit it unless a copy has its own.
                </p>
              )}
            </div>
            <div>
              <label className={label}>Purchase price</label>
              <div className="relative">
                <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-slate-400">$</span>
                <input type="number" min="0" step="0.01" value={form.replacementPrice} onChange={set('replacementPrice')} placeholder="0.00" className={field + ' pl-7'} />
              </div>
            </div>
            <div>
              <label className={label}>Purchase date</label>
              <DateField value={form.purchaseDate} onChange={set('purchaseDate')} className={field} />
            </div>
            {/* Counted stock takes a number. Barcoded stock takes its COPIES —
                see the block below — and an existing item manages them one at a
                time from its card. */}
            {!creatingUnits && (
              <div>
                <label className={label}>{isBarcoded ? 'Quantity' : 'Quantity on hand'}</label>
                {showQty ? (
                  <>
                    <input type="number" min={isEdit ? '0' : '1'} max={MAX_QTY} value={form.quantity} onChange={set('quantity')} className={field} />
                    <p className="mt-1.5 text-xs text-slate-400">
                      Stored as a count — no per-unit barcodes.
                    </p>
                  </>
                ) : (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-500">
                    {item.units.length} units — managed individually.
                  </div>
                )}
              </div>
            )}
          </div>

          {/* The COPIES of a new barcoded item, registered with it. Blank rows
              are generated (a batch of identical stands), typed rows carry the
              label already on the piece — the same control the item card's
              "Add unit" uses, so the question is asked one way. */}
          {creatingUnits && (
            <div className="space-y-3 rounded-xl border border-slate-200 p-3">
              <p className="text-sm font-medium text-slate-700">Its copies</p>
              <UnitRowsField
                rows={unitRows}
                onChange={setUnitRows}
                suggestedBarcode={nextBarcode()}
                taken={takenBarcodes}
              />
            </div>
          )}

          {createError && (
            <div className="flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle size={13} className="mt-0.5 shrink-0" />
              {createError}
            </div>
          )}
        </div>

        {archiveError && (
          <div className="mx-5 mb-3 flex shrink-0 items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
            <AlertTriangle size={13} className="mt-0.5 shrink-0" />
            {archiveError}
          </div>
        )}

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          {isEdit && can(CAP.INVENTORY_DELETE) ? (
            confirmArchive ? (
              <span className="flex items-center gap-2 text-xs">
                <span className="text-slate-600">
                  Archive it? It and all its copies leave the app.
                </span>
                <button
                  type="button"
                  onClick={handleArchive}
                  className="rounded-md bg-rose-600 px-2 py-1 text-xs font-semibold text-white transition hover:bg-rose-700"
                >
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmArchive(false)}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  Keep
                </button>
              </span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setArchiveError(null)
                  setConfirmArchive(true)
                }}
                title="Take it out of circulation — nothing is deleted"
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
              disabled={!canSubmit}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isEdit ? 'Save changes' : 'Add item'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
