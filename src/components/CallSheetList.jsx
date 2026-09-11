import { rolesLabel } from '../lib/callTimes'

// The call sheet as it is READ: one time per line, the roles it is for, and the
// note if there is one — plus the wrap when the caller asks for it.
//
// One definition because three surfaces show this: the job card, the job's peek
// card and the shoot's peek card. Two of them had grown their own copy, and a
// third was about to.
//
// `wrapTime` is optional: the job card keeps the wrap in its own labelled row,
// while the peek cards want the whole sheet in one block.
export default function CallSheetList({ callTimes, wrapTime = null, empty = 'not set' }) {
  const rows = callTimes || []
  if (!rows.length && !wrapTime) return <span className="text-slate-400">{empty}</span>
  return (
    <span className="inline-flex flex-col gap-0.5">
      {rows.map((c, i) => (
        <span key={c.id || i}>
          <span className="font-medium tabular-nums">{c.time}</span>{' '}
          <span className="text-slate-600">{rolesLabel(c)}</span>
          {c.note && <span className="text-slate-400"> · {c.note}</span>}
        </span>
      ))}
      {wrapTime && (
        <span>
          <span className="font-medium tabular-nums">{wrapTime}</span>{' '}
          <span className="text-slate-500">wrap</span>
        </span>
      )}
    </span>
  )
}
