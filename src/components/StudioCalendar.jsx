import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Plus,
  AlertTriangle,
  Camera,
  UserRound,
  Package,
  Tag,
  Layers,
} from 'lucide-react'
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
  setMonth,
  setYear,
} from 'date-fns'
import { useStore } from '../store'
import { brandsIn, jobTypesIn } from '../lib/orderSearch'
import { setDays, spanSummary, spanLabel } from '../lib/setDays'
import {
  earliestCall,
  callSummary,
  rolesFor,
  rolesLabel,
  normalizeCallTimes,
} from '../lib/callTimes'
import { studioLabel } from '../data/studios'
import {
  ORDER_STATUS_CHOICES,
  orderStatusColor,
  orderStatusMeta,
  NO_STATUS_COLOR,
} from '../data/orderStatus'
import { useCan } from '../lib/useCan'
import { useCalendarFlip } from '../lib/useCalendarFlip'
import { CAP } from '../lib/permissions'
import MonthYearPicker from './MonthYearPicker'
import StatusMenu from './StatusMenu'
import { useLongPress } from '../lib/useLongPress'
import BookingModal from './BookingModal'
import OrderEditorModal from './OrderEditorModal'

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
  const c = color || '#64748b'
  return { backgroundColor: c, color: readableText(c) }
}

// A chip is painted by its job's STATUS — Hold yellow, Confirmed green, Closed
// grey, Canceled red — from the same definition as the pills, so the calendar
// and the jobs list can never disagree about what a colour means. The per-shoot
// seed colour is gone: a decorative rainbow said nothing, and this says the one
// thing a person scanning a week actually needs.
const chipColor = (b) => (b.status ? orderStatusColor(b.status) : NO_STATUS_COLOR)

