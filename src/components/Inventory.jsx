import { Boxes } from 'lucide-react'
import { useStore } from '../store'
import PlaceholderPanel from './PlaceholderPanel'

export default function Inventory() {
  const inventory = useStore((s) => s.inventory)
  const totalUnits = inventory.reduce((n, item) => n + item.units.length, 0)
  const categories = new Set(inventory.map((item) => item.category)).size

  return (
    <PlaceholderPanel
      icon={Boxes}
      title="Inventory"
      subtitle="Search, category filters, and the per-unit detail table are coming in the next build step. Seed data is already loaded and ready."
      stats={[
        { label: 'Items', value: inventory.length },
        { label: 'Units', value: totalUnits },
        { label: 'Categories', value: categories },
      ]}
    />
  )
}
