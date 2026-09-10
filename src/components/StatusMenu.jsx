import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check } from 'lucide-react'
import { ORDER_STATUS, ORDER_STATUS_CHOICES, orderStatusMeta } from '../data/orderStatus'

// A status menu that opens AT A POINT rather than under a trigger — what a
// right-click and a long-press both need.
//
// Same popover language as SelectField / DateField / MonthYearPicker: a portal
// with `position: fixed` (so no ancestor's `overflow` can clip it), outside-click
// and Escape to close, one radius and one shadow. It is a separate component
// because those three are all anchored to an element they render themselves,
// and this one is anchored to wherever the pointer was.
export default function StatusMenu({ at, status, onPick, onClose, title = 'Job status' }) {
  const ref = useRef(null)
  const [pos, setPos] = useState(at)

  // Keep it on screen: a right-click near the right or bottom edge would
  // otherwise open a menu half outside the window.
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const r = el.getBoundingClientRect()
    setPos({
      x: Math.max(8, Math.min(at.x, window.innerWidth - r.width - 8)),
      y: Math.max(8, Math.min(at.y, window.innerHeight - r.height - 8)),
    })
  }, [at])

  useEffect(() => {
    const onDown = (e) => {
      // `contains` throws on anything that isn't a Node, and an event's target
      // is not always one. Close unless the click is provably inside the menu.
      const t = e.target
      if (t instanceof Node && ref.current?.contains(t)) return
      onClose()
    }
    const onKey = (e) => {
      if (e.key === 'Escape') {
        // Escape closes the MENU, not whatever is behind it.
        e.preventDefault()
        e.stopPropagation()
        onClose()
      }
    }
    // `capture` so the outside-click lands before a card underneath opens.
    window.addEventListener('mousedown', onDown, true)
    window.addEventListener('touchstart', onDown, true)
    window.addEventListener('keydown', onKey, true)
    // NOTE: `document`, not `window` — a scroll INSIDE a container (this app's
    // modals scroll) never reaches a capture listener on window; measured with a
    // probe. `document` is on the propagation path, which is why it is the idiom.
    document.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', onDown, true)
      window.removeEventListener('touchstart', onDown, true)
      window.removeEventListener('keydown', onKey, true)
      document.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  return createPortal(
    <div
      ref={ref}
      role="menu"
      aria-label={title}
      style={{ position: 'fixed', top: pos.y, left: pos.x, zIndex: 60 }}
      className="w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl"
      // A click inside must never reach the chip underneath (which opens the job).
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
    >
      <p className="px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
        {title}
      </p>
      {ORDER_STATUS_CHOICES.map((value) => {
        const meta = ORDER_STATUS[value] ?? orderStatusMeta(value)
        const active = value === status
        return (
          <button
            key={value}
            type="button"
            role="menuitemradio"
            aria-checked={active}
            onClick={() => {
              if (!active) onPick(value)
              onClose()
            }}
            className={[
              'flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition',
              active ? 'bg-violet-50 font-medium text-violet-800' : 'text-slate-700 hover:bg-slate-50',
            ].join(' ')}
          >
            <span className={['h-2 w-2 shrink-0 rounded-full', meta.dot].join(' ')} />
            <span className="min-w-0 flex-1 truncate">{meta.label}</span>
            {active && <Check size={14} className="shrink-0 text-violet-500" />}
          </button>
        )
      })}
    </div>,
    document.body,
  )
}
