import { useEffect } from 'react'
import { X } from 'lucide-react'
import { useStore } from '../store'
import { WORKSPACE_NAV } from '../data/nav'
import Logo, { BRAND_NAME } from './Logo'

// Navigation for phone / iPad-portrait ONLY: an off-canvas drawer opened from the
// hamburger. On desktop the same list lives in the top bar as tabs, which is why
// this no longer becomes a permanent column — that column cost every view 256px
// of width the tables would rather have.
export default function Sidebar() {
  const activeView = useStore((s) => s.activeView)
  const setActiveView = useStore((s) => s.setActiveView)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)

  function pick(id) {
    setActiveView(id)
    setSidebarOpen(false) // close the drawer after navigating
  }

  // Escape closes it, like every other overlay in the app.
  useEffect(() => {
    if (!sidebarOpen) return
    const onKey = (e) => {
      if (e.key === 'Escape') setSidebarOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [sidebarOpen, setSidebarOpen])

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'fixed inset-y-0 left-0 z-40 flex w-64 flex-col border-r border-slate-200 bg-white transition-transform duration-200',
          sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full',
        ].join(' ')}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-5">
          <Logo size={32} />
          <span className="text-sm font-semibold tracking-tight text-slate-900">{BRAND_NAME}</span>
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          {WORKSPACE_NAV.map((item) => {
            const Icon = item.icon
            const active = activeView === item.id
            return (
              <button
                key={item.id}
                type="button"
                disabled={item.disabled}
                onClick={() => pick(item.id)}
                className={[
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition',
                  item.disabled
                    ? 'cursor-not-allowed text-slate-300'
                    : active
                      ? 'bg-violet-50 text-violet-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
              >
                <Icon size={18} className={active ? 'text-violet-600' : ''} />
                <span>{item.label}</span>
                {item.disabled && (
                  <span className="ml-auto rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-400">
                    Soon
                  </span>
                )}
              </button>
            )
          })}
        </nav>

        <div className="mt-auto p-4">
          <p className="text-[11px] leading-relaxed text-slate-400">
            Demo build · works on desktop, iPad &amp; iPhone
          </p>
        </div>
      </aside>
    </>
  )
}
