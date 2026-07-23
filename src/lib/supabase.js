import { createClient } from '@supabase/supabase-js'

// The anon key is a *publishable* key — safe to ship in the client bundle.
// The real security boundary is Row Level Security on the database, not key
// secrecy. Never put the service_role key here.
const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

// Null when env isn't configured, so the app can fall back to localStorage
// instead of crashing.
export const supabase = url && anonKey ? createClient(url, anonKey) : null

export const isSupabaseConfigured = Boolean(supabase)
