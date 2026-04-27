'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { signIn } from '../lib/auth'

export default function LoginScreen() {
  const router = useRouter()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState<string | null>(null)
  const [loading,  setLoading]  = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)

    const { error: authError } = await signIn(email, password)

    if (authError) {
      setError('Invalid email or password.')
      setLoading(false)
    } else {
      router.push('/')
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4"
         style={{ backgroundColor: '#0F1117' }}>
      <div className="w-full max-w-sm">

        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight"
              style={{ color: '#F9FAFB' }}>
            PartyTime Rentals
          </h1>
          <p className="mt-1 text-sm" style={{ color: '#9CA3AF' }}>
            Driver App
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: '#9CA3AF' }}>
              Email
            </label>
            <input
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={e => setEmail(e.target.value)}
              className="w-full rounded-md px-3 text-sm outline-none"
              style={{
                height: '48px',
                backgroundColor: '#1A1D27',
                border: '1px solid #2D3148',
                color: '#F9FAFB',
              }}
            />
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium" style={{ color: '#9CA3AF' }}>
              Password
            </label>
            <input
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full rounded-md px-3 text-sm outline-none"
              style={{
                height: '48px',
                backgroundColor: '#1A1D27',
                border: '1px solid #2D3148',
                color: '#F9FAFB',
              }}
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: '#EF4444' }}>
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-md text-sm font-semibold transition-colors disabled:opacity-50"
            style={{
              height: '48px',
              backgroundColor: loading ? '#0000CC' : '#0000FF',
              color: '#FFFFFF',
            }}
          >
            {loading ? 'Signing in…' : 'Sign In'}
          </button>
        </form>

      </div>
    </div>
  )
}
