import { useEffect, useMemo, useRef, useState } from 'react'
import {
  ScanLine,
  Check,
  AlertTriangle,
  PackageOpen,
  PackageCheck,
  Clock,
  ArrowRight,
  ArrowLeft,
  Search,
} from 'lucide-react'
import { useStore, notArchived } from '../store'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import { studioLabel } from '../data/studios'
import {
  SCAN_OUT,
  SCAN_IN,
  expectedUnits,
  scanStates,
  scanProgress,
} from '../lib/scanning'

// The scanning station (epic #6).
//
// Gear leaves the building against a CONFIRMED order and comes back the same
// way, and every scan is signed by the account that made it. Only confirmed
// orders appear here at all: a hold reserves nothing, and a closed order has
// already given everything back.
//
// The station is deliberately a page of its own rather than a modal on the order
// — it stays open on a laptop by the door for a whole shift, and a scanner is
// just a keyboard, so the input must never lose focus. That is the reason for the
// `focus()` after every scan and for keeping the picker in a narrow left column.
export default function Scanning() {
  const orders = useStore((s) => s.orders)
  const bookings = useStore((s) => s.bookings)
  const inventory = useStore((s) => s.inventory)
  const scanUnit = useStore((s) => s.scanUnit)
  const openOrder = useStore((s) => s.openOrder)
  // A scan shows instantly and persists in the background; if that write fails
  // it is taken back and reported here, so the screen never claims gear moved
  // when the database disagrees.
  const scanSyncError = useStore((s) => s.scanSyncError)
  const clearScanSyncError = useStore((s) => s.clearScanSyncError)
  const can = useCan()
  const mayScan = can(CAP.SCAN)

  const [selectedId, setSelectedId] = useState(null)
  const [direction, setDirection] = useState(SCAN_OUT)
  const [code, setCode] = useState('')
  const [flash, setFlash] = useState(null) // { ok, text }
  const [search, setSearch] = useState('')
  const inputRef = useRef(null)

  // Only confirmed, live orders can be scanned; the nearest shoot first, since
  // that is what's being packed.
  const scannable = useMemo(
    () =>
      orders
        .filter(notArchived)
        .filter((o) => o.status === 'confirmed')
        .sort((a, b) => String(a.startsOn || '').localeCompare(String(b.startsOn || ''))),
    [orders],
  )

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return scannable
    return scannable.filter((o) =>
      [o.jobName, o.setLabel, o.poNumber, o.number].filter(Boolean).join(' ').toLowerCase().includes(q),
    )
  }, [scannable, search])

  // Selection resolves against the LIVE list, so an order that gets held or
  // closed while the station is open can't stay on screen.
  const order = scannable.find((o) => o.id === selectedId) ?? filtered[0] ?? null
  const booking = bookings.find((b) => b.id === order?.setId) ?? null
  const expected = useMemo(
    () => (order ? expectedUnits(order, booking, inventory) : []),
    [order, booking, inventory],
  )
  const scans = order?.scans ?? []
  const states = useMemo(() => scanStates(scans), [scans])
  const progress = useMemo(() => scanProgress(expected, scans), [expected, scans])

  useEffect(() => {
    if (order && mayScan) inputRef.current?.focus()
  }, [order?.id, direction, mayScan])

  function submit(raw) {
    if (!order) return
    const res = scanUnit(order.id, raw, direction)
    setCode('')
    if (res?.ok) {
      setFlash({
        ok: true,
        text: `#${res.unit.barcode} ${res.unit.itemName} — ${direction === SCAN_OUT ? 'out' : 'back in'}`,
      })
    } else {
      setFlash({ ok: false, text: res?.error ?? 'That scan was refused.' })
    }
    inputRef.current?.focus()
  }

  const time = (iso) =>
    iso
      ? new Date(iso).toLocaleString('en-GB', {
          day: '2-digit',
          month: 'short',
          hour: '2-digit',
          minute: '2-digit',
        })
      : ''

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 lg:flex-row">
      {/* Which order is being packed */}
      <aside className="flex min-h-0 shrink-0 flex-col lg:w-72">
        <h1 className="text-lg font-semibold text-slate-900">Scanning</h1>
        <p className="mb-3 text-xs text-slate-500">
          {scannable.length} confirmed order{scannable.length === 1 ? '' : 's'} can be scanned
        </p>
        <div className="relative mb-2">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Job, Set or PO…"
            className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-3 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
          />
        </div>
        <ul className="min-h-0 flex-1 space-y-1 overflow-auto">
          {filtered.map((o) => {
            const b = bookings.find((x) => x.id === o.setId)
            const exp = expectedUnits(o, b, inventory)
            const p = scanProgress(exp, o.scans ?? [])
            const active = o.id === order?.id
            return (
              <li key={o.id}>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(o.id)
                    setFlash(null)
                  }}
                  className={[
                    'w-full rounded-lg border px-3 py-2 text-left transition',
                    active
                      ? 'border-violet-300 bg-violet-50'
                      : 'border-slate-200 bg-white hover:border-slate-300',
                  ].join(' ')}
                >
                  <div className="truncate text-sm font-medium text-slate-800" title={o.jobName}>
                    {o.jobName}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-slate-500">
                    {[o.startsOn, o.studioId ? studioLabel(o.studioId) : null, o.setLabel]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                  <div className="mt-1 text-[11px] font-medium text-slate-500">
                    {p.total === 0 ? (
                      'no gear reserved'
                    ) : (
                      <>
                        <span className={p.out > 0 ? 'text-amber-600' : ''}>{p.out} out</span>
                        {' · '}
                        <span className={p.back > 0 ? 'text-emerald-600' : ''}>{p.back} back</span>
                        {' · '}
                        {p.pending} to go
                      </>
                    )}
                  </div>
                </button>
              </li>
            )
          })}
          {filtered.length === 0 && (
            <li className="rounded-lg border border-dashed border-slate-300 px-3 py-6 text-center text-xs text-slate-400">
              {scannable.length === 0
                ? 'Nothing to scan — only a confirmed order holds gear. Confirm one in Orders.'
                : 'No order matches that.'}
            </li>
          )}
        </ul>
      </aside>

      {/* The station itself */}
      <section className="flex min-h-0 flex-1 flex-col rounded-xl border border-slate-200 bg-white">
        {!order ? (
          <div className="grid flex-1 place-items-center p-10 text-center">
            <div>
              <ScanLine size={28} className="mx-auto mb-3 text-slate-300" />
              <p className="text-sm font-medium text-slate-600">No confirmed order selected</p>
              <p className="mt-1 text-xs text-slate-400">
                Gear moves against a confirmed order, so that is what the station scans against.
              </p>
            </div>
          </div>
        ) : (
          <>
            <header className="shrink-0 border-b border-slate-200 px-5 py-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-slate-900" title={order.jobName}>
                    {order.jobName}
                  </h2>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {[
                      order.startsOn,
                      order.studioId ? studioLabel(order.studioId) : null,
                      order.setLabel,
                      order.poNumber,
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    openOrder(order.id, { view: 'scanning', label: 'Scanning', focus: {} })
                  }
                  className="shrink-0 rounded-lg px-2.5 py-1.5 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
                >
                  Open the order
                </button>
              </div>

              {/* Direction — which way the gear is moving */}
              <div className="mt-3 flex rounded-lg border border-slate-300 p-0.5">
                {[
                  [SCAN_OUT, 'Scan out', PackageOpen, 'bg-amber-400 text-amber-950'],
                  [SCAN_IN, 'Scan in', PackageCheck, 'bg-emerald-500 text-white'],
                ].map(([dir, label, Icon, active]) => (
                  <button
                    key={dir}
                    type="button"
                    onClick={() => {
                      setDirection(dir)
                      setFlash(null)
                    }}
                    className={[
                      'inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-medium transition',
                      direction === dir ? active : 'text-slate-600 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    <Icon size={15} />
                    {label}
                  </button>
                ))}
              </div>

              {mayScan ? (
                <form
                  className="mt-2"
                  onSubmit={(e) => {
                    e.preventDefault()
                    submit(code)
                  }}
                >
                  <div className="relative">
                    <ScanLine
                      size={18}
                      className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-violet-500"
                    />
                    <input
                      ref={inputRef}
                      type="text"
                      inputMode="numeric"
                      value={code}
                      onChange={(e) => {
                        setCode(e.target.value)
                        if (flash) setFlash(null)
                      }}
                      onKeyDown={(e) => {
                        // A scanner types the code and presses Enter. Pasting one
                        // sends no Enter, which is why the button beside it isn't
                        // decoration.
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          submit(code)
                        }
                      }}
                      placeholder={
                        direction === SCAN_OUT
                          ? 'Scan a barcode to send it out…'
                          : 'Scan a barcode to bring it back…'
                      }
                      className="w-full rounded-lg border-2 border-slate-300 py-2.5 pl-10 pr-24 text-base outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button
                      type="submit"
                      disabled={!code.trim()}
                      className="absolute right-1.5 top-1/2 -translate-y-1/2 rounded-md bg-violet-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-40"
                    >
                      {direction === SCAN_OUT ? 'Send out' : 'Bring back'}
                    </button>
                  </div>
                  {flash && (
                    <div
                      className={[
                        'mt-2 flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium ring-1',
                        flash.ok
                          ? 'bg-emerald-50 text-emerald-700 ring-emerald-200'
                          : 'bg-rose-50 text-rose-700 ring-rose-200',
                      ].join(' ')}
                    >
                      {flash.ok ? <Check size={15} /> : <AlertTriangle size={15} />}
                      {flash.text}
                    </div>
                  )}
                </form>
              ) : (
                <p className="mt-2 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 ring-1 ring-slate-200">
                  Your account can view the scan log but not move gear.
                </p>
              )}

              {scanSyncError && (
                <div className="mt-2 flex items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
                  <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                  <span className="min-w-0 flex-1">{scanSyncError}</span>
                  <button
                    type="button"
                    onClick={clearScanSyncError}
                    className="shrink-0 rounded px-1.5 py-0.5 text-rose-500 transition hover:bg-rose-100"
                  >
                    Dismiss
                  </button>
                </div>
              )}

              <div className="mt-2 text-xs font-medium text-slate-500">
                {progress.total === 0 ? (
                  'This order holds no gear yet — add equipment and confirm it.'
                ) : (
                  <>
                    <span className="text-amber-600">{progress.out} out</span> ·{' '}
                    <span className="text-emerald-600">{progress.back} back</span> ·{' '}
                    {progress.pending} still on the shelf · {progress.total} total
                  </>
                )}
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-auto">
              {/* What must go out, and where each copy is */}
              <ul className="divide-y divide-slate-100">
                {expected.map((e) => {
                  const st = states.get(e.unitId)
                  const state = st?.state ?? 'pending'
                  return (
                    <li key={e.unitId} className="flex items-center gap-3 px-5 py-2">
                      <span
                        className={[
                          'w-16 shrink-0 rounded px-1.5 py-0.5 text-center font-mono text-xs font-medium',
                          state === 'out'
                            ? 'bg-amber-100 text-amber-800'
                            : state === 'back'
                              ? 'bg-emerald-100 text-emerald-800'
                              : 'bg-slate-100 text-slate-500',
                        ].join(' ')}
                      >
                        #{e.barcode}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm text-slate-800">{e.itemName}</span>
                        {e.slotLabel && (
                          <span className="text-[11px] uppercase tracking-wide text-slate-400">
                            {e.slotLabel}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-right text-[11px]">
                        {state === 'pending' ? (
                          <span className="text-slate-400">on the shelf</span>
                        ) : state === 'out' ? (
                          <span className="text-amber-700">
                            out {time(st.outAt)}
                            {st.outBy ? ` · ${st.outBy}` : ''}
                          </span>
                        ) : (
                          <span className="text-emerald-700">
                            back {time(st.inAt)}
                            {st.inBy ? ` · ${st.inBy}` : ''}
                          </span>
                        )}
                      </span>
                    </li>
                  )
                })}
              </ul>

              {/* Scan history — who and when, both directions */}
              <div className="border-t border-slate-200 px-5 py-3">
                <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                  <Clock size={13} />
                  Scan history
                </div>
                {scans.length === 0 ? (
                  <p className="py-3 text-xs text-slate-400">
                    Nothing scanned yet. Every scan is recorded with the account that made it.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {[...scans]
                      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
                      .map((s) => (
                        <li key={s.id ?? `${s.unitId}-${s.at}`} className="flex items-center gap-2 text-xs">
                          <span
                            className={[
                              'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 font-medium',
                              s.direction === SCAN_OUT
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-emerald-50 text-emerald-700',
                            ].join(' ')}
                          >
                            {s.direction === SCAN_OUT ? (
                              <ArrowRight size={11} />
                            ) : (
                              <ArrowLeft size={11} />
                            )}
                            {s.direction === SCAN_OUT ? 'out' : 'in'}
                          </span>
                          <span className="shrink-0 font-mono text-slate-600">#{s.barcode}</span>
                          <span className="min-w-0 flex-1 truncate text-slate-600">{s.itemName}</span>
                          <span className="shrink-0 text-slate-400">
                            {time(s.at)}
                            {s.by ? ` · ${s.by}` : ''}
                          </span>
                        </li>
                      ))}
                  </ul>
                )}
              </div>
            </div>
          </>
        )}
      </section>
    </div>
  )
}
