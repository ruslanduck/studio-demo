import { CalendarRange } from 'lucide-react'
import { useStore } from '../store'
import PlaceholderPanel from './PlaceholderPanel'

export default function StudioCalendar() {
  const studios = useStore((s) => s.studios)
  const bookings = useStore((s) => s.bookings)

  return (
    <PlaceholderPanel
      icon={CalendarRange}
      title="Studio Calendar"
      subtitle="The week & month scheduling grid is coming in the next build step. Seed data is already loaded and ready."
      stats={[
        { label: 'Studios', value: studios.length },
        { label: 'Bookings this week', value: bookings.length },
      ]}
    />
  )
}
