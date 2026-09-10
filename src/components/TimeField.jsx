import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown } from 'lucide-react'
import {
  hourOptions,
  isValidTime,
  minuteOptions,
  parseTimeInput,
  stepTime,
  toHHMM,
} from '../lib/callTimes'

// The one time field in the app — a call time, and the shoot's wrap.
//
// Locale-proof by construction: a native <input type="time"> has its placeholder
// and its own picker drawn by the OPERATING SYSTEM (чч:мм on a Russian browser,
// unstyleable), which is the same trade DateField and SelectField already made.
// So the field is a 24h HH:MM text input, and the list below is ours.
//
// THREE ways to set a time, because a phone and a desk are not the same hand:
//   • the LIST — two flickable columns (hour, then minute). One tap on an hour
//     already gives a valid time (HH:00), the second refines it, so the common
//     case is two taps and never any typing.
//   • TYPING — "8" · "830" · "8:5" · "19.45" all snap to HH:MM on blur or Enter
//     (lib/callTimes `parseTimeInput`). Nobody has to reach for the colon.
//   • ARROW KEYS — ±5 minutes, for correcting a value without retyping it.
//
// Two columns rather than one list of 96 slots: 19:45 is two short scrolls
// instead of a long hunt, and each column is a thumb-sized flick on a phone.
const STEP = 5
const HOURS = hourOptions()
const MINUTES = minuteOptions(STEP)
// Where an empty field's lists open. A studio calls people in the morning, not
// at 00:15 — opening at midnight would make every pick a scroll.
const OPEN_AT_HOUR = '08'

// Rows are deliberately tall: this list is used with a thumb.
const ROW = 'flex w-full items-center justify-center px-3 py-2.5 text-sm transition'

