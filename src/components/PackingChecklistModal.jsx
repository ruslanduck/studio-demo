import { Check, PackageCheck, Barcode, Layers } from 'lucide-react'
import Modal from './Modal'
import { useStore } from '../store'
import { packingLineKey, packingProgress, packingRows, PACKED_SLOT } from '../lib/packing'

// Two letters for the person doing the packing. The DATA still holds initials
// (that's what the paper form and the PDF carry), but nobody types them any more
// — one tap signs as whoever is logged in.
const initialsOf = (name) =>
  (name || '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('') || '?'

// The tick: "this is in the case". One per row — the two sign-out fields and the
// return field went with the paper form they came from. It still records the
// signed-in account's initials and the timestamp, so who + when stays answerable
// (hover the box); clicking again clears it.
function SignCheck({ signoff, onSign, onClear, label }) {
  const signed = !!signoff?.initials
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={signed}
      aria-label={label}
      onClick={() => (signed ? onClear() : onSign())}
      title={
        signed
          ? `${signoff.initials}${signoff.at ? ' · ' + new Date(signoff.at).toLocaleString() : ''} · tap to undo`
          : label
      }
      className={[
        'grid h-9 w-11 shrink-0 place-items-center rounded-md border transition',
        signed
          ? 'border-emerald-400 bg-emerald-500 text-white'
          : 'border-slate-300 text-transparent hover:border-violet-400 hover:bg-violet-50',
      ].join(' ')}
    >
      <Check size={16} strokeWidth={3} />
      {signed && signoff.initials && (
        <span className="sr-only">{signoff.initials}</span>
      )}
    </button>
  )
}

// Digital packing checklist (epic #6, 6.2 + 6.5). The on-screen / iPad form of
// the packing list: each line has the three sign-off boxes (two at sign-out,
// one at return). Sign-offs are optimistic + auto-saved via the store.
export default function PackingChecklistModal({
  open,
  order,
  estimate,
  title = 'Packing checklist',
  onSign,
  onClear,
  onClose,
}) {
  // The shoot supplies the concrete copies (its reservations), which is what lets
  // a x2 line become two ticks. Read here rather than threaded through every
  // caller — the same reasoning as ItemAvailability.
  const inventory = useStore((s) => s.inventory)
  const bookings = useStore((s) => s.bookings)
  const profile = useStore((s) => s.profile)
  const myInitials = initialsOf(profile?.full_name ?? 'Demo user')

  const packing = order?.packing || {}
  const booking = bookings.find((b) => b.id === order?.setId) ?? null
  const groups = packingRows(estimate, { inventory, booking })
  const allLines = groups.flatMap((g) => g.lines)
  const prog = packingProgress(allLines, packing)
  const unitRows = allLines.filter((r) => r.kind === 'unit').length

  const sign = (line, slot) =>
    onSign(packingLineKey(line), slot, myInitials, line.itemName)
  const clear = (line, slot) => onClear(packingLineKey(line), slot)

  return (
    <Modal open={open} onClose={onClose} size="lg" title={title}>
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {order && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">
                {order.jobName ?? order.setTitle ?? 'Order'}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {order.poNumber ? `PO ${order.poNumber} · ` : ''}
                One row per barcoded copy — tick it once it's in the case. Returns are recorded at
                the scanning station.
              </div>
            </div>
            <div className="shrink-0 text-center text-xs">
              <div className="text-base font-semibold text-slate-900">
                {prog.packed}/{prog.total}
              </div>
              <div className="text-slate-400">packed</div>
            </div>
          </div>
        )}

        {allLines.length === 0 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            No equipment on this order to pack.
          </p>
        ) : (
          <>
            <div className="mb-1 flex items-center gap-3 px-3 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              <span className="min-w-0 flex-1">
                {prog.total} row{prog.total === 1 ? '' : 's'}
                {unitRows > 0 ? ` · ${unitRows} by barcode` : ''}
              </span>
              <span className="w-11 shrink-0 text-center">Packed</span>
            </div>
            <div className="space-y-3">
              {groups.map((g) => (
                <div key={g.kitId ?? 'items'}>
                  <div className="mb-1 px-1">
                    <span
                      className={[
                        'inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                        g.type === 'kit'
                          ? 'bg-violet-100 text-violet-700'
                          : 'bg-slate-200 text-slate-600',
                      ].join(' ')}
                    >
                      {g.type === 'kit' && <Layers size={10} />}
                      {g.type === 'kit' ? g.name : 'A-la-carte'}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {g.lines.map((l, i) => {
                      const key = packingLineKey(l)
                      const s = packing[key] || {}
                      // A legacy double sign-out still counts as packed.
                      const packed =
                        !!s[PACKED_SLOT]?.initials || !!(s.out1?.initials && s.out2?.initials)
                      return (
                        <li
                          key={`${key}-${i}`}
                          className={[
                            'flex items-center gap-3 rounded-lg border px-3 py-2',
                            packed ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200',
                          ].join(' ')}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-sm font-medium text-slate-800">
                              {l.itemName}
                              {l.slotLabel && (
                                <span className="ml-1.5 text-[11px] uppercase tracking-wide text-slate-400">
                                  {l.slotLabel}
                                </span>
                              )}
                            </div>
                            <div className="flex items-center gap-2 text-[11px] text-slate-400">
                              {/* A copy is named by its barcode; a counted row
                                  shows how many and why it isn't per-copy. */}
                              {l.kind === 'unit' ? (
                                <span className="inline-flex items-center gap-1 font-mono text-slate-500">
                                  <Barcode size={11} />#{l.barcode ?? '—'}
                                </span>
                              ) : (
                                <>
                                  <span className="font-medium text-slate-500">×{l.quantity}</span>
                                  <span
                                    className={
                                      l.why === 'no unit reserved' ? 'text-amber-600' : 'text-slate-400'
                                    }
                                  >
                                    {l.why}
                                  </span>
                                </>
                              )}
                              {l.source === 'sub_rental' && (
                                <span className="text-amber-600">{l.vendorName ?? 'sub-rental'}</span>
                              )}
                            </div>
                          </div>
                          <SignCheck
                            signoff={s[PACKED_SLOT]}
                            label="Tick when it's in the case"
                            onSign={() => sign(l, PACKED_SLOT)}
                            onClear={() => clear(l, PACKED_SLOT)}
                          />
                        </li>
                      )
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
        <span className="inline-flex items-center gap-1.5 text-xs text-slate-400">
          <PackageCheck size={14} /> Ticks save automatically, signed as {myInitials}.
        </span>
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
        >
          Done
        </button>
      </div>
    </Modal>
  )
}
