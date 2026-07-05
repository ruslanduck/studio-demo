// Booking templates for the current week. `dayOffset` is days from Monday
// (0 = Mon … 6 = Sun); the store resolves these to real ISO dates relative to
// the current week so the calendar is always populated. `reserve` lists
// [inventoryItemId, unitCount] pairs — the store grabs that many available
// units from each item and marks them checked-out to this set.
//
// Spread includes a couple of bookings on "today" and on the weekend so the
// calendar's today/weekend tinting is visible.
export const BOOKING_TEMPLATES = [
  {
    title: 'Zara Denim Campaign',
    studioId: '1',
    dayOffset: 0, // Mon
    startTime: '08:00',
    endTime: '16:00',
    photographer: 'Marcus Reed',
    model: 'Ava Morgan',
    color: '#3b82f6',
    reserve: [['macbook-16', 1], ['kbd-magic', 2], ['mouse-magic', 2], ['cstand-40', 3], ['sandbag-25', 4]],
  },
  {
    title: 'Vogue Editorial',
    studioId: '3',
    dayOffset: 1, // Tue
    startTime: '09:00',
    endTime: '18:00',
    photographer: 'Sofia Ventura',
    model: 'Elena Petrova',
    color: '#ec4899',
    reserve: [['arri-2k', 2], ['stinger-25', 3], ['sandbag-25', 3], ['flag-24x36', 2]],
  },
  {
    title: 'Adidas Originals',
    studioId: '5',
    dayOffset: 1, // Tue
    startTime: '10:00',
    endTime: '15:00',
    photographer: 'Diego Alvarez',
    model: 'Mateo Rossi',
    color: '#10b981',
    reserve: [['aputure-600d', 1], ['aputure-300x', 2], ['cstand-40', 2], ['kbd-magic', 1]],
  },
  {
    title: 'Glossier Beauty',
    studioId: '2',
    dayOffset: 2, // Wed
    startTime: '09:30',
    endTime: '17:30',
    photographer: 'Priya Nair',
    model: 'Zoe Bennett',
    color: '#f59e0b',
    reserve: [['quasar-4ft', 4], ['astera-titan', 2], ['smallhd-702', 1]],
  },
  {
    title: 'Nike SS26 Lookbook',
    studioId: '2',
    dayOffset: 3, // Thu
    startTime: '09:00',
    endTime: '17:00',
    photographer: 'Ann Taylor',
    model: 'Jordan Lee',
    color: '#3b82f6',
    reserve: [['kbd-magic', 3], ['mouse-magic', 2], ['macbook-16', 1], ['sony-fx6', 1], ['sony-2470', 1]],
  },
  {
    title: 'Apple Product Shoot',
    studioId: 'L',
    dayOffset: 3, // Thu
    startTime: '11:00',
    endTime: '19:00',
    photographer: 'Liam Chen',
    model: 'Kai Nakamura',
    color: '#8b5cf6',
    reserve: [['canon-r5', 1], ['sony-2470', 1], ['aputure-600d', 1], ['macbook-16', 1], ['kbd-magic', 2]],
  },
  {
    title: 'H&M Kidswear',
    studioId: '4',
    dayOffset: 4, // Fri
    startTime: '08:30',
    endTime: '14:30',
    photographer: 'Noah Kim',
    model: 'Isla Fraser',
    color: '#14b8a6',
    reserve: [['arri-750', 2], ['stinger-25', 2], ['director-chair', 2], ['applebox-half', 2]],
  },
  {
    title: 'Wedding Editorial',
    studioId: '1',
    dayOffset: 5, // Sat (weekend)
    startTime: '12:00',
    endTime: '20:00',
    photographer: 'Sofia Ventura',
    model: 'Ava Morgan',
    color: '#f43f5e',
    reserve: [['canon-r5', 1], ['wireless-go-2', 1], ['sandbag-25', 2], ['cstand-40', 2]],
  },
  {
    title: 'Local Band EP',
    studioId: '5',
    dayOffset: 5, // Sat (weekend)
    startTime: '13:00',
    endTime: '21:00',
    photographer: 'Diego Alvarez',
    model: 'Omar Haddad',
    color: '#06b6d4',
    reserve: [['zoom-h6', 1], ['wireless-go-2', 1], ['astera-titan', 1]],
  },
  {
    title: 'Spotify Podcast Set',
    studioId: '3',
    dayOffset: 6, // Sun (today)
    startTime: '10:00',
    endTime: '16:00',
    photographer: 'Priya Nair',
    model: 'Zoe Bennett',
    color: '#6366f1',
    reserve: [['mkh-416', 2], ['zoom-h6', 1], ['wireless-go-2', 2], ['director-chair', 2]],
  },
  {
    title: 'Netflix BTS',
    studioId: 'L',
    dayOffset: 6, // Sun (today)
    startTime: '09:00',
    endTime: '18:00',
    photographer: 'Ann Taylor',
    model: 'Kai Nakamura',
    color: '#f97316',
    reserve: [['sony-fx6', 1], ['smallhd-702', 1], ['mixpre-6', 1], ['mkh-416', 1]],
  },
]
