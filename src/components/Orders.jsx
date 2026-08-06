import { useEffect, useMemo, useRef, useState } from 'react'
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
  SlidersHorizontal,
  CheckCircle2,
  Undo2,
  Truck,
  Briefcase,
  PackageCheck,
  Layers,
  ScanLine,
  Lock,
} from 'lucide-react'
import { useStore, notArchived, MAX_SETS_PER_DAY } from '../store'
import { usePersisted } from '../lib/usePersisted'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import { studioLabel } from '../data/studios'
import {
  ORDER_STATUS,
  ORDER_FLOW,
  orderStatusMeta,
  CLOSED_STATUS,
  isClosedStatus,
} from '../data/orderStatus'
import {
  searchOrders,
  poCounts,
  photographersIn,
  studiosIn,
  SORTS,
} from '../lib/orderSearch'
import DateField from './DateField'
import OrderEditorModal from './OrderEditorModal'
import ActivityList from './ActivityList'
import { useActivity } from '../lib/useActivity'
import { orderFeed } from '../lib/activity'
import OrderEquipmentModal from './OrderEquipmentModal'
import PackingChecklistModal from './PackingChecklistModal'
import SelectField from './SelectField'
import FilterBar, { FILTER_FIELD } from './FilterBar'
import { buildEstimate, money } from '../lib/estimate'
import { downloadEstimatePdf } from '../lib/estimatePdf'
import { downloadPackingListPdf } from '../lib/packingListPdf'
import { packingProgress, packingRows } from '../lib/packing'
import { expectedUnits, scanProgress, outstandingUnits } from '../lib/scanning'

// Orders / Estimates (epic #5, 5.1 + 5.2).
//
// An Order is the equipment list for a Set — not an e-commerce order. It carries
// the studio, the set date, job name and photographer, plus the hand-typed
// accounting PO, and starts life on HOLD (yellow) before being CONFIRMED (green).
//
// Delivered here: the creation form (5.1), the PO field and created-by/date
// (5.2), job search across PO / job name / dates / photographer, and the status
// pill. Equipment entry with the zero-availability block, sub-rental marking and
// the costed estimate are the later sub-items of this epic — the detail pane
// shows what an order already carries and says so.

