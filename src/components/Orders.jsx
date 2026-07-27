import { useMemo, useState } from 'react'
import {
  Search,
  Plus,
  ClipboardList,
  ChevronLeft,
  Pencil,
  X,
  Camera,
  CalendarRange,
  Package,
  Building2,
  UserRound,
  Clock3,
  FileDown,
  Boxes,
} from 'lucide-react'
import { useStore } from '../store'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import { studioLabel } from '../data/studios'
import OrderEditorModal from './OrderEditorModal'
import OrderEquipmentModal from './OrderEquipmentModal'
import { buildEstimate, money } from '../lib/estimate'
import { downloadEstimatePdf } from '../lib/estimatePdf'

// Orders / Estimates (epic #5, 5.1 + 5.2).
//
// An Order is the equipment list for a Set — not an e-commerce order. It carries
// the studio, working dates, job name and photographer, plus the hand-typed
// accounting PO, and starts life on HOLD (yellow) before being CONFIRMED (green).
//
// Delivered here: the creation form (5.1), the PO field and created-by/date
// (5.2), job search across PO / job name / dates / photographer, and the status
// pill. Equipment entry with the zero-availability block, sub-rental marking and
// the costed estimate are the later sub-items of this epic — the detail pane
// shows what an order already carries and says so.

const STATUS = {
  hold: { label: 'Hold', pill: 'bg-amber-100 text-amber-800 ring-amber-200', dot: 'bg-amber-400' },
  confirmed: {
    label: 'Confirmed',
    pill: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500',
  },
  fulfilled: {
    label: 'Fulfilled',
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
  },
  draft: { label: 'Draft', pill: 'bg-slate-100 text-slate-500 ring-slate-200', dot: 'bg-slate-300' },
  canceled: { label: 'Canceled', pill: 'bg-rose-100 text-rose-700 ring-rose-200', dot: 'bg-rose-400' },
}

function StatusPill({ status }) {
  const s = STATUS[status] ?? STATUS.draft
  return (
    <span
      className={[
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1',
        s.pill,
      ].join(' ')}
    >
      <span className={['h-1.5 w-1.5 rounded-full', s.dot].join(' ')} />
      {s.label}
    </span>
  )
}

function Highlight({ text, query }) {
  if (!query || !text) return text ?? null
  const i = text.toLowerCase().indexOf(query)
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-100 px-0.5 text-inherit">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  )
}

const dateRange = (from, to) => (!to || to === from ? from : `${from} → ${to}`)

