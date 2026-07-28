import { useState } from 'react'
import { Loader2, LogIn } from 'lucide-react'
import { useStore } from '../store'
import Logo, { BRAND_NAME } from './Logo'

// Sign-in only: accounts are issued by the studio, not self-registered. The
// self-serve signup path was removed on request — the store still exposes
// `signUp` for whoever provisions accounts, but nothing in the UI calls it.
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
      // The auth listener swaps this screen out on success.
    } catch (err) {
      setError(err.message || 'Something went wrong')
      setBusy(false)
    }
  }

  const field =
    'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-violet-400 focus:ring-2 focus:ring-violet-100'

  return (
    <div className="flex h-screen w-screen items-center justify-center bg-slate-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <Logo size={44} radius="rounded-xl" className="mb-3" />
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">{BRAND_NAME}</h1>
          <p className="mt-1 text-sm text-slate-500">Sign in to continue</p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
        >
          <div className="space-y-3">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Email</label>
              <input
                type="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                autoComplete="username"
                className={field}
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-slate-700">Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                className={field}
              />
            </div>
          </div>

          {error && (
            <p className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-600">{error}</p>
          )}

          <button
            type="submit"
            disabled={busy || !email || !password}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />}
            Sign in
          </button>

          <p className="mt-4 text-center text-xs text-slate-400">
            Access is provided by the studio. Ask the equipment team for an account.
          </p>
        </form>
      </div>
    </div>
  )
}
