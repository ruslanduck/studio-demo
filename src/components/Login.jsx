import { useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { useStore } from '../store'

// Demo accounts — shown as a hint so the deck can be driven without a
// credentials handout. (Placeholder accounts; rename in Supabase.)
const DEMO_ACCOUNTS = [
  { email: 'ann.taylor@anntaylor.demo', label: 'Ann Taylor · admin' },
  { email: 'marcus.reed@anntaylor.demo', label: 'Marcus Reed · crew' },
  { email: 'sofia.ventura@anntaylor.demo', label: 'Sofia Ventura · crew' },
]

export default function Login() {
  const signIn = useStore((s) => s.signIn)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await signIn(email.trim(), password)
    } catch (err) {
      setError(err.message || 'Sign-in failed')
      setBusy(false)
    }
    // On success the auth listener swaps this screen out.
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-violet-600 text-sm font-bold text-white">
            AT
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            AnnTaylor Rental System
          </h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Email
              </label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@anntaylor.demo"
                className={field}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={field}
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            Sign in
          </button>
        </form>

        {/* Demo hint */}
        <div className="mt-4 rounded-xl border border-slate-200 bg-white/60 p-3 text-xs text-slate-500">
          <p className="mb-1.5 font-medium text-slate-600">Demo accounts</p>
          <ul className="space-y-1">
            {DEMO_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <button
                  type="button"
                  onClick={() => setEmail(a.email)}
                  className="font-mono text-violet-600 hover:underline"
                >
                  {a.email}
                </button>{' '}
                — {a.label}
              </li>
            ))}
          </ul>
          <p className="mt-2">
            Password: <span className="font-mono text-slate-600">StudioDemo!2026</span>
          </p>
        </div>
      </div>
    </div>
  )
}
