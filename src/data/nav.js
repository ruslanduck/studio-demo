import { Calendar, CalendarRange, Boxes, Users, ClipboardList } from 'lucide-react'

// The workspace views, in one place: the top bar renders them as tabs on desktop
// and the off-canvas drawer renders the same list on phone / iPad-portrait.
export const WORKSPACE_NAV = [
  { id: 'booking', label: 'Booking Calendar', short: 'Booking', icon: Calendar, disabled: true },
  { id: 'calendar', label: 'Studio Calendar', short: 'Calendar', icon: CalendarRange },
  { id: 'orders', label: 'Orders', short: 'Orders', icon: ClipboardList },
  { id: 'inventory', label: 'Inventory', short: 'Inventory', icon: Boxes },
  { id: 'people', label: 'People', short: 'People', icon: Users },
]