// ONE chip for both grids, because the gestures have to be identical.
//
// Three ways into the status menu, deliberately: RIGHT-CLICK (what a desktop
// user reaches for), a LONG-PRESS (the only equivalent a phone has), and the
// visible chevron (for everyone who tries neither, on either device). A plain
// click/tap opens the job — that is the common action and it stays one tap.
function BookingChip({ b, variant = 'week', onOpen, onStatus, canManage }) {
  const meta = b.status ? orderStatusMeta(b.status) : null
  const canChange = canManage && !!b.orderId
  const press = useLongPress((at) => canChange && onStatus(b, at))
  const month = variant === 'month'

  const tip = [
    month ? studioLabel(b.studioId) : null,
    b.title,
    meta ? meta.label : 'no job attached',
    b.setLabel && `Set ${b.setLabel}`,
    spanSummary(b.date, b.endDate),
    b.spanDays > 1 && `day ${b.dayIndex} of ${b.spanDays}`,
    // The whole call sheet on hover; the chip has room for one number, and
    // "when do I have to be there" is that number.
    callSummary(b.callTimes),
    b.wrapTime && `wrap ${b.wrapTime}`,
    canChange ? 'right-click (or hold) to change the status' : null,
  ]
    .filter(Boolean)
    .join(' · ')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        e.stopPropagation()
        onOpen(b)
      }}
      {...press}
      style={chipStyle(chipColor(b))}
      // Job names follow the studio's convention
      // (20260716_AT_MAIN_SepMM_Missy_OMSet1), which never fits a day cell —
      // the full name is on hover.
      title={tip}
      className={[
        'group/chip relative cursor-pointer shadow-sm ring-1 ring-black/5 transition hover:brightness-110',
        month
          ? 'flex items-center gap-1 rounded px-1 py-0.5 text-[10px] leading-tight'
          : 'rounded-md px-1.5 py-1',
      ].join(' ')}
    >
      {month ? (
        <>
          <span className="font-bold">{b.studioId}</span>
          <span className="min-w-0 flex-1 truncate">{b.title}</span>
          {b.spanDays > 1 && (
            <span className="shrink-0 font-semibold opacity-80">
              {b.dayIndex}/{b.spanDays}
            </span>
          )}
        </>
      ) : (
        <>
          <div className="truncate pr-4 text-xs font-semibold leading-tight">{b.title}</div>
          {(b.spanDays > 1 || b.setLabel || earliestCall(b.callTimes)) && (
            <div className="truncate text-[10px] font-medium opacity-80">
              {[
                earliestCall(b.callTimes),
                b.spanDays > 1 && `Day ${b.dayIndex}/${b.spanDays}`,
                b.setLabel,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </>
      )}

      {/* The third way in — always there, not only on hover: a hover-only
          control does not exist on a touch screen. */}
      {canChange && (
        <button
          type="button"
          aria-label={`Status: ${meta?.label ?? 'unknown'} — change it`}
          title={`${meta?.label ?? 'Status'} — change the status`}
          onClick={(e) => {
            e.stopPropagation()
            const r = e.currentTarget.getBoundingClientRect()
            onStatus(b, { x: r.left, y: r.bottom + 4 })
          }}
          // The glyph stays small so it can't cover the job name in a narrow
          // cell, but `after:-inset-2` extends the TOUCH area well past it —
          // a 16px target is not something you hit with a thumb.
          className={[
            "absolute grid place-items-center rounded-full bg-black/10 transition after:absolute after:-inset-2 after:content-[''] hover:bg-black/25",
            month ? 'right-0.5 top-0.5 h-3 w-3' : 'right-1 top-1 h-4 w-4',
          ].join(' ')}
        >
          <ChevronDown size={month ? 9 : 11} />
        </button>
      )}
    </div>
  )
}

export default function StudioCalendar() {
  const studios = useStore((s) => s.studios)
  const bookings = useStore((s) => s.bookings)
  const photographers = useStore((s) => s.photographers)
  const selectedDate = useStore((s) => s.selectedDate)
  const setSelectedDate = useStore((s) => s.setSelectedDate)
  const calendarMode = useStore((s) => s.calendarMode)
  const setCalendarMode = useStore((s) => s.setCalendarMode)
  // Only for the chips' Set label — the shoots themselves come from `bookings`.
  const orders = useStore((s) => s.orders)
  // Step one of creating an order is answered here; the Orders view's equipment
  // window is what actually writes it. Equipment is NOT picked on the calendar,
  // so none of the stock collections are read here any more.
  // Suggestion lists for the job form. The calendar renders the SAME editor, and
  // a shared modal's new props have to be fed from every call site — forgetting
  // that is exactly how `companies={companies}` white-screened this view.
  const brandOptions = useMemo(() => brandsIn(orders), [orders])
  const typeOptions = useMemo(() => jobTypesIn(orders), [orders])
  // Roles already used on any shoot stay offered, so a typed one doesn't vanish
  // from the list that suggested it.
  const roleOptions = useMemo(() => rolesFor(bookings), [bookings])
  const openOrderDraft = useStore((s) => s.openOrderDraft)
  const updateOrder = useStore((s) => s.updateOrder)
  const peek = useStore((s) => s.peek)
  const can = useCan()
  const canCreate = can(CAP.BOOKING_CREATE)
  // Changing a job's status from the calendar is the same act as changing it on
  // the job card, so it answers to the same capability.
  const canManage = can(CAP.ORDER_MANAGE)

  // A shoot on the calendar IS an order: creating one opens the order editor
  // (which books the Set), and clicking a shoot opens its order. The booking
  // modal stays only as a fallback for legacy order-less shoots.
  const [modal, setModal] = useState({ open: false, booking: null, prefill: null })
  const [orderEditor, setOrderEditor] = useState({ open: false, prefill: null })
  // The status menu: which chip raised it, and where the pointer was.
  const [statusMenu, setStatusMenu] = useState(null)
  // Why a status change was refused (closing with gear still scanned out).
  const [statusError, setStatusError] = useState(null)

  const refDate = useMemo(() => parseISO(selectedDate), [selectedDate])

  // All active bookings grouped by ISO date, sorted by studio then job name.
  // Each chip also carries its order's hand-typed Set designation — with several
  // shoots in one studio on one day, that's what tells them apart at a glance.
  //
  // A shoot can run for SEVERAL DAYS, and it appears in EVERY day it covers:
  // the studio really is taken on all of them, and a grid that showed the job
  // only on its first day would read as free for the rest. `dayIndex` /
  // `spanDays` are what let a chip say "Day 2/3" instead of pretending each
  // cell is a separate booking.
  const byDay = useMemo(() => {
    const orderById = new Map(orders.map((o) => [o.id, o]))
    const map = new Map()
    for (const b of bookings) {
      if (b.status !== 'active') continue
      // An archived shoot is off the calendar — it lives in the Archive until
      // someone restores it (archiving its order takes it down with it).
      if (b.archivedAt) continue
      const order = b.orderId ? orderById.get(b.orderId) : null
      const days = setDays(b.date, b.endDate)
      days.forEach((iso, i) => {
        if (!map.has(iso)) map.set(iso, [])
        map.get(iso).push({
          ...b,
          setLabel: order?.setLabel || null,
          // What the chip is painted by, and what its status menu edits.
          status: order?.status || null,
          // The day view has room for the rest of the job's identity.
          brand: order?.brand || null,
          jobType: order?.jobType || null,
          poNumber: order?.poNumber || null,
          lineCount: (order?.lines || []).length,
          spanDays: days.length,
          dayIndex: i + 1,
        })
      })
    }
    for (const list of map.values()) {
      list.sort(
        (a, b) =>
          String(a.studioId).localeCompare(String(b.studioId)) ||
          (a.title || '').localeCompare(b.title || ''),
      )
    }
    return map
  }, [bookings, orders])

  // Whether the month/year chooser is open, and where to draw it.
  const [jumping, setJumping] = useState(false)
  const jumpBtn = useRef(null)
  const jumpPop = useRef(null)
  const [jumpAt, setJumpAt] = useState(null)

  // The date as the store has it RIGHT NOW. Every control that steps or jumps
  // reads through this, so clicks faster than a re-render can't compute from a
  // stale value.
  const currentRef = () => parseISO(useStore.getState().selectedDate)

  const goToday = () => {
    setSelectedDate(format(new Date(), 'yyyy-MM-dd'))
    setJumping(false)
  }

  // Paging reads the date from the STORE, not from this render's closure: two
  // clicks on › faster than a re-render would otherwise both step from the same
  // starting point and one would be lost. (Third time this trap has appeared —
  // see ItemAvailability's stepMonth and the month/year handlers below.)
  const page = (delta) => {
    setJumping(false)
    const at = currentRef()
    const stepped =
      calendarMode === 'month'
        ? addMonths(at, delta)
        : calendarMode === 'day'
          ? addDays(at, delta)
          : addWeeks(at, delta)
    setSelectedDate(format(stepped, 'yyyy-MM-dd'))
  }
  const goPrev = () => page(-1)
  const goNext = () => page(1)

  // Create = a new order (booked onto this studio/day). The order starts on Hold
  // and its Set lands on the calendar; equipment is added from the order.
  const openCreate = (studioId, iso) => {
    if (!canCreate) return
    // Both ends of the window: clicking one cell means a one-day shoot until
    // the crew says otherwise, and the form shows that rather than an empty box.
    setOrderEditor({ open: true, prefill: { studioId, startsOn: iso, endsOn: iso } })
  }
  // Click a shoot → open it as a layered card (crew, its order, the gear on the
  // day) without leaving the calendar; from there the order and every item are a
  // click deeper. A legacy shoot with no order at all still opens in the booking
  // modal, which is the only place left to edit or delete it.
  // Click a shoot → open its JOB as a layered card, without leaving the
  // calendar. It used to open a card for the SHOOT, from which the job was one
  // more click — but a shoot is not a record anyone keeps; the job is, and it
  // carries the crew, the gear and the estimate anyway. A legacy shoot with no
  // job at all still opens in the booking modal, the only place left to edit it.
  const openEdit = (booking) => {
    if (booking.orderId) peek({ type: 'order', id: booking.orderId })
    else setModal({ open: true, booking, prefill: null })
  }

  const openStatus = (booking, at) => {
    setStatusError(null)
    setStatusMenu({ orderId: booking.orderId, status: booking.status, title: booking.title, at })
  }

  // The store owns the rules (closing refuses while gear is still scanned out,
  // and confirming/releasing rewrites the reservations), so this only has to
  // report what came back.
  const pickStatus = async (status) => {
    const target = statusMenu
    setStatusMenu(null)
    if (!target?.orderId) return
    const res = await updateOrder(target.orderId, { status })
    if (res?.error) setStatusError(res.error)
  }
  const closeModal = () => setModal((m) => ({ ...m, open: false }))
  const jumpToWeek = (day) => {
    setSelectedDate(format(day, 'yyyy-MM-dd'))
    setCalendarMode('week')
  }
  // Open the day view ON a named day — a day cell in the month grid, a day
  // header in the week grid. Reads the store, not the closure (the rule).
  const jumpToDay = (iso) => {
    setJumping(false)
    setSelectedDate(iso)
    setCalendarMode('day')
  }
  // The toggle itself: Day means TODAY, because that is what a day view is for.
  const pickMode = (mode) => {
    if (mode === 'day') return jumpToDay(format(new Date(), 'yyyy-MM-dd'))
    setCalendarMode(mode)
  }

  // Same popover contract as DateField: fixed through a portal so nothing clips
  // it, outside-click and Escape to close.
  useLayoutEffect(() => {
    if (!jumping) return
    const place = () => {
      const r = jumpBtn.current?.getBoundingClientRect()
      if (!r) return
      const w = 232
      setJumpAt({ top: r.bottom + 6, left: Math.max(8, Math.min(r.left, window.innerWidth - w - 8)), width: w })
    }
    place()
    // NOTE: `document`, not `window` — a scroll INSIDE a container (this app's
    // modals scroll) never reaches a capture listener on window; measured with a
    // probe. `document` is on the propagation path, which is why it is the idiom.
    document.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      document.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [jumping])

  useEffect(() => {
    if (!jumping) return
    const onDown = (e) => {
      if (jumpBtn.current?.contains(e.target)) return
      if (jumpPop.current?.contains(e.target)) return
      setJumping(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setJumping(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [jumping])

  const weekStart = startOfWeek(refDate, { weekStartsOn: 1 })

  // Jump to a month/year instead of paging there: a shoot two years out is 24
  // clicks of the arrow away, and a past season is worse. Picking a month keeps
  // the day of the month where it can (clamped by that month's length), so the
  // week view lands on a comparable week rather than always on the 1st.
  const jumpTo = (date) => {
    setSelectedDate(format(date, 'yyyy-MM-dd'))
    setJumping(false)
  }

  const label =
    calendarMode === 'month'
      ? format(refDate, 'MMMM yyyy')
      : calendarMode === 'day'
        ? format(refDate, 'EEEE, d MMMM yyyy')
        : `${format(weekStart, 'MMM d')} – ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`

  // The page currently on screen: the month for the month view, the week's first
  // day for the week view. Sortable, so the flip knows forwards from backwards.
  const pageKey =
    calendarMode === 'month'
      ? `month:${format(refDate, 'yyyy-MM')}`
      : calendarMode === 'day'
        ? `day:${selectedDate}`
        : `week:${format(weekStart, 'yyyy-MM-dd')}`
  const flip = useCalendarFlip(pageKey)

  return (
    <div className="flex h-full flex-col gap-4">
      {/* Header / controls */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">Calendar</h2>
          {/* The period is the control: click it to pick a month and year. */}
          <button
            ref={jumpBtn}
            type="button"
            onClick={() => setJumping((v) => !v)}
            title="Pick a month and year"
            className="-ml-1 inline-flex items-center gap-1 rounded-md px-1 text-sm text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
          >
            {label}
            <ChevronDown
              size={13}
              className={['text-slate-400 transition', jumping ? 'rotate-180' : ''].join(' ')}
            />
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* What the colours mean. Colour-coding without a key is decoration,
              and this one carries a real instruction as its tooltip. */}
          <div
            className="hidden items-center gap-2.5 pr-1 sm:flex"
            title={
              canManage
                ? 'A chip is painted by its status. Right-click or hold one to change it.'
                : 'A chip is painted by its status.'
            }
          >
            {ORDER_STATUS_CHOICES.map((v) => (
              <span key={v} className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: orderStatusColor(v) }}
                />
                {orderStatusMeta(v).label}
              </span>
            ))}
          </div>
          <ModeToggle mode={calendarMode} setMode={pickMode} />
          {canCreate && (
            <button
              type="button"
              onClick={() => openCreate('1', selectedDate)}
              className="inline-flex items-center gap-2 rounded-lg bg-brand px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-brand-strong"
            >
              <Plus size={16} />
              New job
            </button>
          )}
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

      {jumping &&
        jumpAt &&
        createPortal(
          <div
            ref={jumpPop}
            style={{ position: 'fixed', top: jumpAt.top, left: jumpAt.left, width: jumpAt.width }}
            className="z-[70] rounded-xl border border-slate-200 bg-surface p-2 shadow-xl"
          >
            <MonthYearPicker
              month={refDate.getMonth()}
              year={refDate.getFullYear()}
              // Both read the date from the STORE, not from this render's closure:
              // picking a year and then a month faster than a re-render would
              // otherwise compute the month from the pre-jump year and lose it.
              // (Same trap as ItemAvailability's stepMonth.)
              onMonth={(i) => jumpTo(setMonth(currentRef(), i))}
              onYear={(y) => setSelectedDate(format(setYear(currentRef(), y), 'yyyy-MM-dd'))}
            />
          </div>,
          document.body,
        )}

      {/* `key` = the page being shown, so ‹ › remount the grid and its slide
          replays (lib/useCalendarFlip picks the direction). Switching Week ↔
          Month is a page turn too, hence the mode in the key. */}
      {calendarMode === 'day' ? (
        <DayView
          key={pageKey}
          flip={flip}
          iso={selectedDate}
          studios={studios}
          byDay={byDay}
          onOpenCreate={canCreate ? openCreate : null}
          onOpenEdit={openEdit}
          onStatus={openStatus}
          canManage={canManage}
        />
      ) : calendarMode === 'month' ? (
        <MonthView
          key={pageKey}
          flip={flip}
          refDate={refDate}
          byDay={byDay}
          onOpenEdit={openEdit}
          onJumpToWeek={jumpToWeek}
          onOpenDay={jumpToDay}
          onStatus={openStatus}
          canManage={canManage}
        />
      ) : (
        <WeekView
          key={pageKey}
          flip={flip}
          weekStart={weekStart}
          studios={studios}
          byDay={byDay}
          onOpenCreate={openCreate}
          onOpenEdit={openEdit}
          onStatus={openStatus}
          onOpenDay={jumpToDay}
          canManage={canManage}
        />
      )}

      {statusMenu && (
        <StatusMenu
          at={statusMenu.at}
          status={statusMenu.status}
          title={statusMenu.title || 'Job status'}
          onPick={pickStatus}
          onClose={() => setStatusMenu(null)}
        />
      )}

      {/* A refusal has to be readable where the click happened, not only on the
          job card. Closing with gear still scanned out is the one that fires. */}
      {statusError && (
        <div className="flex items-start gap-2 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 flex-1">{statusError}</span>
          <button
            type="button"
            onClick={() => setStatusError(null)}
            className="shrink-0 rounded px-1 text-rose-500 hover:bg-rose-100"
          >
            Dismiss
          </button>
        </div>
      )}

      <BookingModal
        open={modal.open}
        onClose={closeModal}
        booking={modal.booking}
        prefill={modal.prefill}
      />

      {/* Create a shoot = create its order (books the Set onto the calendar).
          The same two-step form as in the Orders view: this settles the job and
          hands it over, the equipment window there creates it. */}
      <OrderEditorModal
        open={orderEditor.open}
        order={null}
        prefill={orderEditor.prefill}
        studios={studios}
        photographers={photographers}
        brands={brandOptions}
        jobTypes={typeOptions}
        roleOptions={roleOptions}
        onClose={() => setOrderEditor({ open: false, prefill: null })}
        onProceed={(payload) => {
          openOrderDraft(payload, { view: 'calendar', label: 'Calendar', focus: {} })
          return { ok: true }
        }}
      />
    </div>
  )
}

// Day / Week / Month, narrowest first. Picking **Day** jumps to today —
// "текущий по дефолту" — because a day view opened on last month's Tuesday is
// not what anyone means by it. A day cell in the month grid and a day header in
// the week grid open the day they name instead, which is the other half of it.
function ModeToggle({ mode, setMode }) {
  return (
    <div className="flex rounded-lg border border-slate-300 bg-surface p-0.5">
      {['day', 'week', 'month'].map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => setMode(m)}
          className={[
            'rounded-md px-3 py-1.5 text-sm font-medium capitalize transition',
            mode === m
              ? 'bg-brand text-white shadow-sm'
              : 'text-slate-600 hover:bg-slate-100',
          ].join(' ')}
        >
          {m}
        </button>
      ))}
    </div>
  )
}

/* ----------------------------------- Day ---------------------------------- */

// One shoot, as a row in the day view. This is the view a coordinator stands in
// front of in the morning, so it carries what the grid has no room for: the
// whole call sheet, the wrap, who is on it and how much gear goes out.
function DaySetCard({ b, onOpen, onStatus, canManage }) {
  const meta = b.status ? orderStatusMeta(b.status) : null
  const canChange = canManage && !!b.orderId
  const press = useLongPress((at) => canChange && onStatus(b, at))
  const calls = normalizeCallTimes(b.callTimes)

  return (
    <li
      role="button"
      tabIndex={0}
      onClick={() => onOpen(b)}
      {...press}
      title="Open this job"
      className="cursor-pointer rounded-xl border border-slate-200 bg-surface p-3 shadow-sm transition hover:border-violet-300 hover:shadow"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-900">{b.title}</p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {b.setLabel && (
              <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 font-medium text-slate-600">
                <Layers size={11} />
                {b.setLabel}
              </span>
            )}
            {/* The TYPE is what tells a style-out from a shoot at a glance. */}
            {b.jobType && (
              <span className="inline-flex items-center gap-1 rounded-full bg-violet-50 px-2 py-0.5 font-medium text-violet-700">
                <Tag size={11} />
                {b.jobType}
              </span>
            )}
            {b.brand && <span className="font-medium text-slate-600">{b.brand}</span>}
            {b.poNumber && <span className="font-mono text-slate-400">{b.poNumber}</span>}
            {b.spanDays > 1 && (
              <span className="text-slate-500">
                day {b.dayIndex} of {b.spanDays} · {spanLabel(b.date, b.endDate)}
              </span>
            )}
          </p>
        </div>

        {/* The status, and the control that changes it — the same menu the grid
            chips raise, so there is one way to do this. */}
        <span className="flex shrink-0 items-center gap-1">
          <span
            className={[
              'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1',
              meta ? meta.pill : 'bg-slate-100 text-slate-500 ring-slate-200',
            ].join(' ')}
          >
            <span
              className={['h-1.5 w-1.5 rounded-full', meta ? meta.dot : 'bg-slate-300'].join(' ')}
            />
            {meta ? meta.label : 'no job'}
          </span>
          {canChange && (
            <button
              type="button"
              aria-label={`Status: ${meta?.label ?? 'unknown'} — change it`}
              title="Change the status"
              onClick={(e) => {
                e.stopPropagation()
                const r = e.currentTarget.getBoundingClientRect()
                onStatus(b, { x: r.left, y: r.bottom + 4 })
              }}
              className="grid h-6 w-6 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
            >
              <ChevronDown size={14} />
            </button>
          )}
        </span>
      </div>

      {/* The call sheet: the reason to look at a single day at all. */}
      <div className="mt-2 border-t border-slate-100 pt-2">
        {calls.length === 0 && !b.wrapTime ? (
          <p className="text-xs text-slate-400">No call times set.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {calls.map((c, i) => (
              <span key={c.id || i} className="inline-flex items-baseline gap-1.5 text-xs">
                <span className="font-semibold tabular-nums text-slate-800">{c.time}</span>
                <span className="text-slate-600">{rolesLabel(c)}</span>
                {c.note && <span className="text-slate-400">· {c.note}</span>}
              </span>
            ))}
            {b.wrapTime && (
              <span className="inline-flex items-baseline gap-1.5 text-xs">
                <span className="font-semibold tabular-nums text-slate-800">{b.wrapTime}</span>
                <span className="text-slate-500">wrap</span>
              </span>
            )}
          </div>
        )}
      </div>

      <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
        {b.photographer && (
          <span className="inline-flex items-center gap-1">
            <Camera size={12} className="text-slate-400" />
            {b.photographer}
          </span>
        )}
        {b.model && (
          <span className="inline-flex items-center gap-1">
            <UserRound size={12} className="text-slate-400" />
            {b.model}
          </span>
        )}
        {/* What the job actually HOLDS, which is not the length of the unit
            list: a closed set keeps its units as history flagged returned, and
            a hold reserves nothing at all. Saying "8 pc(s) held" for either
            would be a chip that lies about where the gear is. */}
        <span className="inline-flex items-center gap-1">
          <Package size={12} className="text-slate-400" />
          {b.unitsReturned
            ? `${(b.unitIds || []).length} pc(s) went out · back on the shelf`
            : (b.unitIds || []).length > 0
              ? `${(b.unitIds || []).length} pc(s) held`
              : 'nothing held yet'}
          {b.lineCount > 0 && <span className="text-slate-400"> · {b.lineCount} line(s)</span>}
        </span>
      </p>
    </li>
  )
}

