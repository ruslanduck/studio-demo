// Jump straight to a month and year, instead of paging there.
//
// Used by DateField's popover (a purchase date can be decades old) and by the
// studio calendar's header (a shoot two years out shouldn't take 24 clicks of the
// arrow). One definition, so both offer the same span and the same shape.
import { yearsFor } from '../lib/years'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export default function MonthYearPicker({ month, year, onMonth, onYear }) {
  const years = yearsFor(year)
  return (
    <div className="px-1 pb-1">
      <div className="grid grid-cols-3 gap-1">
        {MONTHS.map((m, i) => (
          <button
            key={m}
            type="button"
            onClick={() => onMonth(i)}
            className={[
              'rounded-md py-1.5 text-xs font-medium transition',
              month === i ? 'bg-violet-600 text-white' : 'text-slate-600 hover:bg-violet-50',
            ].join(' ')}
          >
            {m}
          </button>
        ))}
      </div>
      {/* A scrollable span of years, so "bought 15 years ago" is one click away
          instead of 180 pages of arrows. */}
      <div className="mt-2 max-h-32 overflow-auto rounded-md border border-slate-100">
        <div className="grid grid-cols-4 gap-0.5 p-1">
          {years.map((y) => (
            <button
              key={y}
              type="button"
              onClick={() => onYear(y)}
              className={[
                'rounded py-1 text-xs transition',
                year === y ? 'bg-violet-600 font-semibold text-white' : 'text-slate-600 hover:bg-violet-50',
              ].join(' ')}
            >
              {y}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
