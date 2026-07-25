// Locale-proof time field. Native <input type="time"> localizes its
// placeholder (e.g. "чч:мм" on a Russian browser). This is a plain 24h HH:MM
// text field so the format is always English regardless of the viewer's locale.
export default function TimeField({ value, onChange, className }) {
  return (
    <input
      type="text"
      inputMode="numeric"
      placeholder="HH:MM"
      pattern="\d{2}:\d{2}"
      maxLength={5}
      value={value || ''}
      onChange={onChange}
      className={className}
    />
  )
}
