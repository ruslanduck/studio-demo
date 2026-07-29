import { useEffect, useMemo } from 'react'
import {
  X,
  ArrowLeft,
  ExternalLink,
  Package,
  Boxes,
  ClipboardList,
  Briefcase,
  Building2,
  User,
  Wrench,
  Truck,
  Mail,
  Phone,
  Globe,
  MapPin,
  Clock,
  Camera,
} from 'lucide-react'
import { useStore } from '../store'
import { studioLabel } from '../data/studios'
import { orderStatusMeta } from '../data/orderStatus'
import { buildEstimate, money } from '../lib/estimate'
import { itemCount, kindLabel } from '../data/inventory'
import { availableCount } from '../lib/availability'
import ActivityList from './ActivityList'
import { useActivity } from '../lib/useActivity'
import { orderFeed } from '../lib/activity'

// Layered detail cards ("peeks").
//
// Related data is clickable EVERYWHERE, and rather than throwing you onto another
// screen it opens a card over the one you're on. Peeks stack: order → its gear →
// that unit's job → the model on it, each a step you can unwind. That's why these
// cards are read-only — they're for following the thread. Every one carries
// "Open full view", which hands off to the real screen (with its editing tools)
// and closes the stack.
//
// Cards are purpose-built rather than the view components reused: those own edit
// state, modals and permissions, and dragging them in here would nest dialogs
// inside dialogs.

export default function PeekPanel() {
  const stack = useStore((s) => s.peekStack)
  const peekBack = useStore((s) => s.peekBack)
  const peekClose = useStore((s) => s.peekClose)

  const depth = stack.length
  const current = depth ? stack[depth - 1] : null

  // Escape unwinds one level, matching the back arrow.
  useEffect(() => {
    if (!depth) return
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        peekBack()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [depth, peekBack])

  if (!current) return null

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div
        className="absolute inset-0 bg-slate-900/30 backdrop-blur-[2px]"
        onClick={peekClose}
        aria-hidden="true"
      />
      <aside className="relative z-10 flex h-full w-full max-w-xl flex-col border-l border-slate-200 bg-white shadow-2xl">
        <PeekHeader stack={stack} onBack={peekBack} onClose={peekClose} />
        <div className="min-h-0 flex-1 overflow-auto">
          <PeekBody target={current} />
        </div>
      </aside>
    </div>
  )
}

/* --------------------------------- header --------------------------------- */

const TYPE_META = {
  order: { icon: ClipboardList, label: 'Order' },
  item: { icon: Boxes, label: 'Inventory item' },
  person: { icon: User, label: 'Person' },
  company: { icon: Building2, label: 'Company' },
  job: { icon: Briefcase, label: 'Job' },
}

function PeekHeader({ stack, onBack, onClose }) {
  const depth = stack.length
  const current = stack[depth - 1]
  const Icon = TYPE_META[current.type]?.icon ?? Package
  return (
    <div className="shrink-0 border-b border-slate-200 px-4 py-3">
      <div className="flex items-center gap-2">
        {depth > 1 ? (
          <button
            type="button"
            onClick={onBack}
            title="Back one card"
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-sm font-medium text-violet-600 transition hover:bg-violet-50"
          >
            <ArrowLeft size={15} />
            Back
          </button>
        ) : (
          <span className="inline-flex items-center gap-1.5 px-1 text-xs font-semibold uppercase tracking-wider text-slate-400">
            <Icon size={14} />
            {TYPE_META[current.type]?.label ?? 'Detail'}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {/* Depth dots: how far down the thread you are. */}
          {depth > 1 && (
            <span className="mr-1 text-[11px] font-medium text-slate-400">
              {depth} deep
            </span>
          )}
          <button
            type="button"
            onClick={onClose}
            title="Close all cards"
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </span>
      </div>
    </div>
  )
}

/* ------------------------------ shared bits ------------------------------- */

// A clickable row that opens another peek — the whole point of the panel.
function LinkRow({ icon: Icon = Package, title, sub, right, onClick, tint }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition',
        tint || 'border-slate-200 hover:border-violet-300 hover:bg-violet-50/40',
      ].join(' ')}
    >
      <Icon size={14} className="shrink-0 text-slate-400" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-slate-800">{title}</span>
        {sub && <span className="block truncate text-xs text-slate-400">{sub}</span>}
      </span>
      {right}
    </button>
  )
}

