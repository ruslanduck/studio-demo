import { Calendar, CalendarRange, Boxes } from 'lucide-react'
import { useStore } from '../store'

const NAV = [
  { id: 'booking', label: 'Booking Calendar', icon: Calendar, disabled: true },
  { id: 'calendar', label: 'Studio Calendar', icon: CalendarRange },
  { id: 'inventory', label: 'Inventory', icon: Boxes },
]

export default function Sidebar() {
  const activeView = useStore((s) => s.activeView)
  const setActiveView = useStore((s) => s.setActiveView)

  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
      <div className="flex h-14 items-center gap-2.5 border-b border-slate-200 px-5">
        <div className="grid h-8 w-8 place-items-center rounded-lg bg-violet-600 text-xs font-bold text-white">
          AT
        </div>
        <span className="text-sm font-semibold tracking-tight text-slate-900">
          AnnTaylor
        </span>
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
              onClick={() => setActiveView(item.id)}
              className={[
                'flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
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
          Demo build · data stored locally in your browser
        </p>
      </div>
    </aside>
  )
}