export default function TimeField({ value, onChange, className, ariaLabel }) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const popRef = useRef(null)
  const hourCol = useRef(null)
  const minCol = useRef(null)

  // What the field shows is what was typed — never a guess. A stored value with
  // seconds ("08:00:00", straight out of a Postgres `time`) is trimmed, because
  // that one is not something a person typed.
  const text = /^\d{1,2}:\d{2}:\d{2}$/.test(String(value ?? '')) ? toHHMM(value) : value || ''
  const valid = isValidTime(text)
  const [hh, mm] = valid ? text.split(':') : [null, null]

  const emit = (v) => onChange({ target: { value: v } })

  // ONE function owns placement: where there is room, and inside the screen.
  //
  // ⚠️ Measured, not assumed: a two-pass version (place, then a separate effect
  // that slid it back) left the list at x=417 on a 375px screen — the clamp only
  // re-ran when the coordinates changed, so a VIEWPORT change (a phone rotating,
  // a window resized) never re-evaluated it. Doing both here means there is no
  // state in which one has happened and the other hasn't.
  const place = () => {
    const el = wrapRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const wanted = 268
    const w = popRef.current?.offsetWidth || 138
    const below = window.innerHeight - r.bottom - 8
    const openUp = below < wanted && r.top > below
    const room = window.innerWidth >= 200 ? window.innerWidth - w - 8 : r.left
    setCoords({
      top: openUp ? Math.max(8, r.top - Math.min(wanted, r.top - 8) - 4) : r.bottom + 4,
      left: Math.max(8, Math.min(r.left, room)),
      maxHeight: Math.min(wanted, openUp ? r.top - 12 : below),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    // The field lives inside a scrollable modal, so a scroll has to move the
    // list with it — a `fixed` popover otherwise stays behind while the field it
    // belongs to slides away. Capture, so an inner scroller counts too.
    const again = () => place()
    window.addEventListener('resize', again)
    // NOTE: `document`, not `window` — a scroll INSIDE a container (this app's
    // modals scroll) never reaches a capture listener on window; measured with a
    // probe. `document` is on the propagation path, which is why it is the idiom.
    document.addEventListener('scroll', again, true)
    return () => {
      window.removeEventListener('resize', again)
      document.removeEventListener('scroll', again, true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Scroll each column to what is selected — or, on an empty field, to the hour
  // a shoot actually starts at.
  useLayoutEffect(() => {
    if (!open || !coords) return
    for (const col of [hourCol.current, minCol.current]) {
      const row = col?.querySelector('[data-at="true"]')
      if (row) row.scrollIntoView({ block: 'center' })
    }
  }, [open, coords, hh, mm])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      const t = e.target
      if (!(t instanceof Node)) return setOpen(false)
      if (wrapRef.current?.contains(t) || popRef.current?.contains(t)) return
      setOpen(false)
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Escape closes the LIST, not the modal behind it.
        e.stopPropagation()
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('touchstart', onDown)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('touchstart', onDown)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // Picking an HOUR keeps the minute if there is one, else lands on :00 — so one
  // tap is already a complete, valid time and the second tap only refines it.
  const pickHour = (h) => emit(`${h}:${mm ?? '00'}`)
  // A minute with no hour would need an hour invented for it, so the column is
  // inert until there is one. Nothing here guesses.
  const pickMinute = (m) => {
    if (!hh) return
    emit(`${hh}:${m}`)
    setOpen(false)
    inputRef.current?.focus()
  }

  // Reads the INPUT, not the render closure. A handler that can fire before a
  // re-render must read the live value — the rule this codebase has written down
  // six times — and for a text field the DOM node IS that value. (Defensive, not
  // a fixed bug: the case that looked like one turned out to be a test artifact,
  // see the focusout note below.)
  function snap() {
    const raw = inputRef.current?.value ?? text
    const parsed = parseTimeInput(raw)
    // Unreadable text is LEFT ALONE: the form says what is wrong with it, and
    // overwriting it with a guess would hide the typo rather than fix it.
    if (parsed && parsed !== raw) emit(parsed)
  }

  return (
    <>
      <div ref={wrapRef} className="relative min-w-0">
        <input
          ref={inputRef}
          type="text"
          inputMode="numeric"
          aria-label={ariaLabel}
          placeholder="HH:MM"
          maxLength={5}
          value={text}
          onChange={onChange}
          onClick={() => setOpen(true)}
          onBlur={snap}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
              e.preventDefault()
              // The list is a picker, not a keyboard trap: the arrows nudge the
              // VALUE, which is what a time field is expected to do.
              emit(stepTime(text, e.key === 'ArrowDown' ? STEP : -STEP, `${OPEN_AT_HOUR}:00`))
              setOpen(true)
              return
            }
            if (e.key === 'Enter') {
              e.preventDefault()
              snap()
              setOpen(false)
            }
          }}
          // `min-w-0` + the full width: without them a bare input keeps its
          // intrinsic ~20-character size and overflows this wrapper, putting the
          // chevron on top of the text (the DateField lesson).
          className={[className, 'w-full pr-7'].filter(Boolean).join(' ')}
        />
        <button
          type="button"
          tabIndex={-1}
          aria-label="Pick a time"
          title="Pick a time"
          onClick={() => {
            setOpen((v) => !v)
            inputRef.current?.focus()
          }}
          className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
        >
          <ChevronDown
            size={14}
            className={['transition', open ? 'rotate-180' : ''].join(' ')}
          />
        </button>
      </div>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            style={{ position: 'fixed', top: coords.top, left: coords.left }}
            className="z-[75] flex overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
          >
            {[
              { key: 'h', label: 'Hour', ref: hourCol, rows: HOURS, sel: hh, at: hh ?? OPEN_AT_HOUR, pick: pickHour, on: true },
              { key: 'm', label: 'Min', ref: minCol, rows: MINUTES, sel: mm, at: mm ?? '00', pick: pickMinute, on: !!hh },
            ].map((col) => (
              <div key={col.key} className="flex w-[68px] flex-col border-r border-slate-100 last:border-r-0">
                <div className="shrink-0 border-b border-slate-100 px-2 py-1 text-center text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                  {col.label}
                </div>
                <div
                  ref={col.ref}
                  className="overflow-y-auto overscroll-contain"
                  style={{ maxHeight: Math.max(120, (coords.maxHeight ?? 240) - 26) }}
                >
                  {col.rows.map((v) => {
                    const selected = col.sel === v
                    return (
                      <button
                        key={v}
                        type="button"
                        // Where to scroll on open: the selection, or the hour a
                        // shoot plausibly starts at when nothing is set yet.
                        data-at={(selected || (!col.sel && v === col.at)) ? 'true' : undefined}
                        disabled={!col.on}
                        onClick={() => col.pick(v)}
                        className={[
                          ROW,
                          'tabular-nums',
                          selected
                            ? 'bg-violet-600 font-semibold text-white'
                            : col.on
                              ? 'text-slate-700 hover:bg-violet-50'
                              : 'cursor-not-allowed text-slate-300',
                        ].join(' ')}
                      >
                        {v}
                      </button>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>,
          document.body,
        )}
    </>
  )
}
