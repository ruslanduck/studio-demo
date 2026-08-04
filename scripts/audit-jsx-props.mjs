// `npm run audit:jsx` — every identifier passed as a JSX prop value
// (prop={ident}) must be declared somewhere in its own file.
//
// An undefined one is a WHITE SCREEN of the whole view, and neither
// `npm run build` (Vite doesn't resolve identifiers) nor oxlint catches it. It
// has bitten three times: `notArchived` in OrderEquipmentModal, `livePeople` in
// People.jsx, and `companies={companies}` in StudioCalendar — that last one
// shipped to production, because adding a required prop to a shared modal means
// EVERY component that renders it needs the value.
//
// Deliberately regex-based rather than a real parse: it has to stay a two-second
// check with no new dependency. It can report a false positive on an unusual
// declaration form (a renamed object destructure, e.g.
// `const { loading: activityLoading } = useActivity()`), so read the survivors
// rather than trusting the count.
import { readdirSync, readFileSync } from 'node:fs'

const files = readdirSync('src/components')
  .filter((f) => f.endsWith('.jsx'))
  .map((f) => 'src/components/' + f)
files.push('src/App.jsx')

const GLOBALS = new Set([
  'window', 'document', 'console', 'Math', 'JSON', 'Date', 'Object', 'Array',
  'String', 'Number', 'Boolean', 'Set', 'Map', 'Promise', 'undefined', 'null',
  'true', 'false', 'navigator', 'localStorage', 'URL', 'Blob', 'React', 'e',
  'async', // onClick={async () => …} — a keyword, not a value
])

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

let bad = 0
for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const used = new Set()
  for (const m of src.matchAll(/[\s{]([a-zA-Z_]\w*)=\{([a-zA-Z_]\w*)([.?[)\s]|\})/g)) used.add(m[2])
  for (const name of used) {
    if (GLOBALS.has(name)) continue
    const n = esc(name)
    const patterns = [
      new RegExp(`(const|let|var|function|class)\\s+${n}\\b`),
      // A named import, with or without a default alongside it:
      //   import { x } from …        import Default, { x } from …
      // The second form used to read as undeclared, which is a false alarm in a
      // tool whose whole job is to be believed.
      new RegExp(`import\\s+(?:[\\w$]+\\s*,\\s*)?\\{[^}]*\\b${n}\\b[^}]*\\}`, 's'),
      new RegExp(`import\\s+${n}\\b`),
      new RegExp(`as\\s+${n}\\b`),
      // a destructured prop or function parameter
      new RegExp(`\\{[^{}]*\\b${n}\\b[^{}]*\\}\\s*\\)`, 's'),
      new RegExp(`\\b${n}\\s*=\\s*[^=]`),
      // an arrow-function parameter: (x) => … / (a, x) => … / x => …
      new RegExp(`\\(\\s*${n}\\s*[,)]`),
      new RegExp(`,\\s*${n}\\s*[,)]`),
      new RegExp(`\\b${n}\\s*=>`),
      // a for-of / catch binding
      new RegExp(`(for\\s*\\(\\s*(const|let)|catch\\s*\\(\\s*)${n}\\b`),
      // array destructuring: const [x, setX] = useState()
      new RegExp(`\\[\\s*${n}\\s*[,\\]]`),
      new RegExp(`,\\s*${n}\\s*\\]`),
    ]
    if (patterns.some((p) => p.test(src))) continue
    console.log('UNDECLARED', f, '->', name)
    bad++
  }
}
console.log(bad ? `${bad} suspect(s)` : 'clean — every JSX prop value resolves in its file')
