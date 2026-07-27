import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { startOfWeek, addDays, format } from 'date-fns'
import { STUDIOS, studioLabel } from './data/studios'
import { INVENTORY_SEED, createUnits } from './data/inventory'
import { REPAIR_TEMPLATES, repairDates } from './data/repairs'
import { generateUsage } from './data/usage'
import { KIT_SEED } from './data/kits'
import { SCENARIO_SEED } from './data/scenarios'
import { BOOKING_TEMPLATES } from './data/bookings'
import { PHOTOGRAPHERS, MODELS } from './data/contacts'
import {
  usingSupabase,
  getInventory as sbGetInventory,
  getBookings as sbGetBookings,
  getKits as sbGetKits,
  getScenarioLists as sbGetScenarioLists,
  createBooking as sbCreateBooking,
  updateBooking as sbUpdateBooking,
  deleteBooking as sbDeleteBooking,
  toggleOwnership as sbToggleOwnership,
  setUnitBarcode as sbSetUnitBarcode,
  sendToRepair as sbSendToRepair,
  returnFromRepair as sbReturnFromRepair,
  logItemUsage as sbLogItemUsage,
  addInventoryItem as sbAddInventoryItem,
  updateInventoryItem as sbUpdateInventoryItem,
  deleteInventoryItem as sbDeleteInventoryItem,
  createKit as sbCreateKit,
  updateKit as sbUpdateKit,
  deleteKit as sbDeleteKit,
  createScenarioList as sbCreateScenarioList,
  updateScenarioList as sbUpdateScenarioList,
  deleteScenarioList as sbDeleteScenarioList,
} from './data/repository'
import { supabase } from './lib/supabase'

const STORAGE_KEY = 'anntaylor-rental-demo'

// Build a fresh copy of the seeded data: clone the inventory, resolve booking
// dates to the current week, and reserve units (status -> checked_out,
// location -> set name) for each booking.
function buildSeedData() {
  const inventory = structuredClone(INVENTORY_SEED)
  for (const item of inventory) for (const u of item.units) u.repairs = []
  const byId = Object.fromEntries(inventory.map((item) => [item.id, item]))
  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 })

  // Work-history / usage seeds (attach a year of usage events per item).
  const usageByItem = generateUsage(new Date(), (d) => format(d, 'yyyy-MM-dd'))
  for (const item of inventory) item.usage = usageByItem[item.id] || []

  // Repair-log seeds first: an OPEN repair marks the unit 'in_repair' so the
  // booking loop below skips it (a unit out for repair can't be reserved).
  const today = new Date()
  const isoFor = (d) => format(d, 'yyyy-MM-dd')
  for (const t of REPAIR_TEMPLATES) {
    const unit = byId[t.itemId]?.units[t.unitIndex]
    if (!unit) continue
    const { sentAt, returnedAt } = repairDates(t, today, isoFor)
    unit.repairs.unshift({
      id: `rep-${t.itemId}-${t.unitIndex}`,
      vendor: t.vendor,
      issue: t.issue,
      sentAt,
      returnedAt,
      resolution: t.resolution,
    })
    if (!returnedAt) {
      unit.status = 'in_repair'
      unit.location = `In repair — ${t.vendor || 'Vendor'}`
    }
  }

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

  // Kits (entry type #2): resolve each slot's component item for display.
  const kits = KIT_SEED.map((k) => ({
    id: k.id,
    name: k.name,
    category: k.category,
    notes: k.notes,
    slots: k.slots.map((s, i) => {
      const it = byId[s.itemId]
      // FIXED slots pin one specific unit (by its index within the item);
      // GENERIC slots leave the concrete unit unassigned (scanned at pull time).
      const fixedUnit =
        s.slotType === 'fixed' && it ? it.units[s.fixedUnitIndex ?? 0] || null : null
      return {
        id: `${k.id}-slot-${i}`,
        label: s.label,
        position: i,
        slotType: s.slotType || 'generic',
        itemId: s.itemId,
        itemName: it?.name || null,
        itemCategory: it?.category || null,
        itemKind: it?.kind || null,
        fixedUnitId: fixedUnit?.id || null,
        fixedBarcode: fixedUnit?.barcode || null,
      }
    }),
  }))

  // Predefined scenario lists (3.5): resolve each entry to its item or kit so
  // the UI can show names/availability without another lookup.
  const kitById = Object.fromEntries(kits.map((k) => [k.id, k]))
  const scenarios = SCENARIO_SEED.map((l) => ({
    id: l.id,
    name: l.name,
    category: l.category,
    notes: l.notes,
    entries: l.entries.map((e, i) => {
      const kit = e.kit ? kitById[e.kit] : null
      const item = e.item ? byId[e.item] : null
      return {
        id: `${l.id}-entry-${i}`,
        type: e.kit ? 'kit' : 'item',
        quantity: e.kit ? 1 : (e.qty ?? 1),
        position: i,
        note: e.note || null,
        itemId: item?.id || null,
        itemName: item?.name || null,
        itemKind: item?.kind || null,
        kitId: kit?.id || null,
        kitName: kit?.name || null,
      }
    }),
  }))

  return { inventory, bookings, kits, scenarios }
}

