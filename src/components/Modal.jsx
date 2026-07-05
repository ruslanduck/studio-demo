import { useEffect } from 'react'
import { X } from 'lucide-react'

const SIZES = {
  md: 'max-w-md',
  lg: 'max-w-2xl',
}

// Reusable centered modal with a dimmed backdrop. Closes on Escape or
// backdrop click. The panel caps its height and lets children manage their
// own scrolling.
export default function Modal({ open, onClose, title, size = 'md', children }) {
  useEffect(() => {
    if (!open) return
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className={[
          'relative z-10 flex max-h-[88vh] w-full flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl',
          SIZES[size] ?? SIZES.md,
        ].join(' ')}
      >
        <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 transition hover:bg-slate-100 hover:text-slate-600"
          >
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
