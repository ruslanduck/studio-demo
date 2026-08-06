import { useEffect, useMemo, useState } from 'react'
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
import { useStore, notArchived } from '../store'
import { useCan } from '../lib/useCan'
import { CAP } from '../lib/permissions'
import { studioLabel } from '../data/studios'
import { PEOPLE_CATEGORIES } from '../data/people'
import { orderStatusMeta } from '../data/orderStatus'
import PersonEditorModal from './PersonEditorModal'
import CompanyEditorModal from './CompanyEditorModal'
import SelectField from './SelectField'
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
  const archivePerson = useStore((s) => s.archivePerson)
  const createCompany = useStore((s) => s.createCompany)
  const updateCompany = useStore((s) => s.updateCompany)
  const archiveCompany = useStore((s) => s.archiveCompany)
  const companyTypes = useStore((s) => s.companyTypes)
  const orders = useStore((s) => s.orders)
  const createCompanyType = useStore((s) => s.createCompanyType)
  const renameCompanyType = useStore((s) => s.renameCompanyType)
  const archiveCompanyType = useStore((s) => s.archiveCompanyType)
  const peopleFocus = useStore((s) => s.peopleFocus)
  const clearPeopleFocus = useStore((s) => s.clearPeopleFocus)
  const openCalendarOn = useStore((s) => s.openCalendarOn)
  const peek = useStore((s) => s.peek)
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

  // Archived people / companies / type options are not offered anywhere new; the
  // labels already on a record keep reading (companies store the type as text).
  // Defined before the filters below, which depend on them.
  const livePeople = useMemo(() => people.filter(notArchived), [people])
  const liveCompanies = useMemo(() => companies.filter(notArchived), [companies])
  const liveCompanyTypes = useMemo(() => companyTypes.filter(notArchived), [companyTypes])

  // Search matches name, company, email, phone or subcategory; the category
  // dropdown narrows independently.
  const filteredPeople = useMemo(
    () =>
      livePeople.filter((p) => {
        if (category !== 'All' && p.category !== category) return false
        if (query === '') return true
        return [p.name, p.companyName, p.email, p.phone, p.subcategory]
          .filter(Boolean)
          .some((v) => v.toLowerCase().includes(query))
      }),
    [livePeople, category, query],
  )

  const filteredCompanies = useMemo(
    () =>
      liveCompanies.filter(
        (c) =>
          query === '' ||
          [c.name, c.companyType].filter(Boolean).some((v) => v.toLowerCase().includes(query)),
      ),
    [liveCompanies, query],
  )

  // Live only: with the Archive screen hidden, an archived person or company is
  // not viewable anywhere — not even via a stale selection or a drill-in.
  const selectedPerson = livePeople.find((p) => p.id === selectedPersonId) ?? null
  const selectedCompany = liveCompanies.find((c) => c.id === selectedCompanyId) ?? null

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

  // A work-history row opens the SHOOT as a layered card (crew, its order, the
  // gear that went out) instead of navigating away — from there the order, the
  // people and each item are one more click deep. A row whose shoot is missing
  // falls back to the calendar.
  function openJob(job) {
    if (job?.id) peek({ type: 'job', id: job.id })
    else openCalendarOn(job?.date)
  }

  // Stepping back onto this view (e.g. from an item we drilled into off a
  // vendor's card) restores the person/company that was open.
  useEffect(() => {
    if (!peopleFocus) return
    if (peopleFocus.companyId && companies.some((c) => c.id === peopleFocus.companyId))
      openCompany(peopleFocus.companyId)
    else if (peopleFocus.personId && people.some((p) => p.id === peopleFocus.personId))
      openPerson(peopleFocus.personId)
    clearPeopleFocus()
  }, [peopleFocus, people, companies, clearPeopleFocus])

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900">People</h2>
          <p className="text-sm text-slate-500">
            {livePeople.length} contacts · {liveCompanies.length} companies
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
              <SelectField
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                options={[{ value: 'All', label: 'All categories' }, ...categories]}
                className="w-full rounded-lg border border-slate-300 px-2.5 py-2 text-sm text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
              />
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
                onOpenCompany={(id) => peek({ type: 'company', id })}
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
                  orders={orders}
                  canManage={can(CAP.PERSON_MANAGE)}
                  onEdit={() => setEditor({ open: true, person: selectedPerson })}
                  // The company opens as a card over the person you're reading,
                  // the same as every other piece of related data.
                  onOpenCompany={(id) => peek({ type: 'company', id })}
                  onOpenJob={openJob}
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
                onOpenPerson={(id) => peek({ type: 'person', id })}
                onOpenJob={openJob}
                onOpenOrder={(orderId) => peek({ type: 'order', id: orderId })}
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
        companies={liveCompanies}
        companyTypes={liveCompanyTypes}
        jobCount={editor.person?.jobs?.length ?? 0}
        onClose={() => setEditor({ open: false, person: null })}
        onCreate={async (payload) => {
          const id = await createPerson(payload)
          if (id) setSelectedPersonId(id)
        }}
        onSave={(id, payload) => updatePerson(id, payload)}
        onDelete={async (id) => {
          const res = await archivePerson(id)
          if (res?.ok) setSelectedPersonId((cur) => (cur === id ? null : cur))
          return res
        }}
        onCreateCompany={(payload) => createCompany(payload)}
        onUploadCv={usingSupabase ? uploadCv : null}
      />

      <CompanyEditorModal
        open={companyEditor.open}
        company={companyEditor.company}
        // The LIVE list: removing a type archives it, and the Manage list has to
        // stop showing it or the × looks like it did nothing.
        companyTypes={liveCompanyTypes}
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
          archiveCompany(id)
          setSelectedCompanyId((cur) => (cur === id ? null : cur))
        }}
        onCreateType={(name) => createCompanyType(name)}
        onRenameType={(id, name) => renameCompanyType(id, name)}
        onDeleteType={(id) => archiveCompanyType(id)}
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

