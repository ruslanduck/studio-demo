import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ChevronDown } from 'lucide-react'
import {
  format,
  parse,
  isValid,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  addDays,
  addMonths,
  isSameDay,
  isSameMonth,
  setMonth,
  setYear,
} from 'date-fns'
import { useCalendarFlip } from '../lib/useCalendarFlip'
import { setSpanDays, spanLabel } from '../lib/setDays'
import MonthYearPicker from './MonthYearPicker'

// ONE field for a shoot's days, from–to.
//
// It used to be two DateFields side by side, which made the common case — a
// one-day shoot — two controls to look at and left "Last day" reading as a
// separate decision. Here one click sets a one-day shoot and a second click
// stretches it, which is the actual shape of the question.
//
// Same popover contract as DateField: rendered through a portal at
// `position: fixed` so a modal's overflow can't clip it, closed by an outside
// click or Escape (stopPropagation, or Escape would close the modal behind it),
// and re-placed on a `document` scroll — NOT window, because a scroll inside a
// container never reaches a capture listener there.
//
// `onChange` is called with { from, to } and NEVER with a backwards pair: the
// grid orders the two clicks itself, and the typed inputs are normalised on the
// way out. That is what lets the form drop its "that is before the first day"
// branch entirely.
const ISO = 'yyyy-MM-dd'
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const parseIso = (v) => {
  if (!v) return null
  const d = parse(v, ISO, new Date())
  return isValid(d) ? d : null
}

