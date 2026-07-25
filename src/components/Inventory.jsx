import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, Plus, Boxes, PackageOpen, History, ChevronLeft, Pencil, X } from 'lucide-react'
import { useStore } from '../store'
import { CATEGORIES, ITEM_KINDS, itemCount, kindLabel } from '../data/inventory'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import AddInventoryModal from './AddInventoryModal'
import UnitHistoryModal from './UnitHistoryModal'

// Render `text` with the first occurrence of `query` (already lowercased) wrapped
// in a highlight. Used to show what a name / barcode / serial search matched.
function Highlight({ text, query }) {
  const s = String(text ?? '')
  if (!query) return s
  const i = s.toLowerCase().indexOf(query)
  if (i === -1) return s
  return (
    <>
      {s.slice(0, i)}
      <mark className="rounded-sm bg-yellow-200 px-0.5 text-slate-900">
        {s.slice(i, i + query.length)}
      </mark>
      {s.slice(i + query.length)}
    </>
  )
}

function StatusBadge({ status }) {
  const available = status === 'available'
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium',
        available
          ? 'bg-emerald-50 text-emerald-700'
          : 'bg-orange-50 text-orange-700',
      ].join(' ')}
    >
      <span
        className={[
          'h-1.5 w-1.5 rounded-full',
          available ? 'bg-emerald-500' : 'bg-orange-500',
        ].join(' ')}
      />
      {available ? 'Available' : 'Checked out'}
    </span>
  )
}

function OwnershipBadge({ ownership, onToggle, disabled }) {
  const owned = ownership === 'owned'
  const base =
    'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1'
  const tone = owned
    ? 'bg-slate-100 text-slate-600 ring-slate-200'
    : 'bg-indigo-50 text-indigo-700 ring-indigo-200'
  const label = owned ? 'Owned' : 'Sub-rental'

  if (disabled) {
    return <span className={[base, tone].join(' ')}>{label}</span>
  }
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Click to toggle owned / sub-rental"
      className={[
        base,
        tone,
        'transition hover:ring-2',
        owned ? 'hover:ring-slate-300' : 'hover:ring-indigo-300',
      ].join(' ')}
    >
      {label}
    </button>
  )
}

function ItemRow({ item, active, onSelect, query }) {
  const subtitle = [
    item.brand,
    item.kind !== 'barcoded' ? kindLabel(item.kind) : null,
  ]
    .filter(Boolean)
    .join(' · ')
  return (
    <button
      type="button"
      onClick={onSelect}
      className={[
        'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition',
        active ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50',
      ].join(' ')}
    >
      <span
        className={[
          'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-semibold',
          active ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600',
        ].join(' ')}
      >
        {itemCount(item)}
      </span>
      <span className="min-w-0">
        <span
          className={[
            'block truncate text-sm font-medium',
            active ? 'text-violet-900' : 'text-slate-800',
          ].join(' ')}
        >
          <Highlight text={item.name} query={query} />
        </span>
        <span className="block truncate text-xs text-slate-400">
          {subtitle || ' '}
        </span>
      </span>
    </button>
  )
}