function PersonList({ people, selectedId, query, onSelect, onOpenCompany }) {
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
        const role = p.subcategory || p.category
        return (
          <li key={p.id}>
            <div
              className={[
                'flex items-center gap-3 rounded-lg px-2.5 py-2.5 transition',
                active ? 'bg-violet-50 ring-1 ring-violet-200' : 'hover:bg-slate-50',
              ].join(' ')}
            >
              <button
                type="button"
                onClick={() => onSelect(p.id)}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
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
                  <span className="block truncate text-xs text-slate-400">
                    {role}
                    {role && p.companyName ? ' · ' : ''}
                  </span>
                </span>
              </button>
              {/* The company is its own target: seeing it should mean being able
                  to open it, without first opening the person. */}
              {p.companyName && (
                <button
                  type="button"
                  onClick={() => onOpenCompany(p.companyId)}
                  title={`Open ${p.companyName}`}
                  className="-ml-2 min-w-0 max-w-[45%] shrink truncate text-left text-xs text-violet-600 underline decoration-violet-200 underline-offset-2 transition hover:text-violet-800"
                >
                  {p.companyName}
                </button>
              )}
              {p.jobs.length > 0 && (
                <span className="ml-auto shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                  {p.jobs.length}
                </span>
              )}
            </div>
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
function PersonDetail({ person, orders, canManage, onEdit, onOpenCompany, onOpenJob }) {
  const hasProfile = person.website || person.instagram || person.cvFilename

  // A person isn't linked to an order directly (an order belongs to the job);
  // the chain is person → roster → set → set.order_id. That order is folded into
  // the work-history row rather than listed separately — the two used to be
  // shown as different sections, which read as two unrelated things.
  const orderBySet = useMemo(() => {
    const map = new Map()
    for (const o of orders || []) if (o.setId && !map.has(o.setId)) map.set(o.setId, o)
    return map
  }, [orders])
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

        {/* Work history — the shoots they were crewed on; each row opens the
            job's order (or the calendar when the shoot has none). */}
        <section>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">
            Work history{person.jobs.length > 0 && ` (${person.jobs.length})`}
          </h4>
          <p className="mb-2 text-xs text-slate-400">
            Shoots this person was crewed on — open a row for that job’s equipment order.
          </p>
          <JobList
            jobs={person.jobs}
            emptyText="No jobs yet."
            orderForSet={(setId) => orderBySet.get(setId) ?? null}
            onOpenJob={onOpenJob}
          />
        </section>
      </div>
    </>
  )
}

// Company card (4.1 + 4.3 + 4.5): identity and type, the reachability block
// (address / hours / website / email / phone), its people as hyperlinks back to
// People, and work history — orders in both directions, the gear we currently
// hold from them as a vendor, and the jobs its people worked.
function CompanyDetail({ company, people, orders, inventory, canManage, onEdit, onOpenPerson, onOpenJob, onOpenOrder }) {
  const peek = useStore((s) => s.peek)
  const staff = people.filter((p) => p.companyId === company.id)
  // Same fold as the person card: a job row carries its order.
  const orderBySet = useMemo(() => {
    const map = new Map()
    for (const o of orders || []) if (o.setId && !map.has(o.setId)) map.set(o.setId, o)
    return map
  }, [orders])
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
          <OrderList orders={companyOrders} onOpen={(o) => onOpenOrder?.(o.id)} />
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
                  <button
                    type="button"
                    onClick={() => peek({ type: 'item', id: g.itemId })}
                    title="Open this item — units, history, where it is"
                    className="min-w-0 flex-1 truncate text-left text-sm font-medium text-slate-800 hover:text-violet-700 hover:underline focus:outline-none focus-visible:rounded focus-visible:ring-2 focus-visible:ring-violet-400"
                  >
                    {g.name}
                  </button>
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
          <JobList
            jobs={jobs}
            showWho
            emptyText="No jobs involving this company yet."
            orderForSet={(setId) => orderBySet.get(setId) ?? null}
            onOpenJob={onOpenJob}
          />
        </section>
      </div>
    </>
  )
}

