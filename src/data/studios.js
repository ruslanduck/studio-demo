// The six fixed studios. "L" is a large studio — treated like any other,
// only its displayed label differs.
export const STUDIOS = ['1', '2', '3', '4', '5', 'L']

export function studioLabel(id) {
  return id === 'L' ? 'Studio L' : `Studio ${id}`
}

// Stable per-studio colors — used to color-code chips in the month view.
export const STUDIO_COLORS = {
  1: '#3b82f6', // blue
  2: '#ec4899', // pink
  3: '#10b981', // emerald
  4: '#f59e0b', // amber
  5: '#8b5cf6', // violet
  L: '#06b6d4', // cyan
}

export function studioColor(id) {
  return STUDIO_COLORS[id] ?? '#64748b'
}
