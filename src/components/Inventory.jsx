import { useMemo, useState } from 'react'
import { Search, Plus, Boxes, PackageOpen } from 'lucide-react'
import { useStore } from '../store'
import { CATEGORIES } from '../data/inventory'
import AddInventoryModal from './AddInventoryModal'

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

function OwnershipBadge({ ownership, onToggle }) {
  const owned = ownership === 'owned'
  return (
    <button
      type="button"
      onClick={onToggle}
      title="Click to toggle owned / sub-rental"
      className={[
        'inline-flex items-center whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 transition hover:ring-2',
        owned
          ? 'bg-slate-100 text-slate-600 ring-slate-200 hover:ring-slate-300'
          : 'bg-indigo-50 text-indigo-700 ring-indigo-200 hover:ring-indigo-300',
      ].join(' ')}
    >
      {owned ? 'Owned' : 'Sub-rental'}
    </button>
  )
}

export default function Inventory() {
  const inventory = useStore((s) => s.inventory)
  const toggleOwnership = useStore((s) => s.toggleOwnership)
  const addInventoryItem = useStore((s) => s.addInventoryItem)

  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedId, setSelectedId] = useState(
    () => inventory.find((i) => i.id === 'kbd-magic')?.id ?? inventory[0]?.id ?? null,
  )
  const [showAdd, setShowAdd] = useState(false)

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    return inventory.filter(
      (item) =>
        (category === 'All' || item.category === category) &&
        (q === '' || item.name.toLowerCase().includes(q)),
    )
  }, [inventory, search, category])

  const selected = inventory.find((i) => i.id === selectedId) ?? null

  const totalUnits = inventory.reduce((n, i) => n + i.units.length, 0)

  function handleCreate(fields) {
    const newId = addInventoryItem(fields)
    setSearch('')
    setCategory('All')
    setSelectedId(newId)
    setShowAdd(false)
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
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
        >
          <Plus size={16} />
          Add inventory
        </button>
      </div>

      {/* Body: list + detail */}
      <div className="flex min-h-0 flex-1 gap-4">
        {/* List pane */}
        <div className="flex w-80 shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
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
                placeholder="Search items…"
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
            </div>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              <option value="All">All categories</option>
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-8 text-center text-sm text-slate-400">
                No items match your filters.
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((item) => {
                  const active = item.id === selectedId
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        onClick={() => setSelectedId(item.id)}
                        className={[
                          'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition',
                          active
                            ? 'bg-violet-50 ring-1 ring-violet-200'
                            : 'hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <span
                          className={[
                            'grid h-9 w-9 shrink-0 place-items-center rounded-lg text-sm font-semibold',
                            active
                              ? 'bg-violet-600 text-white'
                              : 'bg-slate-100 text-slate-600',
                          ].join(' ')}
                        >
                          {item.units.length}
                        </span>
                        <span className="min-w-0">
                          <span
                            className={[
                              'block truncate text-sm font-medium',
                              active ? 'text-violet-900' : 'text-slate-800',
                            ].join(' ')}
                          >
                            {item.name}
                          </span>
                          <span className="block truncate text-xs text-slate-400">
                            {item.category}
                          </span>
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Detail pane */}
        <div className="flex min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white">
          {selected ? (
            <UnitDetail
              item={selected}
              onToggleOwnership={(unitId) => toggleOwnership(selected.id, unitId)}
            />
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
        open={showAdd}
        onClose={() => setShowAdd(false)}
        onCreate={handleCreate}
      />
    </div>
  )
}

function UnitDetail({ item, onToggleOwnership }) {
  const available = item.units.filter((u) => u.status === 'available').length
  const checkedOut = item.units.length - available

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
            <span>{item.units.length} units</span>
            <span className="text-emerald-600">{available} available</span>
            <span className="text-orange-600">{checkedOut} checked out</span>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 z-10 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-400">
            <tr className="whitespace-nowrap">
              <th className="px-5 py-2.5 font-medium">#</th>
              <th className="px-3 py-2.5 font-medium">Barcode</th>
              <th className="px-3 py-2.5 font-medium">Serial</th>
              <th className="px-3 py-2.5 font-medium">Status</th>
              <th className="px-3 py-2.5 font-medium">Location</th>
              <th className="px-5 py-2.5 font-medium">Ownership</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {item.units.map((unit, idx) => (
              <tr key={unit.id} className="hover:bg-slate-50/60">
                <td className="px-5 py-2.5 text-slate-400">{idx + 1}</td>
                <td className="px-3 py-2.5 font-mono text-slate-700">
                  {unit.barcode}
                </td>
                <td className="px-3 py-2.5 font-mono text-xs text-slate-500">
                  {unit.serial}
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
                <td className="px-5 py-2.5">
                  <OwnershipBadge
                    ownership={unit.ownership}
                    onToggle={() => onToggleOwnership(unit.id)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
