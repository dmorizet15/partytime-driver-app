'use client'

import { createContext, useContext, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { getUserRole } from '../lib/auth'
import type { Role, UserProfile } from '../types/auth'

interface AuthContextValue {
  user:    User | null
  profile: UserProfile | null
  roles:   Role[] | null
  loading: boolean
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user,    setUser]    = useState<User | null>(null)
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false

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
            const p = await getUserRole(session.user.id, session.access_token)
            if (!cancelled) setProfile(p)
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

    return () => {
      cancelled = true
      subscription.unsubscribe()
    }
  }, [])

  return (
    <AuthContext.Provider value={{ user, profile, roles: profile?.roles ?? null, loading }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuthContext() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuthContext must be used within AuthProvider')
  return ctx
}
