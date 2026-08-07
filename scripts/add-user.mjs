// Provision ONE studio account (Supabase Auth + its profile row).
//
// Separate from seed-users.mjs, which hardcodes the three demo accounts and
// their shared password: this is for adding a real person later.
//
// The password is NEVER hardcoded, defaulted or printed — it comes from the
// NEW_USER_PASSWORD environment variable, so it stays with whoever runs this
// and never lands in the repo, the shell history of a committed file, or a log.
//
// Run (PowerShell):
//   $env:NEW_USER_PASSWORD = '…'
//   node --env-file=.env.local scripts/add-user.mjs --email someone@example.com --name "Their Name"
//   Remove-Item Env:\NEW_USER_PASSWORD
//
// Idempotent, and deliberately NON-destructive: if the account already exists
// it does NOT reset the password (silently changing someone's credentials is
// worse than doing nothing) — it only makes sure the profile is right.
import { createClient } from '@supabase/supabase-js'

const url = process.env.VITE_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY (use --env-file=.env.local)')
  process.exit(1)
}

// --email a@b.c --name "Full Name" [--role equipment_team]
function arg(flag) {
  const i = process.argv.indexOf(flag)
  return i > -1 ? process.argv[i + 1] : null
}
const email = (arg('--email') || '').trim().toLowerCase()
// One flat role today — see src/lib/permissions.js. The column's check
// constraint was dropped in 20260724140000_flat_role.sql, so a new role name
// needs no migration.
const role = (arg('--role') || 'equipment_team').trim()
// Falls back to the email's local part, exactly like the fn_handle_new_user
// trigger does, so the two paths agree.
const fullName = (arg('--name') || '').trim() || email.split('@')[0]

if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
  console.error('Usage: node --env-file=.env.local scripts/add-user.mjs --email a@b.c --name "Full Name"')
  process.exit(1)
}

const password = process.env.NEW_USER_PASSWORD
if (!password) {
  console.error(
    'Set NEW_USER_PASSWORD first — this script will not invent a password.\n' +
      "  PowerShell:  $env:NEW_USER_PASSWORD = '…'\n" +
      "  bash:        export NEW_USER_PASSWORD='…'",
  )
  process.exit(1)
}
// Supabase's own floor is 6; 10 is a nudge, not a policy.
if (password.length < 10) {
  console.error(`NEW_USER_PASSWORD is ${password.length} characters — use at least 10.`)
  process.exit(1)
}

const db = createClient(url, key, { auth: { persistSession: false } })

async function findUserByEmail(target) {
  // The admin API has no get-by-email, so page through. 200/page covers a
  // studio roster many times over; the loop is here so it stays correct anyway.
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await db.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw error
    const hit = data.users.find((u) => u.email?.toLowerCase() === target)
    if (hit) return hit
    if (data.users.length < 200) return null
  }
  return null
}

async function main() {
  let user = await findUserByEmail(email)
  let created = false

  if (user) {
    console.log(`exists   ${email} — password left untouched`)
  } else {
    const { data, error } = await db.auth.admin.createUser({
      email,
      password,
      // No mail is sent by this app, so an unconfirmed account could never
      // sign in. The studio issues accounts directly (self-registration was
      // removed from the login screen on request).
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    })
    if (error) throw new Error(`create ${email}: ${error.message}`)
    user = data.user
    created = true
    console.log(`created  ${email}`)
  }

  // The trigger already inserted a profile row; this makes the name and role
  // match what was asked for (and repairs a row from an earlier attempt).
  const { error: pErr } = await db
    .from('profiles')
    .upsert({ id: user.id, full_name: fullName, role, email })
  if (pErr) throw new Error(`profile ${email}: ${pErr.message}`)

  console.log(`profile  ${fullName} · ${role}`)
  console.log(
    created
      ? '\nDone. They can sign in at duck-agency.com/studio-demo/ with the password you set.'
      : '\nDone. Profile updated; to change their password use the Supabase dashboard.',
  )
}

main().catch((e) => {
  console.error('ADD USER FAILED:', e.message)
  process.exit(1)
})