export default function Orders() {
  const orders = useStore((s) => s.orders)
  const studios = useStore((s) => s.studios)
  const photographers = useStore((s) => s.photographers)
  const people = useStore((s) => s.people)
  const inventory = useStore((s) => s.inventory)
  const kits = useStore((s) => s.kits)
  const scenarios = useStore((s) => s.scenarios)
  const bookings = useStore((s) => s.bookings)
  const setOrderLines = useStore((s) => s.setOrderLines)
  const createOrder = useStore((s) => s.createOrder)
  const updateOrder = useStore((s) => s.updateOrder)
  const deleteOrder = useStore((s) => s.deleteOrder)
  const can = useCan()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  const [selectedId, setSelectedId] = useState(() => orders[0]?.id ?? null)
  const [editor, setEditor] = useState({ open: false, order: null })
  const [eqEditor, setEqEditor] = useState({ open: false, order: null })
  const [showDetailMobile, setShowDetailMobile] = useState(false)

  const query = search.trim().toLowerCase()

  // Photographer suggestions: the People database first (epic #4), falling back
  // to the flat contact list.
  const photographerNames = useMemo(() => {
    const fromPeople = people
      .filter((p) => p.subcategory === 'Photographer')
      .map((p) => p.name)
    return [...new Set([...fromPeople, ...photographers])]
  }, [people, photographers])

  // Job search: PO, job name, dates, photographer (5.1).
  const filtered = useMemo(
    () =>
      orders.filter((o) => {
        if (status !== 'All' && o.status !== status) return false
        if (query === '') return true
        return [o.poNumber, o.jobName, o.setTitle, o.photographer, o.number, o.startsOn, o.endsOn]
          .filter(Boolean)
          .some((v) => String(v).toLowerCase().includes(query))
      }),
    [orders, status, query],
  )

  const selected = orders.find((o) => o.id === selectedId) ?? null

  const statuses = useMemo(() => [...new Set(orders.map((o) => o.status))], [orders])

  const holdCount = orders.filter((o) => o.status === 'hold').length

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Orders</h2>
          <p className="text-sm text-slate-500">
            {orders.length} orders
            {holdCount > 0 && ` · ${holdCount} on hold`}
          </p>
        </div>
        {can(CAP.ORDER_MANAGE) && (
          <button
            type="button"
            onClick={() => setEditor({ open: true, order: null })}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
          >
            <Plus size={16} />
            New order
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* List pane */}
        <div
          className={[
            showDetailMobile ? 'hidden lg:flex' : 'flex',
            'w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:w-96',
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
                placeholder="Search PO, job, date or photographer…"
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
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
            >
              <option value="All">All statuses</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {STATUS[s]?.label ?? s}
                </option>
              ))}
            </select>
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-slate-400">
                {query || status !== 'All' ? 'No orders match.' : 'No orders yet.'}
              </p>
            ) : (
              <ul className="space-y-0.5">
                {filtered.map((o) => {
                  const active = o.id === selectedId
                  return (
                    <li key={o.id}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedId(o.id)
                          setShowDetailMobile(true)
                        }}
                        className={[
                          'w-full rounded-lg px-2.5 py-2.5 text-left transition',
                          active ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50',
                        ].join(' ')}
                      >
                        <div className="flex items-center gap-2">
                          <span
                            className={[
                              'min-w-0 flex-1 truncate text-sm font-medium',
                              active ? 'text-violet-900' : 'text-slate-800',
                            ].join(' ')}
                          >
                            <Highlight text={o.jobName ?? o.setTitle ?? 'Untitled job'} query={query} />
                          </span>
                          <StatusPill status={o.status} />
                        </div>
                        <div className="mt-0.5 flex items-center gap-2 text-xs text-slate-400">
                          {o.poNumber && (
                            <span className="font-mono">
                              <Highlight text={o.poNumber} query={query} />
                            </span>
                          )}
                          <span className="truncate">
                            {[
                              o.studioId ? studioLabel(o.studioId) : null,
                              o.startsOn ? dateRange(o.startsOn, o.endsOn) : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </span>
                        </div>
                      </button>
                    </li>
                  )
                })}
              </ul>
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
                Back to orders
              </button>
              <OrderDetail
                order={selected}
                estimate={buildEstimate(selected, {
                  inventory,
                  kits,
                  booking: bookings.find((b) => b.id === selected.setId) ?? null,
                })}
                canManage={can(CAP.ORDER_MANAGE)}
                onEdit={() => setEditor({ open: true, order: selected })}
                onEditEquipment={() => setEqEditor({ open: true, order: selected })}
                onDownloadPdf={() =>
                  downloadEstimatePdf(selected, {
                    inventory,
                    kits,
                    booking: bookings.find((b) => b.id === selected.setId) ?? null,
                  })
                }
              />
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center text-center">
              <ClipboardList size={36} className="mb-3 text-slate-300" />
              <p className="text-sm text-slate-400">Select an order to see its estimate.</p>
            </div>
          )}
        </div>
      </div>

      <OrderEditorModal
        open={editor.open}
        order={editor.order}
        studios={studios}
        photographers={photographerNames}
        onClose={() => setEditor({ open: false, order: null })}
        onCreate={async (payload) => {
          const res = await createOrder(payload)
          if (res?.id) setSelectedId(res.id)
          return res
        }}
        onSave={(id, payload) => updateOrder(id, payload)}
        onDelete={(id) => {
          deleteOrder(id)
          setSelectedId((cur) => (cur === id ? null : cur))
        }}
      />

      <OrderEquipmentModal
        open={eqEditor.open}
        order={eqEditor.order}
        inventory={inventory}
        kits={kits}
        scenarios={scenarios}
        onClose={() => setEqEditor({ open: false, order: null })}
        onSave={(id, lines) => setOrderLines(id, lines)}
      />
    </div>
  )
}

function Row({ icon: Icon, label, children }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <Icon size={14} className="mt-0.5 shrink-0 text-slate-400" />
      <span className="w-28 shrink-0 text-slate-400">{label}</span>
      <span className="min-w-0 flex-1 text-slate-800">{children}</span>
    </div>
  )
}

