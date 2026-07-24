import { useState } from 'react'
import { ChevronDown, RotateCcw, LogOut, Menu } from 'lucide-react'
import { useStore } from '../store'
import { usingSupabase } from '../data/repository'
import { roleLabel } from '../lib/permissions'

const MENUS = ['Admin', 'View', 'Generate', 'Inventory']

export default function TopBar() {
  const [openMenu, setOpenMenu] = useState(null)
  const resetDemoData = useStore((s) => s.resetDemoData)
  const profile = useStore((s) => s.profile)
  const signOut = useStore((s) => s.signOut)
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)

  function handleReset() {
    setOpenMenu(null)
    if (
      window.confirm(
        'Reset all demo data back to the original seed? This clears any bookings or changes you made in this session.',
      )
    ) {
      resetDemoData()
    }
  }

  return (
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-1.5">
        {/* Hamburger (mobile/tablet) */}
        <button
          type="button"
          onClick={() => setSidebarOpen(true)}
          className="-ml-1 grid h-9 w-9 shrink-0 place-items-center rounded-md text-slate-500 hover:bg-slate-100 lg:hidden"
          aria-label="Open menu"
        >
          <Menu size={20} />
        </button>
        <h1 className="truncate text-sm font-semibold tracking-tight text-slate-900 sm:text-[15px]">
          AnnTaylor Rental System
        </h1>
      </div>

      <div className="flex items-center gap-1 sm:gap-3">
        <nav className="flex items-center gap-0.5 text-sm">
          {MENUS.map((menu) => (
            <div
              key={menu}
              className={menu === 'Admin' ? 'relative' : 'relative hidden md:block'}
            >
              <button
                type="button"
                onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
                className={[
                  'flex items-center gap-1 rounded-md px-2.5 py-1.5 font-medium transition sm:px-3',
                  openMenu === menu
                    ? 'bg-slate-100 text-slate-900'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
                ].join(' ')}
              >
                {menu}
                <ChevronDown size={14} className="text-slate-400" />
              </button>

              {openMenu === menu && (
                <div className="absolute right-0 top-full z-30 mt-1.5 w-52 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                  {menu === 'Admin' ? (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                    >
                      <RotateCcw size={15} className="text-slate-400" />
                      Reset demo data
                    </button>
                  ) : (
                    <p className="px-3 py-2 text-xs text-slate-400">
                      No actions in this demo.
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </nav>

        {usingSupabase && profile && (
          <div className="flex items-center gap-2 border-l border-slate-200 pl-2 sm:pl-3">
            <div className="hidden text-right leading-tight sm:block">
              <div className="text-sm font-medium text-slate-800">
                {profile.full_name}
              </div>
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

      {openMenu && (
        <div
          className="fixed inset-0 z-10"
          onClick={() => setOpenMenu(null)}
          aria-hidden="true"
        />
      )}
    </header>
  )
}
