import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { startOfWeek, addDays, format } from 'date-fns'
import { STUDIOS, studioLabel } from './data/studios'
import { INVENTORY_SEED, createUnits } from './data/inventory'
import { BOOKING_TEMPLATES } from './data/bookings'
import { PHOTOGRAPHERS, MODELS } from './data/contacts'
import {
  usingSupabase,
  getInventory as sbGetInventory,
  getBookings as sbGetBookings,
  createBooking as sbCreateBooking,
  updateBooking as sbUpdateBooking,
  deleteBooking as sbDeleteBooking,
  toggleOwnership as sbToggleOwnership,
  addInventoryItem as sbAddInventoryItem,
} from './data/repository'
import { ensureSession } from './lib/auth'

const STORAGE_KEY = 'anntaylor-rental-demo'

// Build a fresh copy of the seeded data: clone the inventory, resolve booking
// dates to the current week, and reserve units (status -> checked_out,
// location -> set name) for each booking.
function buildSeedData() {
  const inventory = structuredClone(INVENTORY_SEED)
  const byId = Object.fromEntries(inventory.map((item) => [item.id, item]))
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })

  const bookings = BOOKING_TEMPLATES.map((t, idx) => {
    const date = format(addDays(weekStart, t.dayOffset), 'yyyy-MM-dd')
    const location = `${t.title} — ${studioLabel(t.studioId)}`
    const unitIds = []
    for (const [itemId, count] of t.reserve) {
      const item = byId[itemId]
      if (!item) continue
      const free = item.units.filter((u) => u.status === 'available').slice(0, count)
      for (const u of free) {
        u.status = 'checked_out'
        u.location = location
        unitIds.push(u.id)
      }
    }
    return {
      id: `set-${String(idx + 1).padStart(3, '0')}`,
      title: t.title,
      studioId: t.studioId,
      date,
      startTime: t.startTime,
      endTime: t.endTime,
      photographer: t.photographer,
      model: t.model,
      unitIds,
      status: 'active',
      color: t.color,
    }
  })

  return { inventory, bookings }
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  )
}

// Default chip colors cycled through for newly created bookings.
const BOOKING_COLORS = [
  '#3b82f6', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6',
  '#14b8a6', '#f43f5e', '#06b6d4', '#6366f1', '#f97316',
]

// Map each reserved unit id -> the location label of the (first) active
// booking that reserves it.
function reservationMap(bookings) {
  const map = new Map()
  for (const b of bookings) {
    if (b.status !== 'active') continue
    const location = `${b.title} — ${studioLabel(b.studioId)}`
    for (const uid of b.unitIds) if (!map.has(uid)) map.set(uid, location)
  }
  return map
}

// Recompute every unit's status/location from the active bookings. Units not
// reserved by any active booking are freed. Ownership is left untouched.
function withReservations(inventory, bookings) {
  const map = reservationMap(bookings)
  return inventory.map((item) => ({
    ...item,
    units: item.units.map((u) => {
      const location = map.get(u.id)
      if (location) {
        if (u.status === 'checked_out' && u.location === location) return u
        return { ...u, status: 'checked_out', location }
      }
      if (u.status === 'available' && u.location === 'Available') return u
      return { ...u, status: 'available', location: 'Available' }
    }),
  }))
}

