// Light / dark, and "whatever the device says".
//
// THREE states, not a boolean: a studio machine that follows the OS at dusk is
// the sane default, but somebody who wants the app dark on a light desktop
// (or the reverse) must be able to say so and have it stick. A two-way toggle
// cannot express "follow the device" once it has been touched.
//
// The RESOLUTION is pure so `npm run test:lib` can assert it: everything that
// touches the DOM lives in `useApplyTheme` below.

export const THEME_SYSTEM = 'system'
export const THEME_LIGHT = 'light'
export const THEME_DARK = 'dark'

// The order the control cycles through — System first, because that is the
// default and the one a person returns to.
export const THEME_ORDER = [THEME_SYSTEM, THEME_LIGHT, THEME_DARK]

export const THEME_LABEL = {
  [THEME_SYSTEM]: 'System',
  [THEME_LIGHT]: 'Light',
  [THEME_DARK]: 'Dark',
}

// What a stored preference actually means right now. An unknown value (an older
// build, a hand-edited localStorage) falls back to following the device rather
// than to a hardcoded light — the device's answer is never wrong.
export function resolveTheme(preference, systemPrefersDark = false) {
  if (preference === THEME_DARK) return THEME_DARK
  if (preference === THEME_LIGHT) return THEME_LIGHT
  return systemPrefersDark ? THEME_DARK : THEME_LIGHT
}

// The next value the one-button control moves to.
export function nextTheme(preference) {
  const i = THEME_ORDER.indexOf(preference)
  return THEME_ORDER[(i + 1) % THEME_ORDER.length]
}

// Whether a stored value is one we understand.
export const isTheme = (v) => THEME_ORDER.includes(v)
