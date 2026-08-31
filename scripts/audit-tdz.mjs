// Catch the temporal-dead-zone crash that keeps reaching production.
//
// A React component's `const x = useMemo(() => …, [deps])` FACTORY RUNS during
// render, at its own line. So if its body or its dependency array reads a const
// declared further down the same function, the page dies with
//   ReferenceError: Cannot access 'y' before initialization
// and takes the whole view with it.
//
// Nothing else in the toolchain sees this: `npm run build` compiles it happily,
// oxlint does not implement no-use-before-define (checked: even
// `const a = b + 1; const b = 2` passes), and exhaustive-deps is satisfied
// because the dependency array matches the reference. It has now shipped three
// times — livePeople, packProg, brands.
//
// Deliberately simple and file-scoped: it flags a hook initializer that names a
// const declared LATER in the same file. Same trade-off as audit-jsx-props —
// read the survivors rather than trusting the count.
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src']
const files = []
const walk = (dir) => {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(jsx?|mjs)$/.test(p)) files.push(p)
  }
}
ROOTS.forEach(walk)

const HOOK = /\b(useMemo|useCallback)\s*\(/g
let findings = 0

for (const file of files) {
  const src = readFileSync(file, 'utf8')
  const lines = src.split('\n')

  // Every `const NAME =` with the line it is declared on. Later duplicates in
  // other scopes only make the check more conservative, never less.
  // Keep the indentation too: the bug is always a sibling in the SAME function
  // body, while the noise is same-named locals inside other functions, which sit
  // deeper. Comparing indents is a cheap stand-in for real scope analysis.
  const declLine = new Map()
  lines.forEach((l, i) => {
    const m = l.match(/^(\s*)const\s+([A-Za-z_$][\w$]*)\s*=/)
    if (m && !declLine.has(m[2])) declLine.set(m[2], { line: i, indent: m[1].length })
  })

  let m
  while ((m = HOOK.exec(src)) !== null) {
    // The line the hook call sits on, and the assignment it belongs to.
    const upto = src.slice(0, m.index)
    const line = upto.split('\n').length - 1
    const owner = lines[line].match(/^\s*const\s+([A-Za-z_$][\w$]*)\s*=/)?.[1] ?? null

    // Balance parens to get the whole call, then scan it for identifiers.
    let depth = 0
    let end = m.index + m[0].length - 1
    for (; end < src.length; end++) {
      if (src[end] === '(') depth++
      else if (src[end] === ')') {
        depth--
        if (depth === 0) break
      }
    }
    const body = src.slice(m.index, end + 1)
    // The hook call's own last line. A const declared INSIDE the callback is a
    // local — the overwhelming majority of matches — and only a declaration
    // BELOW the whole call can be the outer-scope one that has not run yet.
    const endLine = src.slice(0, end).split(String.fromCharCode(10)).length - 1
    const seen = new Set()
    for (const id of body.match(/[A-Za-z_$][\w$]*/g) || []) {
      if (seen.has(id) || id === owner) continue
      seen.add(id)
      const d = declLine.get(id)
      const ownIndent = lines[line].match(/^(\s*)/)[1].length
      if (d !== undefined && d.line > endLine && d.indent === ownIndent) {
        console.log(
          `TDZ  ${file}:${line + 1}  ${owner ?? '(hook)'} reads "${id}", declared later at line ${d.line + 1}`,
        )
        findings++
      }
    }
  }
}

console.log(findings ? `\n${findings} suspect(s)` : 'No use-before-declaration in a hook initializer.')
process.exit(0)
