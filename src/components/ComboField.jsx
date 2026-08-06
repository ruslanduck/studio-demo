import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Check } from 'lucide-react'

// Free-text field WITH suggestions — the photographer / model / job-title
// pickers, which must accept a name that isn't on the list yet.
//
// It replaces <input list> + <datalist>, whose suggestion list is drawn by the
// browser and looked nothing like the app (and nothing like a native <select>
// either — that mismatch is exactly what this and SelectField fix). Same popover
// language as SelectField and DateField: portal, fixed position, one radius, one
// shadow, Escape and outside-click to close.
//
// `onChange` gets the real input event while typing and an event-like
// { target: { value } } when a suggestion is picked, so call sites are unchanged.
export default function ComboField({
  value,
  onChange,
  options = [],
  placeholder,
  className,
  inputMode,
}) {
  const [open, setOpen] = useState(false)
  const [coords, setCoords] = useState(null)
  const [active, setActive] = useState(-1)
  // Is the list narrowed by what's in the field? Only after a keystroke.
  const [filtering, setFiltering] = useState(false)
  const wrapRef = useRef(null)
  const inputRef = useRef(null)
  const popRef = useRef(null)

  const all = options.map((o) => (typeof o === 'object' && o !== null ? o : { value: o, label: String(o) }))
  const q = String(value ?? '').trim().toLowerCase()

  // Filtering happens only while TYPING. Opening the list from the chevron (or by
  // clicking the field) always shows everything, whatever is already in it.
  //
  // The old rule filtered by the field's CURRENT value, which made a filled field
  // a dead end: a value that matches nothing in the list — e.g. a subcategory left
  // over from another category — filtered the list to zero, and the popover only
  // rendered when it had rows, so the list silently refused to open and the value
  // couldn't be changed.
  const shown = filtering && q !== '' ? all.filter((o) => o.label.toLowerCase().includes(q)) : all
  // Typed something the list doesn't have. That's allowed — new kinds of gear and
  // new faces arrive — but it has to be SAID, or free entry is invisible.
  const isNew = q !== '' && !all.some((o) => o.label.toLowerCase() === q)

  const place = () => {
    const el = inputRef.current
    if (!el) return
    const r = el.getBoundingClientRect()
    const wanted = Math.min(shown.length * 34 + 10, 256)
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
  }, [open, shown.length])

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

  function pick(opt) {
    onChange({ target: { value: opt.value } })
    setOpen(false)
    inputRef.current?.focus()
  }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={inputRef}
        type="text"
        inputMode={inputMode}
        value={value ?? ''}
        placeholder={placeholder}
        onChange={(e) => {
          onChange(e)
          setActive(-1)
          setFiltering(true)
          setOpen(true)
        }}
        onFocus={() => {
          setFiltering(false)
          setOpen(true)
        }}
        onClick={() => {
          setFiltering(false)
          setOpen(true)
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
            e.preventDefault()
            if (!open) return setOpen(true)
            const dir = e.key === 'ArrowDown' ? 1 : -1
            setActive((i) => (shown.length ? (i + dir + shown.length) % shown.length : -1))
          } else if (e.key === 'Enter' && open && active >= 0 && shown[active]) {
            // Only steal Enter when a suggestion is highlighted — otherwise the
            // form submits, which is what a typed-in name expects.
            e.preventDefault()
            pick(shown[active])
          }
        }}
        className={[className, 'pr-8'].filter(Boolean).join(' ')}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => {
          setFiltering(false)
          setOpen((o) => !o)
        }}
        title="Show the list"
        className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
      >
        <ChevronDown
          size={15}
          className={['transition', open ? 'rotate-180' : ''].join(' ')}
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
            {/* Free entry, said out loud: the value is already yours, and it joins
                the list for this category once the record is saved. */}
            {isNew && (
              <div className="border-b border-slate-100 px-3 py-1.5 text-[11px] text-slate-500">
                “<span className="font-medium text-slate-700">{String(value).trim()}</span>” is not
                in the list — it will be added when you save.
              </div>
            )}
            {shown.length === 0 && !isNew && (
              <p className="px-3 py-2 text-xs text-slate-400">Nothing to choose from yet.</p>
            )}
            {shown.map((o, i) => {
              const selected = String(o.value) === String(value ?? '')
              return (
                <button
                  key={`${o.value}`}
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(o)}
                  className={[
                    'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition',
                    selected ? 'font-medium text-violet-700' : 'text-slate-700',
                    i === active ? 'bg-violet-50' : '',
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
    </div>
  )
}
