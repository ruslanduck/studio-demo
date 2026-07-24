import { useEffect } from 'react'
import { Loader2 } from 'lucide-react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import StudioCalendar from './components/StudioCalendar'
import Inventory from './components/Inventory'

export default function App() {
  const activeView = useStore((s) => s.activeView)
  const loading = useStore((s) => s.loading)
  const hydrate = useStore((s) => s.hydrate)

  // No-op in local mode; loads data from Supabase in supabase mode.
  useEffect(() => {
    hydrate()
  }, [hydrate])

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto p-6">
          {loading ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-400">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Loading data…</p>
            </div>
          ) : activeView === 'inventory' ? (
            <Inventory />
          ) : (
            <StudioCalendar />
          )}
        </main>
      </div>
    </div>
  )
}
