// Temporary panel shown for views whose full UI is built in later steps.
// It also surfaces a few live counts so the seeded store is visibly working.
export default function PlaceholderPanel({ icon: Icon, title, subtitle, stats = [] }) {
  return (
    <div className="mx-auto flex h-full max-w-3xl flex-col items-center justify-center text-center">
      <div className="mb-5 grid h-16 w-16 place-items-center rounded-2xl bg-violet-100 text-violet-600">
        {Icon && <Icon size={30} />}
      </div>
      <h2 className="text-2xl font-semibold tracking-tight text-slate-900">{title}</h2>
      <p className="mt-2 max-w-md text-slate-500">{subtitle}</p>

      {stats.length > 0 && (
        <div className="mt-8 flex flex-wrap justify-center gap-4">
          {stats.map((s) => (
            <div
              key={s.label}
              className="min-w-[9rem] rounded-xl border border-slate-200 bg-white px-6 py-4 shadow-sm"
            >
              <div className="text-2xl font-semibold text-slate-900">{s.value}</div>
              <div className="mt-1 text-xs uppercase tracking-wide text-slate-400">
                {s.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