// Order history rows on a COMPANY card. The badge is the DIRECTION, which is the
// only thing that needs spelling out here: gear this company rented TO us
// (sub-rental) versus an order raised against them. It's worded rather than
// labelled "Client" — a bare noun read like a customer segment. Status colours
// come from the shared vocabulary so a confirmed order is green here too.
function OrderList({ orders, showCompany = false, onOpen }) {
  if (orders.length === 0) return <p className="text-sm text-slate-400">No orders yet.</p>
  return (
    <ul className="space-y-1.5">
      {orders.map((o) => {
        const inbound = o.kind === 'sub_rental'
        const st = orderStatusMeta(o.status)
        return (
          <li key={o.id}>
            <button
              type="button"
              onClick={() => onOpen?.(o)}
              title="Open this order"
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-violet-300 hover:bg-violet-50/40"
            >
            <div className="flex items-center gap-2">
              <span
                title={inbound ? 'They rented gear to us' : 'Raised against this company'}
                className={[
                  'inline-flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
                  inbound ? 'bg-violet-100 text-violet-700' : 'bg-slate-200 text-slate-600',
                ].join(' ')}
              >
                {inbound ? <ArrowDownLeft size={9} /> : <ArrowUpRight size={9} />}
                {inbound ? 'Rented to us' : 'For their job'}
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-xs text-slate-600">
                {o.poNumber || o.number}
              </span>
              <span
                className={[
                  'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1',
                  st.pill,
                ].join(' ')}
              >
                {st.label}
              </span>
            </div>
            <div className="mt-1 truncate text-xs text-slate-400">
              {[o.orderedAt, o.setTitle, showCompany ? o.companyName : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
            {o.lines.length > 0 && (
              <div className="mt-1 truncate text-xs text-slate-600">
                {o.lines.map((l) => `${l.quantity}× ${l.itemName ?? 'item'}`).join(', ')}
              </div>
            )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}

// Shared job-history list used by both cards.
//
// A row IS the shoot: date, studio, the person's role ON THAT JOB ("as model" —
// not a repeat of their profile category, since the same person can be crewed
// differently from job to job) and, when the shoot has an order, that order's
// ref + status. Clicking the row opens that order; a shoot with no order opens
// the calendar on its date instead, so every row leads somewhere.
function JobList({ jobs, showWho = false, emptyText, orderForSet, onOpenJob }) {
  if (jobs.length === 0) return <p className="text-sm text-slate-400">{emptyText}</p>
  return (
    <ul className="space-y-1.5">
      {jobs.map((j, i) => {
        const order = orderForSet ? orderForSet(j.id) : null
        const st = order ? orderStatusMeta(order.status) : null
        return (
          <li key={`${j.id}-${i}`}>
            <button
              type="button"
              onClick={() => onOpenJob?.(j, order)}
              title={order ? 'Open this job’s order' : 'Show this shoot on the calendar'}
              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-left transition hover:border-violet-300 hover:bg-violet-50/40"
            >
              <Briefcase size={14} className="shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-slate-800">{j.title}</div>
                <div className="truncate text-xs text-slate-400">
                  {[
                    j.date,
                    j.studioId ? studioLabel(j.studioId) : null,
                    showWho ? j.who : null,
                    j.role ? `as ${String(j.role).toLowerCase()}` : null,
                    order ? order.poNumber || order.number : 'no order',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </div>
              </div>
              {st && (
                <span
                  className={[
                    'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1',
                    st.pill,
                  ].join(' ')}
                >
                  {st.label}
                </span>
              )}
              {j.status === 'canceled' && (
                <span className="shrink-0 text-[11px] font-medium text-rose-500">canceled</span>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
