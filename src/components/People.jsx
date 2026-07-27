import { useMemo, useState } from 'react'
import {
  Search,
  Plus,
  Users,
  Building2,
  ChevronLeft,
  Pencil,
  X,
  Globe,
  AtSign,
  FileText,
  Mail,
  Phone,
  Briefcase,
  ExternalLink,
  MapPin,
  Clock,
  Package,
  ArrowDownLeft,
  ArrowUpRight,
} from 'lucide-react'
import { useStore } from '../store'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import { studioLabel } from '../data/studios'
import { PEOPLE_CATEGORIES } from '../data/people'
import PersonEditorModal from './PersonEditorModal'
import CompanyEditorModal from './CompanyEditorModal'
import { usingSupabase } from '../data/repository'
import { uploadCv } from '../data/repository'

// People & Company databases (Build order #4, 4.1 + 4.2).
//
// Master-detail like Inventory: a filterable list on the left, the selected
// record on the right (separate screens on phone / tablet-portrait). Person and
// company cards hyperlink to each other in both directions, and each card shows
// the jobs the person or company has worked.

function Highlight({ text, query }) {
  if (!query || !text) return text ?? null
  const i = text.toLowerCase().indexOf(query)
  if (i === -1) return text
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-amber-100 px-0.5 text-inherit">
        {text.slice(i, i + query.length)}
      </mark>
      {text.slice(i + query.length)}
    </>
  )
}

const initials = (name) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase()

