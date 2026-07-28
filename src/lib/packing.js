// Packing checklist helpers (epic #6, 6.2 + 6.5). Shared by the store, the
// digital checklist modal and (later) the scanning page so all agree on how a
// line is identified and when it's considered signed out / returned.

// The three sign-off slots per line: two at sign-out, one at return.
export const PACKING_SLOTS = ['out1', 'out2', 'ret']

// A stable key for a packing-list line. Order lines are replaced wholesale when
// equipment is edited, so we key sign-offs by the line's content, not its id.
// item + slot label + barcode is unique per line (a-la-carte is one line per
// item; kit slots each carry their own assigned unit's barcode).
export const packingLineKey = (line) =>
  `${line.itemId ?? ''}::${line.slotLabel ?? ''}::${line.barcode ?? ''}`

// A line is "out" once BOTH sign-out slots are initialled; "returned" once the
// return slot is. Returns counts over a flat list of estimate lines.
export function packingProgress(lines = [], packing = {}) {
  let out = 0
  let ret = 0
  for (const l of lines) {
    const s = packing[packingLineKey(l)] || {}
    if (s.out1?.initials && s.out2?.initials) out += 1
    if (s.ret?.initials) ret += 1
  }
  return { total: lines.length, out, ret }
}
