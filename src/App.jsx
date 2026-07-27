import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useStore } from './store'
import { usingSupabase } from './data/repository'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import StudioCalendar from './components/StudioCalendar'
import Inventory from './components/Inventory'
import People from './components/People'
import Login from './components/Login'

export default function App() {
  const activeView = useStore((s) => s.activeView)
  const loading = useStore((s) => s.loading)
  const hydrate = useStore((s) => s.hydrate)
  const initAuth = useStore((s) => s.initAuth)
  const authReady = useStore((s) => s.authReady)
  const session = useStore((s) => s.session)

  useEffect(() => {
    if (usingSupabase) {
      initAuth()
    } else {
      hydrate() // no-op locally; keeps parity
    }
  }, [initAuth, hydrate])

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
          ) : (
            <StudioCalendar />
          )}
        </main>
      </div>
    </div>
  )
}
