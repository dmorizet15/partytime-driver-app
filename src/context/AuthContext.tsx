'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getUserRole } from '../lib/auth'
import { readCachedProfile, writeCachedProfile, readCachedUser, writeCachedUser, clearCachedUser } from '../lib/authCache'
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
    let offlineRestored = false   // true once identity came from the offline cache
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

    // ── OFFLINE IDENTITY RESTORE (synchronous, no network) ───────────────────
    // Restore `user` + `profile` from the offline cache. This is what FAILURE B
    // needed: on a force-close→offline cold-start the access token has usually
    // expired, and an expired token CANNOT be refreshed offline — so getSession
    // can't help and the session-based localRestore fails. The cached identity
    // sidesteps that entirely. Honors the day-change auto-logout invariant:
    // if ptr_session_date isn't today, it restores NOTHING (the driver lands on
    // the offline /login notice, exactly as the shared-device rule intends).
    // Returns true only when it actually set a user. Caller calls finishLoading.
    const cachedOfflineRestore = (): boolean => {
      if (resolved || cancelled) return false
      try {
        const cu = readCachedUser()
        if (!cu) return false
        const storedDate = localStorage.getItem('ptr_session_date')
        const today      = new Date().toISOString().split('T')[0]
        if (storedDate !== today) return false      // day-change gate — skip stale day
        const cp = readCachedProfile(cu.id)
        if (!cp) return false                        // no roles offline → defer to /login
        offlineRestored = true
        setUser(cu)
        setProfile(cp)
        return true
      } catch (err) {
        console.error('[AuthContext] cachedOfflineRestore failed', err)
        return false
      }
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
            // Drop the offline identity cache (direct supabase.auth.signOut()
            // bypasses the lib/auth wrapper's central clear).
            clearCachedUser()
            try { await supabase.auth.signOut() } catch (err) {
              console.error('[autoLogout] day-change signOut failed', err)
            }
            window.location.replace('/login')
            return
          }
        }

        // A real session always wins (normal online boot, or a reconnect
        // refresh) and is mirrored to the offline cache. A NULL session
        // normally clears user/profile — but must NOT clobber an offline
        // cache-restore with a TRANSIENT offline null (e.g. an expired-token
        // INITIAL_SESSION that resolved null while still offline). Only honor a
        // null session when we're back online (a genuine sign-out) or when we
        // never restored from cache. On a normal online boot offlineRestored is
        // false, so this is byte-for-byte the original behavior.
        const offlineNow = typeof navigator !== 'undefined' && navigator.onLine === false
        const keepOfflineIdentity = offlineRestored && offlineNow

        if (session?.user) {
          setUser(session.user)
          writeCachedUser(session.user)   // mirror identity for offline cold-starts
        } else if (!keepOfflineIdentity) {
          setUser(null)
        }
        try {
          if (session?.user) {
            const p = await resolveProfile(session.user.id, session.access_token)
            if (!cancelled) setProfile(p)
            // AVA Remembers — drain any notes queued while offline. Fire-and-
            // forget; failures stay in the queue for the next pass.
            if (event === 'INITIAL_SESSION' || event === 'SIGNED_IN') {
              void flushPendingStopNotes()
            }
          } else if (!keepOfflineIdentity) {
            setProfile(null)
          }
        } catch (err) {
          console.error('[AuthContext] getUserRole error', err)
          if (!cancelled && !keepOfflineIdentity) setProfile(null)
        } finally {
          finishLoading()
        }
      }
    )

    // ── Offline cold-start restore (P0) ──────────────────────────────────────
    // Runs AHEAD of the 3s safety timer so `loading` can never flip false with
    // `user` null on a valid offline cold-start (that bounced FAILURE B to the
    // offline /login screen).
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      // Booted OFFLINE: restore identity from cache SYNCHRONOUSLY, right here in
      // the effect body — i.e. milliseconds after mount and ~3s before the
      // safety timer could fire. The cached path works even with an EXPIRED
      // access token (which can't be refreshed offline). If there's no cache
      // yet (e.g. first boot after this deploy), fall back to the session-based
      // local restore (valid non-expired session only).
      if (cachedOfflineRestore()) finishLoading()
      else void localRestore()
    } else {
      // onLine read true at mount. On a real online boot INITIAL_SESSION
      // resolves well before 1.2s, so this fallback no-ops (online path is
      // untouched). It only fires when online resolution stalled — i.e.
      // navigator.onLine LIED (iOS standalone airplane-mode) — restoring the
      // cached identity ahead of the 3s safety timer; the session-based restore
      // is the last resort.
      fallbackTimer = setTimeout(() => {
        if (resolved || cancelled) return
        if (cachedOfflineRestore()) { finishLoading(); return }
        void localRestore()
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
