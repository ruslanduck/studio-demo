import { useState } from 'react'
import { ChevronDown, RotateCcw } from 'lucide-react'
import { useStore } from '../store'

const MENUS = ['Admin', 'View', 'Generate', 'Inventory']

export default function TopBar() {
  const [openMenu, setOpenMenu] = useState(null)
  const resetDemoData = useStore((s) => s.resetDemoData)

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
    <header className="relative z-20 flex h-14 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6">
      <h1 className="text-[15px] font-semibold tracking-tight text-slate-900">
        AnnTaylor Rental System
      </h1>

      <nav className="flex items-center gap-0.5 text-sm">
        {MENUS.map((menu) => (
          <div key={menu} className="relative">
            <button
              type="button"
              onClick={() => setOpenMenu(openMenu === menu ? null : menu)}
              className={[
                'flex items-center gap-1 rounded-md px-3 py-1.5 font-medium transition',
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
