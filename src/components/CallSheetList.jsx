import { rolesLabel, normalizeCallTimes } from '../lib/callTimes'

// The call sheet as it is READ: one time per line, the roles it is for, and the
// note if there is one — plus the wrap when the caller asks for it.
//
// One definition because three surfaces show this: the job card, the job's peek
// card and the shoot's peek card. Two of them had grown their own copy, and a
// third was about to.
//
// The TIME is the thing being looked up ("when do I have to be there"), so it
// is set in a chip at the card's strongest text colour rather than reading as
// one more grey line among the — / not assigned rows around it. The wrap gets
// the same shape in outline: it is the end of the day, not somebody's call.
//
// `wrapTime` is optional — a surface that labels the wrap itself passes none.
export default function CallSheetList({ callTimes, wrapTime = null, empty = 'not set' }) {
  // Normalized on the way in as well as on the way out of the store: a row
  // arriving straight from a form (or from a shoot saved before the merge rule
  // existed) can still carry the same time twice.
  const rows = normalizeCallTimes(callTimes)
  if (!rows.length && !wrapTime) return <span className="text-slate-400">{empty}</span>
  return (
    <span className="flex flex-col items-start gap-1">
      {rows.map((c, i) => (
        <span key={c.id || i} className="flex items-baseline gap-2">
          <span className="shrink-0 rounded-md bg-slate-100 px-1.5 py-0.5 text-sm font-bold tabular-nums text-slate-900 ring-1 ring-slate-200">
            {c.time}
          </span>
          <span className="min-w-0">
            <span className="font-medium text-slate-700">{rolesLabel(c)}</span>
            {c.note && <span className="text-slate-400"> · {c.note}</span>}
          </span>
        </span>
      ))}
      {wrapTime && (
        <span className="flex items-baseline gap-2">
          <span className="shrink-0 rounded-md px-1.5 py-0.5 text-sm font-semibold tabular-nums text-slate-500 ring-1 ring-slate-300">
            {wrapTime}
          </span>
          <span className="text-slate-500">wrap</span>
        </span>
      )}
    </span>
  )
}
