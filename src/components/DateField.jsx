import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react'
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
} from 'date-fns'

// English, locale-proof date field. The native <input type="date"> renders its
// format in the browser's locale (e.g. "дд.мм.гггг" on a Russian browser),
// which the app can't override — so this pairs a plain ISO text input (still
// typeable) with a custom calendar popover built on date-fns, whose month /
// weekday labels are always English. Value is ISO "YYYY-MM-DD"; onChange is
// called with an event-like { target: { value } } so callers stay unchanged.
const ISO = 'yyyy-MM-dd'
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

function parseIso(v) {
  if (!v) return null
  const d = parse(v, ISO, new Date())
  return isValid(d) ? d : null
}

export default function DateField({ value, onChange, className }) {
  const [open, setOpen] = useState(false)
  const [view, setView] = useState(() => parseIso(value) || new Date())
  const [coords, setCoords] = useState(null)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const popRef = useRef(null)

  const selected = parseIso(value)
  const emit = (iso) => onChange({ target: { value: iso } })

  // Position the popover relative to the input (fixed → escapes modal overflow).
  const place = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const popH = 328
    const popW = 256
    const openUp = r.bottom + popH > window.innerHeight && r.top > popH
    const top = openUp ? r.top - popH - 4 : r.bottom + 4
    const left = Math.min(r.left, window.innerWidth - popW - 8)
    setCoords({ top, left: Math.max(8, left) })
  }

  useLayoutEffect(() => {
    if (!open) return
    setView(parseIso(value) || new Date())
    place()
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Close on outside click / Escape. Escape is handled on `document` with
  // stopPropagation so it closes the calendar, not the surrounding modal.
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

  function pick(day) {
    emit(format(day, ISO))
    setOpen(false)
  }

  const gridStart = startOfWeek(startOfMonth(view), { weekStartsOn: 1 })
  const gridEnd = endOfWeek(endOfMonth(view), { weekStartsOn: 1 })
  const days = []
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d)
  const today = new Date()

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        inputMode="numeric"
        placeholder="YYYY-MM-DD"
        pattern="\d{4}-\d{2}-\d{2}"
        maxLength={10}
        value={value || ''}
        onChange={onChange}
        onFocus={() => setOpen(true)}
        onClick={() => setOpen(true)}
        className={className}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setOpen((o) => !o)}
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <CalendarIcon size={16} />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left, width: 256 }}
            className="z-[70] rounded-xl border border-slate-200 bg-white p-2 shadow-xl"
          >
            <div className="mb-1 flex items-center justify-between px-1">
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, -1))}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100"
              >
                <ChevronLeft size={16} />
              </button>
              <span className="text-sm font-semibold text-slate-800">
                {format(view, 'MMMM yyyy')}
              </span>
              <button
                type="button"
                onClick={() => setView((v) => addMonths(v, 1))}
                className="rounded-md p-1 text-slate-500 transition hover:bg-slate-100"
              >
                <ChevronRight size={16} />
              </button>
            </div>
            <div className="grid grid-cols-7 gap-0.5 px-1">
              {WEEKDAYS.map((w) => (
                <div
                  key={w}
                  className="py-1 text-center text-[10px] font-medium uppercase tracking-wide text-slate-400"
                >
                  {w}
                </div>
              ))}
              {days.map((d) => {
                const inMonth = isSameMonth(d, view)
                const isSel = selected && isSameDay(d, selected)
                const isToday = isSameDay(d, today)
                return (
                  <button
                    key={format(d, ISO)}
                    type="button"
                    onClick={() => pick(d)}
                    className={[
                      'grid h-8 place-items-center rounded-md text-sm transition',
                      isSel
                        ? 'bg-violet-600 font-semibold text-white'
                        : inMonth
                          ? 'text-slate-700 hover:bg-violet-50'
                          : 'text-slate-300 hover:bg-slate-50',
                      !isSel && isToday ? 'ring-1 ring-inset ring-violet-300' : '',
                    ].join(' ')}
                  >
                    {d.getDate()}
                  </button>
                )
              })}
            </div>
            <div className="mt-1 flex items-center justify-between border-t border-slate-100 px-1 pt-1.5">
              <button
                type="button"
                onClick={() => pick(new Date())}
                className="rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
              >
                Today
              </button>
              {value && (
                <button
                  type="button"
                  onClick={() => {
                    emit('')
                    setOpen(false)
                  }}
                  className="rounded-md px-2 py-1 text-xs font-medium text-slate-400 transition hover:bg-slate-100"
                >
                  Clear
                </button>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
