import { useState } from 'react'
import { ChevronDown, RotateCcw, LogOut, Menu, Settings } from 'lucide-react'
import { useStore } from '../store'
import { usingSupabase } from '../data/repository'
import { roleLabel } from '../lib/permissions'
import { WORKSPACE_NAV } from '../data/nav'
import Logo, { BRAND_NAME } from './Logo'

// The top bar carries the navigation on desktop, so the views get the full
// window width — the inventory and packing tables need it more than a permanent
// 256px column did. Below lg the same list lives in the off-canvas drawer.
//
// The old Admin / View / Generate / Inventory menus are gone: three of the four
// were decorative, and the only real action behind them (Reset demo data) now
// sits under the gear where a destructive reset belongs.
export default function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const resetDemoData = useStore((s) => s.resetDemoData)
  const profile = useStore((s) => s.profile)
  const signOut = useStore((s) => s.signOut)
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)
  const activeView = useStore((s) => s.activeView)
  const setActiveView = useStore((s) => s.setActiveView)

  function handleReset() {
    setMenuOpen(false)
    if (
      window.confirm(
        'Reset all demo data back to the original seed? This clears any bookings or changes you made in this session.',
      )
    ) {
      resetDemoData()
    }
  }

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center gap-2 border-b border-slate-200 bg-white px-3 sm:px-4">
      {/* Hamburger + brand (phone / iPad-portrait: the drawer holds the nav) */}
      <button
        type="button"
        onClick={() => setSidebarOpen(true)}
        className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
        aria-label="Open menu"
      >
        <Menu size={20} />
      </button>

      <div className="flex min-w-0 shrink-0 items-center gap-2 lg:mr-2">
        <Logo size={26} radius="rounded-md" />
        <span className="truncate text-sm font-semibold tracking-tight text-slate-900">
          {BRAND_NAME}
        </span>
      </div>

      {/* Workspace tabs (desktop) */}
      <nav className="hidden min-w-0 flex-1 items-center gap-0.5 lg:flex">
        {WORKSPACE_NAV.map((item) => {
          const Icon = item.icon
          const active = activeView === item.id
          return (
            <button
              key={item.id}
              type="button"
              disabled={item.disabled}
              onClick={() => setActiveView(item.id)}
              title={item.disabled ? 'Coming soon' : item.label}
              className={[
                'flex shrink-0 items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition',
                item.disabled
                  ? 'cursor-not-allowed text-slate-300'
                  : active
                    ? 'bg-violet-50 text-violet-700'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
              ].join(' ')}
            >
              <Icon size={16} className={active ? 'text-violet-600' : ''} />
              {item.label}
              {item.disabled && (
                <span className="rounded bg-slate-100 px-1 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-slate-400">
                  Soon
                </span>
              )}
            </button>
          )
        })}
      </nav>

      <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
        {/* Admin actions — one real action, so one small menu. */}
        <div className="relative">
          <button
            type="button"
            onClick={() => setMenuOpen((v) => !v)}
            title="Admin"
            className={[
              'flex items-center gap-1 rounded-md px-2 py-1.5 text-sm font-medium transition',
              menuOpen
                ? 'bg-slate-100 text-slate-900'
                : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
            ].join(' ')}
          >
            <Settings size={16} />
            <ChevronDown size={13} className="text-slate-400" />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
              <button
                type="button"
                onClick={handleReset}
                className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
              >
                <RotateCcw size={15} className="text-slate-400" />
                Reset demo data
              </button>
            </div>
          )}
        </div>

        {usingSupabase && profile && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-slate-800">{profile.full_name}</div>
              <div className="text-[10px] uppercase tracking-wide text-slate-400">
                {roleLabel(profile.role)}
              </div>
            </div>
            <button
              type="button"
              onClick={() => signOut()}
              title="Sign out"
              className="grid h-9 w-9 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <LogOut size={16} />
            </button>
          </div>
        )}
      </div>

      {menuOpen && (
        <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} aria-hidden="true" />
      )}
    </header>
  )
}
