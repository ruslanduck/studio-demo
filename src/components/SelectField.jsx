import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

// One dropdown for the whole app.
//
// Why not a native <select>: its OPEN list is drawn by the operating system and
// cannot be styled at all, so it never matches the app — and the app also had
// <input list> + <datalist> for the free-text pickers, whose native list looks
// different again. Two OS-drawn widgets, two looks, neither ours. This is the
// same trade DateField already made for dates (see its header comment), so the
// popover here deliberately mirrors it: fixed position through a portal (to
// escape a modal's overflow), outside-click and Escape to close, one shadow and
// one radius.
//
// `onChange` is called with an event-like { target: { value } }, exactly like a
// real <select> and like DateField — so every call site keeps its handler body.
//
// Options: [{ value, label, disabled? }] or plain strings.
export default function SelectField({
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  className,
  disabled = false,
  ariaLabel,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const [active, setActive] = useState(-1)
  const btnRef = useRef(null)
  const popRef = useRef(null)

  const opts = options.map((o) => (typeof o === 'object' && o !== null ? o : { value: o, label: String(o) }))
  const current = opts.find((o) => String(o.value) === String(value ?? ''))

  const place = () => {
    const el = btnRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    // Tall enough for the list, but never taller than the room available.
    const wanted = Math.min(opts.length * 34 + 10, 288)
    const below = window.innerHeight - r.bottom - 8
    const openUp = below < wanted && r.top > below
    setCoords({
      top: openUp ? Math.max(8, r.top - Math.min(wanted, r.top - 8) - 4) : r.bottom + 4,
      left: r.left,
      width: r.width,
      maxHeight: Math.min(wanted, openUp ? r.top - 12 : below),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    place()
    const onScroll = () => place()
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, options.length])

  useEffect(() => {
    if (!open) return
    const onDown = (e) => {
      if (btnRef.current?.contains(e.target)) return
      if (popRef.current?.contains(e.target)) return
      setOpen(false)
    }
    // Escape closes the list, not the modal behind it.
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

  function pick(opt) {
    if (opt.disabled) return
    onChange({ target: { value: opt.value } })
    setOpen(false)
    btnRef.current?.focus()
  }

  function onTriggerKey(e) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (!open) {
        setActive(opts.findIndex((o) => String(o.value) === String(value ?? '')))
        setOpen(true)
        return
      }
      if (e.key === 'Enter' || e.key === ' ') {
        if (active >= 0 && opts[active]) pick(opts[active])
        return
      }
      const dir = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => {
        let n = i
        for (let step = 0; step < opts.length; step += 1) {
          n = (n + dir + opts.length) % opts.length
          if (!opts[n].disabled) return n
        }
        return i
      })
    }
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return
          setActive(opts.findIndex((o) => String(o.value) === String(value ?? '')))
          setOpen((o) => !o)
        }}
        onKeyDown={onTriggerKey}
        // The trigger takes the caller's field classes, so it sits in a form row
        // exactly where the old <select> did.
        className={[
          className,
          'flex items-center gap-2 text-left disabled:cursor-not-allowed disabled:opacity-50',
          open ? 'border-violet-400 ring-2 ring-violet-100' : '',
        ]
          .filter(Boolean)
          .join(' ')}
      >
        <span
          className={['min-w-0 flex-1 truncate', current ? '' : 'text-slate-400'].join(' ')}
        >
          {current ? current.label : placeholder}
        </span>
        <ChevronDown
          size={15}
          className={['shrink-0 text-slate-400 transition', open ? 'rotate-180' : ''].join(' ')}
        />
      </button>

      {open &&
        coords &&
        createPortal(
          <div
            ref={popRef}
            role="listbox"
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              width: coords.width,
              maxHeight: coords.maxHeight,
            }}
            className="z-[70] overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
          >
            {opts.length === 0 && (
              <p className="px-3 py-2 text-xs text-slate-400">Nothing to choose from.</p>
            )}
            {opts.map((o, i) => {
              const selected = String(o.value) === String(value ?? '')
              return (
                <button
                  key={`${o.value}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  disabled={o.disabled}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={[
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition',
                    o.disabled
                      ? 'cursor-not-allowed text-slate-300'
                      : selected
                        ? 'font-medium text-violet-700'
                        : 'text-slate-700',
                    !o.disabled && i === active ? 'bg-violet-50' : '',
                  ].join(' ')}
                >
                  <Check
                    size={14}
                    className={['shrink-0', selected ? 'text-violet-600' : 'invisible'].join(' ')}
                  />
                  <span className="min-w-0 flex-1 truncate">{o.label}</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
