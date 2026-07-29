import { CalendarRange, Boxes, Users, ClipboardList, Archive } from 'lucide-react'

// The workspace views, in one place: the top bar renders them as tabs on desktop
// and the off-canvas drawer renders the same list on phone / iPad-portrait.
//
// "Booking Calendar" used to sit at the top as a greyed-out "SOON" tab. It was
// pulled: a dead entry is the first thing a client clicks, and every real view
// pays for the width. The `disabled` support in TopBar/Sidebar stays, so adding
// a not-yet-shipped tab back is a one-line change.
export const WORKSPACE_NAV = [
  { id: 'calendar', label: 'Studio Calendar', short: 'Calendar', icon: CalendarRange },
  { id: 'orders', label: 'Orders', short: 'Orders', icon: ClipboardList },
  { id: 'inventory', label: 'Inventory', short: 'Inventory', icon: Boxes },
  { id: 'people', label: 'People', short: 'People', icon: Users },
  // Nothing is deleted — archived records wait here and can be restored.
  { id: 'archive', label: 'Archive', short: 'Archive', icon: Archive },
]
