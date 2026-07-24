import { supabase } from './supabase'

// Demo auth: obtain an authenticated (anonymous) session so RLS policies that
// require `authenticated` — roster/PII reads and all writes — are satisfied,
// without showing a login screen. Requires "Anonymous sign-ins" enabled in
// Supabase → Authentication → Sign In / Providers.
export async function ensureSession() {
  if (!supabase) return null
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (session) return session

  const { data, error } = await supabase.auth.signInAnonymously()
  if (error) {
    // Toggle is likely off — app stays anonymous (catalog reads only).
    console.warn(
      'Anonymous sign-in failed — enable it in Supabase Auth settings to see rosters and make edits:',
      error.message,
    )
    return null
  }
  return data.session
}
