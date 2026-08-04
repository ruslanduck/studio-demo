import { useEffect, useState } from 'react'
import {
  Building2,
  Check,

  AlertTriangle,
  Settings2,
  Plus,
  Pencil,
  X,
  Archive as ArchiveIcon,
} from 'lucide-react'
import Modal from './Modal'
import SelectField from './SelectField'

// Company editor (Build order #4, 4.3 + 4.4).
//
// 4.3 — the fields a coordinator needs to reach a company: type, address,
//       opening hours, website, email, phone. Hours are free text because that is
//       how the crew writes them ("Mon–Fri 9:00–18:00 · Sat 10:00–14:00").
// 4.4 — the Type dropdown is user-editable: "Manage" expands an inline editor for
//       adding, renaming and removing options. Renaming relabels every company
//       using the old value; removing one leaves them untouched, it just stops
//       being offered.
const blank = {
  name: '',
  companyType: '',
  address: '',
  openingHours: '',
  website: '',
  email: '',
  phone: '',
  notes: '',
}

// The coarse client / vendor / both axis is gone: the studio has no "clients" to
// classify here, a company can't be two of those at once, and the editable Type
// list is the one classification that means anything. `companies.kind` stays in
// the database (nothing is destroyed) but the app no longer writes or reads it —
// which is why the sub-rental vendor pickers now offer every company.

