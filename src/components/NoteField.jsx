import { useEffect, useRef, useState } from 'react'
import { StickyNote } from 'lucide-react'

// The note, ON the card and always writable.
//
// It used to be a read-only line that appeared only when a note already
// existed, and the only way to write one was to open the record's full editor,
// find the field and save the whole form. So the quickest thought a crew has
// ("client brings their own backdrop") cost the most clicks, and on an empty
// record there was nothing on screen to suggest a note was even possible.
//
// One component for all six note-bearing records — job, item, kit, scenario
// list, person, company — because a note should behave the same everywhere and
// six copies of the save/dirty/flush logic would drift.
//
// SAVES ON BLUR, plus Cmd/Ctrl+Enter, plus a Save button while the text
// differs. The button is not a second code path: `save()` compares against the
// last stored value and returns early, and a click always arrives AFTER the
// blur it caused, so the button is a visible reassurance that no-ops. Escape
// puts the stored text back. None of that is written on screen — the Save
// button IS the instruction, and "Saving…/Saved" is the result.
export default function NoteField({
  // Identity of the record being edited. When it changes, the field re-seeds —
  // and flushes an unsaved draft first, so picking another row can't eat what
  // was typed.
  recordId,
  value,
  canEdit = false,
  onSave,
  label = 'Note',
  placeholder = 'Add a note…',
  // The item card's header is dense, so compact scales the label down to that
  // grid's own 11px and lets the box start one line tall.
  compact = false,
}) {
  const text = String(value ?? '')
  const [draft, setDraft] = useState(text)
  const [status, setStatus] = useState('') // '' | 'saving' | 'saved' | 'error'
  const [error, setError] = useState('')
  const [focused, setFocused] = useState(false)

  // ⚠️ Every write in this app ends in a quiet `hydrate()`, which hands out new
  // objects — so `value` changes identity constantly, and a naive
  // "sync props into state" effect would wipe what is being typed. The draft is
  // therefore held in a REF as well, and the incoming value is adopted only
  // when the field is not dirty. This is the stale-value trap from the other
  // direction: the danger is not reading a stale value, it is overwriting a
  // fresh one.
  const draftRef = useRef(draft)
  const savedRef = useRef(text) // what we believe is in the database
  const onSaveRef = useRef(onSave)
  const chain = useRef(Promise.resolve()) // saves run in order, never concurrently
  const pending = useRef(null) // text already queued, so blur + Save is one write
  const recordRef = useRef(recordId) // which record this field is currently on
  const alive = useRef(true)
  const box = useRef(null)
  const flash = useRef(null)

  // Updated in an EFFECT, not during render, on purpose: the cleanup below has
  // to flush with the PREVIOUS record's save function, and effects run after
  // cleanups.
  useEffect(() => {
    onSaveRef.current = onSave
  })

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clearTimeout(flash.current)
    }
  }, [])

  const setText = (next) => {
    draftRef.current = next
    setDraft(next)
  }

  const save = () => {
    if (!canEdit || !onSaveRef.current) return
    // ⚠️ The text and the record are captured HERE, at the call — NOT read
    // when the queued turn comes. The record can change under the field
    // (clicking another row), and by then the draft belongs to a DIFFERENT
    // record: measured, that wrote an empty note over the one just saved.
    const now = draftRef.current.trim()
    const was = savedRef.current.trim()
    if (now === was || now === pending.current) return
    const run = onSaveRef.current
    const forRecord = recordRef.current
    pending.current = now
    setStatus('saving')
    chain.current = chain.current
      .then(async () => {
        const res = await run(now)
        // Landing back on a different record: the write stands, but none of
        // this field's state belongs to it any more.
        const stillHere = alive.current && recordRef.current === forRecord
        if (res?.error) {
          // savedRef is deliberately NOT moved: the write did not land, so the
          // field stays dirty and the next blur tries again.
          if (pending.current === now) pending.current = null
          if (!stillHere) return
          setError(res.error)
          setStatus('error')
          return
        }
        if (pending.current === now) pending.current = null
        if (!stillHere) return
        savedRef.current = now
        setError('')
        setStatus('saved')
        clearTimeout(flash.current)
        flash.current = setTimeout(() => alive.current && setStatus(''), 2500)
      })
      .catch((e) => {
        if (pending.current === now) pending.current = null
        if (!alive.current || recordRef.current !== forRecord) return
        setError(e?.message || 'Could not save the note.')
        setStatus('error')
      })
  }

  // Re-seed on a different record — flushing an unsaved draft first. A mouse
  // click on another row blurs the textarea and saves on its own; this covers
  // the selection changing without a blur (a drill-in link, a restored view).
  useEffect(() => {
    return () => save()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  useEffect(() => {
    recordRef.current = recordId
    pending.current = null
    setText(text)
    savedRef.current = text
    setStatus('')
    setError('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordId])

  // Someone else's change to the SAME record (another tab, another user's row
  // arriving on a refetch) is adopted only while this field is clean.
  useEffect(() => {
    if (draftRef.current.trim() !== savedRef.current.trim()) return
    if (text === savedRef.current) return
    setText(text)
    savedRef.current = text
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text])

  // Grow with the content instead of showing a scrollbar inside three lines.
  useEffect(() => {
    const el = box.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.max(el.scrollHeight, compact ? 34 : 56)}px`
  }, [draft, compact, canEdit])

  const dirty = draft.trim() !== savedRef.current.trim()

  // The item card's header labels its cells in 11px grey; the other cards use a
  // section heading. Compact matches the former so the note doesn't shout.
  const head = (
    <div className={`flex items-center gap-2 ${compact ? 'mb-1' : 'mb-1.5'}`}>
      {!compact && <StickyNote size={13} className="shrink-0 text-slate-400" />}
      <span
        className={
          compact
            ? 'text-[11px] uppercase tracking-wide text-slate-400'
            : 'text-xs font-semibold uppercase tracking-wider text-slate-500'
        }
      >
        {label}
      </span>
      <span className="ml-auto text-[11px]">
        {status === 'saving' && <span className="text-slate-400">Saving…</span>}
        {status === 'saved' && <span className="text-emerald-600">Saved</span>}
        {status === 'error' && <span className="text-rose-600">{error}</span>}
      </span>
    </div>
  )

  // No rights to edit: the note still shows, and its absence says so rather
  // than leaving a blank gap that reads as a loading state.
  if (!canEdit) {
    return (
      <div>
        {head}
        {text ? (
          <p className="whitespace-pre-line text-sm text-slate-600">{text}</p>
        ) : (
          <p className="text-sm text-slate-400">No note.</p>
        )}
      </div>
    )
  }

  return (
    <div>
      {head}
      <div className="relative">
        <textarea
          ref={box}
          value={draft}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false)
            save()
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.stopPropagation() // close the note, not the card behind it
              setText(savedRef.current)
              e.currentTarget.blur()
            }
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              save()
            }
          }}
          placeholder={placeholder}
          rows={compact ? 1 : 2}
          className={`w-full resize-none overflow-hidden rounded-lg border px-3 py-2 text-sm text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-violet-400 focus:ring-2 focus:ring-violet-100 ${
            // Quiet until touched: a card is a place to read, and six boxed
            // form fields would make every card look like a form.
            focused || dirty || draft
              ? 'border-slate-300 bg-surface'
              : 'border-dashed border-slate-300 bg-slate-50'
          }`}
        />
        {dirty && (
          <button
            type="button"
            onClick={save}
            className="absolute bottom-2 right-2 rounded-md bg-brand px-2 py-1 text-[11px] font-semibold text-white shadow-sm transition hover:bg-brand-strong"
          >
            Save
          </button>
        )}
      </div>
    </div>
  )
}
