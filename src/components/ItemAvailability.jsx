import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays, Wrench, UserRound } from 'lucide-react'
import {
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  addMonths,
  parseISO,
  format,
  isSameMonth,
  isToday,
} from 'date-fns'
import { useStore } from '../store'
import { studioLabel } from '../data/studios'
import { availabilityForDays, dayAvailability, bookedDays } from '../lib/itemAvailability'

const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

// Booking calendar for ONE item: which days it's committed, how many pieces
// exist that day, how many are taken and how many are left — and, for the
// selected day, the exact barcodes, the sets holding them and who booked them.
//
// "10 units" doesn't answer "can I book this on the 4th". The maths lives in
// lib/itemAvailability (pure, Node-asserted); this component is the month grid
// and the day breakdown.
export default function ItemAvailability({ item }) {
  // Read straight from the store: the reservation → set → order chain is this
  // component's business, and threading three collections through the inventory
  // tree is how a required prop ends up undefined.
  const bookings = useStore((s) => s.bookings)
  const orders = useStore((s) => s.orders)
  const peek = useStore((s) => s.peek)

  const today = useMemo(() => format(new Date(), 'yyyy-MM-dd'), [])
  const [monthAnchor, setMonthAnchor] = useState(today)
  const [selected, setSelected] = useState(today)

  // A different item means a different calendar — back to this month.
  useEffect(() => {
    setMonthAnchor(today)
    setSelected(today)
  }, [item.id, today])

  const days = useMemo(() => {
    const ref = parseISO(monthAnchor)
    return eachDayOfInterval({
      start: startOfWeek(startOfMonth(ref), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(ref), { weekStartsOn: 1 }),
    }).map((d) => ({
      date: d,
      iso: format(d, 'yyyy-MM-dd'),
      inMonth: isSameMonth(d, ref),
      today: isToday(d),
    }))
  }, [monthAnchor])

  const grid = useMemo(
    () => availabilityForDays(item, days.map((d) => d.iso)),
    [item, days],
  )
  const dayOf = useMemo(() => new Map(grid.map((g) => [g.iso, g])), [grid])
  const chosen = useMemo(() => dayAvailability(item, selected), [item, selected])

  // Where the gear actually is, per booked copy: reservation → set → its order,
  // which is what carries the PO, the Set designation and the author.
  const bookingById = useMemo(() => new Map(bookings.map((b) => [b.id, b])), [bookings])
  const orderById = useMemo(() => new Map(orders.map((o) => [o.id, o])), [orders])
  const rows = useMemo(
    () =>
      chosen.entries.map((e) => {
        const booking = e.setId ? bookingById.get(e.setId) : null
        const order = booking?.orderId ? orderById.get(booking.orderId) : null
        return {
          ...e,
          order,
          // Whoever last put equipment on the order booked this piece; before the
          // activity log existed that's the person who raised it.
          bookedBy: order?.eqUpdatedBy || order?.createdBy || null,
        }
      }),
    [chosen.entries, bookingById, orderById],
  )

  // An empty month reads as "broken" unless it says where the bookings are.
  const committed = useMemo(() => bookedDays(item), [item])
  const monthIso = monthAnchor.slice(0, 7)
  const inThisMonth = committed.filter((d) => d.startsWith(monthIso))
  const nextElsewhere = committed.find((d) => d.slice(0, 7) > monthIso)

  const stepMonth = (n) => {
    const next = format(addMonths(parseISO(monthAnchor), n), 'yyyy-MM-dd')
    setMonthAnchor(next)
  }

  const liveTotal = chosen.total

  return (
    <section className="border-t border-slate-200 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <CalendarDays size={15} className="text-slate-500" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500">
            Availability
          </h4>
          <span className="text-xs text-slate-400">
            {liveTotal} piece(s)
            {chosen.away > 0 && ` · ${chosen.away} in repair`}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => stepMonth(-1)}
            title="Previous month"
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronLeft size={14} />
          </button>
          <span className="w-28 text-center text-sm font-medium text-slate-700">
            {format(parseISO(monthAnchor), 'MMMM yyyy')}
          </span>
          <button
            type="button"
            onClick={() => stepMonth(1)}
            title="Next month"
            className="grid h-7 w-7 place-items-center rounded-lg border border-slate-300 text-slate-500 transition hover:bg-slate-100"
          >
            <ChevronRight size={14} />
          </button>
          <button
            type="button"
            onClick={() => {
              setMonthAnchor(today)
              setSelected(today)
            }}
            className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
          >
            Today
          </button>
        </div>
      </div>

      {/* Month grid. Each cell answers "how many are left that day". */}
      <div className="mt-3 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((w) => (
          <div key={w} className="pb-0.5 text-center text-[10px] font-semibold uppercase text-slate-400">
            {w}
          </div>
        ))}
        {days.map((d) => {
          const a = dayOf.get(d.iso)
          const booked = a?.booked ?? 0
          const free = a?.free ?? 0
          const none = free === 0 && (a?.total ?? 0) > 0
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSelected(d.iso)}
              title={`${format(d.date, 'EEE d MMM')} · ${booked} of ${a?.total ?? 0} booked · ${free} free`}
              className={[
                'rounded-lg border px-1 py-1 text-left transition',
                d.iso === selected
                  ? 'border-violet-400 ring-2 ring-violet-100'
                  : 'border-slate-200 hover:border-violet-300',
                !d.inMonth && 'opacity-40',
                booked === 0 ? 'bg-white' : none ? 'bg-rose-50' : 'bg-amber-50',
              ]
                .filter(Boolean)
                .join(' ')}
            >
              <div
                className={[
                  'text-[11px] font-semibold leading-none',
                  d.today ? 'text-violet-600' : 'text-slate-600',
                ].join(' ')}
              >
                {format(d.date, 'd')}
              </div>
              <div
                className={[
                  'mt-1 text-[10px] leading-none',
                  booked === 0
                    ? 'text-slate-400'
                    : none
                      ? 'font-semibold text-rose-600'
                      : 'font-medium text-amber-700',
                ].join(' ')}
              >
                {booked === 0 ? `${free} free` : none ? 'none free' : `${free} free`}
              </div>
            </button>
          )
        })}
      </div>

      {inThisMonth.length === 0 && (
        <p className="mt-2 text-xs text-slate-400">
          Nothing booked in {format(parseISO(monthAnchor), 'MMMM')}.
          {nextElsewhere && (
            <>
              {' '}
              Next commitment{' '}
              <button
                type="button"
                onClick={() => {
                  setMonthAnchor(nextElsewhere)
                  setSelected(nextElsewhere)
                }}
                className="font-medium text-violet-600 underline-offset-2 hover:underline"
              >
                {format(parseISO(nextElsewhere), 'd MMM yyyy')}
              </button>
              .
            </>
          )}
        </p>
      )}

      {/* The chosen day, in full: the counts, then the copies behind them. */}
      <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-sm font-semibold text-slate-800">
            {format(parseISO(selected), 'EEEE d MMMM yyyy')}
          </span>
          <span className="text-xs text-slate-500">
            {chosen.total} total ·{' '}
            <span className={chosen.booked > 0 ? 'font-medium text-orange-600' : ''}>
              {chosen.booked} booked
            </span>{' '}
            ·{' '}
            <span className={chosen.free > 0 ? 'font-medium text-emerald-600' : 'text-rose-600'}>
              {chosen.free} free
            </span>
            {chosen.away > 0 && ` · ${chosen.away} in repair`}
          </span>
        </div>

        {rows.length > 0 ? (
          <ul className="mt-2 space-y-1">
            {rows.map((r) => (
              <li
                key={r.unitId}
                className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-slate-200"
              >
                <span className="font-mono font-medium text-slate-700">#{r.barcode}</span>
                <span className="text-slate-300">→</span>
                {r.setId ? (
                  <button
                    type="button"
                    onClick={() => peek({ type: 'job', id: r.setId })}
                    className="min-w-0 truncate font-medium text-violet-600 underline-offset-2 hover:underline"
                    title={r.setTitle || 'Open the shoot'}
                  >
                    {r.setTitle || 'Shoot'}
                  </button>
                ) : (
                  <span className="truncate text-slate-600">{r.setTitle || 'Reserved'}</span>
                )}
                {r.studioId && <span className="text-slate-400">{studioLabel(r.studioId)}</span>}
                {r.order?.setLabel && (
                  <span className="rounded bg-slate-100 px-1.5 text-[10px] font-medium text-slate-500">
                    {r.order.setLabel}
                  </span>
                )}
                {r.order?.poNumber && (
                  <span className="font-mono text-[10px] text-slate-400">{r.order.poNumber}</span>
                )}
                {/* A multi-day pull: say so, or "booked on the 4th" looks wrong
                    when the 4th is the middle of a three-day job. */}
                {r.from !== r.to && (
                  <span className="text-[10px] text-slate-400">
                    {format(parseISO(r.from), 'd MMM')} – {format(parseISO(r.to), 'd MMM')}
                  </span>
                )}
                <span className="ml-auto inline-flex items-center gap-1 text-slate-500">
                  <UserRound size={11} className="text-slate-400" />
                  {r.bookedBy || <span className="text-slate-400">seed data</span>}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-xs text-slate-400">
            Nothing of this item is booked on that day.
          </p>
        )}

        {chosen.awayUnits.length > 0 && (
          <ul className="mt-1 space-y-1">
            {chosen.awayUnits.map((u) => (
              <li
                key={u.unitId}
                className="flex items-center gap-2 rounded-lg bg-white px-2.5 py-1.5 text-xs ring-1 ring-amber-200"
              >
                <span className="font-mono font-medium text-slate-700">#{u.barcode}</span>
                <span className="inline-flex items-center gap-1 text-amber-700">
                  <Wrench size={11} />
                  out for repair — unbookable on every day
                </span>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-2 text-[11px] text-slate-400">
          Only CONFIRMED orders hold gear. A job still on hold is pencilled in and doesn&apos;t
          show here.
        </p>
      </div>
    </section>
  )
}