export default function Inventory() {
  const inventory = useStore((s) => s.inventory)
  const toggleOwnership = useStore((s) => s.toggleOwnership)
  const addInventoryItem = useStore((s) => s.addInventoryItem)
  const updateInventoryItem = useStore((s) => s.updateInventoryItem)
  const deleteInventoryItem = useStore((s) => s.deleteInventoryItem)
  const can = useCan()

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [brand, setBrand] = useState('All')
  const [kind, setKind] = useState('All')
  const [selectedId, setSelectedId] = useState(
    () => inventory.find((i) => i.id === 'kbd-magic')?.id ?? inventory[0]?.id ?? null,
  )
  const [itemModal, setItemModal] = useState({ open: false, item: null })
  const [historyUnit, setHistoryUnit] = useState(null)
  // On phone/tablet-portrait the list and detail are separate screens.
  const [showDetailMobile, setShowDetailMobile] = useState(false)

  // Distinct brands present in the inventory (for the Brand filter).
  const brands = useMemo(
    () =>
      [...new Set(inventory.map((i) => i.brand).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b),
      ),
    [inventory],
  )

  const query = search.trim().toLowerCase()

  // Search matches name, barcode, or serial (scan a barcode/serial → find the
  // item). Category / brand / type narrow the list independently.
  const filtered = useMemo(() => {
    return inventory.filter((item) => {
      if (category !== 'All' && item.category !== category) return false
      if (brand !== 'All' && item.brand !== brand) return false
      if (kind !== 'All' && item.kind !== kind) return false
      if (query === '') return true
      if (item.name.toLowerCase().includes(query)) return true
      return item.units.some(
        (u) =>
          u.barcode.toLowerCase().includes(query) ||
          u.serial.toLowerCase().includes(query),
      )
    })
  }, [inventory, query, category, brand, kind])

  const filtersActive =
    query !== '' || category !== 'All' || brand !== 'All' || kind !== 'All'

  function clearFilters() {
    setSearch('')
    setCategory('All')
    setBrand('All')
    setKind('All')
  }

  // Group the list by category → subcategory in the predefined category order
  // (the same order items appear in an order). Categories are surfaced as
  // headers in the main view, not just the filter.
  const groups = useMemo(() => {
    const catRank = (c) => {
      const i = CATEGORIES.indexOf(c)
      return i === -1 ? CATEGORIES.length : i
    }
    const byCat = new Map()
    for (const item of filtered) {
      if (!byCat.has(item.category)) byCat.set(item.category, [])
      byCat.get(item.category).push(item)
    }
    return [...byCat.keys()]
      .sort((a, b) => catRank(a) - catRank(b) || a.localeCompare(b))
      .map((cat) => {
        const bySub = new Map()
        for (const item of byCat.get(cat)) {
          const sub = item.subcategory || ''
          if (!bySub.has(sub)) bySub.set(sub, [])
          bySub.get(sub).push(item)
        }
        const subs = [...bySub.keys()].sort((a, b) =>
          a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
        )
        return {
          category: cat,
          subgroups: subs.map((sub) => ({
            subcategory: sub,
            items: bySub.get(sub).sort((x, y) => x.name.localeCompare(y.name)),
          })),
        }
      })
  }, [filtered])

  const selected =
    inventory.find((i) => i.id === selectedId) ?? inventory[0] ?? null

  const totalUnits = inventory.reduce((n, i) => n + i.units.length, 0)

  const closeItemModal = () => setItemModal({ open: false, item: null })

  async function handleCreate(fields) {
    const newId = await addInventoryItem(fields)
    clearFilters()
    setSelectedId(newId)
    setShowDetailMobile(true)
    closeItemModal()
  }

  async function handleSave(id, changes) {
    await updateInventoryItem(id, changes)
    closeItemModal()
  }

  async function handleDelete(id) {
    await deleteInventoryItem(id)
    setSelectedId(null)
    setShowDetailMobile(false)
    closeItemModal()
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Inventory
          </h2>
          <p className="text-sm text-slate-500">
            {inventory.length} items · {totalUnits} units
          </p>
        </div>
        {can(CAP.INVENTORY_ADD) && (
          <button
            type="button"
            onClick={() => setItemModal({ open: true, item: null })}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
          >
            <Plus size={16} />
            Add inventory
          </button>
        )}
      </div>

      {/* Body: list + detail (side-by-side on desktop; separate screens on
          phone / tablet-portrait) */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* List pane */}
        <div
          className={[
            showDetailMobile ? 'hidden lg:flex' : 'flex',
            'w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:w-80',
          ].join(' ')}
        >
          <div className="space-y-2 border-b border-slate-200 p-3">
            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search name, barcode, or serial…"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              {search !== '' && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="min-w-0 rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              >
                <option value="All">All categories</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <select
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="min-w-0 rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              >
                <option value="All">All brands</option>
                {brands.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value)}
                className="min-w-0 rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              >
                <option value="All">All types</option>
                {ITEM_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
              {filtersActive && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex min-w-0 items-center justify-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-2 text-sm font-medium text-slate-500 transition hover:bg-slate-50 hover:text-slate-700"
                >
                  <X size={14} />
                  Clear
                </button>
              )}
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {filtered.length === 0 ? (
              <div className="px-3 py-10 text-center">
                <p className="text-sm text-slate-400">
                  No items match your filters.
                </p>
                {filtersActive && (
                  <button
                    type="button"
                    onClick={clearFilters}
                    className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium text-violet-600 transition hover:bg-violet-50"
                  >
                    <X size={14} />
                    Clear filters
                  </button>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                {groups.map((g) => (
                  <div key={g.category}>
                    <div className="sticky top-0 z-10 -mx-2 bg-white/95 px-4 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500 backdrop-blur">
                      {g.category}
                    </div>
                    {g.subgroups.map((sg) => (
                      <div key={sg.subcategory || '_none'} className="mb-1">
                        {sg.subcategory && (
                          <div className="px-2.5 pb-0.5 pt-1.5 text-[11px] font-medium text-slate-400">
                            {sg.subcategory}
                          </div>
                        )}
                        <ul className="space-y-0.5">
                          {sg.items.map((item) => (
                            <li key={item.id}>
                              <ItemRow
                                item={item}
                                active={item.id === selectedId}
                                query={query}
                                onSelect={() => {
                                  setSelectedId(item.id)
                                  setShowDetailMobile(true)
                                }}
                              />
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Detail pane */}
        <div
          className={[
            showDetailMobile ? 'flex' : 'hidden lg:flex',
            'min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
          ].join(' ')}
        >
          {selected ? (
            <>
              <button
                type="button"
                onClick={() => setShowDetailMobile(false)}
                className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-3 py-2 text-sm font-medium text-violet-600 lg:hidden"
              >
                <ChevronLeft size={16} />
                Back to items
              </button>
              <UnitDetail
                item={selected}
                query={query}
                canEdit={can(CAP.INVENTORY_EDIT)}
                onEdit={() => setItemModal({ open: true, item: selected })}
                canToggleOwnership={can(CAP.UNIT_OWNERSHIP_TOGGLE)}
                onToggleOwnership={(unitId) => toggleOwnership(selected.id, unitId)}
                onShowHistory={(unit) => setHistoryUnit(unit)}
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <PackageOpen size={36} className="mb-3 text-slate-300" />
              <p className="text-sm text-slate-400">
                Select an item to see its units.
              </p>
            </div>
          )}
        </div>
      </div>

      <AddInventoryModal
        open={itemModal.open}
        item={itemModal.item}
        onClose={closeItemModal}
        onCreate={handleCreate}
        onSave={handleSave}
        onDelete={handleDelete}
      />

      <UnitHistoryModal
        open={!!historyUnit}
        unit={historyUnit}
        itemName={selected?.name}
        onClose={() => setHistoryUnit(null)}
      />
    </div>
  )
}

function UnitDetail({ item, query, canEdit, onEdit, canToggleOwnership, onToggleOwnership, onShowHistory }) {
  const isBarcoded = item.kind === 'barcoded'
  const available = item.units.filter((u) => u.status === 'available').length
  const checkedOut = item.units.length - available

  // A unit matches the search when its barcode or serial contains the query.
  const unitMatches = (u) =>
    !!query &&
    (u.barcode.toLowerCase().includes(query) || u.serial.toLowerCase().includes(query))
  const firstMatchId = isBarcoded
    ? item.units.find(unitMatches)?.id ?? null
    : null

  // Scroll the first matched unit into view when the search / item changes.
  const firstMatchRef = useRef(null)
  useEffect(() => {
    if (firstMatchRef.current) {
      firstMatchRef.current.scrollIntoView({ block: 'nearest' })
    }
  }, [firstMatchId, item.id])

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Boxes size={18} className="shrink-0 text-violet-500" />
            <h3 className="truncate text-lg font-semibold text-slate-900">
              {item.name}
            </h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {item.category}
            </span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
              {kindLabel(item.kind)}
            </span>
            {isBarcoded ? (
              <>
                <span>{item.units.length} units</span>
                <span className="text-emerald-600">{available} available</span>
                <span className="text-orange-600">{checkedOut} checked out</span>
              </>
            ) : (
              <span>{itemCount(item)} on hand</span>
            )}
          </div>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>

      <ItemDetailsGrid item={item} />

      {isBarcoded ? (
      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr className="whitespace-nowrap">
              <th className="px-5 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Barcode</th>
              <th className="px-3 py-2.5 font-medium">Serial</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Location</th>
              <th className="px-3 py-2.5 font-medium">Ownership</th>
              <th className="px-5 py-2.5 font-medium">History</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {item.units.map((unit, idx) => {
              const matched = unitMatches(unit)
              return (
              <tr
                key={unit.id}
                ref={unit.id === firstMatchId ? firstMatchRef : null}
                className={matched ? 'bg-yellow-50' : 'hover:bg-slate-50/60'}
              >
                <td className="px-5 py-2.5 text-slate-400">{idx + 1}</td>
                <td className="px-3 py-2.5 font-mono text-slate-700">
                  <Highlight text={unit.barcode} query={query} />
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                  <Highlight text={unit.serial} query={query} />
                </td>
                <td className="px-3 py-2.5">
                  <StatusBadge status={unit.status} />
                </td>
                <td className="whitespace-nowrap px-3 py-2.5">
                  {unit.location === 'Available' ? (
                    <span className="text-slate-400">—</span>
                  ) : (
                    <span className="text-slate-700">{unit.location}</span>
                  )}
                </td>
                <td className="px-3 py-2.5">
                  <OwnershipBadge
                    ownership={unit.ownership}
                    disabled={!canToggleOwnership}
                    onToggle={() => onToggleOwnership(unit.id)}
                  />
                </td>
                <td className="px-5 py-2.5">
                  <button
                    type="button"
                    onClick={() => onShowHistory(unit)}
                    title="Show every set this unit was in"
                    className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                  >
                    <History size={14} />
                    Sets
                  </button>
                </td>
              </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      ) : (
        <NonBarcodedBody item={item} />
      )}
    </>
  )
}

function ItemDetailsGrid({ item }) {
  const price =
    item.replacementPrice == null
      ? null
      : `$${Number(item.replacementPrice).toLocaleString('en-US', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}`
  const rows = [
    ['Brand', item.brand],
    ['Asset type', item.assetType],
    ['Placement', item.placement],
    ['Subcategory', item.subcategory],
    ['Replacement price', price],
    ['Purchase date', item.purchaseDate],
  ]
  return (
    <div className="grid shrink-0 grid-cols-2 gap-x-4 gap-y-2.5 border-b border-slate-200 px-5 py-3 sm:grid-cols-3">
      {rows.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <div className="text-[11px] uppercase tracking-wide text-slate-400">{k}</div>
          <div className="truncate text-sm text-slate-700">
            {v || <span className="text-slate-300">—</span>}
          </div>
        </div>
      ))}
    </div>
  )
}

function NonBarcodedBody({ item }) {
  const consumable = item.kind === 'consumable'
  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-10 py-6">
        <div className="text-4xl font-semibold text-slate-900">{itemCount(item)}</div>
        <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
          on hand
        </div>
      </div>
      <p className="max-w-sm text-sm text-slate-500">
        {consumable
          ? 'Consumable — expendable stock drawn down as it’s used. No per-unit barcodes.'
          : 'Non-barcoded — counted by quantity, no per-unit tracking; total usage is aggregated across jobs.'}
      </p>
      <p className="text-xs text-slate-400">
        Work history &amp; usage log — coming in the next inventory step.
      </p>
    </div>
  )
}
