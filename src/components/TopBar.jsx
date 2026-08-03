import { useState } from 'react'
import { ChevronDown, RefreshCw, LogOut, Menu, DatabaseZap } from 'lucide-react'
import { useStore } from '../store'
import { usingSupabase } from '../data/repository'
import { roleLabel } from '../lib/permissions'
import { WORKSPACE_NAV } from '../data/nav'
import Logo, { BRAND_NAME } from './Logo'

// The top bar carries the navigation on desktop, so the views get the full
// window width — the inventory and packing tables need it more than a permanent
// 256px column did. Below lg the same list lives in the off-canvas drawer.
//
// The gear menu and its "Reset demo data" are gone. In Supabase mode that action
// only ever called hydrate() — it re-fetched, it never restored a seed — so the
// label promised something it didn't do, and "demo data" is not a thing a studio
// should be told it is working with. What replaced it is an ACCOUNT menu, which
// is where a real product keeps who you are signed in as, a manual refresh (the
// only way to pick up a teammate's change between writes) and sign-out.
// Re-seeding still exists for LOCAL mode only, where it is a development tool.
// Two letters is what an avatar shows when there is no photo to show.
const initials = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('') || '?'

export default function TopBar() {
  const [menuOpen, setMenuOpen] = useState(false)
  const resetDemoData = useStore((s) => s.resetDemoData)
  const hydrate = useStore((s) => s.hydrate)
  const profile = useStore((s) => s.profile)
  // The email lives on the auth session, not on `profiles` (which carries only
  // id / full_name / role).
  const email = useStore((s) => s.session?.user?.email ?? null)
  const signOut = useStore((s) => s.signOut)
  const setSidebarOpen = useStore((s) => s.setSidebarOpen)
  const activeView = useStore((s) => s.activeView)
  const setActiveView = useStore((s) => s.setActiveView)

  const [refreshing, setRefreshing] = useState(false)

  async function handleRefresh() {
    setMenuOpen(false)
    setRefreshing(true)
    // Quiet: raising `loading` swaps the whole view for a spinner and discards
    // the screen's own state (the filter you typed, the row you had open).
    await hydrate({ quiet: true })
    setRefreshing(false)
  }

  // LOCAL mode only — a development convenience, never shown in production.
  function handleReseed() {
    setMenuOpen(false)
    resetDemoData()
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
        {/* Account menu — who you are signed in as, and the two actions that
            belong to the session rather than to a view. */}
        {usingSupabase && profile ? (
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              title={profile.full_name}
              className={[
                'flex items-center gap-2 rounded-lg py-1 pl-1 pr-1.5 transition',
                menuOpen ? 'bg-slate-100' : 'hover:bg-slate-100',
              ].join(' ')}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-violet-100 text-xs font-semibold text-violet-700">
                {initials(profile.full_name)}
              </span>
              <span className="hidden text-left leading-tight sm:block">
                <span className="block text-sm font-medium text-slate-800">{profile.full_name}</span>
                <span className="block text-[10px] uppercase tracking-wide text-slate-400">
                  {roleLabel(profile.role)}
                </span>
              </span>
              <ChevronDown size={13} className="shrink-0 text-slate-400" />
            </button>
            {menuOpen && (
              <div className="absolute right-0 top-full z-30 mt-1.5 w-60 rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
                <div className="border-b border-slate-100 px-3 pb-2 pt-1.5">
                  <div className="truncate text-sm font-medium text-slate-800">
                    {profile.full_name}
                  </div>
                  {email && <div className="truncate text-xs text-slate-400">{email}</div>}
                </div>
                <button
                  type="button"
                  onClick={handleRefresh}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <RefreshCw
                    size={15}
                    className={refreshing ? 'animate-spin text-violet-500' : 'text-slate-400'}
                  />
                  Refresh data
                </button>
                <button
                  type="button"
                  onClick={() => signOut()}
                  className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <LogOut size={15} className="text-slate-400" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        ) : (
          // Local development: no account to show, but re-seeding is useful here.
          <div className="relative">
            <button
              type="button"
              onClick={handleReseed}
              title="Reload the local seed data (development only)"
              className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs font-medium text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
            >
              <DatabaseZap size={15} />
              <span className="hidden sm:inline">Reload seed</span>
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
