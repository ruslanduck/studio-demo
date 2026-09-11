import { useEffect, useMemo, useRef, useState } from 'react'
import {
  Plus,
  ClipboardList,
  ChevronLeft,
  Pencil,
  Camera,
  CalendarRange,
  Package,
  Building2,
  UserRound,
  Clock3,
  FileDown,
  Boxes,
  Truck,
  Briefcase,
  Layers,
  Lock,
  Tag,
  AlertTriangle,
} from 'lucide-react'
import { useStore, notArchived, capacityError } from '../store'
import { setSpanDays } from '../lib/setDays'
import { rolesFor, rolesLabel } from '../lib/callTimes'
import { usePersisted } from '../lib/usePersisted'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import { studioLabel } from '../data/studios'
import {
  ORDER_STATUS,
  ORDER_STATUS_CHOICES,
  orderStatusMeta,
  isClosedStatus,
  isCanceledStatus,
} from '../data/orderStatus'
import {
  searchOrders,
  poCounts,
  studiosIn,
  brandsIn,
  jobTypesIn,
  SORTS,
  rangeIsBackwards,
} from '../lib/orderSearch'
import DateField from './DateField'
import OrderEditorModal from './OrderEditorModal'
import ActivityList from './ActivityList'
import { useActivity } from '../lib/useActivity'
import { orderFeed } from '../lib/activity'
import OrderEquipmentModal from './OrderEquipmentModal'
import PackingChecklistModal from './PackingChecklistModal'
import SelectField from './SelectField'
import NoteField from './NoteField'
import FilterBar, { FILTER_FIELD } from './FilterBar'
import { buildEstimate, money } from '../lib/estimate'
import { downloadEstimatePdf } from '../lib/estimatePdf'
import { downloadPackingListPdf } from '../lib/packingListPdf'
import { packingProgress, packingRows } from '../lib/packing'

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

const PILL = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1'

