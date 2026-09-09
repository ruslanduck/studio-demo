// Booking templates for the current week — the studio-calendar shoots (Sets).
// `dayOffset` is days from Monday (0 = Mon … 6 = Sun); the store resolves these
// to real ISO dates relative to the current week so the calendar is always
// populated. `days` is how long the shoot runs (default 1) — a set books whole
// days and may book several of them, which is what the two multi-day entries
// below demonstrate. Times are NOT part of a shoot any more: the grid is
// studio × day, and the crew types a start and an end date.
//
// Equipment is NO LONGER listed here. A Set's reserved units derive from its
// CONFIRMED order's in-house lines (see src/data/orders.js + lib/availability
// `reservedUnitsForOrder`) — one source of truth, so inventory and orders can't
// disagree. Each shoot below has a matching order (linked by title).
//
// Spread includes a couple of shoots on "today" and on the weekend so the
// calendar's today/weekend tinting is visible.
export const BOOKING_TEMPLATES = [
  { title: '20260624_AT_MAIN_SepBOM_Missy_OMSet1', studioId: '1', dayOffset: 0, days: 3, photographer: 'Marcus Reed', model: 'Hailey Halter', color: '#3b82f6' },
  { title: '20260629_AT_MAIN_SepBOM_Missy_OMSet1', studioId: '3', dayOffset: 1, photographer: 'Sofia Ventura', model: 'Hyunjoo', color: '#ec4899' },
  { title: '20260629_AT_MAIN_SepBOM_Missy_OMSet2', studioId: '5', dayOffset: 1, photographer: 'Diego Alvarez', model: 'Abigael Boivin', color: '#10b981' },
  { title: '20260625_AT_MAIN_SepBOM_Missy_OMSet1', studioId: '2', dayOffset: 2, photographer: 'Priya Nair', model: 'Amanda Googe', color: '#f59e0b' },
  { title: '20260630_AT_MAIN_SepBOM_Missy_OMSet1', studioId: '2', dayOffset: 3, photographer: 'Ann Taylor', model: 'Jade Huber', color: '#3b82f6' },
  { title: '20260630_AT_MAIN_SepBOM_Missy_OMSet2', studioId: 'L', dayOffset: 3, days: 2, photographer: 'Liam Chen', model: 'Lala Olsson', color: '#8b5cf6' },
  { title: '20260706_AT_MAIN_SepBOM_Missy_OMSet1', studioId: '4', dayOffset: 4, photographer: 'Noah Kim', model: 'Mia Speicher', color: '#14b8a6' },
  { title: '20260701_AT_MAIN_SepBOM_Missy_OMSet1', studioId: '1', dayOffset: 5, photographer: 'Sofia Ventura', model: 'Hailey Halter', color: '#f43f5e' },
  { title: '20260701_AT_MAIN_SepBOM_Missy_OMSet2', studioId: '5', dayOffset: 5, photographer: 'Diego Alvarez', model: 'Aira Ferreira', color: '#06b6d4' },
  { title: '20260715_AT_MAIN_SepMM_Missy_OMSet1', studioId: '3', dayOffset: 6, photographer: 'Priya Nair', model: 'Amanda Googe', color: '#6366f1' },
  { title: '20260716_AT_MAIN_SepMM_Missy_OMSet1', studioId: 'L', dayOffset: 6, photographer: 'Ann Taylor', model: 'Lala Olsson', color: '#f97316' },
]
