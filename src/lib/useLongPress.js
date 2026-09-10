import { useRef } from 'react'

// Right-click on desktop, long-press on a touch screen — one hook, because a
// chip has to answer both and neither is enough on its own: there is no
// right-click on a phone, and a long-press on a mouse is not a gesture anyone
// makes. The visible dot on the chip is the third way in, for the people who
// try neither.
export function useLongPress(open, { ms = 450 } = {}) {
  const timer = useRef(null)
  const moved = useRef(false)
  // Set when the press became a long-press, so the tap that ends it doesn't
  // ALSO fire the chip's own click and open the job behind the menu.
  const fired = useRef(false)

  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }

  return {
    onContextMenu: (e) => {
      e.preventDefault()
      e.stopPropagation()
      open({ x: e.clientX, y: e.clientY })
    },
    onTouchStart: (e) => {
      moved.current = false
      fired.current = false
      const t = e.touches[0]
      const point = { x: t.clientX, y: t.clientY }
      clear()
      timer.current = setTimeout(() => {
        timer.current = null
        // A press that turned into a scroll is not a long-press.
        if (moved.current) return
        fired.current = true
        open(point)
      }, ms)
    },
    // The finger moved: this is a scroll, so drop the pending menu.
    onTouchMove: () => {
      moved.current = true
      clear()
    },
    onTouchEnd: (e) => {
      clear()
      // touchend is not passive, so this really does suppress the synthetic
      // click a tap would otherwise produce.
      if (fired.current) {
        fired.current = false
        e.preventDefault()
      }
    },
    onTouchCancel: () => {
      clear()
      fired.current = false
    },
  }
}
