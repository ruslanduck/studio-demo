import { useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Plus, CalendarDays } from 'lucide-react'
import {
  startOfWeek,
  endOfWeek,
  startOfMonth,
  endOfMonth,
  eachDayOfInterval,
  addDays,
  addWeeks,
  addMonths,
  format,
  parseISO,
  isToday,
  isWeekend,
  isSameMonth,
} from 'date-fns'
import { useStore } from '../store'
import { studioLabel, studioColor } from '../data/studios'
import BookingModal from './BookingModal'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

// Relative luminance (WCAG) of a #rrggbb color.
function luminance(hex) {
  const chan = (i) => {
    const v = parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16) / 255
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan(0) + 0.7152 * chan(1) + 0.0722 * chan(2)
}

// Pick white or near-black text — whichever contrasts better on a solid fill.
function readableText(hex) {
  const L = luminance(hex)
  const onWhite = 1.05 / (L + 0.05)
  const onDark = (L + 0.05) / (0.0181 + 0.05) // ~ #0f172a
  return onWhite >= onDark ? '#ffffff' : '#0f172a'
}

// Solid, high-visibility booking chip derived from a hex color.
function chipStyle(color) {
  return { backgroundColor: color, color: readableText(color) }
}

export default function StudioCalendar() {
  const studios = useStore((s) => s.studios)
  const bookings = useStore((s) => s.bookings)
  const selectedDate = useStore((s) => s.selectedDate)
  const setSelectedDate = useStore((s) => s.setSelectedDate)
  const calendarMode = useStore((s) => s.calendarMode)
  const setCalendarMode = useStore((s) => s.setCalendarMode)

  const [modal, setModal] = useState({ open: false, booking: null, prefill: null })

  const refDate = useMemo(() => parseISO(selectedDate), [selectedDate])

  // All active bookings grouped by ISO date, sorted by time then studio.
  const byDay = useMemo(() => {
    const map = new Map()
    for (const b of bookings) {
      if (b.status !== 'active') continue
      if (!map.has(b.date)) map.set(b.date, [])
      map.get(b.date).push(b)
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          a.startTime.localeCompare(b.startTime) ||
          String(a.studioId).localeCompare(String(b.studioId)),
      )
    }
    return map
  }, [bookings])

  const goToday = () => setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
  const goPrev = () =>
    setSelectedDate(
      format(
        calendarMode === 'month' ? addMonths(refDate, -1) : addWeeks(refDate, -1),
        'yyyy-MM-dd',
      ),
    )
  const goNext = () =>
    setSelectedDate(
      format(
        calendarMode === 'month' ? addMonths(refDate, 1) : addWeeks(refDate, 1),
        'yyyy-MM-dd',
      ),
    )

  const openCreate = (studioId, iso) =>
    setModal({ open: true, booking: null, prefill: { studioId, date: iso } })
  const openEdit = (booking) => setModal({ open: true, booking, prefill: null })
  const closeModal = () => setModal((m) => ({ ...m, open: false }))
  const jumpToWeek = (day) => {
    setSelectedDate(format(day, 'yyyy-MM-dd'))
    setCalendarMode('week')
  }

  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 })
  const label =
    calendarMode === 'month'
      ? format(refDate, 'MMMM yyyy')
      : `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">
            Studio Calendar
          </h2>
          <p className="text-sm text-slate-500">{label}</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <ModeToggle mode={calendarMode} setMode={setCalendarMode} />
          <button
            type="button"
            onClick={() => openCreate('1', selectedDate)}
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
              className="grid h-9 w-9 place-items-center rounded-l-lg text-slate-600 transition hover:bg-slate-100"
              aria-label="Previous"
            >
              <ChevronLeft size={18} />
            </button>
            <div className="h-5 w-px bg-slate-200" />
            <button
              type="button"
              onClick={goNext}
              className="grid h-9 w-9 place-items-center rounded-r-lg text-slate-600 transition hover:bg-slate-100"
              aria-label="Next"
            >
              <ChevronRight size={18} />
            </button>
          </div>
        </div>
      </div>

      {calendarMode === 'month' ? (
        <MonthView
          refDate={refDate}
          byDay={byDay}
          onOpenEdit={openEdit}
          onJumpToWeek={jumpToWeek}
        />
      ) : (
        <WeekView
          weekStart={weekStart}
          studios={studios}
          byDay={byDay}
          onOpenCreate={openCreate}
          onOpenEdit={openEdit}
        />
      )}

      <BookingModal
        open={modal.open}
        onClose={closeModal}
        booking={modal.booking}
        prefill={modal.prefill}
      />
    </div>
  )
}

function ModeToggle({ mode, setMode }) {
  return (
    <div className="flex rounded-lg border border-slate-300 bg-white p-0.5">
      {['week', 'month'].map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition',
            mode === m
              ? 'bg-violet-600 text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

/* ---------------------------------- Week ---------------------------------- */

function WeekView({ weekStart, studios, byDay, onOpenCreate, onOpenEdit }) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const date = addDays(weekStart, i)
    return {
      date,
      iso: format(date, 'yyyy-MM-dd'),
      today: isToday(date),
      weekend: isWeekend(date),
    }
  })

  const colTint = (day) =>
    day.today ? 'bg-amber-50' : day.weekend ? 'bg-rose-50' : ''

  return (
    <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
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
          <WeekRow
            key={studioId}
            studioId={studioId}
            days={days}
            byDay={byDay}
            colTint={colTint}
            onOpenCreate={onOpenCreate}
            onOpenEdit={onOpenEdit}
          />
        ))}
      </div>
    </div>
  )
}

function WeekRow({ studioId, days, byDay, colTint, onOpenCreate, onOpenEdit }) {
  return (
    <>
      <div className="flex min-h-[92px] items-center justify-center border-b border-r border-slate-200 bg-slate-50">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-white text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
          {studioId}
        </span>
      </div>
      {days.map((day) => {
        const cellBookings = (byDay.get(day.iso) ?? []).filter(
          (b) => b.studioId === studioId,
        )
        return (
          <div
            key={day.iso}
            onClick={() => onOpenCreate(studioId, day.iso)}
            title={`Add booking · ${studioLabel(studioId)} · ${day.iso}`}
            className={[
              'group relative min-h-[92px] cursor-pointer space-y-1 border-b border-r border-slate-200 p-1.5 transition hover:bg-slate-50/70',
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
                className="cursor-pointer rounded-md px-1.5 py-1 shadow-sm ring-1 ring-black/5 transition hover:brightness-110"
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

/* --------------------------------- Month ---------------------------------- */

const MONTH_CHIP_MAX = 3

function MonthView({ refDate, byDay, onOpenEdit, onJumpToWeek }) {
  const gridStart = startOfWeek(startOfMonth(refDate), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(refDate), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Weekday header */}
      <div className="grid grid-cols-7 border-b border-slate-200">
        {WEEKDAYS.map((d, i) => (
          <div
            key={d}
            className={[
              'px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide',
              i >= 5 ? 'text-rose-400' : 'text-slate-400',
            ].join(' ')}
          >
            {d}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid flex-1 auto-rows-[minmax(6rem,1fr)] grid-cols-7 overflow-auto">
        {days.map((day) => (
          <MonthCell
            key={day.toISOString()}
            day={day}
            refDate={refDate}
            dayBookings={byDay.get(format(day, 'yyyy-MM-dd')) ?? []}
            onOpenEdit={onOpenEdit}
            onJumpToWeek={onJumpToWeek}
          />
        ))}
      </div>
    </div>
  )
}

function MonthCell({ day, refDate, dayBookings, onOpenEdit, onJumpToWeek }) {
  const inMonth = isSameMonth(day, refDate)
  const today = isToday(day)
  const weekend = isWeekend(day)

  const shown = dayBookings.slice(0, MONTH_CHIP_MAX)
  const extra = dayBookings.length - shown.length

  const bg = !inMonth
    ? 'bg-slate-50/60'
    : today
      ? 'bg-amber-50'
      : weekend
        ? 'bg-rose-50/50'
        : 'bg-white'

  return (
    <div
      onClick={() => onJumpToWeek(day)}
      title="Jump to this week"
      className={[
        'group flex min-h-0 cursor-pointer flex-col gap-1 border-b border-r border-slate-200 p-1.5 transition hover:bg-violet-50/40',
        bg,
      ].join(' ')}
    >
      <div className="flex items-center justify-between">
        <span
          className={[
            'grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold',
            today
              ? 'bg-amber-500 text-white'
              : inMonth
                ? 'text-slate-700'
                : 'text-slate-300',
          ].join(' ')}
        >
          {format(day, 'd')}
        </span>
        <Plus
          size={14}
          className="text-slate-300 opacity-0 transition group-hover:opacity-100"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
        {shown.map((b) => (
          <div
            key={b.id}
            role="button"
            tabIndex={0}
            onClick={(e) => {
              e.stopPropagation()
              onOpenEdit(b)
            }}
            style={chipStyle(studioColor(b.studioId))}
            className="flex cursor-pointer items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight shadow-sm ring-1 ring-black/5 transition hover:brightness-110"
          >
            <span className="font-bold">{b.studioId}</span>
            <span className="truncate">{b.title}</span>
          </div>
        ))}
        {extra > 0 && (
          <div className="px-1 text-[10px] font-medium text-slate-400">
            +{extra} more
          </div>
        )}
      </div>
    </div>
  )
}