function slugify(name) {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'item'
  )
}

// First free id of the form base, base-2, base-3… (local mode only; Supabase
// hands out uuids).
function uniqueId(base, existing) {
  const taken = new Set(existing)
  if (!taken.has(base)) return base
  let n = 2
  while (taken.has(`${base}-${n}`)) n++
  return `${base}-${n}`
}

const trimmed = (v) => (typeof v === 'string' ? v.trim() || null : v || null)

// Resolve an authored kit (3.6) into the shape the UI reads: component names
// plus, for FIXED slots, the pinned unit's barcode. Accepts either editor slots
// ({ itemId, label, slotType, fixedUnitId }) or already-resolved ones, so it can
// re-resolve a kit after an edit. A slot whose pinned unit can't be found
// degrades to GENERIC — mirroring the DB check constraint.
function resolveKit(kit, inventory) {
  const byId = Object.fromEntries(inventory.map((i) => [i.id, i]))
  return {
    id: kit.id,
    name: kit.name,
    category: trimmed(kit.category),
    notes: trimmed(kit.notes),
    slots: (kit.slots || [])
      .filter((s) => s.itemId)
      .map((s, i) => {
        const it = byId[s.itemId]
        const fixedUnit =
          s.slotType === 'fixed' && s.fixedUnitId
            ? (it?.units || []).find((u) => u.id === s.fixedUnitId) || null
            : null
        return {
          id: s.id || `${kit.id}-slot-${i}`,
          label: trimmed(s.label),
          position: i,
          slotType: fixedUnit ? 'fixed' : 'generic',
          itemId: s.itemId,
          itemName: it?.name || null,
          itemCategory: it?.category || null,
          itemKind: it?.kind || null,
          fixedUnitId: fixedUnit?.id || null,
          fixedBarcode: fixedUnit?.barcode || null,
        }
      }),
  }
}

