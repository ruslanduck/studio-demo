// Import a normalized inventory file into Supabase.
//
// DRY-RUN BY DEFAULT: it reads, validates and reports, and writes nothing until
// --write is passed. A migration you cannot rehearse is a migration you cannot
// trust.
//
// The data file is deliberately NOT part of this repo — the repo is public and a
// studio's real inventory (names, barcodes, serial numbers) has no business in
// it. Pass its path explicitly:
//
//   node --env-file=.env.local scripts/import-inventory.mjs --file "C:/path/import-normalized.json"
//   node --env-file=.env.local scripts/import-inventory.mjs --file "…" --write
//
// Expected shape: { items: [ { name, category, subcategory, kind, quantity,
//                              units: [ { barcode, serial, broken } ] } ] }
//
// Idempotent: an item that already exists (matched by name) is not recreated —
// only its missing copies are added. Re-running after a partial failure resumes
// instead of duplicating.
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)')
  process.exit(1)
}
const arg = (f) => {
  const i = process.argv.indexOf(f)
  return i > -1 ? process.argv[i + 1] : null
}
const file = arg('--file')
const write = process.argv.includes('--write')
if (!file) {
  console.error('Usage: --file "<path to normalized json>" [--write]')
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })
const src = JSON.parse(readFileSync(file, 'utf8'))
const items = src.items || src
if (!Array.isArray(items)) {
  console.error('The file has no `items` array.')
  process.exit(1)
}

const KINDS = new Set(['barcoded', 'non_barcoded'])
const fail = []
const seen = new Map()
for (const [n, it] of items.entries()) {
  const where = `item #${n + 1} "${it.name ?? '?'}"`
  if (!it.name?.trim()) fail.push(`${where}: no name`)
  if (!it.category?.trim()) fail.push(`${where}: no category`)
  if (!KINDS.has(it.kind)) fail.push(`${where}: kind "${it.kind}" is not barcoded/non_barcoded`)
  if (it.kind === 'non_barcoded' && !(Number(it.quantity) >= 0))
    fail.push(`${where}: quantity ${it.quantity} is not >= 0`)
  if (it.kind === 'barcoded' && !(it.units || []).length) fail.push(`${where}: barcoded but no copies`)
  for (const u of it.units || []) {
    const bc = String(u.barcode ?? '').trim()
    if (!bc) fail.push(`${where}: a copy has no barcode`)
    else if (seen.has(bc)) fail.push(`${where}: barcode ${bc} also used by "${seen.get(bc)}"`)
    else seen.set(bc, it.name)
  }
}

// What the database already holds.
const { data: existingItems, error: e1 } = await db
  .from('inventory_items')
  .select('id, name, archived_at')
if (e1) throw e1
const { data: existingUnits, error: e2 } = await db.from('units').select('barcode')
if (e2) throw e2
// Match only LIVE items. An ARCHIVED namesake is retired stock (the demo seed
// borrowed several real names), and reusing it would attach the imported copies
// to a row that no list shows — the gear would arrive invisible.
const haveItem = new Map(
  existingItems.filter((i) => !i.archived_at).map((i) => [i.name.trim().toLowerCase(), i]),
)
const archivedNamesakes = existingItems.filter(
  (i) => i.archived_at && items.some((x) => x.name.trim().toLowerCase() === i.name.trim().toLowerCase()),
)
const haveBarcode = new Set(existingUnits.map((u) => u.barcode))
const takenBarcodes = [...seen.keys()].filter((b) => haveBarcode.has(b))

const toCreate = items.filter((i) => !haveItem.has(i.name.trim().toLowerCase()))
const already = items.length - toCreate.length
const copies = items.reduce((n, i) => n + (i.units || []).length, 0)
const cats = [...new Set(items.map((i) => i.category))].sort()

console.log(`FILE   ${file}`)
console.log(`MODE   ${write ? 'WRITE — this will create rows' : 'DRY RUN — nothing will be written'}`)
console.log(`\nitems in file        : ${items.length}`)
console.log(`  already in the DB  : ${already}`)
console.log(`  would be created   : ${toCreate.length}`)
if (archivedNamesakes.length)
  console.log(
    `  archived namesakes ignored (a fresh row is created): ${archivedNamesakes.length}` +
      ` — ${archivedNamesakes.map((i) => i.name).join(', ')}`,
  )
console.log(`copies in file       : ${copies}`)
console.log(`categories           : ${cats.length}  ${cats.join(', ')}`)
console.log(`\nvalidation errors    : ${fail.length}`)
for (const f of fail.slice(0, 20)) console.log('   -', f)
if (fail.length > 20) console.log(`   … +${fail.length - 20} more`)
console.log(`barcodes already taken in the DB: ${takenBarcodes.length}`)
if (takenBarcodes.length) console.log('   e.g.', takenBarcodes.slice(0, 12).join(', '))

if (fail.length) {
  console.error('\nRefusing to continue: fix the validation errors first.')
  process.exit(1)
}
if (takenBarcodes.length) {
  console.error(
    `\nRefusing to continue: ${takenBarcodes.length} barcode(s) are already in the register.\n` +
      'A barcode is unique across the whole register and these are physical labels, so they\n' +
      'cannot be renumbered. Remove the rows that hold them first.',
  )
  process.exit(1)
}
if (!write) {
  console.log('\nDry run only. Add --write to create these rows.')
  process.exit(0)
}

// ---- write
let madeItems = 0
let madeUnits = 0
for (const it of items) {
  const known = haveItem.get(it.name.trim().toLowerCase())
  let itemId = known?.id
  if (!itemId) {
    const { data, error } = await db
      .from('inventory_items')
      .insert({
        name: it.name.trim(),
        category: it.category.trim(),
        subcategory: it.subcategory?.trim() || null,
        kind: it.kind,
        quantity: it.kind === 'barcoded' ? 0 : Number(it.quantity) || 0,
      })
      .select('id')
      .single()
    if (error) throw new Error(`insert item "${it.name}": ${error.message}`)
    itemId = data.id
    madeItems++
  }
  const rows = (it.units || [])
    .filter((u) => !haveBarcode.has(String(u.barcode)))
    .map((u) => ({
      inventory_item_id: itemId,
      barcode: String(u.barcode).trim(),
      serial: u.serial?.trim() || null,
      ownership: 'owned',
    }))
  for (let i = 0; i < rows.length; i += 200) {
    const chunk = rows.slice(i, i + 200)
    const { error } = await db.from('units').insert(chunk)
    if (error) throw new Error(`insert units for "${it.name}": ${error.message}`)
    madeUnits += chunk.length
    chunk.forEach((r) => haveBarcode.add(r.barcode))
  }
}
console.log(`\nDone. created ${madeItems} item(s), ${madeUnits} unit(s).`)
