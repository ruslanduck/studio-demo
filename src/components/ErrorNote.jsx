import { AlertTriangle } from 'lucide-react'

// A refusal, where the person can actually see it.
//
// Reported against the Categories window: removing a category that still holds
// stock is refused with a reason, the reason rendered at the top of a long
// scrolling list, and "я ее не вижу пока не пролистаю наверх" — a message
// nobody reads is the same as no message.
//
// So this is rendered OUTSIDE a modal's scroll container, between the content
// and the footer: the panel is a flex column with a capped height, so a pinned
// row sits on screen at every scroll position, right above the button that was
// just pressed. Same place in every window, so the crew learns where a problem
// appears once.
export default function ErrorNote({ children, className = '' }) {
  if (!children) return null
  return (
    <div
      role="alert"
      className={[
        'mx-5 mb-3 flex shrink-0 items-start gap-1.5 rounded-lg bg-rose-50 px-3 py-2 text-xs font-medium text-rose-700 ring-1 ring-rose-200',
        className,
      ].join(' ')}
    >
      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
      <span className="min-w-0 flex-1">{children}</span>
    </div>
  )
}
