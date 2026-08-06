import { useCallback } from 'react'
import { useStore } from '../store'

// A drop-in replacement for useState whose value survives leaving the screen.
//
// Why it's needed: App.jsx renders only the ACTIVE view, so switching Orders →
// Inventory unmounts Orders and throws away its local state — the selected order,
// the search box, the filters. Coming back landed you on "the first row" instead
// of where you were. A page reload did the same. The state lives in the store now
// and is persisted, so both journeys return you to what you were looking at.
//
// Shaped exactly like useState (including the updater form, `set((cur) => …)`)
// so call sites keep their bodies:
//
//   const [selectedId, setSelectedId] = usePersisted('orders', 'selectedId', null)
//
// Deliberately NOT for: open modals, half-typed drafts, the peek stack. Restoring
// a dialog someone had open — or a form they abandoned — is not "where I was", and
// a stale draft is worse than none.
export function usePersisted(scope, key, initial) {
  const stored = useStore((s) => s.viewState?.[scope]?.[key])
  const patch = useStore((s) => s.patchViewState)
  const value = stored === undefined ? initial : stored

  const set = useCallback(
    (next) => {
      // Read the CURRENT value at call time rather than closing over `value`:
      // two updates in one tick would otherwise both start from the same state
      // (the trap that has bitten this codebase four times).
      const cur = useStore.getState().viewState?.[scope]?.[key]
      const from = cur === undefined ? initial : cur
      patch(scope, { [key]: typeof next === 'function' ? next(from) : next })
    },
    // `initial` is a literal at every call site; leaving it out keeps the setter
    // stable so effects that depend on it don't re-run.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scope, key, patch],
  )

  return [value, set]
}
