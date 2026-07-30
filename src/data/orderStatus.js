// Order status vocabulary (epic #5, 5.5).
//
// An order starts as HOLD (an estimate, yellow) and becomes CONFIRMED (green),
// which is what opens packing / scanning in epic #6. The colour lives here rather
// than inside a component because epic #7 pulls the same colour into the studio
// calendar — one definition, three consumers (list pill, detail pill, calendar).
//
// 'fulfilled' is the CLOSED state: the shoot happened and the gear came back, so
// the order stops holding stock. 'draft' / 'canceled' predate this epic (4.5
// history rows use them) and stay renderable even though nothing sets them.
export const ORDER_STATUS = {
  hold: {
    label: 'Hold',
    // What it means, shown next to the action so the crew isn't guessing.
    meaning: 'Estimate stage — gear is pencilled in, nothing is committed.',
    pill: 'bg-amber-100 text-amber-800 ring-amber-200',
    dot: 'bg-amber-400',
    calendar: '#f59e0b',
  },
  confirmed: {
    label: 'Confirmed',
    meaning: 'Committed — this is what goes to packing and scanning.',
    pill: 'bg-emerald-100 text-emerald-800 ring-emerald-200',
    dot: 'bg-emerald-500',
    calendar: '#10b981',
  },
  fulfilled: {
    label: 'Closed',
    meaning: 'Shot and returned — the gear is back on the shelf.',
    pill: 'bg-slate-100 text-slate-600 ring-slate-200',
    dot: 'bg-slate-400',
    calendar: '#64748b',
  },
  draft: {
    label: 'Draft',
    meaning: 'Not yet an estimate.',
    pill: 'bg-slate-100 text-slate-500 ring-slate-200',
    dot: 'bg-slate-300',
    calendar: '#94a3b8',
  },
  canceled: {
    label: 'Canceled',
    meaning: 'Called off.',
    pill: 'bg-rose-100 text-rose-700 ring-rose-200',
    dot: 'bg-rose-400',
    calendar: '#f43f5e',
  },
}

// The two states the crew toggles between while the job is still ahead of them.
export const ORDER_FLOW = ['hold', 'confirmed']

// Closing an order releases its gear; re-opening it has to ask for it back.
export const CLOSED_STATUS = 'fulfilled'
export const isClosedStatus = (status) => status === CLOSED_STATUS

export const orderStatusMeta = (status) => ORDER_STATUS[status] ?? ORDER_STATUS.draft

// Colour for a calendar chip driven by its order's status (epic #7 entry point).
export const orderStatusColor = (status) => orderStatusMeta(status).calendar