function StatusPill({ status }) {
  const s = orderStatusMeta(status)
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
  const companies = useStore((s) => s.companies)
  const setOrderLines = useStore((s) => s.setOrderLines)
  const signPackingLine = useStore((s) => s.signPackingLine)
  const clearPackingSignoff = useStore((s) => s.clearPackingSignoff)
  const createOrder = useStore((s) => s.createOrder)
  const updateOrder = useStore((s) => s.updateOrder)
  const archiveOrder = useStore((s) => s.archiveOrder)
  const orderFocus = useStore((s) => s.orderFocus)
  const clearOrderFocus = useStore((s) => s.clearOrderFocus)
  const orderDraft = useStore((s) => s.orderDraft)
  const clearOrderDraft = useStore((s) => s.clearOrderDraft)
  const can = useCan()

  const [search, setSearch] = usePersisted('orders', 'search', '')
  const [status, setStatus] = usePersisted('orders', 'status', 'All')
  // 5.7 — job search: free text plus explicit photographer / studio / date-range
  // filters and a sort. All matching lives in lib/orderSearch.
  const [photographer, setPhotographer] = usePersisted('orders', 'photographer', 'All')
  const [studioFilter, setStudioFilter] = usePersisted('orders', 'studio', 'All')
  const [from, setFrom] = usePersisted('orders', 'from', '')
  const [to, setTo] = usePersisted('orders', 'to', '')
  const [sort, setSort] = usePersisted('orders', 'sort', 'newest')
  // The order you were reading. Resolved against the LIVE list below, so a
  // stored id whose order is gone falls back to the first row.
  const [selectedId, setSelectedId] = usePersisted('orders', 'selectedId', null)
  const [editor, setEditor] = useState({ open: false, order: null })
  const [eqEditor, setEqEditor] = useState({ open: false, order: null })
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [showDetailMobile, setShowDetailMobile] = useState(false)
  // What the last confirm/hold did to the stock (supabase mode reports it).
  const [reserveNote, setReserveNote] = useState(null)

  // Step one's answers, held until step two creates the order. Nothing is
  // written before that, so backing out of equipment leaves no empty order.
  const [draft, setDraft] = useState(null)
  // Where a just-created order's id is parked. If writing its lines then fails,
  // pressing the button again saves them onto that order instead of creating a
  // second one. A ref, so it doesn't reload the picker and lose the picks.
  const createdDraftId = useRef(null)

  // Opened from the calendar (a shoot IS its order): select that order + show
  // its detail on mobile.
  useEffect(() => {
    if (!orderFocus?.orderId) return
    if (orders.some((o) => o.id === orderFocus.orderId)) {
      setSelectedId(orderFocus.orderId)
      setShowDetailMobile(true)
    }
    clearOrderFocus()
  }, [orderFocus, orders, clearOrderFocus])

  // Step one was answered on the CALENDAR. The order still doesn't exist — the
  // equipment window below creates it, exactly as when the form opens here.
  useEffect(() => {
    if (!orderDraft?.payload) return
    setDraft(orderDraft.payload)
    createdDraftId.current = null
    setEqEditor({ open: true, order: { ...orderDraft.payload, id: null, lines: [] } })
    clearOrderDraft()
  }, [orderDraft, clearOrderDraft])

  // Highlight marks the first search term; matching itself is multi-term (5.7).
  const query = search.trim().toLowerCase().split(/\s+/)[0] ?? ''

  // Photographer suggestions: the People database first (epic #4), falling back
  // to the flat contact list.
  const photographerNames = useMemo(() => {
    const fromPeople = people
      .filter((p) => p.subcategory === 'Photographer')
      .map((p) => p.name)
    return [...new Set([...fromPeople, ...photographers])]
  }, [people, photographers])

  // Archived orders are still LOADED (a peek card, a back-trail or the Archive
  // screen has to be able to open one) — the list and its filters use the live
  // ones. Nothing is deleted any more, so this is the only thing hiding them.
  const liveOrders = useMemo(() => orders.filter(notArchived), [orders])
  const liveCompanies = useMemo(() => (companies || []).filter(notArchived), [companies])

  const filtered = useMemo(
    () =>
      searchOrders(liveOrders, {
        text: search,
        status,
        photographer,
        studio: studioFilter,
        from,
        to,
        sort,
      }),
    [liveOrders, search, status, photographer, studioFilter, from, to, sort],
  )

  // How many orders share each PO — one job's PO covers every order raised
  // against it, so this is the job-history hint on a row.
  const sharedPo = useMemo(() => poCounts(liveOrders), [liveOrders])
  const photographerOptions = useMemo(() => photographersIn(liveOrders), [liveOrders])
  const studioOptions = useMemo(() => studiosIn(liveOrders), [liveOrders])

  const activeFilters =
    (status !== 'All' ? 1 : 0) +
    (photographer !== 'All' ? 1 : 0) +
    (studioFilter !== 'All' ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0)

  function clearAll() {
    setSearch('')
    setStatus('All')
    setPhotographer('All')
    setStudioFilter('All')
    setFrom('')
    setTo('')
  }

  // Live only: an archived order is not viewable anywhere (no Archive screen),
  // so neither a stale selection nor a drill-in may open one.
  // A stored id wins even when a filter hides its row (you chose it); with
  // nothing stored, a first visit lands on the newest order as it always did.
  const selected = liveOrders.find((o) => o.id === selectedId) ?? liveOrders[0] ?? null

  // Built once and shared by the detail card, the estimate/packing PDFs and the
  // digital checklist so they all read the same grouped lines.
  const selectedBooking = useMemo(
    () => bookings.find((b) => b.id === selected?.setId) ?? null,
    [bookings, selected],
  )
  const selectedEstimate = useMemo(
    () => (selected ? buildEstimate(selected, { inventory, kits, booking: selectedBooking }) : null),
    [selected, inventory, kits, selectedBooking],
  )

  // Live add-on objects for the equipment editor / checklist (re-derived so they
  // reflect store edits). The add-on is fed to the reused modals as an
  // "order-like" object carrying the parent's dates for the estimate footer.

  const statuses = useMemo(() => [...new Set(liveOrders.map((o) => o.status))], [liveOrders])

  const holdCount = orders.filter((o) => o.status === 'hold').length

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Orders</h2>
          <p className="text-sm text-slate-500">
            {liveOrders.length} orders
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
          <FilterBar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="PO, job, photographer… (every word must match)"
            activeCount={activeFilters}
            onClear={clearAll}
            count={filtered.length}
            total={liveOrders.length}
            noun="orders"
            trailing={
              <SelectField
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                options={Object.entries(SORTS).map(([val, meta]) => ({
                  value: val,
                  label: meta.label,
                }))}
                className={[FILTER_FIELD, 'flex-1'].join(' ')}
              />
            }
          >
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                options={[
                  { value: 'All', label: 'Any status' },
                  ...statuses.map((v) => ({ value: v, label: ORDER_STATUS[v]?.label ?? v })),
                ]}
                className={FILTER_FIELD}
              />
              <SelectField
                value={studioFilter}
                onChange={(e) => setStudioFilter(e.target.value)}
                options={[
                  { value: 'All', label: 'Any studio' },
                  ...studioOptions.map((id) => ({ value: id, label: studioLabel(id) })),
                ]}
                className={FILTER_FIELD}
              />
            </div>
            <SelectField
              value={photographer}
              onChange={(e) => setPhotographer(e.target.value)}
              options={[{ value: 'All', label: 'Any photographer' }, ...photographerOptions]}
              className={[FILTER_FIELD, 'w-full'].join(' ')}
            />
            <div className="grid grid-cols-2 gap-2">
              <DateField value={from} onChange={(e) => setFrom(e.target.value)} className={FILTER_FIELD} />
              <DateField value={to} onChange={(e) => setTo(e.target.value)} className={FILTER_FIELD} />
            </div>
            <p className="text-[11px] text-slate-400">
              Dates match any job whose working window overlaps them.
            </p>
          </FilterBar>

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
                          setReserveNote(null) // it belonged to the previous order
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
                          {/* Which set of that job — several share a studio and day. */}
                          {o.setLabel && (
                            <span className="shrink-0 rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">
                              <Highlight text={o.setLabel} query={query} />
                            </span>
                          )}
                          {o.poNumber && sharedPo[o.poNumber] > 1 && (
                            <span
                              title={`${sharedPo[o.poNumber]} orders share ${o.poNumber} — same job`}
                              className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500"
                            >
                              {sharedPo[o.poNumber]}× PO
                            </span>
                          )}
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
                booking={selectedBooking}
                estimate={selectedEstimate}
                canManage={can(CAP.ORDER_MANAGE)}
                onEdit={() => setEditor({ open: true, order: selected })}
                onEditEquipment={() => setEqEditor({ open: true, order: selected })}
                reserveNote={reserveNote}
                onSetStatus={async (status) => {
                  setReserveNote(null)
                  const res = await updateOrder(selected.id, { status })
                  // Supabase mode reports what it managed to hold; local mode
                  // re-derives in memory and has nothing to report.
                  if (isClosedStatus(status)) setReserveNote({ closed: true, ...res })
                  else if (res && (res.reserved || res.short)) setReserveNote(res)
                  else if (status === 'hold') setReserveNote({ reserved: 0, short: 0 })
                }}
                onDownloadPdf={() =>
                  downloadEstimatePdf(selected, { inventory, kits, booking: selectedBooking })
                }
                onDownloadPackingList={() =>
                  downloadPackingListPdf(selected, { inventory, kits, booking: selectedBooking })
                }
                onOpenChecklist={() => setChecklistOpen(true)}
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
        onProceed={(payload) => {
          // The studio/day capacity is checked HERE, before the crew spends time
          // picking gear — createOrder checks it again when it actually writes.
          const used = bookings.filter(
            (b) =>
              b.studioId === payload.studioId &&
              b.date === payload.startsOn &&
              b.status === 'active',
          ).length
          if (used >= MAX_SETS_PER_DAY)
            return {
              error: `${studioLabel(payload.studioId)} already has ${used} sets on ${payload.startsOn} (max ${MAX_SETS_PER_DAY}). Pick another studio or date.`,
            }
          setDraft(payload)
          createdDraftId.current = null
          setEqEditor({ open: true, order: { ...payload, id: null, lines: [] } })
          return { ok: true }
        }}
        onSave={(id, payload) => updateOrder(id, payload)}
        onDelete={(id) => {
          archiveOrder(id)
          setSelectedId((cur) => (cur === id ? null : cur))
        }}
      />

      <OrderEquipmentModal
        open={eqEditor.open}
        order={eqEditor.order}
        inventory={inventory}
        kits={kits}
        scenarios={scenarios}
        companies={liveCompanies}
        onClose={() => {
          setEqEditor({ open: false, order: null })
          setDraft(null)
          createdDraftId.current = null
        }}
        onSave={async (id, lines) => {
          const existing = id ?? createdDraftId.current
          if (existing) return setOrderLines(existing, lines)
          // Step two of creating: the order and its gear are written together.
          const res = await createOrder(draft)
          if (res?.error) return res
          createdDraftId.current = res?.id ?? null
          setDraft(null)
          if (res?.id) {
            setSelectedId(res.id)
            setShowDetailMobile(true)
            if (lines.length) {
              const lineRes = await setOrderLines(res.id, lines)
              if (lineRes?.error) return lineRes
            }
          }
          return res
        }}
      />

      <PackingChecklistModal
        open={checklistOpen && !!selected}
        order={selected}
        estimate={selectedEstimate}
        onSign={(lineKey, slot, initials, itemName) =>
          signPackingLine(selected.id, lineKey, slot, initials, itemName)
        }
        onClear={(lineKey, slot) => clearPackingSignoff(selected.id, lineKey, slot)}
        onClose={() => setChecklistOpen(false)}
      />

    </div>
  )
}

