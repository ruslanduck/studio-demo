// Backfill attribution + a believable activity history on an EXISTING database.
//
// Everything the app was already storing about "who did what" was invisible, so
// the seeded demo has no authors and empty activity feeds. This fills them in
// NON-DESTRUCTIVELY: every write is guarded by `is null` (or a de-dupe check), so
// re-running it changes nothing and never overwrites a real user's action.
//
// Uses the service_role key, which bypasses RLS — that is why it can set
// actor_id / created_by explicitly. The app itself can only write events as
// itself (see the auth_insert_events policy).
//
// Run: node --env-file=.env.local scripts/backfill-attribution.mjs
import { createClient } from '@supabase/supabase-js'

// Also imported by scripts/seed-supabase.mjs, which passes its own client, so a
// fresh reseed ends up as richly attributed as a backfilled database.
function clientFromEnv() {
  const url = process.env.VITE_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key)
    throw new Error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)')
  return createClient(url, key, { auth: { persistSession: false } })
}

// Deterministic pick so re-runs and reseeds tell the same story.
const hash = (s) => {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return Math.abs(h)
}
const pick = (arr, seed) => arr[hash(seed) % arr.length]
const iso = (d) => new Date(d).toISOString()
const minusDays = (base, n) => new Date(new Date(base).getTime() - n * 86400000)
const minusHours = (base, n) => new Date(new Date(base).getTime() - n * 3600000)

