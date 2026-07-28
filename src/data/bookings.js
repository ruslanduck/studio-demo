// Booking templates for the current week — the studio-calendar shoots (Sets).
// `dayOffset` is days from Monday (0 = Mon … 6 = Sun); the store resolves these
// to real ISO dates relative to the current week so the calendar is always
// populated.
//
// Equipment is NO LONGER listed here. A Set's reserved units derive from its
// CONFIRMED order's in-house lines (see src/data/orders.js + lib/availability
// `reservedUnitsForOrder`) — one source of truth, so inventory and orders can't
// disagree. Each shoot below has a matching order (linked by title).
//
// Spread includes a couple of shoots on "today" and on the weekend so the
// calendar's today/weekend tinting is visible.
export const BOOKING_TEMPLATES = [
  { title: 'Zara Denim Campaign', studioId: '1', dayOffset: 0, startTime: '08:00', endTime: '16:00', photographer: 'Marcus Reed', model: 'Ava Morgan', color: '#3b82f6' },
  { title: 'Vogue Editorial', studioId: '3', dayOffset: 1, startTime: '09:00', endTime: '18:00', photographer: 'Sofia Ventura', model: 'Elena Petrova', color: '#ec4899' },
  { title: 'Adidas Originals', studioId: '5', dayOffset: 1, startTime: '10:00', endTime: '15:00', photographer: 'Diego Alvarez', model: 'Mateo Rossi', color: '#10b981' },
  { title: 'Glossier Beauty', studioId: '2', dayOffset: 2, startTime: '09:30', endTime: '17:30', photographer: 'Priya Nair', model: 'Zoe Bennett', color: '#f59e0b' },
  { title: 'Nike SS26 Lookbook', studioId: '2', dayOffset: 3, startTime: '09:00', endTime: '17:00', photographer: 'Ann Taylor', model: 'Jordan Lee', color: '#3b82f6' },
  { title: 'Apple Product Shoot', studioId: 'L', dayOffset: 3, startTime: '11:00', endTime: '19:00', photographer: 'Liam Chen', model: 'Kai Nakamura', color: '#8b5cf6' },
  { title: 'H&M Kidswear', studioId: '4', dayOffset: 4, startTime: '08:30', endTime: '14:30', photographer: 'Noah Kim', model: 'Isla Fraser', color: '#14b8a6' },
  { title: 'Wedding Editorial', studioId: '1', dayOffset: 5, startTime: '12:00', endTime: '20:00', photographer: 'Sofia Ventura', model: 'Ava Morgan', color: '#f43f5e' },
  { title: 'Local Band EP', studioId: '5', dayOffset: 5, startTime: '13:00', endTime: '21:00', photographer: 'Diego Alvarez', model: 'Omar Haddad', color: '#06b6d4' },
  { title: 'Spotify Podcast Set', studioId: '3', dayOffset: 6, startTime: '10:00', endTime: '16:00', photographer: 'Priya Nair', model: 'Zoe Bennett', color: '#6366f1' },
  { title: 'Netflix BTS', studioId: 'L', dayOffset: 6, startTime: '09:00', endTime: '18:00', photographer: 'Ann Taylor', model: 'Kai Nakamura', color: '#f97316' },
]
