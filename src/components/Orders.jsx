import { useEffect, useMemo, useState } from 'react'
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
} from 'lucide-react'
import { useStore } from '../store'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import { studioLabel } from '../data/studios'
import { ORDER_STATUS, ORDER_FLOW, orderStatusMeta } from '../data/orderStatus'
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
import { buildEstimate, money } from '../lib/estimate'
import { downloadEstimatePdf } from '../lib/estimatePdf'
import { downloadPackingListPdf } from '../lib/packingListPdf'
import { packingProgress } from '../lib/packing'

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
  const createAddon = useStore((s) => s.createAddon)
  const setAddonLines = useStore((s) => s.setAddonLines)
  const deleteAddon = useStore((s) => s.deleteAddon)
  const createOrder = useStore((s) => s.createOrder)
  const updateOrder = useStore((s) => s.updateOrder)
  const deleteOrder = useStore((s) => s.deleteOrder)
  const orderFocus = useStore((s) => s.orderFocus)
  const clearOrderFocus = useStore((s) => s.clearOrderFocus)
  const can = useCan()

  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('All')
  // 5.7 — job search: free text plus explicit photographer / studio / date-range
  // filters and a sort. All matching lives in lib/orderSearch.
  const [photographer, setPhotographer] = useState('All')
  const [studioFilter, setStudioFilter] = useState('All')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [sort, setSort] = useState('newest')
  const [showFilters, setShowFilters] = useState(false)
  const [selectedId, setSelectedId] = useState(() => orders[0]?.id ?? null)
  const [editor, setEditor] = useState({ open: false, order: null })
  const [eqEditor, setEqEditor] = useState({ open: false, order: null })
  const [checklistOpen, setChecklistOpen] = useState(false)
  const [addonEqId, setAddonEqId] = useState(null) // add-on being equipment-edited
  const [addonChecklistId, setAddonChecklistId] = useState(null) // add-on whose checklist is open
  const [showDetailMobile, setShowDetailMobile] = useState(false)
  // What the last confirm/hold did to the stock (supabase mode reports it).
  const [reserveNote, setReserveNote] = useState(null)

  // An order whose equipment picker should open as soon as the order itself
  // exists in state. Set by creating one (here or from the calendar) — adding
  // gear is the next thing you always do, so the flow shouldn't stop at "saved".
  const [pendingEqId, setPendingEqId] = useState(null)

  // Opened from the calendar (a shoot IS its order): select that order + show
  // its detail on mobile.
  useEffect(() => {
    if (!orderFocus?.orderId) return
    if (orders.some((o) => o.id === orderFocus.orderId)) {
      setSelectedId(orderFocus.orderId)
      setShowDetailMobile(true)
      if (orderFocus.openEquipment) setPendingEqId(orderFocus.orderId)
    }
    clearOrderFocus()
  }, [orderFocus, orders, clearOrderFocus])

  // A freshly created order only appears after the refetch, so wait for it
  // rather than opening the picker on a half-known record.
  useEffect(() => {
    if (!pendingEqId) return
    const order = orders.find((o) => o.id === pendingEqId)
    if (!order) return
    setEqEditor({ open: true, order })
    setPendingEqId(null)
  }, [pendingEqId, orders])

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

  const filtered = useMemo(
    () => searchOrders(orders, { text: search, status, photographer, studio: studioFilter, from, to, sort }),
    [orders, search, status, photographer, studioFilter, from, to, sort],
  )

  // How many orders share each PO — one job's PO covers every order raised
  // against it, so this is the job-history hint on a row.
  const sharedPo = useMemo(() => poCounts(orders), [orders])
  const photographerOptions = useMemo(() => photographersIn(orders), [orders])
  const studioOptions = useMemo(() => studiosIn(orders), [orders])

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

  const selected = orders.find((o) => o.id === selectedId) ?? null

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
  const editingAddon = selected?.addons?.find((a) => a.id === addonEqId) ?? null
  const checklistAddon = selected?.addons?.find((a) => a.id === addonChecklistId) ?? null
  const addonEstimate = useMemo(
    () =>
      checklistAddon
        ? buildEstimate({ ...selected, lines: checklistAddon.lines }, { inventory, kits, booking: selectedBooking })
        : null,
    [checklistAddon, selected, inventory, kits, selectedBooking],
  )

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
                placeholder="PO, job, photographer… (every word must match)"
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

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setShowFilters((v) => !v)}
                className={[
                  'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                  activeFilters > 0
                    ? 'border-violet-300 bg-violet-50 text-violet-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50',
                ].join(' ')}
              >
                <SlidersHorizontal size={13} />
                Filters
                {activeFilters > 0 && (
                  <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-semibold text-white">
                    {activeFilters}
                  </span>
                )}
              </button>
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value)}
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none transition focus:border-violet-400"
              >
                {Object.entries(SORTS).map(([val, meta]) => (
                  <option key={val} value={val}>
                    {meta.label}
                  </option>
                ))}
              </select>
            </div>

            {showFilters && (
              <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value)}
                    className="min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-400"
                  >
                    <option value="All">Any status</option>
                    {statuses.map((v) => (
                      <option key={v} value={v}>
                        {ORDER_STATUS[v]?.label ?? v}
                      </option>
                    ))}
                  </select>
                  <select
                    value={studioFilter}
                    onChange={(e) => setStudioFilter(e.target.value)}
                    className="min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-400"
                  >
                    <option value="All">Any studio</option>
                    {studioOptions.map((id) => (
                      <option key={id} value={id}>
                        {studioLabel(id)}
                      </option>
                    ))}
                  </select>
                </div>
                <select
                  value={photographer}
                  onChange={(e) => setPhotographer(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none focus:border-violet-400"
                >
                  <option value="All">Any photographer</option>
                  {photographerOptions.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
                <div>
                  <div className="mb-1 text-[11px] font-medium text-slate-500">
                    Shooting between — any job whose dates overlap
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <DateField
                      value={from}
                      onChange={(e) => setFrom(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-violet-400"
                    />
                    <DateField
                      value={to}
                      onChange={(e) => setTo(e.target.value)}
                      className="w-full rounded-lg border border-slate-300 px-2 py-1.5 text-xs outline-none focus:border-violet-400"
                    />
                  </div>
                </div>
              </div>
            )}

            <div className="flex items-center justify-between px-0.5 text-[11px] text-slate-400">
              <span>
                {filtered.length} of {orders.length} orders
              </span>
              {(search || activeFilters > 0) && (
                <button
                  type="button"
                  onClick={clearAll}
                  className="font-medium text-violet-600 transition hover:underline"
                >
                  Clear all
                </button>
              )}
            </div>
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
                  if (res && (res.reserved || res.short)) setReserveNote(res)
                  else if (status === 'hold') setReserveNote({ reserved: 0, short: 0 })
                }}
                onDownloadPdf={() =>
                  downloadEstimatePdf(selected, { inventory, kits, booking: selectedBooking })
                }
                onDownloadPackingList={() =>
                  downloadPackingListPdf(selected, { inventory, kits, booking: selectedBooking })
                }
                onOpenChecklist={() => setChecklistOpen(true)}
                onCreateAddon={async (label) => {
                  const id = await createAddon(selected.id, label)
                  if (id) setAddonEqId(id)
                }}
                onEditAddon={(addon) => setAddonEqId(addon.id)}
                onAddonChecklist={(addon) => setAddonChecklistId(addon.id)}
                onDeleteAddon={(addon) => deleteAddon(selected.id, addon.id)}
                onDownloadAddon={(addon) =>
                  downloadPackingListPdf(
                    buildEstimate(
                      { ...selected, lines: addon.lines },
                      { inventory, kits, booking: selectedBooking },
                    ),
                    undefined,
                    { docTitle: 'ADD-ON PACKING LIST', addonLabel: addon.label || 'Add-on' },
                  )
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
          // Straight on to the gear: the order exists to carry equipment.
          if (res?.id) {
            setSelectedId(res.id)
            setShowDetailMobile(true)
            setPendingEqId(res.id)
          }
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
        companies={companies}
        onClose={() => setEqEditor({ open: false, order: null })}
        onSave={(id, lines) => setOrderLines(id, lines)}
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

      {/* 6.4 — add-on equipment editor (reuses the order equipment modal) */}
      <OrderEquipmentModal
        open={!!editingAddon}
        order={
          editingAddon
            ? {
                id: editingAddon.id,
                lines: editingAddon.lines,
                startsOn: selected?.startsOn,
                endsOn: selected?.endsOn,
              }
            : null
        }
        inventory={inventory}
        kits={kits}
        scenarios={scenarios}
        companies={companies}
        onClose={() => setAddonEqId(null)}
        onSave={(addonId, lines) => setAddonLines(selected.id, addonId, lines)}
      />

      {/* 6.4 — add-on digital checklist (namespaced sign-off keys) */}
      <PackingChecklistModal
        open={!!checklistAddon}
        order={selected}
        estimate={addonEstimate}
        title={checklistAddon ? `Checklist — ${checklistAddon.label || 'Add-on'}` : 'Packing checklist'}
        keyPrefix={checklistAddon ? `addon:${checklistAddon.id}::` : ''}
        onSign={(lineKey, slot, initials, itemName) =>
          signPackingLine(selected.id, lineKey, slot, initials, itemName)
        }
        onClear={(lineKey, slot) => clearPackingSignoff(selected.id, lineKey, slot)}
        onClose={() => setAddonChecklistId(null)}
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
  estimate,
  canManage,
  onEdit,
  onEditEquipment,
  onDownloadPdf,
  onDownloadPackingList,
  onOpenChecklist,
  onCreateAddon,
  onEditAddon,
  onAddonChecklist,
  onDeleteAddon,
  onDownloadAddon,
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
  const packProg = packingProgress(
    estimate.groups.flatMap((g) => g.lines),
    order.packing || {},
  )
  const [addonLabel, setAddonLabel] = useState('')
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
        {canManage && ORDER_FLOW.includes(order.status) && (
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
              {order.status === 'hold' ? (
                <button
                  type="button"
                  onClick={() => onSetStatus('confirmed')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-emerald-700"
                >
                  <CheckCircle2 size={15} />
                  Confirm order
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onSetStatus('hold')}
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-600 transition hover:border-amber-300 hover:text-amber-700"
                >
                  <Undo2 size={15} />
                  Back to hold
                </button>
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
                {reserveNote.short > 0
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
          <Row icon={CalendarRange} label="Working dates">
            {order.startsOn ? dateRange(order.startsOn, order.endsOn) : '—'}
          </Row>
          <Row icon={Building2} label="Studio">
            {order.studioId ? studioLabel(order.studioId) : '—'}
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
                          {l.source === 'sub_rental' && (
                            <span
                              title={l.vendorName ? `Sub-rented from ${l.vendorName}` : 'Sub-rental'}
                              className="inline-flex shrink-0 items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-800"
                            >
                              <Truck size={9} />
                              {l.vendorName ?? 'sub-rental'}
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

        {/* 6.1 — packing list, generated only once the order is Confirmed */}
        <section className="rounded-xl border border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <Package size={15} className="text-slate-500" />
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Packing list
            </h4>
          </div>
          {order.status === 'confirmed' ? (
            <>
              <p className="mt-1 text-xs text-slate-500">
                Two forms of the same pull sheet: print a PDF, or run the digital checklist on the
                iPad — three sign-offs per line (two at sign-out, one at return).
                {estimate.lineCount === 0 && ' This order has no equipment yet.'}
              </p>
              {estimate.lineCount > 0 && (
                <p className="mt-1.5 text-xs text-slate-500">
                  <span className="font-medium text-slate-700">
                    {packProg.out}/{packProg.total}
                  </span>{' '}
                  signed out ·{' '}
                  <span className="font-medium text-slate-700">
                    {packProg.ret}/{packProg.total}
                  </span>{' '}
                  returned
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

        {/* 6.4 — Add-On packing lists (day-of additions, main list untouched) */}
        {order.status === 'confirmed' && (
          <section className="rounded-xl border border-slate-200 p-4">
            <div className="flex items-center gap-2">
              <Package size={15} className="text-slate-500" />
              <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Add-ons
              </h4>
              {order.addons?.length > 0 && (
                <span className="text-xs text-slate-400">{order.addons.length}</span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Extra pull sheets for gear added on the shoot day — the main list stays as printed.
            </p>

            {order.addons?.length > 0 && (
              <ul className="mt-2 space-y-1.5">
                {order.addons.map((a) => {
                  const pcs = (a.lines || []).reduce((n, l) => n + (l.quantity || 1), 0)
                  const p = packingProgress(a.lines || [], order.packing || {}, `addon:${a.id}::`)
                  return (
                    <li
                      key={a.id}
                      className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium text-slate-800">
                          {a.label || 'Add-on'}
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {(a.lines || []).length} lines · {pcs} pcs
                          {p.total > 0 && ` · ${p.out}/${p.total} out · ${p.ret}/${p.total} ret`}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => onEditAddon(a)}
                            title="Edit equipment"
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-violet-600"
                          >
                            <Boxes size={15} />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => onAddonChecklist(a)}
                          title="Digital checklist"
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-violet-600"
                        >
                          <ClipboardList size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => onDownloadAddon(a)}
                          title="Print add-on PDF"
                          className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                        >
                          <FileDown size={15} />
                        </button>
                        {canManage && (
                          <button
                            type="button"
                            onClick={() => onDeleteAddon(a)}
                            title="Delete add-on"
                            className="rounded-md p-1.5 text-slate-400 transition hover:bg-rose-50 hover:text-rose-500"
                          >
                            <X size={15} />
                          </button>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {canManage && (
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  onCreateAddon(addonLabel.trim() || 'Add-on')
                  setAddonLabel('')
                }}
                className="mt-2 flex gap-2"
              >
                <input
                  type="text"
                  value={addonLabel}
                  onChange={(e) => setAddonLabel(e.target.value)}
                  placeholder="New add-on (e.g. Day 2 extras)"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                />
                <button
                  type="submit"
                  className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-600"
                >
                  <Plus size={15} />
                  Add-on
                </button>
              </form>
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