function Section({ title, count, children, hint }) {
  return (
    <section className="px-4 py-3">
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
        {title}
        {count != null && count > 0 && ` (${count})`}
      </h4>
      {hint && <p className="mb-2 text-xs text-slate-400">{hint}</p>}
      {children}
    </section>
  )
}

function Field({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      {Icon && <Icon size={14} className="mt-0.5 shrink-0 text-slate-400" />}
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-slate-700">{children}</span>
    </div>
  )
}

function StatusPill({ status }) {
  const st = orderStatusMeta(status)
  return (
    <span
      className={['shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1', st.pill].join(
        ' ',
      )}
    >
      {st.label}
    </span>
  )
}

function Empty({ text }) {
  return <p className="text-sm text-slate-400">{text}</p>
}

// Title block + the hand-off to the real screen.
function PeekTitle({ icon: Icon, title, badges, onOpenFull, openLabel = 'Open full view' }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          {Icon && <Icon size={17} className="shrink-0 text-violet-500" />}
          <h3 className="truncate text-base font-semibold text-slate-900">{title}</h3>
        </div>
        {badges && <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">{badges}</div>}
      </div>
      {onOpenFull && (
        <button
          type="button"
          onClick={onOpenFull}
          title="Leave the cards and open this on its own screen"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-600"
        >
          <ExternalLink size={13} />
          {openLabel}
        </button>
      )}
    </div>
  )
}

/* --------------------------------- router --------------------------------- */

function PeekBody({ target }) {
  if (target.type === 'order') return <OrderPeek id={target.id} />
  if (target.type === 'item') return <ItemPeek id={target.id} unitId={target.unitId} />
  if (target.type === 'person') return <PersonPeek id={target.id} />
  if (target.type === 'company') return <CompanyPeek id={target.id} />
  if (target.type === 'job') return <JobPeek id={target.id} />
  return <div className="p-4"><Empty text="Nothing to show." /></div>
}

/* ---------------------------------- order --------------------------------- */