// Every set on ONE day, grouped by studio — including Studio L, which is where
// the location shoots sit, and including every studio with nothing on it,
// because "what is free today" is half of what this view answers.
function DayView({ iso, studios, byDay, onOpenCreate, onOpenEdit, onStatus, canManage, flip = '' }) {
  const all = byDay.get(iso) ?? []
  const groups = studios.map((studioId) => ({
    studioId,
    sets: all.filter((b) => b.studioId === studioId),
  }))
  // A set in a studio this app doesn't list (legacy data) still has to appear.
  for (const b of all)
    if (!studios.includes(b.studioId) && !groups.some((g) => g.studioId === b.studioId))
      groups.push({ studioId: b.studioId, sets: all.filter((x) => x.studioId === b.studioId) })
  const free = groups.filter((g) => g.sets.length === 0).length

  return (
    <div className={`min-h-0 flex-1 overflow-auto ${flip}`}>
      <p className="mb-3 text-sm text-slate-500">
        {all.length === 0 ? (
          'Nothing booked on this day.'
        ) : (
          <>
            <span className="font-medium text-slate-700">
              {all.length} shoot{all.length === 1 ? '' : 's'}
            </span>
            {free > 0 && ` · ${free} studio${free === 1 ? '' : 's'} free`}
          </>
        )}
      </p>

      <div className="space-y-3 pb-4">
        {groups.map(({ studioId, sets }) => (
          <section key={studioId} className="rounded-xl border border-slate-200 bg-slate-50/60">
            <header className="flex items-center justify-between gap-2 px-3 py-2">
              <span className="inline-flex items-center gap-2">
                <span className="grid h-6 w-6 place-items-center rounded-md bg-surface text-xs font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
                  {studioId}
                </span>
                <span className="text-sm font-medium text-slate-700">{studioLabel(studioId)}</span>
                {sets.length > 1 && <span className="text-xs text-slate-400">{sets.length} sets</span>}
              </span>
              {sets.length === 0 && (
                <span className="inline-flex items-center gap-2">
                  <span className="text-xs text-slate-400">free</span>
                  {onOpenCreate && (
                    <button
                      type="button"
                      onClick={() => onOpenCreate(studioId, iso)}
                      className="inline-flex items-center gap-1 rounded-md border border-dashed border-slate-300 px-2 py-1 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
                    >
                      <Plus size={12} />
                      Book it
                    </button>
                  )}
                </span>
              )}
            </header>
            {sets.length > 0 && (
              <ul className="space-y-2 px-3 pb-3">
                {sets.map((b) => (
                  <DaySetCard
                    key={b.id}
                    b={b}
                    onOpen={onOpenEdit}
                    onStatus={onStatus}
                    canManage={canManage}
                  />
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  )
}

/* ---------------------------------- Week ---------------------------------- */

function WeekView({
  weekStart,
  studios,
  byDay,
  onOpenCreate,
  onOpenEdit,
  onStatus,
  onOpenDay,
  canManage,
  flip = '',
}) {
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
    <div
      className={`min-h-0 flex-1 overflow-auto rounded-xl border border-slate-200 bg-surface shadow-sm ${flip}`}
    >
      <div className="grid min-w-[760px] grid-cols-[56px_repeat(7,minmax(0,1fr))]">
        {/* Header row */}
        <div className="sticky top-0 z-20 border-b border-r border-slate-200 bg-surface" />
        {days.map((day) => (
          <button
            key={day.iso}
            type="button"
            onClick={() => onOpenDay?.(day.iso)}
            title={`Everything on ${day.iso} — crew, call times and gear`}
            className={[
              'sticky top-0 z-20 border-b border-r border-slate-200 px-2 py-2 text-center transition hover:bg-violet-50',
              day.today ? 'bg-amber-50' : day.weekend ? 'bg-rose-50' : 'bg-surface',
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
          </button>
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
            onStatus={onStatus}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  )
}

function WeekRow({ studioId, days, byDay, colTint, onOpenCreate, onOpenEdit, onStatus, canManage }) {
  return (
    <>
      <div className="flex min-h-[92px] items-center justify-center border-b border-r border-slate-200 bg-slate-50">
        <span className="grid h-7 w-7 place-items-center rounded-md bg-surface text-sm font-semibold text-slate-600 shadow-sm ring-1 ring-slate-200">
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
            title={`New job · ${studioLabel(studioId)} · ${day.iso}`}
            className={[
              'group relative min-h-[92px] cursor-pointer space-y-1 border-b border-r border-slate-200 p-1.5 transition hover:bg-slate-50/70',
              colTint(day),
            ].join(' ')}
          >
            {cellBookings.map((b) => (
              <BookingChip
                key={b.id}
                b={b}
                onOpen={onOpenEdit}
                onStatus={onStatus}
                canManage={canManage}
              />
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

function MonthView({
  refDate,
  byDay,
  onOpenEdit,
  onJumpToWeek,
  onOpenDay,
  onStatus,
  canManage,
  flip = '',
}) {
  const gridStart = startOfWeek(startOfMonth(refDate), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(refDate), { weekStartsOn: 1 })
  const days = eachDayOfInterval({ start: gridStart, end: gridEnd })

  return (
    <div
      className={`flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-surface shadow-sm ${flip}`}
    >
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
            onOpenDay={onOpenDay}
            onStatus={onStatus}
            canManage={canManage}
          />
        ))}
      </div>
    </div>
  )
}

function MonthCell({
  day,
  refDate,
  dayBookings,
  onOpenEdit,
  onJumpToWeek,
  onOpenDay,
  onStatus,
  canManage,
}) {
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
        : 'bg-surface'

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
        {/* The DATE opens that one day; the rest of the cell still jumps to its
            week, which is what it always did. */}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onOpenDay?.(format(day, 'yyyy-MM-dd'))
          }}
          title="Everything on this day"
          className={[
            'grid h-6 min-w-6 place-items-center rounded-full px-1 text-xs font-semibold transition',
            today
              ? 'bg-amber-500 text-white hover:bg-amber-600'
              : inMonth
                ? 'text-slate-700 hover:bg-violet-100 hover:text-violet-700'
                : 'text-slate-300 hover:bg-slate-100',
          ].join(' ')}
        >
          {format(day, 'd')}
        </button>
        <Plus
          size={14}
          className="text-slate-300 opacity-0 transition group-hover:opacity-100"
        />
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-hidden">
        {shown.map((b) => (
          <BookingChip
            key={b.id}
            b={b}
            variant="month"
            onOpen={onOpenEdit}
            onStatus={onStatus}
            canManage={canManage}
          />
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
