import { useState } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'

// One filter design for every list pane.
//
// Orders and Inventory had grown two different ones: Orders kept its filters
// behind a "Filters" disclosure with a count badge and a "N of M · Clear all"
// footer, while Inventory showed a permanent grid of dropdowns at a different
// size with its own Clear button. Same job, two looks. This is that job, once:
//
//   search field (with a clear ×)
//   [Filters (n)]  [optional trailing control, e.g. a sort]
//   the filter controls themselves, folded away until asked for
//   "N of M things"  ·  Clear all
//
// `FILTER_FIELD` is exported so the controls a caller passes in are sized like
// each other — that mismatch was half of what made the two panes look unrelated.
export const FILTER_FIELD =
  'min-w-0 rounded-lg border border-slate-300 px-2 py-1.5 text-xs text-slate-700 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

export default function FilterBar({
  search,
  onSearch,
  searchPlaceholder,
  activeCount = 0,
  onClear,
  count,
  total,
  noun = 'items',
  trailing = null,
  children,
}) {
  const [open, setOpen] = useState(false)
  const hasFilters = !!children
  const dirty = !!search || activeCount > 0

  return (
    <div className="space-y-2 border-b border-slate-200 p-3">
      <div className="relative">
        <Search
          size={16}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="w-full rounded-lg border border-slate-300 py-2 pl-9 pr-9 text-sm outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100"
        />
        {search !== '' && (
          <button
            type="button"
            onClick={() => onSearch('')}
            title="Clear search"
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {(hasFilters || trailing) && (
        <div className="flex items-center gap-2">
          {hasFilters && (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              className={[
                'inline-flex shrink-0 items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium transition',
                activeCount > 0
                  ? 'border-violet-300 bg-violet-50 text-violet-700'
                  : 'border-slate-300 text-slate-600 hover:bg-slate-50',
              ].join(' ')}
            >
              <SlidersHorizontal size={13} />
              Filters
              {activeCount > 0 && (
                <span className="rounded-full bg-violet-600 px-1.5 text-[10px] font-semibold text-white">
                  {activeCount}
                </span>
              )}
            </button>
          )}
          {trailing}
        </div>
      )}

      {/* Folded away by default: the pane is narrow, and the filters that matter
          most of the time are already in the search box. */}
      {open && hasFilters && (
        <div className="space-y-2 rounded-lg border border-slate-200 bg-slate-50/60 p-2.5">{children}</div>
      )}

      {(count != null || dirty) && (
        <div className="flex items-center justify-between text-[11px] text-slate-400">
          <span>
            {count != null ? (
              <>
                {count} of {total} {noun}
              </>
            ) : null}
          </span>
          {dirty && onClear && (
            <button
              type="button"
              onClick={onClear}
              className="font-medium text-violet-600 transition hover:underline"
            >
              Clear all
            </button>
          )}
        </div>
      )}
    </div>
  )
}