// The status pill, and — when `onChange` is given — the CONTROL that moves the
// job. Clicking the status is how you change it, so the separate STATUS block
// with its three buttons is gone: one thing in one place, and the chevron is
// what says it can be clicked. Without `onChange` (a list row, or an account
// without ORDER_MANAGE) it stays a plain badge.
function StatusPill({ status, onChange = null }) {
  const s = orderStatusMeta(status)
  if (!onChange)
    return (
      <span className={[PILL, s.pill].join(' ')}>
        <span className={['h-1.5 w-1.5 rounded-full', s.dot].join(' ')} />
        {s.label}
      </span>
    )
  // Every state the job can be moved to, plus its CURRENT one even when that is
  // a legacy value ('draft') — a dropdown that cannot show where you already are
  // reads as broken. One list with the calendar's status menu, so the two
  // surfaces can never offer different sets.
  const values = ORDER_STATUS_CHOICES.includes(status)
    ? ORDER_STATUS_CHOICES
    : [status, ...ORDER_STATUS_CHOICES]
  return (
    <SelectField
      value={status}
      onChange={(e) => onChange(e.target.value)}
      ariaLabel="Job status — click to change"
      options={values.map((v) => ({ value: v, label: ORDER_STATUS[v]?.label ?? v }))}
      className={[PILL, s.pill, 'cursor-pointer transition hover:ring-2'].join(' ')}
    />
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

// A shoot can run several days, so the window says how many — "→ 2026-09-11"
// alone leaves the reader counting on their fingers.
const dateRange = (from, to) =>
  !to || to === from ? from : `${from} → ${to} · ${setSpanDays(from, to)} days`

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
  const [studioFilter, setStudioFilter] = usePersisted('orders', 'studio', 'All')
  const [brandFilter, setBrandFilter] = usePersisted('orders', 'brand', 'All')
  const [typeFilter, setTypeFilter] = usePersisted('orders', 'jobType', 'All')
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

  const studioOptions = useMemo(() => studiosIn(liveOrders), [liveOrders])
  const brandOptions = useMemo(() => brandsIn(liveOrders), [liveOrders])
  // Roles already used on a shoot stay offered in the call-sheet picker.
  const roleOptions = useMemo(() => rolesFor(bookings), [bookings])
  const typeOptions = useMemo(() => jobTypesIn(liveOrders), [liveOrders])

  // A persisted filter whose value is no longer IN the data would hide every row
  // forever, with the dropdown showing its placeholder instead of a value — the
  // brand you filtered by last week, on a register that has since changed.
  // Same recovery as a stale selection: fall back to "All".
  const usable = (v, options) => (v === 'All' || options.includes(v) ? v : 'All')
  const studioValue = usable(studioFilter, studioOptions)
  const brandValue = usable(brandFilter, brandOptions)
  const typeValue = usable(typeFilter, typeOptions)

  const filtered = useMemo(
    () =>
      searchOrders(liveOrders, {
        text: search,
        status,
        studio: studioValue,
        brand: brandValue,
        jobType: typeValue,
        from,
        to,
        sort,
      }),
    [liveOrders, search, status, studioValue, brandValue, typeValue, from, to, sort],
  )

  // How many orders share each PO — one job's PO covers every order raised
  // against it, so this is the job-history hint on a row.
  const sharedPo = useMemo(() => poCounts(liveOrders), [liveOrders])
  const activeFilters =
    (status !== 'All' ? 1 : 0) +
    (studioValue !== 'All' ? 1 : 0) +
    (brandValue !== 'All' ? 1 : 0) +
    (typeValue !== 'All' ? 1 : 0) +
    (from ? 1 : 0) +
    (to ? 1 : 0)

  // An impossible period is worth naming rather than leaving as an empty list.
  const backwardsRange = rangeIsBackwards(from, to)

  function clearAll() {
    setSearch('')
    setStatus('All')
    setStudioFilter('All')
    setBrandFilter('All')
    setTypeFilter('All')
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
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Jobs</h2>
          <p className="text-sm text-slate-500">
            {liveOrders.length} jobs
            {holdCount > 0 && ` · ${holdCount} on hold`}
          </p>
        </div>
        {can(CAP.ORDER_MANAGE) && (
          <button
            type="button"
            onClick={() => setEditor({ open: true, order: null })}
            className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-strong"
          >
            <Plus size={16} />
            New job
          </button>
        )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* List pane */}
        <div
          className={[
            showDetailMobile ? 'hidden lg:flex' : 'flex',
            'w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm lg:w-96',
          ].join(' ')}
        >
          <FilterBar
            search={search}
            onSearch={setSearch}
            searchPlaceholder="PO, job, photographer…"
            activeCount={activeFilters}
            onClear={clearAll}
            count={filtered.length}
            total={liveOrders.length}
            noun="jobs"
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
                value={studioValue}
                onChange={(e) => setStudioFilter(e.target.value)}
                options={[
                  { value: 'All', label: 'Any studio' },
                  ...studioOptions.map((id) => ({ value: id, label: studioLabel(id) })),
                ]}
                className={FILTER_FIELD}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <SelectField
                value={brandValue}
                onChange={(e) => setBrandFilter(e.target.value)}
                options={[{ value: 'All', label: 'Any brand' }, ...brandOptions]}
                className={FILTER_FIELD}
              />
              <SelectField
                value={typeValue}
                onChange={(e) => setTypeFilter(e.target.value)}
                options={[{ value: 'All', label: 'Any type' }, ...typeOptions]}
                className={FILTER_FIELD}
              />
            </div>
            {/* Two bare date boxes said nothing about which was which — the
                dropdowns beside them describe themselves ("Any studio"), a
                filled date field just shows a date. Labelled, and the rule
                stated: a job matches when any of ITS shooting days falls in the
                period, so a multi-day job is found from either end. */}
            <div>
              <div className="grid grid-cols-2 gap-2">
                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Shooting from
                  </span>
                  <DateField value={from} onChange={(e) => setFrom(e.target.value)} className={FILTER_FIELD} />
                </label>
                <label className="min-w-0">
                  <span className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    Shooting until
                  </span>
                  <DateField value={to} onChange={(e) => setTo(e.target.value)} className={FILTER_FIELD} />
                </label>
              </div>
              {backwardsRange ? (
                <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-amber-700">
                  <AlertTriangle size={12} className="shrink-0" />
                  Until is before from, so nothing can match.
                  <button
                    type="button"
                    onClick={() => {
                      // Read the values being swapped, not the closure: both
                      // setters fire in one tick.
                      const a = from
                      const b = to
                      setFrom(b)
                      setTo(a)
                    }}
                    className="rounded px-1.5 py-0.5 font-semibold text-violet-700 underline transition hover:bg-violet-50"
                  >
                    Swap them
                  </button>
                </p>
              ) : (
                <p className="mt-1.5 text-[11px] text-slate-400">
                  {from && to
                    ? 'Jobs shooting on any day in that period.'
                    : from
                      ? 'Jobs shooting on or after that date.'
                      : to
                        ? 'Jobs shooting on or before that date.'
                        : 'Leave either side empty for an open end.'}
                </p>
              )}
            </div>
          </FilterBar>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {filtered.length === 0 ? (
              <p className="px-3 py-10 text-center text-sm text-slate-400">
                {/* "yet" vs "match" is the difference between an empty register and a
                    filter hiding everything. It used to test only the search box
                    and the status, so narrowing by studio, photographer, dates —
                    or now brand and type — claimed there were no jobs at all. */}
                {query || activeFilters > 0 ? 'No jobs match.' : 'No jobs yet.'}
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
                          {/* Brand and shoot type: the two things the studio
                              filters by, so they belong on the row you scan. */}
                          {o.brand && (
                            <span className="shrink-0 rounded bg-violet-50 px-1.5 text-[10px] font-medium text-violet-700">
                              <Highlight text={o.brand} query={query} />
                            </span>
                          )}
                          {o.jobType && (
                            <span className="shrink-0 rounded bg-sky-50 px-1.5 text-[10px] font-medium text-sky-700">
                              <Highlight text={o.jobType} query={query} />
                            </span>
                          )}
                          {o.poNumber && sharedPo[o.poNumber] > 1 && (
                            <span
                              title={`${sharedPo[o.poNumber]} jobs share ${o.poNumber}`}
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
            'min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm',
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
                Back to jobs
              </button>
              <OrderDetail
                order={selected}
                booking={selectedBooking}
                estimate={selectedEstimate}
                canManage={can(CAP.ORDER_MANAGE)}
                // The call sheet belongs to the SHOOT, so it is handed in with
                // the job — the form edits both and the store splits them again.
                onEdit={() =>
                  setEditor({
                    open: true,
                    order: {
                      ...selected,
                      callTimes: selectedBooking?.callTimes ?? [],
                      wrapTime: selectedBooking?.wrapTime ?? '',
                    },
                  })
                }
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
              <p className="text-sm text-slate-400">Select a job to see its estimate.</p>
            </div>
          )}
        </div>
      </div>

      <OrderEditorModal
        open={editor.open}
        order={editor.order}
        studios={studios}
        photographers={photographerNames}
        brands={brandOptions}
        jobTypes={typeOptions}
        roleOptions={roleOptions}
        onClose={() => setEditor({ open: false, order: null })}
        onProceed={(payload) => {
          // The studio capacity is checked HERE, before the crew spends time
          // picking gear — createOrder checks it again when it actually writes.
          // Every day of the window has to have room, not just the first.
          const full = capacityError(bookings, {
            studioId: payload.studioId,
            from: payload.startsOn,
            to: payload.endsOn,
          })
          if (full) return { error: full }
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
  // Read from the store rather than taking a prop: the note's write is this
  // card's own business, and threading an action through every parent is how a
  // shared modal once lost a required prop and white-screened a view.
  const updateOrder = useStore((s) => s.updateOrder)
  const { events: activityEvents, loading: activityLoading } = useActivity({ orderId: order.id })
  // Resolve the typed photographer name to a real person so it can be opened.
  const peopleList = useStore((s) => s.people)
  const photographerPerson = order.photographer
    ? peopleList.find((p) => p.name === order.photographer) ?? null
    : null
  const inventoryList = useStore((s) => s.inventory)
  // Count the rows the crew actually ticks (one per barcoded copy), not the order
  // lines — otherwise the card's "3/5 packed" disagrees with the checklist.
  const packProg = packingProgress(
    packingRows(estimate, { inventory: inventoryList, booking }).flatMap((g) => g.lines),
    order.packing || {},
  )
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="truncate text-lg font-semibold text-slate-900">
              {order.jobName ?? order.setTitle ?? 'Untitled job'}
            </h3>
            {/* Closing used to be blocked while gear was still scanned out.
                That went with the scanning station — nothing records a scan-out
                any more, so the pill has nothing to block on. */}
            <StatusPill status={order.status} onChange={canManage ? onSetStatus : null} />
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
          <div className="flex shrink-0 items-center gap-2">
            {/* A closed job's equipment is the record of what went out, so it
                stops being editable. Re-open it to change the gear — the store
                refuses the write either way. */}
            {isClosedStatus(order.status) ? (
              <span
                className="inline-flex items-center gap-1.5 px-2 py-1.5 text-xs font-medium text-slate-400"
                title="Closed jobs keep the gear they went out with. Re-open the job to change it."
              >
                <Lock size={12} />
                Equipment locked
              </span>
            ) : (
              <button
                type="button"
                onClick={onEditEquipment}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-600"
              >
                <Boxes size={14} />
                Edit equipment
              </button>
            )}
            <button
              type="button"
              onClick={onEdit}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-600"
            >
              <Pencil size={14} />
              Edit
            </button>
          </div>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        {/* What a status change did to the stock. A shortfall means the paperwork
            asks for more than was free — say so rather than let the pull sheet
            imply gear that isn't held. */}
        {reserveNote && (
          <p
            className={[
              'text-xs',
              reserveNote.short > 0 ? 'text-amber-600' : 'text-emerald-600',
            ].join(' ')}
          >
            {reserveNote.closed
              ? `Closed — ${reserveNote.released ?? 0} piece(s) are back on the shelf and bookable again.`
              : reserveNote.short > 0
                ? `${reserveNote.reserved} piece(s) reserved · ${reserveNote.short} could not be — nothing free for those lines.`
                : reserveNote.reserved > 0
                  ? `${reserveNote.reserved} piece(s) reserved for this job.`
                  : 'Reservations released — nothing is held for this job now.'}
          </p>
        )}

        <section className="space-y-1.5">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            The shoot
          </h4>
          <Row
            icon={CalendarRange}
            label={setSpanDays(order.startsOn, order.endsOn) > 1 ? 'Set dates' : 'Set date'}
          >
            {order.startsOn ? dateRange(order.startsOn, order.endsOn) : '—'}
          </Row>
          <Row icon={Building2} label="Studio">
            {order.studioId ? studioLabel(order.studioId) : '—'}
          </Row>
          {/* The call sheet. Empty is a real answer — a shoot nobody has
              scheduled yet — so it says so instead of showing nothing. */}
          <Row icon={Clock3} label="Call times">
            {booking?.callTimes?.length ? (
              <span className="inline-flex flex-col gap-0.5">
                {booking.callTimes.map((c, i) => (
                  <span key={c.id || i}>
                    <span className="font-medium tabular-nums">{c.time}</span>{' '}
                    <span className="text-slate-600">{rolesLabel(c)}</span>
                    {c.note && <span className="text-slate-400"> · {c.note}</span>}
                  </span>
                ))}
              </span>
            ) : (
              'not set'
            )}
          </Row>
          <Row icon={Clock3} label="Wrap">
            {booking?.wrapTime || 'not set'}
          </Row>
          <Row icon={Layers} label="Set">
            {order.setLabel || <span className="text-slate-400">not named</span>}
          </Row>
          <Row icon={Tag} label="Brand">
            {order.brand || <span className="text-slate-400">—</span>}
          </Row>
          <Row icon={Briefcase} label="Type">
            {order.jobType || <span className="text-slate-400">—</span>}
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

        {/* The note is written HERE, not in the editor. It used to appear only
            when one already existed, so an empty job gave no hint that a note
            was possible and writing one meant opening the whole form. */}
        <section>
          <NoteField
            recordId={order.id}
            value={order.notes}
            canEdit={canManage}
            onSave={(notes) => updateOrder(order.id, { notes })}
            placeholder="Anything the crew should know about this job…"
          />
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

        {/* Equipment, the estimate it prices and the pull sheet it fills are ONE
            module: the same list read three ways, and three bordered boxes made
            them look like three unrelated things. */}
        <section className="overflow-hidden rounded-xl border border-slate-200">
          <div className="flex items-center justify-between gap-2 border-b border-slate-200 bg-slate-50/60 px-4 py-2.5">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Equipment
              {estimate.lineCount > 0 && ` · ${estimate.pieces} pcs`}
            </h4>
            <span className="text-xs text-slate-400">
              {estimate.lineCount} line{estimate.lineCount === 1 ? '' : 's'} · {estimate.days}{' '}
              billable day{estimate.days === 1 ? '' : 's'}
            </span>
          </div>

          <div className="space-y-3 p-4">
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
              Nothing added yet.
            </p>
          )}
          </div>

          {/* The money the list above adds up to. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50/60 px-4 py-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Estimate
              </span>
              <span className="text-lg font-semibold text-slate-900">{money(estimate.total)}</span>
              <span className="text-[11px] text-slate-400">equipment only</span>
              {estimate.unratedCount > 0 && (
                <span className="text-xs text-amber-600">
                  {estimate.unratedCount} line(s) have no day rate and sit outside the total
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={onDownloadPdf}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-2 text-sm font-medium text-white transition hover:bg-brand-strong"
            >
              <FileDown size={15} />
              Estimate PDF
            </button>
          </div>

          {/* The pull sheet the same list fills. Available at EVERY status except
              Canceled, on request: a crew pulls gear before the paperwork is
              confirmed, and refusing to print until then just moved the work off
              the system. Canceled is the one state with nothing to pull. */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3">
            {isCanceledStatus(order.status) ? (
              <span className="inline-flex items-center gap-2 text-xs text-slate-400">
                <Package size={14} />
                Canceled — nothing to pull.
              </span>
            ) : (
              <>
                <span className="inline-flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
                    <Package size={14} className="text-slate-400" />
                    Pull sheet
                  </span>
                  {estimate.lineCount === 0 ? (
                    <span className="text-xs text-slate-400">no equipment yet</span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      <span className="font-medium text-slate-700">
                        {packProg.packed}/{packProg.total}
                      </span>{' '}
                      packed
                    </span>
                  )}
                  {/* Copies are fixed when the job is confirmed, so before that the
                      sheet lists what to pull without naming which piece. A fact
                      about this sheet, not an explanation of the feature. */}
                  {estimate.lineCount > 0 && order.status !== 'confirmed' && !isClosedStatus(order.status) && (
                    <span className="text-xs text-amber-600">
                      not confirmed — no units reserved yet
                    </span>
                  )}
                </span>
                <span className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={onOpenChecklist}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
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
                </span>
              </>
            )}
          </div>
        </section>

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