// Instagram handles are stored as "@name" but need a real URL to be clickable.
const igUrl = (handle) => `https://instagram.com/${String(handle).replace(/^@/, '')}`
const webUrl = (url) => (/^https?:\/\//i.test(url) ? url : `https://${url}`)

export default function People() {
  const people = useStore((s) => s.people)
  const companies = useStore((s) => s.companies)
  // Needed for the "sub-rented from them" block on a vendor's card (4.5).
  const inventory = useStore((s) => s.inventory)
  const createPerson = useStore((s) => s.createPerson)
  const updatePerson = useStore((s) => s.updatePerson)
  const deletePerson = useStore((s) => s.deletePerson)
  const createCompany = useStore((s) => s.createCompany)
  const updateCompany = useStore((s) => s.updateCompany)
  const deleteCompany = useStore((s) => s.deleteCompany)
  const companyTypes = useStore((s) => s.companyTypes)
  const orders = useStore((s) => s.orders)
  const createCompanyType = useStore((s) => s.createCompanyType)
  const renameCompanyType = useStore((s) => s.renameCompanyType)
  const deleteCompanyType = useStore((s) => s.deleteCompanyType)
  const can = useCan()

  const [tab, setTab] = useState('people') // 'people' | 'companies'
  const [search, setSearch] = useState('')
  const [category, setCategory] = useState('All')
  const [selectedPersonId, setSelectedPersonId] = useState(() => people[0]?.id ?? null)
  const [selectedCompanyId, setSelectedCompanyId] = useState(() => companies[0]?.id ?? null)
  const [editor, setEditor] = useState({ open: false, person: null })
  const [companyEditor, setCompanyEditor] = useState({ open: false, company: null })
  const [showDetailMobile, setShowDetailMobile] = useState(false)

  const query = search.trim().toLowerCase()

  // Search matches name, company, email, phone or subcategory; the category
  // dropdown narrows independently.
  const filteredPeople = useMemo(
    () =>
      people.filter((p) => {
        if (category !== 'All' && p.category !== category) return false
        if (query === '') return true
        return [p.name, p.companyName, p.email, p.phone, p.subcategory]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(query))
      }),
    [people, category, query],
  )

  const filteredCompanies = useMemo(
    () =>
      companies.filter(
        (c) =>
          query === '' ||
          [c.name, c.companyType].filter(Boolean).some((v) => v.toLowerCase().includes(query)),
      ),
    [companies, query],
  )

  const selectedPerson = people.find((p) => p.id === selectedPersonId) ?? null
  const selectedCompany = companies.find((c) => c.id === selectedCompanyId) ?? null

  // Categories actually present, so the filter never offers an empty option.
  const categories = useMemo(() => {
    const present = new Set(people.map((p) => p.category).filter(Boolean))
    return Object.keys(PEOPLE_CATEGORIES).filter((c) => present.has(c))
  }, [people])

  function openPerson(id) {
    setTab('people')
    setSearch('')
    setCategory('All')
    setSelectedPersonId(id)
    setShowDetailMobile(true)
  }

  function openCompany(id) {
    setTab('companies')
    setSearch('')
    setSelectedCompanyId(id)
    setShowDetailMobile(true)
  }

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">People</h2>
          <p className="text-sm text-slate-500">
            {people.length} contacts · {companies.length} companies
          </p>
        </div>
        {tab === 'people'
          ? can(CAP.PERSON_MANAGE) && (
              <button
                type="button"
                onClick={() => setEditor({ open: true, person: null })}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
              >
                <Plus size={16} />
                New person
              </button>
            )
          : can(CAP.COMPANY_MANAGE) && (
              <button
                type="button"
                onClick={() => setCompanyEditor({ open: true, company: null })}
                className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-violet-700"
              >
                <Plus size={16} />
                New company
              </button>
            )}
      </div>

      <div className="flex min-h-0 flex-1 gap-4">
        {/* List pane */}
        <div
          className={[
            showDetailMobile ? 'hidden lg:flex' : 'flex',
            'w-full shrink-0 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm lg:w-80',
          ].join(' ')}
        >
          <div className="space-y-2 border-b border-slate-200 p-3">
            <div className="flex rounded-lg border border-slate-300 p-0.5">
              {[
                ['people', 'People'],
                ['companies', 'Companies'],
              ].map(([val, lbl]) => (
                <button
                  key={val}
                  type="button"
                  onClick={() => {
                    setTab(val)
                    setSearch('')
                  }}
                  className={[
                    'flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition',
                    tab === val
                      ? 'bg-violet-600 text-white shadow-sm'
                      : 'text-slate-600 hover:bg-slate-100',
                  ].join(' ')}
                >
                  {lbl} ({val === 'people' ? people.length : companies.length})
                </button>
              ))}
            </div>

            <div className="relative">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={tab === 'people' ? 'Search name, company, email…' : 'Search companies…'}
                className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
              {search !== '' && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  title="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
                >
                  <X size={14} />
                </button>
              )}
            </div>

            {tab === 'people' && (
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              >
                <option value="All">All categories</option>
                {categories.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-auto p-2">
            {tab === 'people' ? (
              <PersonList
                people={filteredPeople}
                selectedId={selectedPersonId}
                query={query}
                onSelect={(id) => {
                  setSelectedPersonId(id)
                  setShowDetailMobile(true)
                }}
              />
            ) : (
              <CompanyList
                companies={filteredCompanies}
                people={people}
                selectedId={selectedCompanyId}
                query={query}
                onSelect={(id) => {
                  setSelectedCompanyId(id)
                  setShowDetailMobile(true)
                }}
              />
            )}
          </div>
        </div>

        {/* Detail pane */}
        <div
          className={[
            showDetailMobile ? 'flex' : 'hidden lg:flex',
            'min-w-0 flex-1 flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm',
          ].join(' ')}
        >
          {tab === 'people' ? (
            selectedPerson ? (
              <>
                <button
                  type="button"
                  onClick={() => setShowDetailMobile(false)}
                  className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-3 py-2 text-sm font-medium text-violet-600 lg:hidden"
                >
                  <ChevronLeft size={16} />
                  Back to people
                </button>
                <PersonDetail
                  person={selectedPerson}
                  canManage={can(CAP.PERSON_MANAGE)}
                  onEdit={() => setEditor({ open: true, person: selectedPerson })}
                  onOpenCompany={openCompany}
                />
              </>
            ) : (
              <Empty icon={Users} text="Select a person to see their card." />
            )
          ) : selectedCompany ? (
            <>
              <button
                type="button"
                onClick={() => setShowDetailMobile(false)}
                className="flex shrink-0 items-center gap-1 border-b border-slate-200 px-3 py-2 text-sm font-medium text-violet-600 lg:hidden"
              >
                <ChevronLeft size={16} />
                Back to companies
              </button>
              <CompanyDetail
                company={selectedCompany}
                people={people}
                orders={orders}
                inventory={inventory}
                canManage={can(CAP.COMPANY_MANAGE)}
                onEdit={() => setCompanyEditor({ open: true, company: selectedCompany })}
                onOpenPerson={openPerson}
              />
            </>
          ) : (
            <Empty icon={Building2} text="Select a company to see its contacts." />
          )}
        </div>
      </div>

      <PersonEditorModal
        open={editor.open}
        person={editor.person}
        companies={companies}
        companyTypes={companyTypes}
        jobCount={editor.person?.jobs?.length ?? 0}
        onClose={() => setEditor({ open: false, person: null })}
        onCreate={async (payload) => {
          const id = await createPerson(payload)
          if (id) setSelectedPersonId(id)
        }}
        onSave={(id, payload) => updatePerson(id, payload)}
        onDelete={async (id) => {
          const res = await deletePerson(id)
          if (res?.ok) setSelectedPersonId((cur) => (cur === id ? null : cur))
          return res
        }}
        onCreateCompany={(payload) => createCompany(payload)}
        onUploadCv={usingSupabase ? uploadCv : null}
      />

      <CompanyEditorModal
        open={companyEditor.open}
        company={companyEditor.company}
        companyTypes={companyTypes}
        contactCount={
          companyEditor.company
            ? people.filter((p) => p.companyId === companyEditor.company.id).length
            : 0
        }
        onClose={() => setCompanyEditor({ open: false, company: null })}
        onCreate={async (payload) => {
          const id = await createCompany(payload)
          if (id) setSelectedCompanyId(id)
        }}
        onSave={(id, payload) => updateCompany(id, payload)}
        onDelete={(id) => {
          deleteCompany(id)
          setSelectedCompanyId((cur) => (cur === id ? null : cur))
        }}
        onCreateType={(name) => createCompanyType(name)}
        onRenameType={(id, name) => renameCompanyType(id, name)}
        onDeleteType={(id) => deleteCompanyType(id)}
      />
    </div>
  )
}

function Empty({ icon: Icon, text }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <Icon size={36} className="mb-3 text-slate-300" />
      <p className="text-sm text-slate-400">{text}</p>
    </div>
  )
}

