import { useState } from 'react'
import { Loader2, LogIn, UserPlus, MailCheck } from 'lucide-react'
import { useStore } from '../store'

export default function Login() {
  const signIn = useStore((s) => s.signIn)
  const signUp = useStore((s) => s.signUp)

  const [mode, setMode] = useState('signin') // 'signin' | 'signup'
  const [fullName, setFullName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [checkEmail, setCheckEmail] = useState(false)

  const isSignup = mode === 'signup'

  function switchMode(next) {
    setMode(next)
    setError('')
    setCheckEmail(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      if (isSignup) {
        const session = await signUp({ email: email.trim(), password, fullName: fullName.trim() })
        if (!session) {
          // Project requires email confirmation — no session yet.
          setCheckEmail(true)
          setBusy(false)
          return
        }
        // else: auth listener swaps this screen out.
      } else {
        await signIn(email.trim(), password)
        // auth listener swaps this screen out on success.
      }
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
          <div className="mb-3 grid h-11 w-11 place-items-center rounded-xl bg-violet-600 text-sm font-bold text-white">
            AT
          </div>
          <h1 className="text-lg font-semibold tracking-tight text-slate-900">
            AnnTaylor Rental System
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {isSignup ? 'Create your account' : 'Sign in to continue'}
          </p>
        </div>

        {checkEmail ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm">
            <MailCheck size={28} className="mx-auto mb-3 text-violet-500" />
            <p className="text-sm font-medium text-slate-800">Check your email</p>
            <p className="mt-1 text-sm text-slate-500">
              We sent a confirmation link to <span className="font-medium">{email}</span>.
              Confirm it, then sign in.
            </p>
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="mt-4 text-sm font-medium text-violet-600 hover:underline"
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          >
            <div className="space-y-3">
              {isSignup && (
                <div>
                  <label className="mb-1.5 block text-sm font-medium text-slate-700">
                    Full name
                  </label>
                  <input
                    type="text"
                    autoFocus
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Jane Doe"
                    className={field}
                  />
                </div>
              )}
              <div>
                <label className="mb-1.5 block text-sm font-medium text-slate-700">
                  Email
                </label>
                <input
                  type="email"
                  autoFocus={!isSignup}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
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
                  autoComplete={isSignup ? 'new-password' : 'current-password'}
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
              disabled={busy || !email || !password || (isSignup && !fullName.trim())}
              className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {busy ? (
                <Loader2 size={16} className="animate-spin" />
              ) : isSignup ? (
                <UserPlus size={16} />
              ) : (
                <LogIn size={16} />
              )}
              {isSignup ? 'Create account' : 'Sign in'}
            </button>

            <p className="mt-4 text-center text-sm text-slate-500">
              {isSignup ? 'Already have an account?' : "Don't have an account?"}{' '}
              <button
                type="button"
                onClick={() => switchMode(isSignup ? 'signin' : 'signup')}
                className="font-medium text-violet-600 hover:underline"
              >
                {isSignup ? 'Sign in' : 'Register'}
              </button>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
