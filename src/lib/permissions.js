// Central permission model.
//
// Today there is ONE flat role — "Equipment Team" — with full rights
// (add / edit / delete / write-off). Nothing in the UI checks role strings
// directly; everything goes through can()/useCan() against the capability map
// below. To introduce granular roles later, add entries to ROLE_CAPABILITIES
// and assign profiles.role — no call sites change.

// Declared capabilities (extend as features grow — e.g. write-off UI).
export const CAP = {
  BOOKING_CREATE: 'booking.create',
  BOOKING_EDIT: 'booking.edit',
  BOOKING_DELETE: 'booking.delete',
  INVENTORY_ADD: 'inventory.add',
  INVENTORY_EDIT: 'inventory.edit',
  INVENTORY_DELETE: 'inventory.delete',
  UNIT_OWNERSHIP_TOGGLE: 'unit.ownership_toggle',
  UNIT_WRITE_OFF: 'unit.write_off',
  UNIT_REPAIR: 'unit.repair',
  ITEM_USAGE_LOG: 'item.usage_log',
  // Authoring the presets themselves (3.6): kit composition and scenario lists.
  KIT_MANAGE: 'kit.manage',
  SCENARIO_MANAGE: 'scenario.manage',
  // People & company databases (4.1 / 4.2).
  PERSON_MANAGE: 'person.manage',
  COMPANY_MANAGE: 'company.manage',
  // Orders / estimates (epic #5).
  ORDER_MANAGE: 'order.manage',
  // The scanning station (epic #6): signing gear out of the building and back
  // in. Separate from ORDER_MANAGE because a packing shift is allowed to move
  // gear without being allowed to rewrite the order.
  SCAN: 'scan.use',
}

export const ALL_CAPS = Object.values(CAP)

// role -> capabilities. '*' means "all". Add granular roles here later, e.g.:
//   viewer:  [],
//   manager: [CAP.BOOKING_CREATE, CAP.BOOKING_EDIT, CAP.BOOKING_DELETE],
const ROLE_CAPABILITIES = {
  equipment_team: '*',
}

const ROLE_LABELS = {
  equipment_team: 'Equipment Team',
}

// Does `role` grant `capability`?
export function can(role, capability) {
  // No role → local demo / not signed in → full access (single-user demo).
  if (!role) return true
  // Unknown role currently falls back to full access (only one role exists);
  // tighten this once granular roles are introduced.
  const caps = ROLE_CAPABILITIES[role] ?? '*'
  return caps === '*' || caps.includes(capability)
}

export function roleLabel(role) {
  if (!role) return ''
  return ROLE_LABELS[role] ?? role.replace(/_/g, ' ')
}