// Related data as a link that opens a layered card. Falls back to plain text when
// there's nothing on the other end (e.g. a photographer typed by hand who isn't
// in the People database).
function PeekLink({ onClick, children }) {
  if (!onClick) return children
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-left text-violet-600 underline decoration-violet-300 underline-offset-2 transition hover:text-violet-800"
    >
      {children}
    </button>
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

function OrderDetail({
  order,
  booking,
  estimate,
  canManage,
  onEdit,
  onEditEquipment,
  onDownloadPdf,
  onDownloadPackingList,
  onOpenChecklist,
  onSetStatus,
  reserveNote,
}) {
  const peek = useStore((s) => s.peek)
  const { events: activityEvents, loading: activityLoading } = useActivity({ orderId: order.id })
  // Resolve the typed photographer name to a real person so it can be opened.
  const peopleList = useStore((s) => s.people)
  const photographerPerson = order.photographer
    ? peopleList.find((p) => p.name === order.photographer) ?? null
    : null
  const inventoryList = useStore((s) => s.inventory)
  const setActiveView = useStore((s) => s.setActiveView)
  // Count the rows the crew actually ticks (one per barcoded copy), not the order
  // lines — otherwise the card's "3/5 packed" disagrees with the checklist.
  const packProg = packingProgress(
    packingRows(estimate, { inventory: inventoryList, booking }).flatMap((g) => g.lines),
    order.packing || {},
  )
  // Scanning (epic #6). The scan log is what says the gear physically came back,
  // which is what closing the order is allowed to depend on.
  const scanExpected = expectedUnits(order, booking, inventoryList)
  const scanProg = scanProgress(scanExpected, order.scans ?? [])
  const stillOut = outstandingUnits(scanExpected, order.scans ?? [])
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
        {/* 5.5 — the Hold → Confirmed move. Confirming is what opens packing /
            scanning (epic #6); the pill colour is what epic #7 pulls into the
            calendar. */}
        {canManage && (ORDER_FLOW.includes(order.status) || isClosedStatus(order.status)) && (
          <section className="rounded-xl border border-slate-200 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center gap-3">
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                  Status
                </div>
                <p className="mt-0.5 text-xs text-slate-500">
                  {orderStatusMeta(order.status).meaning}
                </p>
              </div>
              {isClosedStatus(order.status) ? (
                <button
                  type="button"
                  onClick={() => onSetStatus('confirmed')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
                >
                  <Undo2 size={15} />
                  Re-open order
                </button>
              ) : order.status === 'hold' ? (
                <button
                  type="button"
                  onClick={() => onSetStatus('confirmed')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <CheckCircle2 size={15} />
                  Confirm order
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => onSetStatus('hold')}
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-amber-300 hover:text-amber-700"
                  >
                    <Undo2 size={15} />
                    Back to hold
                  </button>
                  {/* Closing is what frees the stock: the shoot happened and the
                      gear came back, so it stops being held while the job stays
                      on every unit's history. */}
                  <button
                    type="button"
                    onClick={() => onSetStatus(CLOSED_STATUS)}
                    disabled={stillOut.length > 0}
                    title={
                      stillOut.length > 0
                        ? `${stillOut.length} piece(s) are still scanned out — bring them back first`
                        : 'The shoot is done and the gear is back'
                    }
                    className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-700 px-3 py-2 text-sm font-medium text-white transition hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <PackageCheck size={15} />
                    Close order
                  </button>
                </>
              )}
            </div>
            {order.status === 'hold' && estimate.lineCount === 0 && (
              <p className="mt-2 text-xs text-amber-600">
                No equipment on this order yet — confirming an empty order is allowed, but packing
                will have nothing to pull.
              </p>
            )}
            {/* What confirming actually did to the stock. A shortfall means the
                paperwork asks for more than was free — say so rather than let the
                pull sheet imply gear that isn't held. */}
            {reserveNote && (
              <p
                className={[
                  'mt-2 text-xs',
                  reserveNote.short > 0 ? 'text-amber-600' : 'text-emerald-600',
                ].join(' ')}
              >
                {reserveNote.closed
                  ? `Closed — ${reserveNote.released ?? 0} piece(s) are back on the shelf and bookable again. The job stays on each unit's history.`
                  : reserveNote.short > 0
                    ? `${reserveNote.reserved} piece(s) reserved · ${reserveNote.short} could not be — nothing free for those lines. Free them from another job, or raise them as a sub-rental.`
                    : reserveNote.reserved > 0
                      ? `${reserveNote.reserved} piece(s) reserved for this job.`
                      : 'Reservations released — nothing is held for this job now.'}
              </p>
            )}
          </section>
        )}

        <section className="space-y-1.5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            The job
          </h4>
          <Row icon={CalendarRange} label="Set date">
            {order.startsOn ? dateRange(order.startsOn, order.endsOn) : '—'}
          </Row>
          <Row icon={Building2} label="Studio">
            {order.studioId ? studioLabel(order.studioId) : '—'}
          </Row>
          <Row icon={Layers} label="Set">
            {order.setLabel || <span className="text-slate-400">not named</span>}
          </Row>
          <Row icon={Camera} label="Photographer">
            {order.photographer ? (
              <PeekLink
                onClick={
                  photographerPerson ? () => peek({ type: 'person', id: photographerPerson.id }) : null
                }
              >
                {order.photographer}
              </PeekLink>
            ) : (
              <span className="text-slate-400">not assigned</span>
            )}
          </Row>
          {order.companyName && (
            <Row icon={Building2} label="Company">
              <PeekLink
                onClick={order.companyId ? () => peek({ type: 'company', id: order.companyId }) : null}
              >
                {order.companyName}
              </PeekLink>
            </Row>
          )}
          {order.setId && (
            <Row icon={Briefcase} label="Shoot">
              <PeekLink onClick={() => peek({ type: 'job', id: order.setId })}>
                Crew &amp; gear on the day
              </PeekLink>
            </Row>
          )}
        </section>

        {/* 5.2 who raised it + who last touched the gear (the attribution block) */}
        <section className="space-y-1.5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Attribution
          </h4>
          <Row icon={UserRound} label="Created by">
            {order.createdBy || (
              // Null means the seed script raised it, not a mystery — say so.
              <span className="text-slate-400">seed data</span>
            )}
          </Row>
          <Row icon={Clock3} label="Created">
            {order.createdAt ? new Date(order.createdAt).toLocaleString() : '—'}
          </Row>
          {/* The question this whole block exists to answer. */}
          <Row icon={Boxes} label="Equipment by">
            {order.eqUpdatedBy ? (
              <>
                {order.eqUpdatedBy}
                {order.eqUpdatedAt && (
                  <span className="text-slate-400">
                    {' · '}
                    {new Date(order.eqUpdatedAt).toLocaleString()}
                  </span>
                )}
              </>
            ) : (
              <span className="text-slate-400">
                {estimate.lineCount > 0 ? 'not recorded yet' : 'no equipment added yet'}
              </span>
            )}
          </Row>
        </section>

        {/* 5.3 equipment + 5.4 estimate */}
        <section>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Equipment
              {estimate.lineCount > 0 && ` · ${estimate.pieces} pcs`}
            </h4>
            {canManage &&
              // A closed order's equipment is the record of what went out, so it
              // stops being editable. Re-open it to change the gear — the store
              // refuses the write either way.
              (isClosedStatus(order.status) ? (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-slate-400"
                  title="Closed orders keep the gear they went out with. Re-open the order to change it."
                >
                  <Lock size={12} />
                  Closed — locked
                </span>
              ) : (
                <button
                  type="button"
                  onClick={onEditEquipment}
                  className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                >
                  <Boxes size={13} />
                  Edit equipment
                </button>
              ))}
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
                        <span className="flex min-w-0 flex-1 items-center gap-1.5">
                          {l.itemId ? (
                            <button
                              type="button"
                              onClick={() => peek({ type: 'item', id: l.itemId, unitId: l.unitId })}
                              title="Open this item — units, history, where it is"
                              className="min-w-0 truncate text-left text-sm font-medium text-slate-800 hover:text-violet-700 hover:underline focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-violet-400"
                            >
                              {l.itemName}
                            </button>
                          ) : (
                            <span className="min-w-0 truncate text-sm text-slate-800">
                              {l.itemName}
                            </span>
                          )}
                          {l.slotLabel && (
                            <span className="shrink-0 text-[11px] uppercase tracking-wide text-slate-400">
                              {l.slotLabel}
                            </span>
                          )}
                          {l.source === 'sub_rental' &&
                            // The vendor is a company we have a card for, so its
                            // name opens it — every company name in the app does.
                            (l.vendorId ? (
                              <button
                                type="button"
                                onClick={() => peek({ type: 'company', id: l.vendorId })}
                                title={`Sub-rented from ${l.vendorName ?? 'this vendor'} — open the company`}
                                className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800 underline decoration-amber-400 underline-offset-2 transition hover:bg-amber-200"
                              >
                                <Truck size={9} />
                                {l.vendorName ?? 'sub-rental'}
                              </button>
                            ) : (
                              <span
                                title="Sub-rental with no vendor picked yet"
                                className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                              >
                                <Truck size={9} />
                                sub-rental
                              </span>
                            ))}
                        </span>
                        {l.barcode && (
                          <span className="shrink-0 font-mono text-[11px] text-slate-400">
                            #{l.barcode}
                          </span>
                        )}
                        <span className="shrink-0 text-xs text-slate-500">×{l.quantity}</span>
                        <span className="w-20 shrink-0 text-right text-xs text-slate-500">
                          {l.dayRate == null ? 'no rate' : `${money(l.dayRate)}/day`}
                          {l.rateOverridden && (
                            <span
                              className="ml-1 text-violet-500"
                              title="Priced on this line, not from the item's own rate"
                            >
                              set here
                            </span>
                          )}
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

        {/* 6.1 — packing list, generated once the order is Confirmed. A CLOSED
            order keeps it: the pull sheet and its sign-offs are the record of
            what went out and came back. */}
        <section className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Package size={15} className="text-slate-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Packing list
            </h4>
          </div>
          {order.status === 'confirmed' || isClosedStatus(order.status) ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Two forms of the same pull sheet: print a PDF, or run the digital checklist on the
                iPad. One row per barcoded copy, one tick each. Returns are recorded by scanning.
                {estimate.lineCount === 0 && ' This order has no equipment yet.'}
              </p>
              {estimate.lineCount > 0 && (
                <p className="mt-1.5 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {packProg.packed}/{packProg.total}
                  </span>{' '}
                  packed
                </p>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={onOpenChecklist}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
                >
                  <ClipboardList size={15} />
                  Digital checklist
                </button>
                <button
                  type="button"
                  onClick={onDownloadPackingList}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  <FileDown size={15} />
                  Print PDF
                </button>
              </div>
            </>
          ) : (
            <p className="mt-1 text-xs text-amber-600">
              Confirm the order to generate its packing list.
            </p>
          )}
        </section>

        {/* The scanning station's side of the story: what has physically left the
            building. Shown only once the order is confirmed, because that's the
            only state that holds gear. */}
        {(order.status === 'confirmed' || isClosedStatus(order.status)) && (
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <ScanLine size={15} className="text-slate-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Scanning
              </h4>
            </div>
            {scanProg.total === 0 ? (
              <p className="mt-1 text-xs text-slate-500">
                No gear is reserved for this order, so there is nothing to scan.
              </p>
            ) : (
              <>
                <p className="mt-1.5 text-xs text-slate-500">
                  <span className="font-medium text-amber-600">{scanProg.out}</span> out ·{' '}
                  <span className="font-medium text-emerald-600">{scanProg.back}</span> back ·{' '}
                  {scanProg.pending} still on the shelf · {scanProg.total} total
                </p>
                {stillOut.length > 0 && (
                  <p className="mt-1 text-xs text-amber-600">
                    {stillOut.length} piece(s) are still out — the order can't be closed until they
                    are scanned back in ({stillOut
                      .slice(0, 4)
                      .map((u) => `#${u.barcode}`)
                      .join(', ')}
                    {stillOut.length > 4 ? '…' : ''}).
                  </p>
                )}
                <div className="mt-3">
                  <button
                    type="button"
                    onClick={() => setActiveView('scanning')}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                  >
                    <ScanLine size={15} />
                    Open the scanning station
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {/* Who changed what on this order. Reservation churn is filtered out —
            confirming rewrites every set_units row, which would bury the feed. */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Activity
          </h4>
          <ActivityList
            events={orderFeed(activityEvents)}
            loading={activityLoading}
            limit={6}
            emptyText="No changes recorded yet."
          />
        </section>
      </div>
    </>
  )
}
