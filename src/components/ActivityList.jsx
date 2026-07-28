import { useState } from 'react'
import {
  Boxes,
  ClipboardList,
  CheckCircle2,
  Undo2,
  Pencil,
  Trash2,
  Plus,
  PenLine,
  Eraser,
  ScanLine,
  Tag,
  Truck,
  Wrench,
  CalendarRange,
  Dot,
  History,
} from 'lucide-react'
import { formatDistanceToNowStrict, parseISO } from 'date-fns'
import { describeEvent } from '../lib/activity'

// "Who did what, and when" — one list, used on the order card, the item card and
// the peek cards. Rendering only: the sentences come from lib/activity.js, which
// stays pure so it can be asserted under Node.

const ICONS = {
  boxes: Boxes,
  clipboard: ClipboardList,
  check: CheckCircle2,
  undo: Undo2,
  pencil: Pencil,
  trash: Trash2,
  plus: Plus,
  signature: PenLine,
  eraser: Eraser,
  scan: ScanLine,
  tag: Tag,
  truck: Truck,
  wrench: Wrench,
  calendar: CalendarRange,
  dot: Dot,
}

const initialsOf = (name) =>
  (name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('')

function when(at) {
  if (!at) return ''
  try {
    return `${formatDistanceToNowStrict(parseISO(at))} ago`
  } catch {
    return String(at).slice(0, 16).replace('T', ' ')
  }
}

function exact(at) {
  if (!at) return ''
  try {
    return new Date(at).toLocaleString()
  } catch {
    return String(at)
  }
}

export default function ActivityList({ events, loading, limit = 6, dense = false, emptyText }) {
  const [expanded, setExpanded] = useState(false)
  const rows = events || []
  const shown = expanded ? rows : rows.slice(0, limit)

  if (loading && !rows.length)
    return <p className="text-sm text-slate-400">Loading history…</p>
  if (!rows.length)
    return <p className="text-sm text-slate-400">{emptyText || 'Nothing recorded yet.'}</p>

  return (
    <div className="space-y-1.5">
      {shown.map((ev) => {
        const { icon, title, detail } = describeEvent(ev)
        const Icon = ICONS[icon] ?? Dot
        return (
          <div
            key={ev.id}
            className={[
              'flex items-start gap-2.5 rounded-lg border border-slate-200',
              dense ? 'px-2.5 py-1.5' : 'px-3 py-2',
            ].join(' ')}
          >
            <span
              title={ev.actorName || 'Not recorded'}
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-violet-100 text-[10px] font-semibold text-violet-700"
            >
              {initialsOf(ev.actorName)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-slate-800">
                <span className="font-medium">{ev.actorName || 'Not recorded'}</span>{' '}
                <span className="text-slate-500">{title.toLowerCase()}</span>
              </span>
              {detail && <span className="block truncate text-xs text-slate-400">{detail}</span>}
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              <Icon size={13} className="text-slate-300" />
              <span title={exact(ev.at)} className="whitespace-nowrap text-[11px] text-slate-400">
                {when(ev.at)}
              </span>
            </span>
          </div>
        )
      })}
      {rows.length > limit && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
        >
          <History size={13} />
          {expanded ? 'Show less' : `Show all ${rows.length}`}
        </button>
      )}
    </div>
  )
}
