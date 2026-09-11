import { useEffect, useMemo, useState } from 'react'
import { Check, ChevronRight, Pencil, Plus, X } from 'lucide-react'
import Modal from './Modal'
import ErrorNote from './ErrorNote'
import SelectField from './SelectField'
import { useStore } from '../store'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import {
  categoryRemovalBlock,
  liveCategories,
  subcategoryRemovalBlock,
  subcategoryRemovalNote,
  taxonomyTree,
  unassignedItems,
} from '../lib/taxonomy'

// Managing the inventory tree: categories, the subcategories under them, and
// the two rules about taking either away.
//
// The tree is shown WITH ITS COUNTS, because every action here depends on them:
// a category with stock in it cannot go, and the crew should be able to see why
// before clicking rather than being told after. Removing either level ARCHIVES
// it (the app holds no DELETE — 20260808120000), so nothing is destroyed; the
// name keeps resolving for the records that still point at it.

const FIELD =
  'w-full rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

export default function TaxonomyModal({ open, onClose }) {
  const taxonomy = useStore((s) => s.taxonomy)
  const inventory = useStore((s) => s.inventory)
  const createCategory = useStore((s) => s.createCategory)
  const renameCategory = useStore((s) => s.renameCategory)
  const removeCategory = useStore((s) => s.removeCategory)
  const createSubcategory = useStore((s) => s.createSubcategory)
  const updateSubcategory = useStore((s) => s.updateSubcategory)
  const removeSubcategory = useStore((s) => s.removeSubcategory)
  const can = useCan()
  const mayEdit = can(CAP.INVENTORY_EDIT)

  const [error, setError] = useState(null)
  const [newCat, setNewCat] = useState('')
  // Which row is being renamed / which category is taking a new subcategory,
  // and which removal is waiting for a confirm. One at a time, on purpose.
  const [editing, setEditing] = useState(null) // {kind:'cat'|'sub', id, name, categoryId}
  const [adding, setAdding] = useState(null) // categoryId
  const [addName, setAddName] = useState('')
  const [confirm, setConfirm] = useState(null) // {kind, id, name}

  useEffect(() => {
    if (!open) return
    setError(null)
    setNewCat('')
    setEditing(null)
    setAdding(null)
    setAddName('')
    setConfirm(null)
  }, [open])

  const tree = useMemo(() => taxonomyTree(taxonomy, inventory), [taxonomy, inventory])
  const categories = useMemo(() => liveCategories(taxonomy), [taxonomy])
  const unfiled = useMemo(() => unassignedItems(inventory).length, [inventory])

  const run = async (fn) => {
    const res = await fn()
    setError(res?.error ?? null)
    return !res?.error
  }

  async function addCategory() {
    if (!newCat.trim()) return
    if (await run(() => createCategory(newCat))) setNewCat('')
  }

  async function addSubcategory(categoryId) {
    if (!addName.trim()) return
    if (await run(() => createSubcategory(categoryId, addName))) {
      setAddName('')
      setAdding(null)
    }
  }

  async function saveEdit() {
    if (!editing) return
    const ok =
      editing.kind === 'cat'
        ? await run(() => renameCategory(editing.id, editing.name))
        : await run(() =>
            updateSubcategory(editing.id, { name: editing.name, categoryId: editing.categoryId }),
          )
    if (ok) setEditing(null)
  }

  async function doRemove() {
    if (!confirm) return
    const ok =
      confirm.kind === 'cat'
        ? await run(() => removeCategory(confirm.id))
        : await run(() => removeSubcategory(confirm.id))
    if (ok) setConfirm(null)
  }

  return (
    <Modal open={open} onClose={onClose} title="Categories & subcategories" size="lg">
      <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {/* Creating a category is the first thing this window is for, so it is
            the first thing in it — it used to sit under the whole tree. */}
        {mayEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={newCat}
              onChange={(e) => setNewCat(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  addCategory()
                }
              }}
              placeholder="New category"
              className={`${FIELD} max-w-xs`}
            />
            <button
              type="button"
              onClick={addCategory}
              disabled={!newCat.trim()}
              className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-sm font-semibold text-white transition hover:bg-brand-strong disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400"
            >
              <Plus size={14} />
              Add category
            </button>
          </div>
        )}

        {unfiled > 0 && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-800 ring-1 ring-amber-200">
            {unfiled} item{unfiled === 1 ? '' : 's'} {unfiled === 1 ? 'is' : 'are'} not filed under
            any subcategory yet.
          </p>
        )}

        <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
          {tree.length === 0 && (
            <p className="px-3 py-6 text-center text-xs text-slate-400">
              No categories yet.
            </p>
          )}

          {tree.map((cat) => (
            <div key={cat.id} className="p-3">
              <div className="flex flex-wrap items-center gap-2">
                {editing?.kind === 'cat' && editing.id === cat.id ? (
                  <>
                    <input
                      autoFocus
                      type="text"
                      value={editing.name}
                      onChange={(e) => setEditing((v) => ({ ...v, name: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          saveEdit()
                        }
                      }}
                      className={`${FIELD} max-w-xs`}
                    />
                    <IconBtn title="Save" onClick={saveEdit} tone="go">
                      <Check size={14} />
                    </IconBtn>
                    <IconBtn title="Cancel" onClick={() => setEditing(null)}>
                      <X size={14} />
                    </IconBtn>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-semibold text-slate-800">{cat.name}</span>
                    <span className="text-[11px] text-slate-400">
                      {cat.subs.length} sub · {cat.itemCount} item{cat.itemCount === 1 ? '' : 's'}
                    </span>
                    {mayEdit && (
                      <div className="ml-auto flex items-center gap-1">
                        <IconBtn
                          title="Add a subcategory"
                          onClick={() => {
                            setAdding(cat.id)
                            setAddName('')
                          }}
                        >
                          <Plus size={14} />
                        </IconBtn>
                        <IconBtn
                          title="Rename"
                          onClick={() => setEditing({ kind: 'cat', id: cat.id, name: cat.name })}
                        >
                          <Pencil size={13} />
                        </IconBtn>
                        <RemoveBtn
                          block={categoryRemovalBlock(cat.id, taxonomy, inventory)}
                          onAsk={() => setConfirm({ kind: 'cat', id: cat.id, name: cat.name })}
                          onBlocked={setError}
                        />
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Its subcategories */}
              <div className="mt-1 space-y-1 pl-4">
                {cat.subs.map((sub) => (
                  <div key={sub.id} className="flex flex-wrap items-center gap-2">
                    <ChevronRight size={12} className="shrink-0 text-slate-300" />
                    {editing?.kind === 'sub' && editing.id === sub.id ? (
                      <>
                        <input
                          autoFocus
                          type="text"
                          value={editing.name}
                          onChange={(e) => setEditing((v) => ({ ...v, name: e.target.value }))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault()
                              saveEdit()
                            }
                          }}
                          className={`${FIELD} max-w-[12rem]`}
                        />
                        {/* Moving it to another category is a real correction —
                            and every item in it follows, because that is where
                            their category came from. */}
                        <SelectField
                          value={editing.categoryId}
                          onChange={(e) =>
                            setEditing((v) => ({ ...v, categoryId: e.target.value }))
                          }
                          options={categories.map((c) => ({ value: c.id, label: c.name }))}
                          className={`${FIELD} max-w-[12rem]`}
                        />
                        <IconBtn title="Save" onClick={saveEdit} tone="go">
                          <Check size={14} />
                        </IconBtn>
                        <IconBtn title="Cancel" onClick={() => setEditing(null)}>
                          <X size={14} />
                        </IconBtn>
                      </>
                    ) : (
                      <>
                        <span className="text-sm text-slate-700">{sub.name}</span>
                        <span className="text-[11px] text-slate-400">
                          {sub.itemCount} item{sub.itemCount === 1 ? '' : 's'}
                        </span>
                        {mayEdit && (
                          <div className="ml-auto flex items-center gap-1">
                            <IconBtn
                              title="Rename or move"
                              onClick={() =>
                                setEditing({
                                  kind: 'sub',
                                  id: sub.id,
                                  name: sub.name,
                                  categoryId: sub.categoryId,
                                })
                              }
                            >
                              <Pencil size={13} />
                            </IconBtn>
                            <RemoveBtn
                              block={subcategoryRemovalBlock(sub.id, taxonomy, inventory)}
                              onAsk={() =>
                                setConfirm({
                                  kind: 'sub',
                                  id: sub.id,
                                  name: sub.name,
                                  note: subcategoryRemovalNote(sub.id, inventory),
                                })
                              }
                              onBlocked={setError}
                            />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}

                {adding === cat.id ? (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    <input
                      autoFocus
                      type="text"
                      value={addName}
                      onChange={(e) => setAddName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault()
                          addSubcategory(cat.id)
                        }
                      }}
                      placeholder={`New subcategory in ${cat.name}`}
                      className={`${FIELD} max-w-xs`}
                    />
                    <button
                      type="button"
                      onClick={() => addSubcategory(cat.id)}
                      className="rounded-md bg-brand px-2.5 py-1.5 text-xs font-semibold text-white transition hover:bg-brand-strong"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setAdding(null)}
                      className="rounded-md px-2 py-1.5 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                    >
                      Cancel
                    </button>
                  </div>
                ) : (
                  cat.subs.length === 0 && (
                    <p className="text-[11px] text-slate-400">
                      No subcategories yet.
                    </p>
                  )
                )}
              </div>

              {confirm && confirm.kind === 'cat' && confirm.id === cat.id && (
                <ConfirmRow
                  what={`Remove “${cat.name}”?`}
                  note="It leaves every list. Records that named it keep reading."
                  onYes={doRemove}
                  onNo={() => setConfirm(null)}
                />
              )}
              {confirm &&
                confirm.kind === 'sub' &&
                cat.subs.some((x) => x.id === confirm.id) && (
                  <ConfirmRow
                    what={`Remove “${confirm.name}”?`}
                    note={confirm.note || 'It leaves every list and every picker.'}
                    onYes={doRemove}
                    onNo={() => setConfirm(null)}
                  />
                )}
            </div>
          ))}
        </div>
      </div>

      <ErrorNote>{error}</ErrorNote>

      <div className="flex shrink-0 justify-end border-t border-slate-200 px-5 py-3">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50"
        >
          Done
        </button>
      </div>
    </Modal>
  )
}

function IconBtn({ title, onClick, tone, children }) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      className={[
        'rounded-md p-1 transition',
        tone === 'go'
          ? 'text-emerald-600 hover:bg-emerald-50'
          : 'text-slate-400 hover:bg-slate-100 hover:text-slate-600',
      ].join(' ')}
    >
      {children}
    </button>
  )
}

// A removal that isn't allowed still CLICKS — and says what is in the way.
// Greying it out would leave the crew guessing, which is the dead end this
// codebase keeps having to undo.
function RemoveBtn({ block, onAsk, onBlocked }) {
  return (
    <button
      type="button"
      title={block || 'Remove'}
      aria-label="Remove"
      onClick={() => (block ? onBlocked(block) : onAsk())}
      className={[
        'rounded-md p-1 transition',
        block
          ? 'text-slate-300 hover:bg-slate-100'
          : 'text-slate-400 hover:bg-rose-50 hover:text-rose-500',
      ].join(' ')}
    >
      <X size={14} />
    </button>
  )
}

function ConfirmRow({ what, note, onYes, onNo }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 rounded-lg bg-rose-50 px-3 py-2 ring-1 ring-rose-200">
      <span className="text-xs font-medium text-rose-800">{what}</span>
      <span className="text-[11px] text-rose-600">{note}</span>
      <div className="ml-auto flex gap-1">
        <button
          type="button"
          onClick={onYes}
          className="rounded-md bg-danger px-2.5 py-1 text-xs font-semibold text-white transition hover:bg-danger-strong"
        >
          Remove
        </button>
        <button
          type="button"
          onClick={onNo}
          className="rounded-md px-2 py-1 text-xs font-medium text-rose-700 transition hover:bg-surface"
        >
          Keep
        </button>
      </div>
    </div>
  )
}