export const useStore = create(
  persist(
    (set, get) => ({
      // --- static reference data ---
      studios: STUDIOS,
      photographers: PHOTOGRAPHERS,
      models: MODELS,

      // --- data ---
      // Local mode: seeded synchronously. Supabase mode: starts empty and is
      // filled by hydrate() when the app mounts.
      ...(usingSupabase
        ? { inventory: [], bookings: [], loading: true }
        : { ...buildSeedData(), loading: false }),

      // Fetch inventory + bookings from Supabase (no-op in local mode).
      hydrate: async () => {
        if (!usingSupabase) return
        set({ loading: true })
        try {
          // Authenticated (anonymous) session → roster/PII + writes under RLS.
          await ensureSession()
          const [inventory, bookings] = await Promise.all([
            sbGetInventory(),
            sbGetBookings(),
          ])
          set({ inventory, bookings, loading: false })
        } catch (e) {
          console.error('Supabase hydrate failed:', e)
          set({ loading: false })
        }
      },

      // --- UI state (not persisted — always starts on the current week) ---
      activeView: 'calendar', // 'calendar' | 'inventory'
      setActiveView: (view) => set({ activeView: view }),

      calendarMode: 'week', // 'week' | 'month'
      setCalendarMode: (mode) => set({ calendarMode: mode }),

      selectedDate: format(new Date(), 'yyyy-MM-dd'),
      setSelectedDate: (date) => set({ selectedDate: date }),

      // Reload data: re-fetch from Supabase, or rebuild the local seeds.
      resetDemoData: () =>
        usingSupabase
          ? get().hydrate()
          : set({ ...buildSeedData(), activeView: 'calendar' }),

      // Flip a single unit between owned and sub-rental (manual marking).
      // Optimistic in both modes; persisted to Supabase in the background.
      toggleOwnership: (itemId, unitId) => {
        const state = get()
        let next = 'owned'
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) => {
                  if (u.id !== unitId) return u
                  next = u.ownership === 'owned' ? 'sub_rental' : 'owned'
                  return { ...u, ownership: next }
                }),
              },
        )
        set({ inventory })
        if (usingSupabase) {
          sbToggleOwnership(unitId, next).catch((e) =>
            console.error('toggleOwnership failed:', e),
          )
        }
      },

      // Create a new inventory item with `quantity` freshly generated units.
      // Barcodes start past every existing one so ids never collide. Returns
      // the new item's id so the UI can select it.
      addInventoryItem: async ({ name, category, quantity }) => {
        if (usingSupabase) {
          const id = await sbAddInventoryItem({ name, category, quantity })
          await get().hydrate()
          return id
        }
        const state = get()
        const existingIds = new Set(state.inventory.map((i) => i.id))
        const base = slugify(name)
        let id = base
        let n = 2
        while (existingIds.has(id)) id = `${base}-${n++}`

        let maxBarcode = 0
        for (const item of state.inventory) {
          for (const u of item.units) {
            const num = parseInt(u.barcode, 10)
            if (Number.isFinite(num) && num > maxBarcode) maxBarcode = num
          }
        }

        const item = {
          id,
          name: name.trim(),
          category,
          units: createUnits(id, quantity, maxBarcode + 1),
        }
        set({ inventory: [item, ...state.inventory] })
        return id
      },

      // Create a booking and reserve its selected units.
      createBooking: async (data) => {
        if (usingSupabase) {
          const id = await sbCreateBooking(data)
          await get().hydrate()
          return id
        }
        const state = get()
        const booking = {
          id: `set-${Date.now().toString(36)}`,
          status: 'active',
          color: data.color || BOOKING_COLORS[state.bookings.length % BOOKING_COLORS.length],
          unitIds: [],
          ...data,
        }
        const bookings = [...state.bookings, booking]
        set({ bookings, inventory: withReservations(state.inventory, bookings) })
        return booking.id
      },

      // Update a booking and re-reserve units to match its new unit list.
      updateBooking: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateBooking(id, changes)
          await get().hydrate()
          return
        }
        const state = get()
        const bookings = state.bookings.map((b) =>
          b.id === id ? { ...b, ...changes } : b,
        )
        set({ bookings, inventory: withReservations(state.inventory, bookings) })
      },

      // Delete a booking and free its reserved units.
      deleteBooking: async (id) => {
        if (usingSupabase) {
          await sbDeleteBooking(id)
          await get().hydrate()
          return
        }
        const state = get()
        const bookings = state.bookings.filter((b) => b.id !== id)
        set({ bookings, inventory: withReservations(state.inventory, bookings) })
      },
    }),
    {
      name: STORAGE_KEY,
      version: 1,
      // Local mode persists data to localStorage. Supabase mode persists only
      // UI state — data always comes fresh from the database.
      partialize: (state) =>
        usingSupabase
          ? { activeView: state.activeView }
          : {
              inventory: state.inventory,
              bookings: state.bookings,
              activeView: state.activeView,
            },
    },
  ),
)
