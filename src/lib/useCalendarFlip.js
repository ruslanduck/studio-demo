import { useRef } from 'react'

// Page turns for the calendars.
//
// Every calendar in the app (the studio week/month grid, an item's availability
// month, the date-picker popover) used to swap its whole grid in one frame, which
// reads as a flicker: nothing tells you whether you went forwards or backwards.
//
// This returns the CSS class that animates the incoming page, pointing the right
// way — the caller also gives the element `key={token}` so React mounts a fresh
// node and the animation actually replays:
//
//   const flip = useCalendarFlip(monthKey)
//   <div key={monthKey} className={`grid grid-cols-7 ${flip}`}>…</div>
//
// `token` is whatever identifies the page ('2026-08', an ISO week start): its
// ORDER decides the direction, so any sortable value works.
//
// The animations themselves live in index.css, where they can respect
// prefers-reduced-motion.
export function useCalendarFlip(token, mode = 'slide') {
  const prev = useRef(token)
  const forward = useRef(true)
  if (token !== prev.current) {
    // A ref written during render is right for "derive from the previous value":
    // there's no state to fall out of sync, and this paint is the one that needs
    // it. (State here would cost an extra render per page turn.)
    forward.current = token > prev.current
    prev.current = token
  }
  if (mode === 'fade') return 'cal-fade'
  return forward.current ? 'cal-flip-fwd' : 'cal-flip-back'
}