function OrderPeek({ id }) {
  const orders = useStore((s) => s.orders)
  const inventory = useStore((s) => s.inventory)
  const kits = useStore((s) => s.kits)
  const bookings = useStore((s) => s.bookings)
  const people = useStore((s) => s.people)
  const peek = useStore((s) => s.peek)
  const openOrder = useStore((s) => s.openOrder)

  const order = orders.find((o) => o.id === id) ?? null
  const booking = order?.setId ? bookings.find((b) => b.id === order.setId) : null
  const estimate = useMemo(
    () => (order ? buildEstimate(order, { inventory, kits, booking }) : null),
    [order, inventory, kits, booking],
  )
  if (!order) return <div className="p-4"><Empty text="This order is gone." /></div>

  const photographer = order.photographer
    ? people.find((p) => p.name === order.photographer)
    : null
  const company = order.companyId

  return (
    <>
      <PeekTitle
        icon={ClipboardList}
        title={order.jobName || 'Order'}
        badges={
          <>
            <StatusPill status={order.status} />
            <span className="font-mono text-xs text-slate-500">
              {order.poNumber ? `PO ${order.poNumber}` : order.number}
            </span>
          </>
        }
        onOpenFull={() => openOrder(order.id)}
      />

      <Section title="The job">
        <div className="space-y-1.5">
          <Field label="Working dates">
            {order.startsOn === order.endsOn
              ? order.startsOn
              : `${order.startsOn} → ${order.endsOn}`}
          </Field>
          <Field label="Studio">{order.studioId ? studioLabel(order.studioId) : '—'}</Field>
          <Field label="Photographer">
            {order.photographer ? (
              photographer ? (
                <button
                  type="button"
                  onClick={() => peek({ type: 'person', id: photographer.id })}
                  className="text-violet-600 underline decoration-violet-300 underline-offset-2 hover:text-violet-800"
                >
                  {order.photographer}
                </button>
              ) : (
                order.photographer
              )
            ) : (
              <span className="text-slate-400">not assigned</span>
            )}
          </Field>
          <Field label="Company">
            {company ? (
              <button
                type="button"
                onClick={() => peek({ type: 'company', id: company })}
                className="text-violet-600 underline decoration-violet-300 underline-offset-2 hover:text-violet-800"
              >
                {order.companyName}
              </button>
            ) : (
              <span className="text-slate-400">—</span>
            )}
          </Field>
          {booking && (
            <Field label="Shoot">
              <button
                type="button"
                onClick={() => peek({ type: 'job', id: booking.id })}
                className="text-violet-600 underline decoration-violet-300 underline-offset-2 hover:text-violet-800"
              >
                {booking.title} · {booking.startTime}–{booking.endTime}
              </button>
            </Field>
          )}
        </div>
      </Section>

      <Section
        title={`Equipment · ${estimate.pieces} pcs`}
        hint="Open a line to see that item's units and history."
      >
        {estimate.groups.length === 0 ? (
          <Empty text="Nothing added yet." />
        ) : (
          <div className="space-y-3">
            {estimate.groups.map((g) => (
              <div key={g.kitId ?? 'items'}>
                <div className="mb-1 px-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                  {g.type === 'kit' ? g.name : 'A-la-carte'}
                </div>
                <div className="space-y-1.5">
                  {g.lines.map((l, i) => (
                    <LinkRow
                      key={`${l.itemId}-${i}`}
                      title={l.itemName}
                      sub={[
                        l.slotLabel,
                        l.barcode ? `#${l.barcode}` : null,
                        l.source === 'sub_rental'
                          ? `sub-rental${l.vendorName ? ` · ${l.vendorName}` : ''}`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                      right={
                        <span className="shrink-0 text-xs text-slate-500">×{l.quantity}</span>
                      }
                      onClick={() =>
                        l.itemId && peek({ type: 'item', id: l.itemId, unitId: l.unitId })
                      }
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Estimate">
        <div className="flex items-end justify-between rounded-lg bg-slate-50 px-3 py-2.5 ring-1 ring-slate-200">
          <div className="text-xs text-slate-500">
            {estimate.lineCount} lines · {estimate.pieces} pieces · {estimate.days} day(s)
          </div>
          <div className="text-base font-semibold text-slate-900">{money(estimate.total)}</div>
        </div>
      </Section>

      <OrderActivity orderId={order.id} eqBy={order.eqUpdatedBy} eqAt={order.eqUpdatedAt} />
    </>
  )
}

// Who last touched the gear + the recent trail, on the layered card too.
function OrderActivity({ orderId, eqBy, eqAt }) {
  const { events, loading } = useActivity({ orderId })
  return (
    <Section title="Activity">
      <p className="mb-2 text-xs text-slate-400">
        {eqBy ? (
          <>
            Equipment last changed by <span className="font-medium text-slate-600">{eqBy}</span>
            {eqAt ? ` · ${new Date(eqAt).toLocaleString()}` : ''}
          </>
        ) : (
          'No equipment change recorded yet.'
        )}
      </p>
      <ActivityList
        events={orderFeed(events)}
        loading={loading}
        limit={5}
        dense
        emptyText="No changes recorded yet."
      />
    </Section>
  )
}

/* ---------------------------------- item ---------------------------------- */

function ItemPeek({ id, unitId }) {
  const inventory = useStore((s) => s.inventory)
  const bookings = useStore((s) => s.bookings)
  const orders = useStore((s) => s.orders)
  const companies = useStore((s) => s.companies)
  const peek = useStore((s) => s.peek)
  const focusInventory = useStore((s) => s.focusInventory)

  const item = inventory.find((i) => i.id === id) ?? null
  if (!item) return <div className="p-4"><Empty text="This item is gone." /></div>

  const isBarcoded = item.kind === 'barcoded'
  const available = availableCount(item)
  const inRepair = (item.units || []).filter((u) => u.status === 'in_repair').length
  // Which job holds a unit → so a unit row can lead to that job.
  const bookingForUnit = (uid) => bookings.find((b) => (b.unitIds || []).includes(uid)) ?? null
  const vendorName = (cid) => companies.find((c) => c.id === cid)?.name ?? null
  const usedByOrders = orders.filter((o) => (o.lines || []).some((l) => l.itemId === item.id))

  return (
    <>
      <PeekTitle
        icon={Boxes}
        title={item.name}
        badges={
          <>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {item.category}
            </span>
            <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
              {kindLabel(item.kind)}
            </span>
            {isBarcoded ? (
              <span className="text-xs text-slate-500">
                {item.units.length} units · <span className="text-emerald-600">{available} free</span>
                {inRepair > 0 && <span className="text-amber-600"> · {inRepair} in repair</span>}
              </span>
            ) : (
              <span className="text-xs text-slate-500">{itemCount(item)} on hand</span>
            )}
          </>
        }
        onOpenFull={() => focusInventory({ itemId: item.id, unitId })}
      />

      {(item.brand || item.placement || item.dayRate != null) && (
        <Section title="Details">
          <div className="space-y-1.5">
            {item.brand && <Field label="Brand">{item.brand}</Field>}
            {item.assetType && <Field label="Asset type">{item.assetType}</Field>}
            {item.placement && <Field label="Storage location">{item.placement}</Field>}
            {item.dayRate != null && <Field label="Day rate">{money(item.dayRate)}/day</Field>}
          </div>
        </Section>
      )}

      {isBarcoded && (
        <Section
          title="Units"
          count={item.units.length}
          hint="Open a unit that's out to jump to the job holding it."
        >
          <div className="space-y-1.5">
            {item.units.map((u) => {
              const b = bookingForUnit(u.id)
              const highlight = unitId && (u.id === unitId || u.barcode === unitId)
              return (
                <LinkRow
                  key={u.id}
                  icon={u.status === 'in_repair' ? Wrench : Package}
                  title={`#${u.barcode}`}
                  sub={[
                    u.serial,
                    u.ownership === 'sub_rental'
                      ? `sub-rental${vendorName(u.subRentalVendorId) ? ` · ${vendorName(u.subRentalVendorId)}` : ''}`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={
                    <span
                      className={[
                        'shrink-0 text-xs',
                        u.status === 'available'
                          ? 'text-emerald-600'
                          : u.status === 'in_repair'
                            ? 'text-amber-600'
                            : 'text-orange-600',
                      ].join(' ')}
                    >
                      {u.status === 'available' ? 'Available' : u.location}
                    </span>
                  }
                  tint={
                    highlight
                      ? 'border-violet-300 bg-violet-50/60 hover:bg-violet-50'
                      : undefined
                  }
                  onClick={() =>
                    b ? peek({ type: 'job', id: b.id }) : focusInventory({ itemId: item.id, unitId: u.id })
                  }
                />
              )
            })}
          </div>
        </Section>
      )}

      <ItemActivitySection itemId={item.id} unitIds={(item.units || []).map((u) => u.id)} />

      <Section title="On orders" count={usedByOrders.length}>
        {usedByOrders.length === 0 ? (
          <Empty text="Not on any order." />
        ) : (
          <div className="space-y-1.5">
            {usedByOrders.map((o) => (
              <LinkRow
                key={o.id}
                icon={ClipboardList}
                title={o.jobName || o.number}
                sub={[o.startsOn, o.studioId ? studioLabel(o.studioId) : null]
                  .filter(Boolean)
                  .join(' · ')}
                right={<StatusPill status={o.status} />}
                onClick={() => peek({ type: 'order', id: o.id })}
              />
            ))}
          </div>
        )}
      </Section>
    </>
  )
}

function ItemActivitySection({ itemId, unitIds }) {
  const { events, loading } = useActivity({ itemId, unitIds })
  return (
    <Section title="Activity">
      <ActivityList
        events={events}
        loading={loading}
        limit={5}
        dense
        emptyText="No changes recorded for this item yet."
      />
    </Section>
  )
}

/* --------------------------------- person --------------------------------- */

function PersonPeek({ id }) {
  const people = useStore((s) => s.people)
  const orders = useStore((s) => s.orders)
  const peek = useStore((s) => s.peek)
  const focusPeople = useStore((s) => s.focusPeople)

  const person = people.find((p) => p.id === id) ?? null
  if (!person) return <div className="p-4"><Empty text="This person is gone." /></div>

  const orderForSet = (setId) => orders.find((o) => o.setId === setId) ?? null

  return (
    <>
      <PeekTitle
        icon={User}
        title={person.name}
        badges={
          <>
            {person.category && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
                {person.category}
              </span>
            )}
            {person.companyName && (
              <button
                type="button"
                onClick={() => peek({ type: 'company', id: person.companyId })}
                className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 underline decoration-violet-300 underline-offset-2 hover:text-violet-800"
              >
                <Building2 size={12} />
                {person.companyName}
              </button>
            )}
          </>
        }
        onOpenFull={() => focusPeople({ personId: person.id })}
      />

      <Section title="Contact">
        {person.email || person.phone ? (
          <div className="space-y-1.5">
            {person.email && (
              <Field icon={Mail} label="Email">
                <a href={`mailto:${person.email}`} className="text-violet-600 hover:underline">
                  {person.email}
                </a>
              </Field>
            )}
            {person.phone && <Field icon={Phone} label="Phone">{person.phone}</Field>}
          </div>
        ) : (
          <Empty text="No email or phone on file." />
        )}
      </Section>

      <Section
        title="Work history"
        count={person.jobs?.length ?? 0}
        hint="Shoots this person was crewed on."
      >
        {!person.jobs?.length ? (
          <Empty text="No jobs yet." />
        ) : (
          <div className="space-y-1.5">
            {person.jobs.map((j, i) => {
              const o = orderForSet(j.id)
              return (
                <LinkRow
                  key={`${j.id}-${i}`}
                  icon={Briefcase}
                  title={j.title}
                  sub={[
                    j.date,
                    j.studioId ? studioLabel(j.studioId) : null,
                    j.role ? `as ${String(j.role).toLowerCase()}` : null,
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                  right={o ? <StatusPill status={o.status} /> : null}
                  onClick={() => peek({ type: 'job', id: j.id })}
                />
              )
            })}
          </div>
        )}
      </Section>
    </>
  )
}

/* -------------------------------- company --------------------------------- */

function CompanyPeek({ id }) {
  const companies = useStore((s) => s.companies)
  const people = useStore((s) => s.people)
  const orders = useStore((s) => s.orders)
  const inventory = useStore((s) => s.inventory)
  const peek = useStore((s) => s.peek)
  const focusPeople = useStore((s) => s.focusPeople)

  const company = companies.find((c) => c.id === id) ?? null
  if (!company) return <div className="p-4"><Empty text="This company is gone." /></div>

  const staff = people.filter((p) => p.companyId === company.id)
  const companyOrders = orders.filter((o) => o.companyId === company.id)
  const heldGear = inventory
    .map((item) => ({
      itemId: item.id,
      name: item.name,
      count: (item.units || []).filter(
        (u) => u.ownership === 'sub_rental' && u.subRentalVendorId === company.id,
      ).length,
    }))
    .filter((g) => g.count > 0)

  return (
    <>
      <PeekTitle
        icon={Building2}
        title={company.name}
        badges={
          <>
            {company.companyType && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
                {company.companyType}
              </span>
            )}
            <span className="text-xs text-slate-500">
              {staff.length} contact{staff.length === 1 ? '' : 's'}
            </span>
          </>
        }
        onOpenFull={() => focusPeople({ companyId: company.id })}
      />

      {(company.address || company.openingHours || company.website || company.email || company.phone) && (
        <Section title="Details">
          <div className="space-y-1.5">
            {company.address && <Field icon={MapPin} label="Address">{company.address}</Field>}
            {company.openingHours && <Field icon={Clock} label="Hours">{company.openingHours}</Field>}
            {company.website && (
              <Field icon={Globe} label="Website">
                <a
                  href={/^https?:\/\//i.test(company.website) ? company.website : `https://${company.website}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="text-violet-600 hover:underline"
                >
                  {company.website.replace(/^https?:\/\//i, '')}
                </a>
              </Field>
            )}
            {company.email && (
              <Field icon={Mail} label="Email">
                <a href={`mailto:${company.email}`} className="text-violet-600 hover:underline">
                  {company.email}
                </a>
              </Field>
            )}
            {company.phone && <Field icon={Phone} label="Phone">{company.phone}</Field>}
          </div>
        </Section>
      )}

      <Section title="Contacts" count={staff.length}>
        {staff.length === 0 ? (
          <Empty text="No contacts on file." />
        ) : (
          <div className="space-y-1.5">
            {staff.map((p) => (
              <LinkRow
                key={p.id}
                icon={User}
                title={p.name}
                sub={[p.category, p.subcategory].filter(Boolean).join(' · ')}
                onClick={() => peek({ type: 'person', id: p.id })}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Orders" count={companyOrders.length}>
        {companyOrders.length === 0 ? (
          <Empty text="No orders yet." />
        ) : (
          <div className="space-y-1.5">
            {companyOrders.map((o) => (
              <LinkRow
                key={o.id}
                icon={o.kind === 'sub_rental' ? Truck : ClipboardList}
                title={o.jobName || o.number}
                sub={[
                  o.startsOn,
                  o.kind === 'sub_rental' ? 'rented to us' : 'for their job',
                  o.poNumber || null,
                ]
                  .filter(Boolean)
                  .join(' · ')}
                right={<StatusPill status={o.status} />}
                onClick={() => peek({ type: 'order', id: o.id })}
              />
            ))}
          </div>
        )}
      </Section>

      {heldGear.length > 0 && (
        <Section title="Sub-rented from them" count={heldGear.length}>
          <div className="space-y-1.5">
            {heldGear.map((g) => (
              <LinkRow
                key={g.itemId}
                title={g.name}
                right={<span className="shrink-0 text-xs text-slate-500">×{g.count}</span>}
                onClick={() => peek({ type: 'item', id: g.itemId })}
              />
            ))}
          </div>
        </Section>
      )}
    </>
  )
}

/* ----------------------------------- job ---------------------------------- */

function JobPeek({ id }) {
  const bookings = useStore((s) => s.bookings)
  const orders = useStore((s) => s.orders)
  const people = useStore((s) => s.people)
  const inventory = useStore((s) => s.inventory)
  const peek = useStore((s) => s.peek)
  const openCalendarOn = useStore((s) => s.openCalendarOn)

  const booking = bookings.find((b) => b.id === id) ?? null

  // The gear actually on this shoot, grouped by item. Computed BEFORE the early
  // return: a hook after a conditional return changes the hook order between
  // renders (React would mismatch state the moment the booking disappears while
  // the card is open).
  const gear = useMemo(() => {
    const unitIds = booking?.unitIds || []
    if (!unitIds.length) return []
    const byItem = new Map()
    for (const item of inventory)
      for (const u of item.units || [])
        if (unitIds.includes(u.id)) {
          const cur = byItem.get(item.id) || { itemId: item.id, name: item.name, units: [] }
          cur.units.push(u)
          byItem.set(item.id, cur)
        }
    return [...byItem.values()]
  }, [inventory, booking?.unitIds])

  if (!booking) return <div className="p-4"><Empty text="This shoot is gone." /></div>

  const order = orders.find((o) => o.setId === booking.id) ?? null
  // The crew, resolved to real people where we know them (so they're clickable).
  const crew = [
    ['Photographer', booking.photographer],
    ['Model', booking.model],
  ]
    .filter(([, name]) => !!name)
    .map(([role, name]) => ({ role, name, person: people.find((p) => p.name === name) ?? null }))

  return (
    <>
      <PeekTitle
        icon={Briefcase}
        title={booking.title}
        badges={
          <>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
              {booking.date}
            </span>
            <span className="text-xs text-slate-500">
              {studioLabel(booking.studioId)} · {booking.startTime}–{booking.endTime}
            </span>
          </>
        }
        onOpenFull={() => openCalendarOn(booking.date)}
        openLabel="On calendar"
      />

      <Section title="Crew">
        {crew.length === 0 ? (
          <Empty text="Nobody crewed yet." />
        ) : (
          <div className="space-y-1.5">
            {crew.map((c) => (
              <LinkRow
                key={`${c.role}-${c.name}`}
                icon={c.role === 'Photographer' ? Camera : User}
                title={c.name}
                sub={c.role.toLowerCase()}
                onClick={() => c.person && peek({ type: 'person', id: c.person.id })}
              />
            ))}
          </div>
        )}
      </Section>

      <Section title="Order">
        {order ? (
          <LinkRow
            icon={ClipboardList}
            title={order.jobName || order.number}
            sub={[order.poNumber || order.number, `${(order.lines || []).length} lines`]
              .filter(Boolean)
              .join(' · ')}
            right={<StatusPill status={order.status} />}
            onClick={() => peek({ type: 'order', id: order.id })}
          />
        ) : (
          <Empty text="No order on this shoot — nothing is reserved for it." />
        )}
      </Section>

      <Section title="Gear on this shoot" count={gear.length}>
        {gear.length === 0 ? (
          <Empty text="No units reserved." />
        ) : (
          <div className="space-y-1.5">
            {gear.map((g) => (
              <LinkRow
                key={g.itemId}
                title={g.name}
                sub={g.units.map((u) => `#${u.barcode}`).join(' · ')}
                right={<span className="shrink-0 text-xs text-slate-500">×{g.units.length}</span>}
                onClick={() => peek({ type: 'item', id: g.itemId, unitId: g.units[0]?.id })}
              />
            ))}
          </div>
        )}
      </Section>
    </>
  )
}
