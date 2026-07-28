import { useEffect } from 'react'
import { Loader2, ArrowLeft } from 'lucide-react'
import { useStore } from './store'
import { usingSupabase } from './data/repository'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import StudioCalendar from './components/StudioCalendar'
import Inventory from './components/Inventory'
import People from './components/People'
import Orders from './components/Orders'
import Login from './components/Login'

export default function App() {
  const activeView = useStore((s) => s.activeView)
  const loading = useStore((s) => s.loading)
  const hydrate = useStore((s) => s.hydrate)
  const initAuth = useStore((s) => s.initAuth)
  const authReady = useStore((s) => s.authReady)
  const session = useStore((s) => s.session)
  const navStack = useStore((s) => s.navStack)
  const goBack = useStore((s) => s.goBack)

  useEffect(() => {
    if (usingSupabase) {
      initAuth()
    } else {
      hydrate() // no-op locally; keeps parity
    }
  }, [initAuth, hydrate])

  // The browser's own back arrow walks the drill-in trail: every drill-in pushed
  // a history entry, so one popstate = one step back. With an empty trail the
  // event is ignored and the browser leaves the app, as it should.
  useEffect(() => {
    const onPop = () => {
      if (useStore.getState().navStack.length) useStore.getState().goBack()
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const back = navStack[navStack.length - 1] ?? null
  // Mirror the browser when we have a real history entry to consume, so the two
  // stay in step; otherwise pop the trail directly.
  const onBack = () => {
    if (typeof window !== 'undefined' && window.history?.state?.appNav) window.history.back()
    else goBack()
  }

  // Supabase mode: wait for the initial auth check, then gate on a session.
  if (usingSupabase && !authReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-slate-50 text-slate-400">
        <Loader2 size={28} className="animate-spin" />
      </div>
    )
  }
  if (usingSupabase && !session) {
    return <Login />
  }

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        {/* Drill-in trail: how you get back to where you came from. */}
        {back && !loading && (
          <div className="shrink-0 border-b border-slate-200 bg-white px-3 py-2 sm:px-4 lg:px-6">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-violet-600 transition hover:bg-violet-50"
            >
              <ArrowLeft size={16} />
              Back to {back.label}
            </button>
          </div>
        )}

        <main className="min-h-0 flex-1 overflow-auto p-3 sm:p-4 lg:p-6">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Loading data…</p>
            </div>
          ) : activeView === 'inventory' ? (
            <Inventory />
          ) : activeView === 'people' ? (
            <People />
          ) : activeView === 'orders' ? (
            <Orders />
          ) : (
            <StudioCalendar />
          )}
        </main>
      </div>
    </div>
  )
}
