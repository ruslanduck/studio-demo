// Locale-proof date field. The native <input type="date"> renders its
// placeholder/format in the browser's locale (e.g. "дд.мм.гггг" on a Russian
// browser), which the app can't override. This is a plain ISO text field so
// the format is always English regardless of the viewer's locale.
export default function DateField({ value, onChange, className }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="YYYY-MM-DD"
      pattern="\d{4}-\d{2}-\d{2}"
      maxLength={10}
      value={value || ''}
      onChange={onChange}
      className={className}
    />
  )
}
