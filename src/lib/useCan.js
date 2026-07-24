import { useStore } from '../store'
import { can } from './permissions'

// Returns a can(capability) checker bound to the current user's role.
// Local mode (no profile) → full access.
export function useCan() {
  const role = useStore((s) => s.profile?.role)
  return (capability) => can(role, capability)
}
