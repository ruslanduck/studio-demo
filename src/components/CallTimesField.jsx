import { useRef, useState } from 'react'
import { Plus, X, Clock, AlertTriangle } from 'lucide-react'
import TimeField from './TimeField'
import { isValidTime, wrapBeforeFirstCall } from '../lib/callTimes'

// The shoot's call sheet: any number of call times, each for one or more roles,
// plus the wrap. Requested as "нажимаю +, выбираю роль photograph и задаю время
// его вызова 8 утра, нажимаю еще +, выбираю модель, стилист (мультивыбор) —
// 9 утра … а могу вообще не задавать".
//
// Roles are TOGGLE CHIPS, not a dropdown: the vocabulary is ten short labels and
// a call routinely names two or three of them at once, so a multi-select
// popover would be three clicks and a mystery. "+ other" keeps the list open —
// a closed vocabulary has been a dead end three times in this codebase.
//
// Shared by the job form and the legacy shoot editor, so there is one control
// and one set of rules for both.

const CHIP = 'rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 transition'
const ON = 'bg-brand text-white ring-brand'
const OFF = 'bg-surface text-slate-600 ring-slate-300 hover:ring-violet-300'

function RoleChips({ roles, options, onToggle, onAddCustom }) {
  const [draft, setDraft] = useState(null)
  const has = (r) => roles.includes(r)
  // A role typed on another row (or on another shoot) is still offered here.
  const extra = roles.filter((r) => !options.includes(r))

  return (
    <div className="flex flex-wrap items-center gap-1">
      {[...options, ...extra].map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onToggle(r)}
          className={[CHIP, has(r) ? ON : OFF].join(' ')}
        >
          {r}
        </button>
      ))}
      {draft === null ? (
        <button
          type="button"
          onClick={() => setDraft('')}
          className={[CHIP, OFF, 'inline-flex items-center gap-0.5'].join(' ')}
        >
          <Plus size={10} />
          other
        </button>
      ) : (
        <input
          autoFocus
          type="text"
          value={draft}
          placeholder="Role…"
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (draft.trim()) onAddCustom(draft.trim())
            setDraft(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              if (draft.trim()) onAddCustom(draft.trim())
              setDraft('')
            }
            if (e.key === 'Escape') {
              e.preventDefault()
              e.stopPropagation()
              setDraft(null)
            }
          }}
          className="w-24 rounded-full border border-violet-300 px-2 py-0.5 text-[11px] outline-none focus:ring-2 focus:ring-violet-100"
        />
      )}
    </div>
  )
}

// `onChange` takes an UPDATER, not a value: toggling two role chips before a
// re-render would otherwise have the second one compute from the same `value`
// prop as the first and silently drop it. Sixth appearance of that trap in this
// codebase — the rule is written down in CLAUDE.md, so this control follows it.
export default function CallTimesField({
  value = [],
  onChange,
  roleOptions = [],
  wrapTime = '',
  onWrapChange,
}) {
  // Rows need a key that survives a removal in the middle; a DB row has an id,
  // a new one gets a local uid (dropped on save by normalizeCallTimes).
  const uid = useRef(0)
  const rows = value

  const patch = (i, changes) =>
    onChange((cur) => cur.map((r, n) => (n === i ? { ...r, ...changes } : r)))
  const add = () => {
    uid.current += 1
    onChange((cur) => [...cur, { uid: `new-${uid.current}`, roles: [], time: '', note: '' }])
  }
  const remove = (i) => onChange((cur) => cur.filter((_, n) => n !== i))
  const toggleRole = (i, role) =>
    onChange((cur) =>
      cur.map((r, n) => {
        if (n !== i) return r
        const roles = r.roles || []
        return { ...r, roles: roles.includes(role) ? roles.filter((x) => x !== role) : [...roles, role] }
      }),
    )
  const addCustomRole = (i, role) =>
    onChange((cur) =>
      cur.map((r, n) =>
        n === i && !(r.roles || []).includes(role) ? { ...r, roles: [...(r.roles || []), role] } : r,
      ),
    )

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'
  const wrapEarly = wrapBeforeFirstCall(rows, wrapTime)

  return (
    <div className="space-y-3">
      <div>
        <label className={label}>Call times</label>

        {rows.length > 0 && (
          <ul className="mb-2 space-y-2">
            {rows.map((r, i) => {
              const bad = !!r.time && !isValidTime(r.time)
              return (
                <li
                  key={r.id || r.uid || i}
                  className="rounded-lg bg-slate-50 p-2.5 ring-1 ring-slate-200"
                >
                  <div className="mb-2 flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-slate-400">
                      <Clock size={13} />
                    </span>
                    <TimeField
                      value={r.time}
                      onChange={(e) => patch(i, { time: e.target.value })}
                      className={[
                        'w-20 rounded-md border px-2 py-1 text-sm outline-none transition focus:ring-2',
                        bad
                          ? 'border-rose-300 focus:border-rose-400 focus:ring-rose-100'
                          : 'border-slate-300 focus:border-violet-400 focus:ring-violet-100',
                      ].join(' ')}
                    />
                    <input
                      type="text"
                      value={r.note ?? ''}
                      onChange={(e) => patch(i, { note: e.target.value })}
                      placeholder="Note — where to arrive, what to bring…"
                      className="min-w-0 flex-1 rounded-md border border-slate-300 px-2 py-1 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
                    />
                    <button
                      type="button"
                      onClick={() => remove(i)}
                      title="Remove this call time"
                      className="shrink-0 rounded p-1 text-slate-400 transition hover:bg-surface hover:text-rose-500"
                    >
                      <X size={14} />
                    </button>
                  </div>
                  <RoleChips
                    roles={r.roles || []}
                    options={roleOptions}
                    onToggle={(role) => toggleRole(i, role)}
                    onAddCustom={(role) => addCustomRole(i, role)}
                  />
                  {/* Said out loud rather than silently dropped on save. */}
                  {(r.roles || []).length === 0 && (
                    <p className="mt-1.5 text-[11px] text-amber-600">
                      Pick who this time is for, or this row won&apos;t be saved.
                    </p>
                  )}
                </li>
              )
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={add}
          className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700"
        >
          <Plus size={13} />
          Add call time
        </button>
      </div>

      {/* The wrap is one time for the whole shoot, not a per-role call, so it
          sits on its own — asked for that way. */}
      <div>
        <label className={label}>Shoot wrap time</label>
        <TimeField
          value={wrapTime}
          onChange={(e) => onWrapChange(e.target.value)}
          className={[field, 'sm:w-32'].join(' ')}
        />
        {wrapEarly ? (
          <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-medium text-rose-600">
            <AlertTriangle size={12} />
            That is before the first call.
          </p>
        ) : null}
      </div>
    </div>
  )
}
