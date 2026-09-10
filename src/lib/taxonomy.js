// The inventory taxonomy: categories hold subcategories, and an ITEM belongs to
// a SUBCATEGORY — never to a category directly. An item's category is derived
// by following its subcategory, which is why there is exactly one place that
// knows how to do that.
//
// PURE — no React, no store, no date library — so `npm run test:lib` can assert
// the derivation and, more importantly, the two REMOVAL RULES under plain Node.
//
// The removal rules return a REASON, not a boolean. "You can't delete this" with
// nothing else said is the kind of dead end this codebase keeps having to undo:
// the crew needs to know what is in the way and how much of it.

// The filter value for "has no subcategory yet". A real id can never collide
// with it — ids are uuids.
export const UNASSIGNED = '__unassigned__'

const norm = (s) => String(s ?? '').trim()
const key = (s) => norm(s).toLowerCase()
export const notArchivedRow = (r) => !r?.archivedAt

const byPositionThenName = (a, b) =>
  (a.position ?? 0) - (b.position ?? 0) || norm(a.name).localeCompare(norm(b.name))

// ---------------------------------------------------------------------------
// Reading the tree

export function liveCategories(tax) {
  return (tax?.categories ?? []).filter(notArchivedRow).slice().sort(byPositionThenName)
}

// Every live subcategory, or just one category's.
export function liveSubcategories(tax, categoryId = null) {
  return (tax?.subcategories ?? [])
    .filter((s) => notArchivedRow(s) && (categoryId == null || s.categoryId === categoryId))
    .slice()
    .sort(byPositionThenName)
}

export function categoryById(tax, id) {
  return (tax?.categories ?? []).find((c) => c.id === id) ?? null
}
export function subcategoryById(tax, id) {
  return (tax?.subcategories ?? []).find((s) => s.id === id) ?? null
}

// An ARCHIVED row is still looked up by id on purpose: a name has to keep
// resolving for the records that still point at it, exactly like an archived
// item's name still resolves on an order line.
export function subcategoryOf(item, tax) {
  return item?.subcategoryId ? subcategoryById(tax, item.subcategoryId) : null
}

export function categoryOf(item, tax) {
  const sub = subcategoryOf(item, tax)
  return sub ? categoryById(tax, sub.categoryId) : null
}

// The item's category, as a label. Stock can legitimately be filed nowhere yet,
// and saying so beats an empty badge that reads like a rendering bug.
export function categoryLabel(item, tax) {
  return categoryOf(item, tax)?.name || 'Not filed'
}

// "Strobes / Profoto" — how a subcategory reads when it is offered on its own,
// since two categories may each have a "Profoto".
export function subcategoryPath(sub, tax) {
  if (!sub) return ''
  const cat = categoryById(tax, sub.categoryId)
  return cat ? `${norm(cat.name)} / ${norm(sub.name)}` : norm(sub.name)
}

// Every subcategory as a pickable option, grouped by category and labelled with
// its path — the one field an item is assigned through.
export function subcategoryOptions(tax) {
  const out = []
  for (const cat of liveCategories(tax))
    for (const sub of liveSubcategories(tax, cat.id))
      out.push({
        value: sub.id,
        label: `${norm(cat.name)} / ${norm(sub.name)}`,
        categoryId: cat.id,
        categoryName: norm(cat.name),
        name: norm(sub.name),
      })
  return out
}

// ---------------------------------------------------------------------------
// Counting what uses what. `items` are the register's rows; only LIVE stock
// counts as "attached" — retired stock would make a subcategory permanently
// un-removable, and it is reported separately instead.

const live = (items) => (items ?? []).filter((i) => !i?.archivedAt)

export function itemsInSubcategory(items, subcategoryId) {
  return live(items).filter((i) => i.subcategoryId === subcategoryId)
}

export function archivedItemsInSubcategory(items, subcategoryId) {
  return (items ?? []).filter((i) => i?.archivedAt && i.subcategoryId === subcategoryId)
}

// Items in a CATEGORY are the items of its subcategories — including archived
// subcategories, because an item pointing at one is still that category's.
export function itemsInCategory(items, tax, categoryId) {
  const subs = new Set(
    (tax?.subcategories ?? []).filter((s) => s.categoryId === categoryId).map((s) => s.id),
  )
  return live(items).filter((i) => i.subcategoryId && subs.has(i.subcategoryId))
}

// The whole tree with counts, for the manage screen and the grouped list.
// `unassigned` is what has no subcategory at all — real state, not an error.
export function taxonomyTree(tax, items) {
  const stock = live(items)
  return liveCategories(tax).map((cat) => {
    const subs = liveSubcategories(tax, cat.id).map((sub) => ({
      ...sub,
      itemCount: stock.filter((i) => i.subcategoryId === sub.id).length,
    }))
    return {
      ...cat,
      subs,
      itemCount: subs.reduce((n, s) => n + s.itemCount, 0),
    }
  })
}

export function unassignedItems(items) {
  return live(items).filter((i) => !i.subcategoryId)
}

