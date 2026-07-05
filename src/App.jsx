import { useStore } from './store'
import Sidebar from './components/Sidebar'
import TopBar from './components/TopBar'
import StudioCalendar from './components/StudioCalendar'
import Inventory from './components/Inventory'

export default function App() {
  const activeView = useStore((s) => s.activeView)

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-50 text-slate-800">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar />
        <main className="min-h-0 flex-1 overflow-auto p-6">
          {activeView === 'inventory' ? <Inventory /> : <StudioCalendar />}
        </main>
      </div>
    </div>
  )
}
