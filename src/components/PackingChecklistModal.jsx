import { useEffect, useState } from 'react'
import { PackageCheck } from 'lucide-react'
import Modal from './Modal'
import { packingLineKey, packingProgress } from '../lib/packing'

// One sign-off field: a small initials box. Typing initials + blur/Enter signs
// it (records initials + timestamp in the store); clearing it un-signs. Green
// when signed. This is the digital form of the PDF's initial boxes (6.2 / 6.5).
function SignBox({ signoff, onSign, onClear }) {
  const [val, setVal] = useState(signoff?.initials ?? '')
  useEffect(() => {
    setVal(signoff?.initials ?? '')
  }, [signoff?.initials])

  const signed = !!signoff?.initials
  const commit = () => {
    const t = val.trim().toUpperCase()
    if (t === (signoff?.initials ?? '')) return
    if (t) onSign(t)
    else onClear()
  }

  return (
    <input
      type="text"
      value={val}
      onChange={(e) => setVal(e.target.value.replace(/[^A-Za-z.]/g, '').slice(0, 4))}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur()
      }}
      placeholder="–"
      title={
        signed
          ? `${signoff.initials}${signoff.at ? ' · ' + new Date(signoff.at).toLocaleString() : ''}`
          : 'Tap to sign'
      }
      className={[
        'h-9 w-11 shrink-0 rounded-md border text-center text-sm font-semibold uppercase outline-none transition',
        signed
          ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
          : 'border-slate-300 text-slate-700 placeholder:text-slate-300 focus:border-violet-400 focus:ring-2 focus:ring-violet-100',
      ].join(' ')}
    />
  )
}

// Digital packing checklist (epic #6, 6.2 + 6.5). The on-screen / iPad form of
// the packing list: each line has the three sign-off boxes (two at sign-out,
// one at return). Sign-offs are optimistic + auto-saved via the store.
export default function PackingChecklistModal({ open, order, estimate, onSign, onClear, onClose }) {
  const packing = order?.packing || {}
  const groups = estimate?.groups || []
  const allLines = groups.flatMap((g) => g.lines)
  const prog = packingProgress(allLines, packing)

  const sign = (line, slot, initials) => onSign(packingLineKey(line), slot, initials, line.itemName)
  const clear = (line, slot) => onClear(packingLineKey(line), slot)

  return (
    <Modal open={open} onClose={onClose} size="lg" title="Packing checklist">
      <div className="min-h-0 flex-1 overflow-auto px-5 py-4">
        {order && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg bg-slate-50 px-4 py-3">
            <div className="min-w-0">
              <div className="truncate font-semibold text-slate-900">
                {order.jobName ?? order.setTitle ?? 'Order'}
              </div>
              <div className="mt-0.5 text-xs text-slate-500">
                {order.poNumber ? `PO ${order.poNumber} · ` : ''}Two initials at sign-out, one at
                return.
              </div>
            </div>
            <div className="flex shrink-0 gap-5 text-center text-xs">
              <div>
                <div className="text-base font-semibold text-slate-900">
                  {prog.out}/{prog.total}
                </div>
                <div className="text-slate-400">signed out</div>
              </div>
              <div>
                <div className="text-base font-semibold text-slate-900">
                  {prog.ret}/{prog.total}
                </div>
                <div className="text-slate-400">returned</div>
              </div>
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
              <span className="min-w-0 flex-1">Line</span>
              <span className="w-11 shrink-0 text-center">Out</span>
              <span className="w-11 shrink-0 text-center">Out</span>
              <span className="w-11 shrink-0 text-center">Ret</span>
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
                      {g.type === 'kit' ? g.name : 'A-la-carte'}
                    </span>
                  </div>
                  <ul className="space-y-1">
                    {g.lines.map((l, i) => {
                      const key = packingLineKey(l)
                      const s = packing[key] || {}
                      const returned = !!s.ret?.initials
                      const out = !!(s.out1?.initials && s.out2?.initials)
                      return (
                        <li
                          key={`${key}-${i}`}
                          className={[
                            'flex items-center gap-3 rounded-lg border px-3 py-2',
                            returned
                              ? 'border-slate-200 bg-slate-50/70'
                              : out
                                ? 'border-emerald-200 bg-emerald-50/40'
                                : 'border-slate-200',
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
                              <span>×{l.quantity}</span>
                              {l.barcode && <span className="font-mono">#{l.barcode}</span>}
                              {l.source === 'sub_rental' && (
                                <span className="text-amber-600">{l.vendorName ?? 'sub-rental'}</span>
                              )}
                            </div>
                          </div>
                          <SignBox
                            signoff={s.out1}
                            onSign={(v) => sign(l, 'out1', v)}
                            onClear={() => clear(l, 'out1')}
                          />
                          <SignBox
                            signoff={s.out2}
                            onSign={(v) => sign(l, 'out2', v)}
                            onClear={() => clear(l, 'out2')}
                          />
                          <SignBox
                            signoff={s.ret}
                            onSign={(v) => sign(l, 'ret', v)}
                            onClear={() => clear(l, 'ret')}
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
          <PackageCheck size={14} /> Sign-offs save automatically.
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