export async function backfillAttribution(client) {
  const db = client ?? clientFromEnv()
  // The equipment team, oldest first so the pick is stable.
  const { data: team, error: tErr } = await db
    .from('profiles')
    .select('id, full_name')
    .order('created_at')
  if (tErr) throw tErr
  // Only the three seeded demo members author historical data — real accounts
  // (yours) shouldn't be credited with things they didn't do.
  const DEMO_NAMES = ['Ann Taylor', 'Marcus Reed', 'Sofia Ventura']
  const actors = team.filter((p) => DEMO_NAMES.includes(p.full_name))
  if (!actors.length) throw new Error('No demo profiles found — run scripts/seed-users.mjs first')
  console.log('authors:', actors.map((a) => a.full_name).join(', '))

  // 1. Orders: who raised it. Null everywhere because the seeder used service_role.
  const { data: orders } = await db
    .from('orders')
    .select('id, order_number, job_name, kind, status, created_at, starts_on, created_by, eq_updated_by')
  let ordersFixed = 0
  for (const o of orders || []) {
    if (o.created_by) continue
    // Sub-rentals are raised by whoever chases vendors; client jobs by the others.
    const author = o.kind === 'sub_rental' ? actors[1 % actors.length] : pick(actors, o.order_number)
    const { error } = await db.from('orders').update({ created_by: author.id }).eq('id', o.id)
    if (!error) ordersFixed++
  }
  console.log(`orders.created_by filled: ${ordersFixed}`)

  // 2. Sets: same story on the calendar side.
  const { data: sets } = await db.from('sets').select('id, title, date, created_by')
  let setsFixed = 0
  for (const s of sets || []) {
    if (s.created_by) continue
    const { error } = await db
      .from('sets')
      .update({ created_by: pick(actors, s.title || s.id).id })
      .eq('id', s.id)
    if (!error) setsFixed++
  }
  console.log(`sets.created_by filled: ${setsFixed}`)

  // 3. Repairs / usage / add-ons: the columns existed and are now READ by the UI,
  //    so a null shows as "Not recorded". Fill what's missing.
  const { data: repairs } = await db
    .from('repairs')
    .select('id, unit_id, sent_at, returned_at, created_by, returned_by')
  let repairsFixed = 0
  for (const r of repairs || []) {
    const patch = {}
    if (!r.created_by) patch.created_by = pick(actors, `sent-${r.id}`).id
    if (r.returned_at && !r.returned_by) patch.returned_by = pick(actors, `back-${r.id}`).id
    if (!Object.keys(patch).length) continue
    const { error } = await db.from('repairs').update(patch).eq('id', r.id)
    if (!error) repairsFixed++
  }
  console.log(`repairs attribution filled: ${repairsFixed}`)

  for (const [table, seedKey] of [
    ['item_usage', 'id'],
  ]) {
    const { data: rows, error } = await db.from(table).select('id, created_by').is('created_by', null)
    if (error) {
      console.log(`${table}: skipped (${error.message})`)
      continue
    }
    let n = 0
    for (const row of rows || []) {
      const { error: uErr } = await db
        .from(table)
        .update({ created_by: pick(actors, `${table}-${row[seedKey]}`).id })
        .eq('id', row.id)
      if (!uErr) n++
    }
    console.log(`${table}.created_by filled: ${n}`)
  }

  // 4. The existing 86 trigger-written reservation events are mostly anonymous
  //    (service_role seeding). An audit trail full of blanks reads as broken.
  const { data: anonEvents } = await db
    .from('events')
    .select('id, unit_id, set_id')
    .is('actor_id', null)
  let evFixed = 0
  for (const e of anonEvents || []) {
    const { error } = await db
      .from('events')
      .update({ actor_id: pick(actors, `ev-${e.id}`).id })
      .eq('id', e.id)
    if (!error) evFixed++
  }
  console.log(`events.actor_id filled: ${evFixed}`)

  // 5. A believable narrative per order, so the Activity sections aren't empty.
  //    Skipped for any order that already has app-written events, so re-running
  //    never duplicates and never buries real activity.
  const { data: existing } = await db
    .from('events')
    .select('entity_id, event_type')
    .eq('entity_type', 'order')
  const alreadyTold = new Set((existing || []).map((e) => e.entity_id))

  const { data: lines } = await db
    .from('order_lines')
    .select('order_id, quantity, item:inventory_items ( name )')
  const linesByOrder = {}
  for (const l of lines || []) (linesByOrder[l.order_id] ||= []).push(l)

  const rows = []
  let told = 0
  for (const o of orders || []) {
    if (alreadyTold.has(o.id)) continue
    const mine = linesByOrder[o.id] || []
    if (!mine.length) continue // nothing to narrate; the card says so honestly
    const raiser = pick(actors, o.order_number)
    // Whoever pulls the gear is usually NOT whoever raised the order — that is
    // the whole point of showing "equipment last changed by".
    const puller = actors.find((a) => a.id !== raiser.id) ?? raiser
    const base = o.starts_on ? minusDays(o.starts_on, 2) : new Date(o.created_at)

    rows.push({
      occurred_at: iso(minusHours(base, 6)),
      actor_id: raiser.id,
      event_type: 'order.created',
      entity_type: 'order',
      entity_id: o.id,
      data: { jobName: o.job_name, poNumber: null },
    })
    rows.push({
      occurred_at: iso(minusHours(base, 3)),
      actor_id: puller.id,
      event_type: 'order.equipment_changed',
      entity_type: 'order',
      entity_id: o.id,
      data: {
        added: mine.slice(0, 3).map((l) => ({ itemName: l.item?.name ?? 'item', quantity: l.quantity })),
        removed: [],
        changed: [],
        lineCount: mine.length,
        pieces: mine.reduce((n, l) => n + l.quantity, 0),
      },
    })
    if (o.status === 'confirmed' || o.status === 'fulfilled') {
      rows.push({
        occurred_at: iso(minusHours(base, 1)),
        actor_id: raiser.id,
        event_type: 'order.confirmed',
        entity_type: 'order',
        entity_id: o.id,
        data: { reserved: mine.reduce((n, l) => n + l.quantity, 0), short: 0 },
      })
    }
    // The denormalised headline must agree with the story we just told.
    if (!o.eq_updated_by) {
      await db
        .from('orders')
        .update({ eq_updated_by: puller.id, eq_updated_at: iso(minusHours(base, 3)) })
        .eq('id', o.id)
    }
    told++
  }
  if (rows.length) {
    const { error } = await db.from('events').insert(rows)
    if (error) throw error
  }
  console.log(`orders narrated: ${told} (${rows.length} events inserted)`)

  const { count } = await db.from('events').select('*', { count: 'exact', head: true })
  console.log(`\nDone. events total: ${count}`)
}

// Run standalone only when invoked directly, so importing it is side-effect free.
const invokedDirectly = process.argv[1] && process.argv[1].endsWith('backfill-attribution.mjs')
if (invokedDirectly) {
  backfillAttribution().catch((e) => {
    console.error('BACKFILL FAILED:', e.message)
    process.exit(1)
  })
}