function OrderDetail({ order, estimate, canManage, onEdit, onEditEquipment, onDownloadPdf }) {
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-slate-900">
              {order.jobName ?? order.setTitle ?? 'Untitled job'}
            </h3>
            <StatusPill status={order.status} />
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {order.poNumber ? (
              <span className="font-mono text-xs">PO {order.poNumber}</span>
            ) : (
              <span className="text-xs text-amber-600">no PO yet</span>
            )}
            {order.number && <span className="font-mono text-xs text-slate-400">{order.number}</span>}
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-600"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        <section className="space-y-1.5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            The job
          </h4>
          <Row icon={CalendarRange} label="Working dates">
            {order.startsOn ? dateRange(order.startsOn, order.endsOn) : '—'}
          </Row>
          <Row icon={Building2} label="Studio">
            {order.studioId ? studioLabel(order.studioId) : '—'}
          </Row>
          <Row icon={Camera} label="Photographer">
            {order.photographer || <span className="text-slate-400">not assigned</span>}
          </Row>
          {order.companyName && (
            <Row icon={Building2} label="Company">
              {order.companyName}
            </Row>
          )}
        </section>

        {/* 5.2 — who raised it and when */}
        <section className="space-y-1.5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Raised by
          </h4>
          <Row icon={UserRound} label="Created by">
            {order.createdBy || <span className="text-slate-400">unknown</span>}
          </Row>
          <Row icon={Clock3} label="Created">
            {order.createdAt ? String(order.createdAt).slice(0, 10) : '—'}
          </Row>
        </section>

        {/* 5.3 equipment + 5.4 estimate */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Equipment
              {estimate.lineCount > 0 && ` · ${estimate.pieces} pcs`}
            </h4>
            {canManage && (
              <button
                type="button"
                onClick={onEditEquipment}
                className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
              >
                <Boxes size={13} />
                Edit equipment
              </button>
            )}
          </div>

          {estimate.groups.length > 0 ? (
            <div className="space-y-3">
              {estimate.groups.map((g) => (
                <div key={g.kitId ?? 'items'}>
                  <div className="mb-1 flex items-center gap-2 px-1">
                    <span
                      className={[
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        g.type === 'kit'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-200 text-slate-600',
                      ].join(' ')}
                    >
                      {g.type === 'kit' ? g.name : 'A-la-carte'}
                    </span>
                    <span className="ml-auto text-xs text-slate-400">
                      {g.pieces} pcs · {money(g.subtotal)}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {g.lines.map((l, i) => (
                      <li
                        key={`${l.itemId}-${i}`}
                        className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                      >
                        <Package size={14} className="shrink-0 text-slate-400" />
                        <span className="min-w-0 flex-1 truncate text-sm text-slate-800">
                          {l.itemName}
                          {l.slotLabel && (
                            <span className="ml-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                              {l.slotLabel}
                            </span>
                          )}
                        </span>
                        {l.barcode && (
                          <span className="shrink-0 font-mono text-[11px] text-slate-400">
                            #{l.barcode}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-slate-500">×{l.quantity}</span>
                        <span className="w-20 shrink-0 text-right text-xs text-slate-500">
                          {l.dayRate == null ? 'no rate' : `${money(l.dayRate)}/day`}
                        </span>
                        <span className="w-20 shrink-0 text-right text-sm font-medium text-slate-800">
                          {l.dayRate == null ? '—' : money(l.lineTotal)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              Nothing added yet — use “Edit equipment” to assign items, kits or a scenario list.
            </p>
          )}
        </section>

        {/* 5.4 — estimate totals + PDF */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Estimate
              </div>
              <div className="mt-1 text-xs text-slate-500">
                {estimate.lineCount} lines · {estimate.pieces} pieces · {estimate.days} billable
                day(s)
              </div>
              {estimate.unratedCount > 0 && (
                <div className="mt-1 text-xs text-amber-600">
                  {estimate.unratedCount} line(s) have no day rate and sit outside the total
                </div>
              )}
            </div>
            <div className="text-right">
              <div className="text-lg font-semibold text-slate-900">{money(estimate.total)}</div>
              <div className="text-[11px] text-slate-400">equipment only</div>
            </div>
          </div>
          <button
            type="button"
            onClick={onDownloadPdf}
            className="mt-3 inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
          >
            <FileDown size={15} />
            Download estimate PDF
          </button>
        </section>
      </div>
    </>
  )
}
