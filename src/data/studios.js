// The six fixed studios. "L" is a large studio — treated like any other,
// only its displayed label differs.
export const STUDIOS = ['1', '2', '3', '4', '5', 'L']

export function studioLabel(id) {
  return id === 'L' ? 'Studio L' : `Studio ${id}`
}
