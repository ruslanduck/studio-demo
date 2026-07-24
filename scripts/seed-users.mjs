// Provision the 3 equipment-team accounts (Supabase Auth + profiles).
// Idempotent: creates missing users, updates profiles. Placeholder emails /
// shared demo password — rename later in the dashboard.
//
// Run:  node --env-file=.env.local scripts/seed-users.mjs
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}
const PASSWORD = process.env.DEMO_USER_PASSWORD || 'StudioDemo!2026'

const db = createClient(url, key, { auth: { persistSession: false } })

// One flat role for now — see src/lib/permissions.js.
const USERS = [
  { email: 'ann.taylor@anntaylor.demo', full_name: 'Ann Taylor', role: 'equipment_team' },
  { email: 'marcus.reed@anntaylor.demo', full_name: 'Marcus Reed', role: 'equipment_team' },
  { email: 'sofia.ventura@anntaylor.demo', full_name: 'Sofia Ventura', role: 'equipment_team' },
]

async function findUserByEmail(email) {
  const { data, error } = await db.auth.admin.listUsers({ page: 1, perPage: 200 })
  if (error) throw error
  return data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())
}

async function main() {
  for (const u of USERS) {
    let user = await findUserByEmail(u.email)
    if (!user) {
      const { data, error } = await db.auth.admin.createUser({
        email: u.email,
        password: PASSWORD,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role },
      })
      if (error) throw new Error(`create ${u.email}: ${error.message}`)
      user = data.user
      console.log(`created ${u.email}`)
    } else {
      console.log(`exists  ${u.email}`)
    }
    // Ensure the profile matches (trigger already created a row on signup).
    const { error: pErr } = await db.from('profiles').upsert({
      id: user.id, full_name: u.full_name, role: u.role, email: u.email,
    })
    if (pErr) throw new Error(`profile ${u.email}: ${pErr.message}`)
  }

  console.log('\nDone. Demo login password:', PASSWORD)
  console.log('Accounts:')
  for (const u of USERS) console.log(`  ${u.role.padEnd(5)}  ${u.full_name}  <${u.email}>`)
}

main().catch((e) => { console.error('SEED USERS FAILED:', e.message); process.exit(1) })
