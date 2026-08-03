import { CalendarRange, Boxes, Users, ClipboardList, ScanLine } from 'lucide-react'

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
  // The packing station (epic #6). Its own tab because it stays open by the
  // door for a whole shift, next to the scanner.
  { id: 'scanning', label: 'Scanning', short: 'Scan', icon: ScanLine },
  // No Archive tab, on request: records are still archived (never deleted) in
  // the DB, but the UI gives no way to view or restore them. The Archive view
  // (components/Archive.jsx) is kept unrouted — re-adding an entry here and a
  // branch in App.jsx brings it back.
]
