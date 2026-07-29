import { useMemo, useState } from 'react'
import {
  Archive as ArchiveIcon,
  Undo2,
  ClipboardList,
  CalendarRange,
  Boxes,
  ScanLine,
  UserRound,
  Building2,
  Layers,
  Tag,
  Package,
  AlertTriangle,
  ExternalLink,
} from 'lucide-react'
import { useStore, isArchived } from '../store'
import { studioLabel } from '../data/studios'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'

// ⚠️ CURRENTLY UNROUTED — hidden on request ("скрыть с UI вкладку и все"):
// records are still archived (never deleted) in the DB, but the UI offers no
// way to view or restore them. To bring this screen back, add an entry in
// data/nav.js and a branch in App.jsx; everything below still works.
//
// The Archive (20260808120000): nothing in this app is deleted any more, so this
// is where everything that was taken out of circulation lives — and where it
// comes back from.
//
// It reads the SAME collections every other screen reads; the difference is that
// the lists elsewhere filter archived records out and this one keeps only those.
// That is why a restore is instant everywhere: there is nothing to re-create.

function when(at) {
  if (!at) return ''
  const d = new Date(at)
  if (Number.isNaN(d.getTime())) return String(at).slice(0, 10)
  const mins = Math.round((Date.now() - d.getTime()) / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins} min ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs} h ago`
  const days = Math.round(hrs / 24)
  if (days < 30) return `${days} d ago`
  return d.toISOString().slice(0, 10)
}

function Row({ icon: Icon, title, meta, at, by, canRestore, onRestore, onOpen, busy }) {
  return (
    <li className="flex items-center gap-3 border-b border-slate-100 px-4 py-2.5 last:border-0">
      <Icon size={15} className="shrink-0 text-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-medium text-slate-800">{title}</div>
        {meta && <div className="truncate text-xs text-slate-500">{meta}</div>}
      </div>
      <div className="shrink-0 whitespace-nowrap text-right text-[11px] text-slate-400">
        <div title={at ? new Date(at).toLocaleString() : ''}>{when(at)}</div>
        {by && <div className="truncate">{by}</div>}
      </div>
      {onOpen && (
        <button
          type="button"
          onClick={onOpen}
          title="Open the card"
          className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-violet-700"
        >
          <ExternalLink size={14} />
        </button>
      )}
      {canRestore && (
        <button
          type="button"
          onClick={onRestore}
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:bg-slate-100 disabled:opacity-50"
        >
          <Undo2 size={13} />
          Restore
        </button>
      )}
    </li>
  )
}

function Section({ title, hint, rows }) {
  if (!rows.length) return null
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <header className="flex items-baseline justify-between gap-3 border-b border-slate-200 bg-slate-50 px-4 py-2.5">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
          {title} · {rows.length}
        </h3>
        {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
      </header>
      <ul>{rows}</ul>
    </section>
  )
}

export default function Archive() {
  const inventory = useStore((s) => s.inventory)
  const bookings = useStore((s) => s.bookings)
  const orders = useStore((s) => s.orders)
  const people = useStore((s) => s.people)
  const companies = useStore((s) => s.companies)
  const kits = useStore((s) => s.kits)
  const scenarios = useStore((s) => s.scenarios)
  const companyTypes = useStore((s) => s.companyTypes)

  const restoreOrder = useStore((s) => s.restoreOrder)
  const restoreBooking = useStore((s) => s.restoreBooking)
  const restoreInventoryItem = useStore((s) => s.restoreInventoryItem)
  const restoreUnit = useStore((s) => s.restoreUnit)
  const restoreRecord = useStore((s) => s.restoreRecord)
  const restoreAddon = useStore((s) => s.restoreAddon)
  const focusInventory = useStore((s) => s.focusInventory)
  const openOrder = useStore((s) => s.openOrder)
  const focusPeople = useStore((s) => s.focusPeople)

  const can = useCan()
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [note, setNote] = useState(null)

  // One helper so every Restore reports the same way, including the order case
  // where the reservation sync has something to say.
  const run = (key, fn) => async () => {
    setBusy(key)
    setError(null)
    setNote(null)
    const res = await fn()
    setBusy(null)
    if (res?.error) return setError(res.error)
    if (res?.reserved != null)
      setNote(
        `Restored · ${res.reserved} piece(s) reserved${
          res.short ? ` · ${res.short} could not be — nothing free for those lines` : ''
        }`,
      )
  }

  const archivedOrders = useMemo(() => orders.filter(isArchived), [orders])
  const archivedBookings = useMemo(
    // A shoot archived WITH its order is restored by restoring the order, so it
    // isn't listed twice — only order-less shoots get their own row.
    () => bookings.filter((b) => isArchived(b) && !archivedOrders.some((o) => o.setId === b.id)),
    [bookings, archivedOrders],
  )
  const archivedItems = useMemo(() => inventory.filter(isArchived), [inventory])
  const archivedUnits = useMemo(
    () =>
      inventory
        .filter((i) => !isArchived(i))
        .flatMap((item) =>
          (item.units || []).filter(isArchived).map((unit) => ({ item, unit })),
        ),
    [inventory],
  )
  const archivedPeople = useMemo(() => people.filter(isArchived), [people])
  const archivedCompanies = useMemo(() => companies.filter(isArchived), [companies])
  const archivedKits = useMemo(() => kits.filter(isArchived), [kits])
  const archivedLists = useMemo(() => scenarios.filter(isArchived), [scenarios])
  const archivedTypes = useMemo(() => companyTypes.filter(isArchived), [companyTypes])
  const archivedAddons = useMemo(
    () =>
      orders
        .filter((o) => !isArchived(o))
        .flatMap((order) =>
          (order.addons || []).filter(isArchived).map((addon) => ({ order, addon })),
        ),
    [orders],
  )

  const total =
    archivedOrders.length +
    archivedBookings.length +
    archivedItems.length +
    archivedUnits.length +
    archivedPeople.length +
    archivedCompanies.length +
    archivedKits.length +
    archivedLists.length +
    archivedTypes.length +
    archivedAddons.length

  const mayRestore = can(CAP.INVENTORY_EDIT)

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold text-slate-900">Archive</h2>
          <p className="mt-1 text-sm text-slate-500">
            {total === 0
              ? 'Nothing archived. Anything you take out of circulation lands here.'
              : `${total} archived record${total === 1 ? '' : 's'} · kept in full, restorable at any time`}
          </p>
        </div>
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-sm font-medium text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle size={14} className="mt-0.5 shrink-0" />
          {error}
        </div>
      )}
      {note && (
        <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800 ring-1 ring-emerald-200">
          {note}
        </div>
      )}

      <div className="min-h-0 flex-1 space-y-4 overflow-auto pb-4">
        {total === 0 && (
          <div className="grid place-items-center rounded-xl border border-dashed border-slate-300 bg-white py-16 text-center">
            <ArchiveIcon size={28} className="text-slate-300" />
            <p className="mt-3 max-w-sm text-sm text-slate-500">
              Deleting is off by design: archiving an order, a shoot, a person, a company or a piece
              of gear keeps every row and every link in the database. This screen is where it waits.
            </p>
          </div>
        )}

        <Section
          title="Orders"
          hint="restoring re-checks what gear is still free"
          rows={archivedOrders.map((o) => (
            <Row
              key={o.id}
              icon={ClipboardList}
              title={o.jobName || o.number}
              meta={[o.number, o.studioId ? studioLabel(o.studioId) : null, o.startsOn]
                .filter(Boolean)
                .join(' · ')}
              at={o.archivedAt}
              by={o.archivedByName}
              canRestore={mayRestore}
              busy={busy === `order:${o.id}`}
              onRestore={run(`order:${o.id}`, () => restoreOrder(o.id))}
              onOpen={() => openOrder(o.id, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          title="Shoots"
          hint="order-less bookings"
          rows={archivedBookings.map((b) => (
            <Row
              key={b.id}
              icon={CalendarRange}
              title={b.title}
              meta={[b.date, b.studioId ? studioLabel(b.studioId) : null]
                .filter(Boolean)
                .join(' · ')}
              at={b.archivedAt}
              canRestore={mayRestore}
              busy={busy === `booking:${b.id}`}
              onRestore={run(`booking:${b.id}`, () => restoreBooking(b.id))}
            />
          ))}
        />

        <Section
          title="Inventory items"
          hint="their copies come back with them"
          rows={archivedItems.map((i) => (
            <Row
              key={i.id}
              icon={Boxes}
              title={i.name}
              meta={[i.category, `${(i.units || []).length || i.quantity || 0} on the register`]
                .filter(Boolean)
                .join(' · ')}
              at={i.archivedAt}
              canRestore={mayRestore}
              busy={busy === `item:${i.id}`}
              onRestore={run(`item:${i.id}`, () => restoreInventoryItem(i.id))}
              onOpen={() => focusInventory({ itemId: i.id }, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          title="Written-off units"
          hint="their barcodes stay taken"
          rows={archivedUnits.map(({ item, unit }) => (
            <Row
              key={unit.id}
              icon={ScanLine}
              title={`#${unit.barcode} · ${item.name}`}
              meta={unit.serial}
              at={unit.archivedAt}
              canRestore={mayRestore}
              busy={busy === `unit:${unit.id}`}
              onRestore={run(`unit:${unit.id}`, () => restoreUnit(item.id, unit.id))}
              onOpen={() => focusInventory({ itemId: item.id }, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          title="People"
          hint="their job history was never touched"
          rows={archivedPeople.map((p) => (
            <Row
              key={p.id}
              icon={UserRound}
              title={p.name}
              meta={[p.category, p.companyName, p.jobs?.length ? `${p.jobs.length} job(s)` : null]
                .filter(Boolean)
                .join(' · ')}
              at={p.archivedAt}
              canRestore={mayRestore}
              busy={busy === `person:${p.id}`}
              onRestore={run(`person:${p.id}`, () => restoreRecord('person', p.id))}
              onOpen={() => focusPeople({ personId: p.id }, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          icon={Building2}
          title="Companies"
          hint="people and orders stayed attached"
          rows={archivedCompanies.map((c) => (
            <Row
              key={c.id}
              icon={Building2}
              title={c.name}
              meta={c.companyType}
              at={c.archivedAt}
              canRestore={mayRestore}
              busy={busy === `company:${c.id}`}
              onRestore={run(`company:${c.id}`, () => restoreRecord('company', c.id))}
              onOpen={() => focusPeople({ companyId: c.id }, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          title="Kits"
          rows={archivedKits.map((k) => (
            <Row
              key={k.id}
              icon={Layers}
              title={k.name}
              meta={[k.category, `${(k.slots || []).length} slot(s)`].filter(Boolean).join(' · ')}
              at={k.archivedAt}
              canRestore={mayRestore}
              busy={busy === `kit:${k.id}`}
              onRestore={run(`kit:${k.id}`, () => restoreRecord('kit', k.id))}
              onOpen={() => focusInventory({ kitId: k.id }, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          title="Scenario lists"
          rows={archivedLists.map((l) => (
            <Row
              key={l.id}
              icon={ClipboardList}
              title={l.name}
              meta={[l.category, `${(l.entries || []).length} line(s)`].filter(Boolean).join(' · ')}
              at={l.archivedAt}
              canRestore={mayRestore}
              busy={busy === `scenario:${l.id}`}
              onRestore={run(`scenario:${l.id}`, () => restoreRecord('scenario', l.id))}
              onOpen={() => focusInventory({ listId: l.id }, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          title="Add-on lists"
          rows={archivedAddons.map(({ order, addon }) => (
            <Row
              key={addon.id}
              icon={Package}
              title={addon.label || 'Add-on'}
              meta={`on ${order.jobName || order.number} · ${(addon.lines || []).length} line(s)`}
              at={addon.archivedAt}
              canRestore={mayRestore}
              busy={busy === `addon:${addon.id}`}
              onRestore={run(`addon:${addon.id}`, () => restoreAddon(order.id, addon.id))}
              onOpen={() => openOrder(order.id, { view: 'archive', label: 'Archive' })}
            />
          ))}
        />

        <Section
          title="Company types"
          hint="companies kept the label"
          rows={archivedTypes.map((t) => (
            <Row
              key={t.id}
              icon={Tag}
              title={t.name}
              at={t.archivedAt}
              canRestore={mayRestore}
              busy={busy === `type:${t.id}`}
              onRestore={run(`type:${t.id}`, () => restoreRecord('companyType', t.id))}
            />
          ))}
        />
      </div>
    </div>
  )
}
