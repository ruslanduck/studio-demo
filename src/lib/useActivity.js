import { useEffect, useMemo, useState } from 'react'
import { useStore } from '../store'

// One entity's activity, newest first.
//
// Supabase mode queries on demand (the same lazy pattern as the unit-history
// dialog) rather than loading every feed in hydrate(); local mode filters the
// persisted array. `activityVersion` is what makes an open card refresh after a
// write — deliberately not `orders`, which changes on every quiet hydrate and
// would refetch constantly.
export function useActivity({ orderId = null, itemId = null, unitIds = null } = {}) {
  const version = useStore((s) => s.activityVersion)
  const localActivity = useStore((s) => s.activity)
  const fetchActivity = useStore((s) => s.fetchActivity)
  const fetchActivityForUnits = useStore((s) => s.fetchActivityForUnits)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)

  // Stable dep: the array identity changes on every render otherwise.
  const unitKey = useMemo(() => (unitIds || []).join(','), [unitIds])

  useEffect(() => {
    let alive = true
    const run = async () => {
      setLoading(true)
      try {
        const parts = []
        if (orderId) parts.push(await fetchActivity('order', orderId))
        if (itemId) parts.push(await fetchActivity('item', itemId))
        // An item's units carry their own events (reservations, repairs).
        if (unitKey) parts.push(await fetchActivityForUnits(unitKey.split(',')))
        if (!alive) return
        // Merge + de-duplicate (a unit event can arrive from both queries).
        const seen = new Set()
        const merged = []
        for (const row of parts.flat()) {
          const key = String(row.id)
          if (seen.has(key)) continue
          seen.add(key)
          merged.push(row)
        }
        merged.sort((a, b) => String(b.at).localeCompare(String(a.at)))
        setRows(merged)
      } finally {
        if (alive) setLoading(false)
      }
    }
    run()
    return () => {
      alive = false
    }
    // localActivity is a dep so local mode updates instantly.
  }, [orderId, itemId, unitKey, version, localActivity, fetchActivity, fetchActivityForUnits])

  return { events: rows, loading }
}