export default function CompanyEditorModal({
  open,
  company,
  companyTypes,
  contactCount = 0,
  onClose,
  onCreate,
  onSave,
  onDelete,
  onCreateType,
  onRenameType,
  onDeleteType,
}) {
  const isEdit = !!company
  const [form, setForm] = useState(blank)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [managingTypes, setManagingTypes] = useState(false)
  const [newType, setNewType] = useState('')
  const [renaming, setRenaming] = useState(null) // { id, value }
  const [typeError, setTypeError] = useState(null)

  useEffect(() => {
    if (!open) return
    setForm(
      company
        ? {
            name: company.name ?? '',
            companyType: company.companyType ?? '',
            address: company.address ?? '',
            openingHours: company.openingHours ?? '',
            website: company.website ?? '',
            email: company.email ?? '',
            phone: company.phone ?? '',
            notes: company.notes ?? '',
          }
        : blank,
    )
    setError(null)
    setConfirmDelete(false)
    setManagingTypes(false)
    setNewType('')
    setRenaming(null)
    setTypeError(null)
  }, [open, company])

  const set = (changes) => setForm((f) => ({ ...f, ...changes }))

  async function addType() {
    const res = await onCreateType?.(newType)
    if (res?.error) return setTypeError(res.error)
    // Select what was just created — that's usually why it was added.
    if (res?.name) set({ companyType: res.name })
    setNewType('')
    setTypeError(null)
  }

  async function saveRename() {
    const res = await onRenameType?.(renaming.id, renaming.value)
    if (res?.error) return setTypeError(res.error)
    const old = companyTypes.find((t) => t.id === renaming.id)?.name
    if (old && form.companyType === old) set({ companyType: renaming.value.trim() })
    setRenaming(null)
    setTypeError(null)
  }

  async function removeType(t) {
    const res = await onDeleteType?.(t.id)
    if (res?.error) return setTypeError(res.error)
    setTypeError(null)
  }

  function submit(e) {
    e?.preventDefault()
    const name = form.name.trim()
    if (!name) return setError('Give the company a name.')
    if (isEdit) onSave(company.id, { ...form, name })
    else onCreate({ ...form, name })
    onClose()
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  // A company may already carry a type that was removed from the option list.
  const orphanType =
    form.companyType && !companyTypes.some((t) => t.name === form.companyType)
      ? form.companyType
      : null

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={isEdit ? 'Edit company' : 'New company'}
    >
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <label className={label}>Name</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Northlight Rentals"
              className={field}
            />
          </div>

          {/* 4.4 — editable Type dropdown */}
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-sm font-medium text-slate-700">Type</label>
              <button
                type="button"
                onClick={() => setManagingTypes((v) => !v)}
                className="inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium text-violet-600 transition hover:bg-violet-50"
              >
                <Settings2 size={12} />
                {managingTypes ? 'Done' : 'Manage'}
              </button>
            </div>
            <div>
              <SelectField
                value={form.companyType}
                onChange={(e) => set({ companyType: e.target.value })}
                placeholder="—"
                options={[
                  { value: '', label: '—' },
                  ...companyTypes.map((t) => ({ value: t.name, label: t.name })),
                  // A removed type still labels the companies that used it, so it
                  // stays selectable here and says what happened to it.
                  ...(orphanType ? [{ value: orphanType, label: `${orphanType} (removed)` }] : []),
                ]}
                className={field}
              />
            </div>

            {managingTypes && (
              <div className="mt-2 space-y-1.5 rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                <p className="text-[11px] text-slate-500">
                  Renaming relabels companies using it. Removing only takes it out of this list.
                </p>
                <ul className="space-y-1">
                  {companyTypes.filter((t) => !t.archivedAt).map((t) => (
                    <li key={t.id} className="flex items-center gap-2">
                      {renaming?.id === t.id ? (
                        <>
                          <input
                            autoFocus
                            type="text"
                            value={renaming.value}
                            onChange={(e) => setRenaming((r) => ({ ...r, value: e.target.value }))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault()
                                saveRename()
                              } else if (e.key === 'Escape') setRenaming(null)
                            }}
                            className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-violet-400"
                          />
                          <button
                            type="button"
                            onClick={saveRename}
                            className="rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenaming(null)}
                            className="rounded-md px-1.5 py-1 text-xs text-slate-500 hover:bg-slate-100"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <>
                          <span className="flex-1 truncate text-xs text-slate-700">{t.name}</span>
                          <button
                            type="button"
                            onClick={() => setRenaming({ id: t.id, value: t.name })}
                            title="Rename"
                            className="rounded p-1 text-slate-400 transition hover:bg-white hover:text-violet-600"
                          >
                            <Pencil size={12} />
                          </button>
                          <button
                            type="button"
                            onClick={() => removeType(t)}
                            title="Remove from the list"
                            className="rounded p-1 text-slate-400 transition hover:bg-white hover:text-rose-500"
                          >
                            <X size={13} />
                          </button>
                        </>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="text"
                    value={newType}
                    onChange={(e) => setNewType(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault()
                        addType()
                      }
                    }}
                    placeholder="New type, e.g. Catering"
                    className="flex-1 rounded-md border border-slate-300 px-2 py-1 text-xs outline-none focus:border-violet-400"
                  />
                  <button
                    type="button"
                    onClick={addType}
                    disabled={!newType.trim()}
                    className="inline-flex items-center gap-1 rounded-md bg-violet-600 px-2 py-1 text-xs font-medium text-white transition hover:bg-violet-700 disabled:opacity-40"
                  >
                    <Plus size={12} />
                    Add
                  </button>
                </div>
                {typeError && (
                  <p className="flex items-center gap-1 text-[11px] font-medium text-rose-600">
                    <AlertTriangle size={11} /> {typeError}
                  </p>
                )}
              </div>
            )}
          </div>

          {/* 4.3 — reachability */}
          <div>
            <label className={label}>Address</label>
            <input
              type="text"
              value={form.address}
              onChange={(e) => set({ address: e.target.value })}
              placeholder="Street, city, ZIP"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Opening hours</label>
            <input
              type="text"
              value={form.openingHours}
              onChange={(e) => set({ openingHours: e.target.value })}
              placeholder="Mon–Fri 9:00–18:00 · Sat 10:00–14:00"
              className={field}
            />
          </div>

          <div>
            <label className={label}>Website</label>
            <input
              type="text"
              value={form.website}
              onChange={(e) => set({ website: e.target.value })}
              placeholder="https://…"
              className={field}
            />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Email</label>
              <input
                type="text"
                value={form.email}
                onChange={(e) => set({ email: e.target.value })}
                placeholder="Optional"
                className={field}
              />
            </div>
            <div>
              <label className={label}>Phone</label>
              <input
                type="text"
                value={form.phone}
                onChange={(e) => set({ phone: e.target.value })}
                placeholder="Optional"
                className={field}
              />
            </div>
          </div>

          <div>
            <label className={label}>Notes</label>
            <textarea
              rows={2}
              value={form.notes}
              onChange={(e) => set({ notes: e.target.value })}
              placeholder="Optional"
              className={field}
            />
          </div>

          {error && (
            <div className="flex items-center gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200">
              <AlertTriangle size={13} />
              {error}
            </div>
          )}
        </div>

        <div className="flex shrink-0 items-center justify-between gap-2 border-t border-slate-200 px-5 py-3">
          {isEdit && onDelete ? (
            confirmDelete ? (
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="text-slate-500">
                  Archive this company?
                  {contactCount > 0 &&
                    ` ${contactCount} contact${contactCount === 1 ? '' : 's'} stay, unlinked.`}
                </span>
                <button
                  type="button"
                  onClick={() => {
                    onDelete(company.id)
                    onClose()
                  }}
                  className="rounded-md bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700"
                >
                  Archive
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  className="rounded-md px-2 py-1 font-medium text-slate-500 transition hover:bg-slate-100"
                >
                  Keep
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setConfirmDelete(true)}
                className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50"
              >
                <ArchiveIcon size={15} />
                Archive
              </button>
            )
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700"
            >
              {isEdit ? <Check size={15} /> : <Building2 size={15} />}
              {isEdit ? 'Save company' : 'Create company'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
