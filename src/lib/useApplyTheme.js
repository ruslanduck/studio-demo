import { useEffect } from 'react'
import { useStore } from '../store'
import { THEME_DARK, THEME_SYSTEM, resolveTheme } from './theme'

// Put the resolved theme on <html> and keep it there.
//
// The class goes on the ROOT element because that is where the palette is
// redefined (see index.css) — every colour utility in the app reads
// `var(--color-*)`, so one class swaps the whole theme.
//
// ⚠️ While the preference is "system" this must FOLLOW the device: a machine
// that flips to dark at sunset would otherwise keep the app light until the
// next reload. That is what the matchMedia listener is for, and it is removed
// again when the preference stops being "system" — a listener left behind
// would fight a deliberate choice.
export function useApplyTheme() {
  const preference = useStore((s) => s.theme)

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = resolveTheme(preference, !!query?.matches) === THEME_DARK
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    if (preference !== THEME_SYSTEM || !query?.addEventListener) return undefined
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [preference])
}
