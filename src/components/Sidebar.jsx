import { Calendar, CalendarRange, Boxes, Users, X } from 'lucide-react'
import { useStore } from '../store'

const NAV = [
  { id: 'booking', label: 'Booking Calendar', icon: Calendar, disabled: true },
  { id: 'calendar', label: 'Studio Calendar', icon: CalendarRange },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
  { id: 'people', label: 'People', icon: Users },
]

export default function Sidebar() {
  const activeView = useStore((s) => s.activeView)
  const setActiveView = useStore((s) => s.setActiveView)
  const sidebarOpen = useStore((s) => s.sidebarOpen)
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)

  function pick(id) {
    setActiveView(id)
    setSidebarOpen(false) // close the drawer after navigating on mobile
  }

  return (
    <>
      {/* Backdrop (mobile drawer only) */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 bg-slate-900/40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside
        className={[
          'z-40 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white',
          // Off-canvas drawer below lg; static column at lg+
          'fixed inset-y-0 left-0 transition-transform duration-200 lg:static lg:translate-x-0',
          sidebarOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full lg:shadow-none',
        ].join(' ')}
      >
        <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-5">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-600 text-xs font-bold text-white">
            AT
          </div>
          <span className="text-sm font-semibold tracking-tight text-slate-900">
            AnnTaylor
          </span>
          {/* Close (mobile drawer only) */}
          <button
            type="button"
            onClick={() => setSidebarOpen(false)}
            className="ml-auto grid h-8 w-8 place-items-center rounded-md text-slate-400 hover:bg-slate-100 lg:hidden"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex flex-col gap-1 p-3">
          <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            Workspace
          </p>
          {NAV.map((item) => {
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