// Same for an authored scenario list (3.6). Kit entries are always quantity 1
// (a kit is staged one at a time), matching the DB constraint.
function resolveScenario(list, inventory, kits) {
  const byId = Object.fromEntries(inventory.map((i) => [i.id, i]))
  const kitById = Object.fromEntries(kits.map((k) => [k.id, k]))
  return {
    id: list.id,
    name: list.name,
    category: trimmed(list.category),
    notes: trimmed(list.notes),
    entries: (list.entries || [])
      .filter((e) => (e.type === 'kit' ? e.kitId : e.itemId))
      .map((e, i) => {
        const isKit = e.type === 'kit'
        const kit = isKit ? kitById[e.kitId] : null
        const item = isKit ? null : byId[e.itemId]
        return {
          id: e.id || `${list.id}-entry-${i}`,
          type: isKit ? 'kit' : 'item',
          quantity: isKit ? 1 : Math.max(1, Number(e.quantity) || 1),
          position: i,
          note: trimmed(e.note),
          itemId: item?.id || null,
          itemName: item?.name || null,
          itemKind: item?.kind || null,
          kitId: kit?.id || null,
          kitName: kit?.name || null,
        }
      }),
  }
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

// The unit's currently-open repair (no return date), if any.
function openRepairOf(unit) {
  return (unit.repairs || []).find((r) => !r.returnedAt) || null
}

// Recompute every unit's status/location from the active bookings + repairs.
// Precedence: an open repair (unbookable) wins over a reservation, which wins
// over free. Units not reserved by any active booking are freed. Ownership is
// left untouched.
function withReservations(inventory, bookings) {
  const map = reservationMap(bookings)
  return inventory.map((item) => ({
    ...item,
    units: item.units.map((u) => {
      const repair = openRepairOf(u)
      if (repair) {
        const location = `In repair — ${repair.vendor || 'Vendor'}`
        if (u.status === 'in_repair' && u.location === location) return u
        return { ...u, status: 'in_repair', location }
      }
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
        ? { inventory: [], bookings: [], kits: [], scenarios: [], loading: true }
        : { ...buildSeedData(), loading: false }),

      // Fetch inventory + bookings + kits + scenario lists from Supabase
      // (no-op in local mode).
      hydrate: async () => {
        if (!usingSupabase) return
        set({ loading: true })
        try {
          const [inventory, bookings, kits, scenarios] = await Promise.all([
            sbGetInventory(),
            sbGetBookings(),
            sbGetKits(),
            sbGetScenarioLists(),
          ])
          set({ inventory, bookings, kits, scenarios, loading: false })
        } catch (e) {
          console.error('Supabase hydrate failed:', e)
          set({ loading: false })
        }
      },

      // --- UI state (not persisted — always starts on the current week) ---
      activeView: 'calendar', // 'calendar' | 'inventory'
      setActiveView: (view) => set({ activeView: view }),

      // Mobile/tablet off-canvas sidebar drawer.
      sidebarOpen: false,
      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      calendarMode: 'week', // 'week' | 'month'
      setCalendarMode: (mode) => set({ calendarMode: mode }),

      selectedDate: format(new Date(), 'yyyy-MM-dd'),
      setSelectedDate: (date) => set({ selectedDate: date }),

      // --- auth (supabase mode only; local mode has no login) ---
      session: null,
      profile: null,
      authReady: !usingSupabase,

      // Subscribe to auth changes; load profile + hydrate data when signed in.
      initAuth: () => {
        if (!usingSupabase) return
        supabase.auth.onAuthStateChange((_event, session) => {
          set({ session })
          // Defer supabase calls out of the auth callback (avoids a lock deadlock).
          setTimeout(async () => {
            if (session) {
              const { data } = await supabase
                .from('profiles')
                .select('id, full_name, role')
                .eq('id', session.user.id)
                .maybeSingle()
              if (!data) {
                // Session without a team profile (e.g. a stale anonymous
                // session) — reject and fall back to the login screen.
                await supabase.auth.signOut()
                set({ authReady: true })
                return
              }
              set({ profile: data })
              await get().hydrate()
            } else {
              set({ profile: null, inventory: [], bookings: [], kits: [], scenarios: [] })
            }
            set({ authReady: true })
          }, 0)
        })
      },

      signIn: async (email, password) => {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
      },
      // Register a new team member. Returns the session (null if the project
      // requires email confirmation — the UI then shows a "check your email"
      // message). New users get a 'crew' profile via the DB trigger.
      signUp: async ({ email, password, fullName }) => {
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName } },
        })
        if (error) throw error
        return data.session
      },
      signOut: async () => {
        await supabase.auth.signOut()
      },

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

      // Set/correct a unit's barcode (3.4). Returns { ok } or { error } — the
      // caller (kit staging) uses it to guard against duplicate barcodes.
      setUnitBarcode: (itemId, unitId, barcode) => {
        const code = String(barcode || '').trim()
        if (!code) return { error: 'Barcode cannot be empty.' }
        const state = get()
        const clash = state.inventory.some((item) =>
          item.units?.some((u) => u.id !== unitId && u.barcode === code),
        )
        if (clash) return { error: `#${code} is already used by another unit.` }
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) => (u.id === unitId ? { ...u, barcode: code } : u)),
              },
        )
        set({ inventory })
        if (usingSupabase) {
          sbSetUnitBarcode(unitId, code).catch((e) => console.error('setUnitBarcode failed:', e))
        }
        return { ok: true }
      },

      // Send a unit out for repair. Opens a repair entry; the unit becomes
      // 'in_repair' (unavailable) until it's returned.
      sendToRepair: async (itemId, unitId, details = {}) => {
        if (usingSupabase) {
          await sbSendToRepair(unitId, details)
          await get().hydrate()
          return
        }
        const state = get()
        const repair = {
          id: `rep-${Date.now().toString(36)}`,
          vendor: details.vendor || null,
          issue: details.issue || null,
          sentAt: details.sentAt || format(new Date(), 'yyyy-MM-dd'),
          returnedAt: null,
          resolution: null,
        }
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) =>
                  u.id !== unitId
                    ? u
                    : { ...u, repairs: [repair, ...(u.repairs || [])] },
                ),
              },
        )
        set({ inventory: withReservations(inventory, state.bookings) })
      },

      // Close a unit's open repair (returned date + resolution). The unit frees
      // up unless it's still reserved by an active booking.
      returnFromRepair: async (itemId, unitId, repairId, details = {}) => {
        if (usingSupabase) {
          await sbReturnFromRepair(repairId, details)
          await get().hydrate()
          return
        }
        const state = get()
        const returnedAt = details.returnedAt || format(new Date(), 'yyyy-MM-dd')
        const inventory = state.inventory.map((item) =>
          item.id !== itemId
            ? item
            : {
                ...item,
                units: item.units.map((u) =>
                  u.id !== unitId
                    ? u
                    : {
                        ...u,
                        repairs: (u.repairs || []).map((r) =>
                          r.id !== repairId
                            ? r
                            : { ...r, returnedAt, resolution: details.resolution || null },
                        ),
                      },
                ),
              },
        )
        set({ inventory: withReservations(inventory, state.bookings) })
      },

      // Record a usage event for an item (work-history / analytics).
      logUsage: async (itemId, details = {}) => {
        if (usingSupabase) {
          await sbLogItemUsage(itemId, details)
          await get().hydrate()
          return
        }
        const state = get()
        const event = {
          jobTitle: details.jobTitle || null,
          studioId: details.studioId || null,
          quantity: details.quantity || 1,
          usedOn: details.usedOn || format(new Date(), 'yyyy-MM-dd'),
        }
        set({
          inventory: state.inventory.map((item) =>
            item.id !== itemId
              ? item
              : {
                  ...item,
                  usage: [event, ...(item.usage || [])].sort((a, b) =>
                    a.usedOn < b.usedOn ? 1 : -1,
                  ),
                },
          ),
        })
      },

      // Create a new inventory item with `quantity` freshly generated units.
      // Barcodes start past every existing one so ids never collide. Returns
      // the new item's id so the UI can select it.
      addInventoryItem: async ({ name, category, quantity, kind = 'barcoded', ...fields }) => {
        if (usingSupabase) {
          const id = await sbAddInventoryItem({ name, category, quantity, kind, ...fields })
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

        const attrs = {
          brand: fields.brand || null,
          assetType: fields.assetType || null,
          placement: fields.placement || null,
          subcategory: fields.subcategory || null,
          purchaseDate: fields.purchaseDate || null,
          replacementPrice: fields.replacementPrice || null,
        }
        const base_ = { id, name: name.trim(), category, kind, ...attrs }
        const item =
          kind === 'barcoded'
            ? { ...base_, quantity: 0, units: createUnits(id, quantity, maxBarcode + 1) }
            : { ...base_, quantity, units: [] }
        set({ inventory: [item, ...state.inventory] })
        return id
      },

      // Edit an item's fields (kind immutable; quantity only for non-barcoded).
      updateInventoryItem: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateInventoryItem(id, changes)
          await get().hydrate()
          return
        }
        const state = get()
        const { name, category, quantity, kind, ...fields } = changes
        const inventory = state.inventory.map((item) => {
          if (item.id !== id) return item
          const next = { ...item }
          if (name != null) next.name = name.trim()
          if (category != null) next.category = category
          for (const k of ['brand', 'assetType', 'placement', 'subcategory', 'purchaseDate', 'replacementPrice']) {
            if (k in fields) next[k] = fields[k] || null
          }
          if (item.kind !== 'barcoded' && quantity != null) next.quantity = quantity
          return next
        })
        // Kit slots and list entries cache the component's name/category, so
        // re-resolve the presets after an item edit to avoid stale labels.
        const kits = state.kits.map((k) => resolveKit(k, inventory))
        set({
          inventory,
          kits,
          scenarios: state.scenarios.map((l) => resolveScenario(l, inventory, kits)),
        })
      },

      // Delete an item (write-off). Frees its units from any bookings.
      deleteInventoryItem: async (id) => {
        if (usingSupabase) {
          await sbDeleteInventoryItem(id)
          await get().hydrate()
          return
        }
        const state = get()
        const item = state.inventory.find((i) => i.id === id)
        const unitIds = new Set((item?.units || []).map((u) => u.id))
        set({
          inventory: state.inventory.filter((i) => i.id !== id),
          bookings: state.bookings.map((b) => ({
            ...b,
            unitIds: (b.unitIds || []).filter((uid) => !unitIds.has(uid)),
          })),
        })
      },

      // ---- Kit authoring (3.6) ------------------------------------------
      // Editor slots arrive as { itemId, label, slotType, fixedUnitId }; local
      // mode resolves the display fields the UI reads (names, fixed barcode).
      createKit: async ({ name, category, notes, slots }) => {
        if (usingSupabase) {
          await sbCreateKit({ name, category, notes, slots })
          await get().hydrate()
          return
        }
        const state = get()
        const id = uniqueId(
          slugify(name),
          state.kits.map((k) => k.id),
        )
        set({
          kits: [
            ...state.kits,
            resolveKit({ id, name: name.trim(), category, notes, slots }, state.inventory),
          ].sort((a, b) => a.name.localeCompare(b.name)),
        })
        return id
      },

      updateKit: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateKit(id, changes)
          await get().hydrate()
          return
        }
        const state = get()
        const kits = state.kits
          .map((k) => (k.id === id ? resolveKit({ ...k, ...changes, id }, state.inventory) : k))
          .sort((a, b) => a.name.localeCompare(b.name))
        // Scenario entries cache the kit's name for display — re-resolve them so a
        // rename doesn't leave stale labels. (Supabase mode re-reads the join.)
        set({
          kits,
          scenarios: state.scenarios.map((l) => resolveScenario(l, state.inventory, kits)),
        })
      },

      // Deleting a kit also drops any scenario-list line pointing at it (the DB
      // cascades; local mode mirrors that so the two sources agree).
      deleteKit: async (id) => {
        if (usingSupabase) {
          await sbDeleteKit(id)
          await get().hydrate()
          return
        }
        const state = get()
        set({
          kits: state.kits.filter((k) => k.id !== id),
          scenarios: state.scenarios.map((l) => ({
            ...l,
            entries: (l.entries || []).filter((e) => e.kitId !== id),
          })),
        })
      },

      // ---- Scenario list authoring (3.6) --------------------------------
      // Editor entries arrive as { type, itemId|kitId, quantity, note }.
      createScenario: async ({ name, category, notes, entries }) => {
        if (usingSupabase) {
          await sbCreateScenarioList({ name, category, notes, entries })
          await get().hydrate()
          return
        }
        const state = get()
        const id = uniqueId(
          slugify(name),
          state.scenarios.map((l) => l.id),
        )
        set({
          scenarios: [
            ...state.scenarios,
            resolveScenario(
              { id, name: name.trim(), category, notes, entries },
              state.inventory,
              state.kits,
            ),
          ].sort((a, b) => a.name.localeCompare(b.name)),
        })
        return id
      },

      updateScenario: async (id, changes) => {
        if (usingSupabase) {
          await sbUpdateScenarioList(id, changes)
          await get().hydrate()
          return
        }
        const state = get()
        set({
          scenarios: state.scenarios
            .map((l) =>
              l.id === id
                ? resolveScenario({ ...l, ...changes, id }, state.inventory, state.kits)
                : l,
            )
            .sort((a, b) => a.name.localeCompare(b.name)),
        })
      },

      deleteScenario: async (id) => {
        if (usingSupabase) {
          await sbDeleteScenarioList(id)
          await get().hydrate()
          return
        }
        set({ scenarios: get().scenarios.filter((l) => l.id !== id) })
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
              kits: state.kits,
              scenarios: state.scenarios,
              activeView: state.activeView,
            },
    },
  ),
)
