import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus } from 'lucide-react'
import {
  startOfWeek,
  addDays,
  addWeeks,
  format,
  parseISO,
  isToday,
  isWeekend,
} from 'date-fns'
import { useStore } from '../store'
import { studioLabel } from '../data/studios'
import BookingModal from './BookingModal'

// Light tint + solid accent for a booking chip, derived from its hex color.
function chipStyle(color) {
  return {
    backgroundColor: `${color}1a`,
    color,
    borderLeft: `3px solid ${color}`,
  }
}

export default function StudioCalendar() {
  const studios = useStore((s) => s.studios)
  const bookings = useStore((s) => s.bookings)
  const selectedDate = useStore((s) => s.selectedDate)
  const setSelectedDate = useStore((s) => s.setSelectedDate)

  const [modal, setModal] = useState({ open: false, booking: null, prefill: null })

  const refDate = useMemo(() => parseISO(selectedDate), [selectedDate])
  const weekStart = useMemo(
    () => startOfWeek(refDate, { weekStartsOn: 1 }),
    [refDate],
  )

  const days = useMemo(
    () =>
      Array.from({ length: 7 }, (_, i) => {
        const date = addDays(weekStart, i)
        return {
          date,
          iso: format(date, 'yyyy-MM-dd'),
          today: isToday(date),
          weekend: isWeekend(date),
        }
      }),
    [weekStart],
  )

  // Fast lookup: `${studioId}|${iso}` -> bookings[]
  const cellMap = useMemo(() => {
    const map = new Map()
    for (const b of bookings) {
      if (b.status !== 'active') continue
      const key = `${b.studioId}|${b.date}`
      if (!map.has(key)) map.set(key, [])
      map.get(key).push(b)
    }
    for (const list of map.values()) {
      list.sort((a, b) => a.startTime.localeCompare(b.startTime))
    }
    return map
  }, [bookings])

  const weekLabel = `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`

  const goToday = () => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
  const goPrev = () => setSelectedDate(format(addWeeks(refDate, -1), 'yyyy-MM-dd'))
  const goNext = () => setSelectedDate(format(addWeeks(refDate, 1), 'yyyy-MM-dd'))

  const openCreate = (studioId, iso) =>
    setModal({ open: true, booking: null, prefill: { studioId, date: iso } })
  const openEdit = (booking) =>
    setModal({ open: true, booking, prefill: null })
  const closeModal = () => setModal((m) => ({ ...m, open: false }))

  function colTint(day) {
    if (day.today) return 'bg-amber-50'
    if (day.weekend) return 'bg-rose-50'
    return ''
  }

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header / nav */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Studio Calendar
          </h2>
          <p className="text-sm text-slate-500">{weekLabel}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => openCreate('1', format(new Date(), 'yyyy-MM-dd'))}
            className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
          >
            <Plus size={16} />
            New booking
          </button>
          <button
            type="button"
            onClick={goToday}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
          >
            Today
          </button>
          <div className="flex items-center rounded-lg border border-slate-300">
            <button
              type="button"
              onClick={goPrev}
              className="grid h-9 w-9 place-items-center text-slate-600 transition hover:bg-slate-100"
              aria-label="Previous week"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="w-px self-stretch bg-slate-200" />
            <button
              type="button"
              onClick={goNext}
              className="grid h-9 w-9 place-items-center text-slate-600 transition hover:bg-slate-100"
              aria-label="Next week"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {/* Grid */}
      <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white">
        <div className="grid min-w-[720px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
          {/* Header row */}
          <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-white" />
          {days.map((day) => (
            <div
              key={day.iso}
              className={[
                'sticky top-0 z-20 border-b border-r border-slate-200 px-2 py-2 text-center',
                day.today ? 'bg-amber-50' : day.weekend ? 'bg-rose-50' : 'bg-white',
              ].join(' ')}
            >
              <div
                className={[
                  'text-[11px] font-medium uppercase tracking-wide',
                  day.today ? 'text-amber-600' : 'text-slate-400',
                ].join(' ')}
              >
                {format(day.date, 'EEE')}
              </div>
              <div
                className={[
                  'text-sm font-semibold',
                  day.today ? 'text-amber-700' : 'text-slate-800',
                ].join(' ')}
              >
                {format(day.date, 'MMM d')}
              </div>
            </div>
          ))}

          {/* Studio rows */}
          {studios.map((studioId) => (
            <Row
              key={studioId}
              studioId={studioId}
              days={days}
              cellMap={cellMap}
              colTint={colTint}
              onOpenCreate={openCreate}
              onOpenEdit={openEdit}
            />
          ))}
        </div>
      </div>

      <BookingModal
        open={modal.open}
        onClose={closeModal}
        booking={modal.booking}
        prefill={modal.prefill}
      />
    </div>
  )
}

function Row({ studioId, days, cellMap, colTint, onOpenCreate, onOpenEdit }) {
  return (
    <>
      <div className="flex min-h-[92px] items-center justify-center border-b border-r border-slate-200 bg-slate-50">
        <span className="text-base font-semibold text-slate-500">{studioId}</span>
      </div>
      {days.map((day) => {
        const cellBookings = cellMap.get(`${studioId}|${day.iso}`) ?? []
        return (
          <div
            key={day.iso}
            onClick={() => onOpenCreate(studioId, day.iso)}
            title={`Add booking · ${studioLabel(studioId)} · ${day.iso}`}
            className={[
              'group relative min-h-[92px] cursor-pointer space-y-1 border-b border-r border-slate-200 p-1.5 text-left transition hover:bg-slate-50/70',
              colTint(day),
            ].join(' ')}
          >
            {cellBookings.map((b) => (
              <div
                key={b.id}
                role="button"
                tabIndex={0}
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenEdit(b)
                }}
                style={chipStyle(b.color)}
                className="cursor-pointer rounded-md px-1.5 py-1 text-left transition hover:brightness-95"
              >
                <div className="truncate text-xs font-semibold leading-tight">
                  {b.title}
                </div>
                <div className="text-[10px] font-medium opacity-80">
                  {b.startTime}–{b.endTime}
                </div>
              </div>
            ))}
            {cellBookings.length === 0 && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center opacity-0 transition group-hover:opacity-100">
                <Plus size={16} className="text-slate-300" />
              </span>
            )}
          </div>
        )
      })}
    </>
  )
}
