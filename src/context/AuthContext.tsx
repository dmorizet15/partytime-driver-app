'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getUserRole } from '../lib/auth'
import { readCachedProfile, writeCachedProfile } from '../lib/authCache'
import { flushPendingStopNotes } from '../lib/ava/stopNotesClient'
import type { Role, UserProfile } from '../types/auth'

interface AuthContextValue {
  user:    User | null
  profile: UserProfile | null
  roles:   Role[] | null
  loading: boolean
  // Merge a partial into the in-memory profile without a re-fetch. Used for
  // optimistic preference updates (and reverts) on the Profile screen so
  // getMorningMessage / the AVA card reflect the change immediately.
  updateProfile: (patch: Partial<UserProfile>) => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

    // Resolve the profile, preferring the network ONLINE and the cached copy
    // OFFLINE. Online behavior is unchanged: getUserRole runs exactly as before
    // and still returns p / null — we just additionally persist a successful
    // result for the next offline cold-start. Offline we never touch the
    // network (it would fail and blank the driver's roles → "Access denied").
    async function resolveProfile(userId: string, accessToken: string): Promise<UserProfile | null> {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return readCachedProfile(userId)
      }
      const p = await getUserRole(userId, accessToken)
      if (p) writeCachedProfile(userId, p)
      return p
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (cancelled) return
        // TOKEN_REFRESHED keeps the same user — skip profile re-fetch
        if (event === 'TOKEN_REFRESHED') return

        // Auto-logout Layer 2: on the first auth event after app load
        // (INITIAL_SESSION), check that ptr_session_date is today. If the
        // device has crossed midnight since this session was opened, sign
        // out and bounce to /login before any authed UI renders. SIGNED_IN
        // events are skipped because LoginScreen has just stamped the date.
        if (event === 'INITIAL_SESSION' && session?.user && typeof window !== 'undefined') {
          const stored = localStorage.getItem('ptr_session_date')
          const today  = new Date().toISOString().split('T')[0]
          if (stored !== today) {
            localStorage.removeItem('ptr_session_date')
            try { await supabase.auth.signOut() } catch (err) {
              console.error('[autoLogout] day-change signOut failed', err)
            }
            window.location.replace('/login')
            return
          }
        }

        setUser(session?.user ?? null)
        try {
          if (session?.user) {
            const p = await resolveProfile(session.user.id, session.access_token)
            if (!cancelled) setProfile(p)
            // AVA Remembers — drain any notes queued while offline. Fire-and-
            // forget; failures stay in the queue for the next pass.
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
              void flushPendingStopNotes()
            }
          } else {
            setProfile(null)
          }
        } catch (err) {
          console.error('[AuthContext] getUserRole error', err)
          if (!cancelled) setProfile(null)
        } finally {
          if (!cancelled) setLoading(false)
        }
      }
    )

    // ── Offline cold-start safety net (P0) ───────────────────────────────────
    // When the app is force-closed and relaunched OFFLINE, the supabase client
    // tries to refresh an expired access token on init — that network call
    // fails, and onAuthStateChange may emit a null session (or never fire
    // INITIAL_SESSION at all), leaving the app hung on "Loading…" or bounced to
    // /login. So, only when offline at mount, independently restore from a
    // LOCAL session: getSession() reads localStorage (no network for a valid
    // token). We trust ONLY a non-expired session — an expired one can't be
    // refreshed offline, so it correctly falls through to the LoginScreen's
    // offline notice. Roles come from the profile cache (no network). This runs
    // ONLY offline; the online path above is untouched.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      void (async () => {
        try {
          const { data: { session } } = await supabase.auth.getSession()
          const valid =
            !!session?.user &&
            typeof session.expires_at === 'number' &&
            session.expires_at * 1000 > Date.now()
          if (cancelled) return
          if (valid && session) {
            setUser(session.user)
            setProfile(readCachedProfile(session.user.id))
          }
          setLoading(false)
        } catch (err) {
          console.error('[AuthContext] offline restore failed', err)
          if (!cancelled) setLoading(false)
        }
      })()
    }

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  const updateProfile = useCallback((patch: Partial<UserProfile>) => {
    setProfile((prev) => (prev ? { ...prev, ...patch } : prev))
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, roles: profile?.roles ?? null, loading, updateProfile }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
