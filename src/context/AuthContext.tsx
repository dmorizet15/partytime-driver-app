'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
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
    let resolved  = false
    let safetyTimer:   ReturnType<typeof setTimeout> | undefined
    let fallbackTimer: ReturnType<typeof setTimeout> | undefined

    // Resolve loading exactly once and tear down the timers. Every code path —
    // success, failure, hang-timeout — funnels through here so `loading` can
    // never get stuck true.
    const finishLoading = () => {
      if (cancelled || resolved) return
      resolved = true
      if (safetyTimer)   clearTimeout(safetyTimer)
      if (fallbackTimer) clearTimeout(fallbackTimer)
      setLoading(false)
    }

    // ── HARD SAFETY TIMEOUT (P0) ─────────────────────────────────────────────
    // `loading` MUST resolve within 3s no matter what hangs. On iOS standalone
    // in airplane mode, supabase's init token-refresh can hang indefinitely
    // (no network timeout) AND navigator.onLine can briefly read `true`, so the
    // offline net never ran and onAuthStateChange never fired INITIAL_SESSION —
    // the app sat on a black "Loading…" screen forever. This unconditional
    // backstop ends that: worst case we resolve with user=null → /login → the
    // offline notice, which is recoverable; an infinite spinner is not.
    safetyTimer = setTimeout(() => {
      if (cancelled) return
      resolved = true
      if (fallbackTimer) clearTimeout(fallbackTimer)
      setLoading(false)
    }, 3000)

    // Resolve the profile, preferring the network ONLINE and the cached copy
    // OFFLINE. Online success behavior is unchanged: getUserRole runs as before
    // and we additionally persist the result for offline cold-starts. On an
    // offline read OR a network FAILURE (getUserRole threw / returned null), we
    // fall back to the last cached profile so the driver keeps their roles
    // instead of hitting "Access denied".
    async function resolveProfile(userId: string, accessToken: string): Promise<UserProfile | null> {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        return readCachedProfile(userId)
      }
      let p: UserProfile | null = null
      try {
        p = await getUserRole(userId, accessToken)
      } catch (err) {
        console.error('[AuthContext] getUserRole threw', err)
        p = null
      }
      if (p) {
        writeCachedProfile(userId, p)
        return p
      }
      return readCachedProfile(userId)
    }

    // Read the LOCAL session without letting it hang. getSession() reads
    // localStorage for a valid token (no network), but for an EXPIRED token it
    // attempts a network refresh that can hang offline — so we race it against
    // a short timeout and treat a timeout as "no usable session".
    async function readLocalSession(): Promise<Session | null> {
      try {
        const s = await Promise.race<Session | null>([
          supabase.auth.getSession().then(({ data }) => data.session),
          new Promise<null>((res) => setTimeout(() => res(null), 1200)),
        ])
        return s ?? null
      } catch (err) {
        console.error('[AuthContext] readLocalSession failed', err)
        return null
      }
    }

    // Offline / unreliable-connectivity restore. Restores from a LOCAL,
    // non-expired session (an expired one can't be refreshed offline → falls
    // through to the LoginScreen offline notice). No-op once auth already
    // resolved, and never touches the network, so the online path is untouched.
    async function localRestore() {
      if (resolved || cancelled) return
      try {
        const session = await readLocalSession()
        const valid =
          !!session?.user &&
          typeof session.expires_at === 'number' &&
          session.expires_at * 1000 > Date.now()
        if (!cancelled && valid && session) {
          setUser(session.user)
          setProfile(readCachedProfile(session.user.id))
        }
      } catch (err) {
        console.error('[AuthContext] localRestore failed', err)
      } finally {
        finishLoading()
      }
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
          finishLoading()
        }
      }
    )

    // ── Offline cold-start restore (P0) ──────────────────────────────────────
    // If we read as offline at mount, restore from local immediately. But
    // navigator.onLine is unreliable on iOS standalone (can read `true` in
    // airplane mode for a beat after launch), and a hanging token-refresh can
    // delay or swallow INITIAL_SESSION — so ALSO run the same local restore as
    // a short-delay fallback if auth hasn't resolved yet. localRestore is a
    // no-op once resolved and never hits the network, so when the online path
    // wins first (the normal case) this never runs.
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      void localRestore()
    } else {
      fallbackTimer = setTimeout(() => {
        if (!resolved && !cancelled) void localRestore()
      }, 1200)
    }

    return () => {
      cancelled = true
      if (safetyTimer)   clearTimeout(safetyTimer)
      if (fallbackTimer) clearTimeout(fallbackTimer)
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
