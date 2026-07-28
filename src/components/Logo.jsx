import { Package } from 'lucide-react'
import { BRAND_NAME } from '../lib/brand'

// The brand MARK. The name itself lives in lib/brand.js (kept JSX-free so the
// PDF builders can print it too) and is re-exported here, so UI code can grab
// the mark and the name from one import.
//
// The mark is a PLACEHOLDER: a violet rounded square with an icon, standing in
// until the real Kitbay logo arrives. Swapping it is a one-file change — replace
// the icon below with an <img src="/logo.svg" /> or an inline SVG and every
// screen that shows the brand (sidebar, mobile top bar, login) follows.
export { BRAND_NAME }

export default function Logo({ size = 32, radius = 'rounded-lg', className = '' }) {
  return (
    <div
      style={{ width: size, height: size }}
      className={[
        'grid shrink-0 place-items-center bg-violet-600 text-white',
        radius,
        className,
      ].join(' ')}
      aria-label={BRAND_NAME}
    >
      <Package size={Math.round(size * 0.56)} strokeWidth={2.25} />
    </div>
  )
}