function PersonList({ people, selectedId, query, onSelect }) {
  if (people.length === 0)
    return (
      <p className="px-3 py-10 text-center text-sm text-slate-400">
        {query ? 'No one matches your search.' : 'No contacts yet.'}
      </p>
    )
  return (
    <ul className="space-y-0.5">
      {people.map((p) => {
        const active = p.id === selectedId
        const subtitle = [p.subcategory || p.category, p.companyName].filter(Boolean).join(' · ')
        return (
          <li key={p.id}>
            <button
              type="button"
              onClick={() => onSelect(p.id)}
              className={[
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition',
                active ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50',
              ].join(' ')}
            >
              <span
                className={[
                  'grid h-9 w-9 shrink-0 place-items-center rounded-full text-xs font-semibold',
                  active ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                {initials(p.name)}
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    'block truncate text-sm font-medium',
                    active ? 'text-violet-900' : 'text-slate-800',
                  ].join(' ')}
                >
                  <Highlight text={p.name} query={query} />
                </span>
                <span className="block truncate text-xs text-slate-400">{subtitle}</span>
              </span>
              {p.jobs.length > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {p.jobs.length}
                </span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

function CompanyList({ companies, people, selectedId, query, onSelect }) {
  if (companies.length === 0)
    return (
      <p className="px-3 py-10 text-center text-sm text-slate-400">
        {query ? 'No companies match your search.' : 'No companies yet.'}
      </p>
    )
  return (
    <ul className="space-y-0.5">
      {companies.map((c) => {
        const active = c.id === selectedId
        const count = people.filter((p) => p.companyId === c.id).length
        return (
          <li key={c.id}>
            <button
              type="button"
              onClick={() => onSelect(c.id)}
              className={[
                'flex w-full items-center gap-3 rounded-lg px-2.5 py-2.5 text-left transition',
                active ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50',
              ].join(' ')}
            >
              <span
                className={[
                  'grid h-9 w-9 shrink-0 place-items-center rounded-lg',
                  active ? 'bg-violet-600 text-white' : 'bg-slate-100 text-slate-600',
                ].join(' ')}
              >
                <Building2 size={16} />
              </span>
              <span className="min-w-0">
                <span
                  className={[
                    'block truncate text-sm font-medium',
                    active ? 'text-violet-900' : 'text-slate-800',
                  ].join(' ')}
                >
                  <Highlight text={c.name} query={query} />
                </span>
                <span className="block truncate text-xs text-slate-400">
                  {[c.companyType, `${count} contact${count === 1 ? '' : 's'}`]
                    .filter(Boolean)
                    .join(' · ')}
                </span>
              </span>
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// A person's card: contact info, the company hyperlink (4.1), profile links (4.2)
// and the jobs they worked.
function PersonDetail({ person, canManage, onEdit, onOpenCompany }) {
  const hasProfile = person.website || person.instagram || person.cvFilename
  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="flex min-w-0 gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-violet-100 text-sm font-semibold text-violet-700">
            {initials(person.name)}
          </span>
          <div className="min-w-0">
            <h3 className="truncate text-lg font-semibold text-slate-900">{person.name}</h3>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              {person.category && (
                <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
                  {person.category}
                </span>
              )}
              {person.subcategory && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                  {person.subcategory}
                </span>
              )}
              {person.companyName && (
                <button
                  type="button"
                  onClick={() => onOpenCompany(person.companyId)}
                  className="inline-flex items-center gap-1 text-xs font-medium text-violet-600 underline decoration-violet-300 underline-offset-2 transition hover:text-violet-800"
                >
                  <Building2 size={12} />
                  {person.companyName}
                </button>
              )}
            </div>
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-600"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        {/* Contact */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Contact
          </h4>
          {person.email || person.phone ? (
            <div className="space-y-1.5">
              {person.email && (
                <a
                  href={`mailto:${person.email}`}
                  className="flex items-center gap-2 text-sm text-slate-700 transition hover:text-violet-700"
                >
                  <Mail size={14} className="shrink-0 text-slate-400" />
                  {person.email}
                </a>
              )}
              {person.phone && (
                <a
                  href={`tel:${person.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 text-sm text-slate-700 transition hover:text-violet-700"
                >
                  <Phone size={14} className="shrink-0 text-slate-400" />
                  {person.phone}
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">No email or phone on file.</p>
          )}
        </section>

        {/* Profile — website OR Instagram OR CV (4.2) */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Profile
          </h4>
          {hasProfile ? (
            <div className="flex flex-wrap gap-2">
              {person.website && (
                <a
                  href={webUrl(person.website)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-600"
                >
                  <Globe size={13} />
                  Website
                  <ExternalLink size={11} className="text-slate-400" />
                </a>
              )}
              {person.instagram && (
                <a
                  href={igUrl(person.instagram)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-600"
                >
                  <AtSign size={13} />
                  {person.instagram}
                  <ExternalLink size={11} className="text-slate-400" />
                </a>
              )}
              {person.cvFilename &&
                (person.cvUrl ? (
                  <a
                    href={person.cvUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-700 transition hover:border-violet-300 hover:text-violet-600"
                  >
                    <FileText size={13} />
                    {person.cvFilename}
                    <ExternalLink size={11} className="text-slate-400" />
                  </a>
                ) : (
                  <span
                    title="Filed as a name only — no uploaded file in this demo mode"
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-medium text-slate-500"
                  >
                    <FileText size={13} />
                    {person.cvFilename}
                  </span>
                ))}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No website, Instagram or CV on file — not everyone has one.
            </p>
          )}
        </section>

        {person.notes && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Notes
            </h4>
            <p className="text-sm text-slate-600">{person.notes}</p>
          </section>
        )}

        {/* Work history */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Work history{person.jobs.length > 0 && ` (${person.jobs.length})`}
          </h4>
          <JobList jobs={person.jobs} emptyText="No jobs yet." />
        </section>
      </div>
    </>
  )
}

// Company card (4.1 + 4.3 + 4.5): identity and type, the reachability block
// (address / hours / website / email / phone), its people as hyperlinks back to
// People, and work history — orders in both directions, the gear we currently
// hold from them as a vendor, and the jobs its people worked.
function CompanyDetail({ company, people, orders, inventory, canManage, onEdit, onOpenPerson }) {
  const staff = people.filter((p) => p.companyId === company.id)
  const jobs = useMemo(() => {
    const seen = new Set()
    return staff
      .flatMap((p) => p.jobs.map((j) => ({ ...j, who: p.name })))
      .filter((j) => {
        const key = `${j.id}:${j.who}`
        if (seen.has(key)) return false
        seen.add(key)
        return true
      })
      .sort((a, b) => (a.date < b.date ? 1 : -1))
  }, [staff])

  // 4.5 — orders in either direction, newest first.
  const companyOrders = useMemo(
    () =>
      (orders || [])
        .filter((o) => o.companyId === company.id)
        .sort((a, b) => (a.orderedAt < b.orderedAt ? 1 : -1)),
    [orders, company.id],
  )

  // 4.5 — gear we currently hold from this vendor, grouped per item.
  const { heldGear, heldUnitCount } = useMemo(() => {
    const rows = []
    let total = 0
    for (const item of inventory || []) {
      const count = (item.units || []).filter(
        (u) => u.ownership === 'sub_rental' && u.subRentalVendorId === company.id,
      ).length
      if (count > 0) {
        rows.push({ itemId: item.id, name: item.name, count })
        total += count
      }
    }
    return { heldGear: rows.sort((a, b) => b.count - a.count), heldUnitCount: total }
  }, [inventory, company.id])

  return (
    <>
      <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Building2 size={18} className="shrink-0 text-violet-500" />
            <h3 className="truncate text-lg font-semibold text-slate-900">{company.name}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-slate-500">
            {company.companyType && (
              <span className="rounded-full bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-600">
                {company.companyType}
              </span>
            )}
            <span>
              {staff.length} contact{staff.length === 1 ? '' : 's'}
            </span>
            {companyOrders.length > 0 && (
              <span>
                {companyOrders.length} order{companyOrders.length === 1 ? '' : 's'}
              </span>
            )}
          </div>
        </div>
        {canManage && (
          <button
            type="button"
            onClick={onEdit}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5 text-sm font-medium text-slate-600 transition hover:border-violet-300 hover:text-violet-600"
          >
            <Pencil size={14} />
            Edit
          </button>
        )}
      </div>

      {company.notes && (
        <p className="shrink-0 border-b border-slate-200 px-5 py-3 text-sm text-slate-600">
          {company.notes}
        </p>
      )}

      <div className="min-h-0 flex-1 space-y-5 overflow-auto p-5">
        {/* 4.3 — how to reach them */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Details
          </h4>
          {company.address ||
          company.openingHours ||
          company.website ||
          company.email ||
          company.phone ? (
            <div className="space-y-1.5 text-sm">
              {company.address && (
                <div className="flex items-start gap-2 text-slate-700">
                  <MapPin size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  {company.address}
                </div>
              )}
              {company.openingHours && (
                <div className="flex items-start gap-2 text-slate-700">
                  <Clock size={14} className="mt-0.5 shrink-0 text-slate-400" />
                  {company.openingHours}
                </div>
              )}
              {company.website && (
                <a
                  href={webUrl(company.website)}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="flex items-center gap-2 text-violet-600 underline decoration-violet-300 underline-offset-2 transition hover:text-violet-800"
                >
                  <Globe size={14} className="shrink-0" />
                  {company.website.replace(/^https?:\/\//i, '')}
                  <ExternalLink size={11} className="text-slate-400" />
                </a>
              )}
              {company.email && (
                <a
                  href={`mailto:${company.email}`}
                  className="flex items-center gap-2 text-slate-700 transition hover:text-violet-700"
                >
                  <Mail size={14} className="shrink-0 text-slate-400" />
                  {company.email}
                </a>
              )}
              {company.phone && (
                <a
                  href={`tel:${company.phone.replace(/\s/g, '')}`}
                  className="flex items-center gap-2 text-slate-700 transition hover:text-violet-700"
                >
                  <Phone size={14} className="shrink-0 text-slate-400" />
                  {company.phone}
                </a>
              )}
            </div>
          ) : (
            <p className="text-sm text-slate-400">
              No address, hours or contact details on file yet.
            </p>
          )}
        </section>

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Contacts
          </h4>
          {staff.length > 0 ? (
            <ul className="space-y-1.5">
              {staff.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => onOpenPerson(p.id)}
                    className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-violet-300 hover:bg-violet-50/40"
                  >
                    <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-600">
                      {initials(p.name)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-violet-700 underline decoration-violet-200 underline-offset-2">
                        {p.name}
                      </span>
                      {(p.subcategory || p.category) && (
                        <span className="block truncate text-xs text-slate-400">
                          {p.subcategory || p.category}
                        </span>
                      )}
                    </span>
                    {p.jobs.length > 0 && (
                      <span className="shrink-0 text-[11px] text-slate-400">
                        {p.jobs.length} job{p.jobs.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">No contacts filed for this company yet.</p>
          )}
        </section>

        {/* 4.5 — order history, both directions */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Order history{companyOrders.length > 0 && ` (${companyOrders.length})`}
          </h4>
          <OrderList orders={companyOrders} />
        </section>

        {/* 4.5 — gear currently held from this vendor */}
        {heldGear.length > 0 && (
          <section>
            <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
              Sub-rented from them ({heldUnitCount} unit{heldUnitCount === 1 ? '' : 's'})
            </h4>
            <ul className="space-y-1.5">
              {heldGear.map((g) => (
                <li
                  key={g.itemId}
                  className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
                >
                  <Package size={14} className="shrink-0 text-slate-400" />
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-800">{g.name}</span>
                  <span className="shrink-0 text-xs font-medium text-slate-500">×{g.count}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Jobs its people worked{jobs.length > 0 && ` (${jobs.length})`}
          </h4>
          <JobList jobs={jobs} showWho emptyText="No jobs involving this company yet." />
        </section>
      </div>
    </>
  )
}

// Order history rows (4.5). `kind` tells the direction: an order the company
// placed with us, or gear we sub-rented from them.
function OrderList({ orders }) {
  if (orders.length === 0)
    return (
      <p className="text-sm text-slate-400">
        No orders yet — the Orders module lands in the next epic.
      </p>
    )
  const STATUS = {
    draft: 'bg-slate-100 text-slate-500',
    confirmed: 'bg-amber-100 text-amber-700',
    fulfilled: 'bg-emerald-100 text-emerald-700',
    canceled: 'bg-rose-100 text-rose-600',
  }
  return (
    <ul className="space-y-1.5">
      {orders.map((o) => {
        const inbound = o.kind === 'sub_rental'
        return (
          <li key={o.id} className="rounded-lg border border-slate-200 px-3 py-2">
            <div className="flex items-center gap-2">
              <span
                title={inbound ? 'We rented from them' : 'They ordered from us'}
                className={[
                  'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  inbound ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600',
                ].join(' ')}
              >
                {inbound ? <ArrowDownLeft size={9} /> : <ArrowUpRight size={9} />}
                {inbound ? 'Sub-rental' : 'Client'}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">
                {o.number}
              </span>
              <span
                className={[
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
                  STATUS[o.status] ?? 'bg-slate-100 text-slate-500',
                ].join(' ')}
              >
                {o.status}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-slate-400">
              {[o.orderedAt, o.setTitle].filter(Boolean).join(' · ')}
            </div>
            {o.lines.length > 0 && (
              <div className="mt-1 truncate text-xs text-slate-600">
                {o.lines.map((l) => `${l.quantity}× ${l.itemName ?? 'item'}`).join(', ')}
              </div>
            )}
          </li>
        )
      })}
    </ul>
  )
}

// Shared job-history list used by both cards.
function JobList({ jobs, showWho = false, emptyText }) {
  if (jobs.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>
  return (
    <ul className="space-y-1.5">
      {jobs.map((j, i) => (
        <li
          key={`${j.id}-${i}`}
          className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2"
        >
          <Briefcase size={14} className="shrink-0 text-slate-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-slate-800">{j.title}</div>
            <div className="truncate text-xs text-slate-400">
              {[
                j.date,
                j.studioId ? studioLabel(j.studioId) : null,
                showWho ? j.who : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          </div>
          {j.role && (
            <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
              {j.role}
            </span>
          )}
          {j.status === 'canceled' && (
            <span className="shrink-0 text-[11px] font-medium text-rose-500">canceled</span>
          )}
        </li>
      ))}
    </ul>
  )
}
