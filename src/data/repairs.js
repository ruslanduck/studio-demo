// Repair-log seed (Build order #2, 2.6).
//
// Each template references a unit by its item id + unit index (0-based) so it
// resolves in both data modes — local (unit ids like `u-0855`) and Supabase
// (uuid unit ids). Dates are expressed relative to "today" and materialized at
// seed time so the demo always shows recent, believable activity.
export const REPAIR_TEMPLATES = [
  // Currently OUT for repair (open — no return date) → units read "In repair".
  {
    itemId: 'canon-r5',
    unitIndex: 0,
    vendor: 'Canon Professional Services',
    issue: 'Err 70 — shutter mechanism failure, will not fire',
    sentDaysAgo: 6,
    returnDaysAgo: null,
    resolution: null,
  },
  {
    itemId: 'aputure-600d',
    unitIndex: 0,
    vendor: 'Aputure Service Center',
    issue: 'Fan rattle + intermittent thermal shutdown at full output',
    sentDaysAgo: 3,
    returnDaysAgo: null,
    resolution: null,
  },
  // Completed repairs (returned) → history only, unit is available again.
  {
    itemId: 'macbook-16',
    unitIndex: 1,
    vendor: 'Apple Store — Genius Bar',
    issue: 'Swollen battery flagged during pre-shoot check',
    sentDaysAgo: 34,
    returnDaysAgo: 21,
    resolution: 'Battery + top case replaced under AppleCare',
  },
  {
    itemId: 'sony-fx6',
    unitIndex: 2,
    vendor: 'Sony Pro Support',
    issue: 'SDI out — no signal to external recorder',
    sentDaysAgo: 62,
    returnDaysAgo: 48,
    resolution: 'SDI board reflowed and retested; passed 24h burn-in',
  },
]

// Turn a template's relative day offsets into ISO dates, given a `today` Date
// and a (day -> ISO) formatter. Returns { sentAt, returnedAt }.
export function repairDates(t, today, isoFor) {
  const daysBefore = (n) => isoFor(new Date(today.getTime() - n * 86400000))
  return {
    sentAt: daysBefore(t.sentDaysAgo),
    returnedAt: t.returnDaysAgo == null ? null : daysBefore(t.returnDaysAgo),
  }
}