// The unassigned stock grouped by the category TEXT it was imported with, so a
// whole former category can be placed in one action instead of item by item.
// The text is history, not a link — it is only ever a hint.
export function unassignedByFormerCategory(items) {
  const groups = new Map()
  for (const item of unassignedItems(items)) {
    const was = norm(item.category) || '—'
    if (!groups.has(was)) groups.set(was, [])
    groups.get(was).push(item)
  }
  return [...groups]
    .map(([former, list]) => ({ former, items: list }))
    .sort((a, b) => b.items.length - a.items.length || a.former.localeCompare(b.former))
}

// ---------------------------------------------------------------------------
// The removal rules. Both return null when removal is allowed, else the reason.

const pieces = (n, one, many) => `${n} ${n === 1 ? one : many}`

export function categoryRemovalBlock(categoryId, tax, items) {
  const cat = categoryById(tax, categoryId)
  if (!cat) return 'That category no longer exists.'
  const subs = liveSubcategories(tax, categoryId)
  const stock = itemsInCategory(items, tax, categoryId)
  if (stock.length && subs.length)
    return `${norm(cat.name)} still holds ${pieces(stock.length, 'item', 'items')} in ${pieces(
      subs.length,
      'subcategory',
      'subcategories',
    )}. Move them elsewhere first.`
  if (stock.length)
    return `${norm(cat.name)} still holds ${pieces(stock.length, 'item', 'items')}. Move them elsewhere first.`
  if (subs.length)
    return `${norm(cat.name)} still has ${pieces(
      subs.length,
      'subcategory',
      'subcategories',
    )} (${subs.map((s) => norm(s.name)).join(', ')}). Remove them first.`
  return null
}

export function subcategoryRemovalBlock(subcategoryId, tax, items) {
  const sub = subcategoryById(tax, subcategoryId)
  if (!sub) return 'That subcategory no longer exists.'
  const stock = itemsInSubcategory(items, subcategoryId)
  if (stock.length)
    return `${norm(sub.name)} still holds ${pieces(
      stock.length,
      'item',
      'items',
    )}. Reassign them first.`
  return null
}

// Retired stock does NOT block removal, but it is worth saying out loud: the
// name stays readable for those records after the subcategory is gone.
export function subcategoryRemovalNote(subcategoryId, items) {
  const n = archivedItemsInSubcategory(items, subcategoryId).length
  return n ? `${pieces(n, 'archived item', 'archived items')} keep it for their history.` : null
}

// ---------------------------------------------------------------------------
// Naming. Unique among LIVE rows in its scope, which is the whole register for
// a category and one category for a subcategory — so "Strobes / Profoto" and
// "Lighting Modification / Profoto" can both exist, as they do.

export function categoryNameError(name, tax, { exceptId = null } = {}) {
  const n = norm(name)
  if (!n) return 'A category needs a name.'
  const clash = liveCategories(tax).find((c) => c.id !== exceptId && key(c.name) === key(n))
  return clash ? `There is already a category called “${norm(clash.name)}”.` : null
}

export function subcategoryNameError(name, tax, categoryId, { exceptId = null } = {}) {
  const n = norm(name)
  if (!n) return 'A subcategory needs a name.'
  if (!categoryId) return 'Pick the category it belongs to.'
  const clash = liveSubcategories(tax, categoryId).find(
    (s) => s.id !== exceptId && key(s.name) === key(n),
  )
  if (!clash) return null
  const cat = categoryById(tax, categoryId)
  return `${norm(cat?.name) || 'That category'} already has a “${norm(clash.name)}”.`
}

// ---------------------------------------------------------------------------
// Building the taxonomy out of a register that only carries the legacy TEXT.
//
// This is what migration 20260911120000 does in SQL for the real database, and
// what the demo seed needs so both modes describe the same shape — the "same
// logic written twice" hazard this codebase has been bitten by three times, so
// the RULE lives here once and the two callers only supply the rows.
//
// A subcategory is keyed by the (category, subcategory) PAIR: on the studio's
// own register "Profoto" exists under both Strobes and Lighting Modification,
// and merging those would put softboxes in with the flash heads.
export function taxonomyFromItems(items, { order = [] } = {}) {
  const slug = (s) =>
    norm(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'x'
  const rank = (name) => {
    const i = order.findIndex((o) => key(o) === key(name))
    return i === -1 ? order.length + 1 : i + 1
  }

  const categories = []
  const subcategories = []
  const catByKey = new Map()
  const subByKey = new Map()
  const assignments = {}

  for (const item of items ?? []) {
    if (item?.archivedAt) continue // retired stock does not shape the taxonomy
    const catName = norm(item?.category)
    if (!catName) continue
    if (!catByKey.has(key(catName))) {
      const row = { id: `cat-${slug(catName)}`, name: catName, position: rank(catName) }
      catByKey.set(key(catName), row)
      categories.push(row)
    }
    const cat = catByKey.get(key(catName))
    const subName = norm(item?.subcategory)
    // No subcategory is a real state, not something to invent a name for.
    if (!subName) continue
    const pairKey = `${cat.id}::${key(subName)}`
    if (!subByKey.has(pairKey)) {
      const row = {
        id: `sub-${slug(catName)}-${slug(subName)}`,
        categoryId: cat.id,
        name: subName,
        position: subByKey.size,
      }
      subByKey.set(pairKey, row)
      subcategories.push(row)
    }
    assignments[item.id] = subByKey.get(pairKey).id
  }

  categories.sort(byPositionThenName)
  return { categories, subcategories, assignments }
}