export default function DateRangeField({ from, to, onChange, className }) {
  const [open, setOpen] = useState(false)
  const [picking, setPicking] = useState(null) // 'month' | null
  const [view, setView] = useState(() => parseIso(from) || new Date())
  const [coords, setCoords] = useState(null)
  const wrapRef = useRef(null)
  const triggerRef = useRef(null)
  const popRef = useRef(null)

  // ⚠️ The click handlers must read the CURRENT range, not the one captured by
  // the render they were created in: two clicks before a re-render would both
  // see the same props and the second would restart the range instead of
  // completing it. Eighth instance of that trap in this codebase, so the value
  // lives in a ref and the props only feed it.
  const live = useRef({ from, to })
  useEffect(() => {
    live.current = { from, to }
  })
  // True between the two clicks of a new range.
  const stretching = useRef(false)

  const start = parseIso(from)
  const end = parseIso(to) || start
  const days = setSpanDays(from, to)

  const emit = (f, t) => {
    const pair = !t || t < f ? { from: f, to: f } : { from: f, to: t }
    live.current = pair
    onChange(pair)
  }

  const place = () => {
    const el = triggerRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const popH = 360
    const popW = 268
    const openUp = r.bottom + popH > window.innerHeight && r.top > popH
    const top = openUp ? r.top - popH - 4 : r.bottom + 4
    const left = Math.min(r.left, window.innerWidth - popW - 8)
    setCoords({ top, left: Math.max(8, left) })
  }

  useLayoutEffect(() => {
    if (!open) return
    setPicking(null)
    stretching.current = false
    setView(parseIso(live.current.from) || new Date())
    place()
    const onScroll = () => place()
    document.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (wrapRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // First click: a one-day shoot, complete and valid on its own — closing the
  // popover right here keeps it. Second click: the other end, in either
  // direction.
  function pickDay(day) {
    const iso = format(day, ISO)
    const cur = live.current
    if (!stretching.current || !cur.from) {
      stretching.current = true
      emit(iso, iso)
      return
    }
    stretching.current = false
    const a = cur.from
    emit(iso < a ? iso : a, iso < a ? a : iso)
    setOpen(false)
  }

  const gridStart = startOfWeek(startOfMonth(view), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(view), { weekStartsOn: 1 })
  const cells = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) cells.push(d)
  const today = new Date()
  const monthKey = format(view, 'yyyy-MM')
  const flip = useCalendarFlip(monthKey)

  const summary = !from
    ? 'Pick the days'
    : days > 1
      ? `${spanLabel(from, to)} · ${days} days`
      : `${spanLabel(from, to)} · one day`

  return (
    <div className="relative min-w-0" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={[className, 'flex w-full items-center gap-2 text-left'].filter(Boolean).join(' ')}
      >
        <span className={['min-w-0 flex-auto truncate', from ? '' : 'text-slate-400'].join(' ')}>
          {summary}
        </span>
        <CalendarIcon size={16} className="shrink-0 text-slate-400" />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: 268 }}
            className="z-[70] rounded-xl border border-slate-200 bg-surface p-2 shadow-xl"
          >
            {/* Typing survives the move to one field — it just moved in here,
                where both ends are visible at once. */}
            <div className="mb-1.5 flex items-center gap-1.5 px-1">
              <input
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                maxLength={10}
                value={from || ''}
                onChange={(e) => emit(e.target.value, live.current.to)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none transition focus:border-violet-400"
              />
              <span className="shrink-0 text-xs text-slate-400">→</span>
              <input
                type="text"
                inputMode="numeric"
                placeholder="YYYY-MM-DD"
                maxLength={10}
                value={to || ''}
                onChange={(e) => emit(live.current.from, e.target.value)}
                className="w-full rounded-md border border-slate-300 px-2 py-1 text-xs outline-none transition focus:border-violet-400"
              />
            </div>

            <div className="mb-1 flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, picking ? -12 : -1))}
                title={picking ? 'Previous year' : 'Previous month'}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100"
              >
                <ChevronLeft size={16} />
              </button>
              <button
                type="button"
                onClick={() => setPicking((p) => (p ? null : 'month'))}
                title="Pick a month and year"
                className="inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-sm font-semibold text-slate-800 transition hover:bg-slate-100"
              >
                {format(view, 'MMMM yyyy')}
                <ChevronDown
                  size={13}
                  className={['text-slate-400 transition', picking ? 'rotate-180' : ''].join(' ')}
                />
              </button>
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, picking ? 12 : 1))}
                title={picking ? 'Next year' : 'Next month'}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100"
              >
                <ChevronRight size={16} />
              </button>
            </div>

            {picking ? (
              <MonthYearPicker
                month={view.getMonth()}
                year={view.getFullYear()}
                onMonth={(i) => {
                  setView((v) => setMonth(v, i))
                  setPicking(null)
                }}
                onYear={(y) => setView((v) => setYear(v, y))}
              />
            ) : (
              <div key={monthKey} className={`grid grid-cols-7 gap-0.5 px-1 ${flip}`}>
                {WEEKDAYS.map((w) => (
                  <div
                    key={w}
                    className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400"
                  >
                    {w}
                  </div>
                ))}
                {cells.map((d) => {
                  const inMonth = isSameMonth(d, view)
                  const isStart = start && isSameDay(d, start)
                  const isEnd = end && isSameDay(d, end)
                  const inRange = start && end && d > start && d < end
                  const isToday = isSameDay(d, today)
                  return (
                    <button
                      key={format(d, ISO)}
                      type="button"
                      onClick={() => pickDay(d)}
                      className={[
                        'grid h-8 place-items-center rounded-md text-sm transition',
                        isStart || isEnd
                          ? 'bg-brand font-semibold text-white'
                          : inRange
                            ? 'bg-violet-100 text-violet-800'
                            : inMonth
                              ? 'text-slate-700 hover:bg-violet-50'
                              : 'text-slate-300 hover:bg-slate-50',
                        !isStart && !isEnd && isToday ? 'ring-1 ring-inset ring-violet-300' : '',
                      ].join(' ')}
                    >
                      {d.getDate()}
                    </button>
                  )
                })}
              </div>
            )}

            <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-1 pt-1.5">
              <button
                type="button"
                onClick={() => {
                  const iso = format(new Date(), ISO)
                  stretching.current = true
                  emit(iso, iso)
                }}
                className="rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
              >
                Today
              </button>
              <span className="text-[11px] text-slate-400">
                {stretching.current ? 'Click the last day' : summary}
              </span>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
