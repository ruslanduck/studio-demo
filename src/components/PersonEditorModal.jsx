import { useEffect, useMemo, useRef, useState } from 'react'
import {
  UserPlus,
  Check,
  Trash2,
  AlertTriangle,
  Globe,
  AtSign,
  FileText,
  Paperclip,
  Loader2,
  X,
} from 'lucide-react'
import Modal from './Modal'
import { PEOPLE_CATEGORIES, COMPANY_TYPES } from '../data/people'

// Person editor (Build order #4, 4.1 + 4.2).
//
// 4.1 — contact info plus the company the person belongs to (the card renders it
//       as a hyperlink to the company).
// 4.2 — category ▸ subcategory taxonomy, and a profile that is whatever the
//       person actually has: a website, an Instagram, an attached CV, or none.
//       Nothing is mandatory beyond the name; the card shows what exists.
const blank = {
  name: '',
  category: 'Freelancer',
  subcategory: '',
  companyId: '',
  email: '',
  phone: '',
  website: '',
  instagram: '',
  cvUrl: '',
  cvFilename: '',
  notes: '',
}

export default function PersonEditorModal({
  open,
  person,
  companies,
  jobCount = 0,
  onClose,
  onCreate,
  onSave,
  onDelete,
  onCreateCompany,
  onUploadCv,
}) {
  const isEdit = !!person
  const [form, setForm] = useState(blank)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [newCompany, setNewCompany] = useState(null) // { name, companyType } | null
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setForm(
      person
        ? {
            name: person.name ?? '',
            category: person.category ?? '',
            subcategory: person.subcategory ?? '',
            companyId: person.companyId ?? '',
            email: person.email ?? '',
            phone: person.phone ?? '',
            website: person.website ?? '',
            instagram: person.instagram ?? '',
            cvUrl: person.cvUrl ?? '',
            cvFilename: person.cvFilename ?? '',
            notes: person.notes ?? '',
          }
        : blank,
    )
    setError(null)
    setConfirmDelete(false)
    setNewCompany(null)
    setUploading(false)
  }, [open, person])

  const subcategories = useMemo(() => PEOPLE_CATEGORIES[form.category] ?? [], [form.category])

  const set = (changes) => setForm((f) => ({ ...f, ...changes }))

  async function attachCv(file) {
    if (!file) return
    setError(null)
    // Supabase mode uploads and returns a public URL; local mode has nowhere to
    // put the bytes, so the card shows the filename without a link.
    if (!onUploadCv) return set({ cvFilename: file.name, cvUrl: '' })
    setUploading(true)
    try {
      const res = await onUploadCv(file, form.name || 'cv')
      set({ cvUrl: res?.url ?? '', cvFilename: res?.filename ?? file.name })
    } catch (e) {
      setError(`Upload failed: ${e.message ?? e}`)
      set({ cvFilename: file.name, cvUrl: '' })
    } finally {
      setUploading(false)
    }
  }

  async function submit(e) {
    e?.preventDefault()
    const name = form.name.trim()
    if (!name) return setError('Give the person a name.')

    let companyId = form.companyId || null
    // A company typed in rather than picked is created first, then linked.
    if (newCompany?.name?.trim()) {
      if (!onCreateCompany) return setError("Can't create a company here.")
      companyId = await onCreateCompany({
        name: newCompany.name,
        companyType: newCompany.companyType || null,
      })
    }

    const payload = { ...form, name, companyId }
    if (isEdit) await onSave(person.id, payload)
    else await onCreate(payload)
    onClose()
  }

  const label = 'mb-1.5 block text-sm font-medium text-slate-700'
  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <Modal open={open} onClose={onClose} size="lg" title={isEdit ? 'Edit person' : 'New person'}>
      <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4">
          <div>
            <label className={label}>Full name</label>
            <input
              autoFocus
              type="text"
              value={form.name}
              onChange={(e) => set({ name: e.target.value })}
              placeholder="e.g. Hannah Weiss"
              className={field}
            />
          </div>

          {/* 4.2 — category ▸ subcategory */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className={label}>Category</label>
              <select
                value={form.category}
                onChange={(e) => set({ category: e.target.value, subcategory: '' })}
                className={field}
              >
                <option value="">—</option>
                {Object.keys(PEOPLE_CATEGORIES).map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={label}>Subcategory</label>
              {subcategories.length > 0 ? (
                <select
                  value={form.subcategory}
                  onChange={(e) => set({ subcategory: e.target.value })}
                  className={field}
                >
                  <option value="">—</option>
                  {subcategories.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.subcategory}
                  onChange={(e) => set({ subcategory: e.target.value })}
                  placeholder="Optional"
                  className={field}
                />
              )}
            </div>
          </div>

          {/* 4.1 — company link */}
          <div>
            <label className={label}>Company</label>
            {newCompany ? (
              <div className="space-y-2 rounded-lg border border-violet-200 bg-violet-50/50 p-3">
                <div className="flex items-center gap-2">
                  <input
                    autoFocus
                    type="text"
                    value={newCompany.name}
                    onChange={(e) => setNewCompany((n) => ({ ...n, name: e.target.value }))}
                    placeholder="New company name"
                    className={field}
                  />
                  <button
                    type="button"
                    onClick={() => setNewCompany(null)}
                    title="Cancel new company"
                    className="shrink-0 rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                  >
                    <X size={16} />
                  </button>
                </div>
                <select
                  value={newCompany.companyType}
                  onChange={(e) => setNewCompany((n) => ({ ...n, companyType: e.target.value }))}
                  className={field}
                >
                  <option value="">Type —</option>
                  {COMPANY_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-violet-700/80">
                  Created and linked when you save.
                </p>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <select
                  value={form.companyId}
                  onChange={(e) => set({ companyId: e.target.value })}
                  className={field}
                >
                  <option value="">Freelance / none</option>
                  {companies.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                      {c.companyType ? ` · ${c.companyType}` : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => setNewCompany({ name: '', companyType: '' })}
                  className="shrink-0 whitespace-nowrap rounded-lg border border-dashed border-slate-300 px-2.5 py-2 text-xs font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600"
                >
                  + New
                </button>
              </div>
            )}
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

          {/* 4.2 — profile: website OR Instagram OR CV */}
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">
                Profile
              </span>
              <span className="text-[11px] text-slate-400">
                Website, Instagram or a CV — whichever they have
              </span>
            </div>
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Globe size={15} className="shrink-0 text-slate-400" />
                <input
                  type="text"
                  value={form.website}
                  onChange={(e) => set({ website: e.target.value })}
                  placeholder="https://…"
                  className={field}
                />
              </div>
              <div className="flex items-center gap-2">
                <AtSign size={15} className="shrink-0 text-slate-400" />
                <input
                  type="text"
                  value={form.instagram}
                  onChange={(e) => set({ instagram: e.target.value })}
                  placeholder="@handle"
                  className={field}
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <FileText size={15} className="shrink-0 text-slate-400" />
                {form.cvFilename ? (
                  <>
                    <span className="inline-flex min-w-0 items-center gap-1.5 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-700">
                      <Paperclip size={12} className="shrink-0" />
                      <span className="truncate">{form.cvFilename}</span>
                    </span>
                    {!form.cvUrl && (
                      <span className="text-[11px] text-amber-600">name only (no upload)</span>
                    )}
                    <button
                      type="button"
                      onClick={() => set({ cvUrl: '', cvFilename: '' })}
                      className="rounded-md px-2 py-1 text-xs font-medium text-slate-500 transition hover:bg-slate-100"
                    >
                      Remove
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    disabled={uploading}
                    onClick={() => fileRef.current?.click()}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-slate-300 px-2.5 py-1.5 text-xs font-medium text-slate-500 transition hover:border-violet-300 hover:text-violet-600 disabled:opacity-50"
                  >
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Paperclip size={13} />}
                    {uploading ? 'Uploading…' : 'Attach CV'}
                  </button>
                )}
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.png,.jpg,.jpeg"
                  className="hidden"
                  onChange={(e) => {
                    attachCv(e.target.files?.[0])
                    e.target.value = ''
                  }}
                />
              </div>
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
            jobCount > 0 ? (
              <span className="text-[11px] text-slate-400">
                On {jobCount} job{jobCount === 1 ? '' : 's'} — kept for history
              </span>
            ) : confirmDelete ? (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-slate-500">Delete this person?</span>
                <button
                  type="button"
                  onClick={async () => {
                    const res = await onDelete(person.id)
                    if (res?.error) setError(res.error)
                    else onClose()
                  }}
                  className="rounded-md bg-rose-600 px-2.5 py-1 font-medium text-white transition hover:bg-rose-700"
                >
                  Delete
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
                <Trash2 size={15} />
                Delete
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
              disabled={uploading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:opacity-50"
            >
              {isEdit ? <Check size={15} /> : <UserPlus size={15} />}
              {isEdit ? 'Save person' : 'Create person'}
            </button>
          </div>
        </div>
      </form>
    </Modal>
  )
}
